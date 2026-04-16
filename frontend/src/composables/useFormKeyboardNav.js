/**
 * useFormKeyboardNav.js
 * @description 表单键盘导航组合式函数
 * 实现：Enter 键自动跳转到下一个输入框，最后一个字段 Enter 触发提交
 * 
 * 使用方式：
 *   const { onFormKeydown } = useFormKeyboardNav(submitFn)
 *   <el-form @keydown="onFormKeydown"> ... </el-form>
 */

/**
 * @param {Function} submitFn - 可选，在最后一个字段按 Enter 时调用的提交函数
 * @returns {{ onFormKeydown: Function }}
 */
export function useFormKeyboardNav(submitFn = null) {
  /**
   * 获取表单内所有可聚焦的输入元素（按 DOM 顺序）
   */
  const getFocusableElements = (formEl) => {
    if (!formEl) return []
    // 收集所有可聚焦的表单元素，排除 disabled 和 textarea
    const selectors = [
      'input:not([disabled]):not([type="hidden"]):not([readonly])',
      'select:not([disabled])',
      '.el-select .el-input__inner:not([disabled])',
      '.el-input-number .el-input__inner:not([disabled])',
      '.el-date-editor .el-input__inner:not([disabled])',
    ].join(', ')
    
    return Array.from(formEl.querySelectorAll(selectors)).filter(el => {
      // 排除 textarea
      if (el.tagName === 'TEXTAREA') return false
      // 排除不可见元素
      if (el.offsetParent === null) return false
      return true
    })
  }

  /**
   * 表单 keydown 事件处理器
   * - Enter：跳转到下一个输入框；最后一个字段触发提交
   * - 不干预 textarea 中的 Enter（允许换行）
   */
  const onFormKeydown = (event) => {
    // 只处理 Enter 键
    if (event.key !== 'Enter') return

    const target = event.target
    
    // textarea 中的 Enter 不拦截（允许换行）
    if (target.tagName === 'TEXTAREA') return
    
    // el-select 下拉展开时的 Enter 不拦截（让 el-select 自行处理选择）
    const selectWrapper = target.closest('.el-select')
    if (selectWrapper) {
      // 在 Element Plus 中，下拉展开时其内部 wrapper 会有 aria-expanded="true"
      const expandedEl = target.closest('[aria-expanded="true"]')
      if (expandedEl) return
      
      const selectInner = target.closest('.el-select__wrapper') || target.closest('.el-input')
      if (selectInner && selectInner.getAttribute('aria-expanded') === 'true') return
    }

    // 阻止默认行为（防止表单意外提交）
    event.preventDefault()

    const form = target.closest('form') || target.closest('.el-form') || target.closest('.el-dialog__body')
    if (!form) return

    const focusable = getFocusableElements(form)
    const currentIndex = focusable.indexOf(target)

    if (currentIndex === -1) return

    if (currentIndex < focusable.length - 1) {
      // 跳转到下一个字段
      const nextEl = focusable[currentIndex + 1]
      nextEl.focus()
      // 如果是 input，选中文本方便直接输入
      if (nextEl.tagName === 'INPUT' && nextEl.type !== 'button') {
        nextEl.select()
      }
    } else {
      // 已经是最后一个字段，触发提交
      if (submitFn && typeof submitFn === 'function') {
        submitFn()
      }
    }
  }

  return { onFormKeydown }
}

export default useFormKeyboardNav
