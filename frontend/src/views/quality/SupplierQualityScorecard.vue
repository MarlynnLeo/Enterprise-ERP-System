<template>
  <div class="module-page supplier-quality-container">
    <PageHeader title="供应商质量计分卡" subtitle="供应商质量绩效评估">
      <template #actions>
        <el-button v-permission="'quality:supplier-quality:update'" type="primary" @click="handleCalculate" :loading="calculating">
              <el-icon><Cpu /></el-icon>计算本月得分
            </el-button>
      </template>
    </PageHeader>

    <!-- 顶部操作栏 -->
    <el-card class="data-card">
      <template #header>
        <div class="card-header">
          <span>供应商质量计分卡</span>
          <div>
            <el-date-picker v-model="selectedPeriod" type="month" value-format="YYYY-MM"
              placeholder="选择月份" class="form-control-md mr-sm" @change="fetchScores" />
          </div>
        </div>
      </template>

      <!-- 搜索 -->
      <el-row :gutter="20" class="search-container">
        <el-col :span="5">
          <el-select  v-model="filterGrade" placeholder="等级筛选" clearable @change="fetchScores">
            <el-option v-for="item in dictStore.getOptions('supplier_quality_grade')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-button v-permission="'quality:supplier-quality:view'" @click="fetchRanking">查看排名</el-button>
        </el-col>
      </el-row>

      <!-- 表格 -->
      <el-table v-loading="loading" :data="tableData" border class="w-full"
        :row-class-name="tableRowClassName" @row-click="handleRowClick">
        <el-table-column prop="supplierName" label="供应商" width="300" show-overflow-tooltip />
        <el-table-column prop="period" label="月份" width="100" />
        <el-table-column label="来料质量">
          <el-table-column prop="totalLots" label="批次数" width="100" />
          <el-table-column prop="lotAcceptRate" label="合格率(%)" width="100">
            <template #default="scope">
              <span :class="acceptRateClass(scope.row.lotAcceptRate)">
                {{ scope.row.lotAcceptRate }}%
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="ppm" label="PPM" width="100">
            <template #default="scope">
              <span :class="ppmClass(scope.row.ppm)">
                {{ scope.row.ppm }}
              </span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="交付">
          <el-table-column prop="deliveryRate" label="准时率(%)" width="135">
            <template #default="scope">
              <span class="font-weight-700">{{ scope.row.deliveryRate }}%</span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="8D 响应">
          <el-table-column prop="total8dReports" label="报告数" width="100" />
          <el-table-column prop="avg8dDays" label="平均天数" width="100" />
        </el-table-column>
        <el-table-column label="综合得分">
          <el-table-column prop="qualityScore" label="质量(60%)" width="100">
            <template #default="scope">{{ scope.row.qualityScore }}</template>
          </el-table-column>
          <el-table-column prop="deliveryScore" label="交付(25%)" width="100">
            <template #default="scope">{{ scope.row.deliveryScore }}</template>
          </el-table-column>
          <el-table-column prop="responseScore" label="响应(15%)" width="100">
            <template #default="scope">{{ scope.row.responseScore }}</template>
          </el-table-column>
          <el-table-column prop="totalScore" label="总分" width="100">
            <template #default="scope">
              <span class="score-grade" :class="gradeClass(scope.row.grade)">
                {{ scope.row.totalScore }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="grade" label="等级" width="100">
            <template #default="scope">
              <el-tag :type="gradeType(scope.row.grade)" effect="dark" size="large" class="font-weight-700">
                {{ scope.row.grade }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]" :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchScores" @current-change="fetchScores" />
      </div>
    </el-card>

    <!-- 排名弹窗 -->
    <AppDialog
      v-model="rankingVisible"
      :title="`${selectedPeriod || '当月'} 供应商质量排名`"
      mode="form"
      width="700px"
    >
      <el-table :data="rankingData" border>
        <el-table-column prop="ranking" label="排名" width="70">
          <template #default="scope">
            <span :class="{ 'rank-top': scope.row.ranking <= 3 }">
              {{ scope.row.ranking <= 3 ? ['①','②','③'][scope.row.ranking-1] : scope.row.ranking }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="supplierName" label="供应商" />
        <el-table-column prop="totalScore" label="综合得分" width="100" sortable>
          <template #default="scope">
            <span class="font-weight-700" :class="gradeClass(scope.row.grade)">{{ scope.row.totalScore }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="grade" label="等级" width="80">
          <template #default="scope">
            <el-tag :type="gradeType(scope.row.grade)" effect="dark">{{ scope.row.grade }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lotAcceptRate" label="来料合格率" width="110">
          <template #default="scope">{{ scope.row.lotAcceptRate }}%</template>
        </el-table-column>
        <el-table-column prop="deliveryRate" label="准时交货" width="100">
          <template #default="scope">{{ scope.row.deliveryRate }}%</template>
        </el-table-column>
      </el-table>
        </AppDialog>

    <!-- 趋势弹窗 -->
    <AppDialog
      v-model="trendVisible"
      :title="`${trendSupplierName} - 质量趋势`"
      mode="form"
      width="800px"
    >
      <el-table :data="trendData" border size="small">
        <el-table-column prop="period" label="月份" width="100" />
        <el-table-column prop="qualityScore" label="质量得分" width="100" />
        <el-table-column prop="deliveryScore" label="交付得分" width="100" />
        <el-table-column prop="responseScore" label="响应得分" width="100" />
        <el-table-column prop="totalScore" label="总分" width="80">
          <template #default="scope">
            <span class="font-weight-700" :class="gradeClass(scope.row.grade)">{{ scope.row.totalScore }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="grade" label="等级" width="70">
          <template #default="scope">
            <el-tag :type="gradeType(scope.row.grade)" effect="dark" size="small">{{ scope.row.grade }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ppm" label="PPM" width="80" />
        <el-table-column prop="lotAcceptRate" label="合格率(%)" width="100" />
      </el-table>
        </AppDialog>
  </div>
</template>

<script setup>
import { useDictionaryStore } from '@/stores/dictionary'
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { Cpu } from '@element-plus/icons-vue';
import { qualityApi } from '@/api/quality';
import dayjs from 'dayjs';

const dictStore = useDictionaryStore()

const loading = ref(false);
const calculating = ref(false);
const tableData = ref([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const selectedPeriod = ref(dayjs().format('YYYY-MM'));
const filterGrade = ref('');

const rankingVisible = ref(false);
const rankingData = ref([]);

const trendVisible = ref(false);
const trendData = ref([]);
const trendSupplierName = ref('');

const gradeType = (g) => ({ A: 'success', B: '', C: 'warning', D: 'danger' }[g] || 'info')
const gradeClass = (g) =>
  ({ A: 'text-success', B: 'text-primary', C: 'text-warning', D: 'text-danger' }[g] || 'text-muted')
const acceptRateClass = (rate) => {
  if (rate >= 95) return 'score-good'
  if (rate >= 80) return 'score-warn'
  return 'score-bad'
}
const ppmClass = (ppm) => {
  if (ppm <= 500) return 'score-good'
  if (ppm <= 2000) return 'score-warn'
  return 'score-bad'
}

const tableRowClassName = ({ row }) => {
  if (row.grade === 'D') return 'row-danger';
  if (row.grade === 'A') return 'row-success';
  return '';
};

const fetchScores = async () => {
  loading.value = true;
  try {
    const res = await qualityApi.getSupplierScores({ page: currentPage.value, pageSize: pageSize.value, period: selectedPeriod.value, grade: filterGrade.value });
    const d = res.data || res;
    tableData.value = d.list || [];
    total.value = d.total || 0;
  } catch { ElMessage.error('获取数据失败'); }
  finally { loading.value = false; }
};

const handleCalculate = async () => {
  if (!selectedPeriod.value) { ElMessage.warning('请选择月份'); return; }
  await ElMessageBox.confirm(`确定要计算 ${selectedPeriod.value} 的供应商质量得分吗？`, '提示', { type: 'info' });
  calculating.value = true;
  try {
    const res = await qualityApi.calculateSupplierScores({ period: selectedPeriod.value });
    const d = res.data || res;
    ElMessage.success(d.message || `已计算 ${d.updated} 个供应商得分`);
    fetchScores();
  } catch { ElMessage.error('计算失败'); }
  finally { calculating.value = false; }
};

const fetchRanking = async () => {
  if (!selectedPeriod.value) { ElMessage.warning('请选择月份'); return; }
  try {
    const res = await qualityApi.getSupplierRanking({ period: selectedPeriod.value });
    rankingData.value = (res.data || res) || [];
    rankingVisible.value = true;
  } catch { ElMessage.error('获取排名失败'); }
};

const handleRowClick = async (row) => {
  try {
    const res = await qualityApi.getSupplierTrend(row.supplierId);
    trendData.value = (res.data || res) || [];
    trendSupplierName.value = row.supplierName;
    trendVisible.value = true;
  } catch { ElMessage.error('获取趋势失败'); }
};

onMounted(fetchScores);
</script>

<style scoped>
.supplier-quality-container { padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.search-container { margin-bottom: 16px; }
.pagination-container { margin-top: 20px; display: flex; justify-content: flex-end; }
.rank-top { font-size: 20px; }

:deep(.row-danger) { background-color: var(--ds-red-bg) !important; }
:deep(.row-success) { background-color: var(--ds-green-bg) !important; }
</style>
