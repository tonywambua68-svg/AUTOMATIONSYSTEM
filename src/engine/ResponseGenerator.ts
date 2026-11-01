import { Product, GeneratedResponse, IntentType, Conversation, Business, ConversationMessage } from '../types';

/**
 * ResponseGenerator - Creates natural, human-like responses
 * 
 * Key principles:
 * - No hardcoded product names, prices, or business-specific content
 * - Uses templates with dynamic data from catalogue
 * - Varies response style based on conversation context
 * - Adapts tone to customer communication style
 * - Never repeats the same response
 * - Uses actual business data (name, currency, products)
 */

interface ResponseTemplate {
  patterns: string[];
  intent: IntentType;
  requiresProducts: boolean;
}

// Response templates - these are communication patterns, NOT business-specific content
const RESPONSE_TEMPLATES: ResponseTemplate[] = [
  {
    intent: 'greeting',
    requiresProducts: false,
    patterns: [
      "Hi there! Welcome to {businessName}. How can I help you today?",
      "Hello! 👋 Great to have you here at {businessName}. What are you looking for?",
      "Hey! Welcome to {businessName}. Feel free to ask me anything!",
      "Hi! Thanks for reaching out to {businessName}. How can I assist you?",
      "Hello! 😊 Welcome! What can I help you find today?"
    ]
  },
  {
    intent: 'product_enquiry',
    requiresProducts: true,
    patterns: [
      "Great choice! I found {count} option{plural} for you:\n\n{productList}\n\nWould you like more details on any of these?",
      "I've got some options for you! Here's what we have:\n\n{productList}\n\nWhich one catches your interest?",
      "Sure! Here are {count} {category} option{plural} available:\n\n{productList}\n\nWant me to tell you more about any of them?",
      "Let me show you what we have:\n\n{productList}\n\nFeel free to ask about any of these!"
    ]
  },
  {
    intent: 'product_enquiry',
    requiresProducts: false,
    patterns: [
      "I'd love to help you find that! Unfortunately, I don't see an exact match in our current collection. Would you like me to show you what we do have?",
      "Hmm, I couldn't find an exact match for that right now. Let me show you some similar items we have available, or you could tell me more about what you're looking for?",
      "I don't currently have that specific item, but I'd be happy to help you find something similar! What features are most important to you?"
    ]
  },
  {
    intent: 'alternative_request',
    requiresProducts: true,
    patterns: [
      "Of course! Here are some other options you might like:\n\n{productList}\n\nAny of these look interesting?",
      "Sure thing! Here are some alternatives:\n\n{productList}\n\nWould any of these work for you?",
      "Absolutely! Check out these other options:\n\n{productList}\n\nWhat do you think?"
    ]
  },
  {
    intent: 'alternative_request',
    requiresProducts: false,
    patterns: [
      "I'm sorry, but those were the only options I could find in that range. Would you like me to look at a different category or price range?",
      "Unfortunately, I don't have more alternatives at the moment. Would you like to explore a different category, or shall I connect you with someone who might help further?"
    ]
  },
  {
    intent: 'purchase_intent',
    requiresProducts: false,
    patterns: [
      "Excellent choice! 🎉 Let me help you with that. To proceed with your order, I'll need to confirm a few details. Are you ready?",
      "Great! I'm glad you've decided! Let me guide you through the next steps to complete your purchase.",
      "Wonderful! Let's get this sorted for you. I'll walk you through the ordering process.",
      "Awesome! Let me help you finalize this. Here's what we need to do next..."
    ]
  },
  {
    intent: 'price_negotiation',
    requiresProducts: false,
    patterns: [
      "I understand budget is important! Let me see if we have more affordable options that might work for you.",
      "I hear you! Price matters. Let me check what alternatives we have at a different price point.",
      "That's totally fair! Let me look at some options that might fit your budget better."
    ]
  },
  {
    intent: 'follow_up',
    requiresProducts: false,
    patterns: [
      "Sure! Let me give you more details on that.",
      "Happy to help with that! Here's what I can tell you:",
      "Good question! Let me break that down for you.",
      "Of course! Here's the information you need:"
    ]
  },
  {
    intent: 'complaint',
    requiresProducts: false,
    patterns: [
      "I'm sorry to hear that. Let me see what I can do to help resolve this for you.",
      "I understand your frustration, and I apologize for the inconvenience. Let me look into this.",
      "I'm sorry about that experience. Your satisfaction is important to us. Let me see how we can make this right."
    ]
  },
  {
    intent: 'handoff_request',
    requiresProducts: false,
    patterns: [
      "Of course! Let me connect you with a team member who can help you directly. One moment please.",
      "Absolutely! I'll get someone from our team to assist you personally. Please hold on.",
      "No problem! Let me bring in a specialist who can help you better. Just a moment."
    ]
  },
  {
    intent: 'farewell',
    requiresProducts: false,
    patterns: [
      "Thank you for chatting with us! Have a great day! 😊",
      "Thanks for your time! Don't hesitate to reach out if you need anything else. Take care!",
      "Goodbye! It was nice helping you. Feel free to come back anytime! 👋",
      "Take care! We're here whenever you need us. Have a wonderful day!"
    ]
  },
  {
    intent: 'clarification',
    requiresProducts: false,
    patterns: [
      "Let me clarify that for you!",
      "Good question! Here's what I mean:",
      "Sure, let me explain that better:"
    ]
  },
  {
    intent: 'unknown',
    requiresProducts: false,
    patterns: [
      "I'm not sure I fully understood that. Could you rephrase or tell me more about what you're looking for?",
      "I want to make sure I help you correctly. Could you give me a bit more detail?",
      "I'd love to help! Could you tell me a bit more about what you need?"
    ]
  }
];

