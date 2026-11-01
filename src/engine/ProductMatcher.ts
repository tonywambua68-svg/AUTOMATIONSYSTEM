import { Product } from '../types';

/**
 * ProductMatcher - Searches business catalogue for matching products
 * 
 * Key principles:
 * - Only returns products from the correct business (tenant isolation)
 * - Uses fuzzy matching for category/product names
 * - Never invents products that don't exist
 * - Returns empty results when no match found (never fabricates)
 * - Respects stock availability
 */

export class ProductMatcher {
  private products: Map<string, Product[]> = new Map(); // businessId -> products

  /**
   * Load products for a business
   */
  loadProducts(businessId: string, products: Product[]): void {
    this.products.set(businessId, products);
  }

  /**
   * Add a product to a business catalogue
   */
  addProduct(businessId: string, product: Product): void {
    const existing = this.products.get(businessId) || [];
    existing.push(product);
    this.products.set(businessId, existing);
  }

  /**
   * Search for products matching a query within a specific business
   * CRITICAL: Never returns products from other businesses
   */
  searchProducts(businessId: string, query: string, entities?: Record<string, string>): Product[] {
    const businessProducts = this.products.get(businessId);
    if (!businessProducts || businessProducts.length === 0) {
      return []; // No products in catalogue - never fabricate
    }

    const normalizedQuery = query.toLowerCase().trim();
    const queryWords = this.tokenize(normalizedQuery);

    // Score each product
    const scored = businessProducts.map(product => ({
      product,
      score: this.calculateMatchScore(product, queryWords, normalizedQuery, entities)
    }));

    // Filter products with meaningful scores
    const matches = scored
      .filter(s => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .map(s => s.product);

    return matches;
  }

  /**
   * Calculate how well a product matches the query
   */
  private calculateMatchScore(
    product: Product, 
    queryWords: string[], 
    normalizedQuery: string,
    entities?: Record<string, string>
  ): number {
    let score = 0;

    // Name matching
    const nameWords = this.tokenize(product.name.toLowerCase());
    const nameMatchScore = this.wordOverlapScore(queryWords, nameWords);
    score += nameMatchScore * 0.4;

    // Category matching
    const categoryWords = this.tokenize(product.category.toLowerCase());
    const categoryMatchScore = this.wordOverlapScore(queryWords, categoryWords);
    score += categoryMatchScore * 0.35;

    // Description matching
    const descWords = this.tokenize(product.description.toLowerCase());
    const descMatchScore = this.wordOverlapScore(queryWords, descWords);
    score += descMatchScore * 0.15;

    // Tags matching
    const tagWords = product.tags.flatMap(t => this.tokenize(t.toLowerCase()));
    const tagMatchScore = this.wordOverlapScore(queryWords, tagWords);
    score += tagMatchScore * 0.1;

    // Fuzzy matching for partial words
    const fuzzyScore = this.fuzzyMatchScore(normalizedQuery, product.name.toLowerCase());
    score += fuzzyScore * 0.2;

    // Apply entity-based adjustments
    if (entities) {
      score = this.applyEntityAdjustments(score, product, entities);
    }

    // Stock bonus (prefer in-stock items)
    if (product.inStock) {
      score *= 1.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Apply entity-based score adjustments (price preference, condition, etc.)
   */
  private applyEntityAdjustments(score: number, product: Product, entities: Record<string, string>): number {
    // Price preference adjustment
    if (entities.price_preference === 'low' && product.price > 500) {
      score *= 0.7; // Penalize expensive items when customer wants cheap
    }
    if (entities.price_preference === 'high' && product.price < 100) {
      score *= 0.7; // Penalize cheap items when customer wants premium
    }

    return score;
  }

  /**
   * Calculate word overlap score between two word arrays
   */
  private wordOverlapScore(queryWords: string[], targetWords: string[]): number {
    if (queryWords.length === 0 || targetWords.length === 0) return 0;

    const targetSet = new Set(targetWords);
    const matches = queryWords.filter(w => targetSet.has(w));
    
    // Also check for partial matches
    const partialMatches = queryWords.filter(w => 
      !targetSet.has(w) && targetWords.some(tw => tw.includes(w) || w.includes(tw))
    );

    const matchScore = matches.length / queryWords.length;
    const partialScore = (partialMatches.length * 0.5) / queryWords.length;
    
    return Math.min(matchScore + partialScore, 1.0);
  }

  /**
   * Fuzzy match score using character-level similarity
   */
  private fuzzyMatchScore(query: string, target: string): number {
    // Check if query is contained in target or vice versa
    if (target.includes(query)) return 0.8;
    if (query.includes(target)) return 0.6;

    // Levenshtein-based similarity for short strings
    if (query.length < 3 || target.length < 3) return 0;
    
    const distance = this.levenshteinDistance(query, target);
    const maxLen = Math.max(query.length, target.length);
    return 1 - (distance / maxLen);
  }

  /**
   * Simple Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  /**
   * Tokenize a string into words, removing stop words
   */
  private tokenize(text: string): string[] {
    const stopWords = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those', 'am', 'but', 'or', 'and', 'if', 'so', 'no', 'not', 'very', 'just']);
    
    return text
      .split(/\s+/)
      .filter(w => w.length > 0 && !stopWords.has(w));
  }

  /**
   * Get a specific product by ID (tenant-scoped)
   */
  getProduct(businessId: string, productId: string): Product | undefined {
    const businessProducts = this.products.get(businessId);
    if (!businessProducts) return undefined;
    return businessProducts.find(p => p.id === productId);
  }

  /**
   * Get all products for a business
   */
  getAllProducts(businessId: string): Product[] {
    return this.products.get(businessId) || [];
  }

  /**
   * Get products by category (tenant-scoped)
   */
  getProductsByCategory(businessId: string, category: string): Product[] {
    const businessProducts = this.products.get(businessId);
    if (!businessProducts) return [];
    
    const normalizedCategory = category.toLowerCase();
    return businessProducts.filter(p => 
      p.category.toLowerCase().includes(normalizedCategory) ||
      p.tags.some(t => t.toLowerCase().includes(normalizedCategory))
    );
  }

  /**
   * Get alternatives to a product (same category, different product)
   */
  getAlternatives(businessId: string, productId: string, limit: number = 3): Product[] {
    const product = this.getProduct(businessId, productId);
    if (!product) return [];

    const allProducts = this.getAllProducts(businessId);
    return allProducts
      .filter(p => p.id !== productId && (
        p.category === product.category ||
        p.tags.some(t => product.tags.includes(t))
      ))
      .slice(0, limit);
  }

  /**
   * Get cheaper alternatives
   */
  getCheaperAlternatives(businessId: string, productId: string, limit: number = 3): Product[] {
    const product = this.getProduct(businessId, productId);
    if (!product) return [];

    const allProducts = this.getAllProducts(businessId);
    return allProducts
      .filter(p => p.id !== productId && p.price < product.price && p.inStock)
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
  }

  /**
   * Verify product belongs to business (tenant isolation check)
   */
  verifyProductOwnership(businessId: string, productId: string): boolean {
    const product = this.getProduct(businessId, productId);
    return !!product && product.businessId === businessId;
  }
}
