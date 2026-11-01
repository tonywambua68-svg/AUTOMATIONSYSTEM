/**
 * WhatsAppAdapter - Integration layer between WhatsApp and ConversationEngine
 * 
 * This adapter defines the exact interface that the production message-processing
 * path uses to connect WhatsApp messages to the conversation engine.
 * 
 * Production flow:
 *   Meta Webhook → whatsappService.js → messageProcessor.processInboundMessage()
 *   → ConversationEngine.processMessage() → ResponseGenerator
 *   → whatsappService.sendMessage() → Meta API → Customer
 * 
 * This file provides:
 * 1. The inbound message format that whatsappService.js must pass
 * 2. The outbound message format that gets sent back via WhatsApp
 * 3. Duplicate detection
 * 4. Rate limiting awareness
 * 5. Error handling for WhatsApp-specific issues
 */

import { ConversationEngine } from '../engine/ConversationEngine';
import { DatabaseService } from './databaseService';
import { GeneratedResponse, Business, Product } from '../types';

/**
 * Inbound message format from WhatsApp webhook
 * This matches what Meta's webhook sends after parsing by whatsappService.js
 */
export interface WhatsAppInboundMessage {
  messageId: string;           // Meta message ID (for duplicate detection)
  workspaceId: string;         // Business workspace ID
  customerPhone: string;       // Customer's phone number (E.164 format)
  customerName?: string;       // Customer's display name
  content: string;             // Message text
  timestamp: number;           // Unix timestamp
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'interactive';
  mediaUrl?: string;           // URL for media messages
  caption?: string;            // Caption for media messages
  replyToMessageId?: string;   // If this is a reply to another message
}

/**
 * Outbound message format for WhatsApp delivery
 */
export interface WhatsAppOutboundMessage {
  workspaceId: string;
  customerPhone: string;
  content: string;
  messageType: 'text';
  replyToMessageId?: string;
  metadata?: {
    intent?: string;
    confidence?: number;
    products?: Array<{ id: string; name: string; price: number }>;
    conversationId?: string;
  };
}

/**
 * Processing result returned to whatsappService.js
 */
export interface ProcessingResult {
  success: boolean;
  response?: WhatsAppOutboundMessage;
  error?: string;
  intent?: string;
  conversationId?: string;
  requiresHandoff?: boolean;
}

/**
 * WhatsAppAdapter - Main integration class
 */
export class WhatsAppAdapter {
  private engine: ConversationEngine;
  private db: DatabaseService;
  private processedMessageIds: Set<string> = new Set(); // Duplicate detection
  private maxProcessedIdsSize = 10000;

  constructor(engine: ConversationEngine, db: DatabaseService) {
    this.engine = engine;
    this.db = db;
  }

