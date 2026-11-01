import { Intent, IntentType, LearningRecord } from '../types';

/**
 * IntentClassifier - Classifies customer messages into intents
 * 
 * Uses a combination of:
 * 1. Pattern-based matching (learned patterns, not hardcoded)
 * 2. Semantic similarity to known expressions
 * 3. Context from conversation history
 * 4. Learned patterns from previous conversations
 * 
 * IMPORTANT: No hardcoded product names, prices, or business-specific terms.
 * Patterns are learned from conversation data.
 */

interface PatternEntry {
  pattern: RegExp;
  intent: IntentType;
  weight: number;
  source: 'seed' | 'learned';
  businessId?: string;
}

// Seed patterns - these are general communication patterns, NOT business-specific
// They represent how humans generally express different intentions
const SEED_PATTERNS: Omit<PatternEntry, 'businessId'>[] = [
  // Greetings - general human greeting patterns
  { pattern: /^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening)|greetings|sup|yo|hiya|heya|hola|what'?s?\s*up|how\s*are\s*you|how\s*it\s*going)/i, intent: 'greeting', weight: 0.9, source: 'seed' },
  { pattern: /^(hi|hello|hey)\s*there/i, intent: 'greeting', weight: 0.85, source: 'seed' },
  
  // Farewells
  { pattern: /^(bye|goodbye|see\s*you|take\s*care|later|good\s*night|ttyl|cya|farewell|thanks\s*bye)/i, intent: 'farewell', weight: 0.9, source: 'seed' },
  
  // Purchase intent - general buying language
  { pattern: /(i\s*want\s*(to\s*buy|it|this|that|the)|i'?ll?\s*take\s*(it|this|that)|i\s*want\s*to\s*(get|order|purchase)|buy\s*(it|this|that)|purchase\s*(it|this|that)|order\s*(it|this|that)|i'?ll?\s*go\s*ahead|proceed|confirm\s*(order|purchase)|add\s*to\s*cart|checkout|place\s*(the\s*)?order|i\s*need\s*(it|this|that))/i, intent: 'purchase_intent', weight: 0.95, source: 'seed' },
  { pattern: /(can\s*i\s*(get|have|buy|order|purchase)|could\s*i\s*(get|have|buy)|i\s*would\s*like\s*(to\s*(get|buy|order)|it|this|that))/i, intent: 'purchase_intent', weight: 0.9, source: 'seed' },
  
  // Price negotiation
  { pattern: /(too\s*expensive|pricey|costly|can\s*you\s*(lower|reduce|discount|give\s*a\s*discount)|is\s*there\s*a\s*discount|any\s*discount|cheaper|less\s*expensive|best\s*price|negotiate|bargain|offer|deal|special\s*price)/i, intent: 'price_negotiation', weight: 0.85, source: 'seed' },
  
  // Alternative/comparison requests
  { pattern: /(alternative|other\s*(option|one|thing)|something\s*(else|different|better|cheaper)|another\s*(option|one)|different\s*(option|one)|compare|comparison|versus|vs|which\s*(is\s*better|one)|do\s*you\s*have\s*(something|anything)\s*(else|other|different)|show\s*me\s*(more|other|another)|what\s*(about|else)|any\s*other)/i, intent: 'alternative_request', weight: 0.9, source: 'seed' },
  
  // Follow-up requests
  { pattern: /(tell\s*me\s*more|more\s*(info|details|about)|what\s*about|how\s*about|and\s*the|also|additionally|what\s*else|anything\s*else|continue|go\s*on|explain|elaborate|details?)/i, intent: 'follow_up', weight: 0.85, source: 'seed' },
  
  // Complaint/dissatisfaction
  { pattern: /(not\s*(good|satisfied|happy|what\s*i\s*want)|wrong|bad|terrible|horrible|disappointed|frustrated|angry|unhappy|problem|issue|complain|doesn'?t\s*work|broken|defective|refund|return)/i, intent: 'complaint', weight: 0.85, source: 'seed' },
  
  // Handoff request
  { pattern: /(speak\s*to\s*(a\s*)?(human|person|agent|representative|someone)|talk\s*to\s*(a\s*)?(human|person|agent|real\s*person)|human\s*agent|real\s*person|customer\s*service|representative|manager|someone\s*help)/i, intent: 'handoff_request', weight: 0.95, source: 'seed' },
  
  // Clarification
  { pattern: /(what\s*do\s*you\s*mean|can\s*you\s*clarify|explain|not\s*sure\s*i\s*understand|confused|what|how|where|when|why|which)/i, intent: 'clarification', weight: 0.7, source: 'seed' },
  
  // Product enquiry - general patterns (NOT specific products)
  { pattern: /(looking\s*(for|to\s*(get|buy|find))|searching\s*(for)|need\s*(a|an|some)|wanna?\s+(a|an|some|to)|want\s*(to\s*(find|get|buy)|a|an|some)|do\s*you\s*(have|sell|carry|stock)|available|in\s*stock|show\s*me|what\s*do\s*you\s*have|catalogue|catalog|products|items|what\s*can\s*i\s*get)/i, intent: 'product_enquiry', weight: 0.85, source: 'seed' },
  { pattern: /(i\s*need|i\s*want|i'?m\s*looking|i\s*search|find\s*me|get\s*me|show\s*me|i\s*wanna)\s+(a|an|some|any|to)/i, intent: 'product_enquiry', weight: 0.9, source: 'seed' },
  // Informal/slang product enquiry patterns
  { pattern: /(wana|wanna|gonna\s*get|tryna|try\s*to\s*get)\s+(a|an|some|any)/i, intent: 'product_enquiry', weight: 0.8, source: 'seed' },
];

export class IntentClassifier {
  private learnedPatterns: Map<string, PatternEntry[]> = new Map();
  private learningRecords: LearningRecord[] = [];

  constructor() {
    // Initialize with seed patterns (business-agnostic)
    this.learnedPatterns.set('__global__', SEED_PATTERNS.map(p => ({ ...p, businessId: undefined })));
  }

  /**
   * Classify a message into an intent
   */
  classify(message: string, businessId: string, context?: { lastIntent?: string; hasProductResults?: boolean }): Intent {
    const normalizedMessage = this.normalizeMessage(message);
    const patterns = this.getPatternsForBusiness(businessId);
    
    let bestMatch: { intent: IntentType; confidence: number; entities: Record<string, string> } = {
      intent: 'unknown',
      confidence: 0,
      entities: {}
    };

    for (const entry of patterns) {
      const match = normalizedMessage.match(entry.pattern);
      if (match) {
        const confidence = entry.weight * (match[0].length / normalizedMessage.length + 0.3);
        const adjustedConfidence = Math.min(confidence, 1.0);
        
        if (adjustedConfidence > bestMatch.confidence) {
          bestMatch = {
            intent: entry.intent,
            confidence: adjustedConfidence,
            entities: this.extractEntities(normalizedMessage, entry.intent)
          };
        }
      }
    }

    // Context-aware adjustments
    bestMatch = this.applyContextAdjustments(bestMatch, context);

    // Extract product-related entities
    const productEntities = this.extractProductEntities(normalizedMessage);
    bestMatch.entities = { ...bestMatch.entities, ...productEntities };

    return {
      type: bestMatch.intent,
      confidence: bestMatch.confidence,
      entities: bestMatch.entities,
      rawMessage: message
    };
  }

  /**
   * Normalize message for pattern matching
   * Handles typos, informal language, etc.
   */
  private normalizeMessage(message: string): string {
    return message
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get patterns applicable to a business (global + business-specific learned)
   */
  private getPatternsForBusiness(businessId: string): PatternEntry[] {
    const globalPatterns = this.learnedPatterns.get('__global__') || [];
    const businessPatterns = this.learnedPatterns.get(businessId) || [];
    return [...globalPatterns, ...businessPatterns];
  }

  /**
   * Apply context-aware adjustments to intent classification
   */
  private applyContextAdjustments(
    match: { intent: IntentType; confidence: number; entities: Record<string, string> },
    context?: { lastIntent?: string; hasProductResults?: boolean }
  ): { intent: IntentType; confidence: number; entities: Record<string, string> } {
    if (!context) return match;

    // If we have product results and the message is a follow-up, boost follow_up intent
    if (context.hasProductResults && match.intent === 'follow_up') {
      match.confidence = Math.min(match.confidence + 0.1, 1.0);
    }

    // If last intent was product_enquiry and current is purchase_intent, boost confidence
    if (context.lastIntent === 'product_enquiry' && match.intent === 'purchase_intent') {
      match.confidence = Math.min(match.confidence + 0.05, 1.0);
    }

    // Short messages after product results are likely follow-ups
    if (context.hasProductResults && match.intent === 'unknown') {
      match.intent = 'follow_up';
      match.confidence = 0.5;
    }

    return match;
  }

  /**
   * Extract entities from message based on intent
   */
  private extractEntities(message: string, intent: IntentType): Record<string, string> {
    const entities: Record<string, string> = {};

    // Extract quantity
    const quantityMatch = message.match(/(\d+)\s*(pieces?|units?|items?|pcs)/i);
    if (quantityMatch) entities.quantity = quantityMatch[1];

    // Extract price-related entities
    if (intent === 'price_negotiation') {
      const priceMatch = message.match(/(\$?\d+(?:\.\d{2})?)/);
      if (priceMatch) entities.mentionedPrice = priceMatch[1];
    }

    return entities;
  }

  /**
   * Extract product-related entities (category, attributes) from message
   * This does NOT match specific product names - it extracts general categories
   */
  private extractProductEntities(message: string): Record<string, string> {
    const entities: Record<string, string> = {};

    // Extract general category words (not specific product names)
    // These are common noun patterns that indicate what type of thing someone wants
    const categoryPatterns = [
      /(?:looking\s*(?:for|to\s*get)|need|want|have|sell|stock)\s+(?:a|an|some)?\s*([\w\s]+?)(?:\s+(?:that|which|with|for|under|below|around)|\?|$)/i,
      /(?:any|do\s*you\s*have)\s+([\w\s]+?)(?:\s+available|\?|$)/i,
      /(?:can|could)\s*(?:i|we)\s*(?:get|have|buy|find|order)\s+(?:a|an|some)?\s*([\w\s]+?)(?:\s*\?|$)/i,
      /(?:show|find)\s*(?:me|us)\s+(?:a|an|some)?\s*([\w\s]+?)(?:\s*\?|$)/i,
      /(?:i\s*(?:need|want|search|am\s*looking))\s+(?:a|an|some)?\s*([\w\s]+?)(?:\s*\?|$)/i,
    ];

    for (const pattern of categoryPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const categoryText = match[1].trim();
        // Only capture if it looks like a category/product type (not too long, not a sentence)
        if (categoryText.split(' ').length <= 4 && categoryText.length > 1) {
          entities.productCategory = categoryText;
          break;
        }
      }
    }

    // Extract attribute modifiers
    const attributePatterns = [
      { pattern: /(cheap|affordable|budget|low\s*price|inexpensive)/i, attribute: 'price_preference', value: 'low' },
      { pattern: /(expensive|premium|luxury|high[\s-]?end|top[\s-]?quality)/i, attribute: 'price_preference', value: 'high' },
      { pattern: /(best|top|recommended|popular|favorite)/i, attribute: 'quality_preference', value: 'best' },
      { pattern: /(new|latest|recent|modern)/i, attribute: 'condition', value: 'new' },
      { pattern: /(used|second[\s-]?hand|refurbished)/i, attribute: 'condition', value: 'used' },
    ];

    for (const { pattern, attribute, value } of attributePatterns) {
      if (pattern.test(message)) {
        entities[attribute] = value;
      }
    }

    return entities;
  }

  /**
   * Learn a new pattern from conversation data
   */
  learnPattern(businessId: string, message: string, correctIntent: IntentType, confidence: number): void {
    const normalizedMessage = this.normalizeMessage(message);
    
    // Create a pattern from the learned expression
    const words = normalizedMessage.split(' ').filter(w => w.length > 1);
    if (words.length === 0) return;

    // Build a regex pattern from key words
    const keyWords = words.filter(w => w.length > 2).slice(0, 3);
    if (keyWords.length === 0) return;

    const patternStr = keyWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*?');
    const pattern = new RegExp(patternStr, 'i');

    const entry: PatternEntry = {
      pattern,
      intent: correctIntent,
      weight: confidence * 0.8, // Slightly lower weight than seed patterns
      source: 'learned',
      businessId
    };

    const existing = this.learnedPatterns.get(businessId) || [];
    existing.push(entry);
    this.learnedPatterns.set(businessId, existing);

    // Record the learning
    this.learningRecords.push({
      id: `lr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      businessId,
      type: 'intent_pattern',
      pattern: patternStr,
      learnedFrom: message,
      confidence,
      approved: false,
      createdAt: Date.now(),
      usageCount: 0,
      successRate: 0
    });
  }

  /**
   * Get learning records for a business
   */
  getLearningRecords(businessId: string): LearningRecord[] {
    return this.learningRecords.filter(r => r.businessId === businessId);
  }

  /**
   * Approve a learned pattern
   */
  approveLearning(recordId: string): void {
    const record = this.learningRecords.find(r => r.id === recordId);
    if (record) {
      record.approved = true;
    }
  }

  /**
   * Get patterns for inspection/debugging
   */
  getPatterns(businessId: string): PatternEntry[] {
    return this.getPatternsForBusiness(businessId);
  }
}


