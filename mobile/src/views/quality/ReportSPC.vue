<template>
  <div class="page-container">
    <NavBar title="SPC分析" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <!-- 控制计划列表 -->
        <div class="plan-list" v-if="!selectedPlan">
          <Search v-model="keyword" placeholder="搜索控制计划" @search="fetchPlans" />
          <div v-for="plan in plans" :key="plan.id" class="plan-item" @click="selectPlan(plan)">
            <div class="plan-header">
              <span class="plan-name">{{ plan.plan_name }}</span>
              <Tag :type="plan.is_active ? 'success' : 'default'" size="medium">{{ plan.is_active ? '启用' : '停用' }}</Tag>
            </div>
            <div class="plan-meta">{{ plan.characteristic }} | {{ plan.product_name || '--' }}</div>
            <div class="plan-meta">数据点: {{ plan.data_count || 0 }}</div>
          </div>
          <Empty v-if="plans.length === 0" description="暂无控制计划" />
        </div>

        <!-- 计划详情 + CPK -->
        <div v-else>
          <div class="detail-header" @click="selectedPlan = null">
            <Icon name="arrow-left" /> <span>{{ selectedPlan.plan_name }}</span>
          </div>

          <Loading v-if="detailLoading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
          <template v-else>
          <!-- CPK 指标 -->
          <div class="cpk-cards" v-if="cpkData">
            <div class="cpk-card">
              <div class="cpk-val" :style="{ color: cpkColor(cpkData.cpk) }">{{ cpkData.cpk ?? 'N/A' }}</div>
              <div class="cpk-label">CPK</div>
            </div>
            <div class="cpk-card">
              <div class="cpk-val">{{ cpkData.cp ?? 'N/A' }}</div>
              <div class="cpk-label">CP</div>
            </div>
            <div class="cpk-card">
              <div class="cpk-val">{{ cpkData.mean ?? 'N/A' }}</div>
              <div class="cpk-label">均值</div>
            </div>
            <div class="cpk-card">
              <div class="cpk-val">{{ cpkData.stddev ?? 'N/A' }}</div>
              <div class="cpk-label">标准差</div>
            </div>
            <div class="cpk-card">
              <div class="cpk-val">{{ cpkData.usl ?? 'N/A' }}</div>
              <div class="cpk-label">USL</div>
            </div>
            <div class="cpk-card">
              <div class="cpk-val">{{ cpkData.lsl ?? 'N/A' }}</div>
              <div class="cpk-label">LSL</div>
            </div>
          </div>

          <!-- 控制图数据 -->
          <CellGroup inset title="控制图数据点">
            <Cell v-for="(pt, i) in chartPoints" :key="i" :title="`#${i+1}`" :value="pt.value" :label="pt.timestamp ? formatTime(pt.timestamp) : ''" />
            <Cell v-if="chartPoints.length === 0" title="暂无数据点" />
          </CellGroup>
          <CellGroup v-if="chartData.ucl != null" inset title="控制限">
            <Cell title="中心线 (CL)" :value="String(chartData.cl ?? '--')" />
            <Cell title="上控制限 (UCL)" :value="String(chartData.ucl ?? '--')" />
            <Cell title="下控制限 (LCL)" :value="String(chartData.lcl ?? '--')" />
          </CellGroup>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell, Loading, Empty, Search, Tag, Icon, showToast } from 'vant'
  import { qualityApi } from '@/services/api'
  import { extractApiData, extractApiList } from '@/utils/apiHelper'
  import dayjs from 'dayjs'

  const loading = ref(true)
  const keyword = ref('')
  const plans = ref([])
  const selectedPlan = ref(null)
  const cpkData = ref(null)
  const chartData = ref({})
  const chartPoints = ref([])

  const cpkColor = (v) => {
    if (v == null) return '#909399'
    if (v >= 1.33) return '#67C23A'
    if (v >= 1.0) return '#E6A23C'
    return '#F56C6C'
  }

  const formatTime = (ts) => dayjs(ts).format('MM-DD HH:mm')

  const detailLoading = ref(false)

  const fetchPlans = async () => {
    try {
      const res = await qualityApi.getSpcPlans({ keyword: keyword.value })
      plans.value = extractApiList(res)
    } catch (e) {
      console.error('获取控制计划失败:', e)
      plans.value = []
      showToast('获取控制计划失败')
    } finally {
      loading.value = false
    }
  }

  const selectPlan = async (plan) => {
    selectedPlan.value = plan
    cpkData.value = null
    chartData.value = {}
    chartPoints.value = []
    detailLoading.value = true
    try {
      const [cpkRes, chartRes] = await Promise.allSettled([
        qualityApi.getSpcCpk(plan.id),
        qualityApi.getSpcChart(plan.id)
      ])
      if (cpkRes.status === 'fulfilled') cpkData.value = extractApiData(cpkRes.value)
      if (chartRes.status === 'fulfilled') {
        const cd = extractApiData(chartRes.value)
        chartData.value = cd || {}
        chartPoints.value = Array.isArray(cd?.dataPoints) ? cd.dataPoints : (Array.isArray(cd) ? cd : [])
      }
    } catch (e) {
      console.error('加载SPC详情失败:', e)
      showToast('加载失败')
    } finally {
      detailLoading.value = false
    }
  }

  onMounted(fetchPlans)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }

  .plan-item {
    background: var(--van-background);
    border: 1px solid var(--van-border-color);
    border-radius: 10px; padding: 12px; margin-bottom: 8px;
  }
  .plan-header { display: flex; justify-content: space-between; align-items: center; }
  .plan-name { font-weight: 600; color: var(--text-primary); font-size: 0.9375rem; }
  .plan-meta { font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; }

  .detail-header {
    display: flex; align-items: center; gap: 6px; padding: 8px 0 12px;
    font-weight: 600; font-size: 1rem; color: var(--color-primary);
  }

  .cpk-cards {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;
  }
  .cpk-card {
    background: var(--van-background);
    border: 1px solid var(--van-border-color);
    border-radius: 8px; padding: 10px; text-align: center;
  }
  .cpk-val { font-size: 1.125rem; font-weight: 700; }
  .cpk-label { font-size: 0.7rem; color: var(--text-secondary); margin-top: 2px; }
</style>
