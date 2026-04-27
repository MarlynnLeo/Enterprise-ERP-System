<!--
/**
 * ProcessTemplates.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-requisitions-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>工序模板管理</h2>
          <p class="subtitle">管理生产工序模板配置</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="showCreateDialog">新增工序模板</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
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
        <el-form-item label="工序模板名称">
          <el-input  v-model="searchForm.name" placeholder="请输入模板名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
          </el-button>
          <el-button @click="handleReset" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
          <el-button type="success" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="templateList"
        border
        style="width: 100%"
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无工序模板数据" />
        </template>
        <!-- 展开详情列 -->
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="process-detail" style="padding: 10px 20px">
              <h4>工序列表</h4>
              <el-table :data="props.row.processes" border>
                <el-table-column prop="order_num" label="工序顺序" width="100" />
                <el-table-column prop="name" label="工序名称" width="180" />
                <el-table-column prop="description" label="工序描述" min-width="200" />
                <el-table-column prop="standard_hours" label="标准工时(小时)" width="140" />
                <el-table-column prop="department" label="执行部门" width="120" />
                <el-table-column prop="remark" label="备注" min-width="150" />
              </el-table>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="code" label="模板编号" width="170" />
        <el-table-column prop="name" label="模板名称" width="200" />
        <el-table-column prop="product_name" label="关联产品" min-width="180">
          <template #default="scope">
            {{ scope.row.product_code ? `${scope.row.product_code} - ${scope.row.product_name}` : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="process_count" label="工序数量" width="100">
          <template #default="scope">
            {{ scope.row.processes ? scope.row.processes.length : (scope.row.details ? scope.row.details.length : 0) }}
          </template>
        </el-table-column>
        <el-table-column prop="total_hours" label="总工时(小时)" width="120">
          <template #default="scope">
            {{ calculateTotalHours(scope.row.processes || scope.row.details) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="scope">
            {{ formatDateTime(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="Number(scope.row.status) === 1 ? 'success' : 'info'">
              {{ Number(scope.row.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="330" fixed="right">
          <template #default="scope">
            <el-button
              size="small"
              type="info"
              @click="handleView(scope.row)">
              <el-icon><View /></el-icon> 查看
            </el-button>
            <el-popconfirm
              v-if="canUpdate && Number(scope.row.status) !== 1"
              title="确定要启用该工序模板吗？"
              @confirm="handleToggleStatus(scope.row)"
            >
              <template #reference>
                <el-button size="small" type="success" plain>
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
                <el-button size="small" type="warning" plain>
                  <el-icon><Switch /></el-icon> 禁用
                </el-button>
              </template>
            </el-popconfirm>
            <template v-if="Number(scope.row.status) === 0">
              <el-button
                v-if="canUpdate"
                size="small"
                type="primary"
                @click="handleEdit(scope.row)">
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

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'create' ? '新增工序模板' : (dialogType === 'view' ? '查看工序模板' : '编辑工序模板')"
      width="800px"
      destroy-on-close
    >
      <template v-if="dialogType === 'view'">
        <el-descriptions :column="2" border style="margin-bottom: 20px;">
          <el-descriptions-item label="模板编号">{{ form.code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="模板名称">{{ form.name }}</el-descriptions-item>
          <el-descriptions-item label="关联产品">
            {{ productOptions.find(p => p.id === form.product_id) ? `${productOptions.find(p => p.id === form.product_id).code || ''} - ${productOptions.find(p => p.id === form.product_id).name || '未命名'}` : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ form.description || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <el-form
        v-else
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
            <el-form-item label="关联产品" prop="product_id">
              <el-select
                v-model="form.product_id"
                placeholder="选择关联产品"
                filterable
                remote
                :remote-method="remoteSearchProduct"
                clearable
                style="width: 100%"
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
          <div class="process-table-header" v-if="dialogType !== 'view'">
            <el-button type="primary" size="small" @click="addProcess">
              <el-icon><Plus /></el-icon> 添加工序
            </el-button>
          </div>
          
          <el-table :data="form.processes" border>
            <el-table-column label="顺序" width="90">
              <template #default="{ row }">
                <span v-if="dialogType === 'view'">{{ row.order_num }}</span>
                <el-input
                  v-else
                  v-model="row.order_num"
                  placeholder="顺序"
                  size="small"
                />
              </template>
            </el-table-column>
            
            <el-table-column label="工序名称" width="180">
              <template #default="{ row }">
                <span v-if="dialogType === 'view'">{{ row.name }}</span>
                <el-input v-else v-model="row.name" placeholder="请输入工序名称" />
              </template>
            </el-table-column>
            
            <el-table-column label="工序描述" min-width="200">
              <template #default="{ row }">
                <span v-if="dialogType === 'view'">{{ row.description || '-' }}</span>
                <el-input v-else v-model="row.description" placeholder="请输入工序描述" />
              </template>
            </el-table-column>
            
            <el-table-column label="标准工时(小时)" width="120">
              <template #default="{ row }">
                <span v-if="dialogType === 'view'">{{ row.standard_hours || '-' }}</span>
                <el-input
                  v-else
                  v-model="row.standard_hours"
                  placeholder="工时"
                  size="small"
                />
              </template>
            </el-table-column>
            
            <el-table-column label="执行部门" width="150">
              <template #default="{ row }">
                <span v-if="dialogType === 'view'">{{ departmentList.find(d => d.id === row.department_id)?.name || row.department || '-' }}</span>
                <el-select v-else v-model="row.department" placeholder="选择部门" filterable>
                  <el-option
                    v-for="dept in departmentList"
                    :key="dept.id"
                    :label="dept.name"
                    :value="dept.name"
                  />
                </el-select>
              </template>
            </el-table-column>
            
            <el-table-column label="作业指导书" min-width="200">
              <template #default="{ row }">
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                  <el-upload
                    v-if="dialogType !== 'view'"
                    :show-file-list="false"
                    :before-upload="(file) => beforeUploadInstruction(file, row)"
                    :http-request="(options) => handleUploadInstruction(options, row)"
                    accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf"
                  >
                    <el-button size="small" type="success" :icon="Upload">
                      上传指导书
                    </el-button>
                  </el-upload>

                  <!-- 已上传文件列表 -->
                  <div v-if="row.instructionDocs && row.instructionDocs.length > 0" style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <el-tag
                      v-for="(doc, index) in row.instructionDocs"
                      :key="index"
                      :closable="dialogType !== 'view'"
                      @close="removeInstructionDoc(row, index)"
                      @click="viewInstructionDoc(doc)"
                      style="cursor: pointer;"
                      type="success"
                    >
                      {{ doc.name || `文件${index + 1}` }}
                    </el-tag>
                  </div>
                  <span v-else-if="dialogType === 'view'" style="color: #999;">暂无指导书</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="备注" min-width="150">
              <template #default="{ row }">
                <span v-if="dialogType === 'view'">{{ row.remark || '-' }}</span>
                <el-input v-else v-model="row.remark" placeholder="请输入备注" />
              </template>
            </el-table-column>



            <el-table-column label="操作" width="80" v-if="dialogType !== 'view'">
              <template #default="{ $index }">
                <el-button type="danger" size="small" @click="removeProcess($index)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      <template #footer>
        <span>
          <el-button @click="dialogVisible = false">{{ dialogType === 'view' ? '关闭' : '取消' }}</el-button>
          <el-button v-if="dialogType !== 'view'" type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 物料选择对话框 -->
    <ProcessTemplateMaterialDialog
      v-model="materialDialogVisible"
      @confirm="handleMaterialConfirm"
    />

    <!-- 文件预览对话框 -->
    <ProcessTemplatePreviewDialog
      v-model="previewDialogVisible"
      :doc="currentPreviewDoc"
    />
  </div>
</template>

<script setup>


import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Search, Refresh, Delete, Upload, View, Edit, Switch
} from '@element-plus/icons-vue'
import { api } from '@/services/axiosInstance'
import { baseDataApi } from '@/api/baseData'
import { loadMaterials, mapMaterialData, searchMaterials } from '@/utils/searchConfig'
import { parseListData } from '@/utils/responseParser'
import dayjs from 'dayjs'
import { formatDateTime } from '@/utils/helpers/dateUtils'
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性
const canCreate = computed(() => authStore.hasPermission('basedata:process-templates:create'));
const canUpdate = computed(() => authStore.hasPermission('basedata:process-templates:update'));
const canDelete = computed(() => authStore.hasPermission('basedata:process-templates:delete'));

// 导入Office文件预览组件
import VueOfficeDocx from '@vue-office/docx'
import VueOfficeExcel from '@vue-office/excel'
import VueOfficePdf from '@vue-office/pdf'
import '@vue-office/docx/lib/index.css'
import '@vue-office/excel/lib/index.css'

// 子组件
import ProcessTemplatePreviewDialog from './components/ProcessTemplatePreviewDialog.vue'
import ProcessTemplateMaterialDialog from './components/ProcessTemplateMaterialDialog.vue'

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

// 物料相关
const materialDialogVisible = ref(false)
const currentProcessRow = ref(null)

// 部门相关
const departmentList = ref([])

// 对话框控制
const dialogVisible = ref(false)
const dialogType = ref('create') // create 或 edit
const formRef = ref(null)

// 表单数据
const form = reactive({
  id: null,
  code: '',
  name: '',
  product_id: '',
  description: '',
  status: 1,
  processes: []
})

// 表单验证规则
const formRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  product_id: [{ required: true, message: '请选择关联产品', trigger: 'change' }]
}

// 获取部门列表
const fetchDepartmentList = async () => {
  try {
    const response = await api.get('/system/departments/list')
    const deptData = parseListData(response, { enableLog: false })
    // 过滤出状态为启用的部门
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
    // 获取前20个产品作为初始显示
    const materials = await loadMaterials(baseDataApi, {
      pageSize: 20
    })

    // 映射产品数据
    productList.value = mapMaterialData(materials)

    // 初始化产品选项
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
  if (!query) {
    // 如果没有搜索词，显示初始产品列表
    productOptions.value = productList.value
    return
  }

  try {
    // 使用统一的搜索函数进行远程搜索
    const searchResults = await searchMaterials(baseDataApi, query, {
      pageSize: 500, // 增加搜索结果限制,支持大量产品
      includeAll: true
    })

    // 映射搜索结果
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
    
    const response = await api.get('/baseData/process-templates', { params })
    // 使用统一解析器
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
  return processes.reduce((sum, process) => sum + Number(process.standard_hours || 0), 0).toFixed(1)
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
    const response = await api.post('/baseData/process-templates/export', searchForm, {
      responseType: 'blob'
    })
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
  form.product_id = ''
  form.description = ''
  form.status = 1
  form.processes = [{
    order_num: 1,
    name: '',
    description: '',
    standard_hours: 1,
    department: '',
    remark: '',
    materials: [],
    instructionDocs: []
  }]
  dialogVisible.value = true
}

// 添加工序
const addProcess = () => {
  const order_num = form.processes.length > 0
    ? Math.max(...form.processes.map(p => p.order_num)) + 1
    : 1
  form.processes.push({
    order_num,
    name: '',
    description: '',
    standard_hours: 1,
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
  form.product_id = row.product_id
  form.description = row.description || ''
  form.status = row.status
  
  // 如果有关联产品但不在选项列表中，添加到选项列表
  if (row.product_id && row.product_code) {
    const existingProduct = productOptions.value.find(p => p.id === row.product_id)
    if (!existingProduct) {
      productOptions.value.unshift({
        id: row.product_id,
        code: row.product_code,
        name: row.product_name || ''
      })
    }
  }
  
  // 支持 processes 或 details 两种字段名
  const sourceProcesses = row.processes || row.details
  form.processes = sourceProcesses && sourceProcesses.length
    ? JSON.parse(JSON.stringify(sourceProcesses))
    : [{
        order_num: 1,
        name: '',
        description: '',
        standard_hours: 1,
        department: '',
        remark: '',
        materials: [],
        instructionDocs: []
      }]

  // 确保每个工序都有instructionDocs字段
  form.processes.forEach(process => {
    if (!process.hasOwnProperty('instructionDocs')) {
      process.instructionDocs = []
    }
    // 确保instructionDocs是数组
    if (!Array.isArray(process.instructionDocs)) {
      process.instructionDocs = []
    }
  })

  dialogVisible.value = true
}

// 查看工序模板详情
const handleView = (row) => {
  dialogType.value = 'view'
  form.id = row.id
  form.code = row.code
  form.name = row.name
  form.product_id = row.product_id
  form.description = row.description || ''
  form.status = row.status
  
  // 如果有关联产品但不在选项列表中，添加到选项列表
  if (row.product_id && row.product_code) {
    const existingProduct = productOptions.value.find(p => p.id === row.product_id)
    if (!existingProduct) {
      productOptions.value.unshift({
        id: row.product_id,
        code: row.product_code,
        name: row.product_name || ''
      })
    }
  }
  
  const sourceProcesses = row.processes || row.details
  form.processes = sourceProcesses && sourceProcesses.length
    ? JSON.parse(JSON.stringify(sourceProcesses))
    : []

  dialogVisible.value = true
}

// 切换状态
const handleToggleStatus = async (row) => {
  const newStatus = String(row.status) === '1' ? 0 : 1
  const action = newStatus === 1 ? '启用' : '禁用'

  try {
    await api.put(`/baseData/process-templates/${row.id}/status`, { status: newStatus })
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
    await api.delete(`/baseData/process-templates/${row.id}`)
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
    
    // 校验工序列表
    if (!form.processes.length) {
      ElMessage.warning('请至少添加一个工序')
      return
    }
    
    for (const process of form.processes) {
      if (!process.name) {
        ElMessage.warning('工序名称不能为空')
        return
      }
      if (!process.standard_hours) {
        ElMessage.warning('标准工时不能为空')
        return
      }
    }
    
    // 排序工序
    form.processes.sort((a, b) => a.order_num - b.order_num)
    
    // 构建发送数据，将processes映射为details（后端期望的字段名）
    const submitData = {
      name: form.name,
      code: form.code,
      product_id: form.product_id,
      description: form.description,
      status: form.status,
      details: form.processes.map((p, index) => ({
        name: p.name,
        order_num: p.order_num || (index + 1),
        description: p.description || '',
        standard_hours: p.standard_hours,
        department: p.department || '',
        remark: p.remark || '',
        materials: p.materials || [],
        instructionDocs: p.instructionDocs || []
      }))
    }
    
    loading.value = true
    if (dialogType.value === 'create') {
      await api.post('/baseData/process-templates', submitData)
      ElMessage.success('工序模板创建成功')
    } else {
      await api.put(`/baseData/process-templates/${form.id}`, submitData)
      ElMessage.success('工序模板更新成功')
    }
    
    dialogVisible.value = false
    await fetchTemplateList()
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  } finally {
    loading.value = false
  }
}

// 获取物料列表
const fetchMaterialList = async () => {
  try {
    const response = await baseDataApi.getMaterials({
      page: 1,
      pageSize: 1000
    })

    // 使用统一工具解析列表数据
    const materialsData = parseListData(response, { enableLog: false })

    materialList.value = materialsData.map(item => ({
      id: item.id,
      code: item.code || '无编码',
      name: item.name,
      specs: item.specs || item.specification || '',
      unit_name: item.unit_name || ''
    }))
    filteredMaterials.value = [...materialList.value]
  } catch (error) {
    console.error('获取物料列表失败:', error)
    ElMessage.error('获取物料列表失败')
  }
}

// 物料确认回调（来自子组件）
const handleMaterialConfirm = (materials) => {
  if (currentProcessRow.value) {
    currentProcessRow.value.materials = materials
  }
}

// 文件预览相关
const currentPreviewDoc = ref(null)

const viewInstructionDoc = (doc) => {
  if (doc && doc.url) {
    currentPreviewDoc.value = doc
    previewDialogVisible.value = true
  } else {
    ElMessage.warning('文件URL无效')
  }
}

// ==================== 作业指导书上传相关 ====================

// 上传前验证
const beforeUploadInstruction = (file, row) => {
  const allowedTypes = [
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-powerpoint', // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/pdf' // .pdf
  ]

  const allowedExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf']
  const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()

  if (!allowedExtensions.includes(fileExtension)) {
    ElMessage.error('只支持上传 Office 文件（Word、Excel、PowerPoint）和 PDF 文件！')
    return false
  }

  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    ElMessage.error('文件大小不能超过 10MB！')
    return false
  }

  return true
}

// 处理文件上传
const handleUploadInstruction = async (options, row) => {
  const { file } = options

  try {
    loading.value = true

    // 创建FormData
    const formData = new FormData()
    formData.append('file', file)

    // 上传文件 - uploadApi 已配置响应拦截器自动解包
    const response = await baseDataApi.uploadFile(formData)

    // response.data 已被拦截器解包为 { fileUrl, filename }
    if (response.data?.fileUrl) {
      // 确保instructionDocs是数组
      if (!row.instructionDocs) {
        row.instructionDocs = []
      }

      // 添加文件信息到数组
      row.instructionDocs.push({
        name: file.name,
        url: response.data.fileUrl,
        uploadTime: new Date().toISOString()
      })

      ElMessage.success('作业指导书上传成功')
    } else {
      throw new Error('上传失败，未返回有效的文件URL')
    }
  } catch (error) {
    console.error('上传失败:', error)
    ElMessage.error('作业指导书上传失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 文件预览对话框可见性
const previewDialogVisible = ref(false)

// 删除作业指导书
const removeInstructionDoc = (row, index) => {
  ElMessageBox.confirm(
    '确定要删除该作业指导书吗？',
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    row.instructionDocs.splice(index, 1)
    ElMessage.success('作业指导书已删除')
  }).catch(() => {
    // 用户取消删除
  })
}


</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.search-form {
  display: flex;
  flex-wrap: wrap;
}








.process-table-container {
  margin-top: 10px;
}

.process-table-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.material-selection {
  padding: 10px 0;
}

.search-bar {
  margin-bottom: var(--spacing-base);
}

.material-list {
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
}

/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}

.doc-tag {
  margin: 2px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 专业的“查看模式”样式覆盖：剥离输入框外观，直接作为平文本展示 */
.view-mode :deep(.el-input__wrapper),
.view-mode :deep(.el-textarea__inner) {
  box-shadow: none !important;
  background-color: transparent !important;
  cursor: default !important;
  padding: 0 !important;
}

.view-mode :deep(.el-input.is-disabled .el-input__inner),
.view-mode :deep(.el-textarea.is-disabled .el-textarea__inner),
.view-mode :deep(.el-input__inner),
.view-mode :deep(.el-textarea__inner) {
  color: var(--color-text-primary) !important;
  font-weight: 500;
  cursor: default !important;
  -webkit-text-fill-color: var(--color-text-primary) !important;
}

.view-mode :deep(.el-input__inner::placeholder),
.view-mode :deep(.el-textarea__inner::placeholder) {
  color: transparent !important; /* 隐藏请输入占位符 */
}

/* 隐藏下拉框箭头、清除按钮等图标 */
.view-mode :deep(.el-input__suffix),
.view-mode :deep(.el-input__prefix) {
  display: none !important;
}
</style>