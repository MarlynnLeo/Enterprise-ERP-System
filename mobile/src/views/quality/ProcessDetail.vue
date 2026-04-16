<!--
/**
 * ProcessDetail.vue
 * @description 杩囩▼妫€楠岃鎯呴〉闈? * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="杩囩▼妫€楠岃鎯? left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="inspection">
      <!-- 鐘舵€佸崱鐗?-->
      <div class="status-card">
        <div class="status-badge" :class="getStatusClass(inspection.status)">
          {{ getStatusLabel(inspection.status) }}
        </div>
        <div class="inspection-no">
          {{ inspection.inspection_number || inspection.inspection_no }}
        </div>
      </div>

      <!-- 鍩烘湰淇℃伅 -->
      <CellGroup inset title="鍩烘湰淇℃伅">
        <Cell title="宸ュ崟鍙? :value="inspection.production_order_no || '--'" />
        <Cell title="鐢熶骇宸ュ簭" :value="inspection.process_name || '--'" />
        <Cell title="鐗╂枡鍚嶇О" :value="inspection.material_name || '--'" />
        <Cell
          title="妫€楠屾棩鏈?
          :value="formatDate(inspection.inspection_date || inspection.created_at)"
        />
      </CellGroup>

      <!-- 鏁伴噺淇℃伅 -->
      <CellGroup inset title="鏁伴噺淇℃伅">
        <Cell title="寰呮鏁伴噺" :value="`${inspection.quantity || 0} ${inspection.unit || '浠?}`" />
        <Cell title="鎶芥鏁伴噺" :value="`${inspection.sample_size || 0}`" />
      </CellGroup>

      <!-- 妫€楠岀粨鏋?-->
      <CellGroup v-if="inspection.status !== 'pending'" inset title="妫€楠岀粨鏋滃綍鍏?>
        <Field
          v-model="inspectForm.qualified_quantity"
          type="digit"
          label="鍚堟牸鏁伴噺"
          placeholder="璇疯緭鍏ユ湁鏁堝悎鏍兼暟"
          :readonly="inspection.status !== 'in_progress'"
        />
        <Field
          v-model="inspectForm.unqualified_quantity"
          type="digit"
          label="涓嶅悎鏍兼暟閲?
          placeholder="璇疯緭鍏ヤ笉鍚堟牸鏁?
          :readonly="inspection.status !== 'in_progress'"
        />
        <Cell title="鍚堟牸鐜? :value="`${calculatePassRate()}%`" />
      </CellGroup>

      <!-- 澶囨敞 -->
      <CellGroup inset title="澶囨敞">
        <Field
          v-model="inspectForm.remark"
          type="textarea"
          rows="2"
          autosize
          label="澶囨敞褰曞叆"
          placeholder="璇疯緭鍏ヨˉ鍏呰鏄?
          :readonly="inspection.status !== 'in_progress' && inspection.status !== 'pending'"
        />
      </CellGroup>

      <!-- 鎿嶄綔鎸夐挳 -->
      <div class="action-section" v-if="inspection.status === 'pending'">
        <Button round block type="primary" @click="handleStart"> 寮€濮嬫楠?</Button>
      </div>
      <div class="action-section" v-else-if="inspection.status === 'in_progress'">
        <Button round block type="success" @click="handleComplete"> 鎻愪氦骞跺畬鎴愭楠?</Button>
      </div>
    </div>

    <!-- 鍔犺浇鐘舵€?-->
    <div v-else class="loading-container">
      <Loading size="36" />
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, reactive } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import {
    NavBar,
    CellGroup,
    Cell,
    Field,
    Button,
    Loading,
    showToast,
    showConfirmDialog
  } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()
  const inspection = ref(null)

  const inspectForm = reactive({
    qualified_quantity: 0,
    unqualified_quantity: 0,
    remark: ''
  })

  const getStatusLabel = (status) => {
    const map = {
      pending: '寰呮楠?,
      in_progress: '妫€楠屼腑',
      completed: '宸插畬鎴?,
      passed: '妫€楠屽強鏍?,
      failed: '涓嶅強鏍?
    }
    return map[status] || status
  }

  const getStatusClass = (status) => {
    const map = {
      pending: 'pending',
      in_progress: 'in-progress',
      completed: 'completed',
      passed: 'received',
      failed: 'failed'
    }
    return map[status] || 'default'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const calculatePassRate = () => {
    const q = Number(inspectForm.qualified_quantity) || 0
    const uq = Number(inspectForm.unqualified_quantity) || 0
    const total = q + uq
    if (total === 0) return 0
    return Math.round((q / total) * 100)
  }

  const loadDetail = () => {
    if (route.query.data) {
      try {
        inspection.value = JSON.parse(route.query.data)
        inspectForm.qualified_quantity =
          inspection.value.qualified_quantity || inspection.value.quantity || 0
        inspectForm.unqualified_quantity = inspection.value.unqualified_quantity || 0
        inspectForm.remark = inspection.value.remark || ''
      } catch (e) {
        console.error('瑙ｆ瀽妫€楠屾暟鎹け璐?', e)
        showToast('鏁版嵁鍔犺浇澶辫触')
      }
    } else {
      loadFromApi()
    }
  }

  const loadFromApi = async () => {
    try {
      const response = await qualityApi.getProcessInspections({ id: route.params.id, limit: 1 })
      const data = response.data || response
      const items = data.items || data.list || data.inspections || []
      if (items.length > 0) {
        inspection.value = items[0]
        inspectForm.qualified_quantity =
          inspection.value.qualified_quantity || inspection.value.quantity || 0
        inspectForm.unqualified_quantity = inspection.value.unqualified_quantity || 0
        inspectForm.remark = inspection.value.remark || ''
      } else {
        showToast('鏈壘鍒版楠岃褰?)
      }
    } catch (error) {
      console.error('鍔犺浇璇︽儏澶辫触:', error)
      showToast('鍔犺浇澶辫触')
    }
  }

  const handleStart = async () => {
    try {
      await qualityApi.startInspection(inspection.value.id)
      showToast('妫€楠屽凡寮€濮?)
      inspection.value.status = 'in_progress'
    } catch (error) {
      console.error('寮€濮嬫楠屽け璐?', error)
      showToast('鎿嶄綔澶辫触')
    }
  }

  const handleComplete = async () => {
    const q = Number(inspectForm.qualified_quantity) || 0
    const uq = Number(inspectForm.unqualified_quantity) || 0
    if (q + uq <= 0) {
      showToast('璇疯緭鍏ユ湁鏁堢殑鏁伴噺')
      return
    }

    try {
      await showConfirmDialog({ title: '纭瀹屾垚', message: '纭畾瀹屾垚姝ゆ妫€楠岃褰曟彁浜ゅ悧锛? })
      await qualityApi.completeInspection(inspection.value.id, {
        qualified_quantity: q,
        unqualified_quantity: uq,
        status: 'completed',
        remark: inspectForm.remark
      })
      showToast('妫€楠屽凡瀹屾垚')
      inspection.value.status = 'completed'
      setTimeout(() => {
        router.go(-1)
      }, 1000)
    } catch (error) {
      console.error('瀹屾垚妫€楠屽け璐?', error)
      showToast('鎿嶄綔澶辫触')
    }
  }

  onMounted(() => {
    loadDetail()
  })
</script>

<style scoped>
  .detail-page {
    min-height: 100vh;
    background-color: var(--van-background-2);
    padding-bottom: 80px;
  }
  .content-container {
    padding: 12px 0;
  }
  .status-card {
    background: var(--van-background);
    margin: 0 16px 12px;
    padding: 20px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: none;
  }
  .status-badge {
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .inspection-no {
    font-size: 1.125rem;
    font-weight: bold;
    color: var(--van-text-color);
  }
  .action-section {
    margin: 24px 16px;
  }
  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 60vh;
  }
</style>
