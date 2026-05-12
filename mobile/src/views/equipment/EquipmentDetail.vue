<template>
  <div class="equipment-detail-page">
    <NavBar title="设备详情" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="state">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else-if="equipment" class="content">
      <CellGroup inset title="基本信息">
        <Cell title="设备名称" :value="equipment.name || '-'" />
        <Cell title="设备编码" :value="equipment.code || equipment.equipment_code || '-'" />
        <Cell title="型号" :value="equipment.model || '-'" />
        <Cell title="状态" :value="getStatusText(equipment.status)" />
        <Cell title="所在位置" :value="equipment.location || equipment.location_name || '-'" />
        <Cell title="负责人" :value="equipment.responsible_person || equipment.manager_name || '-'" />
      </CellGroup>

      <CellGroup inset title="维护信息">
        <Cell title="购置日期" :value="formatDate(equipment.purchase_date)" />
        <Cell title="启用日期" :value="formatDate(equipment.start_date || equipment.use_date)" />
        <Cell title="上次保养" :value="formatDate(equipment.last_maintenance_date)" />
        <Cell title="下次保养" :value="formatDate(equipment.next_maintenance_date)" />
      </CellGroup>

      <CellGroup v-if="equipment.remark || equipment.description" inset title="备注">
        <Cell :title="equipment.remark || equipment.description" />
      </CellGroup>
    </div>

    <div v-else class="state">
      <Empty description="设备不存在或已被删除" />
      <Button type="primary" round @click="router.back()">返回</Button>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, CellGroup, Cell, Loading, Empty, Button, showToast } from 'vant'
  import { equipmentApi } from '@/services/api'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(true)
  const equipment = ref(null)

  const getStatusText = (status) => {
    const map = {
      normal: '正常',
      maintenance: '保养中',
      repair: '维修中',
      idle: '闲置',
      scrapped: '报废'
    }
    return map[status] || status || '-'
  }

  const formatDate = (value) => {
    if (!value) return '-'
    return String(value).slice(0, 10)
  }

  const loadEquipment = async () => {
    try {
      loading.value = true
      const response = await equipmentApi.getById(route.params.id)
      equipment.value = response.data || response
    } catch (error) {
      console.error('加载设备详情失败:', error)
      showToast('加载设备详情失败')
      equipment.value = null
    } finally {
      loading.value = false
    }
  }

  onMounted(loadEquipment)
</script>

<style lang="scss" scoped>
  .equipment-detail-page {
    min-height: 100vh;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .state {
    min-height: 60vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
  }
</style>