export class ResponseGenerator {
  private usedTemplates: Map<string, Set<number>> = new Map(); // conversationId -> used template indices
  private business: Business | null = null;

  constructor() {}

  /**
   * Set the business context for response generation
   */
  setBusiness(business: Business): void {
    this.business = business;
  }

  /**
   * Generate a response based on intent, products, and context
   */
  generate(
    intent: IntentType,
    products: Product[],
    conversation: Conversation,
    entities?: Record<string, string>
  ): GeneratedResponse {
    if (!this.business) {
      throw new Error('Business context not set');
    }

    // Get applicable templates
    const applicableTemplates = RESPONSE_TEMPLATES.filter(t => {
      if (t.intent !== intent) return false;
      if (t.requiresProducts && products.length === 0) return false;
      if (!t.requiresProducts && products.length > 0 && intent === 'product_enquiry') return false;
      return true;
    });

    // If no exact match, try fallback
    if (applicableTemplates.length === 0) {
      const fallback = RESPONSE_TEMPLATES.filter(t => t.intent === 'unknown');
      return this.generateFromTemplates(fallback, products, conversation, entities);
    }

    return this.generateFromTemplates(applicableTemplates, products, conversation, entities);
  }

  /**
   * Generate response from matching templates, avoiding repetition
   */
  private generateFromTemplates(
    templates: ResponseTemplate[],
    products: Product[],
    conversation: Conversation,
    entities?: Record<string, string>
  ): GeneratedResponse {
    const convId = conversation.id;
    const usedIndices = this.usedTemplates.get(convId) || new Set();

    // Find an unused template
    let selectedTemplate: ResponseTemplate | null = null;
    let selectedIndex = -1;

    for (let i = 0; i < templates.length; i++) {
      if (!usedIndices.has(i)) {
        selectedTemplate = templates[i];
        selectedIndex = i;
        break;
      }
    }

    // If all used, reset and pick randomly
    if (!selectedTemplate) {
      this.usedTemplates.set(convId, new Set());
      selectedTemplate = templates[Math.floor(Math.random() * templates.length)];
      selectedIndex = 0;
    }

    // Mark as used
    usedIndices.add(selectedIndex);
    this.usedTemplates.set(convId, usedIndices);

    // Pick a random pattern from the template
    const patternIndex = Math.floor(Math.random() * selectedTemplate.patterns.length);
    let responseText = selectedTemplate.patterns[patternIndex];

    // Fill in dynamic data
    responseText = this.fillTemplate(responseText, products, entities);

    return {
      content: responseText,
      intent: selectedTemplate.intent,
      confidence: 0.85,
      products: products.length > 0 ? products : undefined,
      nextExpectedAction: this.getNextAction(selectedTemplate.intent)
    };
  }

