<!--
/**
 * ProcessTemplates.vue
 * @description 工序模板管理组件
 * @date 2025-08-27
 * @version 1.1.0
 */
-->
<template>
  <div class="module-page base-data-list-page">
    <PageHeader title="工序模板管理" subtitle="管理生产工序模板配置">
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="showCreateDialog">新增工序模板</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item label="产品名称">
          <el-select
            v-model="searchForm.productId"
            placeholder="选择产品或输入编码搜索"
            clearable
            filterable
            remote
            :remote-method="remoteSearchProduct"
            @change="handleSearch"
          >
            <el-option
              v-for="product in productOptions"
              :key="product.id"
              :label="`${product.code} - ${product.name}`"
              :value="product.id"
            />
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="工序模板名称">
          <el-input v-model="searchForm.name" placeholder="请输入模板名称" clearable />
        </el-form-item>
      </template>
      <template #actions>
        <el-button type="success" @click="handleExport">
          <el-icon><Download /></el-icon> 导出
        </el-button>
      </template>
    </FinanceQueryCard>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="templateList"
        border
        class="w-full table-row-click"
        v-loading="loading"
        @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))"
      >
        <template #empty>
          <EmptyState description="暂无工序模板数据" />
        </template>

        <!-- 展开详情列 -->
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="process-detail p-detail">
              <h4>工序列表</h4>
              <el-table
                class="table-row-click"
                :data="props.row.processes || props.row.details || []"
                border
                @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(props.row))"
              >
                <el-table-column prop="orderNum" label="工序顺序" width="100" align="center" />
                <el-table-column prop="name" label="工序名称" width="180" />
                <el-table-column prop="description" label="工序描述" min-width="200" show-overflow-tooltip />
                <el-table-column prop="standardHours" label="标准工时(小时)" width="140" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" type="warning">{{ row.standardHours ?? row.standard_hours ?? 0 }} h</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="department" label="执行部门" width="120" />
                <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
              </el-table>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="code" label="模板编号" width="170" />
        <el-table-column prop="name" label="模板名称" width="200" />
        <el-table-column prop="productName" label="关联产品" min-width="180">
          <template #default="scope">
            {{ scope.row.productCode ? `${scope.row.productCode} - ${scope.row.productName}` : (scope.row.productName || '-') }}
          </template>
        </el-table-column>
        <el-table-column prop="processCount" label="工序数量" width="100" align="center">
          <template #default="scope">
            {{ scope.row.processes ? scope.row.processes.length : (scope.row.details ? scope.row.details.length : 0) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalHours" label="总工时(小时)" width="120" align="center">
          <template #default="scope">
            {{ calculateTotalHours(scope.row.processes || scope.row.details) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="scope">
            {{ formatDateTime(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="scope">
            <el-tag :type="Number(scope.row.status) === 1 ? 'success' : 'info'">
              {{ Number(scope.row.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          min-width="260"
          fixed="right"
          align="left"
          header-align="left"
          class-name="operation-column"
          header-class-name="operation-column-header"
        >
          <template #default="scope">
            <TableRowActions>
              <el-button size="small" type="primary" @click="handleView(scope.row)">
                <el-icon><View /></el-icon> 查看
              </el-button>

              <el-popconfirm
                v-if="canUpdate && Number(scope.row.status) !== 1"
                title="确定要启用该工序模板吗？"
                @confirm="handleToggleStatus(scope.row)"
              >
                <template #reference>
                  <el-button size="small" type="success">
                    <el-icon><Switch /></el-icon> 启用
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="canUpdate && Number(scope.row.status) === 1"
                title="确定要禁用该工序模板吗？"
                @confirm="handleToggleStatus(scope.row)"
                confirm-button-type="warning"
              >
                <template #reference>
                  <el-button size="small" type="warning">
                    <el-icon><Switch /></el-icon> 禁用
                  </el-button>
                </template>
              </el-popconfirm>

              <template v-if="Number(scope.row.status) === 0">
                <el-button v-if="canUpdate" size="small" type="primary" @click="handleEdit(scope.row)">
                  <el-icon><Edit /></el-icon> 编辑
                </el-button>
                <el-popconfirm
                  v-if="canDelete"
                  title="确定要删除该工序模板吗？此操作无法恢复。"
                  @confirm="handleDelete(scope.row)"
                  confirm-button-type="danger"
                >
                  <template #reference>
                    <el-button size="small" type="danger">
                      <el-icon><Delete /></el-icon> 删除
                    </el-button>
                  </template>
                </el-popconfirm>
              </template>
            </TableRowActions>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="Math.max(parseInt(total) || 0, 1)"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 创建/编辑表单对话框 -->
    <AppDialog
      v-model="dialogVisible"
      mode="form"
      :title="dialogType === 'create' ? '新增工序模板' : '编辑工序模板'"
      width="850px"
      content-width="wide"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="模板名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入模板名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="关联产品" prop="productId">
              <el-select
                v-model="form.productId"
                placeholder="选择关联产品"
                filterable
                remote
                :remote-method="remoteSearchProduct"
                clearable
                class="w-full"
              >
                <el-option
                  v-for="product in productOptions"
                  :key="product.id"
                  :label="`${product.code || '无编码'} - ${product.name || '未命名'}`"
                  :value="product.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="模板描述">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="2"
                placeholder="请输入模板描述"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <el-divider>工序列表</el-divider>

      <div class="process-table-container">
        <div class="process-table-header mb-10">
          <el-button type="primary" size="small" @click="addProcess">
            <el-icon><Plus /></el-icon> 添加工序
          </el-button>
        </div>

        <el-table :data="form.processes" border class="w-full">
          <el-table-column label="顺序" width="90" align="center">
            <template #default="{ row }">
              <el-input
                v-model="row.orderNum"
                placeholder="顺序"
                size="small"
              />
            </template>
          </el-table-column>

          <el-table-column label="工序名称" width="160">
            <template #default="{ row }">
              <el-input v-model="row.name" placeholder="请输入工序名称" size="small" />
            </template>
          </el-table-column>

          <el-table-column label="工序描述" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.description" placeholder="请输入工序描述" size="small" />
            </template>
          </el-table-column>

          <el-table-column label="标准工时(小时)" width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.standardHours"
                :min="0"
                :step="0.5"
                :precision="2"
                placeholder="工时"
                size="small"
                class="w-full"
              />
            </template>
          </el-table-column>

          <el-table-column label="执行部门" width="140">
            <template #default="{ row }">
              <el-select v-model="row.department" placeholder="选择部门" filterable size="small" class="w-full">
                <el-option
                  v-for="dept in departmentList"
                  :key="dept.id"
                  :label="dept.name"
                  :value="dept.name"
                />
              </el-select>
            </template>
          </el-table-column>

          <el-table-column label="作业指导书" min-width="180">
            <template #default="{ row }">
              <div class="flex-row flex-wrap gap-sm">
                <el-upload
                  :show-file-list="false"
                  :before-upload="(file) => beforeUploadInstruction(file, row)"
                  :http-request="(options) => handleUploadInstruction(options, row)"
                  accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf"
                >
                  <el-button size="small" type="success" :icon="Upload">
                    上传
                  </el-button>
                </el-upload>
                <!-- 已上传文件列表 -->
                <div v-if="row.instructionDocs && row.instructionDocs.length > 0" class="flex-wrap">
                  <el-tag
                    v-for="(doc, index) in row.instructionDocs"
                    :key="index"
                    closable
                    @close="removeInstructionDoc(row, index)"
                    @click="viewInstructionDoc(doc)"
                    class="cursor-pointer"
                    type="success"
                    size="small"
                  >
                    {{ doc.name || `文件${index + 1}` }}
                  </el-tag>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="备注" min-width="120">
            <template #default="{ row }">
              <el-input v-model="row.remark" placeholder="请输入备注" size="small" />
            </template>
          </el-table-column>

          <el-table-column
            label="操作"
            min-width="72"
            align="left"
            header-align="left"
            class-name="operation-column"
            header-class-name="operation-column-header"
          >
            <template #default="{ $index }">
              <el-button type="danger" size="small" @click="removeProcess($index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </AppDialog>

    <!-- 工序模板详情查看对话框 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="工序模板详情"
      mode="view"
      width="920px"
      content-width="wide"
      :detail-navigation="processTemplateViewNavigation"
    >
      <div v-loading="viewDetailLoading">
        <template v-if="viewData">
          <!-- 基础信息卡片 -->
          <el-descriptions :column="2" border class="mb-20">
            <el-descriptions-item label="模板编号">{{ viewData.code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="模板名称">{{ viewData.name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="关联产品">
              {{ viewData.productCode ? `${viewData.productCode} - ${viewData.productName}` : (viewData.productName || '-') }}
            </el-descriptions-item>
            <el-descriptions-item label="产品规格">
              {{ viewData.productSpecs || viewData.specification || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="Number(viewData.status) === 1 ? 'success' : 'info'">
                {{ Number(viewData.status) === 1 ? '启用' : '禁用' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="工序数量">
              <el-tag type="primary" size="small">{{ (viewData.processes || viewData.details || []).length }} 道工序</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="总标准工时">
              <el-tag type="warning" size="small">{{ calculateTotalHours(viewData.processes || viewData.details) }} 小时</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatDateTime(viewData.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="模板描述" :span="2">
              {{ viewData.description || '无' }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 工序列表标题 -->
          <div style="display: flex; align-items: center; margin: 20px 0 15px;">
            <div style="flex: 1; border-top: 1px solid var(--color-border-light, var(--el-border-color-light));"></div>
            <div style="padding: 0 15px; font-weight: 500; color: var(--color-text-regular, var(--el-text-color-regular));">
              工序明细列表
            </div>
            <div style="flex: 1; border-top: 1px solid var(--color-border-light, var(--el-border-color-light));"></div>
          </div>

          <!-- 工序列表只读表格 -->
          <el-table :data="viewData.processes || viewData.details || []" border class="w-full" max-height="350">
            <el-table-column prop="orderNum" label="序号" width="70" align="center">
              <template #default="{ row, $index }">
                {{ row.orderNum || $index + 1 }}
              </template>
            </el-table-column>
            <el-table-column prop="name" label="工序名称" width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <strong>{{ row.name || '-' }}</strong>
              </template>
            </el-table-column>
            <el-table-column prop="standardHours" label="标准工时" width="120" align="center">
              <template #default="{ row }">
                <el-tag size="small" type="warning">{{ row.standardHours ?? row.standard_hours ?? 0 }} h</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="department" label="执行部门" width="130" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.department || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="作业指导书" width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <div v-if="row.instructionDocs && row.instructionDocs.length > 0" class="flex-wrap">
                  <el-tag
                    v-for="(doc, index) in row.instructionDocs"
                    :key="index"
                    @click="viewInstructionDoc(doc)"
                    class="cursor-pointer"
                    type="success"
                    size="small"
                  >
                    {{ doc.name || `指导书${index + 1}` }}
                  </el-tag>
                </div>
                <span v-else class="text-muted">无</span>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="工序描述" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.description || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.remark || '-' }}
              </template>
            </el-table-column>
          </el-table>
        </template>
        <EmptyState v-else-if="!viewDetailLoading" description="暂无工序模板数据" />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </AppDialog>

    <!-- 文件预览对话框 -->
    <ProcessTemplatePreviewDialog
      v-model="previewDialogVisible"
      :doc="currentPreviewDoc"
    />
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { defineAsyncComponent, ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import {
  Plus, Delete, Upload, Edit, Switch, View, Download
} from '@element-plus/icons-vue'
import { baseDataApi } from '@/api/baseData'
import { loadMaterials, mapMaterialData, searchMaterials } from '@/utils/searchConfig'
import { parseListData } from '@/utils/responseParser'
import { loadDepartmentOptions } from '@/utils/optionLoaders'
import { formatDateTime } from '@/utils/helpers/dateUtils'
import { useAuthStore } from '@/stores/auth'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'
import TableRowActions from '@/components/common/TableRowActions.vue'

// 权限store
const authStore = useAuthStore()
// 权限计算属性
const canCreate = computed(() => authStore.hasPermission('basedata:processtemplates:create'))
const canUpdate = computed(() => authStore.hasPermission('basedata:processtemplates:update'))
const canDelete = computed(() => authStore.hasPermission('basedata:processtemplates:delete'))

const ProcessTemplatePreviewDialog = defineAsyncComponent(() => import('./components/ProcessTemplatePreviewDialog.vue'))

// 数据加载状态
const loading = ref(false)
// 分页相关
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
// 搜索表单
const searchForm = reactive({
  productId: '',
  name: ''
})
// 产品列表
const productList = ref([])
const productOptions = ref([])
// 工序模板列表
const templateList = ref([])

// 列表详情上下导航
const {
  previousItem: previousViewTemplate,
  nextItem: nextViewTemplate,
  hasPrevious: hasPreviousViewTemplate,
  hasNext: hasNextViewTemplate,
  setCurrentItem: setCurrentViewTemplate
} = useListDetailNavigation(templateList)

// 部门相关
const departmentList = ref([])

// 创建/编辑对话框控制
const dialogVisible = ref(false)
const dialogType = ref('create') // create 或 edit
const formRef = ref(null)

// 查看详情对话框控制
const viewDialogVisible = ref(false)
const viewDetailLoading = ref(false)
const viewData = ref(null)

// 表单数据
const form = reactive({
  id: null,
  code: '',
  name: '',
  productId: '',
  description: '',
  status: 1,
  processes: []
})

// 表单验证规则
const formRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  productId: [{ required: true, message: '请选择关联产品', trigger: 'change' }]
}

// 指导书预览与上传控制
const previewDialogVisible = ref(false)
const currentPreviewDoc = ref(null)

// 获取部门列表
const fetchDepartmentList = async () => {
  try {
    const deptData = await loadDepartmentOptions()
    departmentList.value = deptData.filter(dept => String(dept.status) === '1')
  } catch (error) {
    console.error('获取部门列表失败:', error)
    ElMessage.error('获取部门列表失败')
    departmentList.value = []
  }
}

// 初始化
onMounted(async () => {
  await fetchProductList()
  await fetchTemplateList()
  await fetchDepartmentList()
})

// 获取产品列表
const fetchProductList = async () => {
  try {
    const materials = await loadMaterials(baseDataApi, { pageSize: 20 })
    productList.value = mapMaterialData(materials)
    productOptions.value = productList.value
  } catch (error) {
    console.error('获取产品列表失败:', error)
    ElMessage.error('获取产品列表失败')
    productList.value = []
    productOptions.value = []
  }
}

// 远程搜索产品
const remoteSearchProduct = async (query) => {
  const keepCurrent = () => {
    if (!form.productId) return
    const exists = productOptions.value.some((item) => Number(item.id) === Number(form.productId))
    if (exists) return
    const current = productList.value.find((item) => Number(item.id) === Number(form.productId))
    if (current) productOptions.value.unshift(current)
  }
  if (!query) {
    productOptions.value = [...productList.value]
    keepCurrent()
    return
  }
  try {
    const searchResults = await searchMaterials(baseDataApi, query, { includeAll: true })
    productOptions.value = mapMaterialData(searchResults)
  } catch (error) {
    console.error('搜索产品失败:', error)
    ElMessage.error('搜索产品失败')
    productOptions.value = []
  }
}

// 获取工序模板列表
const fetchTemplateList = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      ...searchForm
    }
    const response = await baseDataApi.getProcessTemplates(params)
    if (response.data) {
      templateList.value = parseListData(response, { enableLog: false })
      total.value = response.data?.total || 0
    }
  } catch (error) {
    console.error('获取工序模板列表失败:', error)
    ElMessage.error('获取工序模板列表失败')
  } finally {
    loading.value = false
  }
}

// 计算总工时
const calculateTotalHours = (processes) => {
  if (!processes || !processes.length) return 0
    return processes.reduce((sum, process) => sum + Number(process.standardHours ?? 0), 0).toFixed(1)
}

// 搜索
const handleSearch = async () => {
  currentPage.value = 1
  await fetchTemplateList()
}

// 重置搜索
const handleReset = async () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = ''
  })
  currentPage.value = 1
  await fetchTemplateList()
}

// 导出工序模板
const handleExport = async () => {
  try {
    const response = await baseDataApi.exportProcessTemplates(searchForm)
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', '工序模板列表.xlsx')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  }
}

// 分页大小变化
const handleSizeChange = async (size) => {
  pageSize.value = size
  await fetchTemplateList()
}

// 当前页变化
const handleCurrentChange = async (page) => {
  currentPage.value = page
  await fetchTemplateList()
}

// 显示创建对话框
const showCreateDialog = () => {
  dialogType.value = 'create'
  form.id = null
  form.code = ''
  form.name = ''
  form.productId = ''
  form.description = ''
  form.status = 1
  form.processes = [{
    orderNum: 1,
    name: '',
    description: '',
    standardHours: 1,
    department: '',
    remark: '',
    materials: [],
    instructionDocs: []
  }]
  dialogVisible.value = true
}

// 添加工序
const addProcess = () => {
  const nextOrder = form.processes.length > 0
    ? Math.max(...form.processes.map((p) => Number(p.orderNum) || 0)) + 1
    : 1
  form.processes.push({
    orderNum: nextOrder,
    name: '',
    description: '',
    standardHours: 1,
    department: '',
    remark: '',
    materials: [],
    instructionDocs: []
  })
}

// 移除工序
const removeProcess = (index) => {
  form.processes.splice(index, 1)
}

// 编辑工序模板
const handleEdit = async (row) => {
  dialogType.value = 'edit'
  form.id = row.id
  form.code = row.code
  form.name = row.name
  form.productId = row.productId
  form.description = row.description || ''
  form.status = row.status

  if (row.productId && row.productCode) {
    const existingProduct = productOptions.value.find(p => p.id === row.productId)
    if (!existingProduct) {
      productOptions.value.unshift({
        id: row.productId,
        code: row.productCode,
        name: row.productName || ''
      })
    }
  }

  const sourceProcesses = row.processes || row.details
  form.processes = sourceProcesses && sourceProcesses.length
    ? JSON.parse(JSON.stringify(sourceProcesses)).map((process) => ({
        ...process,
        orderNum: process.orderNum ?? 1,
        standardHours: Number(process.standardHours ?? 1),
        instructionDocs: Array.isArray(process.instructionDocs)
          ? process.instructionDocs
          : (Array.isArray(process.instructionDocs) ? process.instructionDocs : [])
      }))
    : [{
        orderNum: 1,
        name: '',
        description: '',
        standardHours: 1,
        department: '',
        remark: '',
        materials: [],
        instructionDocs: []
      }]

  dialogVisible.value = true
}

// 查看工序模板详情
const handleView = async (row) => {
  if (!row) return
  setCurrentViewTemplate(row)
  viewData.value = {
    ...row,
    processes: row.processes || row.details || []
  }
  viewDialogVisible.value = true
  viewDetailLoading.value = true

  try {
    const res = await baseDataApi.getProcessTemplate(row.id)
    if (res?.data) {
      const detailObj = res.data.data || res.data
      viewData.value = {
        ...viewData.value,
        ...detailObj,
        processes: (detailObj.details || detailObj.processes || viewData.value.processes || []).map(p => ({
          ...p,
          orderNum: p.orderNum,
          standardHours: p.standardHours,
          instructionDocs: typeof p.instructionDocs === 'string'
            ? JSON.parse(p.instructionDocs || '[]')
            : (p.instructionDocs || [])
        }))
      }
    }
  } catch (error) {
    console.warn('获取工序模板详情失败，使用行数据呈现:', error)
  } finally {
    viewDetailLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewTemplate.value) handleView(previousViewTemplate.value)
}

const handleViewNext = () => {
  if (nextViewTemplate.value) handleView(nextViewTemplate.value)
}

const processTemplateViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewTemplate.value,
  hasNext: hasNextViewTemplate.value,
  loading: viewDetailLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))

// 切换状态
const handleToggleStatus = async (row) => {
  const newStatus = String(row.status) === '1' ? 0 : 1
  const action = newStatus === 1 ? '启用' : '禁用'
  try {
    await baseDataApi.updateProcessTemplateStatus(row.id, newStatus)
    ElMessage.success(`${action}成功`)
    await fetchTemplateList()
  } catch (error) {
    console.error(`${action}工序模板失败:`, error)
    ElMessage.error(error.response?.data?.message || `${action}工序模板失败`)
  }
}

// 删除工序模板
const handleDelete = async (row) => {
  try {
    await baseDataApi.deleteProcessTemplate(row.id)
    ElMessage.success('工序模板已删除')
    await fetchTemplateList()
  } catch (error) {
    console.error('删除失败:', error)
    ElMessage.error('删除失败')
  }
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    if (!form.processes.length) {
      ElMessage.warning('请至少添加一个工序')
      return
    }

    for (const process of form.processes) {
      if (!process.name) {
        ElMessage.warning('工序名称不能为空')
        return
      }
      if (process.standardHours === undefined || process.standardHours === null || process.standardHours === '') {
        ElMessage.warning('标准工时不能为空')
        return
      }
    }

    const payload = {
      ...form,
      details: form.processes.map(p => ({
        ...p,
        standard_hours: Number(p.standardHours),
        instruction_docs: p.instructionDocs || []
      }))
    }

    if (dialogType.value === 'create') {
      await baseDataApi.createProcessTemplate(payload)
      ElMessage.success('工序模板创建成功')
    } else {
      await baseDataApi.updateProcessTemplate(form.id, payload)
      ElMessage.success('工序模板更新成功')
    }

    dialogVisible.value = false
    await fetchTemplateList()
  } catch (error) {
    if (error === false) return
    console.error('保存工序模板失败:', error)
    ElMessage.error(error.response?.data?.message || '保存工序模板失败')
  }
}

// 指导书上传与预览
const beforeUploadInstruction = (file) => {
  const isLt20M = file.size / 1024 / 1024 < 20
  if (!isLt20M) {
    ElMessage.error('上传文件大小不能超过 20MB!')
    return false
  }
  return true
}

const handleUploadInstruction = async (options, row) => {
  try {
    const formData = new FormData()
    formData.append('file', options.file)
    formData.append('type', 'instruction')

    const res = await baseDataApi.uploadFile(formData)
    if (res?.data?.data) {
      const fileInfo = res.data.data
      if (!row.instructionDocs) row.instructionDocs = []
      row.instructionDocs.push({
        name: fileInfo.name || options.file.name,
        url: fileInfo.url,
        size: fileInfo.size || options.file.size,
        type: fileInfo.type || options.file.type
      })
      ElMessage.success('指导书上传成功')
    }
  } catch (error) {
    console.error('上传指导书失败:', error)
    ElMessage.error('上传指导书失败')
  }
}

const removeInstructionDoc = (row, index) => {
  row.instructionDocs.splice(index, 1)
}

const viewInstructionDoc = (doc) => {
  if (!doc?.url) {
    ElMessage.warning('文件路径不存在')
    return
  }
  currentPreviewDoc.value = doc
  previewDialogVisible.value = true
}
</script>

<style scoped>
.process-detail {
  padding: 12px 20px;
}
.process-detail h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: var(--color-text-primary, var(--el-text-color-primary));
}
.cursor-pointer {
  cursor: pointer;
}
</style>
