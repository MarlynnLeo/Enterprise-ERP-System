<template>
  <div class="spc-container">
    <el-row :gutter="16">
      <!-- 左侧：控制计划列表 -->
      <el-col :span="8">
        <el-card class="box-card">
          <template #header>
            <div class="card-header">
              <span>SPC 控制计划</span>
              <el-button type="primary" size="small" @click="handleAddPlan">
                <el-icon><Plus /></el-icon>新增
              </el-button>
            </div>
          </template>

          <el-input v-model="planKeyword" placeholder="搜索计划" clearable style="margin-bottom:12px" @keyup.enter="fetchPlans">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>

          <div v-loading="planLoading" class="plan-list">
            <div v-for="plan in plans" :key="plan.id"
              class="plan-item" :class="{ active: selectedPlan?.id === plan.id }"
              @click="selectPlan(plan)">
              <div class="plan-name">{{ plan.plan_name }}</div>
              <div class="plan-meta">
                <span>{{ plan.characteristic }}</span>
                <el-tag size="small" :type="plan.is_active ? 'success' : 'info'">{{ plan.is_active ? '启用' : '停用' }}</el-tag>
              </div>
              <div class="plan-detail">
                {{ plan.product_name || '-' }} | 数据点: {{ plan.data_count || 0 }}
              </div>
            </div>
            <el-empty v-if="!planLoading && plans.length === 0" description="暂无控制计划" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：控制图 + CPK -->
      <el-col :span="16">
        <el-card v-if="selectedPlan" class="box-card">
          <template #header>
            <div class="card-header">
              <div>
                <span style="font-size:16px;font-weight:600">{{ selectedPlan.plan_name }}</span>
                <span style="margin-left:12px;color:#909399;font-size:13px">{{ selectedPlan.characteristic }}</span>
              </div>
              <div>
                <el-button type="success" size="small" @click="showDataInput = true">
                  <el-icon><Edit /></el-icon>录入数据
                </el-button>
                <el-button size="small" @click="fetchChartData">
                  <el-icon><Refresh /></el-icon>刷新
                </el-button>
              </div>
            </div>
          </template>

          <div v-loading="chartLoading">
            <!-- CPK 指标卡片 -->
            <el-row :gutter="16" class="cpk-row" v-if="cpkData">
              <el-col :span="4">
                <div class="cpk-card">
                  <div class="cpk-value" :style="{ color: cpkColor(cpkData.cpk) }">{{ cpkData.cpk ?? 'N/A' }}</div>
                  <div class="cpk-label">CPK</div>
                </div>
              </el-col>
              <el-col :span="4">
                <div class="cpk-card">
                  <div class="cpk-value">{{ cpkData.cp ?? 'N/A' }}</div>
                  <div class="cpk-label">CP</div>
                </div>
              </el-col>
              <el-col :span="4">
                <div class="cpk-card">
                  <div class="cpk-value">{{ cpkData.mean ?? 'N/A' }}</div>
                  <div class="cpk-label">均值 (X̄)</div>
                </div>
              </el-col>
              <el-col :span="4">
                <div class="cpk-card">
                  <div class="cpk-value">{{ cpkData.stddev ?? 'N/A' }}</div>
                  <div class="cpk-label">标准差 (σ)</div>
                </div>
              </el-col>
              <el-col :span="4">
                <div class="cpk-card">
                  <div class="cpk-value">{{ cpkData.n || 0 }}</div>
                  <div class="cpk-label">样本数</div>
                </div>
              </el-col>
              <el-col :span="4">
                <div class="cpk-card">
                  <div class="cpk-value" :style="{ color: cpkColor(cpkData.cpk) }">
                    {{ cpkLevel(cpkData.cpk) }}
                  </div>
                  <div class="cpk-label">能力评级</div>
                </div>
              </el-col>
            </el-row>

            <!-- X-bar 图 -->
            <div v-if="chartData?.xbarChart" class="chart-section">
              <h4>X̄ 均值控制图</h4>
              <div class="chart-info">
                UCL={{ chartData.xbarChart.ucl }} | CL={{ chartData.xbarChart.cl }} | LCL={{ chartData.xbarChart.lcl }}
              </div>
              <el-table :data="chartData.xbarChart.data" border size="small" max-height="200">
                <el-table-column prop="subgroup" label="子组#" width="80" />
                <el-table-column prop="value" label="X̄ 值">
                  <template #default="scope">
                    <span :style="{
                      color: scope.row.value > chartData.xbarChart.ucl || scope.row.value < chartData.xbarChart.lcl ? '#F56C6C' : '#303133',
                      fontWeight: scope.row.value > chartData.xbarChart.ucl || scope.row.value < chartData.xbarChart.lcl ? 'bold' : 'normal'
                    }">{{ scope.row.value }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <!-- R 图 -->
            <div v-if="chartData?.rChart" class="chart-section">
              <h4>R 极差控制图</h4>
              <div class="chart-info">
                UCL={{ chartData.rChart.ucl }} | CL={{ chartData.rChart.cl }} | LCL={{ chartData.rChart.lcl }}
              </div>
              <el-table :data="chartData.rChart.data" border size="small" max-height="200">
                <el-table-column prop="subgroup" label="子组#" width="80" />
                <el-table-column prop="value" label="R 值">
                  <template #default="scope">
                    <span :style="{
                      color: scope.row.value > chartData.rChart.ucl ? '#F56C6C' : '#303133',
                      fontWeight: scope.row.value > chartData.rChart.ucl ? 'bold' : 'normal'
                    }">{{ scope.row.value }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <el-empty v-if="!chartData && !chartLoading" description="暂无数据，请先录入测量数据" />
          </div>
        </el-card>

        <el-card v-else class="box-card">
          <el-empty description="请从左侧选择一个控制计划" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增控制计划对话框 -->
    <el-dialog v-model="planDialogVisible" title="新增控制计划" width="550px">
      <el-form ref="planFormRef" :model="planForm" :rules="planRules" label-width="100px">
        <el-form-item label="计划名称" prop="plan_name">
          <el-input v-model="planForm.plan_name" placeholder="如: 外径尺寸控制" />
        </el-form-item>
        <el-form-item label="监控特性" prop="characteristic">
          <el-input v-model="planForm.characteristic" placeholder="如: 外径Φ" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="规格上限" prop="usl">
              <el-input-number v-model="planForm.usl" :precision="4" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="规格下限" prop="lsl">
              <el-input-number v-model="planForm.lsl" :precision="4" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="目标值">
              <el-input-number v-model="planForm.target_value" :precision="4" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="子组大小">
              <el-input-number v-model="planForm.subgroup_size" :min="2" :max="10" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="产品名称">
          <el-input v-model="planForm.product_name" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handlePlanSubmit" :loading="submitting">确认</el-button>
      </template>
    </el-dialog>

    <!-- 数据录入对话框 -->
    <el-dialog v-model="showDataInput" title="录入SPC测量数据" width="500px">
      <el-form label-width="100px">
        <el-form-item label="子组号">
          <el-input-number v-model="dataForm.subgroup_no" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item :label="`样本${i+1}`" v-for="(_, i) in dataForm.samples" :key="i">
          <el-input-number v-model="dataForm.samples[i].measured_value" :precision="4" style="width:100%" placeholder="实测值" />
        </el-form-item>
        <el-form-item>
          <el-button v-permission="'quality:settings:create'" type="primary" link @click="addSample">+ 添加样本</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDataInput = false">取消</el-button>
        <el-button v-permission="'quality:settings:create'" type="primary" @click="handleDataSubmit" :loading="submitting">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Search, Edit, Refresh } from '@element-plus/icons-vue';