  /**
   * Fill template placeholders with actual data
   */
  private fillTemplate(template: string, products: Product[], entities?: Record<string, string>): string {
    if (!this.business) return template;

    let result = template;

    // Replace business name
    result = result.replace(/\{businessName\}/g, this.business.name);

    // Replace product list
    if (products.length > 0) {
      const productList = products.map((p, i) => 
        `${i + 1}. *${p.name}* — ${this.business!.currency} ${this.formatPrice(p.price)}${p.inStock ? ' ✅ In stock' : ' ⏳ Out of stock'}`
      ).join('\n');
      
      result = result.replace(/\{productList\}/g, productList);
      result = result.replace(/\{count\}/g, products.length.toString());
      result = result.replace(/\{plural\}/g, products.length > 1 ? 's' : '');
      
      // Category from first product
      const category = products[0]?.category || 'items';
      result = result.replace(/\{category\}/g, category);
    }

    // Replace entity-based placeholders
    if (entities) {
      for (const [key, value] of Object.entries(entities)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    return result;
  }

  /**
   * Format price according to business currency
   */
  private formatPrice(price: number): string {
    return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  /**
   * Determine next expected action based on intent
   */
  private getNextAction(intent: IntentType): string | undefined {
    switch (intent) {
      case 'greeting': return 'await_product_enquiry';
      case 'product_enquiry': return 'await_product_selection';
      case 'alternative_request': return 'await_product_selection';
      case 'purchase_intent': return 'await_order_confirmation';
      case 'price_negotiation': return 'await_alternative_selection';
      case 'follow_up': return 'await_follow_up_question';
      case 'handoff_request': return 'handoff';
      default: return undefined;
    }
  }

  /**
   * Generate a specific product detail response
   */
  generateProductDetail(product: Product): GeneratedResponse {
    if (!this.business) throw new Error('Business context not set');

    const details = [
      `Here are the details for *${product.name}*:\n`,
      `📋 ${product.description}`,
      `💰 Price: ${this.business.currency} ${this.formatPrice(product.price)}`,
      product.inStock 
        ? `✅ Available (${product.stockQuantity} in stock)` 
        : `⏳ Currently out of stock`,
    ];

    if (product.tags.length > 0) {
      details.push(`🏷️ Tags: ${product.tags.join(', ')}`);
    }

    details.push(`\nWould you like to go ahead with this, or see some alternatives?`);

    return {
      content: details.join('\n'),
      intent: 'follow_up',
      confidence: 0.9,
      products: [product]
    };
  }

  /**
   * Generate purchase confirmation response
   */
  generatePurchaseConfirmation(product: Product): GeneratedResponse {
    if (!this.business) throw new Error('Business context not set');

    const content = `Great choice! 🎉\n\nYou've selected *${product.name}* at ${this.business.currency} ${this.formatPrice(product.price)}.\n\nTo complete your order, our team will guide you through the next steps. Is there anything else you'd like to know before we proceed?`;

    return {
      content,
      intent: 'purchase_intent',
      confidence: 0.95,
      products: [product],
      nextExpectedAction: 'await_order_details'
    };
  }

  /**
   * Generate a "no results" response
   */
  generateNoResultsResponse(query: string): GeneratedResponse {
    if (!this.business) throw new Error('Business context not set');

    const patterns = [
      `I couldn't find an exact match for "${query}" in our collection right now. Would you like me to show you what we do have, or describe what you're looking for in more detail?`,
      `Hmm, I don't see an exact match for that at the moment. Let me know if you'd like to explore our available options or if you have something specific in mind!`,
      `I don't currently have that specific item. Could you tell me more about what you need? I might be able to suggest something similar!`
    ];

    return {
      content: patterns[Math.floor(Math.random() * patterns.length)],
      intent: 'product_enquiry',
      confidence: 0.7,
      products: []
    };
  }

  /**
   * Generate a price negotiation response with alternatives
   */
  generatePriceNegotiationResponse(product: Product, cheaperOptions: Product[]): GeneratedResponse {
    if (!this.business) throw new Error('Business context not set');

    if (cheaperOptions.length === 0) {
      return {
        content: `I understand you're looking for something more affordable. Unfortunately, *${product.name}* at ${this.business.currency} ${this.formatPrice(product.price)} is our most budget-friendly option in this category. Would you like to explore a different category?`,
        intent: 'price_negotiation',
        confidence: 0.8,
        products: [product]
      };
    }

    const productList = cheaperOptions.map((p, i) => 
      `${i + 1}. *${p.name}* — ${this.business!.currency} ${this.formatPrice(p.price)}`
    ).join('\n');

    return {
      content: `I understand! Here are some more affordable options:\n\n${productList}\n\nWould any of these work better for your budget?`,
      intent: 'price_negotiation',
      confidence: 0.85,
      products: cheaperOptions
    };
  }

  /**
   * Clear used templates for a conversation
   */
  clearUsedTemplates(conversationId: string): void {
    this.usedTemplates.delete(conversationId);
  }
}
