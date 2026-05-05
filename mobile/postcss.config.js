export default {
  plugins: {
    'postcss-px-to-viewport-8-plugin': {
      viewportWidth: 375,
      viewportHeight: 667,
      unitPrecision: 5,
      viewportUnit: 'vw',
      selectorBlackList: ['.ignore', '.hairlines'],
      minPixelValue: 1,
      mediaQuery: false,
      exclude: [/node_modules/],
    },
  },
};
