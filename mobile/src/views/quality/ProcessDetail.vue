<!--
/**
 * ProcessDetail.vue
 * @description 过程检验详情页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="过程检验详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="inspection">
      <!-- 状态卡片 -->
      <div class="status-card">
        <div class="status-badge" :class="getStatusClass(inspection.status)">
          {{ getStatusLabel(inspection.status) }}
        </div>
        <div class="inspection-no">
          {{ inspection.inspectionNo }}
        </div>
      </div>

      <!-- 基本信息 -->
      <CellGroup inset title="基本信息">
        <Cell title="工单号" :value="inspection.referenceNo || '--'" />
        <Cell title="生产工序" :value="inspection.processName || '--'" />
        <Cell title="产品名称" :value="inspection.itemName || inspection.productName || '--'" />
        <Cell
          title="检验日期"
          :value="formatDate(inspection.actualDate || inspection.createdAt)"
        />
      </CellGroup>

      <!-- 数量信息 -->
      <CellGroup inset title="数量信息">
        <Cell title="待检数量" :value="`${inspection.quantity || 0} ${inspection.unit || '件'}`" />
        <Cell title="抽检数量" :value="`${inspection.sampleSize || 0}`" />
      </CellGroup>

      <!-- 检验结果 -->
      <CellGroup v-if="inspection.status !== 'pending'" inset title="检验结果录入">
        <Field
          v-model="inspectForm.qualifiedQuantity"
          type="digit"
          label="合格数量"
          placeholder="请输入有效合格数"
          :readonly="inspection.status !== 'in_progress'"
        />
        <Field
          v-model="inspectForm.unqualifiedQuantity"
          type="digit"
          label="不合格数量"
          placeholder="请输入不合格数"
          :readonly="inspection.status !== 'in_progress'"
        />
        <Cell title="合格率" :value="`${calculatePassRate()}%`" />
      </CellGroup>

      <!-- 备注 -->
      <CellGroup inset title="备注">
        <Field
          v-model="inspectForm.note"
          type="textarea"
          rows="2"
          autosize
          label="备注录入"
          placeholder="请输入补充说明"
          :readonly="inspection.status !== 'in_progress' && inspection.status !== 'pending'"
        />
      </CellGroup>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="inspection.status === 'pending'" v-permission="'quality:inspections:update'">
        <Button round block type="primary" @click="handleStart"> 开始检验 </Button>
      </div>
      <div class="action-section" v-else-if="inspection.status === 'in_progress'" v-permission="'quality:inspections:update'">
        <Button round block type="success" @click="handleComplete"> 提交并完成检验 </Button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-else class="loading-container">
      <Loading size="36" />
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, reactive } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import {
    NavBar,
    CellGroup,
    Cell,
    Field,
    Button,
    Loading,
    showToast,
    showConfirmDialog
  } from 'vant'
  import { qualityApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'

  const router = useRouter()
  const route = useRoute()
  const inspection = ref(null)

  const inspectForm = reactive({
    qualifiedQuantity: 0,
    unqualifiedQuantity: 0,
    note: ''
  })

  const getStatusLabel = (status) => {
    const map = {
      pending: '待检验',
      in_progress: '检验中',
      completed: '已完成',
      passed: '已合格',
      failed: '不合格'
    }
    return map[status] || status
  }

  const getStatusClass = (status) => {
    const map = {
      pending: 'pending',
      in_progress: 'in-progress',
      completed: 'completed',
      passed: 'received',
      failed: 'failed'
    }
    return map[status] || 'default'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const calculatePassRate = () => {
    const q = Number(inspectForm.qualifiedQuantity) || 0
    const uq = Number(inspectForm.unqualifiedQuantity) || 0
    const total = q + uq
    if (total === 0) return 0
    return Math.round((q / total) * 100)
  }

  const loadDetail = () => {
    if (route.query.data) {
      try {
        inspection.value = JSON.parse(route.query.data)
        inspectForm.qualifiedQuantity =
          inspection.value.qualifiedQuantity ?? inspection.value.quantity ?? 0
        inspectForm.unqualifiedQuantity = inspection.value.unqualifiedQuantity || 0
        inspectForm.note = inspection.value.note || ''
      } catch (e) {
        console.error('解析检验数据失败:', e)
        showToast('数据加载失败')
      }
    } else {
      loadFromApi()
    }
  }

  const loadFromApi = async () => {
    try {
      const response = await qualityApi.getProcessInspection(route.params.id)
      const data = extractApiData(response, null)
      if (data?.id) {
        inspection.value = data
        inspectForm.qualifiedQuantity =
          inspection.value.qualifiedQuantity ?? inspection.value.quantity ?? 0
        inspectForm.unqualifiedQuantity = inspection.value.unqualifiedQuantity || 0
        inspectForm.note = inspection.value.note || ''
      } else {
        showToast('未找到检验记录')
      }
    } catch (error) {
      console.error('加载详情失败:', error)
      showToast('加载失败')
    }
  }

  const handleStart = async () => {
    try {
      await qualityApi.startInspection(inspection.value.id)
      showToast('检验已开始')
      inspection.value.status = 'in_progress'
    } catch (error) {
      console.error('开始检验失败:', error)
      showToast('操作失败')
    }
  }

  const handleComplete = async () => {
    const q = Number(inspectForm.qualifiedQuantity) || 0
    const uq = Number(inspectForm.unqualifiedQuantity) || 0
    if (q + uq <= 0) {
      showToast('请输入有效的数量')
      return
    }

    try {
      await showConfirmDialog({ title: '确认完成', message: '确定完成此次检验记录提交吗？' })
      const status = uq > 0 ? 'failed' : 'passed'
      // 纯 camel，后端 qualityInspectionMap.fromApi
      await qualityApi.completeInspection(inspection.value.id, {
        qualifiedQuantity: q,
        unqualifiedQuantity: uq,
        status,
        note: inspectForm.note
      })
      showToast('检验已完成')
      inspection.value.status = status
      setTimeout(() => {
        router.go(-1)
      }, 1000)
    } catch (error) {
      if (error === 'cancel') return
      console.error('完成检验失败:', error)
      showToast('操作失败')
    }
  }

  onMounted(() => {
    loadDetail()
  })
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
    background-color: var(--van-background-2);
    padding-bottom: var(--app-bottom-space);
  }
  .content-container {
    padding: 12px 0;
  }
  .status-card {
    background: var(--van-background);
    margin: 0 16px 12px;
    padding: 20px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: none;
  }
  .status-badge {
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 8px;
    &.pending { background: rgba(255, 170, 0, 0.15); color: #ffaa00; }
    &.in-progress { background: rgba(94, 123, 246, 0.15); color: #5E7BF6; }
    &.completed, &.received { background: color-mix(in srgb, var(--color-success) 15%, transparent); color: var(--color-success); }
    &.failed { background: rgba(239, 68, 68, 0.15); color: var(--color-error); }
  }

  .inspection-no {
    font-size: 1.125rem;
    font-weight: bold;
    color: var(--van-text-color);
  }
  .action-section {
    margin: 24px 16px;
  }
  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 60vh;
  }
</style>
