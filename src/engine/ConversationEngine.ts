import { 
  Business, Product, Conversation, GeneratedResponse, 
  Intent, IntentType, EngineConfig, ConversationMessage 
} from '../types';
import { IntentClassifier } from './IntentClassifier';
import { ContextManager } from './ContextManager';
import { ProductMatcher } from './ProductMatcher';
import { ResponseGenerator } from './ResponseGenerator';
import { LearningEngine } from './LearningEngine';

/**
 * ConversationEngine - Main orchestrator for the business assistant
 * 
 * Architecture:
 * - Node engine controls deterministic conversation state and business rules
 * - Tenant database provides business-specific information
 * - Intent classification understands natural language
 * - AI helps with response quality (simulated here)
 * - AI must not invent business facts
 * - Configured workflows retain their intended priority
 * - Session memory is tenant- and conversation-specific
 * 
 * CRITICAL RULES:
 * - No hardcoded product names, prices, currencies, or business names
 * - All data comes from the configured business catalogue
 * - Tenant isolation is enforced at every step
 * - Learning is controlled and auditable
 */

const DEFAULT_CONFIG: EngineConfig = {
  maxContextMessages: 20,
  minConfidenceForAction: 0.6,
  learningEnabled: true,
  autoApproveCommunication: true,
  requireApprovalForBusinessFacts: true
};

export class ConversationEngine {
  private intentClassifier: IntentClassifier;
  private contextManager: ContextManager;
  private productMatcher: ProductMatcher;
  private responseGenerator: ResponseGenerator;
  private learningEngine: LearningEngine;
  private config: EngineConfig;
  private businesses: Map<string, Business> = new Map();

  constructor(config?: Partial<EngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.intentClassifier = new IntentClassifier();
    this.contextManager = new ContextManager(this.config.maxContextMessages);
    this.productMatcher = new ProductMatcher();
    this.responseGenerator = new ResponseGenerator();
    this.learningEngine = new LearningEngine(this.intentClassifier);
  }

  /**
   * Register a business with the engine
   */
  registerBusiness(business: Business, products: Product[]): void {
    this.businesses.set(business.id, business);
    this.productMatcher.loadProducts(business.id, products);
  }

  /**
   * Add products to an existing business
   */
  addProducts(businessId: string, products: Product[]): void {
    for (const product of products) {
      this.productMatcher.addProduct(businessId, product);
    }
  }

  /**
   * Process an incoming customer message
   * This is the main entry point for the conversation engine
   */
  processMessage(businessId: string, customerPhone: string, message: string): GeneratedResponse {
    // 1. Verify business exists
    const business = this.businesses.get(businessId);
    if (!business) {
      return this.createErrorResponse('Business not configured');
    }

    // 2. Set business context for response generation
    this.responseGenerator.setBusiness(business);

    // 3. Get or create conversation (tenant-isolated)
    const conversation = this.contextManager.getOrCreateConversation(businessId, customerPhone);

    // 4. Add customer message to conversation
    this.contextManager.addMessage(conversation, {
      conversationId: conversation.id,
      businessId,
      sender: 'customer',
      content: message
    });

    // 5. Check for workflow automation priority
    const workflowResponse = this.checkWorkflowAutomation(business, conversation, message);
    if (workflowResponse) {
      this.recordBusinessResponse(conversation, workflowResponse);
      return workflowResponse;
    }

    // 6. Classify intent with context awareness
    const contextSummary = this.contextManager.getContextSummary(conversation);
    let intent = this.intentClassifier.classify(message, businessId, contextSummary);

    // 6b. Context-aware intent adjustment
    // If purchase_intent detected but no product context AND message has product category,
    // it's actually a product enquiry (e.g., "Can I get a laptop" with no prior context)
    if (intent.type === 'purchase_intent' && !contextSummary.hasProductResults && intent.entities.productCategory) {
      intent = {
        ...intent,
        type: 'product_enquiry',
        confidence: intent.confidence * 0.9
      };
    }

    // 7. Update customer message with detected intent
    const lastCustomerMsg = conversation.messages[conversation.messages.length - 1];
    if (lastCustomerMsg) {
      lastCustomerMsg.intent = intent.type;
      lastCustomerMsg.confidence = intent.confidence;
    }

    // 8. Track intent in history
    this.contextManager.trackIntent(conversation, intent.type);

    // 9. Process based on intent
    const response = this.processIntent(intent, conversation, business);

    // 10. Check for response repetition (critical bug fix)
    if (this.contextManager.isResponseRepeated(conversation, response.content)) {
      // Generate alternative response
      const alternativeResponse = this.generateAlternativeResponse(intent, conversation, business);
      if (alternativeResponse && !this.contextManager.isResponseRepeated(conversation, alternativeResponse.content)) {
        this.recordBusinessResponse(conversation, alternativeResponse);
        return alternativeResponse;
      }
    }

    // 11. Record business response
    this.recordBusinessResponse(conversation, response);

    // 12. Trigger learning analysis if enabled
    if (this.config.learningEnabled && conversation.messages.length % 4 === 0) {
      this.learningEngine.analyzeConversation(conversation);
    }

    return response;
  }

