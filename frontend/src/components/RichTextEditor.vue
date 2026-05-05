<!--
/**
 * RichTextEditor.vue
 * @description 轻量富文本编辑器，输入输出统一做 HTML 清洗
 * @date 2025-11-04
 */
-->
<template>
  <div class="rich-text-editor">
    <div class="editor-toolbar" role="toolbar" aria-label="富文本工具栏">
      <button type="button" class="toolbar-btn strong" title="加粗" @mousedown.prevent="format('bold')">B</button>
      <button type="button" class="toolbar-btn italic" title="斜体" @mousedown.prevent="format('italic')">I</button>
      <button type="button" class="toolbar-btn underline" title="下划线" @mousedown.prevent="format('underline')">U</button>
      <button type="button" class="toolbar-btn strike" title="删除线" @mousedown.prevent="format('strikeThrough')">S</button>
      <span class="toolbar-divider"></span>
      <button type="button" class="toolbar-btn" title="一级标题" @mousedown.prevent="formatBlock('h1')">H1</button>
      <button type="button" class="toolbar-btn" title="二级标题" @mousedown.prevent="formatBlock('h2')">H2</button>
      <button type="button" class="toolbar-btn" title="引用" @mousedown.prevent="formatBlock('blockquote')">Quote</button>
      <span class="toolbar-divider"></span>
      <button type="button" class="toolbar-btn" title="无序列表" @mousedown.prevent="format('insertUnorderedList')">UL</button>
      <button type="button" class="toolbar-btn" title="有序列表" @mousedown.prevent="format('insertOrderedList')">OL</button>
      <button type="button" class="toolbar-btn" title="插入链接" @mousedown.prevent="insertLink">Link</button>
      <button type="button" class="toolbar-btn" title="清除格式" @mousedown.prevent="format('removeFormat')">Clear</button>
    </div>

    <div
      ref="editorRef"
      class="editor-surface"
      contenteditable="true"
      role="textbox"
      :aria-label="placeholder"
      :data-placeholder="placeholder"
      :style="{ minHeight }"
      @input="handleInput"
      @blur="handleInput"
      @paste="handlePaste"
    ></div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import DOMPurify from 'dompurify';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '请输入内容...'
  },
  minHeight: {
    type: String,
    default: '400px'
  }
});

const emit = defineEmits(['update:modelValue']);

const editorRef = ref(null);
const lastEmittedValue = ref('');

const sanitizeOptions = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ol', 'ul', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel',
    'src', 'alt', 'width', 'height',
    'class', 'style'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
};

const emptyHtmlPattern = /^(<br\s*\/?>|<div><br\s*\/?><\/div>|<p><br\s*\/?><\/p>)$/i;

const sanitizeHtml = (value) => {
  const cleanValue = DOMPurify.sanitize(value || '', sanitizeOptions).trim();
  return emptyHtmlPattern.test(cleanValue) ? '' : cleanValue;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
  .replace(/\r?\n/g, '<br>');

const moveCaretToEnd = (element) => {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

const setEditorHtml = (value) => {
  const editor = editorRef.value;
  if (!editor) return;

  const cleanValue = sanitizeHtml(value);
  if (editor.innerHTML !== cleanValue) {
    editor.innerHTML = cleanValue;
  }
};

const emitCleanValue = () => {
  const editor = editorRef.value;
  if (!editor) return;

  const cleanValue = sanitizeHtml(editor.innerHTML);
  if (editor.innerHTML.trim() !== cleanValue) {
    editor.innerHTML = cleanValue;
    moveCaretToEnd(editor);
  }

  lastEmittedValue.value = cleanValue;
  emit('update:modelValue', cleanValue);
};

const handleInput = () => {
  emitCleanValue();
};

const format = (command, value = null) => {
  editorRef.value?.focus();
  document.execCommand(command, false, value);
  emitCleanValue();
};

const formatBlock = (tagName) => {
  editorRef.value?.focus();
  document.execCommand('formatBlock', false, tagName);
  emitCleanValue();
};

const normalizeUrl = (url) => {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return '';

  const normalizedUrl = /^[a-z][a-z\d+\-.]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const parsedUrl = new URL(normalizedUrl);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsedUrl.protocol) ? parsedUrl.href : '';
  } catch {
    return '';
  }
};

const insertLink = () => {
  const url = window.prompt('请输入链接地址');
  const safeUrl = normalizeUrl(url);
  if (!safeUrl) return;

  editorRef.value?.focus();
  document.execCommand('createLink', false, safeUrl);
  emitCleanValue();
};

const handlePaste = (event) => {
  event.preventDefault();
  const html = event.clipboardData?.getData('text/html');
  const text = event.clipboardData?.getData('text/plain');
  const pastedContent = html ? sanitizeHtml(html) : escapeHtml(text);

  document.execCommand('insertHTML', false, pastedContent);
  emitCleanValue();
};

onMounted(() => {
  setEditorHtml(props.modelValue);
  lastEmittedValue.value = sanitizeHtml(props.modelValue);
});

watch(() => props.modelValue, async (newValue) => {
  const cleanValue = sanitizeHtml(newValue);
  if (cleanValue === lastEmittedValue.value) return;

  await nextTick();
  setEditorHtml(cleanValue);
  lastEmittedValue.value = cleanValue;
});
</script>

<style scoped>
.rich-text-editor {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--color-bg-base, #fff);
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 6px;
  border-bottom: 1px solid #dcdfe6;
  background-color: #f5f7fa;
}

.toolbar-btn {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  color: #303133;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  line-height: 26px;
}

.toolbar-btn:hover {
  color: #409eff;
  border-color: #a0cfff;
  background-color: #ecf5ff;
}

.toolbar-btn.strong {
  font-weight: 700;
}

.toolbar-btn.italic {
  font-style: italic;
}

.toolbar-btn.underline {
  text-decoration: underline;
}

.toolbar-btn.strike {
  text-decoration: line-through;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background-color: #dcdfe6;
}

.editor-surface {
  box-sizing: border-box;
  width: 100%;
  padding: 12px;
  outline: none;
  overflow-y: auto;
  color: #303133;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.editor-surface:empty::before {
  color: #a8abb2;
  content: attr(data-placeholder);
  pointer-events: none;
}

.editor-surface :deep(blockquote) {
  margin: 10px 0;
  padding-left: 16px;
  color: #666;
  border-left: 4px solid #409eff;
}

.editor-surface :deep(pre),
.editor-surface :deep(code) {
  padding: 2px 4px;
  border-radius: 4px;
  background-color: #f5f7fa;
  color: #333;
  font-family: 'Courier New', monospace;
}

.editor-surface :deep(a) {
  color: #409eff;
  text-decoration: none;
}

.editor-surface :deep(a:hover) {
  text-decoration: underline;
}

.editor-surface :deep(img) {
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: 4px;
}

.editor-surface :deep(table) {
  width: 100%;
  margin: 10px 0;
  border-collapse: collapse;
}

.editor-surface :deep(table td),
.editor-surface :deep(table th) {
  padding: 8px;
  border: 1px solid #dcdfe6;
}

.editor-surface :deep(table th) {
  background-color: #f5f7fa;
  font-weight: 700;
}
</style>
