/**
 * MessageProcessor - Production entry point for message processing
 * 
 * This is the ACTUAL function that the production backend calls.
 * It represents the complete message-processing path:
 * 
 *   Meta Webhook → whatsappService.js → messageProcessor.processMessage()
 *   → ConversationEngine → ResponseGenerator → WhatsApp outbound
 * 
 * This file documents and implements the exact integration contract.
 */

import { WhatsAppAdapter, WhatsAppInboundMessage, ProcessingResult, createWhatsAppAdapter } from './whatsappAdapter';
import { DatabaseService } from './databaseService';
import { ConversationEngine } from '../engine/ConversationEngine';

/**
 * Singleton adapter instance
 * In production, this would be initialized at server startup
 */
let adapterInstance: WhatsAppAdapter | null = null;
let dbInstance: DatabaseService | null = null;
let engineInstance: ConversationEngine | null = null;

/**
 * Initialize the message processor
 * Called once at application startup
 */
export async function initializeMessageProcessor(): Promise<{
  success: boolean;
  storageMode: string;
  isPersistent: boolean;
}> {
  dbInstance = new DatabaseService();
  engineInstance = new ConversationEngine({
    maxContextMessages: 20,
    minConfidenceForAction: 0.6,
    learningEnabled: true,
    autoApproveCommunication: false,
    requireApprovalForBusinessFacts: true
  });
  adapterInstance = new WhatsAppAdapter(engineInstance, dbInstance);

  return {
    success: true,
    storageMode: dbInstance.getStorageMode(),
    isPersistent: dbInstance.isPersistent()
  };
}

/**
 * PRODUCTION ENTRY POINT
 * 
 * This is the function that whatsappService.js calls for every inbound message.
 * 
 * @param inbound - The parsed WhatsApp inbound message
 * @returns ProcessingResult with the response to send back
 * 
 * Call chain:
 *   whatsappService.handleWebhook()
 *   → messageProcessor.processInboundMessage(inbound)
 *   → WhatsAppAdapter.processInboundMessage(inbound)
 *   → ConversationEngine.processMessage(workspaceId, phone, content)
 *   → IntentClassifier.classify()
 *   → ProductMatcher.searchProducts()
 *   → ResponseGenerator.generate()
 *   → return GeneratedResponse
 *   → format as WhatsAppOutboundMessage
 *   → whatsappService.sendMessage(outbound)
 */
export async function processInboundMessage(inbound: WhatsAppInboundMessage): Promise<ProcessingResult> {
  if (!adapterInstance) {
    await initializeMessageProcessor();
  }

  if (!adapterInstance) {
    return { success: false, error: 'Message processor not initialized' };
  }

  return adapterInstance.processInboundMessage(inbound);
}

/**
 * Get the engine instance (for testing and management)
 */
export function getEngine(): ConversationEngine | null {
  return engineInstance;
}

/**
 * Get the database service instance
 */
export function getDatabase(): DatabaseService | null {
  return dbInstance;
}

/**
 * Get the adapter instance
 */
export function getAdapter(): WhatsAppAdapter | null {
  return adapterInstance;
}

/**
 * Reset the processor (for testing)
 */
export function resetMessageProcessor(): void {
  adapterInstance = null;
  dbInstance = null;
  engineInstance = null;
}

/**
 * Integration documentation:
 * 
 * ## How this connects to the production backend
 * 
 * The AUTOMATIONPHASEV1 backend needs to:
 * 
 * 1. Import and call `initializeMessageProcessor()` at startup
 * 2. Register workspaces with the database service
 * 3. Call `processInboundMessage()` for each WhatsApp webhook message
 * 4. Send the returned response via the WhatsApp Business API
 * 
 * ## Required backend changes
 * 
 * In whatsappService.js (or equivalent):
 * 
 * ```javascript
 * import { processInboundMessage, initializeMessageProcessor } from './messageProcessor';
 * 
 * // At startup:
 * await initializeMessageProcessor();
 * 
 * // In webhook handler:
 * async function handleInboundMessage(webhookPayload) {
 *   const inbound = parseWebhookToInboundFormat(webhookPayload);
 *   const result = await processInboundMessage(inbound);
 *   
 *   if (result.success && result.response) {
 *     await sendWhatsAppReply(result.response);
 *   }
 * }
 * ```
 * 
 * ## Database requirements
 * 
 * The following tables must exist in Supabase:
 * - workspaces (business configuration)
 * - products (tenant-specific product catalogue)
 * - conversations (conversation state)
 * - conversation_messages (message history)
 * - learning_insights (learned improvements)
 * - learning_records (learning audit trail)
 * - workflow_configs (business automation rules)
 * 
 * See supabaseClient.ts for the complete schema.
 */