import { qualityApi } from '@/api/quality';

const planLoading = ref(false);
const chartLoading = ref(false);
const submitting = ref(false);
const plans = ref([]);
const selectedPlan = ref(null);
const planKeyword = ref('');
const chartData = ref(null);
const cpkData = ref(null);

const planDialogVisible = ref(false);
const showDataInput = ref(false);
const planFormRef = ref(null);

const planForm = ref({ plan_name: '', characteristic: '', usl: null, lsl: null, target_value: null, subgroup_size: 5, product_name: '' });
const planRules = {
  plan_name: [{ required: true, message: '请输入计划名称', trigger: 'blur' }],
  characteristic: [{ required: true, message: '请输入监控特性', trigger: 'blur' }]
};

const dataForm = reactive({
  subgroup_no: 1,
  samples: Array.from({ length: 5 }, () => ({ measured_value: null }))
});

const cpkColor = (cpk) => {
  if (cpk == null) return '#909399';
  if (cpk >= 1.67) return '#67C23A';
  if (cpk >= 1.33) return '#409EFF';
  if (cpk >= 1.0) return '#E6A23C';
  return '#F56C6C';
};

const cpkLevel = (cpk) => {
  if (cpk == null) return '-';
  if (cpk >= 1.67) return '优秀';
  if (cpk >= 1.33) return '良好';
  if (cpk >= 1.0) return '一般';
  return '不足';
};

