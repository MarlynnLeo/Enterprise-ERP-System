const { assertAIConfigured } = require('../../config/aiConfig');
const { httpPost } = require('../../utils/httpClient');

const normalizeUsage = (usage = {}) => ({
  prompt_tokens: usage.prompt_tokens || 0,
  completion_tokens: usage.completion_tokens || 0,
  reasoning_tokens: usage.reasoning_tokens || 0,
  total_tokens: usage.total_tokens || 0,
});

const createAIError = (message, response = {}) => {
  const error = new Error(message);
  error.status = response.status;
  error.data = response.data;
  return error;
};

class UnifiedAIClient {
  /**
   * Calls an OpenAI-compatible chat completions endpoint.
   *
   * NVIDIA NIM, OpenAI-compatible Ollama, and similar providers share this shape.
   */
  static async createChatCompletion({
    serviceName = 'AI service',
    messages,
    temperature,
    topP,
    maxTokens,
    stream = false,
    retries = 0,
  }) {
    const config = assertAIConfigured(serviceName);

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('AI messages must be a non-empty array');
    }

    const payload = {
      model: config.model,
      messages,
      max_tokens: maxTokens ?? config.maxTokens,
      temperature: temperature ?? config.temperature,
      top_p: topP ?? config.topP,
      stream,
    };

    const headers = {
      Accept: stream ? 'text/event-stream' : 'application/json',
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await httpPost(config.apiUrl, payload, {
      headers,
      timeout: config.timeoutMs,
      retries,
    });

    if (response.status === 429) {
      throw createAIError('AI provider rate limit exceeded', response);
    }

    if (response.status < 200 || response.status >= 300) {
      const errorBody = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
      throw createAIError(`AI provider API error: HTTP ${response.status} - ${errorBody}`, response);
    }

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw createAIError('AI provider returned empty content', response);
    }

    return {
      content,
      usage: normalizeUsage(response.data?.usage),
      model: config.model,
      provider: config.provider,
      raw: response.data,
    };
  }
}

module.exports = UnifiedAIClient;
