<!--
  AppDialog — 全站对话框唯一入口（布局 SSOT）

  mode:
    - view    查看详情：居中普通弹窗（与新增/编辑同形态），内容区可滚动
    - form    新建/编辑：居中弹窗，限高可滚动
    - preview 文件/文档预览：默认大窗，可切换全屏

  说明：查看 ≠ 浏览器全屏；单据详情应与「新增订单」一样是中间对话框。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="resolvedWidth"
    :align-center="!resolvedFullscreen"
    :fullscreen="resolvedFullscreen"
    :append-to-body="true"
    :destroy-on-close="destroyOnClose"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="closeOnPressEscape"
    :show-close="showClose"
    :draggable="(mode === 'form' || mode === 'view') && draggable"
    :class="dialogClass"
    :before-close="beforeClose"
    @update:model-value="onUpdateVisible"
    @open="$emit('open')"
    @opened="$emit('opened')"
    @close="$emit('close')"
    @closed="$emit('closed')"
  >
    <template v-if="$slots.header || mode === 'preview'" #header>
      <div class="app-dialog__header">
        <div class="app-dialog__title">
          <slot name="header">
            <span>{{ title }}</span>
          </slot>
        </div>
        <div v-if="mode === 'preview'" class="app-dialog__header-actions">
          <el-button
            :icon="previewFullscreen ? Close : FullScreen"
            circle
            size="small"
            :title="previewFullscreen ? '退出全屏' : '全屏显示'"
            @click="previewFullscreen = !previewFullscreen"
          />
        </div>
      </div>
    </template>

    <div v-loading="loading" :class="bodyClass">
      <slot />
    </div>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Close, FullScreen } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** view | form | preview */
  mode: {
    type: String,
    default: 'form',
    validator: (v) => ['view', 'form', 'preview'].includes(v)
  },
  title: { type: String, default: '' },
  /**
   * 弹窗宽度：
   * - form 默认 640px
   * - view 默认 800px（与常见业务详情一致）
   * - wide 时使用 92%（上限见 CSS）
   */
  width: { type: [String, Number], default: '' },
  destroyOnClose: { type: Boolean, default: true },
  closeOnClickModal: { type: Boolean, default: true },
  closeOnPressEscape: { type: Boolean, default: true },
  showClose: { type: Boolean, default: true },
  draggable: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** view 内容区内边距宽度语义：default | wide | full（仅样式，不再全屏） */
  contentWidth: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'wide', 'full'].includes(v)
  },
  /** 宽弹窗（订单/明细类）：宽度约 92%，max 1280px */
  wide: { type: Boolean, default: false },
  customClass: { type: [String, Array, Object], default: '' },
  beforeClose: { type: Function, default: undefined }
})

const emit = defineEmits([
  'update:modelValue',
  'open',
  'opened',
  'close',
  'closed'
])

/** 仅 preview 可全屏；默认不全屏，用户可点按钮 */
const previewFullscreen = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.mode === 'preview') {
      previewFullscreen.value = false
    }
  }
)

const resolvedFullscreen = computed(() => {
  // view / form 永远不是浏览器全屏
  if (props.mode === 'preview') return previewFullscreen.value
  return false
})

const resolvedWidth = computed(() => {
  if (resolvedFullscreen.value) return '100%'
  // 仅 wide 属性控制弹窗变宽；content-width 只影响内容区内边距语义
  if (props.wide) return '92%'
  if (props.width !== '' && props.width != null) return props.width
  // 默认宽度：查看略宽于表单（与常见业务详情 800px 一致）
  if (props.mode === 'view') return props.contentWidth === 'wide' ? '90%' : '800px'
  if (props.mode === 'preview') return '90%'
  return '640px'
})

const dialogClass = computed(() => {
  const parts = ['app-dialog', `app-dialog--${props.mode}`]
  // view 与 form 共用居中限高壳
  if (props.mode === 'view' || props.mode === 'form') {
    parts.push('app-dialog--modal')
  }
  if (props.wide || (props.mode === 'view' && props.contentWidth === 'wide')) {
    parts.push('app-dialog--form-wide')
  }
  if (props.customClass) {
    if (typeof props.customClass === 'string') parts.push(props.customClass)
    else return [parts.join(' '), props.customClass]
  }
  return parts.join(' ')
})

const bodyClass = computed(() => {
  if (props.mode === 'view') {
    const map = {
      default: 'app-dialog-view-body',
      wide: 'app-dialog-view-body app-dialog-view-body--wide',
      full: 'app-dialog-view-body app-dialog-view-body--full'
    }
    return map[props.contentWidth] || map.default
  }
  if (props.mode === 'preview') return 'app-dialog-preview-body'
  return 'app-dialog-form-body'
})

const onUpdateVisible = (val) => {
  emit('update:modelValue', val)
}
</script>

<style scoped>
.app-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding-right: 36px;
  box-sizing: border-box;
}

.app-dialog__title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, var(--el-text-color-primary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-dialog__header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
