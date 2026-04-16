<template>
    <div class="page-container">
        <!-- 导航栏 -->
        <div class="nav-bar">
            <button class="back-btn" @click="router.back()">
                <Icon name="arrow-left" size="1.25rem" />
            </button>
            <h1 class="page-title">销售订单详情</h1>
            <div class="nav-actions">
            </div>
        </div>

        <div class="content-scroll" v-if="order">
            <!-- 状态卡片 -->
            <div class="status-section">
                <div class="detail-card status-card">
                    <div class="status-icon" :class="statusClass[order.status]">
                        <Icon :name="getStatusIcon(order.status)" size="1.5rem" />
                    </div>
                    <div class="status-info">
                        <h2 class="status-text">{{ getStatusText(order.status) }}</h2>
                        <p class="order-code">{{ order.code }}</p>
                    </div>
                    <div class="status-date">
                        {{ formatDate(order.created_at) }}
                    </div>
                </div>
            </div>

            <!-- 客户信息 -->
            <div class="section-title">客户信息</div>
            <div class="detail-card info-card">
                <div class="info-row">
                    <span class="info-label">客户名称</span>
                    <span class="info-value">{{ order.customer_name }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">联系人</span>
                    <span class="info-value">{{ order.contact_person || '-' }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">联系电话</span>
                    <span class="info-value">{{ order.contact_phone || '-' }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">销售员</span>
                    <span class="info-value">{{ order.salesperson_name || '-' }}</span>
                </div>
            </div>

            <!-- 订单金额 -->
            <div class="section-title">订单金额</div>
            <div class="detail-card info-card">
                <div class="info-row">
                    <span class="info-label">订单总额</span>
                    <span class="info-value highlight-money">¥ {{ formatMoney(order.total_amount) }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">已付金额</span>
                    <span class="info-value">¥ {{ formatMoney(order.paid_amount) }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">交付日期</span>
                    <span class="info-value">{{ formatDate(order.delivery_date, 'YYYY-MM-DD') }}</span>
                </div>
            </div>

            <!-- 订单明细 -->
            <div class="section-title">订单明细 ({{ order.items ? order.items.length : 0 }})</div>
            <div class="items-list">
                <div class="basic-list-item" v-for="item in order.items" :key="item.id">
       <div class="item-title-row">
         <div class="item-title">{{ item.material_name }}</div>
         <div class="item-subtitle">{{ `SKU: ${item.material_code}` || '' }}</div>
       </div>
                    <div class="item-details">
                        <div class="detail-row">
                            <span class="detail-label">数量:</span>
                            <span class="detail-value">{{ item.quantity }} {{ item.unit_name }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">单价:</span>
                            <span class="detail-value">¥ {{ formatMoney(item.price) }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">小计:</span>
                            <span class="detail-value highlight-money">¥ {{ formatMoney(item.amount) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 加载中 -->
        <div class="loading-container" v-else-if="loading">
            <van-loading size="24px" vertical color="#a855f7">加载中...</van-loading>
        </div>

        <!-- 错误/空状态 -->
        <div class="empty-container" v-else>
            <Icon name="document-text" size="4rem" class="text-gray-500 mb-4" />
            <p>未找到订单信息</p>
            <Button class="mt-4" size="sm" @click="fetchDetail">重试</Button>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {  showToast , Button } from 'vant'
import { salesApi } from '@/services/api'
import Icon from '@/components/icons/index.vue'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const id = route.params.id

const loading = ref(true)
const order = ref(null)

// 状态样式映射
const statusClass = {
    pending: 'bg-yellow-500',
    confirmed: 'bg-blue-500',
    shipping: 'bg-indigo-500',
    completed: 'bg-green-500',
    cancelled: 'bg-gray-500'
}

// 获取详情
const fetchDetail = async () => {
    loading.value = true
    try {
        const res = await salesApi.getSalesOrder(id)
        order.value = res.data || res
    } catch (error) {
        console.error('获取销售订单详情失败:', error)
        showToast('加载失败')
    } finally {
        loading.value = false
    }
}

// 状态文本
const getStatusText = (status) => {
    const map = {
        pending: '待确认',
        confirmed: '已确认',
        shipping: '发货中',
        completed: '已完成',
        cancelled: '已取消'
    }
    return map[status] || status
}

// 状态图标
const getStatusIcon = (status) => {
    const map = {
        pending: 'clock',
        confirmed: 'check',
        shipping: 'truck',
        completed: 'check-circle',
        cancelled: 'x-circle'
    }
    return map[status] || 'document-text'
}

// 格式化日期
const formatDate = (date, format = 'YYYY-MM-DD HH:mm') => {
    return date ? dayjs(date).format(format) : '-'
}

// 格式化金额
const formatMoney = (amount) => {
    return Number(amount || 0).toFixed(2)
}

onMounted(() => {
    fetchDetail()
})
</script>

<style lang="scss" scoped>
.page-container {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 20px;
    display: flex;
    flex-direction: column;
}

.nav-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--bg-secondary);
    backdrop-filter: blur(20px);
    position: sticky;
    top: 0;
    z-index: 50;
}

.back-btn {
    background: none;
    border: none;
    color: white;
    padding: 0.5rem;
    margin-left: -0.5rem;
    cursor: pointer;
}

.page-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
}

.nav-actions {
    width: 2rem;
}

.content-scroll {
    padding: 1rem;
}

.status-section {
    margin-bottom: 1.5rem;
}

.status-card {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.status-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: none;
}

.status-info {
    flex: 1;
}

.status-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin-bottom: 0.25rem;
}

.order-code {
    font-size: 0.875rem;
    color: var(--text-secondary);
}

.status-date {
    font-size: 0.75rem;
    color: var(--text-tertiary);
}

.section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
    margin-top: 1.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.info-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.info-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    font-size: 0.875rem;
}

.info-label {
    color: var(--text-secondary);
    min-width: 5rem;
}

.info-value {
    color: white;
    text-align: right;
    flex: 1;
}

.highlight-money {
    color: #fbbf24;
    font-family: monospace;
    font-weight: 600;
}

.items-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.item-details {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--van-border-color);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
}

.detail-label {
    color: var(--text-tertiary);
}

.detail-value {
    color: var(--text-primary);
}

.loading-container,
.empty-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-tertiary);
}

/* 状态颜色 */
.bg-yellow-500 {
    background: linear-gradient(135deg, #f59e0b, #d97706);
}

.bg-blue-500 {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.bg-indigo-500 {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
}

.bg-green-500 {
    background: linear-gradient(135deg, #10b981, #059669);
}

.bg-gray-500 {
    background: linear-gradient(135deg, #6b7280, #4b5563);
}

.basic-list-item {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--glass-border);
}
.item-title-row {
  margin-bottom: 8px;
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: 8px;
}
.item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.item-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}
</style>
