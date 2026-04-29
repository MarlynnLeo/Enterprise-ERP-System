<!--
/**
 * FirstArticleInspection.vue
 * @description 首检管理页面
 * @date 2025-12-04
 * @version 1.0.0
 */
-->
<template>
  <div class="inspection-container">
    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-label">全部首检单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value pending">{{ stats.pending || 0 }}</div>
        <div class="stat-label">待检验</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value passed">{{ stats.passed || 0 }}</div>
        <div class="stat-label">合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value failed">{{ stats.failed || 0 }}</div>
        <div class="stat-label">不合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value conditional">{{ stats.conditional || 0 }}</div>
        <div class="stat-label">有条件放行</div>
      </el-card>
    </div>

    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>首检管理</span>
          <div>
            <el-button type="primary" @click="showRulesDialog = true">
              <el-icon><Setting /></el-icon>首检规则
            </el-button>
          </div>
        </div>
      </template>
      
      <!-- 搜索表单 -->
      <div class="search-container">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-input  v-model="searchKeyword" placeholder="检验单号/任务号/产品名称" @keyup.enter="handleSearch" clearable >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </el-col>
          <el-col :span="4">
            <el-select v-model="statusFilter" placeholder="检验状态" clearable @change="handleSearch" style="width: 100%">
              <el-option v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-col>
          <el-col :span="8">
            <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" @change="handleSearch" style="width: 100%" />
          </el-col>
          <el-col :span="6">
            <div class="search-buttons">
              <el-button type="primary" @click="handleSearch"><el-icon><Search /></el-icon>查询</el-button>
              <el-button @click="handleReset"><el-icon><Refresh /></el-icon>重置</el-button>
              <el-button v-permission="'quality:inspections:create'" type="primary" @click="showCreateDialog = true"><el-icon><Plus /></el-icon>新增</el-button>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 首检单列表 -->
      <el-table :data="inspectionList" border style="width: 100%; margin-top: 16px;" v-loading="loading">
        <el-table-column prop="inspection_no" label="检验单号" min-width="140" />
        <el-table-column prop="task_code" label="生产任务号" min-width="130" />
        <el-table-column prop="product_name" label="产品名称" min-width="160" />
        <el-table-column prop="product_code" label="产品编码" min-width="120" />
        <el-table-column prop="batch_no" label="批次号" min-width="160" />
        <el-table-column label="检验数量" min-width="120">
          <template #default="{ row }">
            {{ row.quantity }} {{ row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="planned_date" label="计划日期" min-width="100">
          <template #default="{ row }">{{ formatDate(row.planned_date) }}</template>
        </el-table-column>
        <el-table-column prop="inspector_name" label="检验员" min-width="80" />
        <el-table-column label="首检结果" min-width="110">
          <template #default="{ row }">
            <el-tag :type="getResultType(row.first_article_result)">{{ getResultText(row.first_article_result) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="可继续生产" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.production_can_continue ? 'success' : 'info'" size="small">
              {{ row.production_can_continue ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="180">
          <template #default="{ row }">
            <el-button size="small" @click="handleView(row)">查看</el-button>
            <el-button v-if="row.first_article_result === 'pending'" size="small" type="primary" @click="handleInspect(row)">检验</el-button>
            <el-button v-if="row.first_article_result === 'failed'" size="small" type="warning" @click="handleReinspect(row)">重检</el-button>
            <el-button v-permission="'quality:inspections:view'" v-if="row.first_article_result === 'passed'" size="small" type="success" @click="handlePrint(row)">打印</el-button>
          </template>
        </el-table-column>

      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]" background layout="total, sizes, prev, pager, next, jumper" :total="total" @size-change="handleSizeChange" @current-change="handleCurrentChange" />
      </div>
    </el-card>

    <!-- 新建首检单弹窗 -->
    <CreateDialog v-model:visible="showCreateDialog" @success="handleCreateSuccess" />
    
    <!-- 检验弹窗 -->
    <InspectDialog v-model:visible="showInspectDialog" :inspection="currentInspection" @success="handleInspectSuccess" />
    
    <!-- 查看详情弹窗 -->
    <ViewDialog v-model:visible="showViewDialog" :inspection="currentInspection" />
    
    <!-- 首检规则配置弹窗 -->
    <RulesDialog v-model:visible="showRulesDialog" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, defineAsyncComponent, computed } from 'vue'
import { Search, Refresh, Plus, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { qualityApi } from '@/api/quality'
import dayjs from 'dayjs'
import { formatDate } from '@/utils/helpers/dateUtils'

import {
  FIRST_ARTICLE_RESULT,
  getFirstArticleResultText,
  getFirstArticleResultColor
} from '@/constants/systemConstants'

// 状态选项
const statusOptions = [
  { label: '待检验', value: 'pending' },
  { label: '合格', value: 'passed' },
  { label: '不合格', value: 'failed' },
  { label: '有条件放行', value: 'conditional' },
  { label: '复检', value: 'review' }
]

const getResultText = (status) => getFirstArticleResultText(status) || status
const getResultType = (status) => getFirstArticleResultColor(status)

// 异步加载子组件
const CreateDialog = defineAsyncComponent(() => import('./components/FirstArticleCreateDialog.vue'))
const InspectDialog = defineAsyncComponent(() => import('./components/FirstArticleInspectDialog.vue'))
const ViewDialog = defineAsyncComponent(() => import('./components/FirstArticleViewDialog.vue'))
const RulesDialog = defineAsyncComponent(() => import('./components/FirstArticleRulesDialog.vue'))

// 状态
const loading = ref(false)
const inspectionList = ref([])
const stats = reactive({ total: 0, pending: 0, passed: 0, failed: 0, conditional: 0 })
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

// 搜索条件
const searchKeyword = ref('')
const statusFilter = ref('')
const dateRange = ref(null)

// 弹窗控制
const showCreateDialog = ref(false)
const showInspectDialog = ref(false)
const showViewDialog = ref(false)
const showRulesDialog = ref(false)
const currentInspection = ref(null)

// 获取首检列表
const fetchList = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value || undefined,
      status: statusFilter.value || undefined,
      startDate: dateRange.value?.[0] ? dayjs(dateRange.value[0]).format('YYYY-MM-DD') : undefined,
      endDate: dateRange.value?.[1] ? dayjs(dateRange.value[1]).format('YYYY-MM-DD') : undefined
    }
    const res = await qualityApi.getFirstArticleInspections(params)
    const data = res.data || res
    inspectionList.value = data.list || []
    total.value = data.total || 0
  } catch (error) {
    console.error('获取首检列表失败:', error)
    ElMessage.error('获取首检列表失败')
  } finally {
    loading.value = false
  }
}

// 获取统计
const fetchStats = async () => {
  try {
    const res = await qualityApi.getFirstArticleStats()
    const data = res.data || res
    Object.assign(stats, data)
  } catch (error) {
    console.error('获取首检统计失败:', error)
  }
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  fetchList()
}

// 重置
const handleReset = () => {
  searchKeyword.value = ''
  statusFilter.value = ''
  dateRange.value = null
  handleSearch()
}

// 分页
const handleSizeChange = (val) => { pageSize.value = val; fetchList() }
const handleCurrentChange = (val) => { currentPage.value = val; fetchList() }

// 查看
const handleView = (row) => {
  currentInspection.value = row
  showViewDialog.value = true
}

// 检验
const handleInspect = (row) => {
  currentInspection.value = row
  showInspectDialog.value = true
}

// 重检（对不合格的首检单重新检验）
const handleReinspect = (row) => {
  // 重检使用相同的检验弹窗，但标记为重检
  currentInspection.value = { ...row, isReinspect: true }
  showInspectDialog.value = true
  ElMessage.info('请对不合格项目进行重新检验')
}

// 打印
const handlePrint = async (row) => {
  try {
    // 首先获取完整的检验详情（包含检验项目）
    const { api } = await import('@/services/api')
    
    let inspectionDetail = row
    try {
      const detailRes = await qualityApi.getFirstArticleInspection(row.id)
      inspectionDetail = detailRes.data || detailRes || row
    } catch (detailError) {
      console.warn('获取首检详情失败，使用列表数据:', detailError)
    }
    
    // 获取打印模板 - 使用首件检验专用模板类型
    let templateContent = ''
    try {
      const response = await api.get('/print/templates', {
        params: {
          template_type: 'first_article_inspection',
          is_default: 1,
          status: 1
        }
      })
      
      const templates = response.data?.list || response.data?.data || response.data || []
      const template = Array.isArray(templates) ? templates[0] : null
      
      if (template && template.content) {
        templateContent = template.content
      }
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError)
      ElMessage.error('获取打印模板失败，请在系统管理-打印管理中配置首件检验单模板')
      return
    }
    
    if (!templateContent) {
      ElMessage.warning('未找到首件检验单打印模板，请在系统管理-打印管理中配置 first_article_inspection 类型模板')
      return
    }
    
    // 使用获取到的完整详情进行打印
    const data = inspectionDetail
    
    // 准备打印数据 - 确保所有模板变量都有对应的值
    const getStatusText = (status) => {
      const statusMap = { 'pending': '待检验', 'passed': '合格', 'failed': '不合格', 'conditional': '有条件放行', 'review': '复检' }
      return statusMap[status] || status || '-'
    }
    
    const getResultText = (result) => {
      const resultMap = { 'passed': '合格', 'failed': '不合格', 'conditional': '有条件放行' }
      return resultMap[result] || result || '-'
    }
    
    const formatDateValue = (date) => {
      if (!date) return '-'
      return dayjs(date).format('YYYY-MM-DD')
    }
    
    const printData = {
      // 基本信息
      inspection_no: data.inspection_no || data.inspectionNo || '-',
      reference_no: data.task_code || data.task_no || data.reference_no || '-',
      task_no: data.task_code || data.task_no || '-',
      product_name: data.product_name || data.productName || '-',
      product_code: data.product_code || data.productCode || '-',
      batch_no: data.batch_no || data.batchNo || '-',
      quantity: data.quantity || 0,
      unit: data.unit || '',
      standard_no: data.standard_no || data.standardNo || '-',
      
      // 日期
      inspection_date: formatDateValue(data.inspection_date || data.inspectionDate),
      planned_date: formatDateValue(data.planned_date || data.plannedDate),
      
      // 人员
      inspector_name: data.inspector || data.inspector_name || '-',
      inspector: data.inspector || data.inspector_name || '-',
      
      // 状态和结果
      status: getStatusText(data.status || data.first_article_result),
      result: getResultText(data.first_article_result || data.result),
      first_article_result: getResultText(data.first_article_result),
      
      // 备注
      remark: data.remark || '',
      note: data.remark || data.note || '',
      
      // 打印时间
      print_date: new Date().toLocaleDateString(),
      print_time: new Date().toLocaleTimeString()
    }
    
    // 渲染模板 - 替换简单变量
    let renderedContent = templateContent
    Object.keys(printData).forEach(key => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
      renderedContent = renderedContent.replace(regex, printData[key])
    })
    
    // 处理条件表达式 {{status === 'passed' ? '合格' : ...}}
    renderedContent = renderedContent.replace(/\{\{status\s*===\s*'passed'\s*\?\s*'合格'\s*:\s*status\s*===\s*'failed'\s*\?\s*'不合格'\s*:\s*status\s*===\s*'review'\s*\?\s*'复检'\s*:\s*'待检验'\}\}/g, printData.status)
    renderedContent = renderedContent.replace(/\{\{result\s*===\s*'passed'\s*\?\s*'合格'\s*:\s*result\s*===\s*'failed'\s*\?\s*'不合格'\s*:\s*'-'\}\}/g, printData.result)
    
    // 处理 || 表达式
    renderedContent = renderedContent.replace(/\{\{inspection_date\s*\|\|\s*planned_date\}\}/g, printData.inspection_date !== '-' ? printData.inspection_date : printData.planned_date)
    
    // 处理检验项目列表 {{#each items}} ... {{/each}}
    const itemsMatch = renderedContent.match(/\{\{#each\s+items\}\}([\s\S]*?)\{\{\/each\}\}/);
    if (itemsMatch) {
      const itemTemplate = itemsMatch[1];
      let itemsHtml = '';
      
      // 获取检验项目数据（从详情接口返回）
      const items = data.items || data.inspectionItems || data.inspection_items || [];
      
      if (items && items.length > 0) {
        items.forEach((item, index) => {
          let itemHtml = itemTemplate;
          
          // 替换序号
          itemHtml = itemHtml.replace(/\{\{@index\+1\}\}/g, (index + 1).toString());
          itemHtml = itemHtml.replace(/\{\{index\}\}/g, (index + 1).toString());
          
          // 替换检验项目字段
          itemHtml = itemHtml.replace(/\{\{item_name\}\}/g, item.item_name || item.itemName || item.name || '-');
          itemHtml = itemHtml.replace(/\{\{standard\}\}/g, item.standard || item.standard_value || item.standardValue || '-');
          itemHtml = itemHtml.replace(/\{\{type\}\}/g, item.type || item.inspection_type || '-');
          itemHtml = itemHtml.replace(/\{\{actual_value\}\}/g, item.actual_value || item.actualValue || item.measured_value || '-');
          itemHtml = itemHtml.replace(/\{\{remarks\}\}/g, item.remarks || item.remark || '-');
          
          // 处理结果条件表达式
          const itemResult = item.result || item.status || '';
          const resultText = itemResult === 'passed' ? '合格' : (itemResult === 'failed' ? '不合格' : '-');
          itemHtml = itemHtml.replace(/\{\{result\s*===\s*'passed'\s*\?\s*'合格'\s*:\s*result\s*===\s*'failed'\s*\?\s*'不合格'\s*:\s*'-'\}\}/g, resultText);
          itemHtml = itemHtml.replace(/\{\{result\}\}/g, resultText);
          
          itemsHtml += itemHtml;
        });
      } else {
        itemsHtml = '<tr><td colspan="7" style="text-align: center; color: var(--color-text-secondary);">暂无检验项目数据</td></tr>';
      }
      
      renderedContent = renderedContent.replace(/\{\{#each\s+items\}\}[\s\S]*?\{\{\/each\}\}/g, itemsHtml);
    }
    
    // 创建打印窗口
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      ElMessage.error('无法打开打印窗口,请检查浏览器弹窗设置')
      return
    }

    printWindow.document.write(renderedContent)
    printWindow.document.close()

    // 等待内容加载后打印
    printWindow.onload = () => {
      printWindow.print()
      printWindow.close()
    }

    ElMessage.success('打印预览已打开')
  } catch (error) {
    console.error('打印失败:', error)
    ElMessage.error('打印失败')
  }
}

// 创建成功回调
const handleCreateSuccess = () => {
  showCreateDialog.value = false
  fetchList()
  fetchStats()
}

// 检验成功回调
const handleInspectSuccess = () => {
  showInspectDialog.value = false
  fetchList()
  fetchStats()
}

// 初始化加载
onMounted(() => {
  fetchList()
  fetchStats()
})
</script>

<style scoped>
.inspection-container {
  padding: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.search-container {
  margin-bottom: 16px;
}
.search-buttons {
  display: flex;
  gap: 8px;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: var(--color-text-primary);
}
.stat-value.pending { color: var(--color-text-secondary); }
.stat-value.passed { color: var(--color-success); }
.stat-value.failed { color: var(--color-danger); }
.stat-value.conditional { color: var(--color-warning); }
.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: 8px;
}
</style>

