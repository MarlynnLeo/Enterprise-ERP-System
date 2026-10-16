<template>
  <div class="detail-page">
    <NavBar title="不合格品详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="record">
      <div class="status-card">
        <div class="status-badge" :class="statusClass">{{ statusLabel }}</div>
        <div class="record-no">{{ record.ncpNo || '--' }}</div>
      </div>

      <CellGroup inset title="基本信息">
        <Cell title="物料名称" :value="record.materialName || '--'" />
        <Cell title="物料编码" :value="record.materialCode || '--'" />
        <Cell title="批次号" :value="record.batchNo || '--'" />
        <Cell title="不合格数量" :value="`${record.quantity ?? 0} ${record.unit || '个'}`" />
        <Cell title="严重程度" :value="severityLabel" />
        <Cell title="发现日期" :value="formatDate(record.createdAt)" />
        <Cell title="供应商" :value="record.supplierName || '--'" />
        <Cell title="责任方" :value="responsiblePartyLabel" />
      </CellGroup>

      <CellGroup inset title="处置信息">
        <Cell title="处置方式" :value="dispositionLabel" />
        <Cell v-if="record.dispositionReason" title="处置原因" :label="record.dispositionReason" />
        <Cell v-if="record.dispositionBy" title="处置人" :value="record.dispositionBy" />
        <Cell v-if="record.dispositionDate" title="处置日期" :value="formatDate(record.dispositionDate)" />
      </CellGroup>

      <div v-if="['pending', 'processing'].includes(record.status)" v-permission="'quality:nonconforming:update'"><CellGroup inset title="处置决策">
        <Field label="处置方式" :model-value="dispositionMap[decision.disposition] || ''" readonly is-link placeholder="请选择处置方式" @click="picker = 'disposition'" />
        <Field label="责任方" :model-value="partyMap[decision.responsibleParty] || ''" readonly is-link placeholder="请选择责任方" @click="picker = 'responsibleParty'" />
        <Field label="处置原因" v-model="decision.dispositionReason" type="textarea" placeholder="请输入原因和处理要求" />
        <Cell v-if="decision.disposition === 'use_as_is'" title="特采需独立审批" label="先保存处置决定，再提交特采申请；经审批通过后由系统执行放行。" />
        <Button block :loading="saving" @click="saveDecision">保存处置决定</Button>
      </CellGroup></div>
      <Popup :show="!!picker" position="bottom" round @update:show="value => { if (!value) picker = '' }">
        <Picker :columns="picker === 'disposition' ? dispositionOptions : partyOptions" @confirm="chooseDecision" @cancel="picker = ''" />
      </Popup>
      <CellGroup v-if="record.disposition === 'use_as_is'" inset title="特采申请与审批">
        <Cell title="审批状态" :value="({ pending: '待审批', approved: '已批准', rejected: '已驳回' })[record.concessionStatus] || '未申请'" />
        <Field v-model="concessionReason" label="申请理由" placeholder="请说明让步接收理由" />
        <Button v-if="!record.concessionStatus || record.concessionStatus === 'rejected'" v-permission="'quality:nonconforming:update'" block :loading="saving" @click="submitConcession">提交特采申请</Button>
        <div v-if="record.concessionStatus === 'pending'" v-permission="'quality:nonconforming:approve'">
          <Button block :loading="saving" @click="reviewConcession('approved')">批准特采</Button>
          <Button block :loading="saving" @click="reviewConcession('rejected')">驳回特采</Button>
        </div>
      </CellGroup>
      <CellGroup v-if="record.status === 'completed' && record.disposition === 'rework'" inset title="后续返工">
        <Cell title="已生成返工任务" label="分配负责人并完成返工后，继续填写独立复检单。" />
        <Button v-permission="'quality:rework:view'" block @click="router.push({ path: '/quality/rework', query: { ncpId: record.id } })">查看返工任务</Button>
      </CellGroup>
      <CellGroup v-if="record.defectDescription" inset title="缺陷描述">
        <Cell :title="record.defectDescription" />
      </CellGroup>

      <CellGroup v-if="record.note" inset title="备注">
        <Cell :title="record.note" />
      </CellGroup>

      <div class="action-section" v-permission="'quality:nonconforming:update'" v-if="record.status === 'pending'">
        <Button type="primary" block round @click="handleStartProcess">开始处理</Button>
      </div>
      <div class="action-section" v-permission="'quality:nonconforming:update'" v-else-if="record.status === 'processing'">
        <Button type="success" block round @click="handleComplete">完成处理</Button>
      </div>
    </div>

    <div v-else-if="loading" class="loading-container">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else class="error-container">
      <Empty :description="errorMessage || '不合格品记录不存在或已被删除'" />
      <div class="error-actions">
        <Button type="primary" size="small" :loading="loading" @click="loadDetail">重试</Button>
        <Button type="default" size="small" @click="goBack">返回列表</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Field, Popup, Picker, NavBar, CellGroup, Cell, Button, Loading, Empty, showToast, showConfirmDialog } from 'vant'
  import { qualityApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'
  import { getApiErrorMessage } from '@/utils/errorHandler'

  const route = useRoute()
  const router = useRouter()
  const record = ref(null)
  const loading = ref(true)
  const errorMessage = ref('')
  const decision = ref({ disposition: '', dispositionReason: '', responsibleParty: '' })
  const picker = ref('')
  const saving = ref(false)
  const concessionReason = ref('')

  const statusMap = {
    pending: { text: '待处理', class: 'pending' },
    processing: { text: '处理中', class: 'in-progress' },
    completed: { text: '已完成', class: 'completed' },
    closed: { text: '已关闭', class: 'default' }
  }
  const dispositionMap = { return: '退货', rework: '返工', scrap: '报废', concession: '让步接收', use_as_is: '让步接收（特采）', replacement: '换货', pending: '待决定' }
  const severityMap = { critical: '致命', major: '严重', minor: '轻微' }
  const partyMap = { internal: '内部', supplier: '供应商', unknown: '未知' }

  const statusLabel = computed(() => statusMap[record.value?.status]?.text || record.value?.status || '--')
  const statusClass = computed(() => statusMap[record.value?.status]?.class || 'default')
  const dispositionLabel = computed(() => dispositionMap[record.value?.disposition] || record.value?.disposition || '待决定')
  const severityLabel = computed(() => severityMap[record.value?.severity] || record.value?.severity || '--')
  const responsiblePartyLabel = computed(() => partyMap[record.value?.responsibleParty] || record.value?.responsibleParty || '--')

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const loadDetail = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      const res = await qualityApi.getNonconformanceRecord(route.params.id)
      record.value = extractApiData(res, null)
      if (record.value) decision.value = { disposition: record.value.disposition === 'pending' ? '' : record.value.disposition,
        responsibleParty: record.value.responsibleParty || '', dispositionReason: record.value.dispositionReason || '' }
      if (!record.value) {
        errorMessage.value = '不合格品记录不存在或已被删除'
      }
    } catch (error) {
      console.error('加载不合格品详情失败:', error)
      record.value = null
      const fallback = error?.response?.status === 403
        ? '没有权限查看此不合格品记录'
        : error?.response?.status === 404
          ? '不合格品记录不存在或已被删除'
          : '加载失败，请重试'
      errorMessage.value = error?.response?.status === 403 || error?.response?.status === 404
        ? fallback
        : getApiErrorMessage(error, fallback)
      showToast(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  const dispositionOptions = Object.entries(dispositionMap).filter(([value]) => !['pending','concession'].includes(value)).map(([value,text]) => ({ value,text }))
  const partyOptions = Object.entries(partyMap).map(([value,text]) => ({ value,text }))
  const chooseDecision = ({ selectedOptions }) => {
    if (selectedOptions[0]) decision.value[picker.value] = selectedOptions[0].value
    picker.value = ''
  }
  const saveDecision = async () => {
    if (saving.value) return
    if (!decision.value.disposition || !decision.value.responsibleParty || !decision.value.dispositionReason.trim()) { showToast('请填写处置方式、责任方和处置原因'); return }
    if (!Object.hasOwn(partyMap, decision.value.responsibleParty)) { showToast('请选择有效的责任方'); return }
    if ((['return','replacement'].includes(decision.value.disposition) || decision.value.responsibleParty === 'supplier') && !record.value.supplierId) { showToast('此记录缺少供应商，请在电脑端补齐供应商后处理'); return }
    saving.value = true
    try {
      await qualityApi.processNonconformance(record.value.id, 'disposition', { ...decision.value, supplierId: record.value.supplierId })
      await loadDetail()
      showToast('处置决定已保存')
    } catch (error) { showToast(getApiErrorMessage(error, '保存处置失败')) }
    finally { saving.value = false }
  }
  const submitConcession = async () => {
    if (!concessionReason.value.trim()) { showToast('请填写特采申请理由'); return }
    if (saving.value) return
    saving.value = true
    try {
      await qualityApi.applyConcession(record.value.id, { reason: concessionReason.value.trim() })
      await loadDetail()
      showToast('特采申请已提交')
    } catch (error) { showToast(getApiErrorMessage(error, '特采申请失败')) }
    finally { saving.value = false }
  }
  const reviewConcession = async status => {
    if (saving.value) return
    try {
      await showConfirmDialog({ title: '确认特采审批', message: status === 'approved' ? '批准后系统将执行让步放行，确认批准？' : '确认驳回特采申请？' })
      saving.value = true
      await qualityApi.approveConcession(record.value.id, { status })
      await loadDetail()
      showToast('审批已完成')
    } catch (error) { if (error !== 'cancel') showToast(getApiErrorMessage(error, '特采审批失败')) }
    finally { saving.value = false }
  }
  const goBack = () => router.back()

  // 开始处理 (pending → processing)
  const handleStartProcess = async () => {
    try {
      await showConfirmDialog({ title: '确认', message: '确定开始处理此不合格品记录？' })
      await qualityApi.processNonconformance(record.value.id, 'start', {})
      showToast('已开始处理')
      record.value.status = 'processing'
    } catch (e) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        const errorMsg = getApiErrorMessage(e, '操作失败')
        showToast(errorMsg)
      }
    }
  }

  // 完成处理 (processing → completed)
  const handleComplete = async () => {
    if (!record.value.disposition || record.value.disposition === 'pending') { showToast('请先选择处置方式，不能直接完成处理'); return }
    if (record.value.disposition === 'use_as_is' && record.value.concessionStatus !== 'approved') { showToast('特采必须先通过独立审批，不能直接完成处理'); return }
    try {
      await showConfirmDialog({ title: '确认完成', message: '确定完成此不合格品处理？' })
      await qualityApi.processNonconformance(record.value.id, 'complete', { handledQuantity: Number(record.value.quantity) - Number(record.value.handledQuantity || 0) })
      showToast('处理完成')
      record.value.status = 'completed'
    } catch (e) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        const errorMsg = getApiErrorMessage(e, '操作失败')
        showToast(errorMsg)
      }
    }
  }

  onMounted(loadDetail)
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
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
      background: color-mix(in srgb, var(--color-success) 15%, transparent);
      color: var(--color-success-text);
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

  .error-container {
    padding: 48px 16px;
    text-align: center;
  }

  .error-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
  }
</style>
