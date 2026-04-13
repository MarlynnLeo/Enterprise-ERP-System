<template>
  <div class="unified-traceability">
    <el-card class="page-header">
      <h2>🔄 批次追溯查询</h2>
      <p>统一追溯查询：支持原材料批次追溯和成品销售追溯,自动识别物料类型并展示完整追溯链路</p>
    </el-card>

    <el-card class="search-card">
      <!-- 统一搜索区域 -->
      <div class="search-section">
        <el-form :model="searchForm" inline>
          <el-form-item label="物料/产品编码">
            <el-input
              v-model="searchForm.materialCode"
              placeholder="请输入物料编码或产品编码"

              clearable
            />
          </el-form-item>
          <el-form-item label="批次号">
            <el-input
              v-model="searchForm.batchNumber"
              placeholder="请输入批次号"

              clearable
            />
          </el-form-item>
          <el-form-item label="追溯方向">
            <el-select v-model="searchForm.direction">
              <el-option label="正向追溯" value="forward" />
              <el-option label="反向追溯" value="backward" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch" :loading="loading">
              <el-icon><Search /></el-icon> 查询追溯
            </el-button>
            <el-button @click="resetSearch">
              <el-icon><Refresh /></el-icon> 重置
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 快速测试 -->
        <div class="test-cases" style="margin-top: 10px;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="color: #606266; font-size: 12px;">快速测试: </span>
            <el-button
              size="small"
              type="success"
              plain
              @click="loadLatestBatches"
              style="margin-left: 8px;"
            >
              <el-icon><Refresh /></el-icon> 获取最新批次
            </el-button>
          </div>
          <el-button
            v-for="testCase in testCases"
            :key="testCase.id"
            size="small"
            type="primary"
            plain
            @click="loadTestCase(testCase)"
            style="margin-right: 8px; margin-bottom: 4px;"
          >
            {{ testCase.label }}
          </el-button>
        </div>
      </div>
                  v-model="productForm.batchNumber"
                  placeholder="如：PROD_BATCH_001"

                  clearable
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="searchProductTrace" :loading="loading.product">
                  <el-icon><Search /></el-icon> 查询追溯
                </el-button>
                <el-button @click="resetProductForm">
                  <el-icon><Refresh /></el-icon> 重置
                </el-button>
              </el-form-item>
            </el-form>

            <!-- 成品快速测试案例 -->
            <div class="test-cases" style="margin-top: 10px;">
              <span style="color: #606266; font-size: 12px;">快速测试: </span>
              <el-button
                v-for="testCase in productTestCases"
                :key="testCase.id"
                size="small"
                type="success"
                plain
                @click="loadProductTestCase(testCase)"
                style="margin-right: 8px; margin-bottom: 4px;"
              >
                {{ testCase.label }}
              </el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- 客户反向追溯 -->
        <el-tab-pane label="🔙 客户反向追溯" name="customer">
          <div class="search-section">
            <el-form :model="customerForm" inline>
              <el-form-item label="客户">
                <el-select v-model="customerForm.customerId" placeholder="选择客户">
                  <el-option
                    v-for="customer in customerList"
                    :key="customer.id"
                    :label="customer.name"
                    :value="customer.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="产品编码（可选）">
                <el-input
                  v-model="customerForm.productCode"
                  placeholder="如：105202004"

                  clearable
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="searchCustomerTrace" :loading="loading.customer">
                  <el-icon><Search /></el-icon> 查询追溯
                </el-button>
                <el-button @click="resetCustomerForm">
                  <el-icon><Refresh /></el-icon> 重置
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- 原材料到客户追溯 -->
        <el-tab-pane label="📦 原料到客户追溯" name="material-to-customer">
          <div class="search-section">
            <el-form :model="materialToCustomerForm" inline>
              <el-form-item label="原材料编码">
                <el-input
                  v-model="materialToCustomerForm.materialCode"
                  placeholder="如：999905003"

                  clearable
                />
              </el-form-item>
              <el-form-item label="原材料批次号">
                <el-input
                  v-model="materialToCustomerForm.batchNumber"
                  placeholder="如：PUR-20250908-01000"

                  clearable
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="searchMaterialToCustomerTrace" :loading="loading.materialToCustomer">
                  <el-icon><Search /></el-icon> 查询追溯
                </el-button>
                <el-button @click="resetMaterialToCustomerForm">
                  <el-icon><Refresh /></el-icon> 重置
                </el-button>
              </el-form-item>
            </el-form>

            <!-- 原材料到客户快速测试案例 -->
            <div class="test-cases" style="margin-top: 10px;">
              <span style="color: #606266; font-size: 12px;">快速测试: </span>
              <el-button
                v-for="testCase in materialToCustomerTestCases"
                :key="testCase.id"
                size="small"
                type="warning"
                plain
                @click="loadMaterialToCustomerTestCase(testCase)"
                style="margin-right: 8px; margin-bottom: 4px;"
              >
                {{ testCase.label }}
              </el-button>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 追溯结果展示 -->
    <div v-if="traceabilityData" class="traceability-results">
      <!-- 原材料批次追溯结果 -->
      <div v-if="activeTab === 'material' && traceabilityData.material">
        <!-- 批次基本信息 -->
        <el-card v-if="traceabilityData.material.batch_info" class="batch-info-card" style="margin-top: 20px;">
          <template #header>
            <span>原材料批次基本信息</span>
          </template>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="收货单号">
              <el-tag type="info">{{ traceabilityData.material.batch_info.receipt_no || '-' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="物料编码">
              {{ traceabilityData.material.batch_info.material_code || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="物料名称">
              {{ traceabilityData.material.batch_info.material_name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="规格型号">
              {{ traceabilityData.material.batch_info.specification || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="批次号">
              <el-tag type="primary">{{ traceabilityData.material.batch_info.batch_number || '-' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusType(traceabilityData.material.batch_info.status)">
                {{ getStatusText(traceabilityData.material.batch_info.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="收货数量">
              {{ traceabilityData.material.batch_info.original_quantity || 0 }} {{ traceabilityData.material.batch_info.unit || '' }}
            </el-descriptions-item>
            <el-descriptions-item label="合格数量">
              <span :class="getQuantityClass(traceabilityData.material.batch_info.current_quantity)">
                {{ traceabilityData.material.batch_info.current_quantity || 0 }} {{ traceabilityData.material.batch_info.unit || '' }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="单价">
              ¥{{ traceabilityData.material.batch_info.price || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="供应商">
              {{ traceabilityData.material.batch_info.supplier_name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="入库时间">
              {{ formatDateTime(traceabilityData.material.batch_info.receipt_date) }}
            </el-descriptions-item>
            <el-descriptions-item label="存放位置">
              {{ traceabilityData.material.batch_info.location || '-' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="traceabilityData.material.is_legacy_import" label="数据来源">
              <el-tag type="warning" size="small">库存导入</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 追溯链路步骤 -->
        <el-card v-if="traceabilityData.material.steps && traceabilityData.material.steps.length > 0" style="margin-top: 20px;">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>追溯链路步骤</span>
              <el-tag v-if="traceabilityData.material.is_legacy_import" type="warning" size="small">
                老库存导入 - 部分步骤无记录
              </el-tag>
            </div>
          </template>
          <el-timeline>
            <el-timeline-item
              v-for="step in getFilteredSteps(traceabilityData.material.steps, traceabilityData.material.is_legacy_import)"
              :key="step.id"
              :type="getStepStatusType(step.status)"
              :timestamp="formatDateTime(step.start_time || step.created_at)"
              placement="top"
            >
              <el-card shadow="hover">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: bold;">{{ step.step_name }}</span>
                  <div>
                    <el-tag v-if="step.is_legacy_import" type="warning" size="small" style="margin-right: 4px;">
                      库存导入
                    </el-tag>
                    <el-tag :type="getStepStatusType(step.status)" size="small">
                      {{ getStepStatusText(step.status) }}
                    </el-tag>
                  </div>
                </div>
                <div v-if="step.reference_no" style="margin-top: 8px; color: #606266; font-size: 13px;">
                  单据号: {{ step.reference_no }}
                </div>
                <div v-if="step.quantity" style="margin-top: 4px; color: #606266; font-size: 13px;">
                  数量: {{ step.quantity }} {{ step.unit || '' }}
                </div>
                <div v-if="step.operator" style="margin-top: 4px; color: #606266; font-size: 13px;">
                  操作人: {{ step.operator }}
                </div>
                <div v-if="step.location" style="margin-top: 4px; color: #606266; font-size: 13px;">
                  位置: {{ step.location }}
                </div>
                <div v-if="step.remarks" style="margin-top: 4px; color: #909399; font-size: 12px;">
                  备注: {{ step.remarks }}
                </div>
                <!-- 对于老库存导入且pending状态的步骤，显示提示 -->
                <div v-if="traceabilityData.material.is_legacy_import && step.status === 'pending' && isEarlyStep(step.step_type)"
                     style="margin-top: 8px; padding: 8px; background: #fdf6ec; border-radius: 4px; color: #e6a23c; font-size: 12px;">
                  <i class="el-icon-warning"></i> 此步骤无记录（老库存导入数据）
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </div>

      <!-- 成品销售追溯结果 -->
      <div v-if="activeTab === 'product' && traceabilityData.product">
        <el-card style="margin-top: 20px;">
          <template #header>
            <h3>🔍 成品完整追溯链路</h3>
          </template>

          <!-- 成品批次信息 -->
          <el-descriptions title="成品批次信息" :column="3" border style="margin-bottom: 20px;">
            <el-descriptions-item label="产品编码">{{ traceabilityData.product.product_batch.material_code }}</el-descriptions-item>
            <el-descriptions-item label="产品名称">{{ traceabilityData.product.product_batch.material_name }}</el-descriptions-item>
            <el-descriptions-item label="规格型号">{{ traceabilityData.product.product_batch.specification || '-' }}</el-descriptions-item>
            <el-descriptions-item label="批次号">{{ traceabilityData.product.product_batch.batch_number }}</el-descriptions-item>
            <el-descriptions-item label="生产数量">{{ traceabilityData.product.product_batch.original_quantity }}</el-descriptions-item>
            <el-descriptions-item label="剩余数量">{{ traceabilityData.product.product_batch.available_quantity }}</el-descriptions-item>
            <el-descriptions-item label="生产日期">{{ formatDateTime(traceabilityData.product.product_batch.production_date) }}</el-descriptions-item>
            <el-descriptions-item v-if="traceabilityData.product.is_legacy_import" label="数据来源">
              <el-tag type="warning" size="small">库存导入</el-tag>
            </el-descriptions-item>
          </el-descriptions>

          <!-- BOM零部件列表 -->
          <div v-if="traceabilityData.product.bom_components && traceabilityData.product.bom_components.length > 0">
            <h4>📋 BOM零部件清单 (共{{ traceabilityData.product.bom_components.length }}项)</h4>
            <el-table :data="traceabilityData.product.bom_components" stripe style="margin-bottom: 20px;" max-height="400">
              <el-table-column type="index" label="序号" width="60" />
              <el-table-column prop="material_code" label="零部件编码" width="150" />
              <el-table-column prop="material_name" label="零部件名称" min-width="180" />
              <el-table-column prop="specification" label="规格型号" width="150" />
              <el-table-column prop="quantity" label="用量" width="100" align="right" />
              <el-table-column prop="unit" label="单位" width="80" />
            </el-table>
          </div>

          <!-- 使用的原材料 -->
          <h4>📦 使用的原材料批次</h4>
          <el-table :data="traceabilityData.product.raw_materials" stripe style="margin-bottom: 20px;">
            <el-table-column prop="raw_material_code" label="原材料编码" />
            <el-table-column prop="raw_material_name" label="原材料名称" />
            <el-table-column prop="specification" label="规格型号" />
            <el-table-column prop="raw_material_batch" label="批次号" />
            <el-table-column prop="supplier_name" label="供应商" />
            <el-table-column prop="consumed_quantity" label="消耗数量" align="right" />
            <el-table-column label="入库日期">
              <template #default="{ row }">
                {{ formatDateTime(row.receipt_date) }}
              </template>
            </el-table-column>
          </el-table>

          <!-- 销售记录 -->
          <h4>🚚 销售给客户记录</h4>
          <el-table :data="traceabilityData.product.sales_records" stripe>
            <el-table-column prop="outbound_no" label="出库单号" />
            <el-table-column prop="customer_name" label="客户名称" />
            <el-table-column prop="allocated_quantity" label="销售数量" align="right" />
            <el-table-column label="交付日期">
              <template #default="{ row }">
                {{ formatDateTime(row.delivery_date) }}
              </template>
            </el-table-column>
          </el-table>

          <!-- 追溯汇总 -->
          <el-row :gutter="20" style="margin-top: 20px;">
            <el-col :span="4">
              <el-statistic title="BOM零部件数" :value="traceabilityData.product.traceability_summary.bom_components_count || 0" />
            </el-col>
            <el-col :span="5">
              <el-statistic title="原材料批次数" :value="traceabilityData.product.traceability_summary.raw_material_batches" />
            </el-col>
            <el-col :span="5">
              <el-statistic title="总销售数量" :value="traceabilityData.product.traceability_summary.total_sales" />
            </el-col>
            <el-col :span="5">
              <el-statistic title="客户数量" :value="traceabilityData.product.traceability_summary.customers_count" />
            </el-col>
            <el-col :span="5">
              <el-statistic title="剩余库存" :value="traceabilityData.product.traceability_summary.remaining_quantity" />
            </el-col>
          </el-row>
        </el-card>
      </div>

      <!-- 客户反向追溯结果 -->
      <div v-if="activeTab === 'customer' && traceabilityData.customer">
        <el-card style="margin-top: 20px;">
          <template #header>
            <h3>🔙 客户使用的原材料追溯</h3>
          </template>

          <div v-for="record in traceabilityData.customer" :key="record.outbound_no" style="margin-bottom: 20px;">
            <el-card>
              <template #header>
                <div style="display: flex; justify-content: space-between;">
                  <span>出库单：{{ record.outbound_no }}</span>
                  <span>交付日期：{{ record.delivery_date }}</span>
                </div>
              </template>

              <el-descriptions :column="2" border style="margin-bottom: 15px;">
                <el-descriptions-item label="客户名称">{{ record.customer_name }}</el-descriptions-item>
                <el-descriptions-item label="产品">{{ record.product_name }} ({{ record.product_code }})</el-descriptions-item>
                <el-descriptions-item label="成品批次">{{ record.product_batch_number }}</el-descriptions-item>
                <el-descriptions-item label="销售数量">{{ record.allocated_quantity }}</el-descriptions-item>
              </el-descriptions>

              <h5>使用的原材料：</h5>
              <el-table :data="record.raw_materials" size="small" stripe>
                <el-table-column prop="material_code" label="原材料编码" />
                <el-table-column prop="material_name" label="原材料名称" />
                <el-table-column prop="batch_number" label="批次号" />
                <el-table-column prop="supplier_name" label="供应商" />
                <el-table-column prop="consumed_quantity" label="消耗数量" align="right" />
                <el-table-column prop="receipt_date" label="入库日期" />
              </el-table>
            </el-card>
          </div>
        </el-card>
      </div>

      <!-- 原材料到客户追溯结果 -->
      <div v-if="activeTab === 'material-to-customer' && traceabilityData.materialToCustomer">
        <el-card style="margin-top: 20px;">
          <template #header>
            <h3>📦 原材料到客户的完整链路</h3>
          </template>

          <!-- 追溯汇总 -->
          <el-row :gutter="20" style="margin-bottom: 20px;">
            <el-col :span="8">
              <el-statistic title="生产的成品种类" :value="traceabilityData.materialToCustomer.summary.products_produced" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="销售给客户数" :value="traceabilityData.materialToCustomer.summary.total_customers" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="总销售数量" :value="traceabilityData.materialToCustomer.summary.total_sales" />
            </el-col>
          </el-row>

          <!-- 追溯链路 -->
          <div v-for="(chain, index) in traceabilityData.materialToCustomer.trace_chain" :key="index" style="margin-bottom: 20px;">
            <el-card>
              <template #header>
                <div style="display: flex; justify-content: space-between;">
                  <span>成品：{{ chain.product.name }} ({{ chain.product.code }})</span>
                  <span>批次：{{ chain.product.batch }}</span>
                </div>
              </template>

              <el-descriptions :column="3" border style="margin-bottom: 15px;">
                <el-descriptions-item label="原材料">{{ chain.raw_material.name }} ({{ chain.raw_material.code }})</el-descriptions-item>
                <el-descriptions-item label="原材料批次">{{ chain.raw_material.batch }}</el-descriptions-item>
                <el-descriptions-item label="供应商">{{ chain.raw_material.supplier }}</el-descriptions-item>
                <el-descriptions-item label="消耗数量">{{ chain.raw_material.consumed_quantity }}</el-descriptions-item>
                <el-descriptions-item label="生产日期">{{ chain.product.production_date }}</el-descriptions-item>
                <el-descriptions-item label="销售次数">{{ chain.sales.length }}</el-descriptions-item>
              </el-descriptions>

              <h5 v-if="chain.sales.length > 0">销售记录：</h5>
              <el-table v-if="chain.sales.length > 0" :data="chain.sales" size="small" stripe>
                <el-table-column prop="customer_name" label="客户名称" />
                <el-table-column prop="outbound_no" label="出库单号" />
                <el-table-column prop="quantity" label="销售数量" align="right" />
                <el-table-column prop="delivery_date" label="交付日期" />
              </el-table>
              <div v-else style="text-align: center; color: #909399; padding: 20px;">
                该成品批次暂未销售
              </div>
            </el-card>
          </div>
        </el-card>

        <!-- 入库信息 -->
        <el-card class="inbound-info-card" style="margin-top: 20px;" v-if="traceabilityData.material.inbound_info">
          <template #header>
            <span>入库信息</span>
          </template>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="入库日期">
              {{ formatDateTime(traceabilityData.material.inbound_info.receipt_date) }}
            </el-descriptions-item>
            <el-descriptions-item label="单位成本">
              ¥{{ traceabilityData.material.inbound_info.unit_cost }}
            </el-descriptions-item>
            <el-descriptions-item label="总成本">
              ¥{{ traceabilityData.material.inbound_info.total_cost }}
            </el-descriptions-item>
            <el-descriptions-item label="供应商">
              {{ traceabilityData.material.inbound_info.supplier_name }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 流转历史 -->
        <el-card class="transaction-history-card" style="margin-top: 20px;" v-if="traceabilityData.material.transaction_history">
          <template #header>
            <span>流转历史 (FIFO顺序)</span>
          </template>
          <el-table
            :data="traceabilityData.material.transaction_history"
            style="width: 100%"
            :default-sort="{ prop: 'transaction_date', order: 'descending' }"
          >
            <el-table-column prop="transaction_date" label="时间" width="180">
              <template #default="scope">
                {{ formatDateTime(scope.row.transaction_date) }}
              </template>
            </el-table-column>
            <el-table-column prop="transaction_type" label="类型" width="100">
              <template #default="scope">
                <el-tag :type="getTransactionType(scope.row.transaction_type)">
                  {{ getTransactionText(scope.row.transaction_type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="120">
              <template #default="scope">
                <span :class="getQuantityChangeClass(scope.row.transaction_type)">
                  {{ scope.row.transaction_type === 'out' ? '-' : '+' }}{{ scope.row.quantity }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="before_quantity" label="变更前" width="100" />
            <el-table-column prop="after_quantity" label="变更后" width="100" />
            <el-table-column prop="reference_no" label="关联单号" width="150" />
            <el-table-column prop="operator" label="操作员" width="100" />
            <el-table-column prop="remarks" label="备注" min-width="200" />
          </el-table>
        </el-card>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="!loading.material && !loading.product && !loading.customer && !loading.materialToCustomer"
              description="请选择追溯方式并输入查询条件" />

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container" v-loading="loading" element-loading-text="正在查询追溯数据...">
      <div style="height: 200px;"></div>
    </div>
  </div>
</template>

<script>

import apiAdapter from '@/utils/apiAdapter';

import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download } from '@element-plus/icons-vue'

export default {
  name: 'FullChainTraceability',
  components: {
    Search,
    Refresh,
    Download
  },
  setup() {
    const activeTab = ref('material')
    const hasData = ref(false)
    const traceabilityData = ref(null)
    const customerList = ref([])

    const loading = reactive({
      material: false,
      product: false,
      customer: false,
      materialToCustomer: false
    })

    const searchForm = reactive({
      materialCode: '',
      batchNumber: ''
    })

    const productForm = reactive({
      productCode: '',
      batchNumber: ''
    })

    const customerForm = reactive({
      customerId: '',
      productCode: ''
    })

    const materialToCustomerForm = reactive({
      materialCode: '',
      batchNumber: ''
    })

    // 测试用例数据（从API动态加载，不再硬编码）
    const testCases = ref([])
    const productTestCases = ref([])
    const materialToCustomerTestCases = ref([])

    // 原材料批次查询
    const handleSearch = async () => {
      if (!searchForm.materialCode || !searchForm.batchNumber) {
        ElMessage.warning('请输入物料编码和批次号')
        return
      }

      loading.material = true

      try {
        // 使用新的追溯链路API查询
        const response = await fetch(`/api/traceability-chain/search/batch?product_code=${searchForm.materialCode}&batch_number=${searchForm.batchNumber}`)
        const result = await response.json()

        if (result.success && result.data) {
          // 转换数据格式以适配前端显示
          const chainData = result.data
          const steps = chainData.steps || []
          const isLegacyImport = chainData.is_legacy_import || false
          const inventoryInfo = chainData.inventory_info || {}

          // 从采购收货步骤中获取实际的业务数据
          const purchaseStep = steps.find(s => s.step_type === 'PURCHASE_RECEIVE' && s.status === 'completed')
          const purchaseData = purchaseStep?.business_data?.[0] || {}

          // 对于老库存导入，从inventory_info获取数量信息
          const originalQty = isLegacyImport
            ? (inventoryInfo.original_quantity || chainData.quantity || 0)
            : (purchaseData.received_quantity || purchaseStep?.quantity || 0)
          const currentQty = isLegacyImport
            ? (inventoryInfo.current_quantity || chainData.quantity || 0)
            : (purchaseData.qualified_quantity || purchaseData.received_quantity || purchaseStep?.quantity || 0)

          traceabilityData.value = {
            material: {
              batch_info: {
                material_code: purchaseData.material_code || chainData.product_code,
                material_name: purchaseData.material_name || chainData.product_name,
                batch_number: purchaseData.batch_number || chainData.batch_number,
                status: chainData.status,
                original_quantity: originalQty,
                current_quantity: currentQty,
                unit: purchaseData.unit || inventoryInfo.unit || purchaseStep?.unit || '-',
                supplier_name: purchaseData.supplier_name || (isLegacyImport ? '库存导入' : '-'),
                receipt_date: purchaseData.created_at || inventoryInfo.receipt_date || chainData.created_at,
                warehouse_name: '-',
                location: purchaseStep?.location || '-',
                specification: purchaseData.specification || inventoryInfo.specification || chainData.product_specs || '-',
                price: purchaseData.price || 0,
                receipt_no: purchaseData.receipt_no || purchaseStep?.reference_no || (isLegacyImport ? '库存导入' : '-')
              },
              steps: steps,
              chain: chainData,
              is_legacy_import: isLegacyImport
            }
          }
          hasData.value = true
          ElMessage.success('追溯数据查询成功')
        } else {
          ElMessage.error(result.message || '未找到该批次的追溯信息')
          traceabilityData.value = null
          hasData.value = false
        }
      } catch (error) {
        console.error('查询追溯数据失败:', error)
        ElMessage.error('查询追溯数据失败')
        traceabilityData.value = null
        hasData.value = false
      } finally {
        loading.material = false
      }
    }

    // 成品销售追溯查询
    const searchProductTrace = async () => {
      if (!productForm.productCode || !productForm.batchNumber) {
        ElMessage.warning('请输入产品编码和批次号')
        return
      }

      loading.product = true
      try {
        // 使用追溯链路API查询成品
        const response = await fetch(`/api/traceability-chain/search/batch?product_code=${productForm.productCode}&batch_number=${productForm.batchNumber}`)
        const result = await response.json()

        if (result.success && result.data) {
          const chainData = result.data
          const steps = chainData.steps || []
          const bomComponents = chainData.bom_components || []
          const isLegacyImport = chainData.is_legacy_import || false
          const inventoryInfo = chainData.inventory_info || {}

          // 从追溯链路步骤中提取原材料和销售信息
          const rawMaterials = []
          const salesRecords = []

          // 首先从步骤的materials中获取实际使用的原材料
          steps.forEach(step => {
            if (step.step_type === 'PURCHASE_IN' || step.step_type === 'RAW_MATERIAL' || step.step_type === 'MATERIAL_ISSUE') {
              const materials = step.materials || []
              materials.forEach(m => {
                rawMaterials.push({
                  raw_material_code: m.material_code,
                  raw_material_name: m.material_name,
                  raw_material_batch: m.batch_number,
                  supplier_name: m.supplier_name || '-',
                  consumed_quantity: m.quantity,
                  receipt_date: m.created_at,
                  specification: m.specification || '-'
                })
              })
            }
            if (step.step_type === 'SALES_OUT' && step.status === 'completed') {
              salesRecords.push({
                outbound_no: step.reference_no,
                customer_name: step.remarks || '-',
                allocated_quantity: step.quantity,
                delivery_date: step.end_time || step.start_time
              })
            }
          })

          // 如果没有从步骤中找到原材料信息，则使用BOM零部件信息
          if (rawMaterials.length === 0 && bomComponents.length > 0) {
            bomComponents.forEach(comp => {
              rawMaterials.push({
                raw_material_code: comp.material_code,
                raw_material_name: comp.material_name,
                raw_material_batch: isLegacyImport ? '库存导入' : '-',
                supplier_name: '-',
                consumed_quantity: comp.quantity,
                receipt_date: chainData.created_at,
                specification: comp.specification || '-'
              })
            })
          }

          // 计算数量信息
          const originalQty = isLegacyImport
            ? (inventoryInfo.original_quantity || chainData.quantity || 1)
            : (chainData.quantity || 0)
          const availableQty = isLegacyImport
            ? (inventoryInfo.current_quantity || chainData.quantity || 1)
            : (chainData.quantity || 0)

          traceabilityData.value = {
            product: {
              product_batch: {
                material_code: chainData.product_code,
                material_name: chainData.product_name,
                batch_number: chainData.batch_number,
                specification: chainData.product_specs || '-',
                original_quantity: originalQty,
                available_quantity: availableQty,
                production_date: chainData.production_date || chainData.created_at
              },
              raw_materials: rawMaterials,
              bom_components: bomComponents,
              sales_records: salesRecords,
              traceability_summary: {
                raw_material_batches: rawMaterials.length,
                bom_components_count: bomComponents.length,
                total_sales: salesRecords.reduce((sum, r) => sum + (Number(r.allocated_quantity) || 0), 0),
                customers_count: new Set(salesRecords.map(r => r.customer_name)).size,
                remaining_quantity: availableQty
              },
              chain: chainData,
              is_legacy_import: isLegacyImport
            }
          }
          hasData.value = true
          ElMessage.success('成品追溯查询成功')
        } else {
          traceabilityData.value = null
          hasData.value = false
          ElMessage.error(result.message || '未找到该批次的追溯信息')
        }
      } catch (error) {
        console.error('成品追溯查询失败:', error)
        ElMessage.error('查询失败')
        traceabilityData.value = null
        hasData.value = false
      } finally {
        loading.product = false
      }
    }

    // 客户反向追溯查询
    const searchCustomerTrace = async () => {
      if (!customerForm.customerId) {
        ElMessage.warning('请选择客户')
        return
      }

      loading.customer = true
      try {
        const url = `/api/batch-traceability/customer/${customerForm.customerId}/materials${customerForm.productCode ? `?productCode=${customerForm.productCode}` : ''}`
        const response = await fetch(url)
        const result = await response.json()

        if (result.success) {
          traceabilityData.value = { customer: result.data }
          hasData.value = true
          ElMessage.success('客户追溯查询成功')
        } else {
          traceabilityData.value = null
          hasData.value = false
          ElMessage.error(result.message || '查询失败')
        }
      } catch (error) {
        console.error('客户追溯查询失败:', error)
        ElMessage.error('查询失败')
        traceabilityData.value = null
        hasData.value = false
      } finally {
        loading.customer = false
      }
    }

    // 原材料到客户追溯查询
    const searchMaterialToCustomerTrace = async () => {
      if (!materialToCustomerForm.materialCode || !materialToCustomerForm.batchNumber) {
        ElMessage.warning('请输入原材料编码和批次号')
        return
      }

      loading.materialToCustomer = true
      try {
        const response = await fetch(`/api/batch-traceability/material-to-customer/${materialToCustomerForm.materialCode}/${materialToCustomerForm.batchNumber}`)
        const result = await response.json()

        if (result.success) {
          traceabilityData.value = { materialToCustomer: result.data }
          hasData.value = true
          ElMessage.success('原材料到客户追溯查询成功')
        } else {
          traceabilityData.value = null
          hasData.value = false
          ElMessage.error(result.message || '查询失败')
        }
      } catch (error) {
        console.error('原材料到客户追溯查询失败:', error)
        ElMessage.error('查询失败')
        traceabilityData.value = null
        hasData.value = false
      } finally {
        loading.materialToCustomer = false
      }
    }

    // 重置搜索
    const resetSearch = () => {
      searchForm.materialCode = ''
      searchForm.batchNumber = ''
      traceabilityData.value = null
      hasData.value = false
    }

    // 标签页切换
    const handleTabClick = (tab) => {
      traceabilityData.value = null
      hasData.value = false
      if (tab.name === 'customer' && customerList.value.length === 0) {
        fetchCustomerList()
      }
    }

    // 获取客户列表
    const fetchCustomerList = async () => {
      try {
        const response = await fetch('/api/batch-traceability/customers')
        const result = await response.json()
        if (result.success) {
          customerList.value = result.data
        }
      } catch (error) {
        console.error('获取客户列表失败:', error)
      }
    }

    // 加载测试案例
    const loadTestCase = (testCase) => {
      searchForm.materialCode = testCase.materialCode
      searchForm.batchNumber = testCase.batchNumber
      handleSearch()
    }

    const loadProductTestCase = (testCase) => {
      productForm.productCode = testCase.productCode
      productForm.batchNumber = testCase.batchNumber
      searchProductTrace()
    }

    const loadMaterialToCustomerTestCase = (testCase) => {
      materialToCustomerForm.materialCode = testCase.materialCode
      materialToCustomerForm.batchNumber = testCase.batchNumber
      searchMaterialToCustomerTrace()
    }

    // 重置表单
    const resetProductForm = () => {
      productForm.productCode = ''
      productForm.batchNumber = ''
      traceabilityData.value = null
      hasData.value = false
    }

    const resetCustomerForm = () => {
      customerForm.customerId = ''
      customerForm.productCode = ''
      traceabilityData.value = null
      hasData.value = false
    }

    const resetMaterialToCustomerForm = () => {
      materialToCustomerForm.materialCode = ''
      materialToCustomerForm.batchNumber = ''
      traceabilityData.value = null
      hasData.value = false
    }

    // 获取最新批次号
    const loadLatestBatches = async () => {
      try {
        const response = await fetch('/api/traceability-chain/latest-batches')
        const result = await response.json()

        if (result.success) {
          const latestBatches = []
          let id = 100 // 起始ID，避免与固定案例冲突

          // 处理检验批次
          result.data.inspection_batches.forEach((batch) => {
            if (batch.material_code && batch.batch_no) {
              latestBatches.push({
                id: id++,
                label: `${batch.material_name || batch.material_code}-检验批次`,
                materialCode: batch.material_code,
                batchNumber: batch.batch_no
              })
            }
          })

          // 处理库存批次
          result.data.inventory_batches.forEach((batch) => {
            if (batch.material_code && batch.batch_number) {
              latestBatches.push({
                id: id++,
                label: `${batch.material_name || batch.material_code}-库存批次`,
                materialCode: batch.material_code,
                batchNumber: batch.batch_number
              })
            }
          })

          // 更新测试案例（全部从API获取，最多显示14个）
          testCases.value = latestBatches.slice(0, 14)

          // 同时更新原材料到客户的测试案例
          materialToCustomerTestCases.value = latestBatches.slice(0, 6)

          ElMessage.success(`已获取 ${latestBatches.length} 个最新批次号`)
        } else {
          ElMessage.error('获取最新批次失败: ' + result.message)
        }
      } catch (error) {
        console.error('获取最新批次失败:', error)
        ElMessage.error('获取最新批次失败')
      }
    }

    // 刷新数据
    const refreshData = () => {
      if (hasData.value) {
        handleSearch()
      }
    }

    // 导出报告
    const exportReport = () => {
      if (!hasData.value) {
        ElMessage.warning('暂无数据可导出')
        return
      }

      try {
        // 生成导出数据
        const exportData = {
          batchNo: props.batchNo,
          exportTime: new Date().toLocaleString(),
          rawMaterials: rawMaterials.value,
          productionProcess: productionProcess.value,
          qualityInspections: qualityInspections.value,
          finalProducts: finalProducts.value,
          timeline: timeline.value
        }

        // 转换为JSON字符串
        const jsonStr = JSON.stringify(exportData, null, 2)

        // 创建Blob对象
        const blob = new Blob([jsonStr], { type: 'application/json' })

        // 创建下载链接
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `追溯报告_${props.batchNo}_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`
        document.body.appendChild(a)
        a.click()

        // 清理
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        ElMessage.success('导出成功')
      } catch (error) {
        console.error('导出失败:', error)
        ElMessage.error('导出失败')
      }
    }

    // 工具函数
    // formatDateTime 已统一引用公共实现

// 日期时间格式化
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  } catch {
    return dateStr;
  }
};

    const getStatusType = (status) => {
      const statusMap = {
        'active': 'success',
        'consumed': 'info',
        'expired': 'danger',
        'locked': 'warning'
      }
      return statusMap[status] || 'info'
    }

    const getStatusText = (status) => {
      const statusMap = {
        'active': '活跃',
        'consumed': '已消耗',
        'expired': '已过期',
        'locked': '已锁定',
        'in_progress': '进行中',
        'completed': '已完成',
        'pending': '待处理'
      }
      return statusMap[status] || status
    }

    // 追溯步骤状态类型
    const getStepStatusType = (status) => {
      const statusMap = {
        'completed': 'success',
        'in_progress': 'primary',
        'pending': 'info',
        'failed': 'danger',
        'skipped': 'warning'
      }
      return statusMap[status] || 'info'
    }

    // 追溯步骤状态文本
    const getStepStatusText = (status) => {
      const statusMap = {
        'completed': '已完成',
        'in_progress': '进行中',
        'pending': '待处理',
        'failed': '失败',
        'skipped': '已跳过'
      }
      return statusMap[status] || status
    }

    const getTransactionType = (type) => {
      const typeMap = {
        'in': 'success',
        'out': 'danger',
        'transfer': 'warning',
        'adjust': 'info',
        'reserve': 'primary'
      }
      return typeMap[type] || 'info'
    }

    const getTransactionText = (type) => {
      const typeMap = {
        'in': '入库',
        'out': '出库',
        'transfer': '转移',
        'adjust': '调整',
        'reserve': '预留'
      }
      return typeMap[type] || type
    }

    const getQuantityClass = (quantity) => {
      return quantity > 0 ? 'quantity-positive' : 'quantity-zero'
    }

    const getQuantityChangeClass = (type) => {
      return type === 'out' ? 'quantity-decrease' : 'quantity-increase'
    }

    // 过滤追溯步骤（对于老库存导入，显示所有步骤但标记无记录的）
    const getFilteredSteps = (steps, isLegacyImport) => {
      if (!steps) return []
      // 返回所有步骤，让用户看到完整的追溯链路
      return steps
    }

    // 判断是否为早期步骤（采购到货、来料检验等）
    const isEarlyStep = (stepType) => {
      const earlySteps = ['PURCHASE_RECEIVE', 'IQC_INSPECTION']
      return earlySteps.includes(stepType)
    }

    // 组件挂载时自动加载测试用例数据
    onMounted(() => {
      loadLatestBatches()
      loadProductBatches()
    })

    // 加载成品批次（新增）
    const loadProductBatches = async () => {
      try {
        const response = await fetch('/api/traceability-chain/latest-product-batches')
        const result = await response.json()

        if (result.success && result.data) {
          let id = 1
          productTestCases.value = result.data.slice(0, 10).map(batch => ({
            id: id++,
            label: `${batch.product_name || batch.product_code}-${batch.batch_number}`,
            productCode: batch.product_code,
            batchNumber: batch.batch_number
          }))
        }
      } catch (error) {
        // 静默处理，不影响主功能
        console.warn('加载成品批次失败:', error)
      }
    }

    return {
      activeTab,
      loading,
      hasData,
      traceabilityData,
      customerList,
      searchForm,
      productForm,
      customerForm,
      materialToCustomerForm,
      testCases,
      productTestCases,
      materialToCustomerTestCases,
      handleSearch,
      searchProductTrace,
      searchCustomerTrace,
      searchMaterialToCustomerTrace,
      handleTabClick,
      resetSearch,
      resetProductForm,
      resetCustomerForm,
      resetMaterialToCustomerForm,
      loadTestCase,
      loadProductTestCase,
      loadMaterialToCustomerTestCase,
      loadLatestBatches,
      refreshData,
      exportReport,
      formatDateTime,
      getStatusType,
      getStatusText,
      getStepStatusType,
      getStepStatusText,
      getTransactionType,
      getTransactionText,
      getQuantityClass,
      getQuantityChangeClass,
      getFilteredSteps,
      isEarlyStep
    }
  }
}
</script>

<style scoped>
.batch-traceability {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-section {
  margin-bottom: var(--spacing-lg);
}

.test-cases {
  padding: 10px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.quantity-positive {
  color: var(--color-success);
  font-weight: bold;
}

.quantity-zero {
  color: var(--color-text-secondary);
}

.quantity-increase {
  color: var(--color-success);
}

.quantity-decrease {
  color: var(--color-danger);
}

.traceability-results {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>