  /**
   * Process an inbound WhatsApp message
   * 
   * This is the PRODUCTION ENTRY POINT.
   * Called by: whatsappService.js → messageProcessor
   * 
   * Flow:
   * 1. Validate message format
   * 2. Check for duplicates
   * 3. Load workspace from database
   * 4. Load workspace products from database
   * 5. Process through ConversationEngine
   * 6. Format response for WhatsApp delivery
   * 7. Return result to whatsappService for sending
   */
  async processInboundMessage(inbound: WhatsAppInboundMessage): Promise<ProcessingResult> {
    try {
      // Step 1: Validate message format
      const validationError = this.validateInboundMessage(inbound);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Step 2: Duplicate detection
      if (this.processedMessageIds.has(inbound.messageId)) {
        console.warn(`[WhatsAppAdapter] Duplicate message detected: ${inbound.messageId}`);
        return { success: false, error: 'Duplicate message - already processed' };
      }
      this.trackProcessedMessage(inbound.messageId);

      // Step 3: Load workspace from database
      const workspace = await this.db.getWorkspace(inbound.workspaceId);
      if (!workspace) {
        console.error(`[WhatsAppAdapter] Workspace not found: ${inbound.workspaceId}`);
        return { success: false, error: 'Workspace not found' };
      }

      // Step 4: Ensure engine has workspace registered with real database products
      await this.ensureWorkspaceLoaded(workspace);

      // Step 5: Determine message content
      let messageContent = inbound.content;
      if (inbound.messageType !== 'text' && inbound.caption) {
        messageContent = inbound.caption;
      } else if (inbound.messageType !== 'text') {
        messageContent = `[${inbound.messageType} message]`;
      }

      // Step 6: Process through ConversationEngine
      const engineResponse: GeneratedResponse = this.engine.processMessage(
        inbound.workspaceId,
        inbound.customerPhone,
        messageContent
      );

      // Step 7: Check for handoff requirement
      const requiresHandoff = engineResponse.nextExpectedAction === 'handoff' ||
                              engineResponse.intent === 'handoff_request';

      // Step 8: Format response for WhatsApp
      const outbound: WhatsAppOutboundMessage = {
        workspaceId: inbound.workspaceId,
        customerPhone: inbound.customerPhone,
        content: engineResponse.content,
        messageType: 'text',
        replyToMessageId: inbound.messageId,
        metadata: {
          intent: engineResponse.intent,
          confidence: engineResponse.confidence,
          products: engineResponse.products?.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price
          })),
          conversationId: this.engine.getConversation(inbound.workspaceId, inbound.customerPhone)?.id
        }
      };

      // Step 9: Persist the conversation message
      const conversation = this.engine.getConversation(inbound.workspaceId, inbound.customerPhone);
      if (conversation) {
        await this.db.updateConversationContext(conversation.id, conversation.context);
      }

      // Step 10: Trigger async learning analysis
      this.triggerLearningAnalysis(inbound.workspaceId, inbound.customerPhone);

      return {
        success: true,
        response: outbound,
        intent: engineResponse.intent,
        conversationId: conversation?.id,
        requiresHandoff
      };

    } catch (error) {
      console.error('[WhatsAppAdapter] Error processing message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate inbound message format
   */
  private validateInboundMessage(inbound: WhatsAppInboundMessage): string | null {
    if (!inbound.messageId) return 'Missing messageId';
    if (!inbound.workspaceId) return 'Missing workspaceId';
    if (!inbound.customerPhone) return 'Missing customerPhone';
    if (!inbound.content && inbound.messageType === 'text') return 'Missing content for text message';
    if (!inbound.timestamp) return 'Missing timestamp';
    return null;
  }

  /**
   * Track processed message IDs for duplicate detection
   */
  private trackProcessedMessage(messageId: string): void {
    this.processedMessageIds.add(messageId);
    // Prevent unbounded growth
    if (this.processedMessageIds.size > this.maxProcessedIdsSize) {
      const first = this.processedMessageIds.values().next().value;
      if (first) this.processedMessageIds.delete(first);
    }
  }

  /**
   * Ensure workspace is loaded in the engine with real database products
   * CRITICAL: This loads ACTUAL products from the database, not demo data
   */
  private async ensureWorkspaceLoaded(workspace: Business): Promise<void> {
    // Load real products from database
    const products = await this.db.getProducts(workspace.id);
    
    // Register workspace with engine (uses real database data)
    this.engine.registerBusiness(workspace, products);
  }

  /**
   * Trigger async learning analysis (non-blocking)
   */
  private triggerLearningAnalysis(workspaceId: string, customerPhone: string): void {
    // Fire and forget - learning analysis runs asynchronously
    setTimeout(() => {
      try {
        this.engine.analyzeConversation(workspaceId, customerPhone);
      } catch (error) {
        console.error('[WhatsAppAdapter] Learning analysis error:', error);
      }
    }, 100);
  }

  /**
   * Initialize the adapter with workspace data from database
   * Called during application startup
   */
  async initialize(workspaceIds: string[]): Promise<{ loaded: number; failed: number }> {
    let loaded = 0;
    let failed = 0;

    for (const workspaceId of workspaceIds) {
      try {
        const workspace = await this.db.getWorkspace(workspaceId);
        if (workspace) {
          await this.ensureWorkspaceLoaded(workspace);
          loaded++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`[WhatsAppAdapter] Failed to load workspace ${workspaceId}:`, error);
        failed++;
      }
    }

    console.info(`[WhatsAppAdapter] Initialized: ${loaded} loaded, ${failed} failed`);
    return { loaded, failed };
  }

  /**
   * Get adapter status for monitoring
   */
  getStatus(): {
    storageMode: string;
    isPersistent: boolean;
    processedMessages: number;
  } {
    return {
      storageMode: this.db.getStorageMode(),
      isPersistent: this.db.isPersistent(),
      processedMessages: this.processedMessageIds.size
    };
  }
}

/**
 * Factory function to create the adapter with all dependencies
 * This is what the production startup code calls
 */
export async function createWhatsAppAdapter(): Promise<WhatsAppAdapter> {
  const db = new DatabaseService();
  const engine = new ConversationEngine({
    maxContextMessages: 20,
    minConfidenceForAction: 0.6,
    learningEnabled: true,
    autoApproveCommunication: false, // Require approval for safety
    requireApprovalForBusinessFacts: true
  });

  return new WhatsAppAdapter(engine, db);
}

/**
 * Example: How whatsappService.js would call this adapter
 * 
 * ```javascript
 * // In whatsappService.js (production backend)
 * const adapter = await createWhatsAppAdapter();
 * 
 * // When Meta webhook receives a message:
 * app.post('/webhook/whatsapp', async (req, res) => {
 *   const messages = parseWebhookPayload(req.body);
 *   
 *   for (const msg of messages) {
 *     const result = await adapter.processInboundMessage({
 *       messageId: msg.id,
 *       workspaceId: msg.business_id,
 *       customerPhone: msg.from,
 *       customerName: msg.profile?.name,
 *       content: msg.text?.body || '',
 *       timestamp: parseInt(msg.timestamp),
 *       messageType: msg.type
 *     });
 *     
 *     if (result.success && result.response) {
 *       await sendWhatsAppMessage(result.response);
 *     }
 *     
 *     if (result.requiresHandoff) {
 *       await notifyHumanAgent(result);
 *     }
 *   }
 *   
 *   res.sendStatus(200);
 * });
 * ```
 */
