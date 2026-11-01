// Core types for the conversation engine

export interface Business {
  id: string;
  name: string;
  currency: string;
  greetingMessage?: string;
  workflow: WorkflowConfig;
}

export interface WorkflowConfig {
  steps: WorkflowStep[];
  autoResponses: AutoResponse[];
  handoffEnabled: boolean;
  handoffTrigger: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  trigger: string;
  action: string;
  priority: number;
}

export interface AutoResponse {
  id: string;
  trigger: string;
  response: string;
  priority: number;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  category: string;
  description: string;
  price: number;
  currency: string;
  inStock: boolean;
  stockQuantity: number;
  tags: string[];
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  businessId: string;
  sender: 'customer' | 'business';
  content: string;
  timestamp: number;
  intent?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  businessId: string;
  customerPhone: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  status: 'active' | 'completed' | 'handed_off';
  createdAt: number;
  updatedAt: number;
}

export interface ConversationContext {
  lastProductResults?: Product[];
  selectedProduct?: Product;
  intentHistory: string[];
  purchaseIntentDetected: boolean;
  lastResponseId?: string;
  topicHistory: string[];
  customerName?: string;
  pendingAction?: string;
}

export interface Intent {
  type: IntentType;
  confidence: number;
  entities: Record<string, string>;
  rawMessage: string;
}

export type IntentType =
  | 'greeting'
  | 'product_enquiry'
  | 'product_comparison'
  | 'alternative_request'
  | 'purchase_intent'
  | 'order_initiation'
  | 'price_negotiation'
  | 'clarification'
  | 'follow_up'
  | 'complaint'
  | 'handoff_request'
  | 'farewell'
  | 'unknown';

export interface GeneratedResponse {
  content: string;
  intent: IntentType;
  confidence: number;
  products?: Product[];
  nextExpectedAction?: string;
  metadata?: Record<string, any>;
}

export interface LearningRecord {
  id: string;
  businessId: string;
  type: 'intent_pattern' | 'response_quality' | 'customer_expression' | 'knowledge_gap';
  pattern: string;
  learnedFrom: string;
  confidence: number;
  approved: boolean;
  createdAt: number;
  usageCount: number;
  successRate: number;
}

export interface LearningInsight {
  id: string;
  businessId: string;
  category: 'communication' | 'intent' | 'knowledge' | 'workflow';
  description: string;
  suggestion: string;
  evidence: string[];
  approved: boolean;
  createdAt: number;
}

export interface EngineConfig {
  maxContextMessages: number;
  minConfidenceForAction: number;
  learningEnabled: boolean;
  autoApproveCommunication: boolean;
  requireApprovalForBusinessFacts: boolean;
}
