<!--
/**
 * InspectionTemplates.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="template-container">
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; background-color: #fff; padding: 12px 20px; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,21,41,0.08);">
      <div style="font-size: 16px; font-weight: bold; color: #303133;">检验控制库</div>
      <el-radio-group v-model="viewType" size="default">
        <el-radio-button value="templates">检验模板</el-radio-button>
        <el-radio-button value="aql">AQL 抽样规则</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 检验模板页面 -->
    <div v-show="viewType === 'templates'">
      <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>检验模板管理</span>
          <div class="header-buttons">
            <el-button 
              type="primary" 
              @click="handleCreate"
            >
              新建模板
            </el-button>
          </div>
        </div>
      </template>
      
      <!-- 搜索表单 -->
      <div class="search-container">
        <el-row :gutter="16">
          <el-col :span="4">
            <el-input 
              v-model="searchKeyword"
              placeholder="请输入模板名称/编号"
              @keyup.enter="handleSearch"
              clearable >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-col>
          
          <el-col :span="3">
            <el-select v-model="typeFilter" placeholder="检验类型" clearable @change="handleSearch" style="width: 100%">
              <el-option label="来料检验" value="incoming" />
              <el-option label="过程检验" value="process" />
              <el-option label="成品检验" value="final" />
            </el-select>
          </el-col>
          
          <el-col :span="2">
            <el-select v-model="statusFilter" placeholder="状态" clearable @change="handleSearch" style="width: 100%">
              <el-option label="启用" value="active" />
              <el-option label="停用" value="inactive" />
              <el-option label="草稿" value="draft" />
            </el-select>
          </el-col>
          
          <el-col :span="4">
            <div class="search-buttons">
              <el-button 
                type="primary" 
                @click="handleSearch"
              >
                查询
              </el-button>
              <el-button 
                @click="handleRefresh"
              >
                重置
              </el-button>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 模板列表 -->
      <el-table
        :data="templateList"
        border
        style="width: 100%; margin-top: 16px;"
        v-loading="loading"
      >
        <el-table-column prop="template_code" label="模板编号" min-width="100" />
        <el-table-column prop="template_name" label="模板名称" min-width="150" />
        <el-table-column prop="inspection_type" label="检验类型" min-width="100">
          <template #default="scope">
            {{ getInspectionTypeText(scope.row.inspection_type) }}
          </template>
        </el-table-column>
        <el-table-column prop="material_type" label="适用物料" min-width="120">
          <template #default="scope">
            <el-tag v-if="isGeneralTemplate(scope.row)" type="success">
              {{ getInspectionTypePrefix(scope.row.inspection_type) }}通用模板
            </el-tag>
            <span v-else>{{ getTableMaterialCodes(scope.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="items_count" label="检验项数量" min-width="100">
          <template #default="scope">
            {{ getItemsCount(scope.row) }}
          </template>
        </el-table-column>
        <el-table-column prop="version" label="版本" min-width="80" />
        <el-table-column prop="status" label="状态" min-width="80">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建人" min-width="100">
          <template #default="scope">
            {{ getUserRealName(scope.row.created_by) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="120">
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="220">
          <template #default="scope">
            <el-button 
              size="small" 
              @click="handleView(scope.row)"
            >
              查看
            </el-button>
            <el-button 
              v-if="scope.row.status !== 'active'" 
              size="small" 
              type="primary" 
              @click="handleEdit(scope.row)"
            >
              编辑
            </el-button>
            <el-button 
              v-if="scope.row.status === 'inactive' || scope.row.status === 'draft'" 
              size="small" 
              type="primary" 
              @click="handleActivate(scope.row)"
            >
              启用
            </el-button>
            <el-button
              v-if="scope.row.status === 'active'"
              size="small"
              type="danger"
              @click="handleDropdownCommand('deactivate', scope.row)"
            >
              停用
            </el-button>
            <el-button
              size="small"
              type="primary"
              @click="handleDropdownCommand('copy', scope.row)"
            >
              复制
            </el-button>
            <el-button
              v-if="scope.row.status === 'inactive' || scope.row.status === 'draft'"
              size="small"
              type="danger"
              @click="handleDropdownCommand('delete', scope.row)"
            >
              删除
            </el-button>
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

    <!-- 创建/编辑模板对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑检验模板' : '新建检验模板'"
      width="900px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="模板名称" prop="template_name">
          <el-input v-model="form.template_name" placeholder="请输入模板名称" />
        </el-form-item>
        
        <el-form-item label="检验类型" prop="inspection_type">
          <el-select v-model="form.inspection_type" placeholder="请选择检验类型" style="width: 100%">
            <el-option label="来料检验" value="incoming" />
            <el-option label="过程检验" value="process" />
            <el-option label="成品检验" value="final" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="通用模板">
          <el-checkbox v-model="form.is_general" @change="handleGeneralChange">设为通用模板</el-checkbox>
          <span class="form-tip">勾选后，该模板适用于所有物料，无需选择具体物料</span>
        </el-form-item>
        
        <el-form-item label="适用物料" prop="material_types" v-if="!form.is_general">
          <div class="material-select-container">
            <el-select
              v-model="form.material_types"
              placeholder="输入物料编码或名称自动搜索..."
              filterable
              remote
              multiple
              collapse-tags
              :max-collapse-tags="0"
              :reserve-keyword="true"
              :remote-method="debouncedSearchMaterials"
              :loading="loadingMaterials"
              @change="handleMaterialChange"
              @focus="handleMaterialSelectFocus"
              style="width: 100%"
              popper-class="material-select-popper"
            >
              <el-option
                v-for="item in materialsList"
                :key="item.value"
                :label="item.code"
                :value="item.value"
              >
                <span>{{ item.code }}</span>
                <span style="margin-left: 8px; color: #8492a6; font-size: 12px;">{{ item.name }}</span>
              </el-option>
            </el-select>
            <!-- 已选物料标签列表 -->
            <div class="selected-materials-list" v-if="form.material_types && form.material_types.length > 0">
              <span class="selected-label">已选物料({{ form.material_types.length }})：</span>
              <el-tag
                v-for="materialId in form.material_types"
                :key="materialId"
                closable
                type="primary"
                size="default"
                @close="removeMaterial(materialId)"
                class="material-tag"
              >
                {{ getMaterialDisplayText(materialId) }}
              </el-tag>
            </div>
          </div>
        </el-form-item>
        
        <el-form-item label="版本" prop="version">
          <el-input v-model="form.version" placeholder="请输入版本号" />
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入模板描述"
          />
        </el-form-item>

        <!-- AQL 抽样设置 -->
        <el-form-item label="AQL抽样">
          <el-switch v-model="form.is_aql" active-text="启用" inactive-text="关闭" />
          <span class="form-tip">启用后，使用该模板时将自动应用 AQL 抽样标准</span>
        </el-form-item>
        <el-form-item label="AQL等级" v-if="form.is_aql">
          <el-select v-model="form.aql_level" placeholder="选择 AQL 级别">
            <el-option
              v-for="level in aqlLevelOptions"
              :key="level"
              :label="'AQL ' + level"
              :value="String(level)"
            />
          </el-select>
          <span class="form-tip">按 GB/T 2828.1-2012 标准自动确定抽样数和接收准则</span>
        </el-form-item>
        
        <el-form-item label="检验项目" prop="items">
          <div class="items-container">
            <div class="items-header">
              <h3>检验项目列表</h3>
              <el-button 
                type="primary" 
                @click="addItem"
              >
                添加检验项
              </el-button>
            </div>
            
            <div class="table-wrapper">
              <div class="table-container">
                <el-table 
                  :data="form.items" 
                  border 
                  style="width: 100%" 
                  table-layout="fixed"
                  size="small"
                >
                  <el-table-column type="index" width="50" label="序号" fixed />
                  <el-table-column prop="item_name" label="检验项目" width="150" fixed>
                    <template #default="scope">
                      <el-input 
                        v-model="scope.row.item_name" 
                        placeholder="请输入检验项目名称" 
                        size="small" 
                        @input="() => { if (scope.row.reuse_item_id) { scope.row.reuse_item_id = null } }"
                      />
                    </template>
                  </el-table-column>
                  <el-table-column prop="standard" label="检验标准" width="200">
                    <template #default="scope">
                      <div class="standard-input-group">
                        <el-input 
                          v-model="scope.row.standard" 
                          placeholder="请输入检验标准"
                          size="small"
                          class="standard-input"
                        />
                        <el-button 
                          type="primary" 
                          size="small" 
                          @click="openStandardSelector(scope.$index)"
                          class="standard-button"
                        >
                          选择
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column prop="type" label="检验类型" width="100">
                    <template #default="scope">
                      <el-select 
                        v-model="scope.row.type" 
                        placeholder="选择类型" 
                        style="width: 100%"
                        size="small"
                      >
                        <el-option label="外观" value="visual" />
                        <el-option label="尺寸" value="dimension" />
                        <el-option label="功能" value="function" />
                        <el-option label="性能" value="performance" />
                        <el-option label="安全" value="safety" />
                        <el-option label="其他" value="other" />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column prop="is_critical" label="关键项" width="80">
                    <template #default="scope">
                      <el-checkbox v-model="scope.row.is_critical" />
                    </template>
                  </el-table-column>
                  <el-table-column prop="dimension_value" label="标准尺寸" width="100">
                    <template #default="scope">
                      <el-input 
                        v-if="scope.row.type === 'dimension'"
                        v-model.number="scope.row.dimension_value" 
                        placeholder="尺寸值"
                        size="small"
                        type="number"
                        :step="0.001"
                      />
                      <span v-else style="color: #909399;">仅尺寸类型</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="tolerance_upper" label="上公差(+)" width="100">
                    <template #default="scope">
                      <el-input 
                        v-if="scope.row.type === 'dimension'"
                        v-model.number="scope.row.tolerance_upper" 
                        placeholder="+0.000"
                        size="small"
                        type="number"
                        :step="0.001"
                      />
                      <span v-else style="color: #909399;">仅尺寸类型</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="tolerance_lower" label="下公差(-)" width="100">
                    <template #default="scope">
                      <el-input 
                        v-if="scope.row.type === 'dimension'"
                        v-model.number="scope.row.tolerance_lower" 
                        placeholder="-0.000"
                        size="small"
                        type="number"
                        :step="0.001"
                      />
                      <span v-else style="color: #909399;">仅尺寸类型</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="80" fixed="right">
                    <template #default="scope">
                      <el-button 
                        size="small" 
                        type="danger" 
                        @click="removeItem(scope.$index)"
                      >
                        删除
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看模板详情对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="检验模板详情"
      width="800px"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="模板编号">{{ currentTemplate?.template_code }}</el-descriptions-item>
        <el-descriptions-item label="模板名称">{{ currentTemplate?.template_name }}</el-descriptions-item>
        <el-descriptions-item label="检验类型">{{ getInspectionTypeText(currentTemplate?.inspection_type) }}</el-descriptions-item>
        <el-descriptions-item label="适用物料">
          <el-tag v-if="isGeneralTemplate(currentTemplate)" type="success">
            {{ getInspectionTypePrefix(currentTemplate?.inspection_type) }}通用模板
          </el-tag>
          <span v-else>{{ getMultipleMaterialCodes(currentTemplate?.material_types || [currentTemplate?.material_type]) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="版本">{{ currentTemplate?.version }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentTemplate?.status)">
            {{ getStatusText(currentTemplate?.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="AQL抽样">
          <el-tag v-if="currentTemplate?.is_aql" type="success">已启用 (AQL {{ currentTemplate?.aql_level }})</el-tag>
          <el-tag v-else type="info">未启用</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ getUserRealName(currentTemplate?.created_by) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(currentTemplate?.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">{{ currentTemplate?.description || '-' }}</el-descriptions-item>
      </el-descriptions>
      
      <div class="template-items" v-if="currentTemplate?.items?.length">
        <h3>检验项目列表</h3>
        <div class="table-container">
          <el-table :data="currentTemplate.items" border>
            <el-table-column type="index" width="50" label="序号" />
            <el-table-column prop="item_name" label="检验项目" min-width="120" />
            <el-table-column prop="standard" label="检验标准" min-width="150" />
            <el-table-column prop="type" label="检验类型" width="100">
              <template #default="scope">
                {{ getItemTypeText(scope.row.type) }}
              </template>
            </el-table-column>
            <el-table-column prop="is_critical" label="关键项" width="80">
              <template #default="scope">
                <el-tag size="small" :type="scope.row.is_critical ? 'danger' : 'info'">
                  {{ scope.row.is_critical ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="dimension_value" label="标准尺寸" width="100">
              <template #default="scope">
                {{ scope.row.dimension_value || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="tolerance" label="公差范围" width="120">
              <template #default="scope">
                <span v-if="scope.row.tolerance_upper || scope.row.tolerance_lower">
                  +{{ scope.row.tolerance_upper || 0 }} / -{{ Math.abs(scope.row.tolerance_lower) || 0 }}
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-dialog>

    <!-- 检验标准选择对话框 -->
    <el-dialog
      v-model="standardSelectorVisible"
      title="选择检验标准"
      width="900px"
      destroy-on-close
    >
      <div class="standard-search-form">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-input  
              v-model="standardSearch.keyword" 
              placeholder="输入项目名称或标准" 
              clearable 
              @keyup.enter="searchStandards" >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-col>
          <el-col :span="6">
            <el-select  v-model="standardSearch.type" placeholder="检验类型" clearable>
              <el-option label="外观" value="visual" />
              <el-option label="尺寸" value="dimension" />
              <el-option label="功能" value="function" />
              <el-option label="性能" value="performance" />
              <el-option label="安全" value="safety" />
              <el-option label="其他" value="other" />
            </el-select>
          </el-col>
          <el-col :span="10">
            <el-button type="primary" @click="searchStandards">
              <el-icon><Search /></el-icon>查询
            </el-button>
            <el-button @click="resetStandardSearch">
              <el-icon><Refresh /></el-icon>重置
            </el-button>
            <el-button type="success" @click="openAddStandardDialog">
              <el-icon><Plus /></el-icon>添加标准
            </el-button>
          </el-col>
        </el-row>
      </div>

      <div class="table-container">
          <el-table
            :data="reusableStandards"
            border
            style="width: 100%; margin-top: 16px"
            height="400px"
            v-loading="loadingStandards"
            @row-dblclick="selectStandard"
          >
            <el-table-column type="index" width="50" label="序号" />
            <el-table-column prop="item_name" label="检验项目" min-width="120" />
            <el-table-column prop="standard" label="检验标准" min-width="180" />
            <el-table-column prop="type" label="检验类型" width="100">
              <template #default="scope">
                {{ getItemTypeText(scope.row.type) }}
              </template>
            </el-table-column>
            <el-table-column prop="is_critical" label="关键项" width="80">
              <template #default="scope">
                <el-tag size="small" :type="scope.row.is_critical ? 'danger' : 'info'">
                  {{ scope.row.is_critical ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="dimension_value" label="标准尺寸" width="90">
              <template #default="scope">
                {{ scope.row.dimension_value || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="tolerance" label="公差" width="100">
              <template #default="scope">
                <span v-if="scope.row.tolerance_upper || scope.row.tolerance_lower">
                  +{{ scope.row.tolerance_upper || 0 }}/-{{ Math.abs(scope.row.tolerance_lower) || 0 }}
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="scope">
                <el-button link type="primary" @click="selectStandard(scope.row)">选择</el-button>
              </template>
            </el-table-column>
          </el-table>
      </div>
    </el-dialog>

    <!-- 添加检验标准对话框 -->
    <el-dialog
      v-model="addStandardDialogVisible"
      title="添加检验标准"
      width="500px"
      destroy-on-close
    >
      <el-form :model="newStandardForm" label-width="100px">
        <el-form-item label="检验项目" required>
          <el-input v-model="newStandardForm.item_name" placeholder="请输入检验项目名称" />
        </el-form-item>
        <el-form-item label="检验标准" required>
          <el-input v-model="newStandardForm.standard" placeholder="请输入检验标准" />
        </el-form-item>
        <el-form-item label="检验类型" required>
          <el-select v-model="newStandardForm.type" placeholder="请选择检验类型" style="width: 100%">
            <el-option label="外观" value="visual" />
            <el-option label="尺寸" value="dimension" />
            <el-option label="功能" value="function" />
            <el-option label="性能" value="performance" />
            <el-option label="安全" value="safety" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键项">
          <el-switch v-model="newStandardForm.is_critical" />
        </el-form-item>
        
        <!-- 只有选择"尺寸"类型时才显示尺寸相关字段 -->
        <template v-if="newStandardForm.type === 'dimension'">
          <el-form-item label="标准尺寸">
            <el-input 
              v-model.number="newStandardForm.dimension_value" 
              placeholder="请输入标准尺寸值"
              type="number"
              :step="0.001"
            />
          </el-form-item>
          <el-form-item label="上公差(+)">
            <el-input 
              v-model.number="newStandardForm.tolerance_upper" 
              placeholder="例如: 0.5"
              type="number"
              :step="0.001"
            />
          </el-form-item>
          <el-form-item label="下公差(-)">
            <el-input 
              v-model.number="newStandardForm.tolerance_lower" 
              placeholder="例如: -0.5"
              type="number"
              :step="0.001"
            />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="addStandardDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:inspectiontemplates:update'" type="primary" @click="saveNewStandard" :loading="savingStandard">保存</el-button>
      </template>
    </el-dialog>
    </div>

    <!-- AQL抽样页面 -->
    <div v-if="viewType === 'aql'">
      <AQLStandards />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import AQLStandards from './AQLStandards.vue'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { baseDataApi, systemApi, qualityApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { parseListData } from '@/utils/responseParser'
import { SEARCH_CONFIG, mapMaterialData, searchMaterials as performSearchMaterials } from '@/utils/searchConfig'
import { handleApiError, handleSuccess, handleWarning } from '@/utils/errorHandler'
import {
  validateInspectionItems,
  normalizeBoolean,
  isGeneralTemplate as isGeneralTemplateUtil
} from '@/utils/inspectionValidation'
import { getInspectionTypeText, getInspectionTypePrefix } from '@/constants/inspection'
// 权限store
const authStore = useAuthStore()

// 视图切换
const viewType = ref('templates')

// 搜索相关
const searchKeyword = ref('')
const typeFilter = ref('')
const statusFilter = ref('')

// 表格数据相关
const loading = ref(false)
const templateList = ref([])
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

// 物料列表数据
const materialsList = ref([])
const loadingMaterials = ref(false)
const materialsMap = ref({}) // 新增：材料ID到代码的映射

// 添加一个控制是否已请求过物料列表的状态变量
const materialDataRequested = ref(false)

// 用户映射
const userMap = ref({})
const userDataRequested = ref(false)

// 对话框相关
const dialogVisible = ref(false)
const viewDialogVisible = ref(false)
const isEdit = ref(false)
const currentTemplate = ref(null)
const formRef = ref(null)

// 表单数据
const form = reactive({
  template_name: '',
  inspection_type: '',
  material_types: [],
  material_type: null, // 兼容旧版本，存储第一个物料ID
  material_name: '',
  version: '',
  description: '',
  items: [],
  is_general: false,
  is_aql: false,
  aql_level: null
})

// AQL等级选项
const aqlLevelOptions = ref([])

// 表单验证规则
const rules = {
  template_name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  inspection_type: [{ required: true, message: '请选择检验类型', trigger: 'change' }],
  material_types: [{ 
    validator: (rule, value, callback) => {
      // 检查是否为通用模板
      if (form.is_general === true) {
        callback() // 通用模板不验证物料类型
      } else if (!value || value.length === 0) {
        callback(new Error('请选择适用物料'))
      } else {
        callback()
      }
    }, 
    trigger: 'change' 
  }],
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  items: [
    {
      validator: (rule, value, callback) => {
        if (!value || value.length === 0) {
          callback(new Error('请至少添加一个检验项目'))
        } else if (value.some(item => !item.item_name || !item.standard || !item.type)) {
          callback(new Error('请完整填写检验项目信息'))
        } else {
          // 检查尺寸类型的检验项是否填写了标准尺寸
          const dimensionItems = value.filter(item => item.type === 'dimension')
          const invalidDimensionItems = dimensionItems.filter(item => 
            !item.dimension_value && item.dimension_value !== 0
          )
          if (invalidDimensionItems.length > 0) {
            callback(new Error('尺寸类型的检验项必须填写标准尺寸值'))
          } else {
            callback()
          }
        }
      },
      trigger: 'change'
    }
  ]
}

// 检验标准选择相关
const standardSelectorVisible = ref(false)
const currentEditingIndex = ref(-1)
const reusableStandards = ref([])
const loadingStandards = ref(false)
const standardSearch = reactive({
  keyword: '',
  type: ''
})

// 添加检验标准相关
const addStandardDialogVisible = ref(false)
const newStandardForm = reactive({
  item_name: '',
  standard: '',
  type: '',
  is_critical: false,
  dimension_value: null,
  tolerance_upper: null,
  tolerance_lower: null
})
const savingStandard = ref(false)

// 初始化
onMounted(() => {
  // 强制刷新数据
  fetchData()
  fetchMaterialsList(true) // 传递true以获取所有物料
  fetchUsers() // 加载用户数据
  fetchAqlLevelOptions() // 加载AQL等级选项
})

// 加载可用的AQL等级列表
const fetchAqlLevelOptions = async () => {
  try {
    const res = await qualityApi.getAqlLevels()
    const data = res.data || res
    aqlLevelOptions.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.error('获取AQL等级列表失败:', err)
    // 静默降级：提供默认等级
    aqlLevelOptions.value = ['0.65', '1.0', '1.5', '2.5', '4.0']
  }
}

// 根据用户ID获取用户真实姓名
const getUserRealName = (userId) => {
  if (!userId) return '未知用户';
  
  // 如果是当前用户ID，直接从authStore获取
  if (authStore.user && authStore.user.id === userId) {
    return authStore.realName || authStore.user.username || userId;
  }
  
  // 从用户映射中查找
  if (userMap.value[userId]) {
    return userMap.value[userId].real_name || 
           userMap.value[userId].realName || 
           userMap.value[userId].name || 
           userMap.value[userId].username || 
           userId;
  }
  
  // 如果用户数据还没请求过，则请求一次
  if (!userDataRequested.value) {
    userDataRequested.value = true;
    // 延迟加载用户数据
    setTimeout(() => {
      fetchUsers();
    }, 100);
  }
  
  return userId;
};

// 获取用户列表
const fetchUsers = async () => {
  try {
    const response = await systemApi.getUsers()
    const userData = parseListData(response)

    // 创建用户ID到信息的映射
    userData.forEach(user => {
      userMap.value[user.id] = user
    })
  } catch (error) {
    // ✅ 优化: 如果是权限不足,静默处理,不影响页面使用
    if (error.response?.status === 403) {
      console.warn('无权限获取用户列表,用户信息将无法显示')
    } else {
      handleApiError(error, '获取用户列表', { showMessage: false })
    }
  }
}

// 获取模板列表
const fetchData = async () => {
  loading.value = true
  try {
    debug('开始获取模板列表...', {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
      inspection_type: typeFilter.value,
      status: statusFilter.value
    })
    
    const response = await qualityApi.getTemplates({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
      inspection_type: typeFilter.value,
      status: statusFilter.value
    })
    
    debug('模板列表API响应', response)

    // axios 拦截器已自动解包，response.data 直接是数据对象
    const responseData = response.data
    if (responseData) {
      // 检查不同的数据结构格式并相应处理
      // 优先检查解包后的格式（rows/count 或 list/total）
      if (responseData.rows && Array.isArray(responseData.rows)) {
        // 格式为 { rows: array, count: number } - 解包后的格式
        debug('检测到格式: { rows: array, count: number }', responseData)
        templateList.value = responseData.rows
        total.value = responseData.count || responseData.total || 0
      } else if (responseData.list && Array.isArray(responseData.list)) {
        // 格式为 { list: array, total: number } - 解包后的格式
        debug('检测到格式: { list: array, total: number }', responseData)
        templateList.value = responseData.list
        total.value = responseData.total || 0
      } else if (Array.isArray(responseData)) {
        // 格式为 array - 直接数组
        debug('检测到格式: array', responseData)
        templateList.value = responseData
        total.value = responseData.length
      } else if (responseData.success && responseData.data) {
        // 格式为 { success: true, data: {...}, ... } - 未解包的格式
        const innerData = responseData.data
        if (Array.isArray(innerData) && responseData.total !== undefined) {
          debug('检测到格式: { success: true, data: Array, total: number }', responseData)
          templateList.value = innerData
          total.value = responseData.total
        } else if (innerData.rows && Array.isArray(innerData.rows)) {
          debug('检测到格式: { success: true, data: { rows: array, count: number } }', responseData)
          templateList.value = innerData.rows
          total.value = innerData.count || innerData.total || 0
        } else if (innerData.list && Array.isArray(innerData.list)) {
          debug('检测到格式: { success: true, data: { list: array, total: number } }', responseData)
          templateList.value = innerData.list
          total.value = innerData.total || 0
        } else if (Array.isArray(innerData)) {
          debug('检测到格式: { success: true, data: Array }', responseData)
          templateList.value = innerData
          total.value = innerData.length
        } else {
          console.error('无法识别的响应数据格式 (success=true, data=object):', innerData)
          templateList.value = []
          total.value = 0
        }
      } else {
        console.error('无法识别的响应数据格式:', responseData)
        templateList.value = []
        total.value = 0
      }
      
      debug('数据映射后的模板列表', templateList.value)
      debug('总数', total.value)
      
      if (templateList.value.length === 0 && total.value > 0) {
        console.warn('警告: 总数不为0但模板列表为空，可能存在数据映射问题')
      }
      
      // 处理模板列表中的检验项数量和通用模板标志
      templateList.value.forEach(template => {
        // 检查并设置检验项数量
        if (template.items_count === undefined) {
          if (template.InspectionItems && Array.isArray(template.InspectionItems)) {
            template.items_count = template.InspectionItems.length;
          } else if (template.items && Array.isArray(template.items)) {
            template.items_count = template.items.length;
          } else {
            template.items_count = 0;
          }
        }
        
        // 确保is_general字段被正确标识
        if (template.is_general !== true && template.is_general !== false) {
          // 修复is_general字段
          template.is_general = template.is_general === 1 || 
                                template.is_general === '1' || 
                                template.is_general === 'true' || 
                                (template.material_type === null && 
                                 (!template.material_types || template.material_types.length === 0));
          }
      });
    } else {
      console.error('模板列表API返回格式错误:', response)
      ElMessage.error('获取模板列表失败')
      templateList.value = []
      total.value = 0
    }
  } catch (error) {
    console.error('获取模板列表失败:', error)
    console.error('错误详情:', {
      message: error.message,
      response: error.response,
      status: error.response?.status,
      data: error.response?.data
    })
    ElMessage.error(`获取模板列表失败: ${error.message}`)
    templateList.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// ====== 物料搜索相关 (开始) ======
let currentSearchId = 0;

// 防抖函数
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const searchProducts = async (query) => {
  const searchId = ++currentSearchId;
  loadingMaterials.value = true;
  
  try {
    let resultItems = [];
    if (!query || query.trim().length === 0) {
      const defaultResults = await performSearchMaterials(baseDataApi, '', {
        pageSize: 50,
        includeAll: true
      });
      resultItems = defaultResults;
    } else {
      const searchResults = await performSearchMaterials(baseDataApi, query.trim(), {
        pageSize: SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
        includeAll: true
      });
      resultItems = searchResults;
    }
    
    if (searchId === currentSearchId) {
      const mapped = mapMaterialData(resultItems);
      materialsList.value = mapped.map(item => ({
        value: item.id,
        label: `${item.code} - ${item.name}`,
        name: item.name,
        code: item.code,
        specs: item.specification || item.specs || ''
      }));
      
      // 合并新物料到映射中，避免重复请求单条数据
      resultItems.forEach(item => {
        materialsMap.value[item.id] = {
          name: item.name,
          code: item.code,
          specs: item.specs || item.specification || ''
        };
      });
    }
  } catch (error) {
    if (searchId === currentSearchId) {
      materialsList.value = [];
    }
  } finally {
    if (searchId === currentSearchId) {
      loadingMaterials.value = false;
    }
  }
};

const debouncedSearchMaterials = debounce(searchProducts, SEARCH_CONFIG.SEARCH_DEBOUNCE_DELAY || 300);

const handleMaterialSelectFocus = () => {
  if (materialsList.value.length === 0) {
    debouncedSearchMaterials('');
  }
};

const fetchMaterialsList = async (query = '') => {
  if (query === true) {
     debouncedSearchMaterials('');
     return;
  }
  debouncedSearchMaterials(query);
};
// ====== 物料搜索相关 (结束) ======

// 根据ID获取物料编码（同步版本，用于表格显示）
const getMaterialCodeById = (id) => {
  if (!id) return '未指定'

  // 从映射中查找物料信息
  const material = materialsMap.value[id]
  if (material) {
    return material.code
  }

  // 如果映射中没有，但列表中有
  const materialInList = materialsList.value.find(item => item.value === id)
  if (materialInList) {
    return materialInList.code
  }

  // 如果正在加载物料列表，暂时返回空字符串，避免显示ID
  if (loadingMaterials.value) {
    return ''
  }

  // 如果物料数据还没请求过，则请求一次
  if (Object.keys(materialsMap.value).length === 0 && !materialDataRequested.value) {
    materialDataRequested.value = true
    setTimeout(() => {
      fetchMaterialsList(true)
    }, 100)
    return ''
  }

  // 都没找到，尝试异步获取单个物料信息
  fetchSingleMaterial(id)

  return ''
}

// 异步获取单个物料信息
const fetchSingleMaterial = async (id) => {
  try {
    const response = await baseDataApi.getMaterial(id)
    // 拦截器已解包，response.data 就是业务数据
    if (response.data?.code) {
      // 将获取到的物料信息添加到映射中
      materialsMap.value[id] = {
        name: response.data.name,
        code: response.data.code,
        specs: response.data.specs
      }
      // 触发重新渲染
      await nextTick()
    }
  } catch (error) {
    console.warn('获取单个物料信息失败:', error)
  }
}

// 根据多个ID获取物料编码
const getMultipleMaterialCodes = (ids) => {
  if (!ids || ids.length === 0) return '未指定'

  // 确保ids是数组
  const materialIds = Array.isArray(ids) ? ids : [ids]

  // 获取每个ID对应的物料编码并拼接
  const codes = materialIds.map(id => getMaterialCodeById(id)).filter(code => code !== '')

  if (codes.length === 0) return ''

  return codes.join('、')
}

// 获取表格中显示的物料编码（支持新旧格式）
const getTableMaterialCodes = (row) => {
  // 优先使用后端预加载的详细信息，避免闪烁
  if (row.material_details && Array.isArray(row.material_details) && row.material_details.length > 0) {
    return row.material_details.map(m => m.code).join('、')
  }

  // 这里的fallback逻辑保留，以防万一后端没有返回details
  
  // 优先使用新的 material_types 字段
  if (row.material_types) {
    try {
      const materialIds = typeof row.material_types === 'string'
        ? JSON.parse(row.material_types)
        : row.material_types
      return getMultipleMaterialCodes(materialIds)
    } catch (error) {
      console.warn('解析 material_types 失败:', error)
    }
  }

  // 兼容旧的 material_type 字段
  if (row.material_code) {
    return row.material_code
  }

  if (row.material_type) {
    return getMaterialCodeById(row.material_type)
  }

  return '未指定'
}

// 物料选择改变时的处理
const handleMaterialChange = (values) => {
  // 处理多选值，确保都是数组
  if (!Array.isArray(values)) {
    values = [values].filter(Boolean)
  }
  
  // 设置单个material_type为第一个值（兼容旧代码）
  form.material_type = values.length > 0 ? values[0] : ''
  
  // 获取第一个物料的名称（兼容旧代码）
  if (values.length > 0) {
    const firstMaterial = materialsList.value.find(item => item.value === values[0])
    if (firstMaterial) {
      form.material_name = firstMaterial.name
    }
  } else {
    form.material_name = ''
  }
}

// 移除已选物料
const removeMaterial = (materialId) => {
  const index = form.material_types.indexOf(materialId)
  if (index > -1) {
    form.material_types.splice(index, 1)
    // 触发 handleMaterialChange 以更新兼容字段
    handleMaterialChange(form.material_types)
  }
}

// 获取物料显示文本（编码）
const getMaterialDisplayText = (materialId) => {
  // 优先从 materialsMap 获取
  if (materialsMap.value[materialId]) {
    return materialsMap.value[materialId].code
  }
  
  // 其次从 materialsList 获取
  const material = materialsList.value.find(item => item.value === materialId)
  if (material) {
    return material.code || material.label
  }
  
  // 都没找到，返回 ID
  return materialId
}

// 检验类型文本和前缀已从 @/constants/inspection 导入

// 获取检验项类型文本
const getItemTypeText = (type) => {
  const typeMap = {
    visual: '外观',
    dimension: '尺寸',
    function: '功能',
    performance: '性能',
    safety: '安全',
    other: '其他'
  }
  return typeMap[type] || type
}

// 获取状态类型
const getStatusType = (status) => {
  const statusMap = {
    active: 'success',
    inactive: 'warning',
    draft: 'info'
  }
  return statusMap[status] || 'info'
}

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    active: '启用',
    inactive: '停用',
    draft: '草稿'
  }
  return statusMap[status] || status
}

// 判断是否是通用模板
// 使用工具函数判断通用模板（已从 @/utils/inspectionValidation 导入）
const isGeneralTemplate = isGeneralTemplateUtil

// 获取检验项数量
const getItemsCount = (row) => {
  // 检查不同的数据结构可能性
  if (row.items_count !== undefined) {
    return row.items_count;
  }
  
  if (row.InspectionItems && Array.isArray(row.InspectionItems)) {
    return row.InspectionItems.length;
  }
  
  if (row.items && Array.isArray(row.items)) {
    return row.items.length;
  }
  
  // 返回默认值
  return 0;
}

// 日期格式化
const formatDate = (date) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

// 打印调试信息
const debug = (message, data) => {
  // 调试信息已禁用
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}

// 重置
const handleRefresh = () => {
  searchKeyword.value = ''
  typeFilter.value = ''
  statusFilter.value = ''
  currentPage.value = 1
  fetchData()
}

// 分页
const handleSizeChange = (val) => {
  pageSize.value = val
  fetchData()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchData()
}

// 创建模板
// 重置表单
const resetForm = () => {
  form.template_name = ''
  form.inspection_type = ''
  form.material_types = []
  form.material_type = null
  form.material_name = ''
  form.is_general = false
  form.is_aql = false
  form.aql_level = null
  form.version = ''
  form.description = ''
  form.items = []
  
  // 清除表单验证状态
  if (formRef.value) {
    formRef.value.clearValidate()
  }
}

// 新建模板
const handleCreate = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

// 编辑模板
const handleEdit = async (row) => {
  isEdit.value = true
  try {
    // 先获取完整的模板数据，包含检验项目
    const response = await qualityApi.getTemplate(row.id)

    // axios 拦截器已自动解包，response.data 是模板详情数据
    const templateData = response.data
    if (templateData) {
      // 将模板数据填充到表单
      form.id = templateData.id
      form.template_name = templateData.template_name
      form.inspection_type = templateData.inspection_type

      // 使用工具函数判断是否为通用模板
      form.is_general = isGeneralTemplate(templateData)

      // 处理material_type和material_types，根据通用状态决定
      if (!form.is_general) {
        // 非通用模板，需要设置物料
        let types = [];
        if (templateData.material_types) {
          if (Array.isArray(templateData.material_types)) {
            types = templateData.material_types;
          } else if (typeof templateData.material_types === 'string') {
            try {
              types = JSON.parse(templateData.material_types);
            } catch (e) {
              console.warn('解析 material_types 失败:', e);
            }
          }
        }
        
        // 如果没有 material_types 但有 material_type，则使用 material_type
        if (types.length === 0 && templateData.material_type) {
          types = [templateData.material_type];
        }
        
        form.material_types = types;

        // 关键修复：确保下拉列表和映射中包含当前选中的物料
        if (templateData.material_details && Array.isArray(templateData.material_details)) {
          templateData.material_details.forEach(material => {
            // 同时更新 materialsMap（用于显示）
            if (!materialsMap.value[material.id]) {
              materialsMap.value[material.id] = {
                name: material.name,
                code: material.code,
                specs: material.specs
              };
            }
            
            // 同时更新 materialsList（用于下拉选择）
            const exists = materialsList.value.some(item => item.value === material.id);
            if (!exists) {
              materialsList.value.push({
                value: material.id,
                label: material.code,
                name: material.name,
                code: material.code,
                specs: material.specs
              });
            }
          });
        }

        // 兼容旧字段
        form.material_type = templateData.material_type || (form.material_types.length > 0 ? form.material_types[0] : null)
        form.material_name = templateData.material_name || ''
      } else {
        // 通用模板，清空物料相关字段
        form.material_types = []
        form.material_type = null
        form.material_name = ''
      }

      form.version = templateData.version
      form.description = templateData.description
      form.status = templateData.status
      form.is_aql = templateData.is_aql === true || templateData.is_aql === 1
      form.aql_level = templateData.aql_level || null

      // 确保检验项目数据完整
      form.items = templateData.InspectionItems ?
        templateData.InspectionItems.map(item => ({
          item_name: item.item_name,
          standard: item.standard,
          type: item.type,
          is_critical: item.is_critical === true || item.is_critical === 1,
          dimension_value: item.dimension_value,
          tolerance_upper: item.tolerance_upper,
          tolerance_lower: item.tolerance_lower,
          id: item.id,
          reuse_item_id: item.id // 设置为复用现有项目ID
        })) : []

      dialogVisible.value = true
    } else {
      ElMessage.error('获取模板详情失败')
    }
  } catch (error) {
    console.error('获取模板详情失败:', error)
    ElMessage.error(`获取模板详情失败: ${error.message}`)
  }
}

// 查看模板
const handleView = async (row) => {
  try {
    const response = await qualityApi.getTemplate(row.id)

    // axios 拦截器已自动解包，response.data 是模板详情数据
    const templateData = response.data
    if (templateData) {
      // 确保模板数据正确
      currentTemplate.value = {
        ...templateData,
        items: templateData.InspectionItems || [] // 使用InspectionItems作为items
      }

      viewDialogVisible.value = true
    } else {
      ElMessage.error('获取模板详情失败')
    }
  } catch (error) {
    console.error('获取模板详情失败:', error)
    ElMessage.error(`获取模板详情失败: ${error.message}`)
  }
}

// 添加检验项
const addItem = () => {
  form.items.push({
    item_name: '',
    standard: '',
    type: '',
    is_critical: false,
    dimension_value: null,
    tolerance_upper: null,
    tolerance_lower: null
  })
}

// 移除检验项
const removeItem = (index) => {
  form.items.splice(index, 1)
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        
        // 准备提交数据
        // 确保is_general是布尔值
        const isGeneralValue = normalizeBoolean(form.is_general)
        
        const formData = {
          template_name: form.template_name,
          inspection_type: form.inspection_type,
          is_general: isGeneralValue, // 明确使用布尔值true/false
          material_types: isGeneralValue ? [] : form.material_types, // 通用模板时清空物料
          material_type: isGeneralValue ? null : (form.material_types[0] || null), // 兼容旧字段
          material_name: form.material_name,
          version: form.version,
          description: form.description,
          is_aql: form.is_aql === true,
          aql_level: form.is_aql ? form.aql_level : null,
          items: form.items.map(item => {
            const itemData = {
              item_name: item.item_name,
              standard: item.standard,
              type: item.type,
              is_critical: item.is_critical === true, // 确保也是布尔值
              reuse_item_id: item.reuse_item_id // 保留复用项目ID
            }
            
            // 只有尺寸类型才传递尺寸相关字段
            if (item.type === 'dimension') {
              itemData.dimension_value = item.dimension_value || null
              itemData.tolerance_upper = item.tolerance_upper || null
              itemData.tolerance_lower = item.tolerance_lower || null
            }
            
            return itemData
          })
        }
        
        // 使用统一的检验项验证函数
        const validation = validateInspectionItems(form.items)
        if (!validation.valid) {
          if (validation.type === 'incomplete') {
            handleWarning(validation.message)
          } else if (validation.type === 'duplicate') {
            handleWarning(`${validation.message}：${validation.items.join(', ')}，请修改后再提交`, 5000)
          } else if (validation.type === 'similar') {
            handleWarning(`${validation.message}：${validation.items.join(', ')}`, 6000)
          }
          return
        }
        
        // 根据模式选择不同的API
        const response = isEdit.value 
          ? await qualityApi.updateTemplate(form.id, formData)
          : await qualityApi.createTemplate(formData)

        // axios 拦截器已自动解包，检查响应是否存在即表示成功
        if (response.data !== undefined) {
          handleSuccess(isEdit.value ? '模板更新成功' : '模板创建成功')
          dialogVisible.value = false
          fetchData() // 刷新列表
        } else {
          handleWarning(isEdit.value ? '更新失败' : '创建失败')
        }
      } catch (error) {
        handleApiError(error, isEdit.value ? '更新模板' : '创建模板')
      }
    }
  })
}

// 处理更多操作
const handleDropdownCommand = async (command, row) => {
  try {
    if (command === 'activate' || command === 'deactivate') {
      const status = command === 'activate' ? 'active' : 'inactive'
      const response = await qualityApi.updateTemplateStatus(row.id, status)

      // ✅ 修复：后端返回 data: null，应该检查 response.data !== undefined
      if (response.data !== undefined) {
        ElMessage.success(`模板${status === 'active' ? '启用' : '停用'}成功`)
        fetchData()
      } else {
        ElMessage.error('操作失败')
      }
    } else if (command === 'copy') {
      const response = await qualityApi.copyTemplate(row.id)

      // ✅ 修复：后端返回 data: null，应该检查 response.data !== undefined
      if (response.data !== undefined) {
        ElMessage.success('模板复制成功')
        fetchData()
      } else {
        ElMessage.error('复制失败')
      }
    } else if (command === 'delete') {
      ElMessageBox.confirm('确定要删除该模板吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const response = await qualityApi.deleteInspectionTemplate(row.id)

        // ✅ 修复：后端返回 data: null，应该检查 response.data !== undefined
        if (response.data !== undefined) {
          ElMessage.success('模板删除成功')
          fetchData()
        } else {
          ElMessage.error('删除失败')
        }
      }).catch(() => {})
    }
  } catch (error) {
    console.error('操作失败:', error)
    ElMessage.error(`操作失败: ${error.message}`)
  }
}

// 打开检验标准选择器
const openStandardSelector = (index) => {
  currentEditingIndex.value = index
  standardSelectorVisible.value = true
  searchStandards()
}

// 查询可复用的检验标准
const searchStandards = async () => {
  loadingStandards.value = true
  try {
    const params = {
      keyword: standardSearch.keyword,
      type: standardSearch.type
    }

    const response = await qualityApi.getReusableItems(params)

    // axios 拦截器已自动解包，response.data 直接是数据
    const responseData = response.data
    if (responseData && Array.isArray(responseData)) {
      reusableStandards.value = responseData
    } else if (responseData && responseData.rows) {
      reusableStandards.value = responseData.rows
    } else if (responseData && responseData.list) {
      reusableStandards.value = responseData.list
    } else {
      reusableStandards.value = []
      console.warn('获取检验标准数据格式不正确:', responseData)
    }
  } catch (error) {
    console.error('获取检验标准失败:', error)
    ElMessage.error(`获取检验标准失败: ${error.message}`)
    reusableStandards.value = []
  } finally {
    loadingStandards.value = false
  }
}

// 重置检验标准搜索
const resetStandardSearch = () => {
  standardSearch.keyword = ''
  standardSearch.type = ''
  searchStandards()
}

// 选择检验标准
const selectStandard = (row) => {
  if (currentEditingIndex.value >= 0 && currentEditingIndex.value < form.items.length) {
    // 复制选中的标准到当前编辑的项目
    form.items[currentEditingIndex.value].item_name = row.item_name
    form.items[currentEditingIndex.value].standard = row.standard
    form.items[currentEditingIndex.value].type = row.type
    form.items[currentEditingIndex.value].is_critical = row.is_critical
    form.items[currentEditingIndex.value].dimension_value = row.dimension_value
    form.items[currentEditingIndex.value].tolerance_upper = row.tolerance_upper
    form.items[currentEditingIndex.value].tolerance_lower = row.tolerance_lower
    form.items[currentEditingIndex.value].reuse_item_id = row.id // 设置复用项目ID
    
    ElMessage.success('已选择标准')
    standardSelectorVisible.value = false
  }
}

// 添加直接启用模板的方法
const handleActivate = async (row) => {
  try {
    const response = await qualityApi.updateTemplateStatus(row.id, 'active')

    // ✅ 修复：后端返回 data: null，应该检查 response.data !== undefined
    if (response.data !== undefined) {
      ElMessage.success('模板启用成功')
      fetchData()
    } else {
      ElMessage.error('操作失败')
    }
  } catch (error) {
    console.error('启用模板失败:', error)
    ElMessage.error(`启用失败: ${error.message}`)
  }
}

// 打开添加标准对话框
const openAddStandardDialog = () => {
  // 重置表单
  newStandardForm.item_name = ''
  newStandardForm.standard = ''
  newStandardForm.type = standardSearch.type || '' // 默认使用当前选择的类型
  newStandardForm.is_critical = false
  newStandardForm.dimension_value = null
  newStandardForm.tolerance_upper = null
  newStandardForm.tolerance_lower = null
  
  addStandardDialogVisible.value = true
}

// 保存新标准
const saveNewStandard = async () => {
  // 验证表单
  if (!newStandardForm.item_name || !newStandardForm.standard || !newStandardForm.type) {
    ElMessage.warning('请完整填写检验标准信息')
    return
  }
  
  // 如果检验类型是尺寸，验证尺寸相关字段
  if (newStandardForm.type === 'dimension') {
    if (!newStandardForm.dimension_value && newStandardForm.dimension_value !== 0) {
      ElMessage.warning('尺寸类型检验项必须填写标准尺寸值')
      return
    }
  }
  
  savingStandard.value = true
  try {
    // 准备提交数据
    const submitData = {
      item_name: newStandardForm.item_name,
      standard: newStandardForm.standard,
      type: newStandardForm.type,
      is_critical: newStandardForm.is_critical
    }
    
    // 只有尺寸类型才传递尺寸相关字段
    if (newStandardForm.type === 'dimension') {
      submitData.dimension_value = newStandardForm.dimension_value
      submitData.tolerance_upper = newStandardForm.tolerance_upper
      submitData.tolerance_lower = newStandardForm.tolerance_lower
    }
    
    // 直接创建新的检验项目
    const response = await qualityApi.createReusableItem(submitData)

    // ✅ 修复：后端返回的数据可能是对象或null，应该检查 response.data !== undefined
    const newStandard = response.data

    if (newStandard !== undefined && newStandard !== null) {
      // 检查是新建还是已存在
      const isExisting = response._message && response._message.includes('已存在')

      if (isExisting) {
        // 标准已存在，提示用户并高亮显示
        ElMessage.warning({
          message: `该检验标准已存在（ID: ${newStandard.id}），已为您定位`,
          duration: 3000
        })
      } else {
        // 新建成功
        ElMessage.success('检验标准添加成功')
      }

      addStandardDialogVisible.value = false

      // ✅ 修复：清空筛选条件，确保标准能被看到
      standardSearch.keyword = ''
      standardSearch.type = ''

      // 刷新检验标准列表
      await searchStandards()

      // 如果当前正在编辑检验项，自动选择该标准（无论是新建还是已存在）
      if (currentEditingIndex.value >= 0 && currentEditingIndex.value < form.items.length) {
        form.items[currentEditingIndex.value].item_name = newStandard.item_name
        form.items[currentEditingIndex.value].standard = newStandard.standard
        form.items[currentEditingIndex.value].type = newStandard.type
        form.items[currentEditingIndex.value].is_critical = newStandard.is_critical
        form.items[currentEditingIndex.value].dimension_value = newStandard.dimension_value
        form.items[currentEditingIndex.value].tolerance_upper = newStandard.tolerance_upper
        form.items[currentEditingIndex.value].tolerance_lower = newStandard.tolerance_lower
        form.items[currentEditingIndex.value].reuse_item_id = newStandard.id
      }
    } else {
      ElMessage.error('添加检验标准失败')
    }
  } catch (error) {
    console.error('添加检验标准失败:', error)
    ElMessage.error(`添加检验标准失败: ${error.message}`)
  } finally {
    savingStandard.value = false
  }
}

// 处理通用模板变化
const handleGeneralChange = (val) => {
  // 确保val是布尔值
  const isGeneral = val === true;
  
  // 确保form.is_general也是布尔值
  form.is_general = isGeneral;
  
  if (isGeneral) {
    // 如果选择了通用模板，清空物料选择
    form.material_types = []
    form.material_type = null
    form.material_name = ''
  } else {
    // 如果取消了通用模板选择，可以保留之前的物料选择
    // 这里不清空物料选择，允许用户重新选择
  }
}
</script>

<style scoped>

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-buttons {
  display: flex;
  gap: 8px;
}

.search-container {
  margin-bottom: var(--spacing-base);
}

.search-buttons {
  display: flex;
  gap: 8px;
}

.items-container {
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-sm);
  padding: 12px;
  width: 100%;
  box-sizing: border-box;
}

.table-wrapper {
  width: 100%;
  position: relative;
}

.table-container {
  width: 100%;
  overflow-x: auto;
  margin-bottom: 10px;
  max-width: 820px;
}

/* 设置表格中输入框的最大宽度 */
:deep(.el-table) {
  width: auto !important;
  min-width: 100%;
}

