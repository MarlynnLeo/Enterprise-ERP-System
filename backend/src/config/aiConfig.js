const DEFAULT_AI_PROVIDER = 'nvidia';
const DEFAULT_AI_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_AI_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_AI_TIMEOUT_MS = 60000;
const DEFAULT_AI_MAX_TOKENS = 8192;
const DEFAULT_AI_TEMPERATURE = 0.7;
const DEFAULT_AI_TOP_P = 0.95;
const REMOTE_AI_PROVIDERS = new Set(['nvidia', 'openai', 'siliconflow', 'zhipu', 'remote']);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readString = (value) => (typeof value === 'string' ? value.trim() : '');
const isTruthyEnv = (value) => ['1', 'true', 'yes', 'on'].includes(readString(value).toLowerCase());

const hasLegacyOllamaConfig = () => Boolean(
  readString(process.env.OLLAMA_API_URL) && readString(process.env.OLLAMA_MODEL)
);

const isRemoteProvider = (provider, apiUrl = '') => {
  const normalizedProvider = readString(provider).toLowerCase();
  const normalizedUrl = readString(apiUrl).toLowerCase();
  const isRemoteUrl =
    /^https?:\/\//.test(normalizedUrl) &&
    !/\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(normalizedUrl);
  if (REMOTE_AI_PROVIDERS.has(normalizedProvider)) {
    return true;
  }
  return isRemoteUrl;
};

const inferProvider = () => {
  const explicitProvider = readString(process.env.AI_PROVIDER).toLowerCase();
  if (explicitProvider) return explicitProvider;

  const hasUnifiedRemoteConfig = Boolean(
    readString(process.env.AI_API_URL) ||
    readString(process.env.AI_API_KEY) ||
    readString(process.env.NVIDIA_API_KEY)
  );

  if (!hasUnifiedRemoteConfig && hasLegacyOllamaConfig()) {
    return 'ollama';
  }

  return DEFAULT_AI_PROVIDER;
};

const getAIConfig = () => {
  const provider = inferProvider();
  const isOllama = provider === 'ollama';
  const apiUrl = readString(process.env.AI_API_URL) ||
    (isOllama ? readString(process.env.OLLAMA_API_URL) : DEFAULT_AI_API_URL);
  const model = readString(process.env.AI_MODEL) ||
    (isOllama ? readString(process.env.OLLAMA_MODEL) : DEFAULT_AI_MODEL);
  const apiKey = readString(process.env.AI_API_KEY) || readString(process.env.NVIDIA_API_KEY);
  const requiresApiKey = !isOllama;
  const remote = isRemoteProvider(provider, apiUrl);
  const remoteAllowed = isTruthyEnv(process.env.AI_ALLOW_REMOTE);

  return {
    provider,
    enabled: Boolean(apiUrl && model && (!requiresApiKey || apiKey) && (!remote || remoteAllowed)),
    apiUrl,
    model,
    apiKey,
    requiresApiKey,
    remote,
    remoteAllowed,
    timeoutMs: parsePositiveInt(
      process.env.AI_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS,
      DEFAULT_AI_TIMEOUT_MS
    ),
    maxTokens: parsePositiveInt(process.env.AI_MAX_TOKENS, DEFAULT_AI_MAX_TOKENS),
    temperature: parseNumber(process.env.AI_TEMPERATURE, DEFAULT_AI_TEMPERATURE),
    topP: parseNumber(process.env.AI_TOP_P, DEFAULT_AI_TOP_P),
  };
};

const assertAIConfigured = (serviceName = 'AI service') => {
  const config = getAIConfig();
  if (!config.enabled) {
    const missing = [];
    if (!config.apiUrl) missing.push('AI_API_URL');
    if (!config.model) missing.push('AI_MODEL');
    if (config.requiresApiKey && !config.apiKey) missing.push('AI_API_KEY or NVIDIA_API_KEY');
    if (config.remote && !config.remoteAllowed) missing.push('AI_ALLOW_REMOTE=true');

    throw new Error(`${serviceName} is not configured. Missing: ${missing.join(', ')}`);
  }
  return config;
};

const getAIModel = () => getAIConfig().model || null;

// Backward-compatible aliases for older imports.
const getOllamaConfig = getAIConfig;
const assertOllamaConfigured = assertAIConfigured;

module.exports = {
  getAIConfig,
  assertAIConfigured,
  getAIModel,
  isRemoteProvider,
  getOllamaConfig,
  assertOllamaConfigured,
};
