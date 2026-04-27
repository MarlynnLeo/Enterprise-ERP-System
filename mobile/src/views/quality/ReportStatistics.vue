<template>
  <div class="page-container">
    <NavBar title="质量统计" left-arrow @click-left="$router.go(-1)" />
    <PullRefresh v-model="refreshing" @refresh="fetchAllData">
      <div class="page-body">
        <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
        <template v-else>
          <!-- 概览卡片 -->
          <div class="stat-cards">
            <div class="stat-card" v-for="item in overviewCards" :key="item.label">
              <div class="stat-value" :style="{ color: item.color }">{{ item.value }}</div>
              <div class="stat-label">{{ item.label }}</div>
            </div>
          </div>

          <!-- 处置方式分布 -->
          <CellGroup inset title="处置方式分布">
            <Cell v-for="row in dispositionList" :key="row.label" :title="row.label">
              <template #value>
                <div class="bar-row">
                  <div class="bar-fill" :style="{ width: row.percent + '%', background: row.color }"></div>
                  <span class="bar-num">{{ row.count }}</span>
                </div>
              </template>
            </Cell>
            <Cell v-if="dispositionList.length === 0" title="暂无数据" />
          </CellGroup>

          <!-- 成本分析 -->
          <CellGroup inset title="质量成本分析">
            <Cell title="返工成本" :value="`¥${formatCost(costData.rework_cost)}`" value-class="cost-blue" />
            <Cell title="报废成本" :value="`¥${formatCost(costData.scrap_cost)}`" value-class="cost-red" />
            <Cell title="退货成本" :value="`¥${formatCost(costData.return_cost)}`" value-class="cost-orange" />
            <Cell title="总质量成本" :value="`¥${formatCost(costData.total_cost)}`" value-class="cost-bold" />
          </CellGroup>

          <!-- 供应商质量排名 -->
          <CellGroup inset title="供应商质量排名">
            <Cell v-for="(s, i) in supplierList" :key="i" :title="`${i+1}. ${s.supplier_name || '--'}`" :value="`不合格 ${s.ncp_count || 0} 件`" :label="`合格率 ${s.pass_rate ?? '--'}%`" />
            <Cell v-if="supplierList.length === 0" title="暂无数据" />
          </CellGroup>

          <!-- 物料缺陷排名 -->
          <CellGroup inset title="物料缺陷排名 TOP10">
            <Cell v-for="(m, i) in materialList" :key="i" :title="`${i+1}. ${m.material_name || '--'}`" :value="`${m.ncp_count || 0} 件`" :label="m.material_code || ''" />
            <Cell v-if="materialList.length === 0" title="暂无数据" />
          </CellGroup>
        </template>
      </div>
    </PullRefresh>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell, Loading, PullRefresh } from 'vant'
  import { qualityApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const refreshing = ref(false)
  const overviewCards = ref([])
  const dispositionList = ref([])
  const costData = ref({})
  const supplierList = ref([])
  const materialList = ref([])

  const dispositionLabels = { return: '退货', rework: '返工', scrap: '报废', use_as_is: '让步接收', pending: '待处理', replacement: '换货' }
  const dispositionColors = { return: '#F56C6C', rework: '#E6A23C', scrap: '#909399', use_as_is: '#67C23A', pending: '#5E7BF6', replacement: '#00b4d8' }

  const formatCost = (v) => {
    if (v == null) return '0.00'
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const fetchAllData = async () => {
    try {
      const [ovRes, dispRes, costRes, supRes, matRes] = await Promise.allSettled([
        qualityApi.getStatisticsOverview(),
        qualityApi.getDispositionStatistics(),
        qualityApi.getCostAnalysis(),
        qualityApi.getSupplierQualityAnalysis(),
        qualityApi.getMaterialDefectAnalysis()
      ])

      // 概览
      const ov = ovRes.status === 'fulfilled' ? extractApiData(ovRes.value) : {}
      overviewCards.value = [
        { label: '不合格品总数', value: ov.total_ncp ?? 0, color: '#5E7BF6' },
        { label: '待处理', value: ov.pending_count ?? 0, color: '#FFAA00' },
        { label: '退货', value: ov.return_count ?? 0, color: '#F56C6C' },
        { label: '返工', value: ov.rework_count ?? 0, color: '#E6A23C' },
        { label: '报废', value: ov.scrap_count ?? 0, color: '#909399' },
        { label: '让步接收', value: ov.use_as_is_count ?? 0, color: '#67C23A' }
      ]

      // 处置分布
      const dispArr = dispRes.status === 'fulfilled' ? (extractApiData(dispRes.value)) : []
      const arr = Array.isArray(dispArr) ? dispArr : []
      const maxCount = Math.max(...arr.map(d => d.count || 0), 1)
      dispositionList.value = arr.map(d => ({
        label: dispositionLabels[d.disposition] || d.disposition,
        count: d.count || 0,
        percent: Math.round(((d.count || 0) / maxCount) * 100),
        color: dispositionColors[d.disposition] || '#5E7BF6'
      }))

      // 成本
      costData.value = costRes.status === 'fulfilled' ? extractApiData(costRes.value) : {}

      // 供应商
      const supData = supRes.status === 'fulfilled' ? extractApiData(supRes.value) : []
      supplierList.value = (Array.isArray(supData) ? supData : []).slice(0, 10)

      // 物料
      const matData = matRes.status === 'fulfilled' ? extractApiData(matRes.value) : []
      materialList.value = (Array.isArray(matData) ? matData : []).slice(0, 10)
    } catch { /* 静默 */ } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  onMounted(fetchAllData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
  .stat-cards {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;
  }
  .stat-card {
    background: var(--van-background);
    border: 1px solid var(--van-border-color);
    border-radius: 10px; padding: 12px 8px; text-align: center;
  }
  .stat-value { font-size: 1.25rem; font-weight: 700; }
  .stat-label { font-size: 0.7rem; color: var(--text-secondary); margin-top: 2px; }

  .bar-row { display: flex; align-items: center; gap: 6px; min-width: 120px; }
  .bar-fill { height: 14px; border-radius: 7px; min-width: 4px; transition: width 0.3s; }
  .bar-num { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); }

  :deep(.cost-blue) { color: #5E7BF6 !important; font-weight: 600; }
  :deep(.cost-red) { color: #F56C6C !important; font-weight: 600; }
  :deep(.cost-orange) { color: #E6A23C !important; font-weight: 600; }
  :deep(.cost-bold) { color: var(--text-primary) !important; font-weight: 700; font-size: 1rem; }
</style>
