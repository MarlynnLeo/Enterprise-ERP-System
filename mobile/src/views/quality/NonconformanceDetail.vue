<template>
  <div class="detail-page">
    <NavBar title="不合格品详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="record">
      <div class="status-card">
        <div class="status-badge" :class="statusClass">{{ statusLabel }}</div>
        <div class="record-no">{{ record.ncp_no || '--' }}</div>
      </div>

      <CellGroup inset title="基本信息">
        <Cell title="物料名称" :value="record.material_name || '--'" />
        <Cell title="物料编码" :value="record.material_code || '--'" />
        <Cell title="批次号" :value="record.batch_no || '--'" />
        <Cell title="不合格数量" :value="`${record.quantity ?? 0} ${record.unit || '个'}`" />
        <Cell title="严重程度" :value="severityLabel" />
        <Cell title="发现日期" :value="formatDate(record.created_at)" />
        <Cell title="供应商" :value="record.supplier_name || '--'" />
        <Cell title="责任方" :value="responsiblePartyLabel" />
      </CellGroup>

      <CellGroup inset title="处置信息">
        <Cell title="处置方式" :value="dispositionLabel" />
        <Cell v-if="record.disposition_reason" title="处置原因" :label="record.disposition_reason" />
        <Cell v-if="record.disposition_by" title="处置人" :value="record.disposition_by" />
        <Cell v-if="record.disposition_date" title="处置日期" :value="formatDate(record.disposition_date)" />
      </CellGroup>

      <CellGroup v-if="record.defect_description" inset title="缺陷描述">
        <Cell :title="record.defect_description" />
      </CellGroup>

      <CellGroup v-if="record.note" inset title="备注">
        <Cell :title="record.note" />
      </CellGroup>

      <div class="action-section" v-if="record.status === 'pending'">
        <Button type="primary" block round @click="handleStartProcess">开始处理</Button>
      </div>
      <div class="action-section" v-else-if="record.status === 'processing'">
        <Button type="success" block round @click="handleComplete">完成处理</Button>
      </div>
    </div>

    <div v-else class="loading-container">
      <Loading size="24px">加载中...</Loading>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, CellGroup, Cell, Button, Loading, showToast, showConfirmDialog } from 'vant'
  import { qualityApi } from '@/services/api'

  const route = useRoute()
  const record = ref(null)

  const statusMap = {
    pending: { text: '待处理', class: 'pending' },
    processing: { text: '处理中', class: 'in-progress' },
    completed: { text: '已完成', class: 'completed' },
    closed: { text: '已关闭', class: 'default' }
  }
  const dispositionMap = { return: '退货', rework: '返工', scrap: '报废', concession: '让步接收', pending: '待决定' }
  const severityMap = { critical: '致命', major: '严重', minor: '轻微' }
  const partyMap = { supplier: '供应商', production: '生产', warehouse: '仓库' }

  const statusLabel = computed(() => statusMap[record.value?.status]?.text || record.value?.status || '--')
  const statusClass = computed(() => statusMap[record.value?.status]?.class || 'default')
  const dispositionLabel = computed(() => dispositionMap[record.value?.disposition] || record.value?.disposition || '待决定')
  const severityLabel = computed(() => severityMap[record.value?.severity] || record.value?.severity || '--')
  const responsiblePartyLabel = computed(() => partyMap[record.value?.responsible_party] || record.value?.responsible_party || '--')

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const loadDetail = async () => {
    try {
      const res = await qualityApi.getNonconformanceRecord(route.params.id)
      // ResponseHandler 包裹: { success, data: {...} }
      record.value = res.data?.data || res.data
    } catch {
      showToast('加载详情失败')
    }
  }

  // 开始处理 (pending → processing)
  const handleStartProcess = async () => {
    try {
      await showConfirmDialog({ title: '确认', message: '确定开始处理此不合格品记录？' })
      await qualityApi.processNonconformance(record.value.id, 'start', {})
      showToast('已开始处理')
      record.value.status = 'processing'
    } catch (e) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        const errorMsg = e.response?.data?.message || '操作失败'
        showToast(errorMsg)
      }
    }
  }

  // 完成处理 (processing → completed)
  const handleComplete = async () => {
    try {
      await showConfirmDialog({ title: '确认完成', message: '确定完成此不合格品处理？' })
      await qualityApi.processNonconformance(record.value.id, 'complete', {})
      showToast('处理完成')
      record.value.status = 'completed'
    } catch (e) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        const errorMsg = e.response?.data?.message || '操作失败'
        showToast(errorMsg)
      }
    }
  }

  onMounted(loadDetail)
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background: var(--bg-primary);
  }

  .content-container {
    padding: 12px;
  }

  .status-card {
    background: var(--van-background);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 12px;
    text-align: center;
    border: 1px solid var(--van-border-color);
  }

  .status-card .status-badge {
    display: inline-block;
    padding: 4px 16px;
    border-radius: 20px;
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 8px;

    &.pending {
      background: rgba(255, 170, 0, 0.15);
      color: #ffaa00;
    }
    &.in-progress {
      background: rgba(94, 123, 246, 0.15);
      color: #5E7BF6;
    }
    &.completed {
      background: rgba(44, 207, 176, 0.15);
      color: #2CCFB0;
    }
    &.default {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
    }
  }

  .status-card .record-no {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--van-text-color);
  }

  .action-section {
    padding: 24px 16px;
  }

  .loading-container {
    display: flex;
    justify-content: center;
    padding: 60px 0;
  }
</style>
