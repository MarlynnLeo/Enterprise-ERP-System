import signatureFontUrl from './SPPLMFONT.ttf?inline'

// Bundle the data URL from the font asset used by the application stylesheet.
export const SPPLM_FONT_FACE_CSS = `@font-face {
  font-family: 'SPPLMFONT';
  src: url('${signatureFontUrl}') format('truetype');
  font-weight: normal;
  font-style: normal;
}`
