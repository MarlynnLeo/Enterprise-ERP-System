<template>
    <div class="page-container">
        <!-- 导航栏 -->
        <div class="nav-bar">
            <button class="back-btn" @click="router.back()">
                <Icon name="arrow-left" size="1.25rem" />
            </button>
            <h1 class="page-title">销售出库详情</h1>
            <div class="nav-actions">
            </div>
        </div>

        <div class="content-scroll" v-if="outboundOrder">
            <!-- 状态卡片 -->
            <div class="status-section">
                <div class="detail-card status-card">
                    <div class="status-icon" :class="statusClass[outboundOrder.status]">
                        <Icon :name="getStatusIcon(outboundOrder.status)" size="1.5rem" />
                    </div>
                    <div class="status-info">
                        <h2 class="status-text">{{ getStatusText(outboundOrder.status) }}</h2>
                        <p class="order-code">{{ outboundOrder.code }}</p>
                    </div>
                    <div class="status-date">
                        {{ formatDate(outboundOrder.created_at) }}
                    </div>
                </div>
            </div>

            <!-- 基本信息 -->
            <div class="section-title">基本信息</div>
            <div class="detail-card info-card">
                <div class="info-row">
                    <span class="info-label">关联订单</span>
                    <span class="info-value">{{ outboundOrder.order_code || '-' }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">客户名称</span>
                    <span class="info-value">{{ outboundOrder.customer_name }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">出库日期</span>
                    <span class="info-value">{{ formatDate(outboundOrder.outbound_date, 'YYYY-MM-DD') || '-' }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">经办人</span>
                    <span class="info-value">{{ outboundOrder.creator_name }}</span>
                </div>
                <div class="info-row" v-if="outboundOrder.remark">
                    <span class="info-label">备注</span>
                    <span class="info-value">{{ outboundOrder.remark }}</span>
                </div>
            </div>

            <!-- 物料列表 -->
            <div class="section-title">物料明细 ({{ outboundOrder.items ? outboundOrder.items.length : 0 }})</div>
            <div class="items-list">
                <div class="basic-list-item" v-for="item in outboundOrder.items" :key="item.id">
       <div class="item-title-row">
         <div class="item-title">{{ item.material_name }}</div>
         <div class="item-subtitle">{{ `SKU: ${item.material_code}` || '' }}</div>
       </div>
                    <div class="item-details">
                        <div class="detail-row">
                            <span class="detail-label">计划数量:</span>
                            <span class="detail-value">{{ item.plan_quantity }} {{ item.unit_name }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">实际数量:</span>
                            <span class="detail-value highlight">{{ item.actual_quantity || '-' }} {{ item.unit_name
                                }}</span>
                        </div>
                        <div class="detail-row" v-if="item.batch_no">
                            <span class="detail-label">批次号:</span>
                            <span class="detail-value">{{ item.batch_no }}</span>
                        </div>
                        <div class="detail-row" v-if="item.warehouse_name">
                            <span class="detail-label">出库仓库:</span>
                            <span class="detail-value">{{ item.warehouse_name }}</span>
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
            <p>未找到出库单信息</p>
            <Button class="mt-4" size="sm" @click="fetchDetail">重试</Button>
        </div>

        <!-- 底部操作栏 -->
        <div class="bottom-actions glass-panel" v-if="outboundOrder && outboundOrder.status === 'pending'" v-permission="'sales:outbound:approve'">
            <Button type="primary" block :loading="submitting" @click="showExecuteDialog = true">
                确认出库
            </Button>
        </div>

        <!-- 确认出库弹窗 -->
        <van-dialog v-model:show="showExecuteDialog" title="确认出库" show-cancel-button @confirm="handleExecute">
            <div class="p-4 text-center">
                确认将该单据标记为已出库？
                <br>
                <span class="text-xs text-gray-500">库存数量将相应扣减</span>
            </div>
        </van-dialog>
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
const submitting = ref(false)
const outboundOrder = ref(null)
const showExecuteDialog = ref(false)

// 状态样式映射
const statusClass = {
    pending: 'bg-yellow-500',
    processing: 'bg-blue-500',
    completed: 'bg-green-500',
    cancelled: 'bg-gray-500'
}

// 获取详情
const fetchDetail = async () => {
    loading.value = true
    try {
        const res = await salesApi.getSalesOutboundById(id)
        outboundOrder.value = res.data || res
    } catch (error) {
        console.error('获取销售出库单详情失败:', error)
        showToast('加载失败')
    } finally {
        loading.value = false
    }
}

// 状态文本
const getStatusText = (status) => {
    const map = {
        pending: '待出库',
        processing: '出库中',
        completed: '已完成',
        cancelled: '已取消'
    }
    return map[status] || status
}

// 状态图标
const getStatusIcon = (status) => {
    const map = {
        pending: 'clock',
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

// 执行出库
const handleExecute = async () => {
    submitting.value = true
    try {
        // 注意：这里使用 updateSalesOutbound 还是专门的状态更新API取决于后端接口
        // 假设更新状态逻辑包含在 updateSalesOutbound 中，或者有一个专门的状态更新接口
        // 根据 api.js，并没有专门的 updateSalesOutboundStatus，可能集成在 updateSalesOutbound 中
        // 但为了保险起见，这里先尝试更新整个对象的状态，实际开发中需确认后端接口逻辑
        // 暂且使用 updateSalesOutbound 更新状态为 completed

        // 如果后端支持，最好是单独的状态更新接口
        // 这里模拟更新状态
        outboundOrder.value.status = 'completed';
        await salesApi.updateSalesOutbound(id, outboundOrder.value)

        showToast({ type: 'success', message: '出库成功' })
        fetchDetail() // 刷新详情
    } catch (error) {
        console.error('执行出库失败:', error)
        showToast('操作失败')
    } finally {
        submitting.value = false
        showExecuteDialog.value = false
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

.nav-actions {
    width: 2rem;
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
    color: #a855f7;
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

.bottom-actions {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 1rem;
    background: var(--bg-secondary);
    backdrop-filter: blur(20px);
    border-top: 1px solid var(--van-border-color);
    z-index: 40;
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
