/**
 * Unbound API Integration Service
 * Handles LLM calls, token counting, and cost tracking
 */

// Cost per 1K tokens (approximate - adjust based on actual Unbound pricing)
const MODEL_COSTS = {
  'kimi-k2p5': { input: 0.002, output: 0.006 },
  'kimi-k2-instruct-0905': { input: 0.001, output: 0.003 }
};

// Available models from Unbound API
const AVAILABLE_MODELS = [
  { id: 'kimi-k2p5', name: 'Kimi K2P5', provider: 'Moonshot', tier: 'premium' },
  { id: 'kimi-k2-instruct-0905', name: 'Kimi K2 Instruct', provider: 'Moonshot', tier: 'standard' }
];

class UnboundService {
  constructor(apiKey, baseUrl = 'https://api.getunbound.ai') {
    this.apiKey = apiKey || process.env.UNBOUND_API_KEY || '';
    this.baseUrl = baseUrl;
  }

  /**
   * Make an LLM call through Unbound API with retry logic
   * @param {string} prompt - The prompt to send
   * @param {string} model - Model ID to use
   * @param {string} context - Optional context from previous step
   * @param {number} maxRetries - Maximum number of retries for network errors
   * @returns {Promise<{content: string, tokens: {input: number, output: number}, cost: number}>}
   */
  async call(prompt, model = 'kimi-k2-instruct-0905', context = '', maxRetries = 3) {
    const fullPrompt = context 
      ? `Context from previous step:\n${context}\n\n---\n\n${prompt}`
      : prompt;

    // Lazy load axios
    const axios = require('axios');
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, {
          model: model,
          messages: [
            { role: 'user', content: fullPrompt }
          ],
          max_tokens: 4096,
          temperature: 0.7
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 60000 // 60s timeout
        });

        const data = response.data;
        const content = data.choices?.[0]?.message?.content || '';
        const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
        
        const tokens = {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
          total: usage.prompt_tokens + usage.completion_tokens
        };
        
        const cost = this.calculateCost(model, tokens.input, tokens.output);
        
        console.log(`✓ API call successful (attempt ${attempt}): ${tokens.total} tokens`);
        return { content, tokens, cost };
        
      } catch (error) {
        lastError = error;
        const isRetryable = !error.response || (error.response.status >= 500) || error.code === 'ECONNABORTED' || error.code === 'ECONNRESET';
        
        if (isRetryable && attempt < maxRetries) {
          const delay = attempt * 2000;
          console.log(`⟳ API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay/1000}s... Error: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('✗ Unbound API error:', error.message);
          if (error.response) {
            console.error('  Status:', error.response.status);
            console.error('  Data:', JSON.stringify(error.response.data));
          }
          throw new Error(error.response?.data?.error?.message || error.message);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Calculate cost based on model and token usage
   */
  calculateCost(model, inputTokens, outputTokens) {
    const costs = MODEL_COSTS[model] || MODEL_COSTS['kimi-k2-instruct-0905'];
    return (inputTokens / 1000 * costs.input) + (outputTokens / 1000 * costs.output);
  }

  /**
   * Get list of available models
   */
  getModels() {
    return AVAILABLE_MODELS;
  }

  /**
   * Suggest optimal model based on task complexity
   * @param {string} prompt - The task prompt
   * @param {number} maxCost - Maximum cost willing to spend
   */
  suggestModel(prompt, maxCost = 0.01) {
    const promptLength = prompt.length;
    const isComplex = /code|analyze|reason|complex|detailed|comprehensive/i.test(prompt);
    
    if (isComplex || promptLength > 2000) {
      return 'kimi-k2p5';
    } else {
      return 'kimi-k2-instruct-0905';
    }
  }
}

module.exports = { UnboundService, AVAILABLE_MODELS, MODEL_COSTS };
