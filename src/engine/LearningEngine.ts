import { Conversation, LearningInsight, LearningRecord, ConversationMessage, IntentType } from '../types';
import { IntentClassifier } from './IntentClassifier';

/**
 * LearningEngine - Analyzes conversations to improve assistant quality
 * 
 * Learning categories:
 * 1. Communication learning — how to respond more naturally
 * 2. Intent learning — how customers express different requests
 * 3. Business knowledge — identifies gaps (requires approval)
 * 4. Workflow learning — process improvements (requires approval)
 * 
 * Safety rules:
 * - Learning is tenant-specific (business isolation)
 * - Customer privacy protected
 * - Business facts require owner approval
 * - Audit trail maintained
 * - No single conversation can permanently change behavior
 */

export class LearningEngine {
  private insights: Map<string, LearningInsight[]> = new Map(); // businessId -> insights
  private records: Map<string, LearningRecord[]> = new Map(); // businessId -> records
  private conversationStats: Map<string, ConversationStats> = new Map(); // businessId -> stats
  private intentClassifier: IntentClassifier;

  constructor(intentClassifier: IntentClassifier) {
    this.intentClassifier = intentClassifier;
  }

  /**
   * Analyze a completed or ongoing conversation for learning opportunities
   */
  analyzeConversation(conversation: Conversation): LearningInsight[] {
    const businessId = conversation.businessId;
    const newInsights: LearningInsight[] = [];

    // 1. Analyze intent patterns
    const intentInsights = this.analyzeIntentPatterns(conversation);
    newInsights.push(...intentInsights);

    // 2. Analyze response quality
    const qualityInsights = this.analyzeResponseQuality(conversation);
    newInsights.push(...qualityInsights);

    // 3. Identify knowledge gaps
    const gapInsights = this.identifyKnowledgeGaps(conversation);
    newInsights.push(...gapInsights);

    // 4. Analyze customer expressions
    const expressionInsights = this.analyzeCustomerExpressions(conversation);
    newInsights.push(...expressionInsights);

    // 5. Detect conversation flow issues
    const flowInsights = this.analyzeConversationFlow(conversation);
    newInsights.push(...flowInsights);

    // Store insights (tenant-isolated)
    const existing = this.insights.get(businessId) || [];
    existing.push(...newInsights);
    this.insights.set(businessId, existing);

    // Update stats
    this.updateStats(businessId, conversation);

    return newInsights;
  }

  /**
   * Analyze intent patterns - learn how customers express different intentions
   */
  private analyzeIntentPatterns(conversation: Conversation): LearningInsight[] {
    const insights: LearningInsight[] = [];
    const customerMessages = conversation.messages.filter(m => m.sender === 'customer');

    // Look for patterns in how customers express purchase intent
    const purchaseMessages = customerMessages.filter(m => {
      const content = m.content.toLowerCase();
      return content.includes('want') || content.includes('buy') || 
             content.includes('get') || content.includes('take') ||
             content.includes('order') || content.includes('purchase');
    });

    if (purchaseMessages.length > 0) {
      const expressions = purchaseMessages.map(m => m.content);
      insights.push({
        id: `ins_${Date.now()}_intent`,
        businessId: conversation.businessId,
        category: 'intent',
        description: 'Customer purchase expression patterns identified',
        suggestion: 'Update intent classifier to recognize these purchase expressions',
        evidence: expressions.slice(0, 5),
        approved: false,
        createdAt: Date.now()
      });
    }

    return insights;
  }

