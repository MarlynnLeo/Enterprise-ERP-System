<!--
/**
 * MaterialDetail.vue - 物料详情
 * @description 物料详情页面
 * @date 2025-12-27
 * @version 1.0.0
 */
-->
<template>
  <div class="material-detail">
    <!-- 导航栏 -->
    <div class="nav-bar">
      <button class="back-btn" @click="goBack">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="title">物料详情</h1>
      <button class="edit-btn" @click="handleEdit">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <van-loading type="spinner" size="24px">加载中...</van-loading>
    </div>

    <!-- 内容区域 -->
    <div v-else-if="material" class="content">
      <!-- 物料头部信息 -->
      <div class="header-card">
        <div class="material-icon"><VanIcon name="orders-o" size="24px" /></div>
        <div class="material-info">
          <h2 class="material-name">{{ material.name }}</h2>
          <p class="material-code">{{ material.code }}</p>
        </div>
        <div class="status-badge" :class="getStatusClass(material.status)">
          {{ getStatusText(material.status) }}
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <h3 class="section-title">基本信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">物料编码</span>
            <span class="value">{{ material.code }}</span>
          </div>
          <div class="info-item">
            <span class="label">物料名称</span>
            <span class="value">{{ material.name }}</span>
          </div>
          <div class="info-item">
            <span class="label">规格型号</span>
            <span class="value">{{ material.specs || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">计量单位</span>
            <span class="value">{{ material.unitName || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">物料分类</span>
            <span class="value">{{ material.categoryName || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">物料类型</span>
            <span class="value">{{ getMaterialTypeText(material.materialType) }}</span>
          </div>
          <div class="info-item">
            <span class="label">物料来源</span>
            <span class="value">{{ material.materialSourceName || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">供应商</span>
            <span class="value">{{ material.supplierName || '-' }}</span>
          </div>
        </div>
      </div>

      <!-- 库存信息 -->
      <div class="info-section">
        <h3 class="section-title">库存信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">安全库存</span>
            <span class="value">{{ material.minStock || 0 }} {{ material.unitName }}</span>
          </div>
          <div class="info-item">
            <span class="label">最大库存</span>
            <span class="value">{{ material.maxStock || 0 }} {{ material.unitName }}</span>
          </div>
          <div class="info-item">
            <span class="label">当前库存</span>
            <span class="value highlight">{{ material.currentStock || 0 }} {{ material.unitName }}</span>
          </div>
          <div class="info-item">
            <span class="label">库存状态</span>
            <span class="value" :class="getStockLevelClass(material)">
              {{ getStockLevelText(material) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 价格信息 -->
      <div class="info-section">
        <h3 class="section-title">价格信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">标准成本</span>
            <span class="value">¥{{ material.standardCost || 0 }}</span>
          </div>
          <div class="info-item">
            <span class="label">最新采购价</span>
            <span class="value">¥{{ material.latestPrice || 0 }}</span>
          </div>
          <div class="info-item">
            <span class="label">平均成本</span>
            <span class="value">¥{{ material.averageCost || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- 其他信息 -->
      <div class="info-section">
        <h3 class="section-title">其他信息</h3>
        <div class="info-grid">
          <div class="info-item full-width">
            <span class="label">备注</span>
            <span class="value">{{ material.remark || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">创建时间</span>
            <span class="value">{{ formatDate(material.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="label">更新时间</span>
            <span class="value">{{ formatDate(material.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else class="error-container">
      <van-empty description="物料信息不存在" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { baseDataApi } from '@/api'
import { showToast } from 'vant'
import dayjs from 'dayjs'

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const material = ref(null)

// 加载物料详情
const loadMaterialDetail = async () => {
  const materialId = route.params.id
  if (!materialId) {
    showToast('物料ID不存在')
    router.back()
    return
  }

  loading.value = true
  try {
    // 加载物料详情
    const response = await baseDataApi.getMaterial(materialId)


    // 处理响应数据
    if (response.data) {
      material.value = response.data
    } else if (response) {
      material.value = response
    }


  } catch (error) {
    console.error('加载物料详情失败:', error)
    showToast('加载失败，请重试')
  } finally {
    loading.value = false
  }
}

// 格式化日期
const formatDate = (date) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

// 获取状态类名
const getStatusClass = (status) => {
  const statusMap = {
    'active': 'status-active',
    'inactive': 'status-inactive',
    'discontinued': 'status-discontinued',
    1: 'status-active',
    0: 'status-inactive',
    '1': 'status-active',
    '0': 'status-inactive'
  }
  return statusMap[status] || 'status-inactive'
}

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    'active': '启用',
    'inactive': '停用',
    'discontinued': '停产',
    1: '启用',
    0: '停用',
    '1': '启用',
    '0': '停用'
  }
  return statusMap[status] ?? '未知'
}

// 获取物料类型文本
const getMaterialTypeText = (type) => {
  const typeMap = {
    finished_goods: '产成品',
    finished_product: '产成品',
    finished: '产成品',
    semi_finished: '半成品',
    raw_material: '原材料',
    packaging: '包装物',
    component: '零部件',
    auxiliary: '辅料'
  }
  return typeMap[type] || type || '-'
}

// 获取库存等级类名
const getStockLevelClass = (material) => {
  const qty = material.currentStock || 0
  const min = material.minStock || 0

  if (qty === 0) return 'stock-empty'
  if (min && qty <= min) return 'stock-low'
  if (min && qty <= min * 2) return 'stock-medium'
  return 'stock-good'
}

// 获取库存等级文本
const getStockLevelText = (material) => {
  const qty = material.currentStock || 0
  const min = material.minStock || 0

  if (qty === 0) return '无库存'
  if (min && qty <= min) return '急需补货'
  if (min && qty <= min * 2) return '正常'
  return '充足'
}

// 返回
const goBack = () => {
  router.back()
}

// 编辑
const handleEdit = () => {
  router.push(`/basedata/materials/${route.params.id}/edit`)
}

// 页面加载时获取数据
onMounted(() => {
  loadMaterialDetail()
})
</script>

<style lang="scss" scoped>
.material-detail {
  min-height: 100%;
  background: var(--bg-primary);
  padding-bottom: var(--app-bottom-space);
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: calc(48px + var(--safe-area-top, 0px));
  margin: 0;
  padding: var(--safe-area-top, 0px) 12px 0;
  background: var(--bg-secondary);
  border: 0;
  border-bottom: 1px solid var(--van-border-color, var(--surface-border));
  border-radius: 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn,
.edit-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;

  svg {
    width: 1.5rem;
    height: 1.5rem;
  }
}

.title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.loading-container,
.error-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
}

.content {
  padding: 0 12px var(--app-bottom-space);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 72px;
  padding: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--surface-border, var(--border-subtle));
  border-radius: 12px;
  box-shadow: none;
}

.material-icon {
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: var(--color-on-primary);
  background: var(--color-primary);
  border-radius: var(--radius-md);
}

.material-info {
  flex: 1;
}

.material-name {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.25rem 0;
}

.material-code {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

.status-badge {
  padding: 0.375rem 0.875rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
}

.status-active {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.status-inactive {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.status-discontinued {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.info-section {
  background: var(--bg-secondary);
  border: 1px solid var(--surface-border, var(--border-subtle));
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: none;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 1rem 0;
  text-transform: uppercase;
  letter-spacing: 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  &.full-width {
    grid-column: 1 / -1;
  }
}

.label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.value {
  font-size: 0.875rem;
  color: var(--text-primary);
  font-weight: 500;

  &.highlight {
    color: var(--color-primary);
    font-size: 1rem;
    font-weight: 600;
  }
}

.stock-empty {
  color: var(--color-error) !important;
}

.stock-low {
  color: var(--color-warning) !important;
}

.stock-medium {
  color: var(--color-info) !important;
}

.stock-good {
  color: var(--color-success) !important;
}
</style>

