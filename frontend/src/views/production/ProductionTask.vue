<!--
/**
 * ProductionTask.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="production-task-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>生产任务管理</h2>
          <p class="subtitle">管理生产任务分配与执行</p>
        </div>
        <el-button type="primary" :icon="Plus" v-permission="'production:tasks:create'" @click="showCreateModal">创建任务</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="查询">
          <el-input
            v-model="searchForm.keyword"
            placeholder="请输入"
            clearable

          />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"

            clearable
          />
        </el-form-item>
        <el-form-item label="任务状态">
          <el-select v-model="searchForm.status" placeholder="状态" clearable>
            <el-option label="未开始" value="pending" />
            <el-option label="分配中" value="allocated" />
            <el-option label="配料中" value="preparing" />
            <el-option label="已发料" value="material_issued" />
            <el-option label="部分发料" value="material_partial_issued" />
            <el-option label="生产中" value="in_progress" />
            <el-option label="待检验" value="inspection" />
            <el-option label="入库中" value="warehousing" />
            <el-option label="已完成" value="completed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 搜索
          </el-button>
          <el-button @click="handleReset" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡片区域 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.total }}</div>
        <div class="stat-label">总任务数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.pending }}</div>
        <div class="stat-label">未开始</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.preparing }}</div>
        <div class="stat-label">配料中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.material_issued }}</div>
        <div class="stat-label">已发料</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.in_progress }}</div>
        <div class="stat-label">生产中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.completed }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ taskStats.cancelled }}</div>
        <div class="stat-label">已取消</div>
      </el-card>
    </div>

    <!-- 数据表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="taskList"
        border
        style="width: 100%"
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无生产任务数据" />
        </template>
        <!-- 展开详情列 -->
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="task-detail">
              <el-descriptions :column="3" border>
                <el-descriptions-item label="任务编号">{{ props.row.code }}</el-descriptions-item>
                <el-descriptions-item label="产品名称">{{ props.row.productName }}</el-descriptions-item>
                <el-descriptions-item label="物料编码">{{ props.row.productCode || '-' }}</el-descriptions-item>
                <el-descriptions-item label="规格型号">{{ props.row.specs || '-' }}</el-descriptions-item>
                <el-descriptions-item label="关联单据">
                  <template v-if="props.row.plan_id">
                    {{ planList.find(plan => String(plan.id) === String(props.row.plan_id))?.code || '未找到计划' }}
                  </template>
                  <template v-else>无关联计划</template>
                </el-descriptions-item>
                <el-descriptions-item label="生产数量">
                  {{ displayQuantity(props.row.quantity) }}
                </el-descriptions-item>
                <el-descriptions-item label="生产组">{{ props.row.manager || '-' }}</el-descriptions-item>
                <el-descriptions-item label="开始日期">
                  {{ props.row.startDate ? dayjs(props.row.startDate).format('YYYY-MM-DD') : '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="预计结束日期">
                  {{ props.row.expectedEndDate ? dayjs(props.row.expectedEndDate).format('YYYY-MM-DD') : '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="实际结束日期">
                  {{ props.row.actualEndDate ? dayjs(props.row.actualEndDate).format('YYYY-MM-DD') : '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="备注" :span="3">{{ props.row.remarks || '无' }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="code" label="任务编号" width="130" show-overflow-tooltip />
        <el-table-column prop="productCode" label="物料编码" width="120" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品名称" min-width="130" show-overflow-tooltip />
        <el-table-column prop="specs" label="规格型号" min-width="150" show-overflow-tooltip />
        <el-table-column prop="contract_code" label="合同编码" width="130" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.contract_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="数量" width="80">
          <template #default="scope">
            {{ displayQuantity(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column prop="startDate" label="开始日期" width="100" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.startDate ? dayjs(scope.row.startDate).format('YYYY-MM-DD') : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="发料时间" width="110" align="center" show-overflow-tooltip>
          <template #default="scope">
            <span v-if="scope.row.actual_start_time || scope.row.actualStartTime">
              {{ dayjs(scope.row.actual_start_time || scope.row.actualStartTime).format('YYYY-MM-DD') }}
            </span>
            <span v-else class="text-secondary">未发料</span>
          </template>
        </el-table-column>
        <el-table-column prop="expectedEndDate" label="预计结束" width="100" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.expectedEndDate ? dayjs(scope.row.expectedEndDate).format('YYYY-MM-DD') : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="manager" label="生产组" width="100" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="scope">
            <el-tag
              :type="getStatusType(scope.row.status)"
              :class="getStatusClass(scope.row.status)"
            >
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="260" fixed="right">
          <template #default="scope">
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
              <!-- 查看按钮 -->
              <el-button v-permission="'production:tasks:view'"
                size="small"
                type="primary"
                @click="showTaskDetail(scope.row)"
              >
                查看
              </el-button>
              <!-- 编辑按钮 - 只在发料前显示 -->
              <el-button v-permission="'production:tasks:update'"
                v-if="scope.row.status === 'pending' || scope.row.status === 'allocated' || scope.row.status === 'preparing'"
                size="small"
                type="success"
                @click="handleEdit(scope.row)"
              >
                编辑
              </el-button>
              <!-- 发料按钮：只有在尚未生成关联出库单时才显示 -->
              <el-button v-permission="'production:tasks:issue'"
                v-if="(scope.row.status === 'pending' || scope.row.status === 'allocated' || scope.row.status === 'preparing') && Number(scope.row.has_outbound_document) !== 1"
                size="small"
                type="warning"
                @click="showMaterialIssueDialog(scope.row)"
              >
                发料
              </el-button>
              <!-- 删除按钮 - 只有pending状态可以删除 -->
              <el-popconfirm
                v-if="scope.row.status === 'pending'"
                title="确定要删除该生产任务吗？此操作无法恢复。"
                @confirm="handleDelete(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button v-permission="'production:tasks:delete'"
                    size="small"
                    type="danger"
                  >
                    删除
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="currentPage"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pageSize"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(total, 1)"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 创建/编辑任务对话框 -->
    <el-dialog
      v-model="modalVisible"
      :title="modalTitle"
      width="800px"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="任务编号" prop="code">
              <el-input v-model="formData.code" disabled :placeholder="modalTitle === '新建生产任务' ? '系统自动生成' : ''" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生产组" prop="manager">
              <el-select 
                v-model="formData.manager" 
                placeholder="请选择生产组" 
                filterable 
                allow-create
                default-first-option
                style="width: 100%"
              >
                <el-option
                  v-for="group in productionUsers.filter(g => g && g.name)"
                  :key="group.id || group.name"
                  :label="group.name"
                  :value="group.name"
                >
                  <span style="float: left">{{ group.name }}</span>
                  <span style="float: right; color: #8492a6; font-size: 13px">{{ group.code }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="生产计划" prop="planId">
              <el-select 
                v-model="formData.planId" 
                placeholder="请输入计划编号或产品名称搜索" 
                style="width: 100%" 
                @change="handlePlanChange" 
                filterable
                remote
                reserve-keyword
                :remote-method="searchPlans"
                :loading="planSearchLoading"
                @focus="handlePlanSelectFocus"
              >
                <el-option 
                  v-for="plan in filteredPlanList.filter(p => p && p.id != null)" 
                  :key="plan.id" 
                  :label="`${plan.code} - ${plan.productName}`" 
                  :value="plan.id"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center">
                    <span>{{ plan.code }}</span>
                    <span style="color: #999; font-size: 13px">{{ plan.productName }} ({{ plan.status }})</span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="产品名称">
              <el-input v-model="formData.productName" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生产数量">
              <el-input v-model="formData.quantity" disabled>
                <template #append v-if="isQuantityValid(formData.quantity)">件</template>
                <template #append v-else>-</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20" v-if="formData.productId">
          <el-col :span="24">
            <el-form-item label="工序模板" prop="processTemplateId">
              <el-select 
                v-model="formData.processTemplateId" 
                placeholder="选择工序模板" 
                style="width: 100%"
                @change="handleProcessTemplateChange"
                :loading="processTemplateLoading"
              >
                <el-option
                  v-for="template in processTemplateList.filter(t => t && t.id)"
                  :key="template.id"
                  :label="template.name"
                  :value="template.id"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center">
                    <span>{{ template.name }}</span>
                    <span style="color: #999; font-size: 13px">{{ (template.processes || []).length }}个工序</span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-divider content-position="center">时间安排</el-divider>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开始日期" prop="startDate">
              <el-date-picker v-model="formData.startDate" type="date" placeholder="选择开始日期" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束日期" prop="expectedEndDate">
              <el-date-picker v-model="formData.expectedEndDate" type="date" placeholder="选择预计结束日期" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="备注" prop="remarks">
              <el-input
                v-model="formData.remarks"
                type="textarea"
                :rows="3"
                placeholder="请输入备注信息"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleModalCancel">取消</el-button>
          <el-button type="primary" @click="handleModalOk">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 任务详情对话框 -->
    <el-dialog
      v-model="detailVisible"
      title="任务详情"
      width="800px"
    >
      <el-descriptions :column="3" border>
        <el-descriptions-item label="任务编号">{{ taskDetail.code }}</el-descriptions-item>
        <el-descriptions-item label="产品名称">{{ taskDetail.productName }}</el-descriptions-item>
        <el-descriptions-item label="关联单据">
          <template v-if="taskDetail.plan_id">
            {{ planList.find(plan => String(plan.id) === String(taskDetail.plan_id))?.code || '未找到计划' }}
          </template>
          <template v-else>无关联计划</template>
        </el-descriptions-item>
        <el-descriptions-item label="生产数量">
          {{ displayQuantity(taskDetail.quantity) }}
        </el-descriptions-item>
        <el-descriptions-item label="生产组">{{ taskDetail.manager || '-' }}</el-descriptions-item>
        <el-descriptions-item label="开始日期">{{ taskDetail.startDate }}</el-descriptions-item>
        <el-descriptions-item label="预计结束日期">{{ taskDetail.expectedEndDate }}</el-descriptions-item>
        <el-descriptions-item label="实际结束日期">{{ taskDetail.actualEndDate }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag
            :type="getStatusType(taskDetail.status)"
            :class="getStatusClass(taskDetail.status)"
          >
            {{ getStatusText(taskDetail.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="3">{{ taskDetail.remarks || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ taskDetail.createdAt }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ taskDetail.updatedAt }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button v-permission="'production:productiontask:print'" type="primary" @click="printTaskDetail" v-if="taskDetail.id">打印任务单</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 发料对话框 -->
    <el-dialog
      v-model="materialIssueDialogVisible"
      title="生产任务发料"
      width="500px"
      destroy-on-close
    >
      <el-form :model="materialIssueForm" label-width="100px">
        <el-form-item label="任务编号">
          <el-input v-model="materialIssueForm.taskCode" disabled />
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="materialIssueForm.productName" disabled />
        </el-form-item>
        <el-form-item label="生产数量">
          <el-input v-model="materialIssueForm.quantity" disabled />
        </el-form-item>
        <el-form-item label="发料时间" required>
          <el-date-picker
            v-model="materialIssueForm.issueDate"
            type="date"
            placeholder="选择发料日期"
            style="width: 100%"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="materialIssueDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleMaterialIssue" :loading="materialIssueLoading">
            确认发料
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from '@/services/api'
import { productionApi } from '@/services/api'
import dayjs from 'dayjs'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { parseQuantity, formatQuantity, getQuantityFromRelatedItem } from '@/utils/helpers/quantity'
import { useAuthStore } from '@/stores/auth'
import { parseListData } from '@/utils/responseParser'

// 获取当前登录用户
const authStore = useAuthStore()

// 权限控制统一使用模板中的 v-permission 指令

// 状态和数据
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const taskList = ref([])
const planList = ref([])              // 生产计划缓存
const filteredPlanList = ref([])      // 远程搜索结果
const planSearchLoading = ref(false)  // 搜索加载状态
const modalVisible = ref(false)
const modalTitle = ref('新建生产任务')
const formRef = ref(null)
const productionUsers = ref([]) // 添加生产部用户列表

// 发料对话框相关
const materialIssueDialogVisible = ref(false)
const materialIssueLoading = ref(false)
const materialIssueForm = ref({
  taskId: null,
  taskCode: '',
  productName: '',
  quantity: '',
  issueDate: dayjs().format('YYYY-MM-DD')
})
const currentTaskForIssue = ref(null)

// 工序模板相关
const processTemplateList = ref([])
const processTemplateLoading = ref(false)
const selectedTemplate = ref(null)  // 当前选中的工序模板

// 表单数据和规则
const formData = ref({
  code: '',
  planId: undefined,
  productId: '',
  productName: '',
  quantity: '',
  processTemplateId: undefined,  // 工序模板ID
  startDate: null,
  expectedEndDate: null,
  manager: '',
  remarks: ''
})

const rules = {
  planId: [{ required: false, message: '请选择生产计划', trigger: 'change' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  expectedEndDate: [{ required: true, message: '请选择预计结束日期', trigger: 'change' }],
  manager: [{ required: true, message: '请选择生产计划以自动设置生产组', trigger: 'blur' }]
}

// 搜索表单
const searchForm = ref({
  keyword: '',  // 合并的搜索关键词（任务编号/产品/物料）
  status: '',
  dateRange: []  // 时间范围
})

// 统计数据
const taskStats = ref({
  total: 0,
  pending: 0,
  preparing: 0,
  material_issued: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0
})

// 检查数量是否有效
const isQuantityValid = (quantity) => {
  return quantity !== null && quantity !== undefined && quantity !== '' || quantity === 0
}

// 格式化显示数量
const displayQuantity = (quantity) => {
  return isQuantityValid(quantity) ? formatQuantity(quantity) : '-'
}

// API函数
// 获取任务列表
const fetchTaskList = async () => {
  try {
    loading.value = true
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.value.keyword,
      status: searchForm.value.status
    }

    // 添加时间范围参数
    if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
      params.startDate = searchForm.value.dateRange[0]
      params.endDate = searchForm.value.dateRange[1]
    }

    const response = await productionApi.getProductionTasks(params)

    // 拦截器已解包，response.data 就是业务数据
    const responseData = response.data

    // 确保日期字段和产品名称正确映射
    taskList.value = (responseData?.items || responseData?.list || []).map(item => {
      // 特殊处理数量字段
      let quantity = parseQuantity(item.quantity);

      if (quantity === null) {
        // 如果任务数量为空，尝试从关联的生产计划中获取数量
        if (item.plan_id) {
          quantity = getQuantityFromRelatedItem(planList.value, item.plan_id);
        }
      }
      
      // 确保0值不会丢失
      if (quantity === 0) {
        quantity = 0; // 确保是数值0而不是其他假值
      }
      
      const mappedItem = {
        ...item,
        startDate: item.start_date || item.startDate,
        expectedEndDate: item.expected_end_date || item.expectedEndDate,
        actualEndDate: item.actual_end_date || item.actualEndDate,
        actualStartTime: item.actual_start_time || item.actualStartTime,
        productName: item.product_name || item.productName || '无关联产品',
        quantity: quantity  // 使用处理后的数量
      }

      return mappedItem
    })
    
    total.value = response.data.total || 0

    // 更新统计数据（使用后端返回的统计信息）
    updateTaskStats(response.data.statistics)
  } catch (error) {
    console.error('获取生产任务列表失败:', error)
    ElMessage.error(`获取生产任务列表失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// 获取自动生成的任务编号
const getTaskCode = async () => {
  try {
    const response = await productionApi.generateTaskCode()
    return response.data.code
  } catch (error) {
    console.error('获取任务编号失败:', error)
    ElMessage.error(`获取任务编号失败: ${error.message}`)
    return null
  }
}

// 获取计划列表
const fetchPlanList = async () => {
  try {
    // 只加载少量计划用于缓存，远程搜索会按需加载
    const response = await productionApi.getProductionPlans({
      page: 1,
      pageSize: 100
    })

    // 使用统一解析器
    const planItems = parseListData(response, { enableLog: false })
    planList.value = planItems
      .filter(plan => plan.id !== null && plan.id !== undefined)
      .map(plan => formatPlanItem(plan))
    
    // 同步到过滤结果
    filteredPlanList.value = [...planList.value]

    } catch (error) {
    console.error('获取生产计划列表失败:', error)
    ElMessage.error('获取生产计划列表失败')
  }
}

// 格式化计划数据
const formatPlanItem = (plan) => {
  const quantity = parseQuantity(plan.quantity);
  return {
    id: plan.id,
    code: plan.code,
    productId: plan.product_id,
    productName: plan.product_name || plan.productName || '未知产品',
    quantity: quantity,
    start_date: plan.startDate || plan.start_date,
    end_date: plan.endDate || plan.end_date,
    status: plan.status
  }
}

// 远程搜索生产计划
const searchPlans = async (query) => {
  if (!query || query.length < 1) {
    // 没有搜索关键字时显示缓存数据
    filteredPlanList.value = planList.value.slice(0, 50)
    return
  }
  
  planSearchLoading.value = true
  try {
    const response = await productionApi.getProductionPlans({
      page: 1,
      pageSize: 50,
      keyword: query.trim()
    })
    
    const planItems = parseListData(response, { enableLog: false })
    filteredPlanList.value = planItems
      .filter(plan => plan.id !== null && plan.id !== undefined)
      .map(plan => formatPlanItem(plan))
    
    // 更新缓存
    filteredPlanList.value.forEach(item => {
      if (!planList.value.find(p => p.id === item.id)) {
        planList.value.push(item)
      }
    })
  } catch (error) {
    console.error('搜索生产计划失败:', error)
    filteredPlanList.value = []
  } finally {
    planSearchLoading.value = false
  }
}

// 计划下拉框获得焦点时加载初始数据
const handlePlanSelectFocus = async () => {
  if (filteredPlanList.value.length === 0) {
    planSearchLoading.value = true
    try {
      const response = await productionApi.getProductionPlans({
        page: 1,
        pageSize: 50
      })
      const planItems = parseListData(response, { enableLog: false })
      filteredPlanList.value = planItems
        .filter(plan => plan.id !== null && plan.id !== undefined)
        .map(plan => formatPlanItem(plan))
      
      // 更新缓存
      filteredPlanList.value.forEach(item => {
        if (!planList.value.find(p => p.id === item.id)) {
          planList.value.push(item)
        }
      })
    } catch (error) {
      console.error('加载生产计划列表失败:', error)
    } finally {
      planSearchLoading.value = false
    }
  }
}

import { getProductionStatusText, getProductionStatusColor } from '@/constants/systemConstants'

// 状态相关
const getStatusType = (status) => {
  return getProductionStatusColor(status)
}

const getStatusText = (status) => {
  return getProductionStatusText(status)
}

// 获取状态自定义样式类
const getStatusClass = (status) => {
  if (status === 'in_progress') return 'status-in-progress'
  if (status === 'inspection') return 'status-inspection'
  return ''
}

// 分页处理
const handleSizeChange = (val) => {
  pageSize.value = val
  fetchTaskList()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchTaskList()
}

// 表单处理
const showCreateModal = async () => {
  modalTitle.value = '新建生产任务'
  const taskCode = await getTaskCode()
  if (!taskCode) {
    return
  }
  formData.value = {
    code: taskCode,
    planId: undefined,
    productId: '',
    productName: '',
    quantity: '',
    startDate: null,
    expectedEndDate: null,
    manager: '',
    remarks: ''
  }
  modalVisible.value = true
}

const handleEdit = async (record) => {
  modalTitle.value = '编辑生产任务'
  
  // 确保计划列表已加载
  if (planList.value.length === 0) {
    await fetchPlanList();
  }
  
  // 处理数量字段
  const quantity = parseQuantity(record.quantity);
  
  // 先设置基本表单数据，显式映射所有字段
  formData.value = {
    ...record,
    code: record.code || record.task_code || '',  // 确保code正确映射
    planId: record.plan_id || record.planId,
    productId: record.product_id || record.productId,
    productName: record.product_name || record.productName || '',
    quantity: quantity,
    manager: record.manager || '',
    startDate: record.startDate ? new Date(record.startDate) : null,
    expectedEndDate: record.expectedEndDate ? new Date(record.expectedEndDate) : null,
    remarks: record.remarks || ''
  }
  
  // 如果任务有关联的计划ID，但计划相关信息不完整，尝试从计划列表中获取更多信息
  if (record.plan_id) {
    const relatedPlan = planList.value.find(plan => String(plan.id) === String(record.plan_id));
    if (relatedPlan) {
      // 确保planId是正确的类型（数字）
      formData.value.planId = Number(record.plan_id);
      
      // 如果产品名称为空，从计划中获取
      if (!formData.value.productName && relatedPlan.productName) {
        formData.value.productName = relatedPlan.productName;
      }
      // 如果产品ID为空，从计划中获取
      if (!formData.value.productId && relatedPlan.productId) {
        formData.value.productId = relatedPlan.productId;
      }
    } else {
      // 如果没有找到关联计划，尝试重新获取计划列表
      await fetchPlanList();
      // 再次尝试找到关联计划
      const refreshedPlan = planList.value.find(plan => String(plan.id) === String(record.plan_id));
      if (refreshedPlan) {
        formData.value.planId = Number(record.plan_id);
        if (!formData.value.productName && refreshedPlan.productName) {
          formData.value.productName = refreshedPlan.productName;
        }
        if (!formData.value.productId && refreshedPlan.productId) {
          formData.value.productId = refreshedPlan.productId;
        }
      }
    }
  }
  
  modalVisible.value = true
}

const handleModalOk = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    
    const payload = {
      plan_id: formData.value.planId,
      product_id: formData.value.productId,
      quantity: formData.value.quantity,
      start_date: formData.value.startDate ? dayjs(formData.value.startDate).format('YYYY-MM-DD') : null,
      expected_end_date: formData.value.expectedEndDate ? dayjs(formData.value.expectedEndDate).format('YYYY-MM-DD') : null,
      manager: formData.value.manager,
      remarks: formData.value.remarks,
      process_template_id: formData.value.processTemplateId  // 添加工序模板ID
    }
    
    if (formData.value.id) {
      // 编辑模式
      await axios.put(`/production/tasks/${formData.value.id}`, payload)
      ElMessage.success('生产任务更新成功')
    } else {
      // 创建模式
      await axios.post('/production/tasks', payload)
      ElMessage.success('生产任务创建成功')
    }
    
    modalVisible.value = false
    await fetchTaskList()
    // 统计数据已在 fetchTaskList 中更新
  } catch (error) {
    console.error('提交表单失败:', error)
    ElMessage.error('提交表单失败')
  }
}

const handleModalCancel = () => {
  modalVisible.value = false
  formRef.value.resetFields()
}

const handleDelete = async (row) => {
  try {
    await productionApi.deleteProductionTask(row.id)
    ElMessage.success('删除成功')
    fetchTaskList()
  } catch (error) {
    console.error('删除生产任务失败:', error)
    ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
  }
}

const detailVisible = ref(false)
const taskDetail = ref({})

const showTaskDetail = (record) => {
  // 处理数量字段
  const quantity = parseQuantity(record.quantity);
  
  taskDetail.value = {
    ...record,
    quantity: quantity,
    startDate: record.startDate ? dayjs(record.startDate).format('YYYY-MM-DD') : '-',
    expectedEndDate: record.expectedEndDate ? dayjs(record.expectedEndDate).format('YYYY-MM-DD') : '-',
    actualEndDate: record.actualEndDate ? dayjs(record.actualEndDate).format('YYYY-MM-DD') : '-',
    createdAt: record.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') : '-',
    updatedAt: record.updatedAt ? dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm') : '-'
  }
  
  detailVisible.value = true
}

// 生产计划选择处理
const handlePlanChange = async (planId) => {
  if (!planId) {
    formData.value.productId = ''
    formData.value.productName = ''
    formData.value.quantity = ''
    formData.value.manager = ''
    processTemplateList.value = []
    formData.value.processTemplateId = undefined
    productionUsers.value = []
    return
  }

  const selectedPlan = planList.value.find(plan => plan.id === planId)
  if (selectedPlan) {
    formData.value.productId = selectedPlan.productId
    formData.value.productName = selectedPlan.productName
    formData.value.quantity = selectedPlan.quantity

    // 获取该产品的工序模板
    await fetchProductProcessTemplates(selectedPlan.productId)

    // 根据产品ID获取物料信息，从而获取生产组
    await fetchProductionGroupByProduct(selectedPlan.productId)
  }
}

// 获取产品关联的工序模板
const fetchProductProcessTemplates = async (productId) => {
  if (!productId) return

  try {
    processTemplateLoading.value = true
    formData.value.processTemplateId = undefined

    const response = await axios.get(`/baseData/products/${productId}/process-template`)

    // 拦截器已解包，response.data 就是业务数据
    if (response.data) {
      // 如果有默认工序模板，直接使用
      selectedTemplate.value = response.data
      formData.value.processTemplateId = response.data.id
    }

    // 获取所有可用的工序模板
    const allTemplatesResponse = await axios.get('/baseData/process-templates', {
      params: {
        productId: productId,
        pageSize: 100
      }
    })

    // 拦截器已解包，response.data 就是业务数据
    const templatesData = allTemplatesResponse.data?.list || allTemplatesResponse.data || [];
    if (Array.isArray(templatesData)) {
      processTemplateList.value = templatesData
    } else {
      processTemplateList.value = []
    }
  } catch (error) {
    console.error('获取产品工序模板失败:', error)
    ElMessage.warning('获取产品工序模板失败')
    processTemplateList.value = []
  } finally {
    processTemplateLoading.value = false
  }
}

// 处理工序模板选择变化
const handleProcessTemplateChange = (templateId) => {
  // 工序模板选择变化时的处理逻辑
  // 当前仅用于记录选择，实际业务逻辑可在此扩展
}

// 重置搜索方法
const handleReset = () => {
  searchForm.value.keyword = '';
  searchForm.value.status = '';
  searchForm.value.dateRange = [];
  handleSearch();
};

// 搜索方法
const handleSearch = () => {
  currentPage.value = 1;
  fetchTaskList();
};

// 更新统计数据（从后端返回的数据中获取）
const updateTaskStats = (statistics) => {
  if (statistics) {
    taskStats.value = {
      total: Number(statistics.total) || 0,
      pending: Number(statistics.pending) || 0,
      preparing: Number(statistics.preparing) || 0,
      material_issued: Number(statistics.material_issued) || 0,
      in_progress: Number(statistics.in_progress) || Number(statistics.inProgress) || 0,
      completed: Number(statistics.completed) || 0,
      cancelled: Number(statistics.cancelled) || 0
    };
  }
};

// 显示发料对话框
const showMaterialIssueDialog = (row) => {
  currentTaskForIssue.value = row
  materialIssueForm.value = {
    taskId: row.id,
    taskCode: row.code,
    productName: row.productName || row.product_name,
    quantity: displayQuantity(row.quantity),
    issueDate: dayjs().format('YYYY-MM-DD HH:mm:ss')
  }
  materialIssueDialogVisible.value = true
}

// 处理发料
const handleMaterialIssue = async () => {
  if (!materialIssueForm.value.issueDate) {
    ElMessage.warning('请选择发料时间')
    return
  }

  try {
    materialIssueLoading.value = true

    const task = currentTaskForIssue.value
    const productId = task.productId || task.product_id
    const taskQuantity = task.quantity

    // 1. 获取产品的BOM信息
    const bomRes = await axios.get(`/production/product-bom/${productId}`)
    if (!bomRes.data || !bomRes.data.id) {
      ElMessage.error('该产品没有BOM，无法生成出库单')
      return
    }

    const bom = bomRes.data

    // 2. 计算物料需求
    const materialsRes = await axios.post('/production/calculate-materials', {
      productId: productId,
      bomId: bom.id,
      quantity: Number(taskQuantity),
      forceAnalysis: true
    })

    if (!materialsRes.data || materialsRes.data.length === 0) {
      ElMessage.warning('该产品BOM没有物料明细')
      return
    }

    // 3. 准备出库单数据
    // 下推时不设置操作人，等用户确认时再记录
    const outboundData = {
      outboundDate: materialIssueForm.value.issueDate,
      operator: 'system',  // 下推时使用系统，确认时才记录实际操作人
      remark: `生产任务 ${task.code} 发料`,
      status: 'draft',
      productionTaskId: task.id,
      items: materialsRes.data.map(material => ({
        materialId: material.materialId,
        quantity: material.requiredQuantity,
        unitId: material.unitId || material.unit_id,
        remark: `任务${task.code}所需`
      }))
    }

    // 4. 创建出库单
    const outboundRes = await axios.post('/inventory/outbound', outboundData)

    if (outboundRes.data?.success || outboundRes.success || outboundRes.data?.id || outboundRes.id) {
      ElMessage.success(`出库单创建成功！单号：${outboundRes.data?.data?.outboundNo || outboundRes.data?.outboundNo || ''}`)
      materialIssueDialogVisible.value = false

      // 更新生产任务状态为配料中 (preparing/material_issuing)
      try {
        await productionApi.updateProductionTaskStatus(task.id, { status: 'preparing' })
      } catch (err) {
        console.warn('更新生产任务状态为配料中失败', err)
      }

      // 刷新任务列表
      await fetchTaskList()
    } else {
      throw new Error(outboundRes.data.message || '创建出库单失败')
    }

  } catch (error) {
    console.error('发料失败:', error)
    console.error('错误详情:', error.response?.data)
    ElMessage.error('发料失败: ' + (error.response?.data?.error || error.response?.data?.message || error.message))
  } finally {
    materialIssueLoading.value = false
  }
}

// 添加打印任务单方法 - 使用打印模板服务
const printTaskDetail = async () => {
  try {
    const task = taskDetail.value;
    
    // 获取关联计划编号
    const relatedPlanCode = task.plan_id 
      ? (planList.value.find(plan => String(plan.id) === String(task.plan_id))?.code || '未找到计划') 
      : '-';
    
    // 准备打印数据
    const printData = {
      code: task.code || '-',
      productName: task.productName || '-',
      productCode: task.productCode || '-',
      specs: task.specs || '-',
      relatedPlanCode: relatedPlanCode,
      quantity: task.quantity !== null && task.quantity !== undefined && task.quantity !== '' || task.quantity === 0 ? formatQuantity(task.quantity) : '-',
      manager: task.manager || '-',
      startDate: task.startDate || '-',
      expectedEndDate: task.expectedEndDate || '-',
      actualEndDate: task.actualEndDate || '-',
      statusText: getStatusText(task.status),
      remarks: task.remarks || '无'
    };
    
    // 获取打印模板
    const response = await axios.get('/print/templates/default', {
      params: {
        module: 'production',
        template_type: 'production_task'
      }
    });

    // 适配多种响应格式
    let template = null;
    if (response.data?.data) {
      template = response.data.data;
    } else if (response.data?.content) {
      template = response.data;
    }

    if (!template || !template.content) {
      ElMessage.error('未找到生产任务单打印模板，请在系统设置中配置');
      return;
    }

    // 替换模板中的变量
    let htmlContent = template.content;

    // 解码 HTML 实体（如果模板内容被转义了）
    if (htmlContent.includes('&lt;') || htmlContent.includes('&gt;')) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = htmlContent;
      htmlContent = textarea.value;
    }

    for (const [key, value] of Object.entries(printData)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      htmlContent = htmlContent.replace(regex, value);
    }
    
    // 打开新窗口并打印
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error('打印失败: ' + (error.response?.data?.message || error.message));
  }
}

// 根据产品ID获取物料的生产组信息
const fetchProductionGroupByProduct = async (productId) => {
  try {
    if (!productId) {
      productionUsers.value = [];
      formData.value.manager = '';
      return;
    }

    // 获取产品详情（产品数据存储在materials表中）
    const response = await axios.get(`/baseData/materials/${productId}`);
    const product = response.data;

    // 产品本身就是物料，直接使用其production_group_id
    if (product && product.production_group_id) {
      // 获取生产组（部门）信息
      const deptResponse = await axios.get('/system/departments');
      // 拦截器已解包，response.data 就是业务数据
      let departments = [];

      if (Array.isArray(deptResponse.data)) {
        departments = deptResponse.data;
      } else if (deptResponse.data && deptResponse.data.list) {
        departments = deptResponse.data.list;
      }

      // 找到对应的生产组
      const productionGroup = departments.find(dept => dept.id === product.production_group_id);

      if (productionGroup) {
        // 将生产组设置为选项，并自动选中
        productionUsers.value = [productionGroup];
        formData.value.manager = productionGroup.name;
      } else {
        productionUsers.value = [];
        formData.value.manager = '';
      }
    } else {
      // 如果物料没有设置生产组，清空负责人
      productionUsers.value = [];
      formData.value.manager = '';
      ElMessage.warning('该物料未设置生产组，请先在物料管理中设置');
    }
  } catch (error) {
    productionUsers.value = [];
    formData.value.manager = '';
  }
};

// 获取生产组列表（从部门获取，生产组是生产部下的子部门）
const fetchProductionUsers = async () => {
  try {
    // 获取所有部门
    const response = await axios.get('/system/departments', {
      timeout: 10000
    });

    const departments = parseListData(response, { enableLog: false });
    
    // 找到生产部（通常名称为"生产部"或"生产中心"）
    const productionDept = departments.find(dept => 
      dept && (dept.name === '生产部' || dept.name === '生产中心' || dept.name.includes('生产'))
    );
    
    if (productionDept) {
      // 获取生产部下的所有子部门作为生产组
      productionUsers.value = departments.filter(dept => 
        dept && dept.parent_id === productionDept.id
      ).map(dept => ({
        id: dept.id,
        name: dept.name,
        code: dept.code || ''
      }));
    }
    
    // 如果没有找到生产组子部门，显示所有部门作为备选
    if (productionUsers.value.length === 0) {
      productionUsers.value = departments.filter(dept => dept && dept.name).map(dept => ({
        id: dept.id,
        name: dept.name,
        code: dept.code || ''
      }));
    }
  } catch (error) {
    console.error('获取生产组失败:', error);
    productionUsers.value = [];
  }
}

onMounted(async () => {
  try {
    loading.value = true;
    // 先获取所有计划列表，再获取任务列表
    await fetchPlanList();
    await fetchTaskList();
    await fetchProductionUsers(); // 添加获取生产部用户
  } catch (error) {
    ElMessage.error('加载数据失败，请刷新页面重试');
  } finally {
    loading.value = false;
  }
})
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
  color: #303133;
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.task-detail {
  padding: 20px;
}

/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}

.danger {
  color: var(--color-danger);
}

/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表格单元格超出内容省略显示 */
:deep(.el-table .el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表格单元格内的内容也要省略 */
:deep(.el-table .cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 确保表格列不换行 */
:deep(.el-table__body-wrapper .el-table__cell .cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: keep-all;
}

/* 自定义状态标签颜色 */
/* 生产中 - 深蓝色 */
.status-in-progress {
  --el-tag-bg-color: #1e40af !important;
  --el-tag-border-color: #1e40af !important;
  --el-tag-text-color: #ffffff !important;
  background-color: #1e40af !important;
  border-color: #1e40af !important;
  color: #ffffff !important;
}

/* 待检验 - 紫色 */
.status-inspection {
  --el-tag-bg-color: #7c3aed !important;
  --el-tag-border-color: #7c3aed !important;
  --el-tag-text-color: #ffffff !important;
  background-color: #7c3aed !important;
  border-color: #7c3aed !important;
  color: #ffffff !important;
}
</style>