  /**
   * Analyze response quality - identify unhelpful or repeated responses
   */
  private analyzeResponseQuality(conversation: Conversation): LearningInsight[] {
    const insights: LearningInsight[] = [];
    const businessMessages = conversation.messages.filter(m => m.sender === 'business');

    // Check for repeated responses
    const responseTexts = businessMessages.map(m => m.content);
    const duplicates = this.findDuplicates(responseTexts);

    if (duplicates.length > 0) {
      insights.push({
        id: `ins_${Date.now()}_quality`,
        businessId: conversation.businessId,
        category: 'communication',
        description: 'Repeated responses detected in conversation',
        suggestion: 'Improve response variation to avoid repeating the same message',
        evidence: duplicates,
        approved: false,
        createdAt: Date.now()
      });
    }

    // Check for very short or empty responses
    const shortResponses = businessMessages.filter(m => m.content.length < 10);
    if (shortResponses.length > 0) {
      insights.push({
        id: `ins_${Date.now()}_short`,
        businessId: conversation.businessId,
        category: 'communication',
        description: 'Very short responses may not be helpful',
        suggestion: 'Ensure responses provide sufficient information to move the conversation forward',
        evidence: shortResponses.map(m => m.content),
        approved: false,
        createdAt: Date.now()
      });
    }

    return insights;
  }

  /**
   * Identify knowledge gaps - areas where the assistant couldn't help
   */
  private identifyKnowledgeGaps(conversation: Conversation): LearningInsight[] {
    const insights: LearningInsight[] = [];
    const customerMessages = conversation.messages.filter(m => m.sender === 'customer');
    const businessMessages = conversation.messages.filter(m => m.sender === 'business');

    // Look for patterns where customer asks something and gets "unknown" response
    for (let i = 0; i < customerMessages.length; i++) {
      const customerMsg = customerMessages[i];
      const nextBusinessMsg = businessMessages.find(m => m.timestamp > customerMsg.timestamp);
      
      if (nextBusinessMsg && nextBusinessMsg.intent === 'unknown') {
        insights.push({
          id: `ins_${Date.now()}_gap`,
          businessId: conversation.businessId,
          category: 'knowledge',
          description: 'Assistant unable to handle customer query',
          suggestion: `Review this query type: "${customerMsg.content.substring(0, 100)}"`,
          evidence: [customerMsg.content, nextBusinessMsg.content],
          approved: false,
          createdAt: Date.now()
        });
      }
    }

    return insights;
  }

  /**
   * Analyze customer expressions - learn different ways customers say things
   */
  private analyzeCustomerExpressions(conversation: Conversation): LearningInsight[] {
    const insights: LearningInsight[] = [];
    const customerMessages = conversation.messages.filter(m => m.sender === 'customer');

    // Group messages by detected intent
    const intentGroups: Map<string, string[]> = new Map();
    
    for (const msg of customerMessages) {
      const intent = msg.intent || 'unknown';
      const group = intentGroups.get(intent) || [];
      group.push(msg.content);
      intentGroups.set(intent, group);
    }

    // For each intent with multiple expressions, create a learning record
    for (const [intent, expressions] of intentGroups) {
      if (expressions.length >= 2 && intent !== 'unknown') {
        insights.push({
          id: `ins_${Date.now()}_expr`,
          businessId: conversation.businessId,
          category: 'intent',
          description: `Multiple expressions for "${intent}" intent detected`,
          suggestion: 'These variations can improve intent recognition',
          evidence: expressions.slice(0, 5),
          approved: false,
          createdAt: Date.now()
        });
      }
    }

    return insights;
  }

  /**
   * Analyze conversation flow - detect issues in conversation progression
   */
  private analyzeConversationFlow(conversation: Conversation): LearningInsight[] {
    const insights: LearningInsight[] = [];
    const messages = conversation.messages;

    // Detect greeting repetition (customer sends product enquiry but gets greeting again)
    for (let i = 1; i < messages.length; i++) {
      const prevMsg = messages[i - 1];
      const currMsg = messages[i];

      if (prevMsg.sender === 'business' && currMsg.sender === 'customer') {
        // If customer asked about products but got a greeting-like response
        const customerIntent = currMsg.intent;
        const prevResponse = prevMsg.content.toLowerCase();
        
        if (customerIntent === 'product_enquiry' && 
            (prevResponse.startsWith('hi') || prevResponse.startsWith('hello') || prevResponse.startsWith('welcome'))) {
          insights.push({
            id: `ins_${Date.now()}_flow`,
            businessId: conversation.businessId,
            category: 'workflow',
            description: 'Greeting response sent instead of addressing product enquiry',
            suggestion: 'Ensure product enquiries are not swallowed by greeting automation',
            evidence: [prevMsg.content, currMsg.content],
            approved: false,
            createdAt: Date.now()
          });
        }
      }
    }

    return insights;
  }

