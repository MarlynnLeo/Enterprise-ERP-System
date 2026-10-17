import { afterEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RichTextEditor from '@/components/RichTextEditor.vue'

let wrapper
const originalExecCommand = document.execCommand
afterEach(() => {
  wrapper?.unmount()
  window.getSelection()?.removeAllRanges()
  if (originalExecCommand) document.execCommand = originalExecCommand
  else delete document.execCommand
})

describe('rich text toolbar keyboard activation', () => {
  test('restores the selected text after focus moves to a toolbar button', async () => {
    const execCommand = vi.fn(() => true)
    document.execCommand = execCommand
    wrapper = mount(RichTextEditor, {
      attachTo: document.body,
      props: { modelValue: '<p>需要加粗的文本</p>' }
    })
    const editor = wrapper.get('[role="textbox"]')
    expect(editor.attributes('aria-multiline')).toBe('true')
    editor.element.focus()
    const range = document.createRange()
    range.selectNodeContents(editor.element.querySelector('p'))
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    await editor.trigger('keyup', { key: 'ArrowRight', shiftKey: true })
    await editor.trigger('blur')

    const bold = wrapper.get('button[title="加粗"]')
    bold.element.focus()
    selection.removeAllRanges()
    // Browsers dispatch a click for keyboard activation of a native button.
    await bold.trigger('click')

    expect(execCommand).toHaveBeenCalledExactlyOnceWith('bold', false, null)
    expect(selection.toString()).toBe('需要加粗的文本')
    expect(document.activeElement).toBe(editor.element)
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['<p>需要加粗的文本</p>'])
  })

  test('a pointer press followed by click applies formatting only once', async () => {
    const execCommand = vi.fn(() => true)
    document.execCommand = execCommand
    wrapper = mount(RichTextEditor, { props: { modelValue: '<p>文本</p>' } })
    const italic = wrapper.get('button[title="斜体"]')
    await italic.trigger('mousedown')
    expect(execCommand).not.toHaveBeenCalled()
    await italic.trigger('click')
    expect(execCommand).toHaveBeenCalledExactlyOnceWith('italic', false, null)
  })
})
