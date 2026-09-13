<template>
  <div class="module-page base-data-list-page">
    <PageHeader title="产品工艺路线" subtitle="维护产品的工序、单件定额与作业要求，按版本发布">
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openDraft()">新增工艺</el-button>
      </template>
    </PageHeader>
    <FinanceQueryCard :model="filters" :loading="loading" @search="search" @reset="reset">
      <template #basic>
        <el-form-item label="关联产品">
          <el-select v-model="filters.productId" placeholder="输入产品名称或编码" clearable filterable remote :remote-method="searchProducts" @change="search">
            <el-option v-for="product in products" :key="product.id" :label="`${product.code} - ${product.name}`" :value="product.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="工艺名称"><el-input v-model="filters.name" placeholder="名称、编号或产品" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable @change="search">
            <el-option label="启用" :value="1" /><el-option label="未启用" :value="0" />
          </el-select>
        </el-form-item>
      </template>
      <template #actions><el-button v-if="canExport" :icon="Download" @click="exportRoutes">导出</el-button></template>
    </FinanceQueryCard>
    <el-card class="data-card">
      <el-table v-loading="loading" :data="routes" border class="table-row-click" @row-click="(row, col, event) => handleTableRowView(row, col, event, () => viewRoute(row))">
        <template #empty><EmptyState description="暂无符合条件的产品工艺" /></template>
        <el-table-column prop="productCode" label="产品编码" min-width="110" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="name" label="工艺名称" min-width="130" show-overflow-tooltip />
        <el-table-column label="版本" width="96"><template #default="{ row }"><span>{{ row.version }}</span></template></el-table-column>
        <el-table-column label="标准工时 (h/件)" width="140" align="right"><template #default="{ row }">{{ formatStandardHours(totalStandardHours(row.details)) }}</template></el-table-column>
        <el-table-column label="状态" width="75"><template #default="{ row }"><el-tag :type="Number(row.status) === 1 ? 'success' : 'info'">{{ routeStatusLabel(row) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" min-width="220" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <TableRowActions>
              <el-button size="small" type="primary" @click="viewRoute(row)">查看</el-button>
              <el-button v-if="canCreate && !isDraft(row)" size="small" @click="openDraft(row, true)">新版本</el-button>
              <el-button v-if="canUpdate && isDraft(row)" size="small" @click="openDraft(row)">编辑</el-button>
              <el-popconfirm v-if="canUpdate" :title="Number(row.status) === 1 ? '停用后，新任务将不再选用此工艺。' : '启用此版本，并替换该产品当前的生效版本？'" @confirm="toggleStatus(row)">
                <template #reference><el-button size="small" :type="Number(row.status) === 1 ? 'warning' : 'success'">{{ Number(row.status) === 1 ? '停用' : '启用' }}</el-button></template>
              </el-popconfirm>
              <el-popconfirm v-if="canDelete && isDraft(row)" title="删除这份未发布的草稿？" @confirm="deleteDraft(row)">
                <template #reference><el-button size="small" type="danger">删除</el-button></template>
              </el-popconfirm>
            </TableRowActions>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-container"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next" @current-change="loadRoutes" @size-change="search" /></div>
    </el-card>

    <AppDialog v-model="editVisible" :title="draft.id ? '编辑工艺草稿' : draft.sourceTemplateId ? '创建工艺新版本' : '新增产品工艺'" mode="form" content-width="wide" width="1120px">
      <el-alert title="保存为草稿后启用。已发布版本保持不变，新版本用于后续新建任务。" type="info" :closable="false" class="mb-20" />
      <el-form ref="formRef" :model="draft" :rules="rules" label-width="100px">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12"><el-form-item label="关联产品" prop="productId">
            <el-select v-model="draft.productId" :disabled="Boolean(draft.sourceTemplateId)" placeholder="输入产品名称或编码" filterable remote :remote-method="searchProducts" class="w-full">
              <el-option v-for="product in products" :key="product.id" :label="`${product.code} - ${product.name}`" :value="product.id" />
            </el-select>
          </el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="工艺名称" prop="name"><el-input v-model="draft.name" maxlength="100" placeholder="例如：盖板生产工艺" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="版本" prop="version"><el-input v-model="draft.version" maxlength="50" placeholder="例如：V2.0" /></el-form-item></el-col>
          <el-col :xs="24" :sm="12"><el-form-item label="工艺说明"><el-input v-model="draft.description" placeholder="本版本的适用范围或变更说明" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <div class="process-toolbar"><strong>工序明细</strong><span>合计 {{ formatStandardHours(totalStandardHours(draft.details)) }} h/件</span><el-button :icon="Plus" size="small" @click="addStep">添加工序</el-button></div>
      <el-table :data="draft.details" border>
        <el-table-column label="顺序" width="90"><template #default="{ row }"><el-input-number v-model="row.orderNum" :min="1" :precision="0" :controls="false" class="w-full" /></template></el-table-column>
        <el-table-column label="工序名称" min-width="150"><template #default="{ row }"><el-input v-model="row.name" maxlength="100" placeholder="工序名称" /></template></el-table-column>
        <el-table-column label="标准工时 (h/件)" width="170"><template #default="{ row }"><el-input-number v-model="row.standardHours" :min="0" :max="999999" :precision="6" :step="0.01" controls-position="right" class="w-full" /></template></el-table-column>
        <el-table-column label="执行部门" width="140"><template #default="{ row }"><el-select v-model="row.department" filterable allow-create clearable placeholder="按需填写"><el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.name" /></el-select></template></el-table-column>
        <el-table-column label="工位" width="150"><template #default="{ row }"><el-select v-model="row.stationId" filterable clearable placeholder="可不指定"><el-option v-for="station in stations" :key="station.id" :label="station.name" :value="station.id" /></el-select></template></el-table-column>
        <el-table-column label="操作" min-width="220" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"><template #default="{ row, $index }"><TableRowActions><el-button size="small" @click="editStep(row)">作业内容与用料</el-button><el-button size="small" type="danger" @click="draft.details.splice($index, 1)">移除</el-button></TableRowActions></template></el-table-column>
      </el-table>
      <template #footer><el-button @click="editVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDraft">保存草稿</el-button></template>
    </AppDialog>

    <AppDialog v-model="stepVisible" title="工序作业内容与用料" mode="form" content-width="wide" width="850px">
      <template v-if="editingStep">
        <el-form label-width="100px">
          <el-form-item label="工序编号"><el-input v-model="editingStep.stepCode" maxlength="50" placeholder="选填" /></el-form-item>
          <el-form-item label="工序描述"><el-input v-model="editingStep.description" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="SOP作业要求"><el-input v-model="editingStep.sopContent" type="textarea" :rows="5" placeholder="填写操作步骤、注意事项和质量要求" /></el-form-item>
          <el-form-item label="作业指导书">
            <div class="file-list">
              <el-upload :show-file-list="false" :before-upload="beforeUpload" :http-request="options => uploadInstruction(options, editingStep)" accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf"><el-button size="small" :icon="Upload">上传指导书</el-button></el-upload>
              <el-tag v-for="(doc, index) in editingStep.instructionDocs" :key="doc.url" closable @close="editingStep.instructionDocs.splice(index, 1)" @click="preview(doc)">{{ doc.name }}</el-tag>
            </div>
          </el-form-item>
          <el-form-item label="SOP图片">
            <div class="file-list">
              <el-upload :show-file-list="false" :before-upload="beforeUpload" :http-request="options => uploadInstruction(options, editingStep, true)" accept=".png,.jpg,.jpeg,.webp"><el-button size="small" :icon="Upload">上传图片</el-button></el-upload>
              <el-tag v-for="(url, index) in editingStep.sopImages" :key="url" closable @close="editingStep.sopImages.splice(index, 1)" @click="preview({ url, name: url.split('/').pop() })">图片 {{ index + 1 }}</el-tag>
            </div>
          </el-form-item>
          <el-form-item label="备注"><el-input v-model="editingStep.remark" /></el-form-item>
        </el-form>
        <div class="process-toolbar"><strong>工序物料（单件用量）</strong><el-button size="small" @click="editingStep.materials.push({ materialId: null, quantity: 1, isScanRequired: false })">添加物料</el-button></div>
        <el-table :data="editingStep.materials" border>
          <el-table-column label="物料" min-width="220"><template #default="{ row }"><el-select v-model="row.materialId" placeholder="名称或编码" filterable remote :remote-method="searchStepMaterials"><el-option v-for="mat in materialOptions" :key="mat.id" :label="`${mat.code} - ${mat.name}`" :value="mat.id" /></el-select></template></el-table-column>
          <el-table-column label="单件用量" width="160"><template #default="{ row }"><el-input-number v-model="row.quantity" :min="0.000001" :precision="6" controls-position="right" class="w-full" /></template></el-table-column>
          <el-table-column label="完成前扫码" width="120"><template #default="{ row }"><el-switch v-model="row.isScanRequired" /></template></el-table-column>
          <el-table-column label="操作" width="85" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"><template #default="{ $index }"><el-button size="small" type="danger" @click="editingStep.materials.splice($index, 1)">移除</el-button></template></el-table-column>
        </el-table>
      </template>
      <template #footer><el-button type="primary" @click="stepVisible = false">完成编辑</el-button></template>
    </AppDialog>

    <AppDialog v-model="viewVisible" title="产品工艺详情" mode="view" content-width="wide" width="1000px">
      <template v-if="viewData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="工艺">{{ viewData.name }}</el-descriptions-item><el-descriptions-item label="版本">{{ viewData.version }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ viewData.productCode }} · {{ viewData.productName }}</el-descriptions-item><el-descriptions-item label="状态">{{ routeStatusLabel(viewData) }}</el-descriptions-item>
          <el-descriptions-item label="单件标准工时">{{ formatStandardHours(totalStandardHours(viewData.details)) }} h/件</el-descriptions-item><el-descriptions-item label="工艺说明">{{ viewData.description || '—' }}</el-descriptions-item>
        </el-descriptions>
        <el-card v-for="step in viewData.details" :key="step.id" class="process-detail-card" shadow="never">
          <template #header><strong>{{ step.orderNum }}. {{ step.name }}</strong><span class="step-hours">{{ formatStandardHours(step.standardHours) }} h/件</span></template>
          <p>执行部门：{{ step.department || '未指定' }}　工位：{{ step.stationName || '未指定' }}</p>
          <p v-if="step.description">{{ step.description }}</p><pre v-if="step.sopContent" class="sop-content">{{ step.sopContent }}</pre>
          <div class="file-list"><el-button v-for="doc in step.instructionDocs" :key="doc.url" size="small" @click="preview(doc)">{{ doc.name }}</el-button><el-button v-for="(url, index) in step.sopImages" :key="url" size="small" @click="preview({ url, name: url.split('/').pop() })">SOP图片 {{ index + 1 }}</el-button></div>
          <el-table v-if="step.materials.length" :data="step.materials" border size="small"><el-table-column prop="materialCode" label="物料编码" /><el-table-column prop="materialName" label="物料名称" /><el-table-column prop="quantity" label="单件用量" /><el-table-column label="扫码验证"><template #default="{ row }">{{ row.isScanRequired ? '需要' : '不需要' }}</template></el-table-column></el-table>
          <p v-if="step.remark">备注：{{ step.remark }}</p>
        </el-card>
        <EmptyState v-if="!viewData.details.length" description="此版本尚未配置工序" />
      </template>
      <template #footer><el-button @click="viewVisible = false">关闭</el-button></template>
    </AppDialog>
    <ProcessTemplatePreviewDialog v-model="previewVisible" :doc="previewDoc" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { baseDataApi } from '@/api/baseData'
