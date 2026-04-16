import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  ...pluginVue.configs['flat/essential'],
  eslintConfigPrettier,
  {
    ignores: ['dist/*', 'node_modules/*', '**/*.min.js']
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': 'warn',
      'no-undef': 'off', // Because ref, onMounted might use auto imports in some Vue setups, turning this off for simplicity
      'vue/no-v-model-argument': 'off'
    }
  }
]