  /**
   * Check if a configured workflow automation should take priority
   */
  private checkWorkflowAutomation(business: Business, conversation: Conversation, message: string): GeneratedResponse | null {
    if (!business.workflow.autoResponses || business.workflow.autoResponses.length === 0) {
      return null;
    }

    // Sort by priority (highest first)
    const sortedResponses = [...business.workflow.autoResponses].sort((a, b) => b.priority - a.priority);

    for (const autoResponse of sortedResponses) {
      const triggerPattern = new RegExp(autoResponse.trigger, 'i');
      if (triggerPattern.test(message)) {
        return {
          content: autoResponse.response,
          intent: 'unknown',
          confidence: 1.0,
          metadata: { source: 'workflow_automation', trigger: autoResponse.trigger }
        };
      }
    }

    return null;
  }

  /**
   * Process the classified intent and generate appropriate response
   */
  private processIntent(intent: Intent, conversation: Conversation, business: Business): GeneratedResponse {
    switch (intent.type) {
      case 'greeting':
        return this.handleGreeting(conversation, business);
      
      case 'product_enquiry':
        return this.handleProductEnquiry(intent, conversation, business);
      
      case 'alternative_request':
        return this.handleAlternativeRequest(conversation, business);
      
      case 'purchase_intent':
        return this.handlePurchaseIntent(conversation, business);
      
      case 'price_negotiation':
        return this.handlePriceNegotiation(conversation, business);
      
      case 'follow_up':
        return this.handleFollowUp(conversation, business);
      
      case 'complaint':
        return this.handleComplaint(conversation, business);
      
      case 'handoff_request':
        return this.handleHandoff(conversation, business);
      
      case 'farewell':
        return this.handleFarewell(conversation, business);
      
      case 'clarification':
        return this.handleClarification(conversation, business);
      
      default:
        return this.handleUnknown(conversation, business);
    }
  }

  /**
   * Handle greeting - but ONLY if it's genuinely a greeting
   * CRITICAL FIX: Don't let product enquiries be swallowed by greeting logic
   */
  private handleGreeting(conversation: Conversation, business: Business): GeneratedResponse {
    // Check if this is actually a product enquiry disguised as greeting
    // (e.g., "hello I want a phone" should NOT trigger greeting)
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (lastMessage) {
      const hasProductKeywords = this.containsProductReference(lastMessage.content);
      if (hasProductKeywords) {
        // This is a product enquiry that happens to start with a greeting
        const intent: Intent = {
          type: 'product_enquiry',
          confidence: 0.8,
          entities: this.intentClassifier.classify(lastMessage.content, business.id).entities,
          rawMessage: lastMessage.content
        };
        return this.handleProductEnquiry(intent, conversation, business);
      }
    }

    // Check if we've already greeted in this conversation
    if (conversation.messages.length > 2 && !this.contextManager.wasLastResponseGreeting(conversation)) {
      // Already had a conversation, treat as follow-up instead
      return this.handleFollowUp(conversation, business);
    }

    // Genuine greeting
    return this.responseGenerator.generate('greeting', [], conversation);
  }

