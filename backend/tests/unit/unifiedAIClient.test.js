/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/utils/httpClient', () => ({
  httpPost: jest.fn(),
}));

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'AI_API_URL',
  'AI_MODEL',
  'AI_API_KEY',
  'NVIDIA_API_KEY',
  'AI_ALLOW_REMOTE',
  'AI_TIMEOUT_MS',
  'AI_MAX_TOKENS',
  'AI_TEMPERATURE',
  'AI_TOP_P',
  'OLLAMA_API_URL',
  'OLLAMA_MODEL',
  'OLLAMA_TIMEOUT_MS',
];

const originalEnv = AI_ENV_KEYS.reduce((result, key) => {
  result[key] = process.env[key];
  return result;
}, {});

const resetAIEnv = () => {
  AI_ENV_KEYS.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  });
};

const clearAIEnv = () => {
  AI_ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
};

const { httpPost } = require('../../src/utils/httpClient');
const UnifiedAIClient = require('../../src/services/ai/UnifiedAIClient');

describe('UnifiedAIClient', () => {
  afterEach(() => {
    httpPost.mockReset();
    resetAIEnv();
  });

  test('calls NVIDIA chat completions with bearer auth and unified payload', async () => {
    clearAIEnv();
    process.env.NVIDIA_API_KEY = 'test-key';
    process.env.AI_ALLOW_REMOTE = 'true';

    httpPost.mockResolvedValueOnce({
      status: 200,
      data: {
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      },
    });

    const result = await UnifiedAIClient.createChatCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      topP: 0.8,
      retries: 0,
    });

    expect(httpPost).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.objectContaining({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 8192,
        temperature: 0.2,
        top_p: 0.8,
        stream: false,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
        retries: 0,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        content: '{"ok":true}',
        model: 'openai/gpt-oss-120b',
        provider: 'nvidia',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          reasoning_tokens: 0,
          total_tokens: 15,
        },
      })
    );
  });

  test('throws a status-aware error when the provider returns a non-2xx response', async () => {
    clearAIEnv();
    process.env.NVIDIA_API_KEY = 'test-key';
    process.env.AI_ALLOW_REMOTE = 'true';
    httpPost.mockResolvedValueOnce({
      status: 401,
      data: { error: { message: 'unauthorized' } },
    });

    await expect(
      UnifiedAIClient.createChatCompletion({
        messages: [{ role: 'user', content: 'hello' }],
      })
    ).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('HTTP 401'),
    });
  });
});