  /**
   * Find duplicate strings in an array
   */
  private findDuplicates(strings: string[]): string[] {
    const seen = new Map<string, number>();
    const duplicates: string[] = [];

    for (const str of strings) {
      const count = seen.get(str) || 0;
      if (count === 1) {
        duplicates.push(str);
      }
      seen.set(str, count + 1);
    }

    return duplicates;
  }

  /**
   * Update conversation statistics for a business
   */
  private updateStats(businessId: string, conversation: Conversation): void {
    const stats = this.conversationStats.get(businessId) || {
      totalConversations: 0,
      totalMessages: 0,
      avgMessagesPerConversation: 0,
      intentDistribution: {} as Record<string, number>,
      repeatedResponses: 0,
      successfulConversations: 0,
      handoffs: 0
    };

    stats.totalConversations++;
    stats.totalMessages += conversation.messages.length;
    stats.avgMessagesPerConversation = stats.totalMessages / stats.totalConversations;

    if (conversation.status === 'handed_off') stats.handoffs++;
    if (conversation.status === 'completed') stats.successfulConversations++;

    // Update intent distribution
    for (const msg of conversation.messages) {
      if (msg.sender === 'customer' && msg.intent) {
        stats.intentDistribution[msg.intent] = (stats.intentDistribution[msg.intent] || 0) + 1;
      }
    }

    this.conversationStats.set(businessId, stats);
  }

  /**
   * Get insights for a business (tenant-isolated)
   */
  getInsights(businessId: string): LearningInsight[] {
    return this.insights.get(businessId) || [];
  }

  /**
   * Get unapproved insights for review
   */
  getUnapprovedInsights(businessId: string): LearningInsight[] {
    return this.getInsights(businessId).filter(i => !i.approved);
  }

  /**
   * Approve an insight (business owner action)
   */
  approveInsight(businessId: string, insightId: string): boolean {
    const insights = this.insights.get(businessId);
    if (!insights) return false;

    const insight = insights.find(i => i.id === insightId);
    if (!insight) return false;

    insight.approved = true;

    // If it's an intent learning, apply it to the classifier
    if (insight.category === 'intent' && insight.evidence.length > 0) {
      for (const expression of insight.evidence) {
        // Determine the intent type from the description
        const intentMatch = insight.description.match(/"(\w+)"/);
        if (intentMatch) {
          this.intentClassifier.learnPattern(
            businessId,
            expression,
            intentMatch[1] as IntentType,
            0.7
          );
        }
      }
    }

    return true;
  }

  /**
   * Reject an insight
   */
  rejectInsight(businessId: string, insightId: string): boolean {
    const insights = this.insights.get(businessId);
    if (!insights) return false;

    const index = insights.findIndex(i => i.id === insightId);
    if (index === -1) return false;

    insights.splice(index, 1);
    return true;
  }

  /**
   * Get conversation statistics for a business
   */
  getStats(businessId: string): ConversationStats | undefined {
    return this.conversationStats.get(businessId);
  }

  /**
   * Verify tenant isolation - ensure insights belong to correct business
   */
  verifyTenantIsolation(businessId: string, insightId: string): boolean {
    const insights = this.insights.get(businessId);
    if (!insights) return false;
    return insights.some(i => i.id === insightId && i.businessId === businessId);
  }

  /**
   * Get learning records for a business
   */
  getRecords(businessId: string): LearningRecord[] {
    return this.records.get(businessId) || [];
  }

  /**
   * Batch analyze multiple conversations
   */
  batchAnalyze(conversations: Conversation[]): LearningInsight[] {
    const allInsights: LearningInsight[] = [];
    for (const conv of conversations) {
      const insights = this.analyzeConversation(conv);
      allInsights.push(...insights);
    }
    return allInsights;
  }
}

interface ConversationStats {
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
  intentDistribution: Record<string, number>;
  repeatedResponses: number;
  successfulConversations: number;
  handoffs: number;
}
