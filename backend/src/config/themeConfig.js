const DEFAULT_THEME_PRESET_ID = 'kacon';
const DEFAULT_FONT_SIZE = 14;
const THEME_MODES = Object.freeze(['light', 'dark', 'system']);
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const THEME_PRESETS = Object.freeze({
  default: Object.freeze({
    id: 'default',
    name: '默认主题',
    primaryColor: '#409EFF',
    mode: 'light',
  }),
  tech: Object.freeze({
    id: 'tech',
    name: '科技主题',
    primaryColor: '#00C3FF',
    mode: 'dark',
  }),
  business: Object.freeze({
    id: 'business',
    name: '商务主题',
    primaryColor: '#2C3E50',
    mode: 'light',
  }),
  vibrant: Object.freeze({
    id: 'vibrant',
    name: '活力主题',
    primaryColor: '#FF6B6B',
    mode: 'light',
  }),
  nature: Object.freeze({
    id: 'nature',
    name: '自然主题',
    primaryColor: '#51CF66',
    mode: 'light',
  }),
  dark: Object.freeze({
    id: 'dark',
    name: '深色主题',
    primaryColor: '#60A5FA',
    mode: 'dark',
  }),
  premium: Object.freeze({
    id: 'premium',
    name: 'Premium Editorial',
    primaryColor: '#FFFFFF',
    mode: 'dark',
  }),
  professional: Object.freeze({
    id: 'professional',
    name: '专业主题',
    primaryColor: '#1F4E79',
    mode: 'light',
  }),
  kacon: Object.freeze({
    id: 'kacon',
    name: 'KACON品牌',
    primaryColor: process.env.DEFAULT_THEME_PRIMARY_COLOR || '#00A896',
    mode: 'light',
  }),
});

const DEFAULT_THEME_SETTINGS = Object.freeze({
  theme: THEME_PRESETS[DEFAULT_THEME_PRESET_ID].mode,
  preset: DEFAULT_THEME_PRESET_ID,
  primaryColor: THEME_PRESETS[DEFAULT_THEME_PRESET_ID].primaryColor,
  fontSize: DEFAULT_FONT_SIZE,
});

const getDefaultThemeSettings = () => ({ ...DEFAULT_THEME_SETTINGS });

const isThemePreset = (presetId) => Object.hasOwn(THEME_PRESETS, presetId);

const normalizeFontSize = (value) => {
  const fontSize = Number(value);

  if (!Number.isFinite(fontSize)) {
    return DEFAULT_FONT_SIZE;
  }

  return Math.min(18, Math.max(12, Math.round(fontSize)));
};

const parseThemeSettings = (settings) => {
  if (!settings) {
    return {};
  }

  if (typeof settings === 'string') {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }

  return typeof settings === 'object' ? settings : {};
};

const normalizeThemeSettings = (settings) => {
  const source = parseThemeSettings(settings);
  const preset = isThemePreset(source.preset)
    ? THEME_PRESETS[source.preset]
    : THEME_PRESETS[DEFAULT_THEME_PRESET_ID];
  const theme = THEME_MODES.includes(source.theme) ? source.theme : preset.mode;

  return {
    theme,
    preset: preset.id,
    primaryColor: preset.primaryColor,
    fontSize: normalizeFontSize(source.fontSize),
  };
};

const validateThemeSettings = (settings) => {
  const source = parseThemeSettings(settings);
  const errors = {};

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    errors.themeSettings = '主题设置格式错误';
    return errors;
  }

  const requiredFields = ['theme', 'preset', 'primaryColor', 'fontSize'];
  const missingFields = requiredFields.filter((field) => !(field in source));
  if (missingFields.length > 0) {
    errors.required = `缺少必需字段: ${missingFields.join(', ')}`;
  }

  if (!THEME_MODES.includes(source.theme)) {
    errors.theme = `主题模式必须是: ${THEME_MODES.join(', ')}`;
  }

  if (!isThemePreset(source.preset)) {
    errors.preset = `主题预设不存在: ${source.preset}`;
  }

  if (typeof source.primaryColor !== 'string' || !HEX_COLOR_PATTERN.test(source.primaryColor)) {
    errors.primaryColor = '主题主色必须是十六进制颜色值';
  }

  const fontSize = Number(source.fontSize);
  if (!Number.isFinite(fontSize) || fontSize < 12 || fontSize > 18) {
    errors.fontSize = '字体大小必须在 12 到 18 之间';
  }

  return errors;
};

module.exports = {
  DEFAULT_FONT_SIZE,
  DEFAULT_THEME_PRESET_ID,
  DEFAULT_THEME_SETTINGS,
  THEME_MODES,
  THEME_PRESETS,
  getDefaultThemeSettings,
  isThemePreset,
  normalizeThemeSettings,
  validateThemeSettings,
};