const fetchPlans = async () => {
  planLoading.value = true;
  try {
    const res = await qualityApi.getSpcPlans({ keyword: planKeyword.value });
    plans.value = (res.data || res)?.list || [];
  } catch (e) { ElMessage.error('获取控制计划失败'); }
  finally { planLoading.value = false; }
};

const selectPlan = (plan) => {
  selectedPlan.value = plan;
  dataForm.subgroup_no = (plan.data_count || 0) + 1;
  dataForm.samples = Array.from({ length: plan.subgroup_size || 5 }, () => ({ measured_value: null }));
  fetchChartData();
};

const fetchChartData = async () => {
  if (!selectedPlan.value) return;
  chartLoading.value = true;
  try {
    const res = await qualityApi.getSpcChart(selectedPlan.value.id);
    const d = res.data || res;
    chartData.value = d.chart;
    cpkData.value = d.cpk;
  } catch (e) { chartData.value = null; cpkData.value = null; }
  finally { chartLoading.value = false; }
};

const handleAddPlan = () => {
  planForm.value = { plan_name: '', characteristic: '', usl: null, lsl: null, target_value: null, subgroup_size: 5, product_name: '' };
  planDialogVisible.value = true;
};

const handlePlanSubmit = () => {
  planFormRef.value?.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      await qualityApi.createSpcPlan(planForm.value);
      ElMessage.success('控制计划创建成功');
      planDialogVisible.value = false;
      fetchPlans();
    } catch (e) { ElMessage.error('创建失败'); }
    finally { submitting.value = false; }
  });
};

const addSample = () => { dataForm.samples.push({ measured_value: null }); };

const handleDataSubmit = async () => {
  const validSamples = dataForm.samples.filter(s => s.measured_value != null);
  if (validSamples.length === 0) { ElMessage.warning('请至少输入一个测量值'); return; }
  submitting.value = true;
  try {
    await qualityApi.addSpcDataPoints({
      plan_id: selectedPlan.value.id,
      subgroup_no: dataForm.subgroup_no,
      samples: validSamples
    });
    ElMessage.success('数据录入成功');
    showDataInput.value = false;
    fetchChartData();
    fetchPlans();
  } catch (e) { ElMessage.error('录入失败'); }
  finally { submitting.value = false; }
};

onMounted(fetchPlans);
</script>

<style scoped>
.spc-container { padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.plan-list { max-height: 600px; overflow-y: auto; }
.plan-item { padding: 12px; border: 1px solid var(--color-border-lighter); border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }
.plan-item:hover { border-color: var(--color-primary); background: var(--color-bg-hover); }
.plan-item.active { border-color: var(--color-primary); background: #ECF5FF; }
.plan-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.plan-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--color-text-regular); }
.plan-detail { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }
.cpk-row { margin-bottom: 20px; }
.cpk-card { text-align: center; padding: 12px 8px; background: var(--color-bg-hover); border-radius: 8px; }
.cpk-value { font-size: 22px; font-weight: 700; }
.cpk-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }
.chart-section { margin-top: 20px; }
.chart-section h4 { margin-bottom: 8px; color: var(--color-text-primary); }
.chart-info { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 8px; }
</style>
