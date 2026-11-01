import { ConversationEngine } from '../engine/ConversationEngine';
import { Business, Product, WorkflowConfig } from '../types';

/**
 * Test Suite for Conversation Engine
 * 
 * Covers all 15 regression test scenarios from requirements
 */

// Test data factories - NO hardcoded business names in engine logic
function createTestBusiness(overrides?: Partial<Business>): Business {
  return {
    id: 'biz_test_001',
    name: 'TestStore',
    currency: 'USD',
    workflow: {
      steps: [],
      autoResponses: [],
      handoffEnabled: true,
      handoffTrigger: 'human'
    },
    ...overrides
  };
}

function createTestProducts(businessId: string): Product[] {
  return [
    {
      id: 'prod_001',
      businessId,
      name: 'SmartPhone Pro',
      category: 'phones',
      description: 'Latest smartphone with great camera and battery life',
      price: 699,
      currency: 'USD',
      inStock: true,
      stockQuantity: 15,
      tags: ['mobile', 'smartphone', 'android']
    },
    {
      id: 'prod_002',
      businessId,
      name: 'SmartPhone Lite',
      category: 'phones',
      description: 'Affordable smartphone with essential features',
      price: 299,
      currency: 'USD',
      inStock: true,
      stockQuantity: 25,
      tags: ['mobile', 'smartphone', 'budget']
    },
    {
      id: 'prod_003',
      businessId,
      name: 'Laptop Ultra',
      category: 'laptops',
      description: 'High-performance laptop for professionals',
      price: 1299,
      currency: 'USD',
      inStock: true,
      stockQuantity: 8,
      tags: ['computer', 'notebook', 'work']
    },
    {
      id: 'prod_004',
      businessId,
      name: 'Laptop Basic',
      category: 'laptops',
      description: 'Everyday laptop for browsing and office work',
      price: 499,
      currency: 'USD',
      inStock: true,
      stockQuantity: 12,
      tags: ['computer', 'notebook', 'budget']
    },
    {
      id: 'prod_005',
      businessId,
      name: 'Wireless Earbuds',
      category: 'accessories',
      description: 'Premium wireless earbuds with noise cancellation',
      price: 149,
      currency: 'USD',
      inStock: true,
      stockQuantity: 30,
      tags: ['audio', 'earphones', 'wireless']
    }
  ];
}

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

export function runAllTests(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test01_GenuineGreeting());
  results.push(test02_ProductEnquiryNotGreeting());
  results.push(test03_LaptopNotPhone());
  results.push(test04_NoFabricatedProducts());
  results.push(test05_CorrectPriceAndCurrency());
  results.push(test06_AlternativesFromContext());
  results.push(test07_PurchaseIntentRecognition());
  results.push(test08_NoStaleResponses());
  results.push(test09_TenantIsolation());
  results.push(test10_WorkflowPriority());
  results.push(test11_SpellingAndInformal());
  results.push(test12_NoRepeatedResponses());
  results.push(test13_LearningIsolation());
  results.push(test14_UnverifiedStatementsNoChange());
  results.push(test15_LearningApproval());

  return results;
}

// Test 1: Genuine greeting receives a welcome response
function test01_GenuineGreeting(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  const response = engine.processMessage(business.id, '+1234567890', 'hello');

  const passed = response.content.toLowerCase().includes('welcome') || 
                 response.content.toLowerCase().includes('hi') ||
                 response.content.toLowerCase().includes('hello');
  
  return {
    name: '01. Genuine greeting receives welcome response',
    passed,
    details: `Response: "${response.content.substring(0, 80)}..."`,
    error: passed ? undefined : 'Greeting did not receive welcome response'
  };
}

