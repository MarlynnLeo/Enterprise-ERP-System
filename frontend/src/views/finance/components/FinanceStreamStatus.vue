<!--
  业财四流状态条：AP/AR / 税 / 成本GL / 三单匹配
-->
<template>
  <div class="finance-stream-status" v-loading="loading">
    <div class="stream-header">
      <span class="stream-title">业财闭环</span>
      <el-tag :type="closedLoop ? 'success' : 'warning'" size="small" effect="plain">
        {{ closedLoop ? '已闭环' : '未闭环' }}
      </el-tag>
      <el-button link type="primary" size="small" :loading="loading" @click="load">刷新</el-button>
    </div>
    <div class="stream-chips">
      <div
        v-for="item in chips"
        :key="item.key"
        class="stream-chip"
        :class="item.ok ? 'is-ok' : 'is-pending'"
      >
        <span class="chip-dot" />
        <div class="chip-body">
          <div class="chip-label">{{ item.label }}</div>
          <div class="chip-value">{{ item.value }}</div>
        </div>
      </div>
    </div>
    <div v-if="actions.length" class="stream-actions">
      <el-button
        v-for="act in actions"
        :key="act.key"
        size="small"
        :type="act.type || 'primary'"
        plain
        @click="act.onClick"
      >
        {{ act.label }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index'
import { financeApi } from '@/api/finance'

const props = defineProps({
  /** purchase_receipt | sales_outbound */
  documentType: {
    type: String,
    required: true,
  },
  documentId: {
    type: [Number, String],
    default: null,
  },
})

const router = useRouter()
const loading = ref(false)
const data = ref(null)

const closedLoop = computed(() => !!data.value?.closedLoop)

const chips = computed(() => {
  const s = data.value?.streams || {}
  if (props.documentType === 'purchase_receipt') {
    return [
      {
        key: 'ap',
        label: '应付发票',
        ok: !!s.ap?.ok,
        value: s.ap?.ok ? `${s.ap.number || ''} · ${s.ap.status || ''}` : '未生成',
      },
      {
        key: 'tax',
        label: '进项税票',
        ok: !!s.tax?.ok,
        value: s.tax?.ok ? `${s.tax.number || ''} · ${s.tax.status || ''}` : '未生成',
      },
      {
        key: 'match',
        label: '三单匹配',
        ok: !!s.threeWayMatch?.ok,
        value: s.threeWayMatch?.status
          ? `${s.threeWayMatch.number || ''} · ${s.threeWayMatch.status}`
          : '未匹配',
      },
    ]
  }
  return [
    {
      key: 'ar',
      label: '应收发票',
      ok: !!s.ar?.ok,
      value: s.ar?.ok ? `${s.ar.number || ''} · ${s.ar.status || ''}` : '未生成',
    },
    {
      key: 'tax',
      label: '销项税票',
      ok: !!s.tax?.ok,
      value: s.tax?.ok ? `${s.tax.number || ''} · ${s.tax.status || ''}` : '未生成',
    },
    {
      key: 'cost',
      label: '成本凭证',
      ok: !!s.costGl?.ok,
      value: s.costGl?.ok
        ? `${s.costGl.number || ''} · ${s.costGl.posted ? '已过账' : '未过账'}`
        : '未生成',
    },
  ]
})

const actions = computed(() => {
  const list = []
  const s = data.value?.streams || {}
  if (props.documentType === 'purchase_receipt') {
    list.push({
      key: 'match',
      label: '去三单匹配',
      type: 'primary',
      onClick: () => router.push({ path: '/finance/ap/three-way-match' }),
    })
    list.push({
      key: 'ap',
      label: '应付待结算',
      onClick: () => router.push({ path: '/finance/ap/settlement' }),
    })
    if (!s.tax?.ok && props.documentId) {
      list.push({
        key: 'gen-tax',
        label: '生成进项税票',
        type: 'warning',
        onClick: () => generateSide('tax-input'),
      })
    }
  } else {
    list.push({
      key: 'ar',
      label: '应收待结算',
      type: 'primary',
      onClick: () => router.push({ path: '/finance/ar/settlement' }),
    })
    if (!s.tax?.ok && props.documentId) {
      list.push({
        key: 'gen-tax',
        label: '生成销项税票',
        type: 'warning',
        onClick: () => generateSide('tax-output'),
      })
    }
    if (!s.costGl?.ok && props.documentId) {
      list.push({
        key: 'gen-cost',
        label: '生成成本凭证',
        type: 'warning',
        onClick: () => generateSide('cost'),
      })
    }
  }
  return list
})

async function generateSide(kind) {
  const id = Number(props.documentId)
  if (!id) return
  loading.value = true
  try {
    if (kind === 'tax-input') {
      await financeApi.integration.generateInputTaxFromReceipt(id)
      ElMessage.success('进项税票已生成')
    } else if (kind === 'tax-output') {
      await financeApi.integration.generateOutputTaxFromOutbound(id)
      ElMessage.success('销项税票已生成')
    } else if (kind === 'cost') {
      await financeApi.integration.generateCostEntryFromOutbound(id)
      ElMessage.success('成本凭证已生成')
    }
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '生成失败')
  } finally {
    loading.value = false
  }
}

async function load() {
  const id = Number(props.documentId)
  if (!id) {
    data.value = null
    return
  }
  loading.value = true
  try {
    const api =
      props.documentType === 'purchase_receipt'
        ? financeApi.getPurchaseReceiptFinanceStatus
        : financeApi.getSalesOutboundFinanceStatus
    const res = await api(id)
    data.value = res?.data || res || null
  } catch (e) {
    data.value = null
    // 静默：详情页附带能力，失败不打断主流程
    console.warn('[FinanceStreamStatus]', e?.message || e)
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.documentType, props.documentId],
  () => load(),
  { immediate: false }
)

onMounted(load)

defineExpose({ load })
</script>

<style scoped>
.finance-stream-status {
  margin: 12px 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-lighter, var(--el-border-color-lighter));
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-section, var(--el-fill-color-blank));
}

.stream-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.stream-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-primary, var(--el-text-color-primary));
}

.stream-chips {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.stream-chip {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-extra-light, var(--el-border-color-extra-light));
}

.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.stream-chip.is-ok .chip-dot {
  background: var(--el-color-success);
}

.stream-chip.is-pending .chip-dot {
  background: var(--el-color-warning);
}

.chip-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}

.chip-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.stream-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
</style>
