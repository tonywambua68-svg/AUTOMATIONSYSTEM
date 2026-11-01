import { Conversation, ConversationContext, ConversationMessage, Product } from '../types';

/**
 * ContextManager - Manages conversation memory and context
 * 
 * Responsibilities:
 * - Track conversation state per tenant/conversation
 * - Store last product results for follow-up references
 * - Maintain intent history for context-aware responses
 * - Ensure tenant isolation (no cross-business data leakage)
 * - Track topic progression through the conversation
 */

export class ContextManager {
  private conversations: Map<string, Conversation> = new Map();
  private maxContextMessages: number;

  constructor(maxContextMessages: number = 20) {
    this.maxContextMessages = maxContextMessages;
  }

  /**
   * Get or create a conversation for a customer-business pair
   */
  getOrCreateConversation(businessId: string, customerPhone: string): Conversation {
    const key = this.getConversationKey(businessId, customerPhone);
    
    let conversation = this.conversations.get(key);
    if (!conversation) {
      conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        businessId,
        customerPhone,
        messages: [],
        context: {
          intentHistory: [],
          purchaseIntentDetected: false,
          topicHistory: []
        },
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.conversations.set(key, conversation);
    }
    
    return conversation;
  }

  /**
   * Add a message to the conversation
   */
  addMessage(conversation: Conversation, message: Omit<ConversationMessage, 'id' | 'timestamp'>): ConversationMessage {
    const msg: ConversationMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now()
    };
    
    conversation.messages.push(msg);
    conversation.updatedAt = Date.now();
    
    // Trim old messages to maintain context window
    if (conversation.messages.length > this.maxContextMessages) {
      conversation.messages = conversation.messages.slice(-this.maxContextMessages);
    }
    
    return msg;
  }

  /**
   * Update conversation context with new information
   */
  updateContext(conversation: Conversation, updates: Partial<ConversationContext>): void {
    conversation.context = {
      ...conversation.context,
      ...updates
    };
    conversation.updatedAt = Date.now();
  }

  /**
   * Store product results for follow-up references
   */
  setProductResults(conversation: Conversation, products: Product[]): void {
    conversation.context.lastProductResults = products;
    conversation.context.topicHistory.push('product_results');
  }

  /**
   * Get the last product results from context
   */
  getLastProductResults(conversation: Conversation): Product[] | undefined {
    return conversation.context.lastProductResults;
  }

  /**
   * Get selected product from context
   */
  getSelectedProduct(conversation: Conversation): Product | undefined {
    return conversation.context.selectedProduct;
  }

  /**
   * Set selected product
   */
  setSelectedProduct(conversation: Conversation, product: Product): void {
    conversation.context.selectedProduct = product;
    conversation.context.topicHistory.push('product_selected');
  }

  /**
   * Track intent in history
   */
  trackIntent(conversation: Conversation, intent: string): void {
    conversation.context.intentHistory.push(intent);
    // Keep only recent intents
    if (conversation.context.intentHistory.length > 10) {
      conversation.context.intentHistory = conversation.context.intentHistory.slice(-10);
    }
  }

  /**
   * Get the last intent from history
   */
  getLastIntent(conversation: Conversation): string | undefined {
    const history = conversation.context.intentHistory;
    return history.length > 0 ? history[history.length - 1] : undefined;
  }

  /**
   * Check if conversation has product results (for context-aware classification)
   */
  hasProductResults(conversation: Conversation): boolean {
    return !!(conversation.context.lastProductResults && conversation.context.lastProductResults.length > 0);
  }

  /**
   * Get recent messages for context (excluding the current message)
   */
  getRecentMessages(conversation: Conversation, count: number = 5): ConversationMessage[] {
    return conversation.messages.slice(-count - 1, -1);
  }

  /**
   * Get the last business response
   */
  getLastBusinessResponse(conversation: Conversation): ConversationMessage | undefined {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      if (conversation.messages[i].sender === 'business') {
        return conversation.messages[i];
      }
    }
    return undefined;
  }

  /**
   * Check if the last response was a greeting (to detect greeting repetition bug)
   */
  wasLastResponseGreeting(conversation: Conversation): boolean {
    const lastResponse = this.getLastBusinessResponse(conversation);
    if (!lastResponse) return false;
    
    const greetingPatterns = /^(hi|hello|hey|welcome|good\s*(morning|afternoon|evening))/i;
    return greetingPatterns.test(lastResponse.content);
  }

  /**
   * Check if a response is being repeated
   */
  isResponseRepeated(conversation: Conversation, newResponse: string): boolean {
    const recentMessages = conversation.messages.slice(-4);
    return recentMessages.some(m => 
      m.sender === 'business' && 
      this.similarityScore(m.content, newResponse) > 0.85
    );
  }

  /**
   * Simple similarity score between two strings
   */
  private similarityScore(a: string, b: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const na = normalize(a);
    const nb = normalize(b);
    
    if (na === nb) return 1.0;
    
    // Word overlap
    const wordsA = new Set(na.split(' '));
    const wordsB = new Set(nb.split(' '));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.length / union.size;
  }

  /**
   * Get conversation context summary for the classifier
   */
  getContextSummary(conversation: Conversation): { lastIntent?: string; hasProductResults: boolean } {
    return {
      lastIntent: this.getLastIntent(conversation),
      hasProductResults: this.hasProductResults(conversation)
    };
  }

  /**
   * Verify tenant isolation - ensure conversation belongs to correct business
   */
  verifyTenantIsolation(conversation: Conversation, businessId: string): boolean {
    return conversation.businessId === businessId;
  }

  /**
   * Get all conversations for a business (tenant-specific)
   */
  getBusinessConversations(businessId: string): Conversation[] {
    return Array.from(this.conversations.values()).filter(c => c.businessId === businessId);
  }

  /**
   * Get conversation key ensuring tenant isolation
   */
  private getConversationKey(businessId: string, customerPhone: string): string {
    return `${businessId}::${customerPhone}`;
  }

  /**
   * Clear conversation (for testing)
   */
  clearConversation(businessId: string, customerPhone: string): void {
    const key = this.getConversationKey(businessId, customerPhone);
    this.conversations.delete(key);
  }

  /**
   * Get all conversations (for learning analysis)
   */
  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  /**
   * Mark conversation as handed off
   */
  handOffConversation(conversation: Conversation): void {
    conversation.status = 'handed_off';
    conversation.updatedAt = Date.now();
  }

  /**
   * Mark conversation as completed
   */
  completeConversation(conversation: Conversation): void {
    conversation.status = 'completed';
    conversation.updatedAt = Date.now();
  }
}