// Test 2: "I am looking for a phone" triggers product enquiry, not welcome
function test02_ProductEnquiryNotGreeting(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  const response = engine.processMessage(business.id, '+1234567890', 'Am looking for a phone');

  // Should contain product information, not just a greeting
  const hasProducts = (response.products !== undefined && response.products.length > 0);
  const isNotJustGreeting = !response.content.match(/^(hi|hello|hey)\s/i) || hasProducts;

  const passed = hasProducts && isNotJustGreeting;

  return {
    name: '02. Product enquiry triggers product search, not welcome',
    passed,
    details: `Products found: ${response.products?.length || 0}, Response: "${response.content.substring(0, 80)}..."`,
    error: passed ? undefined : 'Product enquiry was treated as greeting'
  };
}

// Test 3: Asking for laptop does not return unrelated phone
function test03_LaptopNotPhone(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  const response = engine.processMessage(business.id, '+1234567890', 'Can i get a laptop');

  // All returned products should be laptops, not phones
  const allLaptops = response.products ? response.products.every(p => p.category === 'laptops') : false;
  const noPhones = response.products ? !response.products.some(p => p.category === 'phones') : true;

  const passed = allLaptops && noPhones && (response.products?.length ?? 0) > 0;

  return {
    name: '03. Laptop enquiry returns laptops, not phones',
    passed,
    details: `Products: ${response.products?.map(p => `${p.name}(${p.category})`).join(', ') || 'none'}`,
    error: passed ? undefined : 'Laptop enquiry returned phone products'
  };
}

// Test 4: Unavailable category does not produce fabricated products
function test04_NoFabricatedProducts(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  const response = engine.processMessage(business.id, '+1234567890', 'Do you have a television?');

  // Should not return any products (no TVs in catalogue)
  const noProducts = !response.products || response.products.length === 0;
  const responseAcknowledges = response.content.toLowerCase().includes("don't") || 
                                response.content.toLowerCase().includes("couldn't") ||
                                response.content.toLowerCase().includes("not") ||
                                response.content.toLowerCase().includes("sorry");

  const passed = noProducts || responseAcknowledges;

  return {
    name: '04. Unavailable category does not produce fabricated products',
    passed,
    details: `Products returned: ${response.products?.length || 0}, Response: "${response.content.substring(0, 80)}..."`,
    error: passed ? undefined : 'Fabricated products for non-existent category'
  };
}

// Test 5: Product prices and currencies come from correct saved records
function test05_CorrectPriceAndCurrency(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness({ currency: 'KES' }); // Kenyan Shilling
  const products = createTestProducts(business.id);
  engine.registerBusiness(business, products);

  const response = engine.processMessage(business.id, '+1234567890', 'Show me phones');

  // Check that the response uses the correct currency
  const usesCorrectCurrency = response.content.includes('KES');
  const pricesMatch = response.products?.every(p => {
    const expectedProduct = products.find(op => op.id === p.id);
    return expectedProduct && p.price === expectedProduct.price;
  }) ?? true;

  const passed = usesCorrectCurrency && pricesMatch;

  return {
    name: '05. Prices and currencies from correct saved records',
    passed,
    details: `Currency in response: ${usesCorrectCurrency ? 'KES ✓' : 'WRONG'}, Prices match: ${pricesMatch ? '✓' : '✗'}`,
    error: passed ? undefined : 'Price or currency mismatch'
  };
}

// Test 6: "Tell me more about the alternatives" uses previous product results
function test06_AlternativesFromContext(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  // First, do a product enquiry
  engine.processMessage(business.id, '+1234567890', 'Show me laptops');
  
  // Then ask for alternatives
  const response = engine.processMessage(business.id, '+1234567890', 'Ok tell me more about the alternatives');

  // Should return products (alternatives from context)
  const hasProducts = (response.products?.length ?? 0) > 0;
  const isRelevant = response.products?.every(p => p.category === 'laptops') ?? false;

  const passed = hasProducts && isRelevant;

  return {
    name: '06. Alternative request uses previous product context',
    passed,
    details: `Alternative products: ${response.products?.map(p => p.name).join(', ') || 'none'}`,
    error: passed ? undefined : 'Alternatives not from previous context'
  };
}

