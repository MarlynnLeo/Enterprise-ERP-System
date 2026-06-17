/* global afterEach, describe, expect, test */

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

const { assertAIConfigured, getAIConfig } = require('../../src/config/aiConfig');

describe('aiConfig', () => {
  afterEach(() => {
    resetAIEnv();
  });

  test('defaults to NVIDIA Kimi when an NVIDIA API key is configured', () => {
    clearAIEnv();
    process.env.NVIDIA_API_KEY = 'test-key';
    process.env.AI_ALLOW_REMOTE = 'true';

    const config = assertAIConfigured('test AI');

    expect(config).toEqual(
      expect.objectContaining({
        provider: 'nvidia',
        apiUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
        model: 'moonshotai/kimi-k2.6',
        apiKey: 'test-key',
        enabled: true,
        remote: true,
        remoteAllowed: true,
        maxTokens: 16384,
      })
    );
  });

  test('uses unified AI_* settings over legacy Ollama settings', () => {
    clearAIEnv();
    process.env.AI_PROVIDER = 'nvidia';
    process.env.AI_API_URL = 'https://example.test/v1/chat/completions';
    process.env.AI_MODEL = 'custom/model';
    process.env.AI_API_KEY = 'unified-key';
    process.env.AI_ALLOW_REMOTE = 'true';
    process.env.AI_TIMEOUT_MS = '120000';
    process.env.AI_TEMPERATURE = '0.7';
    process.env.AI_TOP_P = '0.9';
    process.env.OLLAMA_API_URL = 'http://localhost:11434/v1/chat/completions';
    process.env.OLLAMA_MODEL = 'legacy-model';

    expect(getAIConfig()).toEqual(
      expect.objectContaining({
        provider: 'nvidia',
        apiUrl: 'https://example.test/v1/chat/completions',
        model: 'custom/model',
        apiKey: 'unified-key',
        remote: true,
        remoteAllowed: true,
        timeoutMs: 120000,
        temperature: 0.7,
        topP: 0.9,
        enabled: true,
      })
    );
  });

  test('falls back to legacy Ollama config when no remote AI config exists', () => {
    clearAIEnv();
    process.env.OLLAMA_API_URL = 'http://localhost:11434/v1/chat/completions';
    process.env.OLLAMA_MODEL = 'gemma4:26b';

    expect(assertAIConfigured('legacy AI')).toEqual(
      expect.objectContaining({
        provider: 'ollama',
        apiUrl: 'http://localhost:11434/v1/chat/completions',
        model: 'gemma4:26b',
        requiresApiKey: false,
        enabled: true,
      })
    );
  });

  test('requires an API key for NVIDIA provider', () => {
    clearAIEnv();
    process.env.AI_PROVIDER = 'nvidia';
    process.env.AI_ALLOW_REMOTE = 'true';

    expect(() => assertAIConfigured('NVIDIA AI')).toThrow(
      'NVIDIA AI is not configured. Missing: AI_API_KEY or NVIDIA_API_KEY'
    );
  });

  test('requires explicit opt-in before sending data to remote AI providers', () => {
    clearAIEnv();
    process.env.NVIDIA_API_KEY = 'test-key';

    expect(getAIConfig()).toEqual(
      expect.objectContaining({
        provider: 'nvidia',
        remote: true,
        remoteAllowed: false,
        enabled: false,
      })
    );
    expect(() => assertAIConfigured('NVIDIA AI')).toThrow(
      'NVIDIA AI is not configured. Missing: AI_ALLOW_REMOTE=true'
    );
  });

  test('treats remote URLs as remote even when the provider name is ollama', () => {
    clearAIEnv();
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_API_URL = 'https://llm.example.com/v1/chat/completions';
    process.env.AI_MODEL = 'remote-compatible-model';

    expect(getAIConfig()).toEqual(
      expect.objectContaining({
        provider: 'ollama',
        requiresApiKey: false,
        remote: true,
        remoteAllowed: false,
        enabled: false,
      })
    );
  });
});
