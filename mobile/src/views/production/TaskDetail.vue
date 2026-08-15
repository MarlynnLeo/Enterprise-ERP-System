<!--
/**
 * TaskDetail.vue - 生产任务详情
 * @description 统一卡片风格
 * @date 2026-04-15
 * @version 3.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="任务详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="task">
      <!-- 头部卡片 -->
      <div class="hero-card">
        <div class="hero-icon"><SvgIcon name="clipboard-check" size="1.5rem" /></div>
        <div class="hero-info">
          <div class="hero-title">{{ task.productName }}</div>
          <div class="hero-sub">{{ task.code || task.taskCode }}</div>
        </div>
        <div class="hero-status" :class="getStatusAccent(task.status)">
          {{ getStatusText(task.status) }}
        </div>
      </div>

      <!-- 进度卡片 -->
      <div class="progress-card">
        <div class="progress-header">
          <span class="progress-label">完成进度</span>
          <span class="progress-value">{{ task.progress || 0 }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="getProgressClass(task.progress || 0)"
            :style="{ width: (task.progress || 0) + '%' }"
          ></div>
        </div>
        <div class="progress-meta">
          已完成 {{ task.completedQuantity || 0 }} / {{ task.quantity }} {{ task.unit || '件' }}
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">任务编号</span
            ><span class="info-value mono">{{ task.code || task.taskCode }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">产品名称</span
            ><span class="info-value">{{ task.productName }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">产品编码</span
            ><span class="info-value mono">{{ task.productCode || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">工序名称</span
            ><span class="info-value">{{ task.processName || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">任务数量</span
            ><span class="info-value highlight">{{ task.quantity }} {{ task.unit || '件' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">已完成</span
            ><span class="info-value"
              >{{ task.completedQuantity || 0 }} {{ task.unit || '件' }}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">工作中心</span
            ><span class="info-value">{{ task.workCenterName || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">负责人</span
            ><span class="info-value">{{ task.operatorName || task.manager || '—' }}</span>
          </div>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="info-section">
        <div class="section-title">时间信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">计划开始</span
            ><span class="info-value">{{ formatDate(task.plan_start_time) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">计划结束</span
            ><span class="info-value">{{ formatDate(task.plan_end_time) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">实际开始</span
            ><span class="info-value">{{ formatDate(task.actual_start_time) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">实际结束</span
            ><span class="info-value">{{ formatDate(task.actual_end_time) }}</span>
          </div>
        </div>
      </div>

      <!-- 备注 -->
      <div class="info-section" v-if="task.remark">
        <div class="section-title">备注</div>
        <div class="remark-text">{{ task.remark }}</div>
      </div>

      <!-- 操作按钮（与网页端一致） -->
      <div class="action-bar" v-if="showActions">
        <!-- pending状态可删除（网页端只有pending可删除） -->
        <VanButton
          v-if="task.status === 'pending'"
          v-permission="'production:tasks:delete'"
          type="danger"
          plain
          block
          round
          @click="handleDelete"
          >删除任务</VanButton
        >
        <VanButton
          v-if="canShowIssue"
          type="primary"
          block
          round
          :loading="issueLoading"
          @click="handleIssueMaterials"
          >生产发料</VanButton
        >
        <!-- in_progress状态可报工 -->
        <VanButton
          v-if="canApplyMaterial && isRunningTask"
          v-permission="['production:supplement:create', 'production:process:update']"
          type="danger"
          plain
          block
          round
          @click="openMaterialRequest('supplement')"
          >申请补料</VanButton
        >
        <VanButton
          v-if="canApplyMaterial && isRunningTask"
          v-permission="['production:exchange:create', 'production:process:update']"
          type="warning"
          plain
          block
          round
          @click="openMaterialRequest('exchange')"
          >申请换料</VanButton
        >
        <VanButton
          v-if="task.status === 'in_progress'"
          v-permission="'production:tasks:update'"
          type="warning"
          block
          round
          @click="handleReport"
          >生产报工</VanButton
        >
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" /><span>加载中...</span>
    </div>
    <Empty v-else description="任务不存在" />

    <Popup v-model:show="requestVisible" position="bottom" round :style="{ maxHeight: '88%' }">
      <div class="request-sheet">
        <div class="request-title">{{ requestType === 'exchange' ? '申请换料' : '申请补料' }}</div>
        <Field v-model="requestForm.taskCode" label="任务编号" readonly />
        <Field
          v-if="requestType === 'exchange'"
          v-model="requestForm.fromMaterialName"
          is-link
          readonly
          label="退下物料"
          placeholder="选择原物料"
          @click="openMaterialPicker('from')"
        />
        <Field
          v-model="requestForm.toMaterialName"
          is-link
          readonly
          :label="requestType === 'exchange' ? '换上物料' : '补料物料'"
          placeholder="选择物料"
          @click="openMaterialPicker('to')"
        />
        <Field v-model="requestForm.quantity" type="number" label="数量" placeholder="请输入数量" />
        <Field
          v-if="requestType === 'exchange'"
          v-model="requestForm.locationName"
          is-link
          readonly
          label="退回仓库"
          placeholder="选择仓库"
          @click="showLocationPicker = true"
        />
        <Field v-model="requestForm.reason" label="原因" placeholder="如来料不良、规格替换" />
        <Field v-model="requestForm.remark" type="textarea" rows="2" autosize label="说明" placeholder="选填" />
        <div class="request-actions">
          <VanButton block round plain @click="requestVisible = false">取消</VanButton>
          <VanButton block round type="primary" :loading="requestSaving" @click="submitMaterialRequest">
            提交申请
          </VanButton>
        </div>
      </div>
    </Popup>

    <Popup v-model:show="showMaterialPicker" position="bottom" round :style="{ height: '58%' }">
      <div class="picker-sheet">
        <Search v-model="materialKeyword" placeholder="搜索物料名称或编码" @search="searchMaterials" @update:model-value="onMaterialKeyword" />
        <Cell
          v-for="item in materialOptions"
          :key="item.id"
          :title="item.name || item.materialName"
          :label="item.code || item.materialCode"
          is-link
          @click="selectMaterial(item)"
        />
        <Empty v-if="!materialLoading && materialOptions.length === 0" description="输入关键字搜索物料" />
      </div>
    </Popup>
    <Popup v-model:show="showLocationPicker" position="bottom" round>
      <Picker :columns="locationColumns" @confirm="onLocationConfirm" @cancel="showLocationPicker = false" />
    </Popup>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import {
    NavBar,
    Loading,
    Empty,
    Button as VanButton,
    Popup,
    Field,
    Search,
    Cell,
    Picker,
    showToast,
    showConfirmDialog
  } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { productionApi, inventoryApi } from '@/api'
  import { useAuthStore } from '@/stores/auth'
  import dayjs from 'dayjs'

  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()
  const loading = ref(true)
  const issueLoading = ref(false)
  const task = ref(null)

  const canIssueMaterials = computed(() =>
    authStore.hasPermission('inventory:outbound:create') &&
    (authStore.hasPermission('production:tasks:update') || authStore.hasPermission('production:tasks:view'))
  )
  const canApplyMaterial = computed(
    () =>
      authStore.hasPermission('production:supplement:create') ||
      authStore.hasPermission('production:exchange:create') ||
      authStore.hasPermission('production:process:update')
  )
  const isRunningTask = computed(() =>
    ['material_issued', 'material_partial_issued', 'in_progress'].includes(task.value?.status)
  )
  const canShowIssue = computed(() => {
    const s = task.value?.status
    const issued = Number(task.value?.hasOutboundDocument) === 1
    const start = task.value?.startDate || task.value?.planStartTime || task.value?.plan_start_time
    return (
      canIssueMaterials.value &&
      ['pending', 'allocated', 'preparing'].includes(s) &&
      !issued &&
      Boolean(start)
    )
  })

  // 是否显示操作栏
  const showActions = computed(() => {
    const s = task.value?.status
    return (
      s === 'pending' ||
      s === 'allocated' ||
      s === 'preparing' ||
      s === 'in_progress' ||
      canShowIssue.value ||
      (canApplyMaterial.value && isRunningTask.value)
    )
  })

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '—')
  const getStatusAccent = (s) =>
    ({
      draft: 'st-pending',
      pending: 'st-pending',
      allocated: 'st-pending',
      preparing: 'st-progress',
      material_issuing: 'st-progress',
      material_issued: 'st-progress',
      in_progress: 'st-progress',
      inspection: 'st-inspection',
      warehousing: 'st-inspection',
      completed: 'st-completed',
      paused: 'st-paused',
      cancelled: 'st-cancelled'
    })[s] || 'st-default'
  const getStatusText = (s) =>
    ({
      draft: '草稿',
      pending: '待开始',
      allocated: '已分配',
      preparing: '备料中',
      material_issuing: '发料中',
      material_partial_issued: '部分发料',
      material_issued: '已发料',
      in_progress: '生产中',
      inspection: '待检验',
      warehousing: '待入库',
      completed: '已完成',
      paused: '已暂停',
      cancelled: '已取消'
    })[s] || s
  const getProgressClass = (p) => {
    if (p >= 100) return 'fill-green'
    if (p >= 50) return 'fill-blue'
    if (p > 0) return 'fill-yellow'
    return 'fill-low'
  }

  const loadTaskDetail = async () => {
    loading.value = true
    try {
      const response = await productionApi.getProductionTask(route.params.id)
      task.value = response.data || response
    } catch (e) {
      console.error('加载任务详情失败:', e)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  // 生产报工
  const handleReport = () => router.push(`/production/tasks/${task.value.id}/report`)

  const requestVisible = ref(false)
  const requestSaving = ref(false)
  const requestType = ref('supplement')
  const showMaterialPicker = ref(false)
  const showLocationPicker = ref(false)
  const materialPickerTarget = ref('to')
  const materialKeyword = ref('')
  const materialLoading = ref(false)
  const materialOptions = ref([])
  const locationColumns = ref([])
  const requestForm = ref({
    taskCode: '',
    fromMaterialId: '',
    fromMaterialName: '',
    fromUnitId: null,
    toMaterialId: '',
    toMaterialName: '',
    toUnitId: null,
    quantity: '1',
    locationId: null,
    locationName: '',
    reason: '',
    remark: ''
  })

  const openMaterialRequest = async (type) => {
    requestType.value = type
    requestForm.value = {
      taskCode: task.value?.code || task.value?.taskCode || '',
      fromMaterialId: '',
      fromMaterialName: '',
      fromUnitId: null,
      toMaterialId: '',
      toMaterialName: '',
      toUnitId: null,
      quantity: '1',
      locationId: null,
      locationName: '',
      reason: type === 'exchange' ? '规格替换' : '补料',
      remark: ''
    }
    requestVisible.value = true
    try {
      const res = await inventoryApi.getWarehouses()
      const data = res.data || res
      const items = data.items || data.list || data.rows || data || []
      const list = Array.isArray(items) ? items : []
      locationColumns.value = list.map((item) => ({
        text: item.warehouseName || item.locationName || item.name || `仓库#${item.id}`,
        value: item.id
      }))
    } catch {
      locationColumns.value = []
    }
  }

  const openMaterialPicker = (target) => {
    materialPickerTarget.value = target
    materialKeyword.value = ''
    materialOptions.value = []
    showMaterialPicker.value = true
  }

  let materialTimer = null
  const onMaterialKeyword = (val) => {
    clearTimeout(materialTimer)
    if (String(val || '').length >= 1) {
      materialTimer = setTimeout(searchMaterials, 350)
    }
  }

  const searchMaterials = async () => {
    if (!materialKeyword.value) return
    materialLoading.value = true
    try {
      const res = await inventoryApi.getMaterialsList({
        keyword: materialKeyword.value,
        page: 1,
        pageSize: 30
      })
      const data = res.data || res
      const items = data.items || data.list || data.rows || data || []
      materialOptions.value = Array.isArray(items) ? items : []
    } catch {
      materialOptions.value = []
    } finally {
      materialLoading.value = false
    }
  }

  const selectMaterial = (item) => {
    const name = item.name || item.materialName || `物料#${item.id}`
    if (materialPickerTarget.value === 'from') {
      requestForm.value.fromMaterialId = item.id
      requestForm.value.fromMaterialName = name
      requestForm.value.fromUnitId = item.unitId || null
    } else {
      requestForm.value.toMaterialId = item.id
      requestForm.value.toMaterialName = name
      requestForm.value.toUnitId = item.unitId || null
    }
    showMaterialPicker.value = false
  }

  const onLocationConfirm = ({ selectedOptions }) => {
    requestForm.value.locationName = selectedOptions[0]?.text || ''
    requestForm.value.locationId = selectedOptions[0]?.value || null
    showLocationPicker.value = false
  }

  const submitMaterialRequest = async () => {
    if (!requestForm.value.toMaterialId || !requestForm.value.quantity) {
      showToast('请填写物料和数量')
      return
    }
    if (requestType.value === 'exchange' && (!requestForm.value.fromMaterialId || !requestForm.value.locationId)) {
      showToast('换料请选择原物料和退回仓库')
      return
    }
    requestSaving.value = true
    try {
      const operator = authStore.user?.realName || authStore.realName || authStore.user?.name || ''
      await inventoryApi.createOutbound({
        outboundType: requestType.value === 'exchange' ? 'exchange' : 'supplement',
        outboundDate: dayjs().format('YYYY-MM-DD'),
        status: 'draft',
        productionTaskId: task.value.id,
        forceExcess: true,
        issueReason: requestForm.value.reason,
        remark: requestType.value === 'exchange'
          ? `【换料申请】${requestForm.value.remark || requestForm.value.reason}`
          : `【补料申请】${requestForm.value.remark || requestForm.value.reason}`,
        operator,
        items: [
          {
            materialId: requestForm.value.toMaterialId,
            quantity: Number(requestForm.value.quantity),
            unitId: requestForm.value.toUnitId,
            remark: requestForm.value.remark
          }
        ]
      })
      if (requestType.value === 'exchange') {
        await inventoryApi.createInbound({
          inboundDate: dayjs().format('YYYY-MM-DD'),
          locationId: requestForm.value.locationId,
          status: 'draft',
          operator,
          inboundType: 'production_return',
          referenceType: 'production_task',
          referenceId: task.value.id,
          referenceNo: requestForm.value.taskCode,
          remark: `【换料退回】${requestForm.value.remark || requestForm.value.reason}`,
          items: [
            {
              materialId: requestForm.value.fromMaterialId,
              quantity: Number(requestForm.value.quantity),
              unitId: requestForm.value.fromUnitId,
              locationId: requestForm.value.locationId,
              remark: requestForm.value.reason
            }
          ]
        })
      }
      showToast(requestType.value === 'exchange' ? '换料申请已提交，等待仓库确认' : '补料申请已提交，等待仓库确认')
      requestVisible.value = false
    } catch (error) {
      showToast(error.response?.data?.message || error.message || '提交失败')
    } finally {
      requestSaving.value = false
    }
  }

  const handleIssueMaterials = async () => {
    if (!canIssueMaterials.value || !task.value) {
      showToast('无权执行发料')
      return
    }
    try {
      await showConfirmDialog({
        title: '生产发料',
        message: `确认为任务 ${task.value.code || task.value.taskCode} 生成发料出库单？`,
        confirmButtonColor: 'var(--color-primary)'
      })
    } catch {
      return
    }

    issueLoading.value = true
    try {
      const productId = task.value.productId
      if (!productId) {
        showToast('任务缺少产品，无法发料')
        return
      }
      const bomRes = await productionApi.getProductBom(productId)
      const bom = bomRes.data || bomRes
      if (!bom?.id) {
        showToast('该产品没有 BOM，无法生成出库单')
        return
      }
      const materialsRes = await productionApi.calculateMaterials({
        productId,
        bomId: bom.id,
        quantity: Number(task.value.quantity),
        forceAnalysis: true
      })
      const materials = materialsRes.data || materialsRes
      if (!Array.isArray(materials) || materials.length === 0) {
        showToast('该产品 BOM 没有物料明细')
        return
      }
      const operator = authStore.user?.realName || authStore.realName || authStore.user?.name || ''
      if (!operator) {
        showToast('无法识别当前登录用户，请重新登录后再发料')
        return
      }
      await inventoryApi.createOutbound({
        outboundType: 'bom_issue',
        outboundDate: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        operator,
        remark: `生产任务 ${task.value.code || task.value.taskCode} 发料`,
        status: 'draft',
        productionTaskId: task.value.id,
        items: materials.map((material) => ({
          materialId: material.materialId || material.id,
          quantity: material.requiredQuantity,
          unitId: material.unitId,
          remark: `任务${task.value.code || task.value.taskCode}所需`
        }))
      })
      showToast('已生成发料出库草稿')
      router.push('/inventory/outbound')
    } catch (error) {
      showToast(error.response?.data?.message || error.message || '发料失败')
    } finally {
      issueLoading.value = false
    }
  }

  // 删除任务（仅pending状态，与网页端一致）
  const handleDelete = async () => {
    try {
      await showConfirmDialog({
        title: '删除确认',
        message: '确定要删除该生产任务吗？此操作无法恢复。',
        confirmButtonColor: 'var(--color-danger)'
      })
      await productionApi.deleteProductionTask(task.value.id)
      showToast('已删除')
      router.back()
    } catch (e) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        const errorMsg = e.response?.data?.message || '操作失败'
        showToast(errorMsg)
      }
    }
  }

  onMounted(() => loadTaskDetail())
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
    background: var(--bg-primary);
    padding-bottom: var(--app-bottom-space);
  }
  .detail-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .hero-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border, var(--border-subtle));
  }
  .hero-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(168, 85, 247, 0.1);
    color: var(--module-purple);
    flex-shrink: 0;
  }
  .hero-info {
    flex: 1;
    min-width: 0;
  }
  .hero-title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hero-sub {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-top: 2px;
    font-family: 'SF Mono', monospace;
  }
  .hero-status {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.6875rem;
    font-weight: 700;
    flex-shrink: 0;
    &.st-pending {
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-secondary);
    }
    &.st-progress {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
    &.st-inspection {
      background: rgba(168, 85, 247, 0.12);
      color: var(--module-purple);
    }
    &.st-completed {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.st-paused {
      background: rgba(249, 115, 22, 0.12);
      color: var(--module-orange);
    }
    &.st-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-danger);
    }
  }

  .progress-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border, var(--border-subtle));
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .progress-label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }
  .progress-value {
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--text-primary);
    font-family: 'SF Mono', monospace;
  }
  .progress-bar {
    height: 8px;
    background: var(--surface-border, var(--border-subtle));
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s;
    &.fill-green {
      background: linear-gradient(90deg, var(--color-success), var(--ds-green-strong));
    }
    &.fill-blue {
      background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    }
    &.fill-yellow {
      background: linear-gradient(90deg, var(--color-warning), var(--color-warning));
    }
    &.fill-low {
      background: linear-gradient(90deg, var(--color-danger), var(--color-danger));
    }
  }
  .progress-meta {
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .info-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border, var(--border-subtle));
  }
  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .info-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .info-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    &.mono {
      font-family: 'SF Mono', monospace;
    }
    &.highlight {
      color: var(--module-purple);
      font-weight: 700;
    }
  }
  .remark-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .action-bar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
  .request-sheet,
  .picker-sheet {
    padding: 16px 16px calc(16px + var(--safe-area-bottom, 0px));
  }
  .request-title {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .request-actions {
    display: flex;
    gap: 10px;
    margin-top: 12px;
  }
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 40vh;
    color: var(--text-tertiary);
  }
</style>