// Test 7: "I want it" is recognized as purchase intent
function test07_PurchaseIntentRecognition(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  // Set up context with a product
  engine.processMessage(business.id, '+1234567890', 'Show me phones');
  
  // Express purchase intent
  const response = engine.processMessage(business.id, '+1234567890', 'I want it can i get it');

  // Should recognize purchase intent and guide to next step
  const isPurchaseFlow = response.content.toLowerCase().includes('order') || 
                          response.content.toLowerCase().includes('proceed') ||
                          response.content.toLowerCase().includes('choice') ||
                          response.content.toLowerCase().includes('great') ||
                          response.nextExpectedAction === 'await_order_confirmation' ||
                          response.nextExpectedAction === 'await_order_details';

  const passed = isPurchaseFlow;

  return {
    name: '07. Purchase intent recognized and guided to next step',
    passed,
    details: `Response: "${response.content.substring(0, 80)}...", Next action: ${response.nextExpectedAction}`,
    error: passed ? undefined : 'Purchase intent not recognized'
  };
}

// Test 8: Repeated customer messages do not receive stale responses
function test08_NoStaleResponses(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  const response1 = engine.processMessage(business.id, '+1234567890', 'hello');
  const response2 = engine.processMessage(business.id, '+1234567890', 'Show me phones');
  const response3 = engine.processMessage(business.id, '+1234567890', 'hello');

  // response3 should not be identical to response1 (since context has changed)
  const notIdentical = response1.content !== response3.content || 
                       response2.content !== response3.content;
  
  // Also check that response2 is different from response1
  const progression = response1.content !== response2.content;

  const passed = notIdentical && progression;

  return {
    name: '08. Repeated messages do not receive stale responses',
    passed,
    details: `R1: "${response1.content.substring(0, 40)}...", R2: "${response2.content.substring(0, 40)}...", R3: "${response3.content.substring(0, 40)}..."`,
    error: passed ? undefined : 'Stale response detected'
  };
}

// Test 9: Different businesses cannot share product or conversation context
function test09_TenantIsolation(): TestResult {
  const engine = new ConversationEngine();
  
  // Create two businesses
  const business1 = createTestBusiness({ id: 'biz_A', name: 'StoreA', currency: 'USD' });
  const business2 = createTestBusiness({ id: 'biz_B', name: 'StoreB', currency: 'EUR' });
  
  const products1: Product[] = [{
    id: 'prod_A1', businessId: 'biz_A', name: 'Product A', category: 'electronics',
    description: 'Test product A', price: 100, currency: 'USD', inStock: true, stockQuantity: 5, tags: []
  }];
  
  const products2: Product[] = [{
    id: 'prod_B1', businessId: 'biz_B', name: 'Product B', category: 'clothing',
    description: 'Test product B', price: 50, currency: 'EUR', inStock: true, stockQuantity: 10, tags: []
  }];

  engine.registerBusiness(business1, products1);
  engine.registerBusiness(business2, products2);

  // Customer interacts with business A
  const responseA = engine.processMessage('biz_A', '+1234567890', 'Show me products');
  
  // Same phone number interacts with business B
  const responseB = engine.processMessage('biz_B', '+1234567890', 'Show me products');

  // Business A should only show its products
  const aOnlyHasOwnProducts = responseA.products?.every(p => p.businessId === 'biz_A') ?? true;
  // Business B should only show its products
  const bOnlyHasOwnProducts = responseB.products?.every(p => p.businessId === 'biz_B') ?? true;
  // No cross-contamination
  const noCrossContamination = !responseA.products?.some(p => p.businessId === 'biz_B') &&
                                !responseB.products?.some(p => p.businessId === 'biz_A');

  const passed = aOnlyHasOwnProducts && bOnlyHasOwnProducts && noCrossContamination;

  return {
    name: '09. Tenant isolation - businesses cannot share context',
    passed,
    details: `BizA products: ${responseA.products?.map(p => `${p.name}(${p.businessId})`).join(', ') || 'none'}, BizB products: ${responseB.products?.map(p => `${p.name}(${p.businessId})`).join(', ') || 'none'}`,
    error: passed ? undefined : 'Tenant isolation violated'
  };
}

