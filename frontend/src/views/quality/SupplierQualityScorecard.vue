<template>
  <div class="supplier-quality-container">
    <!-- 顶部操作栏 -->
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>供应商质量计分卡</span>
          <div>
            <el-date-picker v-model="selectedPeriod" type="month" value-format="YYYY-MM"
              placeholder="选择月份" style="width:160px;margin-right:12px" @change="fetchScores" />
            <el-button type="primary" @click="handleCalculate" :loading="calculating">
              <el-icon><Cpu /></el-icon>计算本月得分
            </el-button>
          </div>
        </div>
      </template>

      <!-- 搜索 -->
      <el-row :gutter="20" class="search-container">
        <el-col :span="5">
          <el-select  v-model="filterGrade" placeholder="等级筛选" clearable @change="fetchScores">
            <el-option v-for="item in $dict.getOptions('supplier_quality_grade')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-button @click="fetchRanking">查看排名</el-button>
        </el-col>
      </el-row>

      <!-- 表格 -->
      <el-table v-loading="loading" :data="tableData" border style="width: 100%"
        :row-class-name="tableRowClassName" @row-click="handleRowClick">
        <el-table-column prop="supplier_name" label="供应商" width="300" show-overflow-tooltip />
        <el-table-column prop="period" label="月份" width="100" />
        <el-table-column label="来料质量" align="center">
          <el-table-column prop="total_lots" label="批次数" width="100" />
          <el-table-column prop="lot_accept_rate" label="合格率(%)" width="100">
            <template #default="scope">
              <span :style="{ color: scope.row.lot_accept_rate >= 95 ? '#67C23A' : scope.row.lot_accept_rate >= 80 ? '#E6A23C' : '#F56C6C', fontWeight: 'bold' }">
                {{ scope.row.lot_accept_rate }}%
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="ppm" label="PPM" width="100">
            <template #default="scope">
              <span :style="{ color: scope.row.ppm <= 500 ? '#67C23A' : scope.row.ppm <= 2000 ? '#E6A23C' : '#F56C6C' }">
                {{ scope.row.ppm }}
              </span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="交付" align="center">
          <el-table-column prop="delivery_rate" label="准时率(%)" width="135">
            <template #default="scope">
              <span :style="{ fontWeight: 'bold' }">{{ scope.row.delivery_rate }}%</span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="8D 响应" align="center">
          <el-table-column prop="total_8d_reports" label="报告数" width="100" />
          <el-table-column prop="avg_8d_days" label="平均天数" width="100" />
        </el-table-column>
        <el-table-column label="综合得分" align="center">
          <el-table-column prop="quality_score" label="质量(60%)" width="100">
            <template #default="scope">{{ scope.row.quality_score }}</template>
          </el-table-column>
          <el-table-column prop="delivery_score" label="交付(25%)" width="100">
            <template #default="scope">{{ scope.row.delivery_score }}</template>
          </el-table-column>
          <el-table-column prop="response_score" label="响应(15%)" width="100">
            <template #default="scope">{{ scope.row.response_score }}</template>
          </el-table-column>
          <el-table-column prop="total_score" label="总分" width="100">
            <template #default="scope">
              <span style="font-weight:bold;font-size:15px" :style="{ color: gradeColor(scope.row.grade) }">
                {{ scope.row.total_score }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="grade" label="等级" width="100">
            <template #default="scope">
              <el-tag :type="gradeType(scope.row.grade)" effect="dark" size="large" style="font-weight:bold">
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
    <el-dialog v-model="rankingVisible" :title="`${selectedPeriod || '当月'} 供应商质量排名`" width="700px">
      <el-table :data="rankingData" border>
        <el-table-column prop="ranking" label="排名" width="70" align="center">
          <template #default="scope">
            <span :class="{ 'rank-top': scope.row.ranking <= 3 }">
              {{ scope.row.ranking <= 3 ? ['①','②','③'][scope.row.ranking-1] : scope.row.ranking }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="supplier_name" label="供应商" />
        <el-table-column prop="total_score" label="综合得分" width="100" sortable>
          <template #default="scope">
            <span style="font-weight:bold" :style="{ color: gradeColor(scope.row.grade) }">{{ scope.row.total_score }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="grade" label="等级" width="80" align="center">
          <template #default="scope">
            <el-tag :type="gradeType(scope.row.grade)" effect="dark">{{ scope.row.grade }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lot_accept_rate" label="来料合格率" width="110">
          <template #default="scope">{{ scope.row.lot_accept_rate }}%</template>
        </el-table-column>
        <el-table-column prop="delivery_rate" label="准时交货" width="100">
          <template #default="scope">{{ scope.row.delivery_rate }}%</template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 趋势弹窗 -->
    <el-dialog v-model="trendVisible" :title="`${trendSupplierName} - 质量趋势`" width="800px">
      <el-table :data="trendData" border size="small">
        <el-table-column prop="period" label="月份" width="100" />
        <el-table-column prop="quality_score" label="质量得分" width="100" />
        <el-table-column prop="delivery_score" label="交付得分" width="100" />
        <el-table-column prop="response_score" label="响应得分" width="100" />
        <el-table-column prop="total_score" label="总分" width="80">
          <template #default="scope">
            <span style="font-weight:bold" :style="{ color: gradeColor(scope.row.grade) }">{{ scope.row.total_score }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="grade" label="等级" width="70">
          <template #default="scope">
            <el-tag :type="gradeType(scope.row.grade)" effect="dark" size="small">{{ scope.row.grade }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ppm" label="PPM" width="80" />
        <el-table-column prop="lot_accept_rate" label="合格率(%)" width="100" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Cpu } from '@element-plus/icons-vue';
import { qualityApi } from '@/api/quality';
import dayjs from 'dayjs';

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

const gradeType = (g) => ({ A: 'success', B: '', C: 'warning', D: 'danger' }[g] || 'info');
const gradeColor = (g) => ({ A: '#67C23A', B: '#409EFF', C: '#E6A23C', D: '#F56C6C' }[g] || '#909399');

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
    const res = await qualityApi.getSupplierTrend(row.supplier_id);
    trendData.value = (res.data || res) || [];
    trendSupplierName.value = row.supplier_name;
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

:deep(.row-danger) { background-color: #FEF0F0 !important; }
:deep(.row-success) { background-color: #F0F9EB !important; }
</style>