  /**
   * Handle product enquiry - search catalogue and present results
   */
  private handleProductEnquiry(intent: Intent, conversation: Conversation, business: Business): GeneratedResponse {
    const query = intent.entities.productCategory || intent.rawMessage;
    
    // Search products from THIS business's catalogue only
    const products = this.productMatcher.searchProducts(business.id, query, intent.entities);

    if (products.length > 0) {
      // Store results in context for follow-up references
      this.contextManager.setProductResults(conversation, products.slice(0, 5));
      
      return this.responseGenerator.generate('product_enquiry', products.slice(0, 5), conversation, intent.entities);
    } else {
      // No matching products found - NEVER fabricate
      return this.responseGenerator.generateNoResultsResponse(query);
    }
  }

  /**
   * Handle alternative request - use context to find alternatives
   */
  private handleAlternativeRequest(conversation: Conversation, business: Business): GeneratedResponse {
    // Get the currently selected or last shown product
    const selectedProduct = this.contextManager.getSelectedProduct(conversation);
    const lastResults = this.contextManager.getLastProductResults(conversation);

    if (selectedProduct) {
      // Get alternatives to the selected product
      const alternatives = this.productMatcher.getAlternatives(business.id, selectedProduct.id, 3);
      
      if (alternatives.length > 0) {
        this.contextManager.setProductResults(conversation, alternatives);
        return this.responseGenerator.generate('alternative_request', alternatives, conversation);
      }
    }

    if (lastResults && lastResults.length > 0) {
      // Show remaining products from last results that weren't shown
      const remainingProducts = lastResults.slice(1); // Skip first one (already shown)
      if (remainingProducts.length > 0) {
        return this.responseGenerator.generate('alternative_request', remainingProducts, conversation);
      }

      // Get alternatives to the first product in last results
      const alternatives = this.productMatcher.getAlternatives(business.id, lastResults[0].id, 3);
      if (alternatives.length > 0) {
        this.contextManager.setProductResults(conversation, alternatives);
        return this.responseGenerator.generate('alternative_request', alternatives, conversation);
      }
    }

    // No alternatives available
    return this.responseGenerator.generate('alternative_request', [], conversation);
  }

  /**
   * Handle purchase intent - guide towards order completion
   */
  private handlePurchaseIntent(conversation: Conversation, business: Business): GeneratedResponse {
    const selectedProduct = this.contextManager.getSelectedProduct(conversation);
    const lastResults = this.contextManager.getLastProductResults(conversation);

    // Determine which product the customer wants to buy
    let productToBuy: Product | undefined = selectedProduct;
    
    if (!productToBuy && lastResults && lastResults.length > 0) {
      // If only one product was shown, assume that's the one
      if (lastResults.length === 1) {
        productToBuy = lastResults[0];
      } else {
        // Multiple products - need to confirm which one
        // But first, check if the customer's message references a specific one
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        if (lastMessage) {
          // Try to match to a specific product
          for (const product of lastResults) {
            if (lastMessage.content.toLowerCase().includes(product.name.toLowerCase())) {
              productToBuy = product;
              break;
            }
          }
          // Default to first if can't determine
          if (!productToBuy) {
            productToBuy = lastResults[0];
          }
        }
      }
    }

    if (productToBuy) {
      this.contextManager.setSelectedProduct(conversation, productToBuy);
      this.contextManager.updateContext(conversation, { purchaseIntentDetected: true });
      return this.responseGenerator.generatePurchaseConfirmation(productToBuy);
    }

    // No product context - ask what they want to buy
    return {
      content: "I'd love to help you with your purchase! Could you tell me which item you're interested in? I can show you what we have available.",
      intent: 'purchase_intent',
      confidence: 0.7,
      nextExpectedAction: 'await_product_selection'
    };
  }

  /**
   * Handle price negotiation
   */
  private handlePriceNegotiation(conversation: Conversation, business: Business): GeneratedResponse {
    const selectedProduct = this.contextManager.getSelectedProduct(conversation);
    const lastResults = this.contextManager.getLastProductResults(conversation);

    const referenceProduct = selectedProduct || (lastResults && lastResults[0]);

    if (referenceProduct) {
      const cheaperOptions = this.productMatcher.getCheaperAlternatives(business.id, referenceProduct.id, 3);
      return this.responseGenerator.generatePriceNegotiationResponse(referenceProduct, cheaperOptions);
    }

    return this.responseGenerator.generate('price_negotiation', [], conversation);
  }

