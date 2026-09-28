/* global jest, describe, test, expect */
jest.mock('../../src/services/auth/ThemeService', () => ({
  getUserThemeSettings: jest.fn(),
  saveUserThemeSettings: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const ThemeService = require('../../src/services/auth/ThemeService');
const { getUserTheme, saveUserTheme, resetUserTheme } = require('../../src/controllers/auth/themeController');
const { normalizeThemeSettings, getDefaultThemeSettings, THEME_PRESETS, validateThemeSettings } = require('../../src/config/themeConfig');

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('workspace theme persistence', () => {
  test('keeps the stored workspace ID while exposing the classic theme name', () => {
    expect(THEME_PRESETS.workspace).toMatchObject({ id: 'workspace', name: '经典主题' });
  });
  test('accepts the new preset and restores the saved settings without falling back', async () => {
    const theme = { preset: 'workspace', theme: 'light', primaryColor: '#4263EB', fontSize: 14 };
    const saveResponse = createResponse();
    await saveUserTheme({ user: { id: 7 }, body: theme }, saveResponse);

    expect(ThemeService.saveUserThemeSettings).toHaveBeenCalledWith(7, expect.any(String));
    expect(saveResponse.json).toHaveBeenCalledWith(expect.objectContaining({ data: theme }));

    const savedTheme = ThemeService.saveUserThemeSettings.mock.calls[0][1];
    expect(JSON.parse(savedTheme)).toEqual(theme);
    ThemeService.getUserThemeSettings.mockResolvedValueOnce(savedTheme);
    const readResponse = createResponse();
    await getUserTheme({ user: { id: 7 } }, readResponse);

    expect(readResponse.json).toHaveBeenCalledWith(expect.objectContaining({ data: theme }));
  });

  test('reset continues to use the existing KACON default', async () => {
    const response = createResponse();
    await resetUserTheme({ user: { id: 7 } }, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ preset: 'kacon', theme: 'light' }),
    }));
  });

  test.each(['null', '[]', 'true', '42', '"dark"', '{invalid'])('recovers corrupt stored settings %s', (settings) => {
    expect(normalizeThemeSettings(settings)).toEqual(getDefaultThemeSettings());
  });

  test('preserves valid custom colors and aligns mode to the selected preset', async () => {
    const response = createResponse();
    await saveUserTheme({ user: { id: 7 }, body: {
      preset: 'workspace', theme: 'dark', primaryColor: '#abc', fontSize: 16,
    } }, response);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { preset: 'workspace', theme: 'light', primaryColor: '#AABBCC', fontSize: 16 },
    }));
  });

  test('migrates the old premium primary color consistently with the clients', () => {
    expect(THEME_PRESETS.premium.primaryColor).toBe('#E4E4E7');
    expect(normalizeThemeSettings({ preset: 'premium', primaryColor: '#FFFFFF', fontSize: 14 })).toEqual({
      preset: 'premium', theme: 'dark', primaryColor: '#E4E4E7', fontSize: 14,
    });
  });

  test('unknown and inherited preset names fall back to valid defaults', () => {
    expect(normalizeThemeSettings({ preset: 'constructor' })).toEqual(getDefaultThemeSettings());
    expect(normalizeThemeSettings({ preset: '__proto__', fontSize: null })).toEqual(getDefaultThemeSettings());
  });

  test.each(['   ', [], [16], {}, true])('normalizes malformed stored font size %p and rejects malformed API input', (fontSize) => {
    expect(normalizeThemeSettings({ preset: 'workspace', fontSize }).fontSize).toBe(14);
    expect(validateThemeSettings({ preset: 'workspace', theme: 'light', primaryColor: '#4263EB', fontSize })).toHaveProperty('fontSize');
  });

  test('does not coerce an array to a registered theme ID', () => {
    expect(normalizeThemeSettings({ preset: ['workspace'] }).preset).toBe('kacon');
    expect(validateThemeSettings({ preset: ['workspace'], theme: 'light', primaryColor: '#4263EB', fontSize: 14 })).toHaveProperty('preset');
  });
});
