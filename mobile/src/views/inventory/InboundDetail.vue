<!--
/**
 * InboundDetail.vue - 入库单详情
 * @description 移动端入库单详情页，操作流程与网页端完全一致
 * @date 2026-04-24
 * @version 2.2.0
 * 
 * 状态流转：
 *   draft → confirmed → completed
 *   draft → cancelled (取消)
 */
-->
<template>
    <div class="page-container">
        <!-- 导航栏 -->
        <div class="nav-bar">
            <button class="back-btn" @click="router.back()">
                <Icon name="arrow-left" size="1.25rem" />
            </button>
            <h1 class="page-title">入库单详情</h1>
            <div class="nav-actions"></div>
        </div>

        <div class="content-scroll" v-if="inboundOrder">
            <!-- 状态卡片 -->
            <div class="status-section">
                <div class="detail-card status-card">
                    <div class="status-icon" :class="getStatusColorClass(inboundOrder.status)">
                        <Icon :name="getStatusIcon(inboundOrder.status)" size="1.5rem" />
                    </div>
                    <div class="status-info">
                        <h2 class="status-text">{{ getStatusText(inboundOrder.status) }}</h2>
                        <p class="order-code">{{ inboundOrder.inbound_no }}</p>
                    </div>
                    <div class="status-date">
                        {{ formatDate(inboundOrder.created_at) }}
                    </div>
                </div>
            </div>

            <!-- 基本信息 -->
            <div class="section-title">基本信息</div>
            <div class="detail-card info-card">
                <div class="info-row">
                    <span class="info-label">入库类型</span>
                    <span class="info-value">{{ getInboundType(inboundOrder.inbound_type) }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">入库日期</span>
                    <span class="info-value">{{ formatDate(inboundOrder.inbound_date, 'YYYY-MM-DD') }}</span>
                </div>
                <div class="info-row" v-if="inboundOrder.reference_no">
                    <span class="info-label">关联单号</span>
                    <span class="info-value accent">{{ inboundOrder.reference_no }}</span>
                </div>
                <div class="info-row" v-if="inboundOrder.location_name">
                    <span class="info-label">入库仓位</span>
                    <span class="info-value">{{ inboundOrder.location_name }}</span>
                </div>
                <div class="info-row" v-if="inboundOrder.supplier_name">
                    <span class="info-label">供应商</span>
                    <span class="info-value">{{ inboundOrder.supplier_name }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">经办人</span>
                    <span class="info-value">{{ inboundOrder.operator || '-' }}</span>
                </div>
                <div class="info-row" v-if="inboundOrder.inspection_no">
                    <span class="info-label">质检单号</span>
                    <span class="info-value accent">{{ inboundOrder.inspection_no }}</span>
                </div>
                <div class="info-row" v-if="inboundOrder.remark">
                    <span class="info-label">备注</span>
                    <span class="info-value">{{ inboundOrder.remark }}</span>
                </div>
            </div>

            <!-- 物料列表 -->
            <div class="section-title">物料明细 ({{ inboundOrder.items ? inboundOrder.items.length : 0 }})</div>
            <div class="items-list">
                <div class="basic-list-item" v-for="item in inboundOrder.items" :key="item.id">
                    <div class="item-title-row">
                        <div class="item-title">{{ item.material_name }}</div>
                        <div class="item-subtitle">SKU: {{ item.material_code }}</div>
                    </div>
                    <div class="item-details">
                        <div class="detail-row" v-if="item.specification">
                            <span class="detail-label">规格:</span>
                            <span class="detail-value">{{ item.specification }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">计划数量:</span>
                            <span class="detail-value">{{ item.planned_quantity || item.plan_quantity }} {{ item.unit_name }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">实际数量:</span>
                            <span class="detail-value highlight">{{ item.actual_quantity || item.quantity || '-' }} {{ item.unit_name }}</span>
                        </div>
                        <div class="detail-row" v-if="item.batch_no || item.batch_number">
                            <span class="detail-label">批次号:</span>
                            <span class="detail-value">{{ item.batch_no || item.batch_number }}</span>
                        </div>
                        <div class="detail-row" v-if="item.location_name">
                            <span class="detail-label">库位:</span>
                            <span class="detail-value">{{ item.location_name }}</span>
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
            <Icon name="document-text" size="4rem" class="empty-icon" />
            <p>未找到入库单信息</p>
            <van-button class="retry-btn" size="small" @click="fetchDetail">重试</van-button>
        </div>

        <!-- 底部操作栏 - 根据状态显示不同操作按钮（与网页端一致） -->
        <div class="bottom-actions" v-if="inboundOrder && showActions">
            <!-- 草稿状态: 取消 + 确认 -->
            <template v-if="inboundOrder.status === 'draft'">
                <van-button type="warning" plain :loading="submitting" @click="handleCancel" class="action-btn">
                    取消
                </van-button>
                <van-button type="primary" :loading="submitting" @click="handleConfirm" class="action-btn flex-1">
                    确认入库
                </van-button>
            </template>

            <!-- 已确认状态: 完成入库 -->
            <template v-else-if="inboundOrder.status === 'confirmed'">
                <van-button type="primary" block :loading="submitting" @click="handleComplete">
                    完成入库
                </van-button>
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { inventoryApi } from '@/services/api'
import Icon from '@/components/icons/index.vue'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const id = route.params.id

const loading = ref(true)
const submitting = ref(false)
const inboundOrder = ref(null)

// 是否显示操作栏
const showActions = computed(() => {
    const s = inboundOrder.value?.status
    return s === 'draft' || s === 'confirmed'
})

// 获取详情
const fetchDetail = async () => {
    loading.value = true
    try {
        const res = await inventoryApi.getInboundDetail(id)
        inboundOrder.value = res.data || res
    } catch (error) {
        console.error('获取入库单详情失败:', error)
        showToast('加载失败')
    } finally {
        loading.value = false
    }
}

// ========== 状态映射 ==========

const getStatusText = (status) => {
    const map = {
        draft: '草稿',
        confirmed: '已确认',
        completed: '已完成',
        cancelled: '已取消'
    }
    return map[status] || status
}

const getStatusIcon = (status) => {
    const map = {
        draft: 'notes',
        confirmed: 'check',
        completed: 'check-circle',
        cancelled: 'x-circle'
    }
    return map[status] || 'document-text'
}

const getStatusColorClass = (status) => {
    const map = {
        draft: 'status-draft',
        confirmed: 'status-confirmed',
        completed: 'status-completed',
        cancelled: 'status-cancelled'
    }
    return map[status] || 'status-draft'
}

const getInboundType = (type) => {
    const map = {
        purchase: '采购入库',
        production: '生产入库',
        production_return: '生产退料',
        defective_return: '不良退回',
        outsourced: '委外入库',
        sales_return: '销售退货',
        return: '销售退货',
        other: '其他入库',
        transfer: '调拨入库'
    }
    return map[type] || type || '-'
}

const formatDate = (date, fmt = 'YYYY-MM-DD HH:mm') => {
    return date ? dayjs(date).format(fmt) : '-'
}

// ========== 操作方法（与网页端逻辑一致） ==========

/**
 * 确认入库 (draft → confirmed)
 * 对应网页端 handleUpdateStatus(row.id, 'confirmed')
 */
const handleConfirm = async () => {
    try {
        await showConfirmDialog({
            title: '确认入库',
            message: `确定要确认入库单 ${inboundOrder.value.inbound_no} 吗？`
        })

        submitting.value = true
        await inventoryApi.updateInboundStatus(id, 'confirmed')
        showToast({ type: 'success', message: '确认成功' })
        fetchDetail()
    } catch (error) {
        if (error !== 'cancel' && error?.message !== 'cancel') {
            console.error('确认入库失败:', error)
            const errorMsg = error.response?.data?.message || '确认入库失败'
            showToast(errorMsg)
        }
    } finally {
        submitting.value = false
    }
}

/**
 * 完成入库 (confirmed → completed)
 * 对应网页端 handleUpdateStatus(row.id, 'completed')
 */
const handleComplete = async () => {
    try {
        await showConfirmDialog({
            title: '完成入库',
            message: `确定要完成入库单 ${inboundOrder.value.inbound_no} 吗？\n库存数量将相应增加。`
        })

        submitting.value = true
        await inventoryApi.updateInboundStatus(id, 'completed')
        showToast({ type: 'success', message: '入库完成，库存已增加' })
        fetchDetail()
    } catch (error) {
        if (error !== 'cancel' && error?.message !== 'cancel') {
            console.error('完成入库失败:', error)
            const errorMsg = error.response?.data?.message || '完成入库失败'
            showToast(errorMsg)
        }
    } finally {
        submitting.value = false
    }
}

/**
 * 取消入库 (draft → cancelled)
 * 对应网页端 handleUpdateStatus(row.id, 'cancelled')
 */
const handleCancel = async () => {
    try {
        await showConfirmDialog({
            title: '取消确认',
            message: `确定要取消入库单 ${inboundOrder.value.inbound_no} 吗？`
        })

        submitting.value = true
        await inventoryApi.updateInboundStatus(id, 'cancelled')
        showToast({ type: 'success', message: '已取消' })
        fetchDetail()
    } catch (error) {
        if (error !== 'cancel' && error?.message !== 'cancel') {
            console.error('取消入库失败:', error)
            const errorMsg = error.response?.data?.message || '取消失败'
            showToast(errorMsg)
        }
    } finally {
        submitting.value = false
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
    color: var(--text-primary);
    padding: 0.5rem;
    margin-left: -0.5rem;
    cursor: pointer;
}

.page-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
}

.nav-actions { width: 2rem; }

.content-scroll {
    padding: 1rem;
    padding-bottom: 6rem;
}

.status-section { margin-bottom: 1.5rem; }

.detail-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 16px;
    border: 1px solid var(--glass-border);
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
    overflow: hidden;
    &.status-draft { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    &.status-confirmed { background: rgba(59, 130, 246, 0.15); color: var(--module-blue); }
    &.status-completed { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    &.status-cancelled { background: rgba(239, 68, 68, 0.15); color: var(--color-error); }
}

.status-info { flex: 1; }
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
    flex-shrink: 0;
}
.info-value {
    color: var(--text-primary);
    text-align: right;
    flex: 1;
    word-break: break-all;
    &.accent { color: var(--module-blue); font-weight: 500; }
}

.items-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.basic-list-item {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 12px;
    border: 1px solid var(--glass-border);
}
.item-title-row {
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--glass-border);
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

.item-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
}
.detail-label { color: var(--text-tertiary); }
.detail-value { color: var(--text-primary); }
.detail-value.highlight { color: var(--module-purple); font-weight: 600; }

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
.empty-icon { color: var(--text-tertiary); margin-bottom: 1rem; }
.retry-btn { margin-top: 1rem; }

.bottom-actions {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 1rem;
    background: var(--bg-secondary);
    backdrop-filter: blur(20px);
    border-top: 1px solid var(--glass-border);
    z-index: 40;
    display: flex;
    gap: 12px;
}
.action-btn { flex-shrink: 0; }
.flex-1 { flex: 1; }
</style>
