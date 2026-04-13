<!--
/**
 * Print.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="print-templates-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>打印管理</h2>
          <p class="subtitle">管理打印模板与配置</p>
        </div>
      </div>
    </el-card>

    <!-- 标签切换区域 -->
    <el-card class="search-card">
      <div class="tab-switch-header">
        <el-radio-group v-model="activeTab" size="default">
          <el-radio-button value="templates">打印模板</el-radio-button>
          <el-radio-button value="company">公司信息</el-radio-button>
        </el-radio-group>
        <el-button v-permission="'system:print:create'" v-if="activeTab === 'templates'" type="primary" @click="openTemplateDialog()">新增模板</el-button>
        <el-button v-permission="'system:print:update'" v-if="activeTab === 'company'" type="primary" @click="saveCompanyInfo" :loading="savingCompanyInfo">保存公司信息</el-button>
      </div>
    </el-card>

    <!-- 打印模板管理 -->
    <template v-if="activeTab === 'templates'">
      <!-- 搜索区域 -->
      <el-card class="search-card">
      <el-form :inline="true" :model="templatesQuery" class="search-form">
        <el-form-item label="模板名称">
          <el-input  v-model="templatesQuery.name" placeholder="输入模板名称" clearable ></el-input>
        </el-form-item>
        <el-form-item label="所属模块">
          <el-select v-model="templatesQuery.module" placeholder="选择模块" clearable>
            <el-option
              v-for="item in moduleOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模板类型">
          <el-select v-model="templatesQuery.template_type" placeholder="选择类型" clearable>
            <el-option
              v-for="item in templateTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchPrintTemplates">查询</el-button>
          <el-button @click="resetTemplatesQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="printTemplates"
        style="width: 100%"
        border
        v-loading="loadingTemplates"
      >
        <el-table-column prop="id" label="ID" width="80"></el-table-column>
        <el-table-column prop="name" label="模板名称" width="240"></el-table-column>
        <el-table-column prop="module" label="所属模块" width="120"></el-table-column>
        <el-table-column prop="template_type" label="模板类型" width="240"></el-table-column>
        <el-table-column prop="paper_size" label="纸张大小" width="120"></el-table-column>
        <el-table-column label="是否默认" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.is_default ? 'success' : 'info'">
              {{ scope.row.is_default ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.status ? 'success' : 'info'">
              {{ scope.row.status ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180"></el-table-column>
        <el-table-column label="操作" min-width="375" fixed="right">
          <template #default="scope">
            <div class="operation-buttons">
              <el-button type="primary" size="small" @click="openTemplateDialog(scope.row)">编辑</el-button>
              <el-button type="success" size="small" @click="previewTemplate(scope.row)">预览</el-button>
              <el-button v-permission="'system:print:delete'" type="danger" size="small" @click="deletePrintTemplate(scope.row.id)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="templatesQuery.page"
          v-model:page-size="templatesQuery.limit"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(parseInt(templatesTotal) || 0, 1)"
          @size-change="handleTemplatesSizeChange"
          @current-change="handleTemplatesCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>
    </template>

    <!-- 公司信息配置 -->
    <template v-if="activeTab === 'company'">
      <el-card class="data-card">
        <el-form :model="companyInfo" label-width="120px" style="max-width: 800px;">
          <el-form-item label="公司名称">
            <el-input v-model="companyInfo.company_name" placeholder="请输入公司名称" />
          </el-form-item>

          <el-form-item label="公司电话">
            <el-input v-model="companyInfo.company_phone" placeholder="请输入公司电话" />
          </el-form-item>

          <el-form-item label="公司传真">
            <el-input v-model="companyInfo.company_fax" placeholder="请输入公司传真" />
          </el-form-item>

          <el-form-item label="公司地址">
            <el-input
              v-model="companyInfo.company_address"
              type="textarea"
              :rows="3"
              placeholder="请输入公司地址"
            />
          </el-form-item>
        </el-form>

        <el-alert
          title="提示"
          type="info"
          :closable="false"
          show-icon
          style="margin-top: 20px;"
        >
          这些信息将用于所有打印模板中，可以在模板中使用以下变量：
          <div style="margin-top: 8px; font-family: 'Courier New', monospace;">
            <code v-text="'{' + '{company_name}' + '}'"></code> - 公司名称<br>
            <code v-text="'{' + '{company_phone}' + '}'"></code> - 公司电话<br>
            <code v-text="'{' + '{company_fax}' + '}'"></code> - 公司传真<br>
            <code v-text="'{' + '{company_address}' + '}'"></code> - 公司地址
          </div>
        </el-alert>
      </el-card>
    </template>

    <!-- 打印模板对话框 -->
    <el-dialog
      v-model="templateDialogVisible"
      :title="currentTemplate.id ? '编辑打印模板' : '添加打印模板'"
      width="60%"
      destroy-on-close
    >
      <el-form 
        ref="templateFormRef"
        :model="currentTemplate"
        :rules="templateRules"
        label-width="120px"
      >
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="currentTemplate.name" placeholder="请输入模板名称" />
        </el-form-item>
        
        <el-form-item label="所属模块" prop="module">
          <el-select v-model="currentTemplate.module" placeholder="选择所属模块" style="width: 100%">
            <el-option
              v-for="item in moduleOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="模板类型" prop="template_type">
          <el-select v-model="currentTemplate.template_type" placeholder="选择模板类型" style="width: 100%">
            <el-option
              v-for="item in templateTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="纸张大小" prop="paper_size">
              <PaperSizeSelect v-model="currentTemplate.paper_size" placeholder="选择纸张大小" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="打印方向" prop="orientation">
              <el-radio-group v-model="currentTemplate.orientation">
                <el-radio-button value="portrait">纵向</el-radio-button>
                <el-radio-button value="landscape">横向</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="边距(mm)">
          <MarginInputs v-model="templateMargins" />
        </el-form-item>
        
        <el-form-item label="编辑模式">
          <el-radio-group v-model="editMode">
            <el-radio-button value="visual">可视化编辑</el-radio-button>
            <el-radio-button value="code">代码编辑</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="模板内容" prop="content">
          <!-- 可视化编辑模式 -->
          <div v-if="editMode === 'visual'" class="visual-editor-container">
            <div class="editor-toolbar">
              <el-button-group>
                <el-button size="small" @click="insertVariable('company_name')">公司名称</el-button>
                <el-button size="small" @click="insertVariable('order_no')">订单号</el-button>
                <el-button size="small" @click="insertVariable('customer_name')">客户名称</el-button>
                <el-button size="small" @click="insertVariable('date')">日期</el-button>
              </el-button-group>
              <el-divider direction="vertical" />
              <el-button-group>
                <el-button size="small" @click="insertTable">插入表格</el-button>
                <el-button size="small" @click="insertHeader">插入标题</el-button>
                <el-button size="small" @click="insertFooter">插入页脚</el-button>
              </el-button-group>
            </div>

            <div class="visual-editor-content">
              <div class="editor-panel">
                <h4>编辑区域</h4>
                <div
                  ref="visualEditor"
                  class="visual-editor"
                  contenteditable="true"
                  @input="onVisualEditorInput"
                  v-html="visualContent"
                ></div>
              </div>

              <div class="preview-panel">
                <h4>实时预览</h4>
                <div class="live-preview" v-html="previewHtml"></div>
              </div>
            </div>
          </div>

          <!-- 代码编辑模式 -->
          <div v-else class="code-editor-container">
            <div v-if="currentTemplate.template_type === 'sales_outbound'">
              <p class="template-tip">销售出库单模板 - 可用变量: \{\{outbound_no\}\}, \{\{order_no\}\}, \{\{customer_name\}\}, \{\{delivery_date\}\}, \{\{#each items\}\}...\{\{/each\}\} 等</p>
              <el-input
                v-model="currentTemplate.content"
                type="textarea"
                :rows="20"
                placeholder="输入HTML模板内容"
                style="width: 100%; min-width: 600px; font-family: 'Courier New', monospace; font-size: 13px;"
                class="template-content-input"
                @input="onCodeEditorInput"
              />
              <div class="template-buttons">
                <el-button class="mt-2" type="primary" @click="loadDefaultSalesOutboundTemplate">加载默认模板</el-button>
                <el-button class="mt-2" type="success" @click="previewCurrentTemplate">预览当前模板</el-button>
              </div>
            </div>
            <div v-else>
              <el-input
                v-model="currentTemplate.content"
                type="textarea"
                :rows="20"
                placeholder="输入HTML模板内容"
                style="width: 100%; min-width: 600px; font-family: 'Courier New', monospace; font-size: 13px;"
                class="template-content-input"
                @input="onCodeEditorInput"
              />
            </div>
          </div>
        </el-form-item>
        
        <el-form-item label="是否默认">
          <el-switch
            v-model="currentTemplate.is_default"
            :active-value="1"
            :inactive-value="0"
            active-text="是"
            inactive-text="否"
          />
        </el-form-item>
        
        <el-form-item label="状态">
          <el-switch
            v-model="currentTemplate.status"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="templateDialogVisible = false">取消</el-button>
          <el-button v-permission="'system:print:update'" type="primary" @click="savePrintTemplate">保存</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 模板预览对话框 -->
    <el-dialog
      v-model="previewDialogVisible"
      title="模板预览"
      width="80%"
      destroy-on-close
      @opened="onPreviewDialogOpened"
    >
      <div class="preview-container">
        <iframe
          ref="previewIframe"
          style="width: 100%; height: 500px; border: none; background: white;"
        ></iframe>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="previewDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { api } from '../../services/api'

// 导入常量和工具函数
import {
  MODULE_OPTIONS,
  TEMPLATE_TYPE_OPTIONS,
  DEFAULT_TEMPLATE,
  VALIDATION_RULES,
  PAGINATION_CONFIG
} from '../../constants/printConstants'

import {
  previewTemplate as processTemplatePreview
} from '../../utils/helpers/templateUtils'

// 导入公共组件
import MarginInputs from '../../components/ui/print/MarginInputs.vue'
import PaperSizeSelect from '../../components/ui/print/PaperSizeSelect.vue'
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

const templateMargins = computed({
  get() {
    return {
      top: currentTemplate.margin_top,
      right: currentTemplate.margin_right,
      bottom: currentTemplate.margin_bottom,
      left: currentTemplate.margin_left
    }
  },
  set(value) {
    currentTemplate.margin_top = value.top
    currentTemplate.margin_right = value.right
    currentTemplate.margin_bottom = value.bottom
    currentTemplate.margin_left = value.left
  }
})

// 标签页
const activeTab = ref('templates')

// 公司信息
const companyInfo = reactive({
  company_name: '',
  company_phone: '',
  company_fax: '',
  company_address: ''
})
const savingCompanyInfo = ref(false)

// 打印模板相关
const printTemplates = ref([])
const loadingTemplates = ref(false)
const templatesTotal = ref(0)
const templateDialogVisible = ref(false)
const currentTemplate = reactive({
  name: '',
  module: '',
  template_type: '',
  content: '',
  paper_size: 'A4',
  orientation: 'portrait',
  margin_top: 10,
  margin_right: 10,
  margin_bottom: 10,
  margin_left: 10,
  is_default: 0,
  status: 1
})
const templateFormRef = ref(null)
const templateRules = VALIDATION_RULES.template
const templatesQuery = reactive({
  page: PAGINATION_CONFIG.defaultPage,
  limit: PAGINATION_CONFIG.defaultPageSize,
  name: '',
  module: '',
  template_type: '',
  status: ''
})

// 模板预览
const previewDialogVisible = ref(false)
const previewContent = ref('')
const previewIframe = ref(null)

// 可视化编辑器
const editMode = ref('visual')
const visualContent = ref('')
const previewHtml = ref('')
const visualEditor = ref(null)

// 使用导入的常量
const moduleOptions = MODULE_OPTIONS
const templateTypeOptions = TEMPLATE_TYPE_OPTIONS

// 生命周期钩子
onMounted(() => {
  fetchPrintTemplates()
  fetchCompanyInfo()
  // 注意：不再自动创建默认模板，避免重复创建
  // 如需添加默认模板，请手动点击"新增模板"按钮
})

// 获取公司信息
const fetchCompanyInfo = async () => {
  try {
    const response = await api.get('/system/settings')
    if (response.data) {
      const settings = Array.isArray(response.data) ? response.data : []
      
      const companyNameSetting = settings.find(s => s.key === 'company_name' || s.setting_key === 'company_name')
      const companyPhoneSetting = settings.find(s => s.key === 'company_phone' || s.setting_key === 'company_phone')
      const companyFaxSetting = settings.find(s => s.key === 'company_fax' || s.setting_key === 'company_fax')
      const companyAddressSetting = settings.find(s => s.key === 'company_address' || s.setting_key === 'company_address')
      
      companyInfo.company_name = companyNameSetting?.value || companyNameSetting?.setting_value || ''
      companyInfo.company_phone = companyPhoneSetting?.value || companyPhoneSetting?.setting_value || ''
      companyInfo.company_fax = companyFaxSetting?.value || companyFaxSetting?.setting_value || ''
      companyInfo.company_address = companyAddressSetting?.value || companyAddressSetting?.setting_value || ''
    }
  } catch (error) {
    console.error('获取公司信息失败:', error)
    ElMessage.error('获取公司信息失败')
  }
}

// 保存公司信息
const saveCompanyInfo = async () => {
  try {
    savingCompanyInfo.value = true
    
    // 保存每个设置项
    const settingsToSave = [
      { key: 'company_name', value: companyInfo.company_name },
      { key: 'company_phone', value: companyInfo.company_phone },
      { key: 'company_fax', value: companyInfo.company_fax },
      { key: 'company_address', value: companyInfo.company_address }
    ]
    
    for (const setting of settingsToSave) {
      await api.put('/system/settings', setting)
    }
    
    ElMessage.success('公司信息保存成功')
  } catch (error) {
    console.error('保存公司信息失败:', error)
    ElMessage.error('保存公司信息失败')
  } finally {
    savingCompanyInfo.value = false
  }
}

// 打印模板方法
const fetchPrintTemplates = async () => {
  loadingTemplates.value = true
  try {
    const response = await api.get('/print/templates', { params: templatesQuery })

    // 适配多种返回格式
    let templateData = []
    let total = 0

    if (response.data) {
      // 如果 response.data 是对象且有 list 属性
      if (response.data.list && Array.isArray(response.data.list)) {
        templateData = response.data.list
        total = response.data.total || templateData.length
      }
      // 如果 response.data 是对象且有 data 属性 (嵌套结构)
      else if (response.data.data && Array.isArray(response.data.data)) {
        templateData = response.data.data
        total = response.data.total || templateData.length
      }
      // 如果 response.data 直接是数组
      else if (Array.isArray(response.data)) {
        templateData = response.data
        total = templateData.length
      }
    }
    // 如果 response 直接是数组
    else if (Array.isArray(response)) {
      templateData = response
      total = templateData.length
    }

    printTemplates.value = templateData.map(template => ({
      ...template,
      status: Number(template.status),
      is_default: Number(template.is_default)
    }))

    templatesTotal.value = total
  } catch (error) {
    console.error('获取打印模板失败:', error)
    ElMessage.error('获取打印模板失败')
  } finally {
    loadingTemplates.value = false
  }
}

const handleTemplatesSizeChange = (val) => {
  templatesQuery.limit = val
  fetchPrintTemplates()
}

const handleTemplatesCurrentChange = (val) => {
  templatesQuery.page = val
  fetchPrintTemplates()
}

const resetTemplatesQuery = () => {
  templatesQuery.name = ''
  templatesQuery.module = ''
  templatesQuery.template_type = ''
  templatesQuery.status = ''
  fetchPrintTemplates()
}

const openTemplateDialog = (row) => {
  if (row) {
    // 编辑模式，复制数据
    Object.assign(currentTemplate, row)

    // 确保orientation值正确
    if (!currentTemplate.orientation || !['portrait', 'landscape'].includes(currentTemplate.orientation)) {
      currentTemplate.orientation = 'portrait'
    }
  } else {
    // 新增模式，重置数据
    Object.assign(currentTemplate, DEFAULT_TEMPLATE)
  }

  // 重置编辑模式
  editMode.value = 'visual'
  visualContent.value = currentTemplate.content || ''
  updatePreview()

  templateDialogVisible.value = true
}

const savePrintTemplate = async () => {
  if (!templateFormRef.value) return
  
  await templateFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        if (currentTemplate.id) {
          // 更新
          await api.put(`/print/templates/${currentTemplate.id}`, currentTemplate)
          ElMessage.success('更新打印模板成功')
        } else {
          // 新增
          await api.post('/print/templates', currentTemplate)
          ElMessage.success('添加打印模板成功')
        }
        templateDialogVisible.value = false
        
        // 延迟一下再刷新列表，确保后端数据已更新
        setTimeout(() => {
          fetchPrintTemplates()
        }, 500)
      } catch (error) {
        console.error('保存打印模板失败:', error)
        ElMessage.error('保存打印模板失败')
      }
    }
  })
}

const deletePrintTemplate = (id) => {
  ElMessageBox.confirm('确认删除此打印模板?', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.delete(`/print/templates/${id}`)
      ElMessage.success('删除成功')
      fetchPrintTemplates()
    } catch (error) {
      console.error('删除打印模板失败:', error)
      ElMessage.error('删除打印模板失败')
    }
  }).catch(() => {})
}

const previewTemplate = (template) => {
  let content = processTemplatePreview(template);

  // 如果内容不包含完整的 HTML 结构，则包装它
  if (!content.includes('<html>') && !content.includes('<!DOCTYPE')) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            margin: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
  }

  previewContent.value = content;
  previewDialogVisible.value = true;
}

// 当预览对话框完全打开后，渲染 iframe 内容
const onPreviewDialogOpened = () => {
  if (previewIframe.value && previewContent.value) {
    try {
      const iframeDoc = previewIframe.value.contentDocument || previewIframe.value.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(previewContent.value);
      iframeDoc.close();
    } catch (error) {
      console.error('写入 iframe 失败:', error)
    }
  }
}

const previewCurrentTemplate = () => {
  // 使用当前正在编辑的模板进行预览
  previewTemplate(currentTemplate)
}

// 可视化编辑器方法
const onVisualEditorInput = () => {
  if (visualEditor.value) {
    const content = visualEditor.value.innerHTML
    currentTemplate.content = content
    updatePreview()
  }
}

const onCodeEditorInput = () => {
  updatePreview()
}

const updatePreview = () => {
  // 生成预览HTML，替换变量为示例数据
  let html = currentTemplate.content || ''

  // 根据模板类型选择示例数据
  let sampleData = {}

  if (currentTemplate.template_type === 'production_outbound') {
    // 生产出库单示例数据
    sampleData = {
      outbound_no: 'OUT20250830006',
      outbound_date: '2025-08-30',
      outbound_type_text: '生产出库',
      operator: '王晓敏',
      production_plan_code: 'PP20250830001',
      status: '已完成',
      remark: '智能替代配料出库',
      print_time: new Date().toLocaleString()
    }

    // 处理物料列表的循环
    const itemsHtml = `
      <tr>
        <td>1</td>
        <td>999905005</td>
        <td>脚踏盒子</td>
        <td>无规格</td>
        <td>只</td>
        <td>1</td>
        <td>半成品仓库</td>
      </tr>
      <tr class="substitute-row">
        <td>└</td>
        <td>999905006</td>
        <td>螺丝钉<span class="substitute-mark">替代</span></td>
        <td>标准规格</td>
        <td>件</td>
        <td>1</td>
        <td>零配件仓库</td>
      </tr>
      <tr class="substitute-row">
        <td>└</td>
        <td>999905004</td>
        <td>微动开盒子<span class="substitute-mark">替代</span></td>
        <td>T-001</td>
        <td>件</td>
        <td>1</td>
        <td>零配件仓库</td>
      </tr>
      <tr>
        <td>2</td>
        <td>999905003</td>
        <td>弹簧</td>
        <td>T-001</td>
        <td>只</td>
        <td>1</td>
        <td>零配件仓库</td>
      </tr>
    `

    // 替换物料列表循环 - 支持多种格式
    html = html.replace(/\{\{#items\}\}[\s\S]*?\{\{\/items\}\}/g, itemsHtml)
    html = html.replace(/\{\{#each\s+items\}\}[\s\S]*?\{\{\/each\}\}/g, itemsHtml)
    html = html.replace(/\{\{#each items\}\}[\s\S]*?\{\{\/each\}\}/g, itemsHtml)
    html = html.replace(/\{\{#each\}\}[\s\S]*?\{\{\/each\}\}/g, itemsHtml)
  } else {
    // 其他模板类型的示例数据
    sampleData = {
      company_name: '示例公司名称',
      order_no: 'SO202501001',
      customer_name: '示例客户',
      date: new Date().toLocaleDateString(),
      outbound_no: 'OUT202501001',
      delivery_date: new Date().toLocaleDateString(),
      total_amount: '1000.00'
    }
  }

  // 替换变量为示例数据
  Object.keys(sampleData).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    html = html.replace(regex, sampleData[key])
  })

  previewHtml.value = html
}

const insertVariable = (variable) => {
  const variableText = `{{${variable}}}`
  if (editMode.value === 'visual' && visualEditor.value) {
    // 在可视化编辑器中插入变量
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const span = document.createElement('span')
      span.className = 'template-variable'
      span.textContent = variableText
      span.style.backgroundColor = '#e6f7ff'
      span.style.padding = '2px 4px'
      span.style.borderRadius = '3px'
      span.style.border = '1px solid #91d5ff'
      range.insertNode(span)
      range.collapse(false)
      onVisualEditorInput()
    }
  } else {
    // 在代码编辑器中插入变量
    currentTemplate.content += variableText
    updatePreview()
  }
}

const insertTable = () => {
  const tableHtml = `
<table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
  <thead>
    <tr style="background-color: #f5f5f5;">
      <th style="border: 1px solid #ddd; padding: 8px;">项目</th>
      <th style="border: 1px solid #ddd; padding: 8px;">数量</th>
      <th style="border: 1px solid #ddd; padding: 8px;">单价</th>
      <th style="border: 1px solid #ddd; padding: 8px;">金额</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">{{item_name}}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">{{quantity}}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">{{price}}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">{{amount}}</td>
    </tr>
  </tbody>
</table>`

  insertContent(tableHtml)
}

const insertHeader = () => {
  const headerHtml = `
<div style="text-align: center; margin-bottom: 20px;">
  <h1 style="margin: 0; font-size: 24px; color: #333;">{{company_name}}</h1>
  <h2 style="margin: 10px 0; font-size: 18px; color: #666;">销售出库单</h2>
</div>`

  insertContent(headerHtml)
}

const insertFooter = () => {
  const footerHtml = `
<div style="margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px;">
  <div style="display: flex; justify-content: space-between;">
    <div>制单人：_____________</div>
    <div>审核人：_____________</div>
    <div>日期：{{date}}</div>
  </div>
</div>`

  insertContent(footerHtml)
}

const insertContent = (html) => {
  if (editMode.value === 'visual' && visualEditor.value) {
    visualEditor.value.innerHTML += html
    onVisualEditorInput()
  } else {
    currentTemplate.content += html
    updatePreview()
  }
}

// 监听编辑模式切换
watch(editMode, (newMode) => {
  if (newMode === 'visual') {
    visualContent.value = currentTemplate.content || ''
    updatePreview()
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

/* 标签切换头部样式 */
.tab-switch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-container {
  background: #f5f5f5;
  padding: 10px;
  border-radius: var(--radius-sm);
}

