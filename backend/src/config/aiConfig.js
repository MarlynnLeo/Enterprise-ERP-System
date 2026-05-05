const DEFAULT_AI_TIMEOUT_MS = 300000;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readString = (value) => (typeof value === 'string' ? value.trim() : '');

const getOllamaConfig = () => {
  const apiUrl = readString(process.env.OLLAMA_API_URL);
  const model = readString(process.env.OLLAMA_MODEL);

  return {
    enabled: Boolean(apiUrl && model),
    apiUrl,
    model,
    timeoutMs: parsePositiveInt(process.env.OLLAMA_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS),
  };
};

const assertOllamaConfigured = (serviceName = 'AI service') => {
  const config = getOllamaConfig();
  if (!config.enabled) {
    throw new Error(
      `${serviceName} is not configured. Set OLLAMA_API_URL and OLLAMA_MODEL before using this feature.`
    );
  }
  return config;
};

module.exports = {
  getOllamaConfig,
  assertOllamaConfigured,
};