.items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.standard-input-group {
  display: flex;
  align-items: center;
  width: 100%;
}

.standard-input {
  flex: 1;
  max-width: 140px;
}

.standard-button {
  flex-shrink: 0;
  margin-left: 4px;
}

.form-tip {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: 8px;
}

.template-items {
  margin-top: var(--spacing-lg);
}

.template-items h3 {
  margin-bottom: var(--spacing-base);
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

/* 物料选择器样式 */
.material-select-container {
  width: 100%;
}

/* 隐藏 el-select 内部的所有 tags，因为我们在下方单独显示 */
.material-select-container :deep(.el-select__tags) {
  max-width: none !important;
}

.material-select-container :deep(.el-select__tags-text) {
  display: none;
}

.material-select-container :deep(.el-tag) {
  display: none !important;
}

.material-select-container :deep(.el-select__input) {
  margin-left: 11px !important;
}

.selected-materials-list {
  margin-top: 8px;
  padding: 8px 12px;
  background-color: var(--color-bg-secondary, #f5f7fa);
  border-radius: 4px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.selected-label {
  color: var(--color-text-secondary, #606266);
  font-size: 13px;
  margin-right: 4px;
  flex-shrink: 0;
}

.selected-materials-list .material-tag {
  margin: 0;
  display: inline-flex !important;
}
</style> 