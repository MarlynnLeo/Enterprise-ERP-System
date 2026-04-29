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
          {{ inspection.inspection_number || inspection.inspection_no }}
        </div>
      </div>

      <!-- 基本信息 -->
      <CellGroup inset title="基本信息">
        <Cell title="工单号" :value="inspection.reference_no || '--'" />
        <Cell title="生产工序" :value="inspection.process_name || '--'" />
        <Cell title="产品名称" :value="inspection.item_name || '--'" />
        <Cell
          title="检验日期"
          :value="formatDate(inspection.actual_date || inspection.created_at)"
        />
      </CellGroup>

      <!-- 数量信息 -->
      <CellGroup inset title="数量信息">
        <Cell title="待检数量" :value="`${inspection.quantity || 0} ${inspection.unit || '件'}`" />
        <Cell title="抽检数量" :value="`${inspection.sample_size || 0}`" />
      </CellGroup>

      <!-- 检验结果 -->
      <CellGroup v-if="inspection.status !== 'pending'" inset title="检验结果录入">
        <Field
          v-model="inspectForm.qualified_quantity"
          type="digit"
          label="合格数量"
          placeholder="请输入有效合格数"
          :readonly="inspection.status !== 'in_progress'"
        />
        <Field
          v-model="inspectForm.unqualified_quantity"
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
          v-model="inspectForm.remark"
          type="textarea"
          rows="2"
          autosize
          label="备注录入"
          placeholder="请输入补充说明"
          :readonly="inspection.status !== 'in_progress' && inspection.status !== 'pending'"
        />
      </CellGroup>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="inspection.status === 'pending'" v-permission="'quality:process:update'">
        <Button round block type="primary" @click="handleStart"> 开始检验 </Button>
      </div>
      <div class="action-section" v-else-if="inspection.status === 'in_progress'" v-permission="'quality:process:update'">
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
  import { qualityApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()
  const inspection = ref(null)

  const inspectForm = reactive({
    qualified_quantity: 0,
    unqualified_quantity: 0,
    remark: ''
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
    const q = Number(inspectForm.qualified_quantity) || 0
    const uq = Number(inspectForm.unqualified_quantity) || 0
    const total = q + uq
    if (total === 0) return 0
    return Math.round((q / total) * 100)
  }

  const loadDetail = () => {
    if (route.query.data) {
      try {
        inspection.value = JSON.parse(route.query.data)
        inspectForm.qualified_quantity =
          inspection.value.qualified_quantity || inspection.value.quantity || 0
        inspectForm.unqualified_quantity = inspection.value.unqualified_quantity || 0
        inspectForm.remark = inspection.value.remark || ''
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
      const response = await qualityApi.getProcessInspections({ id: route.params.id, limit: 1 })
      const data = response.data || response
      const items = data.items || data.list || data.inspections || []
      if (items.length > 0) {
        inspection.value = items[0]
        inspectForm.qualified_quantity =
          inspection.value.qualified_quantity || inspection.value.quantity || 0
        inspectForm.unqualified_quantity = inspection.value.unqualified_quantity || 0
        inspectForm.remark = inspection.value.remark || ''
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
    const q = Number(inspectForm.qualified_quantity) || 0
    const uq = Number(inspectForm.unqualified_quantity) || 0
    if (q + uq <= 0) {
      showToast('请输入有效的数量')
      return
    }

    try {
      await showConfirmDialog({ title: '确认完成', message: '确定完成此次检验记录提交吗？' })
      await qualityApi.completeInspection(inspection.value.id, {
        qualified_quantity: q,
        unqualified_quantity: uq,
        status: 'completed',
        remark: inspectForm.remark
      })
      showToast('检验已完成')
      inspection.value.status = 'completed'
      setTimeout(() => {
        router.go(-1)
      }, 1000)
    } catch (error) {
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
    min-height: 100vh;
    background-color: var(--van-background-2);
    padding-bottom: 80px;
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
    &.completed, &.received { background: rgba(44, 207, 176, 0.15); color: #2CCFB0; }
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