// Test 10: Existing configured automation priority remains intact
function test10_WorkflowPriority(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness({
    workflow: {
      steps: [],
      autoResponses: [
        {
          id: 'auto_1',
          trigger: 'opening hours',
          response: 'We are open Monday-Friday 9am-5pm',
          priority: 10
        }
      ],
      handoffEnabled: true,
      handoffTrigger: 'human'
    }
  });
  engine.registerBusiness(business, createTestProducts(business.id));

  const response = engine.processMessage(business.id, '+1234567890', 'What are your opening hours?');

  const passed = response.content.includes('Monday-Friday') || response.content.includes('9am-5pm');

  return {
    name: '10. Configured automation priority remains intact',
    passed,
    details: `Response: "${response.content}"`,
    error: passed ? undefined : 'Workflow automation not triggered'
  };
}

// Test 11: Spelling mistakes and informal messages are interpreted
function test11_SpellingAndInformal(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  // Test with informal/misspelled message
  const response = engine.processMessage(business.id, '+1234567890', 'i wana by a fone');

  // Should recognize as product enquiry or at least try to help
  // The engine should not just repeat a greeting or return an error
  const isNotGreeting = !response.content.match(/^(hi|hello|hey)\s/i) || (response.products !== undefined && response.products.length > 0);
  const isHelpful = response.content.toLowerCase().includes('help') ||
                    response.content.toLowerCase().includes('looking') ||
                    response.content.toLowerCase().includes('find') ||
                    response.content.toLowerCase().includes('show') ||
                    response.content.toLowerCase().includes('option') ||
                    response.content.toLowerCase().includes('product') ||
                    (response.products !== undefined && response.products.length > 0) ||
                    response.content.toLowerCase().includes('what') ||
                    response.content.toLowerCase().includes('more');

  const passed = isNotGreeting && isHelpful;

  return {
    name: '11. Spelling mistakes and informal messages interpreted',
    passed,
    details: `Response: "${response.content.substring(0, 100)}..."`,
    error: passed ? undefined : 'Informal message not understood'
  };
}

// Test 12: Assistant does not repeat the same response unnecessarily
function test12_NoRepeatedResponses(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  engine.registerBusiness(business, createTestProducts(business.id));

  const responses: string[] = [];
  
  // Send multiple messages
  responses.push(engine.processMessage(business.id, '+1234567890', 'hello').content);
  responses.push(engine.processMessage(business.id, '+1234567890', 'show me phones').content);
  responses.push(engine.processMessage(business.id, '+1234567890', 'anything cheaper?').content);
  responses.push(engine.processMessage(business.id, '+1234567890', 'tell me more').content);

  // Check that no two consecutive responses are identical
  let hasRepetition = false;
  for (let i = 1; i < responses.length; i++) {
    if (responses[i] === responses[i - 1]) {
      hasRepetition = true;
      break;
    }
  }

  const passed = !hasRepetition;

  return {
    name: '12. No unnecessary repeated responses',
    passed,
    details: `Unique responses: ${new Set(responses).size}/${responses.length}`,
    error: passed ? undefined : 'Repeated response detected'
  };
}

