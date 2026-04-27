import globals from 'globals';
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // 关键错误检测
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-constant-condition': 'warn',
      'no-unreachable': 'warn',
      
      // 最佳实践
      'eqeqeq': ['warn', 'always'],
      'no-var': 'warn',
      'prefer-const': 'warn',
      
      // 代码风格（与 Prettier 配合）
      'no-multiple-empty-lines': ['warn', { max: 2 }],
      'no-trailing-spaces': 'warn',
    },
  },
  {
    // 忽略的文件/目录
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'tmp/**',
      'coverage/**',
      '*.min.js',
      'frontend/src/extract_options.js',
      'frontend/src/replace_vue_options.js',
      'frontend/src/rewrite_constants.js',
    ],
  },
];