  /**
   * Handle follow-up questions using conversation context
   */
  private handleFollowUp(conversation: Conversation, business: Business): GeneratedResponse {
    const lastResults = this.contextManager.getLastProductResults(conversation);
    const selectedProduct = this.contextManager.getSelectedProduct(conversation);
    const lastMessage = conversation.messages[conversation.messages.length - 1];

    // If customer is asking about a specific product from results
    if (lastResults && lastMessage) {
      const content = lastMessage.content.toLowerCase();
      
      // Check if they're asking about a specific product by position
      const positionMatch = content.match(/(?:the\s*)?(first|second|third|last|next|other|another|one)/i);
      if (positionMatch) {
        const position = positionMatch[1].toLowerCase();
        let index = 0;
        switch (position) {
          case 'first': index = 0; break;
          case 'second': index = 1; break;
          case 'third': index = 2; break;
          case 'last': index = lastResults.length - 1; break;
          case 'next': 
          case 'other': 
          case 'another': index = 1; break;
        }
        
        if (index < lastResults.length) {
          const product = lastResults[index];
          this.contextManager.setSelectedProduct(conversation, product);
          return this.responseGenerator.generateProductDetail(product);
        }
      }

      // Check if asking about price
      if (content.includes('how much') || content.includes('price') || content.includes('cost')) {
        const product = selectedProduct || lastResults[0];
        if (product) {
          return {
            content: `The *${product.name}* is priced at ${business.currency} ${product.price.toLocaleString()}. Would you like to proceed with this one, or see other options?`,
            intent: 'follow_up',
            confidence: 0.9,
            products: [product]
          };
        }
      }

      // Check if asking about availability
      if (content.includes('available') || content.includes('in stock') || content.includes('have it')) {
        const product = selectedProduct || lastResults[0];
        if (product) {
          return {
            content: product.inStock 
              ? `Yes! The *${product.name}* is available. We have ${product.stockQuantity} in stock. Would you like to order?`
              : `I'm sorry, the *${product.name}* is currently out of stock. Would you like me to suggest alternatives?`,
            intent: 'follow_up',
            confidence: 0.9,
            products: [product]
          };
        }
      }
    }

    // Generic follow-up with product detail if we have one
    if (selectedProduct) {
      return this.responseGenerator.generateProductDetail(selectedProduct);
    }

    if (lastResults && lastResults.length > 0) {
      return this.responseGenerator.generateProductDetail(lastResults[0]);
    }

    // No context for follow-up
    return this.responseGenerator.generate('follow_up', [], conversation);
  }

  /**
   * Handle complaint
   */
  private handleComplaint(conversation: Conversation, business: Business): GeneratedResponse {
    // Check if handoff is enabled for complaints
    if (business.workflow.handoffEnabled) {
      return {
        content: "I'm sorry to hear about your experience. Let me connect you with a team member who can help resolve this for you right away.",
        intent: 'complaint',
        confidence: 0.9,
        nextExpectedAction: 'handoff'
      };
    }

    return this.responseGenerator.generate('complaint', [], conversation);
  }

  /**
   * Handle handoff request
   */
  private handleHandoff(conversation: Conversation, business: Business): GeneratedResponse {
    if (business.workflow.handoffEnabled) {
      this.contextManager.handOffConversation(conversation);
      return this.responseGenerator.generate('handoff_request', [], conversation);
    }

    return {
      content: "I understand you'd like to speak with someone directly. Unfortunately, human handoff isn't available right now. Is there anything I can help you with in the meantime?",
      intent: 'handoff_request',
      confidence: 0.8
    };
  }

  /**
   * Handle farewell
   */
  private handleFarewell(conversation: Conversation, business: Business): GeneratedResponse {
    this.contextManager.completeConversation(conversation);
    return this.responseGenerator.generate('farewell', [], conversation);
  }

  /**
   * Handle clarification request
   */
  private handleClarification(conversation: Conversation, business: Business): GeneratedResponse {
    return this.responseGenerator.generate('clarification', [], conversation);
  }

  /**
   * Handle unknown intent
   */
  private handleUnknown(conversation: Conversation, business: Business): GeneratedResponse {
    return this.responseGenerator.generate('unknown', [], conversation);
  }

