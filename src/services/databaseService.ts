/**
 * DatabaseService - Persistent storage layer for the Conversation Engine
 * 
 * This service bridges the in-memory engine to the actual database.
 * It handles:
 * - Loading business workspace data
 * - Loading tenant-specific products
 * - Persisting conversations and messages
 * - Storing learning insights and records
 * - Enforcing tenant isolation at the database level
 * 
 * CRITICAL: This service NEVER invents data. It only reads from and writes to
 * the actual database. If data doesn't exist, it returns empty/null.
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { Business, Product, Conversation, ConversationMessage, LearningInsight, LearningRecord, WorkflowConfig } from '../types';

export class DatabaseService {
  private useInMemory: boolean;
  
  // In-memory fallback (used when Supabase is not configured)
  private memoryWorkspaces: Map<string, Business> = new Map();
  private memoryProducts: Map<string, Product[]> = new Map();
  private memoryConversations: Map<string, Conversation> = new Map();
  private memoryInsights: Map<string, LearningInsight[]> = new Map();
  private memoryRecords: Map<string, LearningRecord[]> = new Map();

  constructor() {
    this.useInMemory = !isSupabaseConfigured();
    if (this.useInMemory) {
      console.warn('[DatabaseService] Using in-memory storage. Data will NOT persist across restarts.');
    } else {
      console.info('[DatabaseService] Connected to Supabase. Data will persist.');
    }
  }

  // === WORKSPACE/BUSINESS OPERATIONS ===

  /**
   * Load a business workspace from the database
   * Returns null if workspace doesn't exist
   */
  async getWorkspace(workspaceId: string): Promise<Business | null> {
    if (this.useInMemory) {
      return this.memoryWorkspaces.get(workspaceId) || null;
    }

    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single();

      if (error || !data) return null;

      // Load workflow config
      const { data: workflowData } = await supabase
        .from('workflow_configs')
        .select('config')
        .eq('workspace_id', workspaceId)
        .single();

      const workflow: WorkflowConfig = workflowData?.config || {
        steps: [],
        autoResponses: [],
        handoffEnabled: false,
        handoffTrigger: ''
      };

      return {
        id: data.id,
        name: data.name,
        currency: data.currency,
        greetingMessage: data.greeting_message,
        workflow
      };
    } catch (error) {
      console.error('[DatabaseService] Error loading workspace:', error);
      return null;
    }
  }

  /**
   * Save a business workspace (for setup/testing)
   */
  async saveWorkspace(business: Business): Promise<boolean> {
    if (this.useInMemory) {
      this.memoryWorkspaces.set(business.id, business);
      return true;
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('workspaces')
        .upsert({
          id: business.id,
          name: business.name,
          currency: business.currency,
          greeting_message: business.greetingMessage
        });

      if (error) {
        console.error('[DatabaseService] Error saving workspace:', error);
        return false;
      }

      // Save workflow config
      await supabase
        .from('workflow_configs')
        .upsert({
          workspace_id: business.id,
          config: business.workflow
        });

      return true;
    } catch (error) {
      console.error('[DatabaseService] Error saving workspace:', error);
      return false;
    }
  }

  // === PRODUCT OPERATIONS ===

  /**
   * Load all products for a workspace
   * CRITICAL: Only returns products belonging to the specified workspace
   */
  async getProducts(workspaceId: string): Promise<Product[]> {
    if (this.useInMemory) {
      return this.memoryProducts.get(workspaceId) || [];
    }

    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        businessId: row.workspace_id,
        name: row.name,
        category: row.category,
        description: row.description || '',
        price: parseFloat(row.price),
        currency: row.currency,
        inStock: row.in_stock,
        stockQuantity: row.stock_quantity || 0,
        tags: row.tags || []
      }));
    } catch (error) {
      console.error('[DatabaseService] Error loading products:', error);
      return [];
    }
  }

  /**
   * Save products for a workspace
   */
  async saveProducts(workspaceId: string, products: Product[]): Promise<boolean> {
    if (this.useInMemory) {
      this.memoryProducts.set(workspaceId, products);
      return true;
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const rows = products.map(p => ({
        id: p.id,
        workspace_id: workspaceId,
        name: p.name,
        category: p.category,
        description: p.description,
        price: p.price,
        currency: p.currency,
        in_stock: p.inStock,
        stock_quantity: p.stockQuantity,
        tags: p.tags
      }));

      const { error } = await supabase
        .from('products')
        .upsert(rows);

      if (error) {
        console.error('[DatabaseService] Error saving products:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[DatabaseService] Error saving products:', error);
      return false;
    }
  }

  /**
   * Verify a product belongs to a workspace (tenant isolation check)
   */
  async verifyProductOwnership(workspaceId: string, productId: string): Promise<boolean> {
    if (this.useInMemory) {
      const products = this.memoryProducts.get(workspaceId) || [];
      return products.some(p => p.id === productId);
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('workspace_id', workspaceId)
        .single();

      return !error && !!data;
    } catch {
      return false;
    }
  }

  // === CONVERSATION OPERATIONS ===

  /**
   * Load or create a conversation for a customer in a workspace
   * CRITICAL: Conversations are workspace-scoped
   */
  async getOrCreateConversation(workspaceId: string, customerPhone: string): Promise<Conversation | null> {
    const memoryKey = `${workspaceId}::${customerPhone}`;

    if (this.useInMemory) {
      let conversation = this.memoryConversations.get(memoryKey);
      if (!conversation) {
        conversation = {
          id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          businessId: workspaceId,
          customerPhone,
          messages: [],
          context: { intentHistory: [], purchaseIntentDetected: false, topicHistory: [] },
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.memoryConversations.set(memoryKey, conversation);
      }
      return conversation;
    }

    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      // Try to find existing conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('customer_phone', customerPhone)
        .eq('status', 'active')
        .single();

      if (existing) {
        // Load messages for this conversation
        const { data: messages } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('conversation_id', existing.id)
          .order('created_at', { ascending: true });

        return {
          id: existing.id,
          businessId: existing.workspace_id,
          customerPhone: existing.customer_phone,
          messages: (messages || []).map((m: any) => ({
            id: m.id,
            conversationId: m.conversation_id,
            businessId: m.workspace_id,
            sender: m.sender,
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            intent: m.intent,
            confidence: m.confidence ? parseFloat(m.confidence) : undefined,
            metadata: m.metadata
          })),
          context: existing.context || { intentHistory: [], purchaseIntentDetected: false, topicHistory: [] },
          status: existing.status,
          createdAt: new Date(existing.created_at).getTime(),
          updatedAt: new Date(existing.updated_at).getTime()
        };
      }

      // Create new conversation
      const newConv = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        workspace_id: workspaceId,
        customer_phone: customerPhone,
        status: 'active',
        context: { intentHistory: [], purchaseIntentDetected: false, topicHistory: [] }
      };

      const { error } = await supabase
        .from('conversations')
        .insert(newConv);

      if (error) {
        console.error('[DatabaseService] Error creating conversation:', error);
        return null;
      }

      return {
        id: newConv.id,
        businessId: workspaceId,
        customerPhone,
        messages: [],
        context: newConv.context as any,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    } catch (error) {
      console.error('[DatabaseService] Error in getOrCreateConversation:', error);
      return null;
    }
  }

  /**
   * Persist a conversation message
   */
  async saveMessage(message: ConversationMessage): Promise<boolean> {
    const memoryKey = `${message.businessId}::${message.conversationId}`;

    if (this.useInMemory) {
      // In-memory: message is already tracked in the conversation object
      return true;
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('conversation_messages')
        .insert({
          id: message.id,
          conversation_id: message.conversationId,
          workspace_id: message.businessId,
          sender: message.sender,
          content: message.content,
          intent: message.intent,
          confidence: message.confidence,
          metadata: message.metadata || {}
        });

      if (error) {
        console.error('[DatabaseService] Error saving message:', error);
        return false;
      }

      // Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', message.conversationId);

      return true;
    } catch (error) {
      console.error('[DatabaseService] Error saving message:', error);
      return false;
    }
  }

  /**
   * Update conversation context (persisted as JSONB)
   */
  async updateConversationContext(conversationId: string, context: any): Promise<boolean> {
    if (this.useInMemory) {
      return true; // Already tracked in memory
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('conversations')
        .update({ 
          context,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      return !error;
    } catch {
      return false;
    }
  }

  // === LEARNING OPERATIONS ===

  /**
   * Save a learning insight
   */
  async saveInsight(insight: LearningInsight): Promise<boolean> {
    if (this.useInMemory) {
      const existing = this.memoryInsights.get(insight.businessId) || [];
      existing.push(insight);
      this.memoryInsights.set(insight.businessId, existing);
      return true;
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('learning_insights')
        .insert({
          id: insight.id,
          workspace_id: insight.businessId,
          category: insight.category,
          description: insight.description,
          suggestion: insight.suggestion,
          evidence: insight.evidence,
          approved: insight.approved
        });

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Load learning insights for a workspace
   */
  async getInsights(workspaceId: string): Promise<LearningInsight[]> {
    if (this.useInMemory) {
      return this.memoryInsights.get(workspaceId) || [];
    }

    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('learning_insights')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        businessId: row.workspace_id,
        category: row.category,
        description: row.description,
        suggestion: row.suggestion,
        evidence: row.evidence || [],
        approved: row.approved,
        createdAt: new Date(row.created_at).getTime()
      }));
    } catch {
      return [];
    }
  }

  /**
   * Update insight approval status
   */
  async updateInsightApproval(workspaceId: string, insightId: string, approved: boolean): Promise<boolean> {
    if (this.useInMemory) {
      const insights = this.memoryInsights.get(workspaceId) || [];
      const insight = insights.find(i => i.id === insightId);
      if (insight) {
        insight.approved = approved;
        return true;
      }
      return false;
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('learning_insights')
        .update({ approved })
        .eq('id', insightId)
        .eq('workspace_id', workspaceId); // Tenant isolation in query

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Delete an insight (rejection)
   */
  async deleteInsight(workspaceId: string, insightId: string): Promise<boolean> {
    if (this.useInMemory) {
      const insights = this.memoryInsights.get(workspaceId) || [];
      const filtered = insights.filter(i => i.id !== insightId);
      this.memoryInsights.set(workspaceId, filtered);
      return true;
    }

    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from('learning_insights')
        .delete()
        .eq('id', insightId)
        .eq('workspace_id', workspaceId); // Tenant isolation

      return !error;
    } catch {
      return false;
    }
  }

  // === STATUS ===

  /**
   * Check if using persistent storage
   */
  isPersistent(): boolean {
    return !this.useInMemory;
  }

  /**
   * Get storage mode description
   */
  getStorageMode(): string {
    return this.useInMemory ? 'in-memory (non-persistent)' : 'Supabase (persistent)';
  }
}