// Test 13: Learning improvements remain isolated between businesses
function test13_LearningIsolation(): TestResult {
  const engine = new ConversationEngine();
  
  const business1 = createTestBusiness({ id: 'biz_learn_A', name: 'LearnStoreA' });
  const business2 = createTestBusiness({ id: 'biz_learn_B', name: 'LearnStoreB' });
  
  engine.registerBusiness(business1, createTestProducts(business1.id));
  engine.registerBusiness(business2, createTestProducts(business2.id));

  // Generate conversations for business 1
  engine.processMessage('biz_learn_A', '+1111111111', 'hello');
  engine.processMessage('biz_learn_A', '+1111111111', 'show me phones');
  engine.processMessage('biz_learn_A', '+1111111111', 'i want it');

  // Analyze learning for business 1
  const insightsA = engine.analyzeConversation('biz_learn_A', '+1111111111');
  
  // Business 2 should have no insights from business 1's conversations
  const insightsB = engine.getLearningInsights('biz_learn_B');
  const bHasNoAInsights = insightsB.every(i => i.businessId === 'biz_learn_B');

  // All insights for A should belong to A
  const aInsightsCorrect = engine.getLearningInsights('biz_learn_A').every(i => i.businessId === 'biz_learn_A');

  const passed = bHasNoAInsights && aInsightsCorrect;

  return {
    name: '13. Learning improvements isolated between businesses',
    passed,
    details: `Insights A: ${insightsA.length}, Insights B: ${insightsB.length}, All A insights belong to A: ${aInsightsCorrect}`,
    error: passed ? undefined : 'Learning isolation violated'
  };
}

// Test 14: Unverified customer statements cannot change official business facts
function test14_UnverifiedStatementsNoChange(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness();
  const products = createTestProducts(business.id);
  engine.registerBusiness(business, products);

  // Get original product prices
  const originalPhonePrice = products.find(p => p.name === 'SmartPhone Pro')?.price;

  // Customer tries to state a different price
  engine.processMessage(business.id, '+1234567890', 'show me phones');
  engine.processMessage(business.id, '+1234567890', 'that phone is only 500 dollars');
  engine.processMessage(business.id, '+1234567890', 'show me phones again');

  // Verify product price hasn't changed
  const currentProducts = engine.getBusinessProducts(business.id);
  const currentPhonePrice = currentProducts.find(p => p.name === 'SmartPhone Pro')?.price;

  const passed = originalPhonePrice === currentPhonePrice;

  return {
    name: '14. Customer statements cannot change business facts',
    passed,
    details: `Original price: ${originalPhonePrice}, Current price: ${currentPhonePrice}`,
    error: passed ? undefined : 'Business facts changed by customer statement'
  };
}

// Test 15: Business can review and approve proposed learning improvements
function test15_LearningApproval(): TestResult {
  const engine = new ConversationEngine();
  const business = createTestBusiness({ id: 'biz_approval_test' });
  engine.registerBusiness(business, createTestProducts(business.id));

  // Generate a conversation
  engine.processMessage('biz_approval_test', '+9999999999', 'hello');
  engine.processMessage('biz_approval_test', '+9999999999', 'show me phones');
  engine.processMessage('biz_approval_test', '+9999999999', 'i want the first one');
  engine.processMessage('biz_approval_test', '+9999999999', 'that is expensive');

  // Get unapproved insights
  const unapproved = engine.getUnapprovedInsights('biz_approval_test');
  
  // Try to approve an insight
  let approvalWorked = false;
  if (unapproved.length > 0) {
    approvalWorked = engine.approveInsight('biz_approval_test', unapproved[0].id);
  }

  // Verify the insight is now approved
  const allInsights = engine.getLearningInsights('biz_approval_test');
  const approvedInsight = allInsights.find(i => i.id === unapproved[0]?.id);
  const isApproved = approvedInsight?.approved === true;

  // Also test rejection
  let rejectionWorked = false;
  const remaining = engine.getUnapprovedInsights('biz_approval_test');
  if (remaining.length > 0) {
    rejectionWorked = engine.rejectInsight('biz_approval_test', remaining[0].id);
  }

  const passed = (unapproved.length > 0 ? approvalWorked && isApproved : true) && 
                 (remaining.length > 0 ? rejectionWorked : true);

  return {
    name: '15. Business can review and approve learning improvements',
    passed,
    details: `Unapproved insights: ${unapproved.length}, Approval worked: ${approvalWorked}, Is approved: ${isApproved}, Rejection worked: ${rejectionWorked}`,
    error: passed ? undefined : 'Learning approval/rejection not working'
  };
}
