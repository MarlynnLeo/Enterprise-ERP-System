/**
 * useSnackbar.js
 * @description 组合式函数文件
  * @date 2025-08-27
 * @version 1.0.0
 */

// useSnackbar.js - 提供应用程序通知功能
import { ElMessage } from 'element-plus';
import { ref, computed } from 'vue';

// 创建全局状态
const snackbar = ref({
  show: false,
  text: '',
  type: 'info', // Element Plus使用type而不是color
  duration: 3000 // Element Plus使用duration而不是timeout
});

export function useSnackbar() {
  /**
   * 显示一个消息通知
   * @param {string} text 要显示的消息文本
   * @param {string} type 消息类型 ('success', 'info', 'warning', 'error')
   * @param {number} duration 消息显示时间(毫秒)
   */
  function showSnackbar(text, type = 'info', duration = 3000) {
    // 使用Element Plus的ElMessage组件
    ElMessage({
      message: text,
      type: type,
      duration: duration,
      showClose: true
    });

    // 同时更新本地状态，供App.vue中的组件使用
    snackbar.value = {
      show: true,
      text,
      type,
      duration
    };
  }

  /**
   * 隐藏当前显示的消息通知
   */
  function hideSnackbar() {
    snackbar.value.show = false;
  }

  // 返回公共API
  return {
    snackbar: computed(() => snackbar.value),
    showSnackbar,
    hideSnackbar
  };
}