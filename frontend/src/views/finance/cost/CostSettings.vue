<template>
  <div class="cost-settings module-page">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>成本核算设置</h2>
          <p class="subtitle">成本政策、核算口径、总账映射与月结前置配置</p>
        </div>
        <div class="header-actions">
          <el-button @click="goRoute('/finance/cost/versions')">标准成本版本</el-button>
          <el-button @click="goRoute('/finance/cost/closing')">成本关账检查</el-button>
          <el-button v-permission="'finance:cost:update'" type="primary" @click="saveSettings" :loading="saving">保存设置</el-button>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" class="governance-row">
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="inner-card status-card">
          <template #header>
            <div class="card-header">
              <span>成本政策状态</span>
              <el-tag :type="policyStatus.type" size="small">{{ policyStatus.label }}</el-tag>
            </div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="生效配置">{{ currentSettings.settingName }}</el-descriptions-item>
            <el-descriptions-item label="核算方法">{{ getMethodName(currentSettings.costingMethod) }}</el-descriptions-item>
            <el-descriptions-item label="计薪方式">{{ currentSettings.wagePaymentMethod === 'piece' ? '计件工资' : '计时工资' }}</el-descriptions-item>
            <el-descriptions-item label="最近更新">{{ currentSettings.updatedAt || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="inner-card health-card">
          <template #header>
            <div class="card-header">
              <span>配置完整性</span>
              <el-tag :type="configScoreType" size="small">{{ passedCheckCount }}/{{ configChecks.length }}</el-tag>
            </div>
          </template>
          <div class="check-list">
            <button
              v-for="item in configChecks"
              :key="item.key"
              type="button"
              class="check-item"
              @click="focusTab(item.tab)"
            >
              <el-tag :type="item.ok ? 'success' : 'warning'" size="small">{{ item.ok ? '通过' : '待处理' }}</el-tag>
              <span>{{ item.label }}</span>
            </button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="inner-card next-card">
          <template #header>下游闭环动作</template>
          <div class="next-actions">
            <el-button
              v-for="action in nextActions"
              :key="action.path"
              :type="action.type"
              plain
              @click="goRoute(action.path)"
            >
              {{ action.label }}
            </el-button>
          </div>
          <p class="closure-hint">配置变更后先发布标准成本，再核对实际成本和差异，最后执行成本关账检查。</p>
        </el-card>
      </el-col>
    </el-row>

    <el-alert
      v-if="!isRatioValid"
      type="warning"
      :closable="false"
      show-icon
      class="workflow-alert"
      :title="`兜底成本拆分比例当前合计为 ${fallbackRatioTotal.toFixed(4)}，保存前需调整为 1.0000`"
    />

    <el-tabs v-model="activeTab" class="settings-tabs module-tabs data-card" type="border-card">
      <!-- 基础配置 -->
      <el-tab-pane label="基础配置" name="config">
        <el-row :gutter="24">
          <el-col :span="16">
            <el-card shadow="never" class="inner-card">
              <template #header>核心参数配置</template>
              <el-form :model="settingsForm" label-position="top">
                <el-row :gutter="24">
                  <el-col :span="12">
                    <el-form-item label="成本核算方法">
                      <el-select v-model="settingsForm.costingMethod" placeholder="请选择" style="width: 100%">
                        <el-option label="先进先出(FIFO)" value="fifo"></el-option>
                        <el-option label="后进先出(LIFO)" value="lifo"></el-option>
                        <el-option label="加权平均" value="weighted_average"></el-option>
                        <el-option label="标准成本" value="standard"></el-option>
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="24">
                  <el-col :span="12">
                    <el-form-item label="计薪方式">
                      <el-radio-group v-model="settingsForm.wagePaymentMethod">
                        <el-radio value="hourly">计时工资</el-radio>
                        <el-radio value="piece">计件工资</el-radio>
                      </el-radio-group>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="24">
                  <el-col :span="12">
                    <el-form-item label="计时费率（元/小时）">
                      <el-input-number v-model="settingsForm.laborRate" :min="0" :precision="2" :step="1" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="计件费率（元/件）" v-if="settingsForm.wagePaymentMethod === 'piece'">
                      <el-input-number v-model="settingsForm.pieceRate" :min="0" :precision="2" :step="0.5" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="24">
                  <el-col :span="12">
                    <el-form-item label="制造费用率（旧版兜底）">
                      <el-input-number v-model="settingsForm.overheadRate" :min="0" :max="10" :precision="4" :step="0.05" style="width: 100%" />
                      <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">仅在分摊规则引擎无法计算时作为降级方案</div>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-divider content-position="left">兜底成本拆分比例</el-divider>
                <el-alert type="info" :closable="false" style="margin-bottom: 16px;" description="当产品无BOM且无标准成本时，系统将按以下比例拆分产品价格估算成本。三项之和必须等于 1.0。" />
                <el-row :gutter="24">
                  <el-col :span="8">
                    <el-form-item label="材料占比">
                      <el-input-number v-model="settingsForm.fallbackMaterialRatio" :min="0" :max="1" :precision="4" :step="0.05" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="人工占比">
                      <el-input-number v-model="settingsForm.fallbackLaborRatio" :min="0" :max="1" :precision="4" :step="0.05" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="制费占比">
                      <el-input-number v-model="settingsForm.fallbackOverheadRatio" :min="0" :max="1" :precision="4" :step="0.05" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <div v-if="Math.abs((settingsForm.fallbackMaterialRatio + settingsForm.fallbackLaborRatio + settingsForm.fallbackOverheadRatio) - 1.0) > 0.001" style="color: var(--color-danger); font-size: 13px; margin-bottom: 12px;">
                  ⚠️ 三项之和为 {{ (settingsForm.fallbackMaterialRatio + settingsForm.fallbackLaborRatio + settingsForm.fallbackOverheadRatio).toFixed(4) }}，必须等于 1.0
                </div>

                <el-form-item label="配置说明">
                  <el-input
                    v-model="settingsForm.description"
                    type="textarea"
                    :rows="4"
                    placeholder="请输入配置说明"
                  ></el-input>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>

          <el-col :span="8">
             <el-card shadow="never" class="inner-card">
              <template #header>当前生效配置</template>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="配置名称">{{ currentSettings.settingName }}</el-descriptions-item>
                <el-descriptions-item label="核算方法">{{ getMethodName(currentSettings.costingMethod) }}</el-descriptions-item>
                <el-descriptions-item label="计薪方式">{{ currentSettings.wagePaymentMethod === 'piece' ? '计件' : '计时' }}</el-descriptions-item>
                <el-descriptions-item label="更新时间">{{ currentSettings.updatedAt }}</el-descriptions-item>
                <el-descriptions-item label="状态">
                  <el-tag :type="currentSettings.isActive ? 'success' : 'info'" size="small">
                    {{ currentSettings.isActive ? '激活' : '未激活' }}
                  </el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- 总账映射 -->
      <el-tab-pane label="总账映射" name="gl_mapping">
         <el-card shadow="never" class="inner-card">
          <template #header>
            <div class="card-header">
              <span>业务单据科目映射</span>
              <el-button v-permission="'finance:cost:update'" type="primary" size="small" @click="saveMappings" :loading="savingMappings">保存映射</el-button>
            </div>
          </template>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="section-alert"
            title="这里仅维护成本业务生成总账凭证时使用的科目映射，保存后请到成本关账检查中验证凭证链路。"
          />

          <el-table :data="glMappings" border style="width: 100%">
            <el-table-column prop="mapping_key" label="业务类型代码" width="180" />
            <el-table-column prop="mapping_name" label="业务名称" width="180" />
            <el-table-column prop="account_id" label="对应会计科目">
               <template #default="scope">
                 <el-select v-model="scope.row.account_id" placeholder="选择科目" style="width: 100%" filterable>
                    <el-option
                      v-for="acc in glAccounts"
                      :key="acc.id"
                      :label="acc.account_code + ' ' + acc.account_name"
                      :value="acc.id"
                    >
                      <span style="float: left">{{ acc.account_code }}</span>
                      <span style="float: right; color: var(--color-text-muted); font-size: 13px">{{ acc.account_name }}</span>
                    </el-option>
                 </el-select>
               </template>
             </el-table-column>
             <el-table-column label="科目类型" width="120">
                <template #default="scope">
                   <el-tag v-if="getAccountType(scope.row.account_id)" size="small">
                      {{ getAccountType(scope.row.account_id) }}
                   </el-tag>
                </template>
             </el-table-column>
          </el-table>
         </el-card>
      </el-tab-pane>

      <!-- 补料配置 -->
      <el-tab-pane label="补料配置" name="supplement">
        <el-card shadow="never" class="inner-card">
          <template #header>
            <div class="card-header">
              <span>补料原因配置</span>
              <el-button v-permission="'finance:cost:create'" type="primary" size="small" @click="openReasonDialog()">新增原因</el-button>
            </div>
          </template>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="section-alert"
            title="补料原因在生产/库存侧发生，这里只维护是否进入成本核算，避免形成两套原因主数据。"
          />

          <el-table :data="supplementReasons" border style="width: 100%" v-loading="reasonsLoading">
            <el-table-column prop="reason_name" label="原因名称" min-width="150" />
            <el-table-column prop="reason_code" label="原因代码" width="150" />
            <el-table-column label="计入成本" width="120">
              <template #default="scope">
                <el-switch
                  v-model="scope.row.is_included_in_cost"
                  :disabled="!canUpdateCost"
                  @change="handleReasonSwitchChange(scope.row)"
                />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
               <template #default="scope">
                 <el-tag :type="scope.row.is_active ? 'success' : 'info'">{{ scope.row.is_active ? '启用' : '禁用' }}</el-tag>
               </template>
            </el-table-column>
            <el-table-column label="操作" min-width="180" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button size="small" @click="openReasonDialog(scope.row)" v-permission="'finance:cost:update'">编辑</el-button>
                <el-button v-permission="'finance:cost:delete'" size="small" type="danger" plain @click="handleDeleteReason(scope.row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 新增/编辑原因弹窗 -->
        <el-dialog v-model="reasonDialogVisible" :title="editingReasonId ? '编辑原因' : '新增原因'" width="500px">
          <el-form :model="reasonForm" label-width="100px">
            <el-form-item label="原因名称" required>
              <el-input v-model="reasonForm.reason_name" placeholder="如：生产损耗" />
            </el-form-item>
            <el-form-item label="原因代码" required>
              <el-input v-model="reasonForm.reason_code" placeholder="如：LOSS" />
            </el-form-item>
             <el-form-item label="计入成本">
              <el-switch v-model="reasonForm.is_included_in_cost" />
            </el-form-item>
            <el-form-item label="状态">
              <el-switch v-model="reasonForm.is_active" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="reasonDialogVisible = false">取消</el-button>
            <el-button
              v-permission="editingReasonId ? 'finance:cost:update' : 'finance:cost:create'"
              type="primary"
              @click="saveReason"
              :loading="savingReason"
            >保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- 核算方法说明 -->
      <el-tab-pane label="核算方法说明" name="guide">
        <div class="method-description">
          <el-collapse v-model="activeMethod">
            <el-collapse-item title="先进先出(FIFO)" name="fifo">
              <p>先进先出法假设先购入的存货先发出，期末存货成本按最近购入存货的成本计算。</p>
              <p><strong>优点：</strong>期末存货成本接近市价，符合实物流转顺序。</p>
              <p><strong>缺点：</strong>在物价上涨时，会高估利润。</p>
            </el-collapse-item>
            <el-collapse-item title="后进先出(LIFO)" name="lifo">
              <p>后进先出法假设后购入的存货先发出，期末存货成本按最早购入存货的成本计算。</p>
              <p><strong>优点：</strong>在物价上涨时，能更好地匹配当期收入和成本。</p>
              <p><strong>缺点：</strong>期末存货成本可能偏离市价。</p>
            </el-collapse-item>
            <el-collapse-item title="加权平均" name="weighted_average">
              <p>加权平均法以期初存货成本加上本期购入存货成本之和，除以期初存货数量加上本期购入存货数量之和，计算加权平均单位成本。</p>
              <p><strong>优点：</strong>计算简单，成本较为平稳。</p>
              <p><strong>缺点：</strong>需要在每次购入后重新计算平均成本。</p>
            </el-collapse-item>
            <el-collapse-item title="标准成本" name="standard">
              <p>标准成本法是预先制定的成本标准，用于成本控制和差异分析。</p>
              <p><strong>优点：</strong>便于成本控制和绩效评价。</p>
              <p><strong>缺点：</strong>需要定期更新标准成本，维护成本较高。</p>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-tab-pane>

      <!-- 物料标准成本 -->
      <el-tab-pane label="物料标准成本" name="material_standard">
        <el-card shadow="never" class="inner-card">
          <template #header>
            <div class="card-header">
              <span>物料标准成本管理（期初冻结）</span>
              <div>
                <el-button type="primary" size="small" @click="openFreezeDialog" v-permission="'finance:cost:execute'">批量冻结</el-button>
                <el-button size="small" @click="fetchMaterialStandardCosts">刷新</el-button>
              </div>
            </div>
          </template>
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            class="section-alert"
            title="期初冻结和单项调整会影响后续出库、标准成本和差异分析。周期性发布建议优先使用“标准成本版本”。"
          />

          <!-- 搜索区域 -->
          <el-form :inline="true" class="search-form" style="margin-bottom: 16px;">
            <el-form-item label="物料编码">
              <el-input  v-model="stdCostSearch.material_code" placeholder="请输入" size="small" clearable />
            </el-form-item>
            <el-form-item label="物料名称">
              <el-input  v-model="stdCostSearch.material_name" placeholder="请输入" size="small" clearable />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="stdCostSearch.is_active" placeholder="全部" size="small" clearable>
                <el-option label="有效" value="1" />
                <el-option label="失效" value="0" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" size="small" @click="fetchMaterialStandardCosts">搜索</el-button>
            </el-form-item>
          </el-form>

          <!-- 表格 -->
          <el-table :data="materialStandardCosts" border style="width: 100%" v-loading="stdCostLoading">
            <el-table-column prop="material_code" label="物料编码" width="120" />
            <el-table-column prop="material_name" label="物料名称" min-width="180" />
            <el-table-column prop="specs" label="规格" width="220" />
            <el-table-column prop="current_cost_price" label="当前采购成本" width="120">
              <template #default="scope">
                {{ scope.row.current_cost_price ? Number(scope.row.current_cost_price).toFixed(2) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="standard_price" label="标准成本" width="120">
              <template #default="scope">
                <span style="color: var(--color-primary); font-weight: 600;">{{ scope.row.standard_price ? Number(scope.row.standard_price).toFixed(2) : '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="effective_date" label="生效日期" width="110" />
            <el-table-column prop="expiry_date" label="失效日期" width="110">
              <template #default="scope">{{ scope.row.expiry_date || '长期有效' }}</template>
            </el-table-column>
            <el-table-column prop="is_active" label="状态" width="80">
              <template #default="scope">
                <el-tag :type="scope.row.is_active ? 'success' : 'info'" size="small">
                  {{ scope.row.is_active ? '有效' : '失效' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="100" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button v-permission="'finance:cost:update'" size="small" link type="primary" @click="openEditStdCostDialog(scope.row)">调整</el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- 分页 -->
          <el-pagination
            v-model:current-page="stdCostPage"
            v-model:page-size="stdCostPageSize"
            :total="stdCostTotal"
            layout="total, sizes, prev, pager, next"
            :page-sizes="[10, 20, 50]"
            style="margin-top: 16px; justify-content: flex-end;"
            @size-change="fetchMaterialStandardCosts"
            @current-change="fetchMaterialStandardCosts"
          />
        </el-card>

        <!-- 批量冻结对话框 -->
        <el-dialog v-model="freezeDialogVisible" title="批量冻结物料标准成本" width="500px">
          <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
            批量冻结将读取所有物料的当前采购成本（cost_price），作为标准成本写入系统。原有效的标准成本将自动失效。
          </el-alert>
          <el-form :model="freezeForm" label-width="100px">
            <el-form-item label="生效日期" required>
              <el-date-picker v-model="freezeForm.effective_date" type="date" placeholder="选择生效日期" value-format="YYYY-MM-DD" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="失效日期">
              <el-date-picker v-model="freezeForm.expiry_date" type="date" placeholder="不填则长期有效" value-format="YYYY-MM-DD" style="width: 100%;" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="freezeDialogVisible = false">取消</el-button>
            <el-button v-permission="'finance:cost:execute'" type="primary" @click="handleFreeze" :loading="freezing">确认冻结</el-button>
          </template>
        </el-dialog>

        <!-- 调整标准成本对话框 -->
        <el-dialog v-model="editStdCostDialogVisible" title="调整标准成本" width="450px">
          <el-form :model="editStdCostForm" label-width="100px">
            <el-form-item label="物料">
              <span>{{ editStdCostForm.material_code }} - {{ editStdCostForm.material_name }}</span>
            </el-form-item>
            <el-form-item label="标准成本" required>
              <el-input-number v-model="editStdCostForm.standard_price" :min="0" :precision="2" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="生效日期">
              <el-date-picker v-model="editStdCostForm.effective_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="失效日期">
              <el-date-picker v-model="editStdCostForm.expiry_date" type="date" placeholder="不填则长期有效" value-format="YYYY-MM-DD" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="状态">
              <el-switch v-model="editStdCostForm.is_active" active-text="有效" inactive-text="失效" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="editStdCostDialogVisible = false">取消</el-button>
            <el-button v-permission="'finance:cost:update'" type="primary" @click="handleUpdateStdCost" :loading="updatingStdCost">保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <!-- 制费分摊规则 -->
      <el-tab-pane label="制费分摊规则" name="overhead_allocation">
        <el-card shadow="never" class="inner-card">
          <template #header>
            <div class="card-header">
              <span>制造费用分摊规则配置</span>
              <div>
                <el-button v-permission="'finance:cost:create'" type="primary" size="small" @click="openAllocationRuleDialog()">新增规则</el-button>
                <el-button size="small" @click="fetchAllocationRules">刷新</el-button>
              </div>
            </div>
          </template>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="section-alert"
            title="制造费用规则优先于基础配置中的旧版兜底费率；无规则命中时才会回退到兜底逻辑。"
          />

          <el-table :data="allocationRules" border style="width: 100%" v-loading="allocationRulesLoading">
            <el-table-column prop="priority" label="优先级" width="80" />
            <el-table-column prop="name" label="规则名称" min-width="150" />
            <el-table-column label="指定产品" min-width="150">
              <template #default="scope">
                <span v-if="scope.row.product_id" style="color:var(--color-primary);">{{ scope.row.product_name || scope.row.product_code || `ID:${scope.row.product_id}` }}</span>
                <span v-else style="color:var(--color-text-secondary);">全部产品</span>
              </template>
            </el-table-column>
            <el-table-column prop="product_category" label="指定类别" width="120">
              <template #default="scope">
                {{ scope.row.product_category || '全部' }}
              </template>
            </el-table-column>
            <el-table-column prop="cost_center_name" label="成本中心" width="120">
              <template #default="scope">
                {{ scope.row.cost_center_name || '全厂' }}
              </template>
            </el-table-column>
            <el-table-column label="分摊基础" width="120">
              <template #default="scope">
                {{ getAllocationBaseLabel(scope.row.allocation_base) }}
              </template>
            </el-table-column>
            <el-table-column prop="rate" label="费率" width="100">
              <template #default="scope">
                {{ Number(scope.row.rate).toFixed(4) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="scope">
                <el-tag :type="scope.row.is_active ? 'success' : 'info'" size="small">
                  {{ scope.row.is_active ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="160" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button size="small" link type="primary" @click="openAllocationRuleDialog(scope.row)" v-permission="'finance:cost:update'">编辑</el-button>
                <el-button v-permission="'finance:cost:delete'" size="small" link type="danger" @click="handleDeleteAllocationRule(scope.row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 新增/编辑分摊规则弹窗 -->
        <el-dialog v-model="allocationRuleDialogVisible" :title="editingAllocationRuleId ? '编辑规则' : '新增规则'" width="600px">
          <el-form :model="allocationRuleForm" label-width="120px">
            <el-form-item label="规则名称" required>
              <el-input v-model="allocationRuleForm.name" placeholder="如：线束类产品模具费" />
            </el-form-item>
            <el-form-item label="指定产品">
              <el-select
                v-model="allocationRuleForm.product_id"
                filterable
                remote
                clearable
                reserve-keyword
                placeholder="精确匹配到单个产品（最高优先级）"
                :remote-method="searchMaterials"
                :loading="materialsSearching"
                style="width: 100%"
              >
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="item.code + ' - ' + item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="产品类别">
              <el-input v-model="allocationRuleForm.product_category" placeholder="指定产品类别（优先级次之）" />
            </el-form-item>
            <el-form-item label="成本中心">
              <el-select v-model="allocationRuleForm.cost_center_id" clearable placeholder="全厂通用" style="width: 100%;">
                <el-option v-for="cc in costCenterOptions" :key="cc.id" :label="cc.name" :value="cc.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="分摊基础" required>
              <el-select v-model="allocationRuleForm.allocation_base" placeholder="选择基准" style="width: 100%;">
                <el-option v-for="base in allocationBases" :key="base.value" :label="base.label" :value="base.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="费率" required>
              <el-input-number v-model="allocationRuleForm.rate" :precision="4" :step="0.1" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="匹配优先级">
              <el-input-number v-model="allocationRuleForm.priority" :min="0" :max="999" style="width: 100%;" />
              <div class="form-hint">数字越大优先级越高（精确指定了产品的规则固定拥有最高匹配权）</div>
            </el-form-item>
            <el-form-item label="生效日期" required>
              <el-date-picker v-model="allocationRuleForm.effective_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="状态">
              <el-switch v-model="allocationRuleForm.is_active" active-text="启用" inactive-text="禁用" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="allocationRuleDialogVisible = false">取消</el-button>
            <el-button
              v-permission="editingAllocationRuleId ? 'finance:cost:update' : 'finance:cost:create'"
              type="primary"
              @click="saveAllocationRule"
              :loading="savingAllocationRule"
            >保存</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { formatLocalDate } from '@/utils/format';
import { computed, ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { baseDataApi, financeApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { parseListData, parseResponseData } from '@/utils/responseParser';

const authStore = useAuthStore();
const router = useRouter();
const canCreateCost = computed(() => authStore.hasPermission('finance:cost:create'));
const canUpdateCost = computed(() => authStore.hasPermission('finance:cost:update'));

const saving = ref(false);
const activeTab = ref('config');
const activeMethod = ref(['weighted_average']);

// 设置表单
const settingsForm = reactive({
  costingMethod: 'weighted_average',
  wagePaymentMethod: 'hourly',
  laborRate: 50,
  pieceRate: 0,
  overheadRate: 0.5,
  fallbackMaterialRatio: 0.6,
  fallbackLaborRatio: 0.25,
  fallbackOverheadRatio: 0.15,
  description: ''
});

// 当前设置
const currentSettings = reactive({
  settingName: '默认成本配置',
  costingMethod: 'weighted_average',
  wagePaymentMethod: 'hourly',
  updatedAt: '2025-01-01 00:00:00',
  isActive: true
});

const fallbackRatioTotal = computed(() => (
  Number(settingsForm.fallbackMaterialRatio || 0)
  + Number(settingsForm.fallbackLaborRatio || 0)
  + Number(settingsForm.fallbackOverheadRatio || 0)
));

const isRatioValid = computed(() => Math.abs(fallbackRatioTotal.value - 1) <= 0.001);

const activeAllocationRuleCount = computed(() => allocationRules.value.filter(item => item.is_active).length);
const activeSupplementReasonCount = computed(() => supplementReasons.value.filter(item => item.is_active).length);
const mappedGLCount = computed(() => glMappings.value.filter(item => item.account_id).length);
const activeMaterialStandardCount = computed(() => materialStandardCosts.value.filter(item => item.is_active).length);

const configChecks = computed(() => [
  {
    key: 'base',
    label: '基础费率与兜底比例可保存',
    ok: Boolean(settingsForm.costingMethod && settingsForm.laborRate >= 0 && isRatioValid.value),
    tab: 'config'
  },
  {
    key: 'gl',
    label: '成本凭证科目已映射',
    ok: glMappings.value.length > 0 && mappedGLCount.value === glMappings.value.length,
    tab: 'gl_mapping'
  },
  {
    key: 'supplement',
    label: '补料成本口径已维护',
    ok: activeSupplementReasonCount.value > 0,
    tab: 'supplement'
  },
  {
    key: 'material',
    label: '物料标准成本可追溯',
    ok: activeMaterialStandardCount.value > 0 || stdCostTotal.value > 0,
    tab: 'material_standard'
  },
  {
    key: 'overhead',
    label: '制造费用分摊规则已启用',
    ok: activeAllocationRuleCount.value > 0,
    tab: 'overhead_allocation'
  }
]);

const passedCheckCount = computed(() => configChecks.value.filter(item => item.ok).length);
const configScoreType = computed(() => {
  if (passedCheckCount.value === configChecks.value.length) return 'success';
  if (passedCheckCount.value >= 3) return 'warning';
  return 'danger';
});
const policyStatus = computed(() => {
  if (!currentSettings.isActive) return { label: '未激活', type: 'info' };
  if (!isRatioValid.value) return { label: '待校验', type: 'warning' };
  if (passedCheckCount.value === configChecks.value.length) return { label: '可闭环', type: 'success' };
  return { label: '待完善', type: 'warning' };
});

const nextActions = [
  { label: '发布标准成本', path: '/finance/cost/versions', type: 'primary' },
  { label: '核对实际成本', path: '/finance/cost/actual', type: 'success' },
  { label: '分析成本差异', path: '/finance/cost/variance', type: 'warning' },
  { label: '执行关账检查', path: '/finance/cost/closing', type: 'danger' }
];

const focusTab = (tabName) => {
  activeTab.value = tabName;
};

const goRoute = (path) => {
  router.push(path);
};

// 获取方法名称
const getMethodName = (method) => {
  const methodMap = {
    'fifo': '先进先出(FIFO)',
    'lifo': '后进先出(LIFO)',
    'weighted_average': '加权平均',
    'standard': '标准成本'
  };
  return methodMap[method] || method;
};

// 加载设置
const loadSettings = async () => {
  try {
    const response = await financeApi.cost.getSettings();
    const data = parseResponseData(response);

    // 更新表单数据
    settingsForm.costingMethod = data.costingMethod || 'weighted_average';
    settingsForm.wagePaymentMethod = data.wagePaymentMethod || 'hourly';
    settingsForm.laborRate = data.laborRate ?? 50;
    settingsForm.pieceRate = data.pieceRate ?? 0;
    settingsForm.overheadRate = data.overheadRate ?? 0.5;
    settingsForm.fallbackMaterialRatio = data.fallbackMaterialRatio ?? 0.6;
    settingsForm.fallbackLaborRatio = data.fallbackLaborRatio ?? 0.25;
    settingsForm.fallbackOverheadRatio = data.fallbackOverheadRatio ?? 0.15;
    settingsForm.description = data.description || '';

    // 更新当前设置显示
    currentSettings.settingName = data.settingName || '默认成本配置';
    currentSettings.costingMethod = data.costingMethod || 'weighted_average';
    currentSettings.wagePaymentMethod = data.wagePaymentMethod || 'hourly';
    currentSettings.updatedAt = data.updatedAt || '';
    currentSettings.isActive = data.isActive !== false;
  } catch (error) {
    console.error('加载设置失败:', error);
    ElMessage.error('加载设置失败');
  }
};

// 保存设置
const saveSettings = async () => {
  if (!isRatioValid.value) {
    ElMessage.warning('兜底成本拆分比例合计必须等于 1.0000');
    return;
  }

  saving.value = true;
  try {
    await financeApi.cost.saveSettings({
      wagePaymentMethod: settingsForm.wagePaymentMethod,
      costingMethod: settingsForm.costingMethod,
      laborRate: settingsForm.laborRate,
      pieceRate: settingsForm.pieceRate,
      overheadRate: settingsForm.overheadRate,
      fallbackMaterialRatio: settingsForm.fallbackMaterialRatio,
      fallbackLaborRatio: settingsForm.fallbackLaborRatio,
      fallbackOverheadRatio: settingsForm.fallbackOverheadRatio,
      description: settingsForm.description
    });

    // 更新当前设置显示
    currentSettings.costingMethod = settingsForm.costingMethod;
    currentSettings.wagePaymentMethod = settingsForm.wagePaymentMethod;
    currentSettings.updatedAt = new Date().toLocaleString('zh-CN');

    ElMessage.success('设置保存成功');
  } catch (error) {
    console.error('保存设置失败:', error);
    ElMessage.error('保存设置失败');
  } finally {
    saving.value = false;
  }
};

// ==================== 补料原因逻辑 ====================
const supplementReasons = ref([]);
const reasonsLoading = ref(false);
const reasonDialogVisible = ref(false);
const savingReason = ref(false);
const editingReasonId = ref(null);
const reasonForm = ref({
  reason_name: '',
  reason_code: '',
  is_included_in_cost: true,
  is_active: true
});

// 获取补料原因
const fetchSupplementReasons = async () => {
  reasonsLoading.value = true;
  try {
    const res = await financeApi.cost.getSupplementReasons();
    supplementReasons.value = parseListData(res, { enableLog: false });
  } catch (error) {
    console.error('获取补料原因失败', error);
  } finally {
    reasonsLoading.value = false;
  }
};

// 打开弹窗
const openReasonDialog = (row = null) => {
  if (row) {
    editingReasonId.value = row.id;
    reasonForm.value = { ...row };
  } else {
    editingReasonId.value = null;
    reasonForm.value = {
      reason_name: '',
      reason_code: '',
      is_included_in_cost: true,
      is_active: true
    };
  }
  reasonDialogVisible.value = true;
};

// 保存原因
const saveReason = async () => {
  if (!reasonForm.value.reason_name || !reasonForm.value.reason_code) {
    ElMessage.warning('请填写名称和代码');
    return;
  }

  if (editingReasonId.value && !canUpdateCost.value) {
    ElMessage.warning('缺少成本更新权限');
    return;
  }

  if (!editingReasonId.value && !canCreateCost.value) {
    ElMessage.warning('缺少成本新增权限');
    return;
  }

  savingReason.value = true;
  try {
    const payload = { ...reasonForm.value, id: editingReasonId.value };
    if (editingReasonId.value) {
      await financeApi.cost.saveSupplementReason(payload);
    } else {
      await financeApi.cost.saveSupplementReason(payload);
    }
    ElMessage.success('保存成功');
    reasonDialogVisible.value = false;
    fetchSupplementReasons();
  } catch {
    ElMessage.error('保存失败');
  } finally {
    savingReason.value = false;
  }
};

// 删除原因
const handleDeleteReason = async (row) => {
  try {
    await financeApi.cost.deleteSupplementReason(row.id);
    ElMessage.success('删除成功');
    fetchSupplementReasons();
  } catch {
    ElMessage.error('删除失败');
  }
};

// 列表开关直接更新
const handleReasonSwitchChange = async (row) => {
  if (!canUpdateCost.value) {
    ElMessage.warning('缺少成本更新权限');
    fetchSupplementReasons();
    return;
  }

  try {
     await financeApi.cost.saveSupplementReason(row);
  } catch {
    ElMessage.error('更新失败');
    fetchSupplementReasons(); // 还原
  }
};

// ==================== GL Integration Logic ====================
const glAccounts = ref([]);
const glMappings = ref([]);
const savingMappings = ref(false);

const fetchGLAccounts = async () => {
  try {
     const res = await financeApi.cost.getGLAccounts();
     glAccounts.value = parseResponseData(res, []);
  } catch(e) { console.error('获取科目失败', e); }
};

const fetchGLMappings = async () => {
  try {
     const res = await financeApi.cost.getGLMappings();
     glMappings.value = parseResponseData(res, []);
  } catch(e) { console.error('获取映射失败', e); }
};

const saveMappings = async () => {
  savingMappings.value = true;
  try {
     await financeApi.cost.saveGLMappings(glMappings.value);
     ElMessage.success('映射保存成功');
  } catch {
     ElMessage.error('映射保存失败');
  } finally {
     savingMappings.value = false;
  }
};

const getAccountType = (id) => {
   const acc = glAccounts.value.find(a => a.id === id);
   return acc ? acc.type : '';
};

// ==================== 物料标准成本逻辑 ====================
const materialStandardCosts = ref([]);
const stdCostLoading = ref(false);
const stdCostPage = ref(1);
const stdCostPageSize = ref(20);
const stdCostTotal = ref(0);
const stdCostSearch = reactive({
  material_code: '',
  material_name: '',
  is_active: ''
});

// 冻结对话框
const freezeDialogVisible = ref(false);
const freezing = ref(false);
const freezeForm = reactive({
  effective_date: '',
  expiry_date: null
});

// 编辑对话框
const editStdCostDialogVisible = ref(false);
const updatingStdCost = ref(false);
const editStdCostForm = reactive({
  id: null,
  material_code: '',
  material_name: '',
  standard_price: 0,
  effective_date: '',
  expiry_date: null,
  is_active: true
});

// 获取物料标准成本列表
const fetchMaterialStandardCosts = async () => {
  stdCostLoading.value = true;
  try {
    const params = {
      page: stdCostPage.value,
      pageSize: stdCostPageSize.value,
      ...stdCostSearch
    };
    const res = await financeApi.cost.getMaterialStandardCosts(params);
    const data = parseResponseData(res);
    materialStandardCosts.value = data.list || [];
    stdCostTotal.value = Number(data.total) || 0;
  } catch (error) {
    console.error('获取物料标准成本失败:', error);
    ElMessage.error('获取物料标准成本失败');
  } finally {
    stdCostLoading.value = false;
  }
};

// 打开冻结对话框
const openFreezeDialog = () => {
  // 默认使用今天作为生效日期
  const today = formatLocalDate(new Date());
  freezeForm.effective_date = today;
  freezeForm.expiry_date = null;
  freezeDialogVisible.value = true;
};

// 执行批量冻结
const handleFreeze = async () => {
  if (!freezeForm.effective_date) {
    ElMessage.warning('请选择生效日期');
    return;
  }
  freezing.value = true;
  try {
    const res = await financeApi.cost.freezeMaterialStandardCosts({
      effective_date: freezeForm.effective_date,
      expiry_date: freezeForm.expiry_date,
      source: 'cost_price'
    });
    const data = parseResponseData(res);
    ElMessage.success(`冻结完成！成功: ${data.frozenCount} 条，跳过: ${data.skippedCount} 条`);
    freezeDialogVisible.value = false;
    fetchMaterialStandardCosts();
  } catch (error) {
    console.error('批量冻结失败:', error);
    ElMessage.error('批量冻结失败: ' + (error.response?.data?.message || error.message));
  } finally {
    freezing.value = false;
  }
};

// 打开编辑对话框
const openEditStdCostDialog = (row) => {
  editStdCostForm.id = row.id;
  editStdCostForm.material_code = row.material_code;
  editStdCostForm.material_name = row.material_name;
  editStdCostForm.standard_price = row.standard_price;
  editStdCostForm.effective_date = row.effective_date;
  editStdCostForm.expiry_date = row.expiry_date;
  editStdCostForm.is_active = row.is_active === 1 || row.is_active === true;
  editStdCostDialogVisible.value = true;
};

// 更新标准成本
const handleUpdateStdCost = async () => {
  if (!editStdCostForm.standard_price || editStdCostForm.standard_price <= 0) {
    ElMessage.warning('标准成本必须大于0');
    return;
  }
  updatingStdCost.value = true;
  try {
    await financeApi.cost.updateMaterialStandardCost(editStdCostForm.id, {
      standard_price: editStdCostForm.standard_price,
      effective_date: editStdCostForm.effective_date,
      expiry_date: editStdCostForm.expiry_date,
      is_active: editStdCostForm.is_active
    });
    ElMessage.success('更新成功');
    editStdCostDialogVisible.value = false;
    fetchMaterialStandardCosts();
  } catch (error) {
    console.error('更新标准成本失败:', error);
    ElMessage.error('更新失败');
  } finally {
    updatingStdCost.value = false;
  }
};

// ==================== 制造费用分摊规则逻辑 ====================
const allocationRules = ref([]);
const allocationRulesLoading = ref(false);
const allocationRuleDialogVisible = ref(false);
const savingAllocationRule = ref(false);
const editingAllocationRuleId = ref(null);
const allocationBases = ref([]);
const materialOptions = ref([]);
const materialsSearching = ref(false);
const costCenterOptions = ref([]);

const allocationRuleForm = ref({
  name: '',
  allocation_base: 'labor_cost',
  rate: 0,
  cost_center_id: null,
  product_id: null,
  product_category: '',
  priority: 0,
  effective_date: formatLocalDate(new Date()),
  expiry_date: null,
  is_active: true
});

const getAllocationBaseLabel = (val) => {
  const hit = allocationBases.value.find(b => b.value === val);
  return hit ? hit.label : val;
};

const fetchAllocationBases = async () => {
  try {
    const res = await financeApi.cost.getAllocationBases();
    allocationBases.value = parseResponseData(res, []);
  } catch(e) { console.error('获取分摊基础失败', e); }
};

const fetchAllocationRules = async () => {
  allocationRulesLoading.value = true;
  try {
    const res = await financeApi.cost.getAllocationRules();
    allocationRules.value = parseResponseData(res, []);
  } catch (error) {
    console.error('获取分摊规则失败', error);
  } finally {
    allocationRulesLoading.value = false;
  }
};

const searchMaterials = async (query) => {
  if (query) {
    materialsSearching.value = true;
    try {
      const res = await baseDataApi.getMaterials({ keyword: query, pageSize: 20 });
      materialOptions.value = parseListData(res, { enableLog: false });
    } catch (e) {
      console.error('搜索物料失败', e);
    } finally {
      materialsSearching.value = false;
    }
  } else {
    materialOptions.value = [];
  }
};

const fetchCostCenters = async () => {
  try {
    const res = await financeApi.cost.getCostCenters();
    costCenterOptions.value = parseListData(res, { enableLog: false });
  } catch(e) { console.error('获取成本中心失败', e); }
};

const openAllocationRuleDialog = (row = null) => {
  if (row) {
    editingAllocationRuleId.value = row.id;
    // 如果编辑时有 productId，先把它塞入 options 中便于正确显示名字
    if (row.product_id && !materialOptions.value.find(m => m.id === row.product_id)) {
       materialOptions.value.push({
         id: row.product_id,
         code: row.product_code || '',
         name: row.product_name || `ID:${row.product_id}`
       });
    }
    allocationRuleForm.value = {
      ...row,
      rate: Number(row.rate),
      is_active: row.is_active === 1 || row.is_active === true
    };
  } else {
    editingAllocationRuleId.value = null;
    allocationRuleForm.value = {
      name: '',
      allocation_base: 'quantity',
      rate: 0,
      cost_center_id: null,
      product_id: null,
      product_category: '',
      priority: 0,
      effective_date: formatLocalDate(new Date()),
      expiry_date: null,
      is_active: true
    };
  }
  allocationRuleDialogVisible.value = true;
};

const saveAllocationRule = async () => {
  if (!allocationRuleForm.value.name || !allocationRuleForm.value.allocation_base || allocationRuleForm.value.rate === undefined) {
    ElMessage.warning('请填写完整的必填项');
    return;
  }
  savingAllocationRule.value = true;
  try {
    const payload = { ...allocationRuleForm.value };
    // 抹平空字符串为空值
    if (!payload.product_id) payload.product_id = null;
    if (!payload.cost_center_id) payload.cost_center_id = null;
    if (!payload.product_category) payload.product_category = null;

    if (editingAllocationRuleId.value) {
      await financeApi.cost.saveAllocationRule({ ...payload, id: editingAllocationRuleId.value });
    } else {
      await financeApi.cost.saveAllocationRule(payload);
    }
    ElMessage.success('保存规则成功');
    allocationRuleDialogVisible.value = false;
    fetchAllocationRules();
  } catch {
    ElMessage.error('保存失败');
  } finally {
    savingAllocationRule.value = false;
  }
};

const handleDeleteAllocationRule = async (row) => {
  try {
    await financeApi.cost.deleteAllocationRule(row.id);
    ElMessage.success('删除成功');
    fetchAllocationRules();
  } catch {
    ElMessage.error('删除失败');
  }
};

// 页面加载时初始化
onMounted(() => {
  fetchAllocationBases();
  fetchAllocationRules();
  fetchCostCenters();
  loadSettings();
  fetchSupplementReasons();
  fetchGLAccounts();
  fetchGLMappings();
  fetchMaterialStandardCosts();
});
</script>

<style scoped>
.cost-settings {
  padding: 0;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.governance-row {
  margin-bottom: 16px;
}

.governance-row .inner-card {
  height: 100%;
}

.status-card :deep(.el-descriptions__label) {
  width: 96px;
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid var(--color-border-lighter);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  text-align: left;
}

.check-item:last-child {
  border-bottom: 0;
}

.next-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.next-actions .el-button {
  margin-left: 0;
}

.closure-hint {
  margin: 12px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.workflow-alert,
.section-alert {
  margin-bottom: 16px;
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.method-description {
  padding: 10px;
}

.method-description p {
  margin: 8px 0;
  line-height: 1.6;
  color: var(--color-text-regular);
}

.method-description strong {
  color: var(--color-text-primary);
}

@media (max-width: 900px) {
  .header-actions {
    justify-content: flex-start;
  }

  .governance-row .el-col {
    margin-bottom: 12px;
  }

  .next-actions {
    grid-template-columns: 1fr;
  }
}
</style>
