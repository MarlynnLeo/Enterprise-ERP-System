import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  ...pluginVue.configs['flat/essential'],
  eslintConfigPrettier,
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.min.js', 'public/client-diag.js']
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly'
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-mutating-props': 'warn',
      'vue/no-parsing-error': 'off',
      'vue/no-ref-as-operand': 'warn',
      'vue/no-reserved-component-names': 'warn',
      'vue/no-unused-components': 'warn',
      'vue/no-unused-vars': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'warn'
    }
  }
]
