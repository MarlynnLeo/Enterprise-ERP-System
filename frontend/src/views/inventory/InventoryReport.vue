<!--
/**
 * InventoryReport.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inventory-report-container">
    <PageHeader title="库存报表" subtitle="查看库存汇总与分析报表">
      <template #actions>
<el-button v-permission="'inventory:report:export'" type="primary" @click="handleExport">导出报表</el-button>
      </template>
    </PageHeader>
    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input
            v-model="searchForm.materialName"
            placeholder="物料名称"
            clearable
            @input="handleSearchInput"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="报表类型">
          <el-select v-model="searchForm.reportType" placeholder="选择报表类型" clearable @change="handleReportTypeChange">
            <el-option label="库存汇总报表" value="summary" />
            <el-option label="期间库存报表" value="period" />
            <el-option label="收发结存明细" value="ledger" />
            <el-option label="库存周转分析" value="turnover" />
            <el-option label="库龄分析" value="aging" />
            <el-option label="库存分布报表" value="location" />
            <el-option label="库存价值报表" value="value" />
            <el-option label="低库存预警" value="warning" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围" v-if="searchForm.reportType === 'period' || searchForm.reportType === 'ledger' || searchForm.reportType === 'turnover'">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item v-if="searchForm.reportType === 'period' || searchForm.reportType === 'ledger' || searchForm.reportType === 'turnover'">
          <el-button-group>
            <el-button size="small" @click="setDateRange('thisMonth')">本月</el-button>
            <el-button size="small" @click="setDateRange('lastMonth')">上月</el-button>
            <el-button size="small" @click="setDateRange('thisYear')">本年</el-button>
            <el-button size="small" @click="setDateRange('lastYear')">去年</el-button>
          </el-button-group>
        </el-form-item>
        <el-form-item label="物料类别">
          <el-select v-model="searchForm.categoryId" placeholder="选择类别" clearable @change="handleSearch">
            <el-option
              v-for="category in categoryOptions"
              :key="category.id"
              :label="category.name"
              :value="category.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="仓库位置">
          <el-select v-model="searchForm.locationId" placeholder="选择位置" clearable @change="handleSearch">
            <el-option
              v-for="location in locationOptions"
              :key="location.id"
              :label="location.name || location.warehouse_name || location.code"
              :value="location.id"
            />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>
    <!-- 统计信息 -->
    <div class="statistics-row">
      <!-- 期间库存报表统计 -->
      <template v-if="searchForm.reportType === 'period'">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ statistics.totalItems || 0 }}</div>
          <div class="stat-label">物料种类</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.totalBeginningValue) }}</div>
          <div class="stat-label">期初结存金额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.totalInboundValue) }}</div>
          <div class="stat-label">本期收入金额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.totalOutboundValue) }}</div>
          <div class="stat-label">本期发出金额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatNumber(statistics.totalEndingQuantity) }}</div>
          <div class="stat-label">期末结存数量</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.totalEndingValue) }}</div>
          <div class="stat-label">期末结存金额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ statistics.avgTurnoverRate || 0 }}</div>
          <div class="stat-label">平均周转率</div>
        </el-card>
      </template>
      <!-- 收发结存明细统计 -->
      <template v-else-if="searchForm.reportType === 'ledger'">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ statistics.totalTransactions || 0 }}</div>
          <div class="stat-label">交易笔数</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatNumber(statistics.totalInQuantity) }}</div>
          <div class="stat-label">收入总数量</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.totalInValue) }}</div>
          <div class="stat-label">收入总金额</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatNumber(statistics.totalOutQuantity) }}</div>
          <div class="stat-label">发出总数量</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.totalOutValue) }}</div>
          <div class="stat-label">发出总金额</div>
        </el-card>
      </template>
      <!-- 默认统计信息 -->
      <template v-else>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ statistics.totalItems || 0 }}</div>
          <div class="stat-label">物料种类</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.totalValue) }}</div>
          <div class="stat-label">库存总价值</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ statistics.totalLocations || 0 }}</div>
          <div class="stat-label">库位数量</div>
        </el-card>
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ statistics.lowStock || 0 }}</div>
          <div class="stat-label">低库存预警</div>
        </el-card>
      </template>
    </div>
    <!-- 汇总报表 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'summary'">
      <div class="card-header-with-info">
        <h3 class="card-title">
          库存汇总报表
        </h3>
        <div class="data-info">
        </div>
      </div>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
      >
        <el-table-column prop="materialCode" label="物料编码" width="170" />
        <el-table-column prop="materialName" label="物料名称" min-width="220" />
        <el-table-column prop="specification" label="规格" min-width="200" />
        <el-table-column prop="categoryName" label="类别" min-width="120" />
        <el-table-column prop="quantity" label="库存数量" width="120">
          <template #default="scope">
            {{ formatNumber(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column prop="unitPrice" label="单价" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.unitPrice) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalValue" label="总价值" width="140">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="safetyStock" label="安全库存" min-width="120" />
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination && pagination.total > 0">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 期间库存报表 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'period'">
      <h3 class="card-title">
        期间库存报表
        <span class="period-info" v-if="searchForm.dateRange && searchForm.dateRange.length === 2">
          （{{ searchForm.dateRange[0] }} 至 {{ searchForm.dateRange[1] }}）
        </span>
      </h3>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
        show-summary
        :summary-method="getPeriodSummary"
      >
        <el-table-column prop="materialCode" label="物料编码" width="120" />
        <el-table-column prop="materialName" label="物料名称" width="200" />
        <el-table-column prop="specification" label="规格" width="220" />
        <el-table-column prop="categoryName" label="类别" width="100" />
        <el-table-column prop="unitName" label="单位" width="60" />
        <el-table-column label="期初结存">
          <el-table-column prop="beginningQuantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.beginningQuantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="beginningValue" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.beginningValue) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="本期收入">
          <el-table-column prop="inboundQuantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.inboundQuantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="inboundValue" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.inboundValue) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="本期发出">
          <el-table-column prop="outboundQuantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.outboundQuantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="outboundValue" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.outboundValue) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="期末结存">
          <el-table-column prop="endingQuantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.endingQuantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="endingValue" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.endingValue) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="分析指标">
          <el-table-column prop="turnoverRate" label="周转率" width="80">
            <template #default="scope">
              {{ scope.row.turnoverRate }}
            </template>
          </el-table-column>
          <el-table-column prop="turnoverDays" label="周转天数" width="90">
            <template #default="scope">
              {{ scope.row.turnoverDays }}天
            </template>
          </el-table-column>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total || 0"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 收发结存明细 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'ledger'">
      <h3 class="card-title">
        库存收发结存明细
        <span class="period-info" v-if="searchForm.dateRange && searchForm.dateRange.length === 2">
          （{{ searchForm.dateRange[0] }} 至 {{ searchForm.dateRange[1] }}）
        </span>
      </h3>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
      >
        <el-table-column prop="date" label="日期" width="100">
          <template #default="scope">
            {{ formatDate(scope.row.date) }}
          </template>
        </el-table-column>
        <el-table-column prop="materialCode" label="物料编码" width="150" />
        <el-table-column prop="materialName" label="物料名称" width="200" />
        <el-table-column prop="transactionType" label="业务类型" width="100">
          <template #default="scope">
            {{ getTransactionTypeText(scope.row.transactionType) }}
          </template>
        </el-table-column>
        <el-table-column prop="documentNo" label="单据号" width="150" />
        <el-table-column label="收入">
          <el-table-column prop="inQuantity" label="数量" width="100">
            <template #default="scope">
              {{ scope.row.inQuantity > 0 ? formatNumber(scope.row.inQuantity) : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="inValue" label="金额" width="100">
            <template #default="scope">
              {{ scope.row.inValue > 0 ? formatCurrency(scope.row.inValue) : '-' }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="发出">
          <el-table-column prop="outQuantity" label="数量" width="100">
            <template #default="scope">
              {{ scope.row.outQuantity > 0 ? formatNumber(scope.row.outQuantity) : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="outValue" label="金额" width="100">
            <template #default="scope">
              {{ scope.row.outValue > 0 ? formatCurrency(scope.row.outValue) : '-' }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="结存">
          <el-table-column prop="balanceQuantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.balanceQuantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="balanceValue" label="金额" width="100">
            <template #default="scope">
              {{ formatCurrency(scope.row.balanceValue) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column prop="locationName" label="库位" width="125" />
        <el-table-column prop="operator" label="操作员" width="125" />
      </el-table>
      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total || 0"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 库存周转分析报表 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'turnover'">
      <h3 class="card-title">
        库存周转分析报表
        <span class="period-info" v-if="searchForm.dateRange && searchForm.dateRange.length === 2">
          （{{ searchForm.dateRange[0] }} 至 {{ searchForm.dateRange[1] }}）
        </span>
      </h3>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
        :default-sort="{prop: 'turnoverRate', order: 'descending'}"
      >
        <el-table-column prop="materialCode" label="物料编码" width="150" />
        <el-table-column prop="materialName" label="物料名称" width="200" />
        <el-table-column prop="specification" label="规格" width="240" />
        <el-table-column prop="categoryName" label="类别" width="100" />
        <el-table-column prop="unitName" label="单位" width="60" />
        <el-table-column prop="beginningValue" label="期初金额" width="120" sortable>
          <template #default="scope">
            {{ formatCurrency(scope.row.beginningValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="endingValue" label="期末金额" width="120" sortable>
          <template #default="scope">
            {{ formatCurrency(scope.row.endingValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="outboundValue" label="本期金额" width="120" sortable>
          <template #default="scope">
            {{ formatCurrency(scope.row.outboundValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="turnoverRate" label="周转率" width="100" sortable>
          <template #default="scope">
            <span :class="getTurnoverRateClass(scope.row.turnoverRate)">
              {{ scope.row.turnoverRate }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="turnoverDays" label="周转天数" width="120" sortable>
          <template #default="scope">
            <span :class="getTurnoverDaysClass(scope.row.turnoverDays)">
              {{ scope.row.turnoverDays }}天
            </span>
          </template>
        </el-table-column>
        <el-table-column label="周转评级" width="100">
          <template #default="scope">
            <el-tag :type="getTurnoverGradeType(scope.row.turnoverRate)">
              {{ getTurnoverGrade(scope.row.turnoverRate) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="建议" width="120">
          <template #default="scope">
            <span class="suggestion-text">
              {{ getTurnoverSuggestion(scope.row.turnoverRate, scope.row.turnoverDays) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total || 0"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 库龄分析报表 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'aging'">
      <h3 class="card-title">
        库龄分析报表
      </h3>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
        :default-sort="{prop: 'agingDays', order: 'descending'}"
      >
        <el-table-column prop="materialCode" label="物料编码" width="150" />
        <el-table-column prop="materialName" label="物料名称" width="230" />
        <el-table-column prop="specification" label="规格" width="320" />
        <el-table-column prop="categoryName" label="类别" width="100" />
        <el-table-column prop="quantity" label="库存数量" width="100">
          <template #default="scope">
            {{ formatNumber(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column prop="unitName" label="单位" width="60" />
        <el-table-column prop="totalValue" label="库存金额" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="firstInboundDate" label="首次入库日期" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.firstInboundDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="agingDays" label="库龄(天)" width="110" sortable>
          <template #default="scope">
            <span :class="getAgingDaysClass(scope.row.agingDays)">
              {{ scope.row.agingDays }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="库龄分段" width="120">
          <template #default="scope">
            <el-tag :type="getAgingLevelType(scope.row.agingDays)">
              {{ getAgingLevelText(scope.row.agingDays) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getAgingStatusType(scope.row.agingDays)" size="small">
              {{ getAgingStatusText(scope.row.agingDays) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total || 0"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 库存分布报表 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'location'">
      <h3 class="card-title">
        库存分布报表
      </h3>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
      >
        <el-table-column prop="materialCode" label="物料编码" width="150" />
        <el-table-column prop="materialName" label="物料名称" width="250" />
        <el-table-column prop="specification" label="规格" width="300" />
        <el-table-column prop="locationName" label="仓库位置" width="150" />
        <el-table-column prop="quantity" label="库存数量" width="150">
          <template #default="scope">
            {{ formatNumber(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column prop="storageConditions" label="存储条件" width="150" />
        <el-table-column prop="lastMoveDate" label="最后移动日期" width="320">
          <template #default="scope">
            {{ formatDate(scope.row.lastMoveDate) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total || 0"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 库存价值报表 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'value'">
      <h3 class="card-title">
        库存价值报表
      </h3>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
      >
        <el-table-column prop="categoryName" label="物料类别" width="250" />
        <el-table-column prop="materialCount" label="物料数量" width="250" />
        <el-table-column prop="totalQuantity" label="总库存量" width="250">
          <template #default="scope">
            {{ formatNumber(scope.row.totalQuantity) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalValue" label="总价值" width="250">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="valuePercent" label="价值占比" width="250">
          <template #default="scope">
            <div class="value-percent">
              <span>{{ formatPercent(scope.row.valuePercent) }}</span>
              <el-progress :percentage="scope.row.valuePercent" :format="() => ''" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="avgUnitPrice" label="平均单价" width="305">
          <template #default="scope">
            {{ formatCurrency(scope.row.avgUnitPrice) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total || 0"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 低库存预警报表 -->
    <el-card class="data-card" v-if="searchForm.reportType === 'warning'">
      <h3 class="card-title">
        低库存预警报表
      </h3>
      <el-table
        :data="reportData"
        border
        class="w-full"
        v-loading="loading"
      >
        <el-table-column prop="materialCode" label="物料编码" width="170" />
        <el-table-column prop="materialName" label="物料名称" width="180" />
        <el-table-column prop="specification" label="规格" width="260" />
        <el-table-column prop="quantity" label="当前库存" width="120">
          <template #default="scope">
            {{ formatNumber(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column prop="safetyStock" label="安全库存" width="120">
          <template #default="scope">
            {{ formatNumber(scope.row.safetyStock) }}
          </template>
        </el-table-column>
        <el-table-column prop="gap" label="差额" width="120">
          <template #default="scope">
            <span :class="scope.row.gap < 0 ? 'danger-text' : ''">
              {{ formatNumber(scope.row.gap) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="unitName" label="单位" width="100" />
        <el-table-column prop="warningLevel" label="预警等级" width="120">
          <template #default="scope">
            <el-tag :type="getWarningLevelType(scope.row)">
              {{ getWarningLevelText(scope.row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="suggestedPurchase" label="建议采购" width="100">
          <template #default="scope">
            {{ formatNumber(scope.row.suggestedPurchase) }}
          </template>
        </el-table-column>
        <el-table-column prop="lastPurchaseDate" label="最后采购日期" width="260">
          <template #default="scope">
            {{ formatDate(scope.row.lastPurchaseDate) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage || 1"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize || 10"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total || 0"
        >
        </el-pagination>
      </div>
    </el-card>
  </div>
</template>
<script setup>
import { formatDate } from '@/utils/helpers/dateUtils'
import { formatCurrency, formatNumber } from '@/utils/format'
import { debounce } from '@/utils/commonHelpers'
import { ref, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { baseDataApi } from '@/api'
import { inventoryApi } from '@/api/inventory'
import { parseListData, parseResponseData } from '@/utils/responseParser'
// 页面数据
const loading = ref(false)
const reportData = ref([])
// 分页数据
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})
// 统计信息
const statistics = ref({
  totalItems: 0,
  totalValue: 0,
  totalLocations: 0,
  lowStock: 0
})
// 基础数据
const categoryOptions = ref([])
const locationOptions = ref([])
// 搜索表单
const searchForm = ref({
  reportType: 'summary',
  materialName: '',
  categoryId: '',
  locationId: '',
  startDate: '',
  endDate: '',
  dateRange: []
})
// 日期快捷按钮
const setDateRange = (type) => {
  const now = dayjs()
  let start, end
  switch (type) {
    case 'thisMonth':
      start = now.startOf('month').format('YYYY-MM-DD')
      end = now.endOf('month').format('YYYY-MM-DD')
      break
    case 'lastMonth':
      start = now.subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
      end = now.subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
      break
    case 'thisYear':
      start = now.startOf('year').format('YYYY-MM-DD')
      end = now.endOf('year').format('YYYY-MM-DD')
      break
    case 'lastYear':
      start = now.subtract(1, 'year').startOf('year').format('YYYY-MM-DD')
      end = now.subtract(1, 'year').endOf('year').format('YYYY-MM-DD')
      break
  }
  searchForm.value.dateRange = [start, end]
  if (pagination) {
    pagination.currentPage = 1
  }
  fetchReportData()
}
// 报表类型变更
const handleReportTypeChange = () => {
  if (pagination) {
    pagination.currentPage = 1
  }
  fetchReportData()
}
// 搜索处理
const handleSearch = () => {
  if (pagination) {
    pagination.currentPage = 1
  }
  fetchReportData()
}
// 防抖搜索
const debouncedSearch = debounce(handleSearch, 500)
// 搜索输入处理
const handleSearchInput = (value) => {
  // 如果输入为空或长度大于等于2个字符时触发搜索
  if (!value || value.length >= 2) {
    debouncedSearch()
  }
}
// 重置搜索
const handleReset = () => {
  searchForm.value = {
    reportType: 'summary',
    materialName: '',
    categoryId: '',
    locationId: '',
    dateRange: []
  }
  if (pagination) {
    pagination.currentPage = 1
  }
  fetchReportData()
}
// 获取报表数据
const fetchReportData = async () => {
  try {
    loading.value = true
    // 安全检查：确保 pagination 对象存在
    if (!pagination) {
      console.error('分页对象未初始化')
      return
    }
    const params = {
      page: pagination.currentPage || 1,
      pageSize: pagination.pageSize || 10,
      reportType: searchForm.value.reportType
    }
    // 只添加非空的搜索参数
    if (searchForm.value.materialName && searchForm.value.materialName.trim()) {
      params.materialName = searchForm.value.materialName.trim()
    }
    if (searchForm.value.categoryId && searchForm.value.categoryId !== '') {
      params.categoryId = searchForm.value.categoryId
    }
    if (searchForm.value.locationId && searchForm.value.locationId !== '') {
      params.locationId = searchForm.value.locationId
    }
    // 如果是期间报表、明细报表或周转分析，添加日期参数
    if (['period', 'ledger', 'turnover'].includes(searchForm.value.reportType)) {
      if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
        params.startDate = searchForm.value.dateRange[0]
        params.endDate = searchForm.value.dateRange[1]
        // 同步更新单独的日期字段，以防其他地方使用
        searchForm.value.startDate = params.startDate
        searchForm.value.endDate = params.endDate
      }
    }
    // 根据报表类型选择不同的API端点
    let reportRequest = inventoryApi.getInventoryReport
    if (searchForm.value.reportType === 'ledger') {
      reportRequest = inventoryApi.getTransactionList
    } else if (searchForm.value.reportType === 'turnover') {
      // 周转分析使用期间报表API，但reportType设为period
      params.reportType = 'period'
    }
    const response = await reportRequest(params)
    // 拦截器已解包，response.data 就是业务数据
    const responseData = response.data

    // 处理统计数据
    if (searchForm.value.reportType === 'period') {
      statistics.value = responseData.statistics || {
        totalItems: 0,
        totalBeginningValue: 0,
        totalInboundValue: 0,
        totalOutboundValue: 0,
        totalEndingQuantity: 0,
        totalEndingValue: 0,
        avgTurnoverRate: 0
      }
    } else if (searchForm.value.reportType === 'ledger') {
      statistics.value = responseData.statistics || {
        totalTransactions: 0,
        totalInQuantity: 0,
        totalInValue: 0,
        totalOutQuantity: 0,
        totalOutValue: 0
      }
    } else {
      statistics.value = responseData.statistics || {
        totalItems: 0,
        totalValue: 0,
        totalLocations: 0,
        lowStock: 0
      }
    }

    // 处理报表数据
    reportData.value = responseData.items || []
    // 正确设置分页总数 - 确保转换为数字类型
    if (pagination) {
      pagination.total = Number(responseData.total) || 0
    }
  } catch (error) {
    console.error('获取报表数据失败:', error)
    ElMessage.error('获取报表数据失败')
    // 确保即使出错也有默认值
    reportData.value = []
    if (pagination) {
      pagination.total = 0
    }
  } finally {
    loading.value = false
  }
}
// 获取基础数据
const fetchBaseData = async () => {
  try {
    // 获取物料类别（大页码确保获取全部）
    const categoryResponse = await baseDataApi.getCategories({ page: 1, pageSize: 200, limit: 200 })
    categoryOptions.value = parseListData(categoryResponse, { enableLog: false })

    // 获取仓库位置
    const locationResponse = await inventoryApi.getWarehouseLocations({ page: 1, pageSize: 200, limit: 200 })
    locationOptions.value = parseListData(locationResponse, { enableLog: false })
  } catch (error) {
    console.error('获取基础数据失败:', error)
  }
}
// 导出报表
const handleExport = async () => {
  try {
    const params = {
      reportType: searchForm.value.reportType === 'turnover' ? 'period' : searchForm.value.reportType,
      materialName: searchForm.value.materialName || '',
      categoryId: searchForm.value.categoryId || '',
      locationId: searchForm.value.locationId || ''
    }

    if (['period', 'ledger', 'turnover'].includes(searchForm.value.reportType)) {
      if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
        params.startDate = searchForm.value.dateRange[0]
        params.endDate = searchForm.value.dateRange[1]
      }
    }

    const exportRequest = searchForm.value.reportType === 'ledger'
      ? inventoryApi.exportInventoryLedger
      : inventoryApi.exportInventoryReport
    const response = await exportRequest(params)
    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    if (!blob || blob.size === 0) {
      ElMessage.warning('暂无可导出的数据')
      return
    }

    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `库存${getReportTypeText()}_${dayjs().format('YYYYMMDD')}.xlsx`
    document.body.appendChild(link)
    link.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(link)

    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出报表失败:', error)
    ElMessage.error('导出报表失败')
  }
}

const getReportTypeText = () => {
  const typeMap = {
    summary: '汇总报表',
    period: '期间库存报表',
    ledger: '收发结存明细',
    turnover: '周转分析报表',
    location: '分布报表',
    value: '价值报表',
    warning: '预警报表'
  }
  return typeMap[searchForm.value.reportType] || '报表'
}
// 格式化数字
// formatNumber 已统一引用公共实现
// 格式化货币
// formatCurrency 已统一引用公共实现
// 格式化百分比
const formatPercent = (number) => {
  if (number === undefined || number === null) return '-'
  return `${Number(number).toFixed(2)}%`
}
// 格式化日期
// formatDate 已统一引用公共实现
// 预警等级类型
const getWarningLevelType = (row) => {
  const ratio = row.quantity / row.safetyStock
  if (ratio <= 0.3) return 'danger'
  if (ratio <= 0.7) return 'warning'
  return 'info'
}
// 预警等级文本
const getWarningLevelText = (row) => {
  const ratio = row.quantity / row.safetyStock
  if (ratio <= 0.3) return '紧急'
  if (ratio <= 0.7) return '警告'
  return '关注'
}
// 库龄天数样式类
const getAgingDaysClass = (days) => {
  if (days <= 30) return 'aging-normal'
  if (days <= 60) return 'aging-normal'
  if (days <= 90) return 'aging-warning'
  if (days <= 180) return 'aging-warning'
  return 'aging-danger'
}
// 库龄分段类型
const getAgingLevelType = (days) => {
  if (days <= 30) return 'success'
  if (days <= 60) return ''
  if (days <= 90) return 'warning'
  if (days <= 180) return 'warning'
  return 'danger'
}
// 库龄分段文本
const getAgingLevelText = (days) => {
  if (days <= 30) return '0-30天'
  if (days <= 60) return '31-60天'
  if (days <= 90) return '61-90天'
  if (days <= 180) return '91-180天'
  return '180天以上'
}
// 库龄状态类型
const getAgingStatusType = (days) => {
  if (days <= 60) return 'success'
  if (days <= 90) return 'warning'
  if (days <= 180) return 'warning'
  return 'danger'
}
// 库龄状态文本
const getAgingStatusText = (days) => {
  if (days <= 60) return '正常'
  if (days <= 90) return '关注'
  if (days <= 180) return '预警'
  return '呆滞'
}
// 分页处理
const handleSizeChange = (val) => {
  if (pagination) {
    pagination.pageSize = val
    fetchReportData()
  }
}
const handleCurrentChange = (val) => {
  if (pagination) {
    pagination.currentPage = val
    fetchReportData()
  }
}
// 期间报表汇总计算
const getPeriodSummary = (param) => {
  const { columns, data } = param
  const sums = []
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }
    const values = data.map(item => Number(item[column.property]))
    if (!values.every(value => isNaN(value))) {
      const sum = values.reduce((prev, curr) => {
        const value = Number(curr)
        if (!isNaN(value)) {
          return prev + curr
        } else {
          return prev
        }
      }, 0)
      // 根据列类型格式化显示
      if (column.property.includes('Value')) {
        sums[index] = formatCurrency(sum)
      } else if (column.property.includes('Quantity')) {
        sums[index] = formatNumber(sum)
      } else if (column.property === 'turnoverRate') {
        sums[index] = data.length > 0 ? (sum / data.length).toFixed(2) : '0.00'
      } else if (column.property === 'turnoverDays') {
        sums[index] = data.length > 0 ? (sum / data.length).toFixed(1) + '天' : '0.0天'
      } else {
        sums[index] = '-'
      }
    } else {
      sums[index] = '-'
    }
  })
  return sums
}
import { getInventoryTransactionTypeText } from '@/constants/systemConstants'
// 交易类型中文转换
const getTransactionTypeText = (type) => {
  return getInventoryTransactionTypeText(type)
}
// 库存周转分析相关函数
const getTurnoverRateClass = (rate) => {
  if (rate >= 6) return 'excellent-rate'
  if (rate >= 4) return 'good-rate'
  if (rate >= 2) return 'normal-rate'
  return 'poor-rate'
}
const getTurnoverDaysClass = (days) => {
  if (days <= 60) return 'excellent-days'
  if (days <= 90) return 'good-days'
  if (days <= 180) return 'normal-days'
  return 'poor-days'
}
const getTurnoverGrade = (rate) => {
  if (rate >= 6) return '优秀'
  if (rate >= 4) return '良好'
  if (rate >= 2) return '一般'
  return '较差'
}
const getTurnoverGradeType = (rate) => {
  if (rate >= 6) return 'success'
  if (rate >= 4) return 'info'
  if (rate >= 2) return 'warning'
  return 'danger'
}
const getTurnoverSuggestion = (rate, days) => {
  if (rate >= 6) return '保持现状'
  if (rate >= 4) return '适当优化'
  if (rate >= 2) return '需要改进'
  if (days > 365) return '考虑清理'
  return '重点关注'
}
// 初始化
onMounted(() => {
  // 确保分页参数有默认值
  if (pagination) {
    pagination.currentPage = 1
    pagination.pageSize = 10
    pagination.total = 0
  }
  // 设置默认日期为当月
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const firstDay = `${year}-${month}-01`
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
  const lastDayStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
  searchForm.value.startDate = firstDay
  searchForm.value.endDate = lastDayStr
  fetchBaseData()
  fetchReportData()
})
</script>
<style scoped>
.header-card {
  margin-bottom: 20px;
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
.period-info {
  font-size: 14px;
  color: var(--color-text-regular);
  font-weight: normal;
  margin-left: 10px;
}
.card-title {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 16px;
  font-weight: bold;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-header-with-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
  padding-bottom: 15px;
  border-bottom: 1px solid var(--color-border-light);
}
.card-header-with-info .card-title {
  margin: 0;
}
.data-info {
  display: flex;
  align-items: center;
}
.value-percent {
  display: flex;
  flex-direction: column;
}
.danger-text {
  color: var(--color-danger);
}
/* 周转分析样式 */
.excellent-rate, .excellent-days {
  color: var(--color-success);
  font-weight: bold;
}
/* 库龄分析样式 */
.aging-normal {
  color: var(--color-success);
}
.aging-warning {
  color: var(--color-warning);
  font-weight: bold;
}
.aging-danger {
  color: var(--color-danger);
  font-weight: bold;
}
.good-rate, .good-days {
  color: var(--color-primary);
  font-weight: bold;
}
.normal-rate, .normal-days {
  color: var(--color-warning);
  font-weight: bold;
}
.poor-rate, .poor-days {
  color: var(--color-danger);
  font-weight: bold;
}
.suggestion-text {
  font-size: 12px;
  color: var(--color-text-regular);
}
/* 响应式设计 */
@media (max-width: 1200px) {
  .statistics-row {
    gap: 10px;
  }
  .stat-card {
    min-width: 120px;
  }
  .search-form .el-form-item {
    margin-bottom: 10px;
  }
}
@media (max-width: 992px) {
  .inventory-report-container {
    padding: 15px;
  }
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .statistics-row {
    flex-direction: column;
    gap: 10px;
  }
  .stat-card {
    min-width: 100%;
    margin-right: 0;
  }
  .search-form {
    flex-direction: column;
  }
  .search-form .el-form-item {
    width: 100%;
    margin-bottom: 15px;
  }
  .search-form .el-form-item .el-select,
  .search-form .el-form-item .el-input,
  .search-form .el-form-item .el-date-picker {
    width: 100% !important;
  }
  .pagination-container {
    justify-content: center;
  }
  .pagination-container .el-pagination {
    flex-wrap: wrap;
    justify-content: center;
  }
}
@media (max-width: 768px) {
  .inventory-report-container {
    padding: 10px;
  }
  .page-header h2 {
    font-size: 1.2rem;
  }
  .statistics-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .stat-card {
    min-width: auto;
  }
  .stat-value {
    font-size: 1.4rem;
  }
  .stat-label {
    font-size: 0.8rem;
  }
  .data-card .el-table {
    font-size: 12px;
  }
  .card-title {
    font-size: 14px;
  }
  .period-info {
    font-size: 12px;
    display: block;
    margin-left: 0;
    margin-top: 5px;
  }
}
@media (max-width: 576px) {
  .inventory-report-container {
    padding: 8px;
  }
  .statistics-row {
    grid-template-columns: 1fr;
  }
  .stat-card {
    padding: 10px;
  }
  .stat-value {
    font-size: 1.2rem;
  }
  .search-card .el-card__body {
    padding: 15px;
  }
  .data-card .el-card__body {
    padding: 15px;
  }
  .pagination-container .el-pagination {
    font-size: 12px;
  }
  .pagination-container .el-pagination .el-pager li {
    min-width: 28px;
    height: 28px;
    line-height: 28px;
  }
  /* 表格响应式优化 */
  .data-card .el-table .el-table__header-wrapper,
  .data-card .el-table .el-table__body-wrapper {
    overflow-x: auto;
  }
  .data-card .el-table .cell {
    padding: 4px 6px;
    font-size: 11px;
  }
  .data-card .el-table th {
    padding: 8px 0;
  }
  .data-card .el-table td {
    padding: 6px 0;
  }
}
</style>