/* 确保表格样式正常 */
:deep(.el-table) {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-weight: normal;
  font-size: 14px;
}

:deep(.el-table th) {
  font-weight: 500;
  font-size: 14px;
}

:deep(.el-table td) {
  font-weight: normal;
  font-size: 14px;
}

/* 确保按钮样式正常 */
:deep(.el-button) {
  font-weight: normal;
  font-size: 14px;
}

/* 确保表单样式正常 */
:deep(.el-form-item__label) {
  font-weight: normal;
  font-size: 14px;
}

:deep(.el-input__inner) {
  font-weight: normal;
  font-size: 14px;
}

:deep(.el-select .el-input__inner) {
  font-weight: normal;
  font-size: 14px;
}

/* 可视化编辑器样式 */
.visual-editor-container {
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.editor-toolbar {
  background: var(--color-bg-hover);
  padding: 10px;
  border-bottom: 1px solid var(--color-border-base);
  display: flex;
  align-items: center;
  gap: 10px;
}

.visual-editor-content {
  display: flex;
  height: 500px;
}

.editor-panel {
  flex: 1;
  border-right: 1px solid var(--color-border-base);
  display: flex;
  flex-direction: column;
}

.editor-panel h4 {
  margin: 0;
  padding: 10px;
  background: var(--color-bg-light);
  border-bottom: 1px solid var(--color-border-base);
  font-size: 14px;
  font-weight: 500;
}

.visual-editor {
  flex: 1;
  padding: 15px;
  border: none;
  outline: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  overflow-y: auto;
  background: white;
}

.visual-editor:focus {
  background: var(--color-bg-light);
}

.preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preview-panel h4 {
  margin: 0;
  padding: 10px;
  background: var(--color-bg-light);
  border-bottom: 1px solid var(--color-border-base);
  font-size: 14px;
  font-weight: 500;
}

.live-preview {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  background: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

.template-variable {
  background-color: #e6f7ff !important;
  padding: 2px 4px !important;
  border-radius: 3px !important;
  border: 1px solid #91d5ff !important;
  font-family: 'Courier New', monospace !important;
  font-size: 12px !important;
}

.code-editor-container {
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  padding: 15px;
}

.template-tip {
  background: #f0f9ff;
  border: 1px solid #bae7ff;
  border-radius: var(--radius-sm);
  padding: 10px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #1890ff;
}

.template-buttons {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}

/* 预览对话框中的表格样式 */
.live-preview table {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
}

.live-preview th,
.live-preview td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.live-preview th {
  background-color: #f5f5f5;
  font-weight: 500;
}
</style>