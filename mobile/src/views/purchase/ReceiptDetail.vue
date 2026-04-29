<!--
/**
 * ReceiptDetail.vue
 * @description 采购入库详情 - 对齐网页端操作逻辑
 * @date 2026-04-25
 * @version 2.0.0
 */
-->
<template>
    <div class="page-container">
        <!-- 导航栏 -->
        <NavBar title="采购入库详情" left-arrow @click-left="router.back()" />

        <div class="content-scroll" v-if="receiptOrder">
            <!-- 状态卡片 -->
            <div class="status-section">
                <div class="detail-card status-card">
                    <div class="status-icon" :class="statusClass[receiptOrder.status]">
                        <Icon :name="getStatusIcon(receiptOrder.status)" size="1.5rem" />
                    </div>
                    <div class="status-info">
                        <h2 class="status-text">{{ getStatusText(receiptOrder.status) }}</h2>
                        <p class="order-code">{{ receiptOrder.receipt_no }}</p>
                    </div>
                    <div class="status-date">
                        {{ formatDate(receiptOrder.created_at) }}
                    </div>
                </div>
            </div>

            <!-- 基本信息 -->
            <div class="section-title">基本信息</div>
            <div class="detail-card info-card">
                <div class="info-row">
                    <span class="info-label">关联订单</span>
                    <span class="info-value">{{ receiptOrder.order_no || '-' }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">供应商</span>
                    <span class="info-value">{{ receiptOrder.supplier_name }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">入库日期</span>
                    <span class="info-value">{{ formatDate(receiptOrder.receipt_date, 'YYYY-MM-DD') || '-' }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">收货人</span>
                    <span class="info-value">{{ receiptOrder.receiver || receiptOrder.operator || '-' }}</span>
                </div>
                <div class="info-row" v-if="receiptOrder.warehouse_name">
                    <span class="info-label">入库仓库</span>
                    <span class="info-value">{{ receiptOrder.warehouse_name }}</span>
                </div>
                <div class="info-row" v-if="receiptOrder.remarks || receiptOrder.remark">
                    <span class="info-label">备注</span>
                    <span class="info-value">{{ receiptOrder.remarks || receiptOrder.remark }}</span>
                </div>
            </div>

            <!-- 物料列表 -->
            <div class="section-title">物料明细 ({{ receiptOrder.items ? receiptOrder.items.length : 0 }})</div>
            <div class="items-list">
                <div class="basic-list-item" v-for="item in receiptOrder.items" :key="item.id">
                    <div class="item-title-row">
                        <div class="item-title">{{ item.material_name }}</div>
                        <div class="item-subtitle">{{ `SKU: ${item.material_code}` || '' }}</div>
                    </div>
                    <div class="item-details">
                        <div class="detail-row">
                            <span class="detail-label">订单数量:</span>
                            <span class="detail-value">{{ item.ordered_quantity || 0 }} {{ item.unit_name }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">实收数量:</span>
                            <span class="detail-value highlight">{{ item.received_quantity || '-' }} {{ item.unit_name }}</span>
                        </div>
                        <div class="detail-row" v-if="item.batch_no || item.batch_number">
                            <span class="detail-label">批次号:</span>
                            <span class="detail-value">{{ item.batch_no || item.batch_number }}</span>
                        </div>
                        <div class="detail-row" v-if="item.qualified_quantity != null">
                            <span class="detail-label">合格数量:</span>
                            <span class="detail-value">{{ item.qualified_quantity }} {{ item.unit_name }}</span>
                        </div>
                        <div class="detail-row" v-if="item.specification || item.specs">
                            <span class="detail-label">规格:</span>
                            <span class="detail-value">{{ item.specification || item.specs }}</span>
                        </div>
                        <div class="detail-row" v-if="item.price > 0">
                            <span class="detail-label">单价:</span>
                            <span class="detail-value">¥{{ parseFloat(item.price).toFixed(2) }}</span>
                        </div>
                        <div class="detail-row" v-if="item.warehouse_name">
                            <span class="detail-label">入库仓库:</span>
                            <span class="detail-value">{{ item.warehouse_name }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 操作按钮 — 严格对齐网页端：draft → 入库/取消 -->
            <div class="action-section" v-if="receiptOrder.status === 'draft'" v-permission="'purchase:receipts:update'">
                <Button type="success" round block size="large" @click="handleComplete" :loading="actionLoading" style="margin-bottom: 10px">
                    确认入库
                </Button>
                <Button type="warning" round block size="large" plain @click="handleCancel" :loading="actionLoading">
                    取消收货单
                </Button>
            </div>
        </div>

        <!-- 加载中 -->
        <div class="loading-container" v-else-if="loading">
            <van-loading size="24px" vertical color="#a855f7">加载中...</van-loading>
        </div>

        <!-- 错误/空状态 -->
        <div class="empty-container" v-else>
            <Icon name="document-text" size="4rem" class="text-gray-500 mb-4" />
            <p>未找到入库单信息</p>
            <Button class="mt-4" size="sm" @click="fetchDetail">重试</Button>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog, Button } from 'vant'
import { purchaseApi } from '@/services/api'
import Icon from '@/components/icons/index.vue'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const id = route.params.id

const loading = ref(true)
const actionLoading = ref(false)
const receiptOrder = ref(null)

// 状态样式映射
const statusClass = {
    draft: 'bg-yellow-500',
    pending: 'bg-yellow-500',
    confirmed: 'bg-blue-500',
    processing: 'bg-blue-500',
    completed: 'bg-green-500',
    cancelled: 'bg-gray-500'
}

// 获取详情
const fetchDetail = async () => {
    loading.value = true
    try {
        const res = await purchaseApi.getReceipt(id)
        receiptOrder.value = res.data?.data || res.data || res
    } catch (error) {
        console.error('获取采购入库单详情失败:', error)
        showToast('加载失败')
    } finally {
        loading.value = false
    }
}

// 状态文本
const getStatusText = (status) => {
    const map = {
        draft: '草稿',
        pending: '待入库',
        confirmed: '已确认',
        processing: '入库中',
        completed: '已完成',
        cancelled: '已取消'
    }
    return map[status] || status
}

// 状态图标
const getStatusIcon = (status) => {
    const map = {
        draft: 'clock',
        pending: 'clock',
        confirmed: 'check-circle',
        processing: 'refresh',
        completed: 'check-circle',
        cancelled: 'x-circle'
    }
    return map[status] || 'document-text'
}

// 格式化日期
const formatDate = (date, format = 'YYYY-MM-DD HH:mm') => {
    return date ? dayjs(date).format(format) : '-'
}

// 确认入库 (draft → completed)
const handleComplete = async () => {
    try {
        await showConfirmDialog({
            title: '确认入库',
            message: '确认将该收货单标记为已入库？库存数量将相应增加。'
        })
        actionLoading.value = true
        await purchaseApi.updateReceiptStatus(id, 'completed', '移动端确认入库')
        showToast({ type: 'success', message: '入库成功' })
        await fetchDetail()
    } catch (e) {
        if (e !== 'cancel') {
            console.error('执行入库失败:', e)
            showToast(e.response?.data?.message || '操作失败')
        }
    } finally {
        actionLoading.value = false
    }
}

// 取消收货单 (draft → cancelled)
const handleCancel = async () => {
    try {
        await showConfirmDialog({
            title: '取消确认',
            message: '确定取消该收货单？'
        })
        actionLoading.value = true
        await purchaseApi.updateReceiptStatus(id, 'cancelled', '移动端取消')
        showToast('收货单已取消')
        await fetchDetail()
    } catch (e) {
        if (e !== 'cancel') {
            console.error('取消收货单失败:', e)
            showToast(e.response?.data?.message || '操作失败')
        }
    } finally {
        actionLoading.value = false
    }
}

onMounted(() => {
    fetchDetail()
})
</script>

<style lang="scss" scoped>
.page-container {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 80px;
    display: flex;
    flex-direction: column;
}

.content-scroll {
    padding: 1rem;
    padding-bottom: 6rem;
}

.status-section {
    margin-bottom: 1.5rem;
}

.status-card {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.detail-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
}

.status-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    box-shadow: none;
}

.status-info {
    flex: 1;
}

.status-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
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
    color: var(--text-primary);
    text-align: right;
    flex: 1;
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

.detail-value.highlight {
    color: var(--module-purple);
    font-weight: 600;
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

.action-section {
    padding: 20px 0;
}

/* 状态颜色 */
.bg-yellow-500 {
    background: linear-gradient(135deg, var(--color-warning), #d97706);
}

.bg-blue-500 {
    background: linear-gradient(135deg, var(--color-primary), #2563eb);
}

.bg-green-500 {
    background: linear-gradient(135deg, var(--color-success), var(--color-success));
}

.bg-gray-500 {
    background: linear-gradient(135deg, var(--text-secondary), var(--text-secondary));
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
