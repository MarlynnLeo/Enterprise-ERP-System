<!--
/**
 * InspectionTemplates.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page template-container">
    <PageHeader title="检验模板管理" subtitle="检验项目模板与默认规则">
      <template #actions>
        <el-button type="success" :icon="Upload" @click="handleOpenImportDialog">
          导入检验记录单 (.docx)
        </el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate"> 新建模板 </el-button>
      </template>
    </PageHeader>

    <div
      style="
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background-color: var(--color-bg-base);
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 1px 4px color-mix(in srgb, var(--ds-slate) 8%, transparent);
      "
    >
      <div style="font-size: 16px; font-weight: bold; color: var(--color-text-primary)">
        检验控制库
      </div>
      <el-radio-group v-model="viewType" size="default">
        <el-radio-button value="templates">检验模板</el-radio-button>
        <el-radio-button value="aql">AQL 抽样规则</el-radio-button>
      </el-radio-group>
    </div>
    <!-- 检验模板页面 -->
    <div v-show="viewType === 'templates'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>检验模板管理</span>
            <div class="header-buttons">
              <el-button type="success" size="small" :icon="Upload" @click="handleOpenImportDialog">
                导入 Word 检验单
              </el-button>
              <el-button type="primary" size="small" :icon="Plus" @click="handleCreate">
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
                clearable
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </el-col>

            <el-col :span="3">
              <el-select
                v-model="typeFilter"
                placeholder="检验类型"
                clearable
                @change="handleSearch"
                class="w-full"
              >
                <el-option label="来料检验" value="incoming" />
                <el-option label="过程检验" value="process" />
                <el-option label="成品检验" value="final" />
                <el-option label="首件检验" value="first_article" />
              </el-select>
            </el-col>

            <el-col :span="2">
              <el-select
                v-model="statusFilter"
                placeholder="状态"
                clearable
                @change="handleSearch"
                class="w-full"
              >
                <el-option label="启用" value="active" />
                <el-option label="停用" value="inactive" />
                <el-option label="草稿" value="draft" />
              </el-select>
            </el-col>

            <el-col :span="4">
              <div class="search-buttons">
                <el-button type="primary" @click="handleSearch"> 查询 </el-button>
                <el-button @click="handleRefresh"> 重置 </el-button>
              </div>
            </el-col>
          </el-row>
        </div>
        <!-- 模板列表 -->
        <el-table
          :data="templateList"
          border
          class="table-row-click w-full mt-md"
          v-loading="loading"
          @row-click="
            (row, column, event) => handleTableRowView(row, column, event, () => handleView(row))
          "
        >
          <el-table-column prop="templateCode" label="模板编号" min-width="100" />
          <el-table-column prop="templateName" label="模板名称" min-width="150" />
          <el-table-column prop="inspectionType" label="检验类型" min-width="100">
            <template #default="scope">
              {{ getInspectionTypeText(scope.row.inspectionType) }}
            </template>
          </el-table-column>
          <el-table-column prop="materialType" label="适用物料" min-width="120">
            <template #default="scope">
              <el-tag v-if="isGeneralTemplate(scope.row)" type="success">
                {{ getInspectionTypePrefix(scope.row.inspectionType) }}通用模板
              </el-tag>
              <span v-else>{{ getTableMaterialCodes(scope.row) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="itemsCount" label="检验项数量" min-width="100">
            <template #default="scope">
              {{ getItemsCount(scope.row) }}
            </template>
          </el-table-column>
          <el-table-column prop="version" label="版本" min-width="80" />
          <el-table-column prop="isDefault" label="默认" min-width="80">
            <template #default="scope">
              <el-tag v-if="scope.row.isDefault" type="warning">默认</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" min-width="80">
            <template #default="scope">{{ scope.row.priority || 100 }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" min-width="80">
            <template #default="scope">
              <el-tag :type="getStatusType(scope.row.status)">
                {{ getStatusText(scope.row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdBy" label="创建人" min-width="100">
            <template #default="scope">
              {{ getUserRealName(scope.row.createdBy) }}
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" min-width="120">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            fixed="right"
            min-width="360"
            align="left"
            header-align="left"
            class-name="operation-column"
            header-class-name="operation-column-header"
          >
            <template #default="scope">
              <el-button
                v-if="scope.row.status !== 'active'"
                size="small"
                type="primary"
                @click="handleEdit(scope.row)"
                v-permission="'quality:templates:update'"
              >
                编辑
              </el-button>
              <el-button
                v-if="scope.row.status === 'inactive' || scope.row.status === 'draft'"
                size="small"
                type="primary"
                @click="handleActivate(scope.row)"
                v-permission="'quality:templates:update'"
              >
                启用
              </el-button>
              <el-button
                v-if="scope.row.status === 'active'"
                size="small"
                type="danger"
                @click="handleDropdownCommand('deactivate', scope.row)"
                v-permission="'quality:templates:update'"
              >
                停用
              </el-button>
              <el-button
                size="small"
                type="primary"
                @click="handleDropdownCommand('copy', scope.row)"
                v-permission="'quality:templates:create'"
              >
                复制
              </el-button>
              <el-button
                v-if="scope.row.status === 'inactive' || scope.row.status === 'draft'"
                size="small"
                type="danger"
                @click="handleDropdownCommand('delete', scope.row)"
                v-permission="'quality:templates:delete'"
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
      <AppDialog
        v-model="dialogVisible"
        :title="isEdit ? '编辑检验模板' : '新建检验模板'"
        mode="form"
        wide
      >
        <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
          <el-form-item label="模板名称" prop="templateName">
            <el-input v-model="form.templateName" placeholder="请输入模板名称" />
          </el-form-item>

          <el-form-item label="检验类型" prop="inspectionType">
            <el-select v-model="form.inspectionType" placeholder="请选择检验类型" class="w-full">
              <el-option label="来料检验" value="incoming" />
              <el-option label="过程检验" value="process" />
              <el-option label="成品检验" value="final" />
              <el-option label="首件检验" value="first_article" />
            </el-select>
          </el-form-item>

          <el-form-item label="通用模板">
            <el-checkbox v-model="form.isGeneral" @change="handleGeneralChange"
              >设为通用模板</el-checkbox
            >
            <span class="form-tip">勾选后，该模板适用于所有物料，无需选择具体物料</span>
          </el-form-item>

          <el-form-item label="默认兜底" v-if="form.isGeneral">
            <el-switch v-model="form.isDefault" active-text="默认" inactive-text="普通" />
            <span class="form-tip"
              >同一检验类型仅保留一个默认通用模板，用于无专用模板时自动兜底</span
            >
          </el-form-item>

          <el-form-item label="优先级" prop="priority">
            <el-input-number v-model="form.priority" :min="1" :max="999" :step="1" />
            <span class="form-tip">数值越小越优先；专用模板仍优先于通用模板</span>
          </el-form-item>

          <el-form-item label="适用物料" prop="materialTypes" v-if="!form.isGeneral">
            <div class="material-select-container">
              <el-select
                v-model="form.materialTypes"
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
                class="w-full"
                popper-class="material-select-popper"
              >
                <el-option
                  v-for="item in materialsList"
                  :key="item.value"
                  :label="item.code"
                  :value="item.value"
                >
                  <span>{{ item.code }}</span>
                  <span style="margin-left: 8px; color: var(--color-text-muted); font-size: 12px">{{
                    item.name
                  }}</span>
                </el-option>
              </el-select>
              <!-- 已选物料标签列表 -->
              <div
                class="selected-materials-list"
                v-if="form.materialTypes && form.materialTypes.length > 0"
              >
                <span class="selected-label">已选物料({{ form.materialTypes.length }})：</span>
                <el-tag
                  v-for="materialId in form.materialTypes"
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
            <el-switch v-model="form.isAql" active-text="启用" inactive-text="关闭" />
            <span class="form-tip">启用后，使用该模板时将自动应用 AQL 抽样标准</span>
          </el-form-item>
          <el-form-item label="AQL等级" v-if="form.isAql">
            <el-select v-model="form.aqlLevel" placeholder="选择 AQL 级别">
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
                  v-permission="isEdit ? 'quality:templates:update' : 'quality:templates:create'"
                >
                  添加检验项
                </el-button>
              </div>

              <div class="table-wrapper">
                <div class="table-container">
                  <el-table
                    :data="form.items"
                    border
                    class="w-full"
                    table-layout="fixed"
                    size="small"
                  >
                    <el-table-column type="index" width="50" label="序号" fixed />
                    <el-table-column prop="itemName" label="检验项目" width="150" fixed>
                      <template #default="scope">
                        <el-input
                          v-model="scope.row.itemName"
                          placeholder="请输入检验项目名称"
                          size="small"
                          @input="
                            () => {
                              if (scope.row.reuseItemId) {
                                scope.row.reuseItemId = null;
                              }
                            }
                          "
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
                          class="w-full"
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
                    <el-table-column prop="isCritical" label="关键项" width="80">
                      <template #default="scope">
                        <el-checkbox v-model="scope.row.isCritical" />
                      </template>
                    </el-table-column>
                    <el-table-column prop="dimensionValue" label="标准尺寸" width="100">
                      <template #default="scope">
                        <el-input
                          v-if="scope.row.type === 'dimension'"
                          v-model.number="scope.row.dimensionValue"
                          placeholder="尺寸值"
                          size="small"
                          type="number"
                          :step="0.001"
                        />
                        <span v-else class="text-muted">仅尺寸类型</span>
                      </template>
                    </el-table-column>
                    <el-table-column prop="toleranceUpper" label="上公差(+)" width="100">
                      <template #default="scope">
                        <el-input
                          v-if="scope.row.type === 'dimension'"
                          v-model.number="scope.row.toleranceUpper"
                          placeholder="+0.000"
                          size="small"
                          type="number"
                          :step="0.001"
                        />
                        <span v-else class="text-muted">仅尺寸类型</span>
                      </template>
                    </el-table-column>
                    <el-table-column prop="toleranceLower" label="下公差(-)" width="100">
                      <template #default="scope">
                        <el-input
                          v-if="scope.row.type === 'dimension'"
                          v-model.number="scope.row.toleranceLower"
                          placeholder="-0.000"
                          size="small"
                          type="number"
                          :step="0.001"
                        />
                        <span v-else class="text-muted">仅尺寸类型</span>
                      </template>
                    </el-table-column>
                    <el-table-column
                      label="操作"
                      min-width="80"
                      fixed="right"
                      align="left"
                      header-align="left"
                      class-name="operation-column"
                      header-class-name="operation-column-header"
                    >
                      <template #default="scope">
                        <el-button
                          size="small"
                          type="danger"
                          @click="removeItem(scope.$index)"
                          v-permission="
                            isEdit ? 'quality:templates:update' : 'quality:templates:create'
                          "
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
            <el-button
              v-permission="isEdit ? 'quality:templates:update' : 'quality:templates:create'"
              type="primary"
              @click="submitForm"
              >确认</el-button
            >
          </span>
        </template>
      </AppDialog>
      <!-- 查看模板详情对话框 -->
      <AppDialog
        v-model="viewDialogVisible"
        title="检验模板详情"
        mode="view"
        content-width="wide"
        :detail-navigation="inspectionTemplateViewNavigation"
      >
        <el-descriptions :column="2" border>
          <el-descriptions-item label="模板编号">{{
            currentTemplate?.template_code
          }}</el-descriptions-item>
          <el-descriptions-item label="模板名称">{{
            currentTemplate?.templateName
          }}</el-descriptions-item>
          <el-descriptions-item label="检验类型">{{
            getInspectionTypeText(currentTemplate?.inspectionType)
          }}</el-descriptions-item>
          <el-descriptions-item label="适用物料">
            <el-tag v-if="isGeneralTemplate(currentTemplate)" type="success">
              {{ getInspectionTypePrefix(currentTemplate?.inspectionType) }}通用模板
            </el-tag>
            <span v-else>{{
              getMultipleMaterialCodes(
                currentTemplate?.materialTypes || [currentTemplate?.materialType],
                currentTemplate
              )
            }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="版本">{{ currentTemplate?.version }}</el-descriptions-item>
          <el-descriptions-item label="默认兜底">
            <el-tag v-if="currentTemplate?.isDefault" type="warning">默认模板</el-tag>
            <el-tag v-else type="info">普通模板</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="优先级">{{
            currentTemplate?.priority || 100
          }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(currentTemplate?.status)">
              {{ getStatusText(currentTemplate?.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="AQL抽样">
            <el-tag v-if="currentTemplate?.isAql" type="success"
              >已启用 (AQL {{ currentTemplate?.aqlLevel }})</el-tag
            >
            <el-tag v-else type="info">未启用</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建人">{{
            getUserRealName(currentTemplate?.created_by)
          }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{
            formatDate(currentTemplate?.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{
            currentTemplate?.description || '-'
          }}</el-descriptions-item>
        </el-descriptions>

        <div class="template-items" v-if="currentTemplate?.items?.length">
          <h3>检验项目列表</h3>
          <div class="table-container">
            <el-table :data="currentTemplate.items" border>
              <el-table-column type="index" width="50" label="序号" />
              <el-table-column prop="itemName" label="检验项目" min-width="120" />
              <el-table-column prop="standard" label="检验标准" min-width="150" />
              <el-table-column prop="type" label="检验类型" width="100">
                <template #default="scope">
                  {{ getItemTypeText(scope.row.type) }}
                </template>
              </el-table-column>
              <el-table-column prop="isCritical" label="关键项" width="80">
                <template #default="scope">
                  <el-tag size="small" :type="scope.row.isCritical ? 'danger' : 'info'">
                    {{ scope.row.isCritical ? '是' : '否' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="dimensionValue" label="标准尺寸" width="100">
                <template #default="scope">
                  {{ scope.row.dimensionValue || '-' }}
                </template>
              </el-table-column>
              <el-table-column prop="tolerance" label="公差范围" width="120">
                <template #default="scope">
                  <span v-if="scope.row.toleranceUpper || scope.row.toleranceLower">
                    +{{ scope.row.toleranceUpper || 0 }} / -{{
                      Math.abs(scope.row.toleranceLower) || 0
                    }}
                  </span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </AppDialog>
      <!-- 检验标准选择对话框 -->
      <AppDialog v-model="standardSelectorVisible" title="选择检验标准" mode="form" wide>
        <div class="standard-search-form">
          <el-row :gutter="16">
            <el-col :span="8">
              <el-input
                v-model="standardSearch.keyword"
                placeholder="输入项目名称或标准"
                clearable
                @keyup.enter="searchStandards"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-select v-model="standardSearch.type" placeholder="检验类型" clearable>
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
              <el-button
                v-permission="'quality:templates:create'"
                type="success"
                @click="openAddStandardDialog"
              >
                <el-icon><Plus /></el-icon>添加标准
              </el-button>
            </el-col>
          </el-row>
        </div>
        <div class="table-container">
          <el-table
            :data="reusableStandards"
            border
            class="w-full mt-md"
            height="400px"
            v-loading="loadingStandards"
            @row-dblclick="selectStandard"
          >
            <el-table-column type="index" width="50" label="序号" />
            <el-table-column prop="itemName" label="检验项目" min-width="120" />
            <el-table-column prop="standard" label="检验标准" min-width="180" />
            <el-table-column prop="type" label="检验类型" width="100">
              <template #default="scope">
                {{ getItemTypeText(scope.row.type) }}
              </template>
            </el-table-column>
            <el-table-column prop="isCritical" label="关键项" width="80">
              <template #default="scope">
                <el-tag size="small" :type="scope.row.isCritical ? 'danger' : 'info'">
                  {{ scope.row.isCritical ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="dimensionValue" label="标准尺寸" width="90">
              <template #default="scope">
                {{ scope.row.dimensionValue || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="tolerance" label="公差" width="100">
              <template #default="scope">
                <span v-if="scope.row.toleranceUpper || scope.row.toleranceLower">
                  +{{ scope.row.toleranceUpper || 0 }}/-{{
                    Math.abs(scope.row.toleranceLower) || 0
                  }}
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              min-width="100"
              fixed="right"
              align="left"
              header-align="left"
              class-name="operation-column"
              header-class-name="operation-column-header"
            >
              <template #default="scope">
                <div class="table-actions">
                  <el-button size="small" type="primary" @click="selectStandard(scope.row)">
                    <el-icon><Check /></el-icon> 选择
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </AppDialog>
      <!-- 添加检验标准对话框 -->
      <AppDialog v-model="addStandardDialogVisible" title="添加检验标准" mode="form" width="500px">
        <el-form :model="newStandardForm" label-width="100px">
          <el-form-item label="检验项目" required>
            <el-input v-model="newStandardForm.item_name" placeholder="请输入检验项目名称" />
          </el-form-item>
          <el-form-item label="检验标准" required>
            <el-input v-model="newStandardForm.standard" placeholder="请输入检验标准" />
          </el-form-item>
          <el-form-item label="检验类型" required>
            <el-select v-model="newStandardForm.type" placeholder="请选择检验类型" class="w-full">
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
          <el-button
            v-permission="'quality:templates:create'"
            type="primary"
            @click="saveNewStandard"
            :loading="savingStandard"
            >保存</el-button
          >
        </template>
      </AppDialog>
    </div>

    <!-- 导入检验记录单 (.docx) 对话框 -->
    <AppDialog
      v-model="importDialogVisible"
      title="导入检验记录单模板 (.docx)"
      mode="form"
      wide
      :close-on-click-modal="false"
    >
      <div class="docx-import-container">
        <el-tabs v-model="importActiveTab" class="import-tabs">
          <!-- 上传本地文档 Tab -->
          <el-tab-pane label="上传本地 Word 检验记录单" name="upload">
            <el-alert
              title="支持参考《3011001001自攻螺钉ST2.9x8检验记录单.docx》等规范 Word 表格，系统将自动提取零件名称、规格、物料编码、AQL 抽样方案与检验项目公差标准。"
              type="info"
              show-icon
              :closable="false"
              class="mb-base"
            />
            <el-upload
              drag
              action=""
              :auto-upload="false"
              :file-list="uploadFileList"
              :on-change="handleFileUploadChange"
              :limit="1"
              accept=".docx"
              class="docx-uploader"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">
                将 Word 检验记录单 (.docx) 拖到此处，或 <em>点击上传解析</em>
              </div>
              <template #tip>
                <div class="el-upload__tip text-center">
                  支持格式：.docx | 表格中需包含零件名称/规格/物料编码、抽样方案及检验项目明细
                </div>
              </template>
            </el-upload>
          </el-tab-pane>

          <!-- 系统预置标准文档 Tab -->
          <el-tab-pane label="系统规范预置检验单" name="presets">
            <div class="presets-intro mb-base">
              系统检测到以下标准检验记录单文档，可直接一键解析或快速导入入库：
            </div>
            <div v-loading="loadingPresets" class="preset-cards-grid">
              <el-card
                v-for="preset in presetDocxList"
                :key="preset.fileName"
                shadow="hover"
                class="preset-card"
              >
                <div class="preset-card-body">
                  <div class="preset-icon">
                    <el-icon :size="28" color="var(--color-primary)"><Document /></el-icon>
                  </div>
                  <div class="preset-info">
                    <div class="preset-title" :title="preset.fileName">{{ preset.fileName }}</div>
                    <div class="preset-meta">大小: {{ (preset.size / 1024).toFixed(1) }} KB</div>
                  </div>
                  <div class="preset-actions">
                    <el-button
                      size="small"
                      type="primary"
                      plain
                      :icon="View"
                      @click="handleParsePreset(preset)"
                      :loading="importLoading"
                    >
                      解析预览
                    </el-button>
                    <el-button
                      size="small"
                      type="success"
                      :icon="Check"
                      @click="handleDirectImportPreset(preset)"
                      :loading="importSubmitting"
                    >
                      一键导入
                    </el-button>
                  </div>
                </div>
              </el-card>
              <el-empty
                v-if="presetDocxList.length === 0 && !loadingPresets"
                description="未在系统目录检测到预置 .docx 检验单文档"
                :image-size="80"
              />
            </div>
          </el-tab-pane>
        </el-tabs>

        <!-- 解析结果预览与确认区 -->
        <div v-if="parsedTemplateData" class="parsed-preview-box mt-lg" v-loading="importLoading">
          <div class="preview-header">
            <div class="preview-title">
              <el-icon color="var(--color-success)" class="mr-xs"><CircleCheckFilled /></el-icon>
              <span>解析结果预览与确认</span>
              <el-tag size="small" type="success" class="ml-sm">已自动匹配提取</el-tag>
            </div>
            <el-button size="small" text type="danger" @click="parsedTemplateData = null"
              >清除解析结果</el-button
            >
          </div>

          <el-form label-width="110px" class="mt-base">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="模板名称" required>
                  <el-input v-model="parsedTemplateData.templateName" placeholder="模板名称" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="检验类型" required>
                  <el-select v-model="parsedTemplateData.inspectionType" class="w-full">
                    <el-option label="来料检验" value="incoming" />
                    <el-option label="过程检验" value="process" />
                    <el-option label="成品检验" value="final" />
                    <el-option label="首件检验" value="first_article" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="版本号">
                  <el-input v-model="parsedTemplateData.version" placeholder="1.0" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="16">
              <el-col :span="16">
                <el-form-item label="适用物料">
                  <div class="material-select-container">
                    <el-select
                      v-model="parsedTemplateData.materialTypes"
                      placeholder="搜索并选择关联物料..."
                      filterable
                      remote
                      multiple
                      collapse-tags
                      :max-collapse-tags="0"
                      :reserve-keyword="true"
                      :remote-method="debouncedSearchMaterials"
                      :loading="loadingMaterials"
                      @focus="handleMaterialSelectFocus"
                      class="w-full"
                    >
                      <el-option
                        v-for="item in materialsList"
                        :key="item.value"
                        :label="item.code"
                        :value="item.value"
                      >
                        <span>{{ item.code }}</span>
                        <span
                          style="margin-left: 8px; color: var(--color-text-muted); font-size: 12px"
                          >{{ item.name }}</span
                        >
                      </el-option>
                    </el-select>
                    <div
                      class="selected-materials-list"
                      v-if="
                        parsedTemplateData.materialTypes &&
                        parsedTemplateData.materialTypes.length > 0
                      "
                    >
                      <span class="selected-label"
                        >已关联物料 ({{ parsedTemplateData.materialTypes.length }})：</span
                      >
                      <el-tag
                        v-for="matId in parsedTemplateData.materialTypes"
                        :key="matId"
                        closable
                        type="primary"
                        size="default"
                        @close="removeParsedMaterial(matId)"
                        class="material-tag"
                      >
                        {{ getMaterialDisplayText(matId) }}
                      </el-tag>
                    </div>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="AQL 抽样">
                  <el-checkbox v-model="parsedTemplateData.isAql">开启 AQL 规则</el-checkbox>
                  <el-input
                    v-if="parsedTemplateData.isAql"
                    v-model="parsedTemplateData.aqlLevel"
                    placeholder="如 GB/T 2828.1 II"
                    size="small"
                    style="margin-top: 6px"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="描述/依据">
              <el-input v-model="parsedTemplateData.description" type="textarea" :rows="2" />
            </el-form-item>
          </el-form>

          <!-- 检验项目明细表 -->
          <div class="preview-items-title">
            <span>检验项目明细 (共 {{ parsedTemplateData.items?.length || 0 }} 项)</span>
          </div>
          <el-table
            :data="parsedTemplateData.items"
            border
            size="small"
            max-height="320"
            class="w-full mt-sm"
          >
            <el-table-column type="index" label="序号" width="60" align="center" />
            <el-table-column prop="item_name" label="检验项目" min-width="120">
              <template #default="scope">
                <el-input v-model="scope.row.item_name" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="standard" label="检验要求 / 标准" min-width="200">
              <template #default="scope">
                <el-input v-model="scope.row.standard" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="inspection_method" label="检测方法 / 工具" min-width="110">
              <template #default="scope">
                <el-input v-model="scope.row.inspection_method" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="110">
              <template #default="scope">
                <el-select v-model="scope.row.type" size="small">
                  <el-option label="外观检验" value="visual" />
                  <el-option label="尺寸检验" value="dimension" />
                  <el-option label="功能检验" value="function" />
                  <el-option label="性能检验" value="performance" />
                  <el-option label="其他" value="other" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="is_critical" label="关键特性" width="90" align="center">
              <template #default="scope">
                <el-switch v-model="scope.row.is_critical" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="公差尺寸 (如适用)" min-width="180">
              <template #default="scope">
                <div v-if="scope.row.type === 'dimension'" class="flex items-center gap-xs">
                  <el-input-number
                    v-model="scope.row.dimension_value"
                    placeholder="基准"
                    :step="0.01"
                    size="small"
                    :controls="false"
                    style="width: 70px"
                  />
                  <span class="text-xs">+</span>
                  <el-input-number
                    v-model="scope.row.tolerance_upper"
                    placeholder="上差"
                    :step="0.01"
                    size="small"
                    :controls="false"
                    style="width: 55px"
                  />
                  <span class="text-xs">-</span>
                  <el-input-number
                    v-model="scope.row.tolerance_lower"
                    placeholder="下差"
                    :step="0.01"
                    size="small"
                    :controls="false"
                    style="width: 55px"
                  />
                </div>
                <span v-else class="text-muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center">
              <template #default="scope">
                <el-button
                  type="danger"
                  link
                  size="small"
                  @click="parsedTemplateData.items.splice(scope.$index, 1)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button
          v-if="parsedTemplateData"
          type="primary"
          :icon="Check"
          @click="handleConfirmImport"
          :loading="importSubmitting"
        >
          确认导入并创建模板
        </el-button>
      </template>
    </AppDialog>

    <!-- AQL抽样页面 -->
    <div v-if="viewType === 'aql'">
      <AQLStandards />
    </div>
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView';
import { ref, reactive, onMounted, computed } from 'vue';
import { useListDetailNavigation } from '@/composables/useListDetailNavigation';
import AQLStandards from './AQLStandards.vue';
import {
  Search,
  Refresh,
  Plus,
  Check,
  Upload,
  UploadFilled,
  Document,
  CircleCheckFilled,
  View,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatDateTime } from '@/utils/helpers/dateUtils';
import { baseDataApi, qualityApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

import { loadUserListOptions } from '@/utils/optionLoaders';
import {
  SEARCH_CONFIG,
  mapMaterialData,
  searchMaterials as performSearchMaterials,
} from '@/utils/searchConfig';
import { handleApiError, handleSuccess, handleWarning } from '@/utils/errorHandler';
import {
  validateInspectionItems,
  normalizeBoolean,
  isGeneralTemplate as isGeneralTemplateUtil,
} from '@/utils/inspectionValidation';
import { getInspectionTypeText, getInspectionTypePrefix } from '@/constants/inspection';
// 权限store
const authStore = useAuthStore();
// 视图切换
const viewType = ref('templates');
// 搜索相关
const searchKeyword = ref('');
const typeFilter = ref('');
const statusFilter = ref('');
// 表格数据相关
const loading = ref(false);
const templateList = ref([]);
const {
  previousItem: previousViewTemplate,
  nextItem: nextViewTemplate,
  hasPrevious: hasPreviousViewTemplate,
  hasNext: hasNextViewTemplate,
  setCurrentItem: setCurrentViewTemplate,
} = useListDetailNavigation(templateList);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
// 物料列表数据
const materialsList = ref([]);
const loadingMaterials = ref(false);
const materialsMap = ref({}); // 新增：材料ID到代码的映射
// 用户映射
const userMap = ref({});
const userDataRequested = ref(false);
// 对话框相关
const dialogVisible = ref(false);
const viewDialogVisible = ref(false);
const viewLoading = ref(false);
const isEdit = ref(false);
const currentTemplate = ref(null);
const formRef = ref(null);
// 表单数据
const form = reactive({
  templateName: '',
  inspectionType: '',
  materialTypes: [],
  material_type: null, // 兼容旧版本，存储第一个物料ID
  material_name: '',
  version: '',
  description: '',
  items: [],
  isGeneral: false,
  isDefault: false,
  priority: 100,
  isAql: false,
  aqlLevel: null,
});
// AQL等级选项
const aqlLevelOptions = ref([]);
// 表单验证规则
const rules = {
  templateName: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  inspectionType: [{ required: true, message: '请选择检验类型', trigger: 'change' }],
  materialTypes: [
    {
      validator: (rule, value, callback) => {
        // 检查是否为通用模板
        if (form.isGeneral === true) {
          callback(); // 通用模板不验证物料类型
        } else if (!value || value.length === 0) {
          callback(new Error('请选择适用物料'));
        } else {
          callback();
        }
      },
      trigger: 'change',
    },
  ],
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  priority: [{ required: true, type: 'number', message: '请输入模板优先级', trigger: 'change' }],
  items: [
    {
      validator: (rule, value, callback) => {
        if (!value || value.length === 0) {
          callback(new Error('请至少添加一个检验项目'));
        } else if (value.some((item) => !item.itemName || !item.standard || !item.type)) {
          callback(new Error('请完整填写检验项目信息'));
        } else {
          // 检查尺寸类型的检验项是否填写了标准尺寸
          const dimensionItems = value.filter((item) => item.type === 'dimension');
          const invalidDimensionItems = dimensionItems.filter(
            (item) => !item.dimensionValue && item.dimensionValue !== 0
          );
          if (invalidDimensionItems.length > 0) {
            callback(new Error('尺寸类型的检验项必须填写标准尺寸值'));
          } else {
            callback();
          }
        }
      },
      trigger: 'change',
    },
  ],
};
// 检验标准选择相关
const standardSelectorVisible = ref(false);
const currentEditingIndex = ref(-1);
const reusableStandards = ref([]);
const loadingStandards = ref(false);
const standardSearch = reactive({
  keyword: '',
  type: '',
});
// 添加检验标准相关
const addStandardDialogVisible = ref(false);
const newStandardForm = reactive({
  item_name: '',
  standard: '',
  type: '',
  is_critical: false,
  dimension_value: null,
  tolerance_upper: null,
  tolerance_lower: null,
});
const savingStandard = ref(false);
const getApiErrorMessage = (error, fallback = '操作失败') => {
  return error?.response?.data?.message || error?.message || fallback;
};
const parseMaterialTypes = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (value === null || value === undefined || value === '') {
    return [];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
    } catch {
      return [];
    }
  }
  return [value].filter(Boolean);
};
const normalizeTemplateListResponse = (response) => {
  const payload = response?.data;
  const source = payload?.success === true && payload.data !== undefined ? payload.data : payload;

  if (Array.isArray(source)) {
    return { list: source, total: Number(payload?.total ?? source.length) || 0 };
  }

  if (source && typeof source === 'object') {
    const list = source.rows || source.list || source.items || source.data;
    if (Array.isArray(list)) {
      return {
        list,
        total: Number(source.count ?? source.total ?? payload?.total ?? list.length) || 0,
      };
    }
  }

  return { list: [], total: 0 };
};
const normalizeTemplateRow = (template) => {
  const materialTypes = parseMaterialTypes(template.materialTypes);
  const inspectionItems = Array.isArray(template.InspectionItems) ? template.InspectionItems : [];
  const items = Array.isArray(template.items) ? template.items : [];
  const normalizedTemplate = {
    ...template,
    materialTypes: materialTypes,
    items_count: template.items_count ?? (inspectionItems.length || items.length || 0),
  };

  return {
    ...normalizedTemplate,
    isGeneral: isGeneralTemplateUtil(normalizedTemplate),
    isDefault: normalizeBoolean(normalizedTemplate.isDefault),
    priority: Number(normalizedTemplate.priority) || 100,
  };
};
// 初始化
onMounted(() => {
  // 强制刷新数据
  fetchData();
  fetchMaterialsList(true); // 传递true以获取所有物料
  fetchUsers(); // 加载用户数据
  fetchAqlLevelOptions(); // 加载AQL等级选项
});
// 加载可用的AQL等级列表
const fetchAqlLevelOptions = async () => {
  try {
    const res = await qualityApi.getAqlLevels();
    const data = res.data || res;
    aqlLevelOptions.value = Array.isArray(data) ? data : [];
  } catch {
    aqlLevelOptions.value = ['0.65', '1.0', '1.5', '2.5', '4.0'];
  }
};
// 根据用户ID获取用户真实姓名
const getUserRealName = (userId) => {
  if (!userId) return '未知用户';

  // 如果是当前用户ID，直接从authStore获取
  if (authStore.user && authStore.user.id === userId) {
    return authStore.realName || authStore.user.username || userId;
  }

  // 从用户映射中查找
  if (userMap.value[userId]) {
    return (
      userMap.value[userId].realName ||
      userMap.value[userId].realName ||
      userMap.value[userId].name ||
      userMap.value[userId].username ||
      userId
    );
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
    const userData = await loadUserListOptions();
    // 创建用户ID到信息的映射
    userData.forEach((user) => {
      userMap.value[user.id] = user;
    });
  } catch (error) {
    if (error.response?.status !== 403) {
      handleApiError(error, '获取用户列表', { showMessage: false, logError: false });
    }
  }
};
// 获取模板列表
const fetchData = async () => {
  loading.value = true;
  try {
    const response = await qualityApi.getTemplates({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
      inspectionType: typeFilter.value,
      status: statusFilter.value,
    });
    const normalized = normalizeTemplateListResponse(response);
    const list = normalized.list.map(normalizeTemplateRow);

    // 自动将后端预加载的物料详情同步注入 materialsMap，避免冗余查询
    list.forEach((row) => {
      const details = row.materialDetails;
      if (Array.isArray(details)) {
        details.forEach((m) => {
          if (m && m.id && !materialsMap.value[m.id]) {
            materialsMap.value[m.id] = {
              name: m.name,
              code: m.code,
              specs: m.specs || m.specification || '',
            };
          }
        });
      }
    });

    templateList.value = list;
    total.value = normalized.total;
  } catch (error) {
    ElMessage.error(`获取模板列表失败: ${getApiErrorMessage(error)}`);
    templateList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};
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
        includeAll: true,
      });
      resultItems = defaultResults;
    } else {
      const searchResults = await performSearchMaterials(baseDataApi, query.trim(), {
        pageSize: SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
        includeAll: true,
      });
      resultItems = searchResults;
    }

    if (searchId === currentSearchId) {
      const mapped = mapMaterialData(resultItems);
      materialsList.value = mapped.map((item) => ({
        value: item.id,
        label: `${item.code} - ${item.name}`,
        name: item.name,
        code: item.code,
        specs: item.specification || item.specs || '',
      }));

      // 合并新物料到映射中，避免重复请求单条数据
      resultItems.forEach((item) => {
        materialsMap.value[item.id] = {
          name: item.name,
          code: item.code,
          specs: item.specs || item.specification || '',
        };
      });
    }
  } catch {
    if (searchId === currentSearchId) {
      materialsList.value = [];
    }
  } finally {
    if (searchId === currentSearchId) {
      loadingMaterials.value = false;
    }
  }
};
const debouncedSearchMaterials = debounce(
  searchProducts,
  SEARCH_CONFIG.SEARCH_DEBOUNCE_DELAY || 300
);
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
// 根据ID获取物料编码（纯同步版本，用于表格显示与映射查找）
const getMaterialCodeById = (id) => {
  if (!id) return '';
  // 1. 从映射中查找物料信息
  const material = materialsMap.value[id];
  if (material) {
    return material.code || material.name || '';
  }
  // 2. 从列表中查找
  const materialInList = materialsList.value.find((item) => item.value === id || item.id === id);
  if (materialInList) {
    return materialInList.code || materialInList.name || '';
  }
  return '';
};

// 根据多个ID获取物料编码（纯同步版本，支持传入模板对象优先提取已关联信息）
const getMultipleMaterialCodes = (ids, template = null) => {
  if (template) {
    const details = template.materialDetails;
    if (Array.isArray(details) && details.length > 0) {
      const codes = details.map((m) => m.code || m.name || m.id).filter(Boolean);
      if (codes.length > 0) return codes.join('、');
    }
    if (template.materialCode) {
      return template.materialCode;
    }
  }
  if (!ids || (Array.isArray(ids) && ids.length === 0)) return '未指定';
  const materialIds = Array.isArray(ids) ? ids : [ids];
  const codes = materialIds
    .map((id) => getMaterialCodeById(id))
    .filter((code) => code !== '' && code !== '未指定');
  if (codes.length === 0) return '未指定';
  return codes.join('、');
};

// 获取表格中显示的物料编码（纯同步纯函数，支持新旧格式与预加载数据）
const getTableMaterialCodes = (row) => {
  if (!row) return '未指定';
  // 1. 优先使用后端预加载的详细信息，避免闪烁
  const details = row.materialDetails;
  if (Array.isArray(details) && details.length > 0) {
    const codes = details.map((m) => m.code || m.name || m.id).filter(Boolean);
    if (codes.length > 0) return codes.join('、');
  }

  // 2. 兼容直接绑定的物料编码
  if (row.materialCode) {
    return row.materialCode;
  }

  // 3. 优先使用新的 materialTypes 字段
  if (row.materialTypes) {
    const materialIds = parseMaterialTypes(row.materialTypes);
    if (materialIds.length > 0) {
      const codeStr = getMultipleMaterialCodes(materialIds, row);
      if (codeStr && codeStr !== '未指定') return codeStr;
    }
  }

  // 4. 兼容旧的 materialType 字段
  if (row.materialType) {
    const code = getMaterialCodeById(row.materialType);
    if (code) return code;
  }

  return '未指定';
};
// 物料选择改变时的处理
const handleMaterialChange = (values) => {
  // 处理多选值，确保都是数组
  if (!Array.isArray(values)) {
    values = [values].filter(Boolean);
  }

  // 设置单个material_type为第一个值（兼容旧代码）
  form.materialType = values.length > 0 ? values[0] : '';

  // 获取第一个物料的名称（兼容旧代码）
  if (values.length > 0) {
    const firstMaterial = materialsList.value.find((item) => item.value === values[0]);
    if (firstMaterial) {
      form.materialName = firstMaterial.name;
    }
  } else {
    form.materialName = '';
  }
};
// 移除已选物料
const removeMaterial = (materialId) => {
  const index = form.materialTypes.indexOf(materialId);
  if (index > -1) {
    form.materialTypes.splice(index, 1);
    // 触发 handleMaterialChange 以更新兼容字段
    handleMaterialChange(form.materialTypes);
  }
};
// 获取物料显示文本（编码）
const getMaterialDisplayText = (materialId) => {
  // 优先从 materialsMap 获取
  if (materialsMap.value[materialId]) {
    return materialsMap.value[materialId].code;
  }

  // 其次从 materialsList 获取
  const material = materialsList.value.find((item) => item.value === materialId);
  if (material) {
    return material.code || material.label;
  }

  // 都没找到，返回 ID
  return materialId;
};
// 检验类型文本和前缀已从 @/constants/inspection 导入
// 获取检验项类型文本
const getItemTypeText = (type) => {
  const typeMap = {
    visual: '外观',
    dimension: '尺寸',
    function: '功能',
    performance: '性能',
    safety: '安全',
    other: '其他',
  };
  return typeMap[type] || type;
};
// 获取状态类型
const getStatusType = (status) => {
  const statusMap = {
    active: 'success',
    inactive: 'warning',
    draft: 'info',
  };
  return statusMap[status] || 'info';
};
// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    active: '启用',
    inactive: '停用',
    draft: '草稿',
  };
  return statusMap[status] || status;
};
// 判断是否是通用模板
// 使用工具函数判断通用模板（已从 @/utils/inspectionValidation 导入）
const isGeneralTemplate = isGeneralTemplateUtil;
// 获取检验项数量
const getItemsCount = (row) => {
  // 检查不同的数据结构可能性
  if (row.itemsCount !== undefined) {
    return row.itemsCount;
  }

  if (row.InspectionItems && Array.isArray(row.InspectionItems)) {
    return row.InspectionItems.length;
  }

  if (row.items && Array.isArray(row.items)) {
    return row.items.length;
  }

  // 返回默认值
  return 0;
};
// 日期格式化
const formatDate = (date) => formatDateTime(date);
// 搜索
const handleSearch = () => {
  currentPage.value = 1;
  fetchData();
};
// 重置
const handleRefresh = () => {
  searchKeyword.value = '';
  typeFilter.value = '';
  statusFilter.value = '';
  currentPage.value = 1;
  fetchData();
};
// 分页
const handleSizeChange = (val) => {
  pageSize.value = val;
  fetchData();
};
const handleCurrentChange = (val) => {
  currentPage.value = val;
  fetchData();
};
// 创建模板
// 重置表单
const resetForm = () => {
  form.templateName = '';
  form.inspectionType = '';
  form.materialTypes = [];
  form.materialType = null;
  form.materialName = '';
  form.isGeneral = false;
  form.isDefault = false;
  form.priority = 100;
  form.isAql = false;
  form.aqlLevel = null;
  form.version = '';
  form.description = '';
  form.items = [];

  // 清除表单验证状态
  if (formRef.value) {
    formRef.value.clearValidate();
  }
};
// 新建模板
const handleCreate = () => {
  isEdit.value = false;
  resetForm();
  dialogVisible.value = true;
};
// 编辑模板
const handleEdit = async (row) => {
  isEdit.value = true;
  try {
    // 先获取完整的模板数据，包含检验项目
    const response = await qualityApi.getTemplate(row.id);
    // axios 拦截器已自动解包，response.data 是模板详情数据
    const templateData = response.data;
    if (templateData) {
      // 将模板数据填充到表单
      form.id = templateData.id;
      form.templateName = templateData.templateName;
      form.inspectionType = templateData.inspectionType;
      // 使用工具函数判断是否为通用模板
      form.isGeneral = isGeneralTemplate(templateData);
      // 处理material_type和material_types，根据通用状态决定
      if (!form.isGeneral) {
        // 非通用模板，需要设置物料
        let types = parseMaterialTypes(templateData.materialTypes);

        // 如果没有 material_types 但有 material_type，则使用 material_type
        if (types.length === 0 && templateData.materialType) {
          types = [templateData.materialType];
        }

        form.materialTypes = types;
        // 确保下拉列表和映射中包含当前选中的物料
        const details = templateData.materialDetails;
        if (details && Array.isArray(details)) {
          details.forEach((material) => {
            // 同时更新 materialsMap（用于显示）
            if (!materialsMap.value[material.id]) {
              materialsMap.value[material.id] = {
                name: material.name,
                code: material.code,
                specs: material.specs,
              };
            }

            // 同时更新 materialsList（用于下拉选择）
            const exists = materialsList.value.some((item) => item.value === material.id);
            if (!exists) {
              materialsList.value.push({
                value: material.id,
                label: material.code,
                name: material.name,
                code: material.code,
                specs: material.specs,
              });
            }
          });
        }
        // 兼容旧字段
        form.materialType =
          templateData.materialType ||
          (form.materialTypes.length > 0 ? form.materialTypes[0] : null);
        form.materialName = templateData.materialName || '';
      } else {
        // 通用模板，清空物料相关字段
        form.materialTypes = [];
        form.materialType = null;
        form.materialName = '';
      }
      form.version = templateData.version;
      form.description = templateData.description;
      form.status = templateData.status;
      form.isDefault = normalizeBoolean(templateData.isDefault);
      form.priority = Number(templateData.priority) || 100;
      form.isAql = templateData.isAql === true || templateData.isAql === 1;
      form.aqlLevel = templateData.aqlLevel || null;
      // 确保检验项目数据完整
      form.items = templateData.InspectionItems
        ? templateData.InspectionItems.map((item) => ({
            item_name: item.itemName,
            standard: item.standard,
            type: item.type,
            is_critical: item.isCritical === true || item.isCritical === 1,
            dimension_value: item.dimensionValue,
            tolerance_upper: item.toleranceUpper,
            tolerance_lower: item.toleranceLower,
            id: item.id,
            reuse_item_id: item.id, // 设置为复用现有项目ID
          }))
        : [];
      dialogVisible.value = true;
    } else {
      ElMessage.error('获取模板详情失败');
    }
  } catch (error) {
    ElMessage.error(`获取模板详情失败: ${getApiErrorMessage(error)}`);
  }
};
// 查看模板
const handleView = async (row) => {
  if (viewLoading.value) return;

  viewLoading.value = true;
  try {
    const response = await qualityApi.getTemplate(row.id);
    // axios 拦截器已自动解包，response.data 是模板详情数据
    const templateData = response.data;
    if (templateData) {
      // 预加载详情中的物料至 materialsMap
      const details = templateData.materialDetails;
      if (Array.isArray(details)) {
        details.forEach((m) => {
          if (m && m.id && !materialsMap.value[m.id]) {
            materialsMap.value[m.id] = {
              name: m.name,
              code: m.code,
              specs: m.specs || m.specification || '',
            };
          }
        });
      }

      // 确保模板数据正确
      currentTemplate.value = {
        ...templateData,
        items: templateData.InspectionItems || [], // 使用InspectionItems作为items
      };
      setCurrentViewTemplate(row);
      viewDialogVisible.value = true;
    } else {
      ElMessage.error('获取模板详情失败');
    }
  } catch (error) {
    ElMessage.error(`获取模板详情失败: ${getApiErrorMessage(error)}`);
  } finally {
    viewLoading.value = false;
  }
};

const handleViewPrevious = () => {
  if (previousViewTemplate.value) handleView(previousViewTemplate.value);
};

const handleViewNext = () => {
  if (nextViewTemplate.value) handleView(nextViewTemplate.value);
};

const inspectionTemplateViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewTemplate.value,
  hasNext: hasNextViewTemplate.value,
  loading: viewLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext,
}));
// 添加检验项
const addItem = () => {
  form.items.push({
    item_name: '',
    standard: '',
    type: '',
    is_critical: false,
    dimension_value: null,
    tolerance_upper: null,
    tolerance_lower: null,
  });
};
// 移除检验项
const removeItem = (index) => {
  form.items.splice(index, 1);
};
// 提交表单
const submitForm = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        // 准备提交数据
        // 确保is_general是布尔值
        const isGeneralValue = normalizeBoolean(form.isGeneral);

        const formData = {
          templateName: form.templateName,
          inspectionType: form.inspectionType,
          isGeneral: isGeneralValue, // 明确使用布尔值true/false
          isDefault: isGeneralValue ? normalizeBoolean(form.isDefault) : false,
          priority: Number(form.priority) || 100,
          materialTypes: isGeneralValue ? [] : form.materialTypes, // 通用模板时清空物料
          material_type: isGeneralValue ? null : form.materialTypes[0] || null, // 兼容旧字段
          material_name: form.materialName,
          version: form.version,
          description: form.description,
          isAql: form.isAql === true,
          aqlLevel: form.isAql ? form.aqlLevel : null,
          items: form.items.map((item) => {
            const itemData = {
              item_name: item.itemName,
              standard: item.standard,
              type: item.type,
              is_critical: item.isCritical === true, // 确保也是布尔值
              reuse_item_id: item.reuseItemId, // 保留复用项目ID
            };

            // 只有尺寸类型才传递尺寸相关字段
            if (item.type === 'dimension') {
              itemData.dimension_value = item.dimensionValue || null;
              itemData.tolerance_upper = item.toleranceUpper || null;
              itemData.tolerance_lower = item.toleranceLower || null;
            }

            return itemData;
          }),
        };

        // 使用统一的检验项验证函数
        const validation = validateInspectionItems(form.items);
        if (!validation.valid) {
          if (validation.type === 'incomplete') {
            handleWarning(validation.message);
          } else if (validation.type === 'duplicate') {
            handleWarning(
              `${validation.message}：${validation.items.join(', ')}，请修改后再提交`,
              5000
            );
          } else if (validation.type === 'similar') {
            handleWarning(`${validation.message}：${validation.items.join(', ')}`, 6000);
          }
          return;
        }

        // 根据模式选择不同的API
        const response = isEdit.value
          ? await qualityApi.updateTemplate(form.id, formData)
          : await qualityApi.createTemplate(formData);
        // axios 拦截器已自动解包，检查响应是否存在即表示成功
        if (response.data !== undefined) {
          handleSuccess(isEdit.value ? '模板更新成功' : '模板创建成功');
          dialogVisible.value = false;
          fetchData(); // 刷新列表
        } else {
          handleWarning(isEdit.value ? '更新失败' : '创建失败');
        }
      } catch (error) {
        handleApiError(error, isEdit.value ? '更新模板' : '创建模板', { logError: false });
      }
    }
  });
};
// 处理更多操作
const handleDropdownCommand = async (command, row) => {
  try {
    if (command === 'activate' || command === 'deactivate') {
      const status = command === 'activate' ? 'active' : 'inactive';
      const response = await qualityApi.updateTemplateStatus(row.id, status);
      // 后端可能返回 data: null，检查字段是否存在即可
      if (response.data !== undefined) {
        ElMessage.success(`模板${status === 'active' ? '启用' : '停用'}成功`);
        fetchData();
      } else {
        ElMessage.error('操作失败');
      }
    } else if (command === 'copy') {
      const response = await qualityApi.copyTemplate(row.id);
      // 后端可能返回 data: null，检查字段是否存在即可
      if (response.data !== undefined) {
        ElMessage.success('模板复制成功');
        fetchData();
      } else {
        ElMessage.error('复制失败');
      }
    } else if (command === 'delete') {
      ElMessageBox.confirm('确定要删除该模板吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          const response = await qualityApi.deleteInspectionTemplate(row.id);
          // 后端可能返回 data: null，检查字段是否存在即可
          if (response.data !== undefined) {
            ElMessage.success('模板删除成功');
            fetchData();
          } else {
            ElMessage.error('删除失败');
          }
        })
        .catch(() => {});
    }
  } catch (error) {
    ElMessage.error(`操作失败: ${getApiErrorMessage(error)}`);
  }
};
// 打开检验标准选择器
const openStandardSelector = (index) => {
  currentEditingIndex.value = index;
  standardSelectorVisible.value = true;
  searchStandards();
};
// 查询可复用的检验标准
const searchStandards = async () => {
  loadingStandards.value = true;
  try {
    const params = {
      keyword: standardSearch.keyword,
      type: standardSearch.type,
    };
    const response = await qualityApi.getReusableItems(params);
    // axios 拦截器已自动解包，response.data 直接是数据
    const responseData = response.data;
    if (responseData && Array.isArray(responseData)) {
      reusableStandards.value = responseData;
    } else if (responseData && responseData.rows) {
      reusableStandards.value = responseData.rows;
    } else if (responseData && responseData.list) {
      reusableStandards.value = responseData.list;
    } else {
      reusableStandards.value = [];
    }
  } catch (error) {
    ElMessage.error(`获取检验标准失败: ${getApiErrorMessage(error)}`);
    reusableStandards.value = [];
  } finally {
    loadingStandards.value = false;
  }
};
// 重置检验标准搜索
const resetStandardSearch = () => {
  standardSearch.keyword = '';
  standardSearch.type = '';
  searchStandards();
};
// 选择检验标准
const selectStandard = (row) => {
  if (currentEditingIndex.value >= 0 && currentEditingIndex.value < form.items.length) {
    // 复制选中的标准到当前编辑的项目
    form.items[currentEditingIndex.value].item_name = row.itemName;
    form.items[currentEditingIndex.value].standard = row.standard;
    form.items[currentEditingIndex.value].type = row.type;
    form.items[currentEditingIndex.value].is_critical = row.isCritical;
    form.items[currentEditingIndex.value].dimension_value = row.dimensionValue;
    form.items[currentEditingIndex.value].tolerance_upper = row.toleranceUpper;
    form.items[currentEditingIndex.value].tolerance_lower = row.toleranceLower;
    form.items[currentEditingIndex.value].reuse_item_id = row.id; // 设置复用项目ID

    ElMessage.success('已选择标准');
    standardSelectorVisible.value = false;
  }
};
// 添加直接启用模板的方法
const handleActivate = async (row) => {
  try {
    const response = await qualityApi.updateTemplateStatus(row.id, 'active');
    // 后端可能返回 data: null，检查字段是否存在即可
    if (response.data !== undefined) {
      ElMessage.success('模板启用成功');
      fetchData();
    } else {
      ElMessage.error('操作失败');
    }
  } catch (error) {
    ElMessage.error(`启用失败: ${getApiErrorMessage(error)}`);
  }
};
// 打开添加标准对话框
const openAddStandardDialog = () => {
  // 重置表单
  newStandardForm.item_name = '';
  newStandardForm.standard = '';
  newStandardForm.type = standardSearch.type || ''; // 默认使用当前选择的类型
  newStandardForm.is_critical = false;
  newStandardForm.dimension_value = null;
  newStandardForm.tolerance_upper = null;
  newStandardForm.tolerance_lower = null;

  addStandardDialogVisible.value = true;
};
// 保存新标准
const saveNewStandard = async () => {
  // 验证表单
  if (!newStandardForm.item_name || !newStandardForm.standard || !newStandardForm.type) {
    ElMessage.warning('请完整填写检验标准信息');
    return;
  }

  // 如果检验类型是尺寸，验证尺寸相关字段
  if (newStandardForm.type === 'dimension') {
    if (!newStandardForm.dimension_value && newStandardForm.dimension_value !== 0) {
      ElMessage.warning('尺寸类型检验项必须填写标准尺寸值');
      return;
    }
  }

  savingStandard.value = true;
  try {
    // 准备提交数据
    const submitData = {
      item_name: newStandardForm.item_name,
      standard: newStandardForm.standard,
      type: newStandardForm.type,
      is_critical: newStandardForm.is_critical,
    };

    // 只有尺寸类型才传递尺寸相关字段
    if (newStandardForm.type === 'dimension') {
      submitData.dimension_value = newStandardForm.dimension_value;
      submitData.tolerance_upper = newStandardForm.tolerance_upper;
      submitData.tolerance_lower = newStandardForm.tolerance_lower;
    }

    // 直接创建新的检验项目
    const response = await qualityApi.createReusableItem(submitData);
    // 后端可能返回 null，先检查字段是否存在
    const newStandard = response.data;
    if (newStandard !== undefined && newStandard !== null) {
      // 检查是新建还是已存在
      const isExisting = response._message && response._message.includes('已存在');
      if (isExisting) {
        // 标准已存在，提示用户并高亮显示
        ElMessage.warning({
          message: `该检验标准已存在（ID: ${newStandard.id}），已为您定位`,
          duration: 3000,
        });
      } else {
        // 新建成功
        ElMessage.success('检验标准添加成功');
      }
      addStandardDialogVisible.value = false;
      // 清空筛选条件，确保标准能被看到
      standardSearch.keyword = '';
      standardSearch.type = '';
      // 刷新检验标准列表
      await searchStandards();
      // 如果当前正在编辑检验项，自动选择该标准（无论是新建还是已存在）
      if (currentEditingIndex.value >= 0 && currentEditingIndex.value < form.items.length) {
        form.items[currentEditingIndex.value].item_name = newStandard.item_name;
        form.items[currentEditingIndex.value].standard = newStandard.standard;
        form.items[currentEditingIndex.value].type = newStandard.type;
        form.items[currentEditingIndex.value].is_critical = newStandard.is_critical;
        form.items[currentEditingIndex.value].dimension_value = newStandard.dimension_value;
        form.items[currentEditingIndex.value].tolerance_upper = newStandard.tolerance_upper;
        form.items[currentEditingIndex.value].tolerance_lower = newStandard.tolerance_lower;
        form.items[currentEditingIndex.value].reuse_item_id = newStandard.id;
      }
    } else {
      ElMessage.error('添加检验标准失败');
    }
  } catch (error) {
    ElMessage.error(`添加检验标准失败: ${getApiErrorMessage(error)}`);
  } finally {
    savingStandard.value = false;
  }
};
// 处理通用模板变化
const handleGeneralChange = (val) => {
  // 确保val是布尔值
  const isGeneral = val === true;

  // 确保form.isGeneral也是布尔值
  form.isGeneral = isGeneral;

  if (isGeneral) {
    // 如果选择了通用模板，清空物料选择
    form.materialTypes = [];
    form.materialType = null;
    form.materialName = '';
  } else {
    form.isDefault = false;
    // 如果取消了通用模板选择，可以保留之前的物料选择
    // 这里不清空物料选择，允许用户重新选择
  }
};

// ----------------- 检验记录单 (.docx) 导入相关逻辑 -----------------
const importDialogVisible = ref(false);
const importActiveTab = ref('upload');
const importLoading = ref(false);
const importSubmitting = ref(false);
const presetDocxList = ref([]);
const loadingPresets = ref(false);
const parsedTemplateData = ref(null);
const uploadFileList = ref([]);

const handleOpenImportDialog = async () => {
  importDialogVisible.value = true;
  parsedTemplateData.value = null;
  uploadFileList.value = [];
  importActiveTab.value = 'upload';
  await loadPresetDocxList();
};

const loadPresetDocxList = async () => {
  loadingPresets.value = true;
  try {
    const res = await qualityApi.getPresetDocxList();
    presetDocxList.value = res.data || res || [];
  } catch (err) {
    console.error('加载预置文档列表失败:', err);
  } finally {
    loadingPresets.value = false;
  }
};

const handleFileUploadChange = async (uploadFile) => {
  if (!uploadFile || !uploadFile.raw) return;
  const isDocx = uploadFile.raw.name.endsWith('.docx') || uploadFile.raw.type.includes('word');
  if (!isDocx) {
    ElMessage.error('仅支持上传 .docx 格式的 Word 检验记录单');
    uploadFileList.value = [];
    return;
  }

  const formData = new FormData();
  formData.append('file', uploadFile.raw);

  importLoading.value = true;
  try {
    const res = await qualityApi.parseDocxTemplate(formData);
    const data = res.data || res;
    parsedTemplateData.value = {
      ...data,
      isGeneral: false,
      priority: 100,
      materialTypes: data.materialTypes || [],
    };
    if (Array.isArray(data.materialDetails)) {
      data.materialDetails.forEach((m) => {
        if (!materialsList.value.some((item) => item.value === m.id)) {
          materialsList.value.push({
            value: m.id,
            label: `${m.code} - ${m.name}`,
            code: m.code,
            name: m.name,
          });
        }
      });
    }
    ElMessage.success('Word 检验单解析成功，请在下方预览确认');
  } catch (error) {
    handleApiError(error, '解析 Word 检验单失败');
    parsedTemplateData.value = null;
  } finally {
    importLoading.value = false;
  }
};

const handleParsePreset = async (preset) => {
  importLoading.value = true;
  try {
    const res = await qualityApi.parsePresetDocx({
      fileName: preset.fileName,
    });
    const data = res.data || res;
    parsedTemplateData.value = {
      ...data,
      isGeneral: false,
      priority: 100,
      materialTypes: data.materialTypes || [],
    };
    if (Array.isArray(data.materialDetails)) {
      data.materialDetails.forEach((m) => {
        if (!materialsList.value.some((item) => item.value === m.id)) {
          materialsList.value.push({
            value: m.id,
            label: `${m.code} - ${m.name}`,
            code: m.code,
            name: m.name,
          });
        }
      });
    }
    ElMessage.success(`预置文档「${preset.fileName}」解析成功，请在下方预览确认`);
  } catch (err) {
    handleApiError(err, '解析预置文档失败');
  } finally {
    importLoading.value = false;
  }
};

const handleDirectImportPreset = async (preset) => {
  try {
    await ElMessageBox.confirm(
      `确认直接将「${preset.fileName}」导入并创建为检验模板吗？`,
      '导入确认',
      {
        type: 'info',
      }
    );
    importSubmitting.value = true;
    await qualityApi.importPresetDocx({ fileName: preset.fileName });
    ElMessage.success('检验模板导入创建成功');
    importDialogVisible.value = false;
    await fetchData();
  } catch (err) {
    if (err !== 'cancel') {
      handleApiError(err, '一键导入预置文档失败');
    }
  } finally {
    importSubmitting.value = false;
  }
};

const removeParsedMaterial = (matId) => {
  if (!parsedTemplateData.value?.materialTypes) return;
  parsedTemplateData.value.materialTypes = parsedTemplateData.value.materialTypes.filter(
    (id) => id !== matId
  );
};

const handleConfirmImport = async () => {
  if (!parsedTemplateData.value) return;
  if (!parsedTemplateData.value.templateName?.trim()) {
    ElMessage.warning('请输入模板名称');
    return;
  }
  if (!parsedTemplateData.value.items || parsedTemplateData.value.items.length === 0) {
    ElMessage.warning('模板必须包含至少一个检验项目');
    return;
  }

  importSubmitting.value = true;
  try {
    await qualityApi.importPresetDocx({
      customTemplateData: parsedTemplateData.value,
    });
    ElMessage.success('检验模板导入成功');
    importDialogVisible.value = false;
    parsedTemplateData.value = null;
    uploadFileList.value = [];
    await fetchData();
  } catch (error) {
    handleApiError(error, '创建导入模板失败');
  } finally {
    importSubmitting.value = false;
  }
};
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
  background-color: var(--color-bg-secondary, var(--color-bg-hover));
  border-radius: 4px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.selected-label {
  color: var(--color-text-secondary, var(--color-text-regular));
  font-size: 13px;
  margin-right: 4px;
  flex-shrink: 0;
}
.selected-materials-list .material-tag {
  margin: 0;
  display: inline-flex !important;
}

/* 导入对话框样式 */
.docx-uploader :deep(.el-upload-dragger) {
  padding: 24px 20px;
  background-color: var(--color-bg-secondary, var(--color-bg-base));
  border-radius: 8px;
}
.preset-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
}
.preset-card {
  border-radius: 8px;
  transition: all 0.2s ease;
}
.preset-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary);
}
.preset-card-body {
  display: flex;
  align-items: center;
  gap: 12px;
}
.preset-info {
  flex: 1;
  min-width: 0;
}
.preset-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
.parsed-preview-box {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-light);
  padding-bottom: 10px;
}
.preview-title {
  display: flex;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.preview-items-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-top: 14px;
  margin-bottom: 6px;
}
</style>
