import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationEngine } from './engine/ConversationEngine';
import { DatabaseService } from './services/databaseService';
import { WhatsAppAdapter } from './services/whatsappAdapter';
import { Business, Product, LearningInsight } from './types';
import { runAllTests } from './tests/engineTests';
import { runIntegrationTests } from './tests/integrationTests';

// Demo data
const DEMO_BUSINESS: Business = {
  id: 'biz_laptech',
  name: 'LAPTECH',
  currency: 'USD',
  workflow: {
    steps: [],
    autoResponses: [],
    handoffEnabled: true,
    handoffTrigger: 'human'
  }
};

const DEMO_PRODUCTS: Product[] = [
  { id: 'prod_001', businessId: 'biz_laptech', name: 'iPhone 15 Pro', category: 'phones', description: 'Latest iPhone with A17 Pro chip', price: 999, currency: 'USD', inStock: true, stockQuantity: 12, tags: ['apple', 'smartphone'] },
  { id: 'prod_002', businessId: 'biz_laptech', name: 'Samsung Galaxy S24', category: 'phones', description: 'Flagship Android with AI features', price: 799, currency: 'USD', inStock: true, stockQuantity: 18, tags: ['samsung', 'android'] },
  { id: 'prod_003', businessId: 'biz_laptech', name: 'Google Pixel 8', category: 'phones', description: 'Pure Android with exceptional camera', price: 599, currency: 'USD', inStock: true, stockQuantity: 8, tags: ['google', 'camera'] },
  { id: 'prod_004', businessId: 'biz_laptech', name: 'MacBook Pro 14"', category: 'laptops', description: 'Professional laptop with M3 Pro chip', price: 1999, currency: 'USD', inStock: true, stockQuantity: 5, tags: ['apple', 'professional'] },
  { id: 'prod_005', businessId: 'biz_laptech', name: 'Dell XPS 15', category: 'laptops', description: 'Premium Windows laptop with OLED', price: 1499, currency: 'USD', inStock: true, stockQuantity: 7, tags: ['dell', 'windows'] },
  { id: 'prod_006', businessId: 'biz_laptech', name: 'Lenovo ThinkPad X1', category: 'laptops', description: 'Business laptop with excellent keyboard', price: 1299, currency: 'USD', inStock: true, stockQuantity: 10, tags: ['lenovo', 'business'] },
  { id: 'prod_007', businessId: 'biz_laptech', name: 'AirPods Pro 2', category: 'accessories', description: 'Wireless earbuds with noise cancellation', price: 249, currency: 'USD', inStock: true, stockQuantity: 25, tags: ['apple', 'audio'] },
  { id: 'prod_008', businessId: 'biz_laptech', name: 'Samsung Galaxy Buds', category: 'accessories', description: 'Wireless earbuds with immersive sound', price: 149, currency: 'USD', inStock: true, stockQuantity: 30, tags: ['samsung', 'audio'] }
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
  category?: string;
}