  /**
   * Generate an alternative response when the primary one would be repeated
   */
  private generateAlternativeResponse(intent: Intent, conversation: Conversation, business: Business): GeneratedResponse | null {
    // Try to add contextual information to make the response different
    const lastResults = this.contextManager.getLastProductResults(conversation);
    
    if (intent.type === 'product_enquiry' && lastResults && lastResults.length > 0) {
      return {
        content: `I still have those options available for you! Would you like more details on any specific one, or shall I show you something different?`,
        intent: 'follow_up',
        confidence: 0.7,
        products: lastResults
      };
    }

    if (intent.type === 'greeting') {
      return {
        content: `Welcome back! How can I continue helping you today?`,
        intent: 'greeting',
        confidence: 0.7
      };
    }

    return null;
  }

  /**
   * Check if a message contains product reference keywords
   * This is NOT hardcoded to specific products - it detects general patterns
   */
  private containsProductReference(message: string): boolean {
    const normalizedMessage = message.toLowerCase();
    
    // General patterns that indicate someone is looking for something specific
    const productPatterns = [
      /looking\s*(?:for|to\s*(?:get|buy|find))/i,
      /(?:need|want|searching\s*(?:for|to\s*find))\s+(?:a|an|some)/i,
      /do\s*you\s*(?:have|sell|carry|stock)/i,
      /(?:can|could)\s*i\s*(?:get|have|buy|find|order)/i,
      /(?:show|find)\s*me/i,
      /what\s*(?:do\s*you\s*have|is\s*available)/i,
      /i'm\s*(?:looking|searching)/i,
      /any\s*(?:available|in\s*stock)/i,
    ];

    return productPatterns.some(p => p.test(normalizedMessage));
  }

  /**
   * Record a business response in the conversation
   */
  private recordBusinessResponse(conversation: Conversation, response: GeneratedResponse): void {
    this.contextManager.addMessage(conversation, {
      conversationId: conversation.id,
      businessId: conversation.businessId,
      sender: 'business',
      content: response.content,
      intent: response.intent,
      confidence: response.confidence,
      metadata: response.metadata
    });
  }

  /**
   * Create an error response
   */
  private createErrorResponse(message: string): GeneratedResponse {
    return {
      content: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
      intent: 'unknown',
      confidence: 0,
      metadata: { error: message }
    };
  }

  // === Public API for learning and management ===

  /**
   * Get learning insights for a business
   */
  getLearningInsights(businessId: string) {
    return this.learningEngine.getInsights(businessId);
  }

  /**
   * Get unapproved insights
   */
  getUnapprovedInsights(businessId: string) {
    return this.learningEngine.getUnapprovedInsights(businessId);
  }

  /**
   * Approve a learning insight
   */
  approveInsight(businessId: string, insightId: string) {
    return this.learningEngine.approveInsight(businessId, insightId);
  }

  /**
   * Reject a learning insight
   */
  rejectInsight(businessId: string, insightId: string) {
    return this.learningEngine.rejectInsight(businessId, insightId);
  }

  /**
   * Get conversation for inspection
   */
  getConversation(businessId: string, customerPhone: string): Conversation | undefined {
    const conversations = this.contextManager.getBusinessConversations(businessId);
    return conversations.find(c => c.customerPhone === customerPhone);
  }

  /**
   * Get all conversations for a business
   */
  getBusinessConversations(businessId: string): Conversation[] {
    return this.contextManager.getBusinessConversations(businessId);
  }

  /**
   * Get learning statistics for a business
   */
  getLearningStats(businessId: string) {
    return this.learningEngine.getStats(businessId);
  }

  /**
   * Get all products for a business
   */
  getBusinessProducts(businessId: string): Product[] {
    return this.productMatcher.getAllProducts(businessId);
  }

  /**
   * Manually trigger learning analysis on a conversation
   */
  analyzeConversation(businessId: string, customerPhone: string) {
    const conversation = this.getConversation(businessId, customerPhone);
    if (conversation) {
      return this.learningEngine.analyzeConversation(conversation);
    }
    return [];
  }

  /**
   * Reset a conversation (for testing)
   */
  resetConversation(businessId: string, customerPhone: string): void {
    this.contextManager.clearConversation(businessId, customerPhone);
  }

  /**
   * Get engine status
   */
  getStatus(): { businesses: number; config: EngineConfig } {
    return {
      businesses: this.businesses.size,
      config: this.config
    };
  }
}
