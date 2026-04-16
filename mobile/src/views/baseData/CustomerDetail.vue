<!--
/**
 * CustomerDetail.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="customer-detail-page">
    <NavBar title="客户详情" left-arrow @click-left="onClickLeft">
      <template #right>
        <Icon name="edit" size="18" @click="editCustomer" />
      </template>
    </NavBar>

    <div class="content-container" v-if="customer">
      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-header">
          <h3>基本信息</h3>
          <span :class="['status-tag', customer.status]">
            {{ customer.status === 'active' ? '启用' : '停用' }}
          </span>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="label">客户名称</span>
            <span class="value">{{ customer.name }}</span>
          </div>
          <div class="info-item">
            <span class="label">客户编号</span>
            <span class="value">#{{ customer.id }}</span>
          </div>
          <div class="info-item" v-if="customer.contact_person">
            <span class="label">联系人</span>
            <span class="value">{{ customer.contact_person }}</span>
          </div>
          <div class="info-item" v-if="customer.contact_phone">
            <span class="label">联系电话</span>
            <span class="value">
              <a :href="`tel:${customer.contact_phone}`" class="phone-link">
                {{ customer.contact_phone }}
              </a>
            </span>
          </div>
          <div class="info-item" v-if="customer.email">
            <span class="label">邮箱</span>
            <span class="value">{{ customer.email }}</span>
          </div>
          <div class="info-item" v-if="customer.address">
            <span class="label">地址</span>
            <span class="value">{{ customer.address }}</span>
          </div>
          <div class="info-item" v-if="customer.credit_limit">
            <span class="label">信用额度</span>
            <span class="value">¥{{ formatAmount(customer.credit_limit) }}</span>
          </div>
          <div class="info-item" v-if="customer.remark">
            <span class="label">备注</span>
            <span class="value">{{ customer.remark }}</span>
          </div>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="info-section">
        <div class="section-header">
          <h3>时间信息</h3>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="label">创建时间</span>
            <span class="value">{{ formatDateTime(customer.created_at) }}</span>
          </div>
          <div class="info-item">
            <span class="label">更新时间</span>
            <span class="value">{{ formatDateTime(customer.updated_at) }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <Button type="primary" size="large" @click="editCustomer" style="margin-bottom: 12px">
          编辑客户
        </Button>
        <Button type="default" size="large" @click="viewOrders"> 查看订单 </Button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="loading" class="loading-container">
      <Loading size="24px" />
      <span>加载中...</span>
    </div>

    <!-- 错误状态 -->
    <div v-else class="error-container">
      <Empty description="客户不存在或已被删除" />
      <Button type="primary" @click="onClickLeft">返回列表</Button>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { NavBar, Icon, Button, Loading, Empty, showToast } from 'vant'
  import { baseDataApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()

  const customer = ref(null)
  const loading = ref(true)

  // 获取客户详情
  const fetchCustomerDetail = async () => {
    try {
      loading.value = true
      const customerId = route.params.id
      const response = await baseDataApi.getCustomer(customerId)
      customer.value = response.data
    } catch (error) {
      console.error('获取客户详情失败:', error)
      showToast('获取客户详情失败')
    } finally {
      loading.value = false
    }
  }

  // 返回上一页
  const onClickLeft = () => {
    router.back()
  }

  // 编辑客户
  const editCustomer = () => {
    router.push(`/baseData/customers/${customer.value.id}/edit`)
  }

  // 查看订单
  const viewOrders = () => {
    router.push(`/sales/orders?customerId=${customer.value.id}`)
  }

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }

  // 格式化日期时间
  const formatDateTime = (dateTime) => {
    if (!dateTime) return '-'
    return new Date(dateTime).toLocaleString('zh-CN')
  }

  onMounted(() => {
    fetchCustomerDetail()
  })
</script>

<style lang="scss" scoped>
  .customer-detail-page {
    height: 100vh;
    background-color: var(--bg-secondary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    -webkit-overflow-scrolling: touch; /* iOS 平滑滚动 */
  }

  .info-section {
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 16px;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--glass-border);

    h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  .status-tag {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;

    &.active {
      background-color: rgba(99, 102, 241, 0.1);
      color: #0369a1;
      border: 1px solid #bae6fd;
    }

    &.inactive {
      background-color: var(--bg-secondary);
      color: #6b7280;
      border: 1px solid #d1d5db;
    }
  }

  .info-grid {
    padding: 16px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      color: var(--text-secondary);
      font-size: 0.875rem;
      min-width: 80px;
      flex-shrink: 0;
    }

    .value {
      color: var(--text-primary);
      font-size: 0.875rem;
      text-align: right;
      flex: 1;
      margin-left: 16px;
      word-break: break-all;
    }
  }

  .phone-link {
    color: var(--van-primary-color);
    text-decoration: none;
  }

  .action-buttons {
    padding: 16px 0;
  }

  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;

    span {
      margin-top: 12px;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
  }
</style>
