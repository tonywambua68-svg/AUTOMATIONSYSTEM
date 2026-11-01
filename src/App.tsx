import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationEngine } from './engine/ConversationEngine';
import { Business, Product, LearningInsight } from './types';
import { runAllTests } from './tests/engineTests';

// Demo data
const DEMO_BUSINESS: Business = {
  id: 'biz_laptech',
  name: 'LAPTECH',
  currency: 'USD',
  workflow: {
    steps: [
      { id: 'step_1', name: 'Welcome', trigger: 'first_message', action: 'greet', priority: 1 },
      { id: 'step_2', name: 'Product Help', trigger: 'product_query', action: 'search_catalogue', priority: 5 },
      { id: 'step_3', name: 'Order', trigger: 'purchase_intent', action: 'initiate_order', priority: 10 }
    ],
    autoResponses: [],
    handoffEnabled: true,
    handoffTrigger: 'human'
  }
};

const DEMO_PRODUCTS: Product[] = [
  {
    id: 'prod_001', businessId: 'biz_laptech', name: 'iPhone 15 Pro',
    category: 'phones', description: 'Latest iPhone with A17 Pro chip, titanium design, and advanced camera system',
    price: 999, currency: 'USD', inStock: true, stockQuantity: 12, tags: ['apple', 'smartphone', 'premium']
  },
  {
    id: 'prod_002', businessId: 'biz_laptech', name: 'Samsung Galaxy S24',
    category: 'phones', description: 'Flagship Android phone with AI features and stunning display',
    price: 799, currency: 'USD', inStock: true, stockQuantity: 18, tags: ['samsung', 'smartphone', 'android']
  },
  {
    id: 'prod_003', businessId: 'biz_laptech', name: 'Google Pixel 8',
    category: 'phones', description: 'Pure Android experience with exceptional camera and AI capabilities',
    price: 599, currency: 'USD', inStock: true, stockQuantity: 8, tags: ['google', 'smartphone', 'camera']
  },
  {
    id: 'prod_004', businessId: 'biz_laptech', name: 'MacBook Pro 14"',
    category: 'laptops', description: 'Professional laptop with M3 Pro chip, Liquid Retina XDR display',
    price: 1999, currency: 'USD', inStock: true, stockQuantity: 5, tags: ['apple', 'laptop', 'professional']
  },
  {
    id: 'prod_005', businessId: 'biz_laptech', name: 'Dell XPS 15',
    category: 'laptops', description: 'Premium Windows laptop with OLED display and powerful performance',
    price: 1499, currency: 'USD', inStock: true, stockQuantity: 7, tags: ['dell', 'laptop', 'windows']
  },
  {
    id: 'prod_006', businessId: 'biz_laptech', name: 'Lenovo ThinkPad X1',
    category: 'laptops', description: 'Business laptop known for durability and excellent keyboard',
    price: 1299, currency: 'USD', inStock: true, stockQuantity: 10, tags: ['lenovo', 'laptop', 'business']
  },
  {
    id: 'prod_007', businessId: 'biz_laptech', name: 'AirPods Pro 2',
    category: 'accessories', description: 'Premium wireless earbuds with active noise cancellation',
    price: 249, currency: 'USD', inStock: true, stockQuantity: 25, tags: ['apple', 'audio', 'wireless']
  },
  {
    id: 'prod_008', businessId: 'biz_laptech', name: 'Samsung Galaxy Buds',
    category: 'accessories', description: 'Wireless earbuds with immersive sound and comfortable fit',
    price: 149, currency: 'USD', inStock: true, stockQuantity: 30, tags: ['samsung', 'audio', 'wireless']
  }
];

interface Message {
  id: string;
  sender: 'customer' | 'business';
  content: string;
  timestamp: number;
  intent?: string;
}

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

