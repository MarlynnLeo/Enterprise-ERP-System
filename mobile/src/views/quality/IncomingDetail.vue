<!--
/**
 * IncomingDetail.vue
 * @description 来料检验详情页面（与网页端对齐）
 * @date 2026-04-24
 * @version 3.0.0
 *
 * 功能：
 * - 检验项目列表（自动加载模板或默认项）
 * - 每项可逐项判定合格/不合格
 * - 合格/不合格数量可编辑
 * - 提交检验结果
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
        <Cell title="批次号" :value="inspection.batch_no || '--'" />
        <Cell title="物料名称" :value="inspection.item_name || '--'" />
        <Cell title="供应商" :value="inspection.supplier_name || '--'" />
        <Cell
          title="检验日期"
          :value="formatDate(inspection.actual_date || inspection.created_at)"
        />
      </CellGroup>

      <!-- 数量信息（检验中状态可编辑） -->
      <CellGroup inset title="数量信息">
        <Cell title="到货数量" :value="`${inspection.quantity || 0} ${inspection.unit || '件'}`" />
        <Cell title="抽检数量" :value="`${inspection.sample_size || 0}`" />
      </CellGroup>

      <!-- 检验项目（检验中才显示，可操作） -->
      <div class="inspect-section" v-if="isInspecting || hasInspected">
        <div class="section-header">
          <span class="section-title">检验项目</span>
          <span class="section-hint" v-if="isInspecting">逐项判定</span>
        </div>
        <div class="inspect-items">
          <div
            class="inspect-item"
            v-for="(item, idx) in inspectItems"
            :key="idx"
            :class="{ 'item-passed': item.result === 'passed', 'item-failed': item.result === 'failed' }"
          >
            <div class="item-header">
              <span class="item-name">{{ item.item_name }}</span>
              <span class="item-critical" v-if="item.is_critical">关键</span>
            </div>
            <div class="item-standard" v-if="item.standard">
              标准：{{ item.standard }}
            </div>
            <!-- 尺寸公差显示 -->
            <div class="item-dimension" v-if="item.dimension_value">
              尺寸：{{ formatDimension(item) }}
            </div>
            <!-- 结果判定（检验中可操作） -->
            <div class="item-actions" v-if="isInspecting">
              <button
                class="result-btn btn-pass"
                :class="{ active: item.result === 'passed' }"
                @click="item.result = 'passed'"
              >
                ✓ 合格
              </button>
              <button
                class="result-btn btn-fail"
                :class="{ active: item.result === 'failed' }"
                @click="item.result = 'failed'"
              >
                ✗ 不合格
              </button>
            </div>
            <!-- 已完成结果显示 -->
            <div class="item-result" v-else-if="hasInspected">
              <span :class="item.result === 'passed' ? 'result-pass' : 'result-fail'">
                {{ item.result === 'passed' ? '✓ 合格' : '✗ 不合格' }}
              </span>
            </div>
            <!-- 备注输入 -->
            <Field
              v-if="isInspecting"
              v-model="item.remarks"
              placeholder="备注（可选）"
              size="small"
              class="item-remark"
            />
          </div>
        </div>
      </div>

      <!-- 检验结果录入（检验中可编辑） -->
      <CellGroup v-if="isInspecting" inset title="检验结果录入">
        <Field
          v-model="inspectForm.qualified_quantity"
          type="digit"
          label="合格数量"
          placeholder="请输入合格数量"
          @input="onQualifiedChange"
        />
        <Field
          v-model="inspectForm.unqualified_quantity"
          type="digit"
          label="不合格数量"
          placeholder="自动计算"
          readonly
        />
        <Field
          v-model="inspectForm.inspector_name"
          label="检验员"
          placeholder="请输入检验员姓名"
        />
        <Cell title="合格率" :value="`${computedPassRate}%`" />
      </CellGroup>

      <!-- 已完成的结果展示 -->
      <CellGroup v-else-if="hasInspected" inset title="检验结果">
        <Cell title="合格数" :value="`${inspection.qualified_quantity || 0}`" value-class="pass-text" />
        <Cell
          title="不合格数"
          :value="`${inspection.unqualified_quantity || 0}`"
          value-class="fail-text"
        />
        <Cell title="合格率" :value="`${calculatePassRate(inspection)}%`" />
        <Cell
          v-if="inspection.inspector_name"
          title="检验员"
          :value="inspection.inspector_name"
        />
      </CellGroup>

      <!-- 备注 -->
      <CellGroup v-if="isInspecting" inset title="备注">
        <Field
          v-model="inspectForm.note"
          type="textarea"
          rows="2"
          autosize
          placeholder="请输入检验备注"
        />
      </CellGroup>
      <CellGroup v-else-if="inspection.remark || inspection.note" inset title="备注">
        <Cell :title="inspection.remark || inspection.note" />
      </CellGroup>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="inspection.status === 'pending'" v-permission="'quality:incoming:update'">
        <VanButton round block type="primary" @click="handleStart" :loading="actionLoading">
          开始检验
        </VanButton>
      </div>
      <div class="action-section" v-else-if="isInspecting" v-permission="'quality:incoming:update'">
        <VanButton round block type="success" @click="handleSubmit" :loading="actionLoading">
          提交检验
        </VanButton>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-else class="loading-container">
      <Loading size="36" />
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import {
    NavBar,
    CellGroup,
    Cell,
    Field,
    Button as VanButton,
    Loading,
    showToast,
    showConfirmDialog
  } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()
  const inspection = ref(null)
  const actionLoading = ref(false)
  const inspectItems = ref([])

  // 检验表单
  const inspectForm = reactive({
    qualified_quantity: '',
    unqualified_quantity: '',
    inspector_name: '',
    note: ''
  })

  // 状态判断
  const isInspecting = computed(() => inspection.value?.status === 'in_progress')
  const hasInspected = computed(() => {
    const s = inspection.value?.status
    return ['passed', 'failed', 'completed', 'partial'].includes(s)
  })

  // 计算合格率
  const computedPassRate = computed(() => {
    const q = Number(inspectForm.qualified_quantity) || 0
    const uq = Number(inspectForm.unqualified_quantity) || 0
    const total = q + uq
    if (total === 0) return 0
    return Math.round((q / total) * 100)
  })

  // 合格数量变化自动计算不合格数量
  const onQualifiedChange = () => {
    const totalQty = Number(inspection.value?.quantity) || 0
    const qualifiedQty = Number(inspectForm.qualified_quantity) || 0
    if (qualifiedQty > totalQty) {
      inspectForm.qualified_quantity = String(totalQty)
      inspectForm.unqualified_quantity = '0'
    } else {
      inspectForm.unqualified_quantity = String(totalQty - qualifiedQty)
    }
  }

  const getStatusLabel = (status) => {
    const map = {
      pending: '待检验',
      in_progress: '检验中',
      completed: '已完成',
      passed: '已合格',
      failed: '不合格',
      partial: '部分合格',
      received: '已入库'
    }
    return map[status] || status
  }

  const getStatusClass = (status) => {
    const map = {
      pending: 'pending',
      in_progress: 'in-progress',
      completed: 'completed',
      passed: 'passed',
      failed: 'failed',
      partial: 'partial',
      received: 'received'
    }
    return map[status] || 'default'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const calculatePassRate = (item) => {
    const total = (item.qualified_quantity || 0) + (item.unqualified_quantity || 0)
    if (total === 0) return 0
    return Math.round(((item.qualified_quantity || 0) / total) * 100)
  }

  // 格式化尺寸±公差
  const formatDimension = (item) => {
    const dv = parseFloat(item.dimension_value)
    const upper = parseFloat(item.tolerance_upper) || 0
    const lower = Math.abs(parseFloat(item.tolerance_lower)) || 0
    if (upper === 0 && lower === 0) return dv.toFixed(2)
    return `${dv.toFixed(2)} (+${upper.toFixed(2)}/-${lower.toFixed(2)})`
  }

  // 生成默认检验项目
  const getDefaultItems = () => [
    { item_name: '外观检查', standard: '无明显缺陷', type: 'visual', is_critical: true, result: '', remarks: '' },
    { item_name: '数量检查', standard: '与订单一致', type: 'quantity', is_critical: true, result: '', remarks: '' },
    { item_name: '包装检查', standard: '完好无损', type: 'visual', is_critical: false, result: '', remarks: '' }
  ]

  // 加载详情
  const loadDetail = async () => {
    try {
      // 从通用API获取检验详情
      const response = await qualityApi.getIncomingInspection(route.params.id)
      const data = response?.data?.data || response?.data || response
      if (data && data.id) {
        inspection.value = data

        // 尝试加载检验项目（从详情或独立接口）
        let itemsList = data.items || []
        if (itemsList.length === 0) {
          try {
            const itemsRes = await qualityApi.getInspectionItems(data.id)
            const itemsData = itemsRes?.data?.data || itemsRes?.data || itemsRes
            itemsList = Array.isArray(itemsData) ? itemsData : (itemsData?.items || [])
          } catch (e) {
            console.log('无检验项目数据，使用默认项')
          }
        }

        if (itemsList.length > 0) {
          inspectItems.value = itemsList.map(item => ({
            ...item,
            result: item.result || '',
            remarks: item.remarks || ''
          }))
        } else if (data.status === 'in_progress' || data.status === 'pending') {
          // 无检验项目，使用默认
          inspectItems.value = getDefaultItems()
        }

        // 初始化表单
        inspectForm.qualified_quantity = String(data.qualified_quantity || data.quantity || '')
        inspectForm.unqualified_quantity = String(data.unqualified_quantity || '0')
        inspectForm.inspector_name = data.inspector_name || ''
        inspectForm.note = data.note || data.remark || ''
        return
      }
    } catch (e) {
      console.error('API加载失败，尝试备用方式:', e)
    }

    // 备用：从路由 query 获取
    if (route.query.data) {
      try {
        inspection.value = JSON.parse(route.query.data)
        inspectItems.value = getDefaultItems()
        inspectForm.qualified_quantity = String(inspection.value.quantity || '')
        inspectForm.unqualified_quantity = '0'
      } catch (e) {
        showToast('数据加载失败')
      }
    } else {
      // 通过列表 API 兜底
      try {
        const response = await qualityApi.getIncomingInspections({ id: route.params.id, limit: 1, include_supplier: true })
        const data = response.data || response
        const items = data.items || data.list || data.inspections || []
        if (items.length > 0) {
          inspection.value = items[0]
          inspectItems.value = getDefaultItems()
          inspectForm.qualified_quantity = String(items[0].quantity || '')
          inspectForm.unqualified_quantity = '0'
        } else {
          showToast('未找到检验记录')
        }
      } catch (error) {
        showToast('加载失败')
      }
    }
  }

  // 开始检验
  const handleStart = async () => {
    actionLoading.value = true
    try {
      await qualityApi.startInspection(inspection.value.id)
      showToast('检验已开始')
      inspection.value.status = 'in_progress'
      // 初始化检验项目
      if (inspectItems.value.length === 0) {
        inspectItems.value = getDefaultItems()
      }
      // 初始化合格数量为到货数量
      inspectForm.qualified_quantity = String(inspection.value.quantity || '')
      inspectForm.unqualified_quantity = '0'
    } catch (error) {
      console.error('开始检验失败:', error)
      const msg = error.response?.data?.message || '操作失败'
      showToast(msg)
    } finally {
      actionLoading.value = false
    }
  }

  // 提交检验
  const handleSubmit = async () => {
    // 验证：检验项目是否全部判定
    const unjudgedItems = inspectItems.value.filter(item => !item.result)
    if (unjudgedItems.length > 0) {
      showToast(`还有 ${unjudgedItems.length} 项未判定`)
      return
    }

    // 验证：合格数量
    const qualifiedQty = Number(inspectForm.qualified_quantity) || 0
    const unqualifiedQty = Number(inspectForm.unqualified_quantity) || 0
    if (qualifiedQty + unqualifiedQty <= 0) {
      showToast('请输入有效的合格数量')
      return
    }

    // 自动判定总状态
    const failedCount = inspectItems.value.filter(i => i.result === 'failed').length
    let status = 'passed'
    if (failedCount > 0 && failedCount < inspectItems.value.length) {
      status = unqualifiedQty > 0 ? 'failed' : 'passed'
    } else if (failedCount === inspectItems.value.length) {
      status = 'failed'
    }
    if (unqualifiedQty > 0 && qualifiedQty > 0) {
      status = 'failed' // 有不合格品就标记不合格
    } else if (unqualifiedQty > 0 && qualifiedQty === 0) {
      status = 'failed'
    }

    try {
      await showConfirmDialog({
        title: '确认提交',
        message: `合格 ${qualifiedQty}，不合格 ${unqualifiedQty}\n检验结论：${status === 'passed' ? '合格' : '不合格'}\n\n确定提交吗？`
      })

      actionLoading.value = true

      const submitData = {
        qualified_quantity: qualifiedQty,
        unqualified_quantity: unqualifiedQty,
        status,
        inspector_name: inspectForm.inspector_name,
        actual_date: new Date().toISOString().split('T')[0],
        note: inspectForm.note,
        items: inspectItems.value.map(item => ({
          item_name: item.item_name,
          standard: item.standard,
          type: item.type,
          is_critical: item.is_critical,
          result: item.result,
          remarks: item.remarks,
          actual_value: item.actual_value || '',
          dimension_value: item.dimension_value || null,
          tolerance_upper: item.tolerance_upper || null,
          tolerance_lower: item.tolerance_lower || null
        }))
      }

      await qualityApi.updateIncomingInspection(inspection.value.id, submitData)
      showToast('检验提交成功')

      // 刷新详情
      await loadDetail()
    } catch (error) {
      if (error === 'cancel') return
      console.error('提交检验失败:', error)
      const msg = error.response?.data?.message || '提交失败'
      showToast(msg)
    } finally {
      actionLoading.value = false
    }
  }

  onMounted(() => {
    loadDetail()
  })
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 100px;
  }

  .content-container {
    padding: 12px;
  }

  .status-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 12px;
    text-align: center;
    border: 1px solid var(--glass-border);
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
    &.received {
      background: rgba(44, 207, 176, 0.15);
      color: #2CCFB0;
    }
    &.passed {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }
    &.failed {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    &.partial {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    &.default {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
    }
  }

  .status-card .inspection-no {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  /* 检验项目区域 */
  .inspect-section {
    margin: 12px 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px 8px;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .section-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .inspect-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;
  }

  .inspect-item {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 16px;
    border: 1px solid var(--glass-border);
    transition: border-color 0.2s;

    &.item-passed {
      border-color: rgba(16, 185, 129, 0.4);
    }
    &.item-failed {
      border-color: rgba(239, 68, 68, 0.4);
    }
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .item-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .item-critical {
    font-size: 0.625rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    font-weight: 600;
  }

  .item-standard {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-bottom: 8px;
  }

  .item-dimension {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 8px;
    font-family: 'SF Mono', monospace;
  }

  .item-actions {
    display: flex;
    gap: 10px;
  }

  .result-btn {
    flex: 1;
    padding: 8px 0;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 600;
    border: 1.5px solid;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;

    &.btn-pass {
      border-color: rgba(16, 185, 129, 0.3);
      color: #10b981;
      &.active {
        background: rgba(16, 185, 129, 0.15);
        border-color: #10b981;
      }
    }

    &.btn-fail {
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
      &.active {
        background: rgba(239, 68, 68, 0.15);
        border-color: #ef4444;
      }
    }
  }

  .item-result {
    margin-top: 4px;
  }

  .result-pass {
    color: #10b981;
    font-weight: 600;
    font-size: 0.8125rem;
  }

  .result-fail {
    color: #ef4444;
    font-weight: 600;
    font-size: 0.8125rem;
  }

  .item-remark {
    margin-top: 8px;
    :deep(.van-field__control) {
      font-size: 0.75rem;
    }
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
