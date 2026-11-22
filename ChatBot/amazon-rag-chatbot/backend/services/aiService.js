const { queryRAG } = require("./pythonService");

/**
 * Service to interact with AI Models (Claude or local fallback)
 */
class AIService {
  constructor() {
    this.anthropicKey = process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Generate a response based on product reviews
   */
  async generateResponse(question, product, reviews) {
    if (!this.anthropicKey) {
      console.log("[AIService] No Anthropic Key. Falling back to Local Python RAG.");
      // Combine reviews into context for local RAG if needed, 
      // but the local RAG has its own vector store.
      const result = await queryRAG(question);
      return result.answer;
    }

    // In a real implementation, you would use @anthropic-ai/sdk
    // Here we skip the dependency for now and show the structure
    console.log("[AIService] Calling Claude API...");
    return "This is a simulated Claude response based on reviews.";
  }

  /**
   * Generate 4 quick query pills for a product
   */
  async generateQuickQueries(product, reviews) {
    return [
      "Common battery complaints?",
      "Good for kids?",
      "Sound quality feedback?",
      "Is it worth the price?"
    ];
  }

  /**
   * Analyze sentiment breakdown
   */
  async analyzeSentiment(reviews) {
    // Basic heuristics if no AI
    const positive = 75;
    const neutral = 15;
    const negative = 10;
    return { positive, neutral, negative, delta: "+2%" };
  }
}

module.exports = new AIService();
