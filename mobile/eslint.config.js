import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  ...pluginVue.configs['flat/essential'],
  eslintConfigPrettier,
  {
    ignores: ['dist/*', 'node_modules/*', '**/*.min.js']
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        process: 'readonly',
        __dirname: 'readonly'
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': 'warn',
      'no-undef': 'warn', // warn 而非 error，因为 Vue auto-imports 可能误报
      'vue/no-v-model-argument': 'off'
    }
  }
]
