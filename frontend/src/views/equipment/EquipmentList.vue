<!--
/**
 * EquipmentList.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="equipment-list-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>设备台账</h2>
          <p class="subtitle">管理设备信息与维护</p>
        </div>
        <div class="header-actions">
          <el-button type="success" :icon="Download" @click="downloadTemplate">下载模板</el-button>
          <el-button type="warning" :icon="Upload" @click="showImportDialog">批量导入</el-button>
          <el-button type="primary" :icon="Plus" @click="openDialog(false)">添加设备</el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form" :model="searchForm">
        <el-form-item label="设备编号">
          <el-input  v-model="searchForm.code" placeholder="请输入设备编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="设备名称">
          <el-input  v-model="searchForm.name" placeholder="请输入设备名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="设备状态">
          <el-select  v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="正常" value="normal"></el-option>
            <el-option label="维护中" value="maintenance"></el-option>
            <el-option label="维修中" value="repair"></el-option>
            <el-option label="已报废" value="scrapped"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="fetchEquipmentList" :loading="loading">搜索</el-button>
          <el-button :icon="Refresh" @click="resetSearch" :loading="loading">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">设备总数</div>
      </el-card>
      <el-card class="stat-card normal" shadow="hover">
        <div class="stat-value">{{ stats.normal }}</div>
        <div class="stat-label">正常</div>
      </el-card>
      <el-card class="stat-card maintenance" shadow="hover">
        <div class="stat-value">{{ stats.maintenance }}</div>
        <div class="stat-label">维护中</div>
      </el-card>
      <el-card class="stat-card repair" shadow="hover">
        <div class="stat-value">{{ stats.repair }}</div>
        <div class="stat-label">维修中</div>
      </el-card>
      <el-card class="stat-card scrapped" shadow="hover">
        <div class="stat-value">{{ stats.scrapped }}</div>
        <div class="stat-label">已报废</div>
      </el-card>
    </div>
    
    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="tableData"
        border
        style="width: 100%; margin-top: 16px;"
      >
        <template #empty>
          <el-empty description="暂无设备数据" />
        </template>
        <el-table-column prop="code" label="设备编号" width="120"></el-table-column>
        <el-table-column prop="name" label="设备名称" width="230"></el-table-column>
        <el-table-column prop="model" label="型号" width="120"></el-table-column>
        <el-table-column prop="manufacturer" label="制造商" width="220"></el-table-column>
        <el-table-column prop="location" label="位置" width="120"></el-table-column>
        <el-table-column prop="responsible_person" label="责任人" width="100"></el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="购买日期" width="110">
          <template #default="scope">
            {{ formatDate(scope.row.purchase_date) }}
          </template>
        </el-table-column>
        <el-table-column label="检验日期" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.inspection_date) }}
          </template>
        </el-table-column>
        <el-table-column label="下次检验日期" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.next_inspection_date) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="scope">
            <el-button size="small" @click="viewEquipment(scope.row)">查看</el-button>
            <el-button 
              size="small" 
              type="primary" 
              @click="openDialog(true, scope.row)"
              v-permission="'equipment:list:update'">
              编辑
            </el-button>
            <el-popconfirm
              :title="`确定要删除设备 '${scope.row.name}' 吗？`"
              @confirm="deleteEquipment(scope.row)"
              confirm-button-type="danger"
              v-if="canDelete"
            >
              <template #reference>
                <el-button 
                  size="small" 
                  type="danger" 
                  v-permission="'equipment:list:delete'">
                  删除
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(total, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    
    <!-- 添加/编辑设备对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="650px"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        :inline="false"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="设备编号" prop="code">
              <el-input v-model="form.code" placeholder="请输入设备编号"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入设备名称"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="型号" prop="model">
              <el-input v-model="form.model" placeholder="请输入设备型号"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="制造商" prop="manufacturer">
              <el-input v-model="form.manufacturer" placeholder="请输入制造商"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="购买日期" prop="purchase_date">
              <el-date-picker
                v-model="form.purchase_date"
                type="date"
                placeholder="选择购买日期"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="检验日期" prop="inspection_date">
              <el-date-picker
                v-model="form.inspection_date"
                type="date"
                placeholder="选择检验日期"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="下次检验日期" prop="next_inspection_date">
              <el-date-picker
                v-model="form.next_inspection_date"
                type="date"
                placeholder="选择下次检验日期"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">

          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="设备位置" prop="location">
              <el-input v-model="form.location" placeholder="请输入设备位置"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">

          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="责任人" prop="responsible_person">
              <el-input v-model="form.responsible_person" placeholder="请输入责任人"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备状态" prop="status">
              <el-select v-model="form.status" placeholder="请选择设备状态" style="width: 100%">
                <el-option label="正常" value="normal"></el-option>
                <el-option label="维护中" value="maintenance"></el-option>
                <el-option label="维修中" value="repair"></el-option>
                <el-option label="已报废" value="scrapped"></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="设备规格" prop="specs">
          <el-input v-model="form.specs" type="textarea" :rows="3" placeholder="请输入设备规格"></el-input>
        </el-form-item>
        
        <el-form-item label="备注" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入备注"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 查看设备详情对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="设备详情"
      width="800px"
      destroy-on-close
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="设备编号">{{ currentEquipment.code }}</el-descriptions-item>
        <el-descriptions-item label="设备名称">{{ currentEquipment.name }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ currentEquipment.model }}</el-descriptions-item>
        <el-descriptions-item label="制造商">{{ currentEquipment.manufacturer }}</el-descriptions-item>
        <el-descriptions-item label="购买日期">{{ formatDate(currentEquipment.purchase_date) }}</el-descriptions-item>
        <el-descriptions-item label="检验日期">{{ formatDate(currentEquipment.inspection_date) }}</el-descriptions-item>
        <el-descriptions-item label="下次检验日期">{{ formatDate(currentEquipment.next_inspection_date) }}</el-descriptions-item>
        <el-descriptions-item label="设备位置">{{ currentEquipment.location }}</el-descriptions-item>
        <el-descriptions-item label="责任人">{{ currentEquipment.responsible_person }}</el-descriptions-item>
        <el-descriptions-item label="设备状态">
          <el-tag :type="getStatusType(currentEquipment.status)">
            {{ getStatusText(currentEquipment.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="设备规格" :span="2">{{ currentEquipment.specs }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ currentEquipment.description }}</el-descriptions-item>
      </el-descriptions>
      
      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane label="维护记录" name="maintenance">
          <el-empty v-if="!currentEquipment.maintenanceRecords || currentEquipment.maintenanceRecords.length === 0" description="暂无维护记录" />
          <el-table v-else :data="currentEquipment.maintenanceRecords" border style="width: 100%">
            <el-table-column prop="maintenance_date" label="维护日期" width="120"></el-table-column>
            <el-table-column prop="maintenance_type" label="维护类型" width="120"></el-table-column>
            <el-table-column prop="maintenance_person" label="维护人员" width="100"></el-table-column>
            <el-table-column prop="maintenance_content" label="维护内容"></el-table-column>
            <el-table-column prop="next_maintenance_date" label="下次维护日期" width="120"></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="故障记录" name="failure">
          <el-empty v-if="!currentEquipment.failureRecords || currentEquipment.failureRecords.length === 0" description="暂无故障记录" />
          <el-table v-else :data="currentEquipment.failureRecords" border style="width: 100%">
            <el-table-column prop="failure_date" label="故障日期" width="120"></el-table-column>
            <el-table-column prop="failure_type" label="故障类型" width="120"></el-table-column>
            <el-table-column prop="reporter" label="报告人" width="100"></el-table-column>
            <el-table-column prop="failure_description" label="故障描述"></el-table-column>
            <el-table-column prop="repair_result" label="修复结果" width="120"></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="检查记录" name="inspection">
          <el-empty v-if="!currentEquipment.inspectionRecords || currentEquipment.inspectionRecords.length === 0" description="暂无检查记录" />
          <el-table v-else :data="currentEquipment.inspectionRecords" border style="width: 100%">
            <el-table-column prop="inspection_date" label="检查日期" width="120"></el-table-column>
            <el-table-column prop="inspector" label="检查人员" width="100"></el-table-column>
            <el-table-column prop="inspection_type" label="检查类型" width="120"></el-table-column>
            <el-table-column prop="result" label="检查结果" width="100"></el-table-column>
            <el-table-column prop="next_inspection_date" label="下次检查日期" width="120"></el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-dialog
      v-model="importDialogVisible"
      title="批量导入设备"
      width="600px"
    >
      <div class="import-content">
        <el-alert
          title="导入说明"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            <div>
              <p>1. 请先下载模板文件，按照模板格式填写设备信息</p>
              <p>2. 支持Excel文件格式（.xlsx, .xls）</p>
              <p>3. 设备编号不能重复，如有重复将跳过该行</p>
              <p>4. 必填字段：设备编号、设备名称、设备状态</p>
            </div>
          </template>
        </el-alert>

        <div class="upload-section">
          <el-upload
            ref="uploadRef"
            class="upload-demo"
            drag
            :auto-upload="false"
            :on-change="handleFileChange"
            :file-list="fileList"
            accept=".xlsx,.xls"
            :limit="1"
            :on-exceed="handleExceed"
          >
            <el-icon class="el-icon--upload"><Upload /></el-icon>
            <div class="el-upload__text">
              将文件拖到此处，或<em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                只能上传xlsx/xls文件，且不超过10MB
              </div>
            </template>
          </el-upload>
        </div>

        <div v-if="importPreview.length > 0" class="preview-section">
          <h4>数据预览（前5条）</h4>
          <el-table :data="importPreview.slice(0, 5)" border style="width: 100%" max-height="300">
            <el-table-column prop="code" label="设备编号" width="120"></el-table-column>
            <el-table-column prop="name" label="设备名称" width="150"></el-table-column>
            <el-table-column prop="model" label="型号" width="100"></el-table-column>
            <el-table-column prop="manufacturer" label="制造商" width="120"></el-table-column>
            <el-table-column prop="location" label="位置" width="100"></el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="scope">
                <el-tag :type="getStatusType(scope.row.status)" size="small">
                  {{ getStatusText(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <p class="preview-info">共 {{ importPreview.length }} 条数据</p>
        </div>

        <div v-if="importResult.total > 0" class="result-section">
          <el-alert
            :title="`导入完成：成功 ${importResult.success} 条，失败 ${importResult.failed} 条`"
            :type="importResult.failed > 0 ? 'warning' : 'success'"
            :closable="false"
            show-icon
          >
            <template #default>
              <div v-if="importResult.errors.length > 0">
                <p>失败原因：</p>
                <ul>
                  <li v-for="(error, index) in importResult.errors.slice(0, 5)" :key="index">
                    {{ error }}
                  </li>
                  <li v-if="importResult.errors.length > 5">
                    ...还有 {{ importResult.errors.length - 5 }} 条错误
                  </li>
                </ul>
              </div>
            </template>
          </el-alert>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeImportDialog">取消</el-button>
          <el-button type="primary" @click="downloadTemplate">下载模板</el-button>
          <el-button
            type="success"
            @click="executeImport"
            :loading="importing"
            :disabled="importPreview.length === 0"
          >
            {{ importing ? '导入中...' : '开始导入' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import apiAdapter from '@/utils/apiAdapter';
import { formatDate } from '@/utils/helpers/dateUtils'

import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { equipmentApi } from '@/services/api'
import { Plus, Search, Refresh, Download, Upload } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性（修复：之前未定义导致运行时 TypeError）
const canDelete = computed(() => authStore.hasPermission('equipment:list:delete'));

// 数据加载状态
const loading = ref(false)

// 表格数据
const tableData = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

// 统计数据
const stats = reactive({
  total: 0,
  normal: 0,
  maintenance: 0,
  repair: 0,
  scrapped: 0
})

// 搜索表单
const searchForm = reactive({
  code: '',
  name: '',
  status: ''
})

// 新增/编辑表单
const formRef = ref(null)
const form = reactive({
  id: '',
  code: '',
  name: '',
  model: '',
  manufacturer: '',
  purchase_date: '',
  inspection_date: '',
  next_inspection_date: '',
  location: '',
  status: 'normal',
  responsible_person: '',
  specs: '',
  description: ''
})

// 表单校验规则
const rules = {
  code: [{ required: true, message: '请输入设备编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  status: [{ required: true, message: '请选择设备状态', trigger: 'change' }]
}

// 对话框控制
const dialogVisible = ref(false)
const dialogTitle = ref('新增设备')
const isEdit = ref(false)

// 查看设备详情相关
const viewDialogVisible = ref(false)
const currentEquipment = ref({})
const activeTab = ref('maintenance')

// 批量导入相关
const importDialogVisible = ref(false)
const uploadRef = ref(null)
const fileList = ref([])
const importPreview = ref([])
const importing = ref(false)
const importResult = reactive({
  total: 0,
  success: 0,
  failed: 0,
  errors: []
})

// 初始化
onMounted(() => {
  fetchEquipmentList()
  fetchEquipmentStats()
})

// 获取设备列表
const fetchEquipmentList = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      ...searchForm
    }
    const res = await equipmentApi.getEquipmentList(params)
    // axios 拦截器已解包，res.data 就是业务数据
    const data = res.data || res
    tableData.value = data.list || data.data?.list || []
    total.value = data.total || data.data?.total || 0
  } catch (error) {
    console.error('获取设备列表失败', error)
    ElMessage.error('获取设备列表失败')
  } finally {
    loading.value = false
  }
}

// 获取设备统计信息
const fetchEquipmentStats = async () => {
  try {
    const res = await equipmentApi.getEquipmentStats()
    // axios 拦截器已解包，res.data 就是业务数据
    const data = res.data || res
    Object.assign(stats, data)
  } catch (error) {
    console.error('获取设备统计信息失败', error)
  }
}

// 重置搜索条件
const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = ''
  })
  fetchEquipmentList()
}

// 打开添加/编辑对话框
const openDialog = (edit, row) => {
  isEdit.value = edit
  dialogTitle.value = edit ? '编辑设备' : '新增设备'
  
  if (edit && row) {
    Object.keys(form).forEach(key => {
      form[key] = row[key] !== undefined ? row[key] : ''
    })
  } else {
    Object.keys(form).forEach(key => {
      form[key] = key === 'status' ? 'normal' : ''
    })
  }
  
  dialogVisible.value = true
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        if (isEdit.value) {
          // 编辑设备
          await equipmentApi.updateEquipment(form.id, form)
          ElMessage.success('设备信息更新成功')
          dialogVisible.value = false
          fetchEquipmentList()
          fetchEquipmentStats()
        } else {
          // 新增设备
          await equipmentApi.createEquipment(form)
          ElMessage.success('设备添加成功')
          dialogVisible.value = false
          fetchEquipmentList()
          fetchEquipmentStats()
        }
      } catch (error) {
        console.error('保存设备信息失败', error)
        const errMsg = error.response?.data?.message || error.message || '未知错误'
        ElMessage.error(`保存设备信息失败: ${errMsg}`)
      }
    }
  })
}

// 查看设备详情
const viewEquipment = async (row) => {
  try {
    const res = await equipmentApi.getEquipmentById(row.id)
    // axios 拦截器已解包
    currentEquipment.value = res.data || res
    viewDialogVisible.value = true
    activeTab.value = 'maintenance'
  } catch (error) {
    console.error('获取设备详情失败', error)
    ElMessage.error('获取设备详情失败')
  }
}

// 删除设备
const deleteEquipment = (row) => {
  ElMessageBox.confirm(
    `确定要删除设备 "${row.name}" 吗？`,
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await equipmentApi.deleteEquipment(row.id)
      ElMessage.success('设备删除成功')
      fetchEquipmentList()
      fetchEquipmentStats()
    } catch (error) {
      console.error('删除设备失败', error)
      ElMessage.error('删除设备失败')
    }
  }).catch(() => {})
}

// 分页相关
const handleSizeChange = (size) => {
  pageSize.value = size
  fetchEquipmentList()
}

const handleCurrentChange = (page) => {
  currentPage.value = page
  fetchEquipmentList()
}

// 获取状态对应的类型
const getStatusType = (status) => {
  const map = {
    normal: 'success',
    maintenance: 'warning',
    repair: 'danger',
    scrapped: 'info'
  }
  return map[status] || 'info'
}

// 获取状态对应的文本
const getStatusText = (status) => {
  const map = {
    normal: '正常',
    maintenance: '维护中',
    repair: '维修中',
    scrapped: '已报废'
  }
  return map[status] || '未知'
}

// 批量导入相关方法
const showImportDialog = () => {
  importDialogVisible.value = true
  resetImportData()
}

const closeImportDialog = () => {
  importDialogVisible.value = false
  resetImportData()
}

const resetImportData = () => {
  fileList.value = []
  importPreview.value = []
  importing.value = false
  Object.assign(importResult, {
    total: 0,
    success: 0,
    failed: 0,
    errors: []
  })
  if (uploadRef.value) {
    uploadRef.value.clearFiles()
  }
}

const handleFileChange = (file) => {
  if (file.raw) {
    parseExcelFile(file.raw)
  }
}

const handleExceed = () => {
  ElMessage.warning('只能上传一个文件')
}

const parseExcelFile = async (file) => {
  try {
    const { default: ExcelJS } = await import('exceljs')
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(arrayBuffer)
        const worksheet = workbook.worksheets[0]

        // 读取数据为数组格式
        const jsonData = []
        worksheet.eachRow((row, rowNumber) => {
          const rowData = []
          row.eachCell((cell, colNumber) => {
            rowData[colNumber - 1] = cell.value
          })
          jsonData.push(rowData)
        })

        if (jsonData.length < 2) {
          ElMessage.error('文件中没有有效数据')
          return
        }

        // 解析数据（跳过标题行）
        const headers = jsonData[0]
        const dataRows = jsonData.slice(1)

        const parsedData = dataRows.map((row, index) => {
          const rowData = {}
          headers.forEach((header, colIndex) => {
            const value = row[colIndex]
            switch (header) {
              case '设备编号':
                rowData.code = value || ''
                break
              case '设备名称':
                rowData.name = value || ''
                break
              case '型号':
                rowData.model = value || ''
                break
              case '制造商':
                rowData.manufacturer = value || ''
                break
              case '采购日期':
                rowData.purchase_date = value ? formatExcelDate(value) : ''
                break
              case '检验日期':
                rowData.inspection_date = value ? formatExcelDate(value) : ''
                break
              case '下次检验日期':
                rowData.next_inspection_date = value ? formatExcelDate(value) : ''
                break
              case '位置':
                rowData.location = value || ''
                break
              case '状态':
                rowData.status = mapStatusFromText(value) || 'normal'
                break
              case '责任人':
                rowData.responsible_person = value || ''
                break
              case '规格':
                rowData.specs = value || ''
                break
              case '描述':
                rowData.description = value || ''
                break
            }
          })
          return rowData
        }).filter(item => item.code && item.name) // 过滤掉必填字段为空的行

        importPreview.value = parsedData
        ElMessage.success(`解析成功，共 ${parsedData.length} 条有效数据`)

      } catch (error) {
        console.error('解析Excel文件失败:', error)
        ElMessage.error('解析Excel文件失败，请检查文件格式')
      }
    }

    reader.readAsArrayBuffer(file.raw || file)
  } catch (error) {
    console.error('读取文件失败:', error)
    ElMessage.error('读取文件失败')
  }
}

const formatExcelDate = (excelDate) => {
  if (typeof excelDate === 'number') {
    // Excel日期转换
    const date = new Date((excelDate - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  } else if (typeof excelDate === 'string') {
    // 尝试解析字符串日期
    const date = new Date(excelDate)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  }
  return ''
}

const mapStatusFromText = (statusText) => {
  const statusMap = {
    '正常': 'normal',
    '维护中': 'maintenance',
    '维修中': 'repair',
    '已报废': 'scrapped'
  }
  return statusMap[statusText] || 'normal'
}

const executeImport = async () => {
  if (importPreview.value.length === 0) {
    ElMessage.warning('没有可导入的数据')
    return
  }

  importing.value = true

  try {
    const res = await equipmentApi.importEquipment(importPreview.value)
    // axios 拦截器已解包
    const result = res.data || res
    Object.assign(importResult, result)

    ElMessage.success(`导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`)

    // 刷新列表
    fetchEquipmentList()
    fetchEquipmentStats()

    // 如果全部成功，关闭对话框
    if (result.failed === 0) {
      setTimeout(() => {
        closeImportDialog()
      }, 2000)
    }
  } catch (error) {
    console.error('导入设备失败:', error)
    ElMessage.error('导入设备失败')
  } finally {
    importing.value = false
  }
}

const downloadTemplate = async () => {
  try {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('设备导入模板')

    // 设置列
    worksheet.columns = [
      { header: '设备编号', key: 'code', width: 15 },
      { header: '设备名称', key: 'name', width: 20 },
      { header: '型号', key: 'model', width: 15 },
      { header: '制造商', key: 'manufacturer', width: 15 },
      { header: '采购日期', key: 'purchase_date', width: 12 },
      { header: '检验日期', key: 'inspection_date', width: 12 },
      { header: '下次检验日期', key: 'next_inspection_date', width: 15 },
      { header: '位置', key: 'location', width: 15 },
      { header: '状态', key: 'status', width: 10 },
      { header: '责任人', key: 'responsible_person', width: 12 },
      { header: '规格', key: 'specs', width: 20 },
      { header: '描述', key: 'description', width: 30 }
    ]

    // 添加示例数据
    worksheet.addRow({
      code: 'EQ001',
      name: '数控机床1号',
      model: 'CNC-2000',
      manufacturer: '某某机械',
      purchase_date: '2024-01-15',
      inspection_date: '2024-01-20',
      next_inspection_date: '2025-01-20',
      location: '车间A-01',
      status: '正常',
      responsible_person: '张三',
      specs: '精度±0.01mm',
      description: '高精度数控机床'
    })
    worksheet.addRow({
      code: 'EQ002',
      name: '焊接机器人',
      model: 'WR-500',
      manufacturer: '机器人公司',
      purchase_date: '2024-02-10',
      inspection_date: '2024-02-15',
      next_inspection_date: '2024-08-15',
      location: '车间B-02',
      status: '维护中',
      responsible_person: '李四',
      specs: '负载50kg',
      description: '六轴焊接机器人'
    })

    // 生成并下载文件
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '设备导入模板.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('下载模板失败:', error)
    ElMessage.error('下载模板失败')
  }
}

// 格式化日期
// formatDate 已统一引用公共实现
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

.header-actions {
  display: flex;
  gap: 12px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
}

/* 统计卡片状态颜色 */
.stat-card.normal .stat-value {
  color: var(--color-success);
}

.stat-card.maintenance .stat-value {
  color: var(--color-warning);
}

.stat-card.repair .stat-value {
  color: var(--color-danger);
}

.stat-card.scrapped .stat-value {
  color: var(--color-text-secondary, #909399);
}

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}

/* 批量导入样式 */
.import-content {
  .upload-section {
    margin: 20px 0;
  }

  .preview-section {
    margin: 20px 0;

    h4 {
      margin-bottom: 12px;
      color: var(--color-text-primary);
    }

    .preview-info {
      margin-top: 8px;
      font-size: 14px;
      color: var(--color-text-regular);
    }
  }

  .result-section {
    margin: 20px 0;
  }
}

.upload-demo {
  width: 100%;
}

:deep(.el-upload-dragger) {
  width: 100%;
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
</style> 