export default function App() {
  const [engine] = useState(() => {
    const e = new ConversationEngine();
    e.registerBusiness(DEMO_BUSINESS, DEMO_PRODUCTS);
    return e;
  });

  const [db] = useState(() => new DatabaseService());
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'tests' | 'integration' | 'learning' | 'status' | 'report'>('chat');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [integrationResults, setIntegrationResults] = useState<TestResult[]>([]);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [runningIntegration, setRunningIntegration] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    const customerMessage: Message = { id: `msg_${Date.now()}`, sender: 'customer', content: inputValue.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, customerMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const response = engine.processMessage(DEMO_BUSINESS.id, '+1234567890', inputValue.trim());
      const businessMessage: Message = { id: `msg_${Date.now()}_r`, sender: 'business', content: response.content, timestamp: Date.now(), intent: response.intent };
      setMessages(prev => [...prev, businessMessage]);
      setIsTyping(false);
      setInsights(engine.getLearningInsights(DEMO_BUSINESS.id));
    }, 500);
  };

  const handleRunTests = () => { setTestResults(runAllTests()); };

  const handleRunIntegration = async () => {
    setRunningIntegration(true);
    const results = await runIntegrationTests();
    setIntegrationResults(results);
    setRunningIntegration(false);
  };

  const passedTests = testResults.filter(t => t.passed).length;
  const passedIntegration = integrationResults.filter(t => t.passed).length;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-green-400 to-blue-500 rounded-lg flex items-center justify-center font-bold text-xs">CE</div>
            <div>
              <h1 className="text-lg font-bold">Conversation Engine</h1>
              <p className="text-[10px] text-gray-400">WhatsApp Business Assistant — Integration Layer</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${db.isPersistent() ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
              {db.isPersistent() ? '● Persistent' : '○ In-Memory'}
            </span>
            <span className="px-2 py-1 bg-blue-900/50 text-blue-400 rounded-full text-[10px] font-medium">
              {DEMO_PRODUCTS.length} products
            </span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-gray-800/50 border-b border-gray-700 px-4 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex gap-1 min-w-max">
          {[
            { id: 'chat', label: '💬 Demo' },
            { id: 'tests', label: '🧪 Engine Tests' },
            { id: 'integration', label: '🔗 Integration' },
            { id: 'learning', label: '🧠 Learning' },
            { id: 'status', label: '📊 Status' },
            { id: 'report', label: '📋 Report' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-green-400 text-green-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4">
        {/* Chat Demo */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Live Demo (In-Memory)</h2>
              <button onClick={() => { engine.resetConversation(DEMO_BUSINESS.id, '+1234567890'); setMessages([]); }}
                className="px-2 py-1 bg-red-900/50 text-red-400 rounded text-xs hover:bg-red-900/70">Reset</button>
            </div>
            <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <p className="text-3xl mb-2">💬</p>
                  <p className="text-sm font-medium">Try the conversation from the bug report</p>
                  <p className="text-xs mt-1">"hello" → "Am looking for a phone" → "Can i get a laptop"</p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${msg.sender === 'customer' ? 'bg-green-600 rounded-br-md' : 'bg-gray-700 rounded-bl-md'}`}>
                    <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                    {msg.intent && <p className="text-[9px] mt-0.5 opacity-50">intent: {msg.intent}</p>}
                  </div>
                </div>
              ))}
              {isTyping && <div className="flex justify-start"><div className="bg-gray-700 rounded-2xl rounded-bl-md px-3 py-2"><div className="flex gap-1"><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}></span><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}></span></div></div></div>}
              <div ref={messagesEndRef} />
            </div>
            <div className="mt-3 flex gap-2">
              <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..." className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-500" />
              <button onClick={handleSendMessage} disabled={!inputValue.trim()}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 rounded-xl text-xs font-medium">Send</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {['hello', 'Am looking for a phone', 'Can i get a laptop', 'Ok tell me more about the alternatives', 'I want it can i get it', 'that is expensive'].map(msg => (
                <button key={msg} onClick={() => setInputValue(msg)}
                  className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-300 hover:border-green-500">{msg}</button>
              ))}
            </div>
          </div>
        )}

        {/* Engine Tests */}
        {activeTab === 'tests' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Engine Unit Tests (15 Scenarios)</h2>
              <button onClick={handleRunTests} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium">
                {testResults.length > 0 ? 'Re-run' : 'Run Tests'}
              </button>
            </div>
            {testResults.length > 0 && (
              <div className="mb-3 p-3 bg-gray-800 rounded-xl border border-gray-700 flex items-center gap-3">
                <div className={`text-2xl font-bold ${passedTests === testResults.length ? 'text-green-400' : 'text-yellow-400'}`}>{passedTests}/{testResults.length}</div>
                <div className="flex-1"><div className="w-full h-2 bg-gray-700 rounded-full"><div className={`h-full rounded-full ${passedTests === testResults.length ? 'bg-green-500' : 'bg-yellow-500'}`} style={{width:`${(passedTests/testResults.length)*100}%`}}/></div></div>
              </div>
            )}
            <div className="space-y-1.5">
              {testResults.map((r, i) => (
                <div key={i} className={`p-3 rounded-lg border text-xs ${r.passed ? 'bg-green-900/20 border-green-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
                  <div className="flex items-start gap-2">
                    <span>{r.passed ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-gray-400 mt-0.5 truncate">{r.details}</p>
                      {r.error && <p className="text-red-400 mt-0.5">{r.error}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {testResults.length === 0 && <div className="text-center text-gray-500 py-8"><p className="text-3xl mb-2">🧪</p><p className="text-sm">Click "Run Tests" to verify the engine</p></div>}
          </div>
        )}

        {/* Integration Tests */}
        {activeTab === 'integration' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Integration Tests (Production Path)</h2>
              <button onClick={handleRunIntegration} disabled={runningIntegration}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded text-xs font-medium">
                {runningIntegration ? 'Running...' : integrationResults.length > 0 ? 'Re-run' : 'Run Integration Tests'}
              </button>
            </div>
            {integrationResults.length > 0 && (
              <div className="mb-3 p-3 bg-gray-800 rounded-xl border border-gray-700 flex items-center gap-3">
                <div className={`text-2xl font-bold ${passedIntegration === integrationResults.length ? 'text-green-400' : 'text-yellow-400'}`}>{passedIntegration}/{integrationResults.length}</div>
                <div className="flex-1"><div className="w-full h-2 bg-gray-700 rounded-full"><div className={`h-full rounded-full ${passedIntegration === integrationResults.length ? 'bg-green-500' : 'bg-yellow-500'}`} style={{width:`${(passedIntegration/integrationResults.length)*100}%`}}/></div></div>
              </div>
            )}
            <div className="space-y-1.5">
              {integrationResults.map((r, i) => (
                <div key={i} className={`p-3 rounded-lg border text-xs ${r.passed ? 'bg-green-900/20 border-green-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
                  <div className="flex items-start gap-2">
                    <span>{r.passed ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{r.name}</p>
                        {r.category && <span className="px-1.5 py-0.5 bg-gray-700 rounded text-[9px] text-gray-300">{r.category}</span>}
                      </div>
                      <p className="text-gray-400 mt-0.5 truncate">{r.details}</p>
                      {r.error && <p className="text-red-400 mt-0.5">{r.error}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {integrationResults.length === 0 && !runningIntegration && (
              <div className="text-center text-gray-500 py-8">
                <p className="text-3xl mb-2">🔗</p>
                <p className="text-sm">Tests the full production message-processing path</p>
                <p className="text-xs mt-1">WhatsApp adapter → Engine → Response → Persistence</p>
              </div>
            )}
          </div>
        )}

        {/* Learning */}
        {activeTab === 'learning' && (
          <div>
            <h2 className="text-sm font-semibold mb-4">Learning & Insights</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-[10px] text-gray-400">Total</p>
                <p className="text-xl font-bold text-blue-400">{insights.length}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-[10px] text-gray-400">Pending</p>
                <p className="text-xl font-bold text-yellow-400">{insights.filter(i => !i.approved).length}</p>
              </div>
            </div>
            <div className="space-y-2">
              {insights.length === 0 && <div className="text-center text-gray-500 py-8"><p className="text-3xl mb-2">🧠</p><p className="text-sm">Chat to generate insights</p></div>}
              {insights.map(insight => (
                <div key={insight.id} className={`p-3 rounded-lg border text-xs ${insight.approved ? 'bg-green-900/20 border-green-800' : 'bg-yellow-900/20 border-yellow-800'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex gap-1 mb-1">
                        <span className="px-1.5 py-0.5 bg-gray-700 rounded text-[9px]">{insight.category}</span>
                        {insight.approved && <span className="px-1.5 py-0.5 bg-green-900/50 text-green-300 rounded text-[9px]">approved</span>}
                      </div>
                      <p className="font-medium">{insight.description}</p>
                      <p className="text-gray-400 mt-0.5">{insight.suggestion}</p>
                    </div>
                    {!insight.approved && (
                      <div className="flex gap-1">
                        <button onClick={() => { engine.approveInsight(DEMO_BUSINESS.id, insight.id); setInsights([...engine.getLearningInsights(DEMO_BUSINESS.id)]); }}
                          className="px-2 py-1 bg-green-700 rounded text-[10px]">✓</button>
                        <button onClick={() => { engine.rejectInsight(DEMO_BUSINESS.id, insight.id); setInsights([...engine.getLearningInsights(DEMO_BUSINESS.id)]); }}
                          className="px-2 py-1 bg-red-900/50 text-red-300 rounded text-[10px]">✗</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        {activeTab === 'status' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold">System Status</h2>
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="text-xs font-medium text-yellow-400">⚠️ HONEST STATUS</h3>
              <div className="text-xs space-y-2 text-gray-300">
                <div className="p-2 bg-red-900/20 rounded border border-red-800/50">
                  <p className="font-medium text-red-400">NOT connected to real WhatsApp</p>
                  <p className="text-gray-400 mt-1">This is a frontend demo. The conversation engine exists as TypeScript code that CAN be integrated into a Node.js backend, but is currently running in-browser only.</p>
                </div>
                <div className="p-2 bg-yellow-900/20 rounded border border-yellow-800/50">
                  <p className="font-medium text-yellow-400">Storage: {db.getStorageMode()}</p>
                  <p className="text-gray-400 mt-1">Supabase is in dependencies but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for persistence. Without these, all data is in-memory and lost on refresh.</p>
                </div>
                <div className="p-2 bg-green-900/20 rounded border border-green-800/50">
                  <p className="font-medium text-green-400">Integration layer: READY</p>
                  <p className="text-gray-400 mt-1">The WhatsAppAdapter, DatabaseService, and MessageProcessor are built and tested. They define the exact interface for connecting to a real backend. See the Report tab for integration instructions.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-[10px] text-gray-400">Engine</p>
                <p className="text-lg font-bold text-green-400">✓ Active</p>
              </div>
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-[10px] text-gray-400">Database</p>
                <p className={`text-lg font-bold ${db.isPersistent() ? 'text-green-400' : 'text-yellow-400'}`}>{db.isPersistent() ? '✓ Connected' : '○ In-Memory'}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-[10px] text-gray-400">WhatsApp</p>
                <p className="text-lg font-bold text-red-400">✗ Not Connected</p>
              </div>
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-[10px] text-gray-400">Adapter</p>
                <p className="text-lg font-bold text-green-400">✓ Ready</p>
              </div>
            </div>
          </div>
        )}

        {/* Report */}
        {activeTab === 'report' && (
          <div className="space-y-4 text-xs">
            <h2 className="text-sm font-semibold">Final Delivery Report</h2>
            
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-red-400">1. Is ConversationEngine connected to real WhatsApp messages?</h3>
              <p className="text-gray-300"><strong className="text-red-400">NO.</strong> This workspace is a Vite React frontend. There is no Node.js backend, no WhatsApp webhook handler, no Meta API integration. The engine runs in the browser only.</p>
              <p className="text-gray-400 mt-1">The integration layer (WhatsAppAdapter, MessageProcessor) is BUILT and TESTED, defining the exact interface a backend would use. But it requires deployment to a Node.js server with WhatsApp Business API access.</p>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-yellow-400">2. Production entry point</h3>
              <p className="text-gray-300">The entry point is <code className="text-green-400">processInboundMessage()</code> in <code className="text-green-400">src/services/messageProcessor.ts</code></p>
              <p className="text-gray-400">Call chain: <code>whatsappService.handleWebhook() → processInboundMessage(inbound) → WhatsAppAdapter.processInboundMessage() → ConversationEngine.processMessage() → IntentClassifier → ProductMatcher → ResponseGenerator</code></p>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-yellow-400">3. Database tables and services</h3>
              <p className="text-gray-300">Required tables (schema in supabaseClient.ts):</p>
              <ul className="list-disc list-inside text-gray-400 space-y-0.5">
                <li><code>workspaces</code> — business configuration</li>
                <li><code>products</code> — tenant-specific catalogue</li>
                <li><code>conversations</code> — conversation state with JSONB context</li>
                <li><code>conversation_messages</code> — message history</li>
                <li><code>learning_insights</code> — proposed improvements</li>
                <li><code>learning_records</code> — learning audit trail</li>
                <li><code>workflow_configs</code> — automation rules</li>
              </ul>
              <p className="text-gray-400 mt-2">Services: <code>DatabaseService</code> (persistence), <code>WhatsAppAdapter</code> (integration), <code>MessageProcessor</code> (entry point)</p>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-yellow-400">4. Conversation memory persistence</h3>
              <p className="text-gray-300"><strong className="text-yellow-400">Currently: NO.</strong> Without Supabase configured, memory is in-memory only.</p>
              <p className="text-gray-400">With Supabase: YES. Conversations are stored in the <code>conversations</code> table with JSONB context. Messages persist in <code>conversation_messages</code>. Context survives restarts.</p>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-yellow-400">5. Learning insights persistence</h3>
              <p className="text-gray-300"><strong className="text-yellow-400">Currently: NO.</strong> Same as above — requires Supabase.</p>
              <p className="text-gray-400">With Supabase: YES. Insights stored in <code>learning_insights</code> table. Approval/rejection persisted. Audit trail in <code>learning_records</code>.</p>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-green-400">6. Tenant isolation</h3>
              <p className="text-gray-300"><strong className="text-green-400">YES — verified by tests.</strong></p>
              <ul className="list-disc list-inside text-gray-400 space-y-0.5">
                <li>Engine: Products keyed by workspaceId, conversations keyed by workspaceId+phone</li>
                <li>Database: All queries include workspace_id filter, RLS policies recommended</li>
                <li>Learning: Insights scoped to workspace_id, no cross-workspace access</li>
                <li>Test INT-05 and INT-14 verify isolation</li>
              </ul>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-blue-400">7. Test results</h3>
              <p className="text-gray-300">Engine tests: {passedTests}/{testResults.length || 15} (run in Tests tab)</p>
              <p className="text-gray-300">Integration tests: {passedIntegration}/{integrationResults.length || 16} (run in Integration tab)</p>
              <p className="text-gray-400 mt-1">Note: No existing backend tests exist because there IS no existing backend in this workspace.</p>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-orange-400">8. Remaining blockers before real customer testing</h3>
              <ol className="list-decimal list-inside text-gray-400 space-y-1">
                <li><strong className="text-white">Deploy backend:</strong> The engine needs to run in a Node.js server, not a browser</li>
                <li><strong className="text-white">Configure Supabase:</strong> Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, create tables</li>
                <li><strong className="text-white">Connect WhatsApp API:</strong> Implement Meta webhook handler that calls processInboundMessage()</li>
                <li><strong className="text-white">Load real products:</strong> Populate the products table with actual LAPTECH inventory</li>
                <li><strong className="text-white">Investigate 100000 USD:</strong> Check actual database records for the product that caused this</li>
                <li><strong className="text-white">Test with real messages:</strong> Send actual WhatsApp messages and verify responses</li>
                <li><strong className="text-white">Set up monitoring:</strong> Log engine decisions for debugging</li>
              </ol>
            </div>

            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
              <h3 className="font-medium text-purple-400">What was actually built</h3>
              <div className="text-gray-300 space-y-1">
                <p>✅ ConversationEngine — full intent classification, context management, product matching</p>
                <p>✅ IntentClassifier — pattern-based NLU, no hardcoded business terms</p>
                <p>✅ ContextManager — tenant-isolated conversation memory</p>
                <p>✅ ProductMatcher — fuzzy search with category weighting</p>
                <p>✅ ResponseGenerator — natural varied responses from templates</p>
                <p>✅ LearningEngine — conversation analysis with approval workflow</p>
                <p>✅ WhatsAppAdapter — production integration interface</p>
                <p>✅ DatabaseService — Supabase persistence layer (with in-memory fallback)</p>
                <p>✅ MessageProcessor — production entry point</p>
                <p>✅ 15 engine unit tests + 15 integration tests</p>
                <p>✅ Demo interface for testing</p>
                <p>❌ Real WhatsApp connection (requires backend deployment)</p>
                <p>❌ Real database persistence (requires Supabase configuration)</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