import { workStationApi } from '@/api/assembly'
import { loadDepartmentOptions } from '@/utils/optionLoaders'
import { parsePaginatedData, parseListData } from '@/utils/responseParser'
import { handleTableRowView } from '@/utils/tableRowView'
import { useAuthStore } from '@/stores/auth'
import { createRouteDraft, newProcessDetail, normalizeProcessDetail, buildRoutePayload, validateRouteDetails, formatStandardHours, totalStandardHours, routeStatusLabel, hasProductProcessPermission } from '@/utils/productProcessRoute'
import TableRowActions from '@/components/common/TableRowActions.vue'

const ProcessTemplatePreviewDialog = defineAsyncComponent(() => import('./components/ProcessTemplatePreviewDialog.vue'))
const auth = useAuthStore()
const canCreate = computed(() => hasProductProcessPermission(auth, 'create'))
const canUpdate = computed(() => hasProductProcessPermission(auth, 'update'))
const canDelete = computed(() => hasProductProcessPermission(auth, 'delete'))
const canExport = computed(() => hasProductProcessPermission(auth, 'export'))
const route = useRoute()
const filters = reactive({ productId: Number(route.query.productId) || '', name: String(route.query.name || ''), status: '' })
const page = ref(1), pageSize = ref(10), total = ref(0), routes = ref([]), loading = ref(false), saving = ref(false)
const products = ref([]), departments = ref([]), stations = ref([]), materialOptions = ref([])
const draft = ref(createRouteDraft()), formRef = ref(null), editVisible = ref(false), stepVisible = ref(false), editingStep = ref(null)
const viewData = ref(null), viewVisible = ref(false), previewVisible = ref(false), previewDoc = ref(null)
const rules = {
  name: [{ required: true, message: '请输入工艺名称', trigger: 'blur' }],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  version: [{ required: true, message: '请输入新版本号', trigger: 'blur' }]
}
const isDraft = row => Number(row.status) !== 1 && !row.publishedAt
const errorMessage = (error, fallback) => ElMessage.error(error.response?.data?.message || error.message || fallback)
let listRequest = 0, productRequest = 0, materialRequest = 0
const loadRoutes = async () => {
  const current = ++listRequest
  loading.value = true
  try {
    const result = parsePaginatedData(await baseDataApi.getProcessTemplates({ ...filters, page: page.value, pageSize: pageSize.value }))
    if (current === listRequest) { routes.value = result.list; total.value = result.total }
  } catch (error) { errorMessage(error, '加载工艺失败') }
  finally { if (current === listRequest) loading.value = false }
}
const search = () => { page.value = 1; return loadRoutes() }
const reset = () => { Object.assign(filters, { productId: '', name: '', status: '' }); return search() }
const searchProducts = async query => {
  const current = ++productRequest
  try {
    const rows = parseListData(await baseDataApi.getProcessMaterialOptions({ keyword: query, pageSize: 50 }))
    if (current === productRequest) products.value = rows
  } catch (error) { errorMessage(error, '搜索产品失败') }
}
const searchStepMaterials = async query => {
  const current = ++materialRequest
  try {
    const rows = parseListData(await baseDataApi.getProcessMaterialOptions({ keyword: query, pageSize: 50 }))
    if (current === materialRequest) materialOptions.value = rows
  } catch (error) { errorMessage(error, '搜索工序物料失败') }
}
const openDraft = async (row = null, copy = false) => {
  try {
    const source = row ? (await baseDataApi.getProcessTemplate(row.id)).data : null
    draft.value = createRouteDraft(source, copy)
    if (source && !products.value.some(p => Number(p.id) === Number(source.productId))) products.value.unshift({ id: source.productId, code: source.productCode, name: source.productName })
    editVisible.value = true
  } catch (error) { errorMessage(error, '加载工艺失败') }
}
const addStep = () => draft.value.details.push(newProcessDetail(Math.max(0, ...draft.value.details.map(step => Number(step.orderNum) || 0)) + 1))
const editStep = row => {
  editingStep.value = row
  materialOptions.value = row.materials.map(mat => ({ id: mat.materialId, code: mat.materialCode || '', name: mat.materialName || String(mat.materialId) }))
  stepVisible.value = true
}
const saveDraft = async () => {
  if (saving.value || !await formRef.value.validate().catch(() => false)) return
  const validation = validateRouteDetails(draft.value.details)
  if (validation) return ElMessage.warning(validation)
  saving.value = true
  try {
    const payload = buildRoutePayload(draft.value)
    if (draft.value.id) await baseDataApi.updateProcessTemplate(draft.value.id, payload)
    else await baseDataApi.createProcessTemplate(payload)
    editVisible.value = false
    ElMessage.success('工艺草稿已保存，可在列表启用')
    await loadRoutes()
  } catch (error) { errorMessage(error, '保存工艺失败') }
  finally { saving.value = false }
}
const viewRoute = async row => {
  try {
    const { data } = await baseDataApi.getProcessTemplate(row.id)
    viewData.value = { ...data, details: data.details.map(normalizeProcessDetail) }
    viewVisible.value = true
  } catch (error) { errorMessage(error, '加载详情失败') }
}
const toggleStatus = async row => {
  try { await baseDataApi.updateProcessTemplateStatus(row.id, Number(row.status) === 1 ? 0 : 1); ElMessage.success('工艺状态已更新'); await loadRoutes() }
  catch (error) { errorMessage(error, '更新状态失败') }
}
const deleteDraft = async row => {
  try { await baseDataApi.deleteProcessTemplate(row.id); ElMessage.success('草稿已删除'); await loadRoutes() }
  catch (error) { errorMessage(error, '删除草稿失败') }
}
const exportRoutes = async () => {
  try {
    const response = await baseDataApi.exportProcessTemplates(filters)
    const url = URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a'); link.href = url; link.download = '产品工艺路线.xlsx'; link.click(); URL.revokeObjectURL(url)
  } catch (error) { errorMessage(error, '导出失败') }
}
const beforeUpload = file => { if (file.size >= 20 * 1024 * 1024) { ElMessage.warning('文件大小不能超过20MB'); return false }; return true }
const uploadInstruction = async (options, step, image = false) => {
  try {
    const body = new FormData(); body.append('file', options.file); body.append('type', 'instruction')
    const { data } = await baseDataApi.uploadFile(body)
    if (!data?.url) throw new Error('上传未返回文件地址')
    if (image) step.sopImages.push(data.url)
    else step.instructionDocs.push({ name: data.name || options.file.name, url: data.url })
    options.onSuccess?.(data)
    ElMessage.success('文件已上传，保存草稿后生效')
  } catch (error) { options.onError?.(error); errorMessage(error, '上传失败') }
}
const preview = doc => { previewDoc.value = doc; previewVisible.value = true }
onMounted(async () => {
  await Promise.allSettled([loadRoutes(), searchProducts(''),
    loadDepartmentOptions().then(rows => { departments.value = rows }),
    workStationApi.getList({ pageSize: 100, isActive: 1 }).then(response => { stations.value = parseListData(response) })])
  const selectedProduct = routes.value.find(row => Number(row.productId) === Number(filters.productId))
  if (selectedProduct && !products.value.some(product => Number(product.id) === Number(selectedProduct.productId))) {
    products.value.unshift({ id: selectedProduct.productId, code: selectedProduct.productCode, name: selectedProduct.productName })
  }
})
</script>

<style scoped>
.process-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin: 16px 0; }
.process-toolbar > :last-child { margin-left: auto; }
.process-detail-card { margin-top: 16px; }
.step-hours { float: right; color: var(--color-text-secondary); }
.file-list { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.sop-content { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; padding: 12px; background: var(--color-bg-page); border-radius: 4px; }
</style>
