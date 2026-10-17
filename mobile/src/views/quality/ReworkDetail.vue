<template>
  <div class="rework-detail">
    <NavBar title="返工任务详情" left-arrow @click-left="router.back()" />
    <Loading v-if="loading" class="feedback">加载中...</Loading>
    <template v-else-if="task">
      <CellGroup inset title="返工任务">
        <Cell title="任务编号" :value="task.reworkNo" />
        <Cell title="状态" :value="statusLabel" />
        <Cell title="物料" :value="task.materialName || task.materialCode || '--'" />
        <Cell title="返工数量" :value="`${task.quantity} ${task.unit || '件'}`" />
        <Cell title="原检验单" :value="task.inspectionNo" />
        <Cell title="不合格品单" :value="task.ncpNo" is-link @click="openNcp" />
        <Cell title="返工要求" :label="task.reworkInstructions || task.defectDescription || '按检验不良原因返工'" />
        <Cell title="负责人" :value="task.assignedTo || '未分配'" />
      </CellGroup>
      <div v-if="task.status === 'pending'" v-permission="'quality:rework:update'"><CellGroup inset title="任务分配">
        <Field v-model="assignee" label="负责人" placeholder="请输入返工负责人姓名" />
        <Button block type="primary" :loading="saving" @click="assign">分配并开始返工</Button>
      </CellGroup></div>
      <div v-if="task.status === 'in_progress'" v-permission="'quality:rework:update'"><CellGroup inset title="完成返工">
        <Field v-model="actualDate" label="完成日期" type="date" />
        <Cell title="完成说明" label="确认本任务全部数量已返工；完成后系统生成独立复检，检验合格前不直接入库。" />
        <Button block type="success" :loading="saving" @click="complete">完成返工并生成复检</Button>
      </CellGroup></div>
      <CellGroup v-if="task.status === 'completed'" inset title="返工复检">
        <Cell title="独立复检" :value="task.reinspectionId ? `检验单 ${task.reinspectionId}` : '尚未取得复检单，请刷新重试'" />
        <Button block type="primary" :loading="saving" @click="openReinspection">打开独立复检单</Button>
      </CellGroup>
      <div class="actions"><Button block @click="loadDetail">刷新任务</Button></div>
    </template>
    <div v-else class="feedback"><Empty :description="errorMessage || '返工任务不存在'" /><Button @click="loadDetail">重试</Button></div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NavBar, CellGroup, Cell, Field, Button, Loading, Empty, showToast, showConfirmDialog } from 'vant'
import { qualityApi } from '@/api'
import { extractApiData } from '@/utils/apiHelper'
import { getApiErrorMessage } from '@/utils/errorHandler'
const route = useRoute()
const router = useRouter()
const task = ref(null)
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const assignee = ref('')
const today = new Date()
const actualDate = ref(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`)
const statusLabel = computed(() => ({ pending: '待分配', in_progress: '返工中', completed: '已完成', cancelled: '已取消' })[task.value?.status] || task.value?.status)
const loadDetail = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = extractApiData(await qualityApi.getReworkTask(route.params.id), null)
    if (!data?.id || String(data.id) !== String(route.params.id)) throw new Error('返工任务不存在或编号不匹配')
    task.value = data
  } catch (error) { task.value = null; errorMessage.value = getApiErrorMessage(error, '返工任务加载失败') }
  finally { loading.value = false }
}
const assign = async () => {
  if (!assignee.value.trim()) { showToast('请输入返工负责人'); return }
  if (saving.value || task.value?.status !== 'pending') return
  saving.value = true
  try {
    await qualityApi.assignReworkTask(task.value.id, { assignedTo: assignee.value.trim() })
    await loadDetail()
    showToast('返工已分配')
  } catch (error) { showToast(getApiErrorMessage(error, '分配返工失败')) }
  finally { saving.value = false }
}
const complete = async () => {
  if (saving.value || task.value?.status !== 'in_progress') return
  if (!actualDate.value) { showToast('请选择完成日期'); return }
  try {
    await showConfirmDialog({ title: '确认完成返工', message: `确认 ${task.value.quantity} 件已全部返工并进入复检？` })
    saving.value = true
    await qualityApi.completeReworkTask(task.value.id, { actualDate: actualDate.value })
    await loadDetail()
    showToast('返工完成，请继续独立复检')
  } catch (error) { if (error !== 'cancel') showToast(getApiErrorMessage(error, '完成返工失败')) }
  finally { saving.value = false }
}
const openNcp = () => { if (task.value.ncpId) router.push(`/quality/nonconformance/${task.value.ncpId}`) }
const openReinspection = async () => {
  if (saving.value) return
  saving.value = true
  try {
    await loadDetail()
    if (!task.value?.reinspectionId) { showToast('尚未生成独立复检单，请刷新后重试'); return }
    const data = extractApiData(await qualityApi.getIncomingInspection(task.value.reinspectionId), null)
    const kind = data?.inspectionType
    if (!['incoming','final','process'].includes(kind) || String(data?.id) !== String(task.value.reinspectionId)) { showToast('复检单类型或编号不匹配，无法打开'); return }
    router.push(`/quality/${kind}/${data.id}`)
  } catch (error) { showToast(getApiErrorMessage(error, '打开复检失败')) }
  finally { saving.value = false }
}
onMounted(loadDetail)
</script>
<style scoped>
.rework-detail { min-height: 100%; padding-bottom: var(--app-bottom-space); background: var(--van-background); }
.van-cell-group { margin-top: 16px; }
.actions, .feedback { padding: 24px 16px; }
</style>
