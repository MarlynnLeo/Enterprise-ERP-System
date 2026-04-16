<!--
/**
 * IncomingDetail.vue
 * @description 来料检验详情页面
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="来料检验详情" left-arrow @click-left="$router.go(-1)" />

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
        <Cell title="批次号" :value="inspection.batch_number || '--'" />
        <Cell title="物料名称" :value="inspection.material_name || '--'" />
        <Cell title="供应商" :value="inspection.supplier_name || '--'" />
        <Cell
          title="检验日期"
          :value="formatDate(inspection.inspection_date || inspection.created_at)"
        />
      </CellGroup>

      <!-- 数量信息 -->
      <CellGroup inset title="数量信息">
        <Cell title="到货数量" :value="`${inspection.quantity || 0} ${inspection.unit || '件'}`" />
        <Cell title="抽检数量" :value="`${inspection.sample_size || 0}`" />
      </CellGroup>

      <!-- 检验结果 -->
      <CellGroup v-if="inspection.status !== 'pending'" inset title="检验结果">
        <Cell title="合格数" :value="`${inspection.pass_quantity || 0}`" value-class="pass-text" />
        <Cell
          title="不合格数"
          :value="`${inspection.fail_quantity || 0}`"
          value-class="fail-text"
        />
        <Cell title="合格率" :value="`${calculatePassRate(inspection)}%`" />
        <Cell
          v-if="inspection.result"
          title="检验结论"
          :value="inspection.result === 'pass' ? '合格' : '不合格'"
        />
      </CellGroup>

      <!-- 备注 -->
      <CellGroup v-if="inspection.remark" inset title="备注">
        <Cell :title="inspection.remark" />
      </CellGroup>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="inspection.status === 'pending'">
        <Button round block type="primary" @click="handleStart"> 开始检验 </Button>
      </div>
      <div class="action-section" v-else-if="inspection.status === 'in_progress'">
        <Button round block type="success" @click="handleComplete"> 完成检验 </Button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-else class="loading-container">
      <Loading size="36" />
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { NavBar, CellGroup, Cell, Button, Loading, showToast, showConfirmDialog } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()
  const inspection = ref(null)

  const getStatusLabel = (status) => {
    const map = {
      pending: '待检验',
      in_progress: '检验中',
      completed: '已完成',
      received: '已入库'
    }
    return map[status] || status
  }

  const getStatusClass = (status) => {
    const map = {
      pending: 'pending',
      in_progress: 'in-progress',
      completed: 'completed',
      received: 'received'
    }
    return map[status] || 'default'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const calculatePassRate = (item) => {
    const total = (item.pass_quantity || 0) + (item.fail_quantity || 0)
    if (total === 0) return 0
    return Math.round(((item.pass_quantity || 0) / total) * 100)
  }

  // 加载详情 — 从路由 query 中获取（后端暂无单条详情接口）
  const loadDetail = () => {
    if (route.query.data) {
      try {
        inspection.value = JSON.parse(route.query.data)
      } catch (e) {
        console.error('解析检验数据失败:', e)
        showToast('数据加载失败')
      }
    } else {
      // 没有传参数，尝试从列表 API 按 ID 过滤
      loadFromApi()
    }
  }

  const loadFromApi = async () => {
    try {
      const response = await qualityApi.getIncomingInspections({ id: route.params.id, limit: 1 })
      const data = response.data || response
      const items = data.items || data.list || data.inspections || []
      if (items.length > 0) {
        inspection.value = items[0]
      } else {
        showToast('未找到检验记录')
      }
    } catch (error) {
      console.error('加载详情失败:', error)
      showToast('加载失败')
    }
  }

  // 开始检验
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

  // 完成检验
  const handleComplete = async () => {
    try {
      await showConfirmDialog({ title: '确认完成', message: '确定完成此次检验吗？' })
      await qualityApi.completeInspection(inspection.value.id, {
        qualified_quantity: inspection.value.quantity,
        unqualified_quantity: 0
      })
      showToast('✓ 检验完成')
      inspection.value.status = 'passed'
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

<style scoped>
  .detail-page {
    min-height: 100vh;
    background-color: var(--van-background-2);
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
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .status-card .inspection-no {
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

  :deep(.pass-text) {
    color: var(--color-success) !important;
  }

  :deep(.fail-text) {
    color: var(--color-error) !important;
  }
</style>