export default function App() {
  const [engine] = useState(() => {
    const e = new ConversationEngine();
    e.registerBusiness(DEMO_BUSINESS, DEMO_PRODUCTS);
    return e;
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'tests' | 'learning' | 'catalogue' | 'report'>('chat');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const customerMessage: Message = {
      id: `msg_${Date.now()}`,
      sender: 'customer',
      content: inputValue.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, customerMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate processing delay
    setTimeout(() => {
      const response = engine.processMessage(DEMO_BUSINESS.id, '+1234567890', inputValue.trim());
      
      const businessMessage: Message = {
        id: `msg_${Date.now()}_resp`,
        sender: 'business',
        content: response.content,
        timestamp: Date.now(),
        intent: response.intent
      };

      setMessages(prev => [...prev, businessMessage]);
      setIsTyping(false);

      // Update insights
      setInsights(engine.getLearningInsights(DEMO_BUSINESS.id));
    }, 600);
  };

  const handleRunTests = () => {
    const results = runAllTests();
    setTestResults(results);
  };

  const handleApproveInsight = (insightId: string) => {
    engine.approveInsight(DEMO_BUSINESS.id, insightId);
    setInsights(engine.getLearningInsights(DEMO_BUSINESS.id));
  };

  const handleRejectInsight = (insightId: string) => {
    engine.rejectInsight(DEMO_BUSINESS.id, insightId);
    setInsights(engine.getLearningInsights(DEMO_BUSINESS.id));
  };

  const handleResetConversation = () => {
    engine.resetConversation(DEMO_BUSINESS.id, '+1234567890');
    setMessages([]);
  };

  const passedTests = testResults.filter(t => t.passed).length;
  const totalTests = testResults.length;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">
              CE
            </div>
            <div>
              <h1 className="text-xl font-bold">Conversation Engine</h1>
              <p className="text-xs text-gray-400">Intelligent Business Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-green-900/50 text-green-400 rounded-full text-xs font-medium">
              {DEMO_BUSINESS.name}
            </span>
            <span className="px-3 py-1 bg-blue-900/50 text-blue-400 rounded-full text-xs font-medium">
              {DEMO_PRODUCTS.length} products
            </span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-gray-800/50 border-b border-gray-700 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {[
            { id: 'chat', label: '💬 Live Demo', },
            { id: 'tests', label: '🧪 Tests' },
            { id: 'learning', label: '🧠 Learning' },
            { id: 'catalogue', label: '📦 Catalogue' },
            { id: 'report', label: '📋 Report' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-green-400 text-green-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-200px)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Conversation Demo</h2>
              <button
                onClick={handleResetConversation}
                className="px-3 py-1.5 bg-red-900/50 text-red-400 rounded-lg text-sm hover:bg-red-900/70 transition-colors"
              >
                Reset Conversation
              </button>
            </div>
            
            {/* Messages */}
            <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-12">
                  <p className="text-4xl mb-3">💬</p>
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="text-sm mt-1">Try: "hello", "I'm looking for a phone", "Can I get a laptop?"</p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    msg.sender === 'customer'
                      ? 'bg-green-600 text-white rounded-br-md'
                      : 'bg-gray-700 text-gray-100 rounded-bl-md'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.intent && (
                      <p className="text-[10px] mt-1 opacity-60">intent: {msg.intent}</p>
                    )}
                    <p className="text-[10px] mt-0.5 opacity-40">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="px-6 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>

            {/* Quick test messages */}
            <div className="mt-3 flex flex-wrap gap-2">
              {['hello', 'Am looking for a phone', 'Can i get a laptop', 'Ok tell me more about the alternatives', 'I want it can i get it', 'that is expensive', 'show me something cheaper', 'thank you bye'].map(msg => (
                <button
                  key={msg}
                  onClick={() => { setInputValue(msg); }}
                  className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-300 hover:border-green-500 hover:text-green-400 transition-colors"
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tests Tab */}
        {activeTab === 'tests' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Regression Tests (15 Scenarios)</h2>
              <button
                onClick={handleRunTests}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
              >
                {testResults.length > 0 ? 'Re-run Tests' : 'Run All Tests'}
              </button>
            </div>

            {testResults.length > 0 && (
              <div className="mb-4 p-4 bg-gray-800 rounded-xl border border-gray-700">
                <div className="flex items-center gap-4">
                  <div className={`text-3xl font-bold ${passedTests === totalTests ? 'text-green-400' : 'text-yellow-400'}`}>
                    {passedTests}/{totalTests}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {passedTests === totalTests ? '✅ All tests passed!' : '⚠️ Some tests failed'}
                    </p>
                    <div className="w-48 h-2 bg-gray-700 rounded-full mt-1">
                      <div 
                        className={`h-full rounded-full transition-all ${passedTests === totalTests ? 'bg-green-500' : 'bg-yellow-500'}`}
                        style={{ width: `${(passedTests / totalTests) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {testResults.map((result, i) => (
                <div key={i} className={`p-4 rounded-xl border ${
                  result.passed ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'
                }`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{result.passed ? '✅' : '❌'}</span>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{result.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{result.details}</p>
                      {result.error && (
                        <p className="text-xs text-red-400 mt-1">Error: {result.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {testResults.length === 0 && (
              <div className="text-center text-gray-500 py-12">
                <p className="text-4xl mb-3">🧪</p>
                <p className="text-lg font-medium">Click "Run All Tests" to verify the engine</p>
                <p className="text-sm mt-1">Tests cover all 15 regression scenarios</p>
              </div>
            )}
          </div>
        )}

        {/* Learning Tab */}
        {activeTab === 'learning' && (
          <div>
            <h2 className="text-lg font-semibold mb-6">Learning & Insights</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Total Insights</h3>
                <p className="text-3xl font-bold text-blue-400">{insights.length}</p>
              </div>
              <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Pending Approval</h3>
                <p className="text-3xl font-bold text-yellow-400">
                  {insights.filter(i => !i.approved).length}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {insights.length === 0 && (
                <div className="text-center text-gray-500 py-12">
                  <p className="text-4xl mb-3">🧠</p>
                  <p className="text-lg font-medium">No insights yet</p>
                  <p className="text-sm mt-1">Have a conversation in the chat to generate learning insights</p>
                </div>
              )}
              {insights.map(insight => (
                <div key={insight.id} className={`p-4 rounded-xl border ${
                  insight.approved ? 'bg-green-900/20 border-green-800' : 'bg-yellow-900/20 border-yellow-800'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          insight.category === 'communication' ? 'bg-purple-900/50 text-purple-300' :
                          insight.category === 'intent' ? 'bg-blue-900/50 text-blue-300' :
                          insight.category === 'knowledge' ? 'bg-orange-900/50 text-orange-300' :
                          'bg-teal-900/50 text-teal-300'
                        }`}>
                          {insight.category}
                        </span>
                        {insight.approved && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-900/50 text-green-300">
                            approved
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{insight.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{insight.suggestion}</p>
                      {insight.evidence.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] text-gray-500 uppercase font-medium">Evidence:</p>
                          {insight.evidence.slice(0, 3).map((ev, i) => (
                            <p key={i} className="text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded">
                              "{ev}"
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    {!insight.approved && (
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleApproveInsight(insight.id)}
                          className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs font-medium transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectInsight(insight.id)}
                          className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded text-xs font-medium transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Catalogue Tab */}
        {activeTab === 'catalogue' && (
          <div>
            <h2 className="text-lg font-semibold mb-6">Product Catalogue ({DEMO_BUSINESS.name})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DEMO_PRODUCTS.map(product => (
                <div key={product.id} className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{product.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">{product.description}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      product.inStock ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                    }`}>
                      {product.inStock ? 'In Stock' : 'Out'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-lg font-bold text-green-400">
                      {product.currency} {product.price.toLocaleString()}
                    </p>
                    <div className="flex gap-1">
                      {product.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">Category: {product.category} | Stock: {product.stockQuantity}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Report Tab */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Delivery Report</h2>
            
            <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
              <h3 className="font-medium text-green-400">Root Causes Identified & Fixed</h3>
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium text-yellow-400">1. Product enquiries swallowed by greeting automation</p>
                  <p className="text-gray-400 mt-1">The engine was classifying "Am looking for a phone" as a greeting because the intent classifier's greeting patterns matched before product enquiry patterns. <strong className="text-white">Fix:</strong> Added context-aware classification that checks for product references even in messages starting with greeting words.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium text-yellow-400">2. Wrong product returned (phone for laptop query)</p>
                  <p className="text-gray-400 mt-1">The product matcher was not properly filtering by category. The fuzzy matching was too broad. <strong className="text-white">Fix:</strong> Improved category-weighted scoring in ProductMatcher so category match has 35% weight and name match has 40%.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium text-yellow-400">3. Repeated identical responses</p>
                  <p className="text-gray-400 mt-1">The response generator was cycling through the same templates. <strong className="text-white">Fix:</strong> Added template tracking per conversation to avoid repetition, and added a repetition detection check before sending.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium text-yellow-400">4. "Tell me about alternatives" returned no response</p>
                  <p className="text-gray-400 mt-1">The context manager wasn't properly storing and retrieving last product results. <strong className="text-white">Fix:</strong> Added explicit product result storage in ContextManager and proper retrieval in alternative handling.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium text-yellow-400">5. Purchase intent not recognized</p>
                  <p className="text-gray-400 mt-1">The intent classifier didn't have patterns for "I want it can I get it". <strong className="text-white">Fix:</strong> Added comprehensive purchase intent patterns including "can i get", "i want it", "i'll take it".</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
              <h3 className="font-medium text-blue-400">Architecture</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium">IntentClassifier</p>
                  <p className="text-gray-400 mt-1">Pattern-based classification with learned patterns. No hardcoded product/business terms. Supports tenant-specific learning.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium">ContextManager</p>
                  <p className="text-gray-400 mt-1">Tenant-isolated conversation memory. Tracks product results, intent history, and topic progression per conversation.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium">ProductMatcher</p>
                  <p className="text-gray-400 mt-1">Fuzzy search with category weighting. Only returns products from the correct business. Never fabricates products.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium">ResponseGenerator</p>
                  <p className="text-gray-400 mt-1">Template-based with variation. Uses actual business data. Tracks used templates to avoid repetition.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium">LearningEngine</p>
                  <p className="text-gray-400 mt-1">Analyzes conversations for patterns, gaps, and quality issues. Tenant-isolated. Requires approval for business fact changes.</p>
                </div>
                <div className="p-3 bg-gray-900/50 rounded-lg">
                  <p className="font-medium">ConversationEngine</p>
                  <p className="text-gray-400 mt-1">Orchestrates all components. Enforces workflow priority, tenant isolation, and repetition prevention.</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
              <h3 className="font-medium text-purple-400">Files Changed</h3>
              <div className="text-sm space-y-1 text-gray-300">
                <p>• <code className="text-green-400">src/types/index.ts</code> — Core type definitions</p>
                <p>• <code className="text-green-400">src/engine/IntentClassifier.ts</code> — Natural language intent classification</p>
                <p>• <code className="text-green-400">src/engine/ContextManager.ts</code> — Conversation memory & context</p>
                <p>• <code className="text-green-400">src/engine/ProductMatcher.ts</code> — Catalogue search with fuzzy matching</p>
                <p>• <code className="text-green-400">src/engine/ResponseGenerator.ts</code> — Natural response generation</p>
                <p>• <code className="text-green-400">src/engine/LearningEngine.ts</code> — Conversation learning & analysis</p>
                <p>• <code className="text-green-400">src/engine/ConversationEngine.ts</code> — Main orchestrator</p>
                <p>• <code className="text-green-400">src/tests/engineTests.ts</code> — 15 regression tests</p>
                <p>• <code className="text-green-400">src/App.tsx</code> — Demo interface</p>
              </div>
            </div>

            <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
              <h3 className="font-medium text-orange-400">Regarding the 100000 USD Response</h3>
              <div className="text-sm text-gray-300 space-y-2">
                <p>In this demo environment, the product catalogue is defined in the application with realistic prices. The original 100000 USD issue was caused by:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>The product matcher returning a wrong-category product (phone instead of laptop)</li>
                  <li>Potential stale session context mixing results from different requests</li>
                  <li>The engine not validating that returned products match the query category</li>
                </ul>
                <p className="text-white font-medium mt-2">Fix applied:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>Category-weighted scoring ensures correct category matches rank highest</li>
                  <li>Each search is scoped to the current request, no stale results</li>
                  <li>Tenant isolation prevents cross-business data leakage</li>
                </ul>
              </div>
            </div>

            <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
              <h3 className="font-medium text-cyan-400">Requires Live WhatsApp Verification</h3>
              <div className="text-sm text-gray-300 space-y-2">
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>Message delivery timing and rate limiting</li>
                  <li>WhatsApp Business API webhook integration</li>
                  <li>Multi-concurrent conversation handling</li>
                  <li>Media message handling (images, documents)</li>
                  <li>Message template compliance for initiated conversations</li>
                  <li>Session window management (24-hour WhatsApp rule)</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
