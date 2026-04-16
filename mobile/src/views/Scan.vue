<!--
/**
 * Scan.vue
 * @description 移动端扫码功能页面 - Unified 风格
 * @date 2025-12-29
 * @version 2.0.0
 */
-->
<template>
  <div class="scan-page">
    <!-- 背景模糊层 -->

    <!-- 顶部导航栏 -->
    <header class="page-header">
      <button class="header-btn" @click="goBack">
        <Icon name="chevron-right" size="1.5rem" class-name="rotate-180" />
      </button>
      <h1 class="header-title">智能扫码</h1>
      <button class="header-btn" @click="toggleFlashlight">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </button>
    </header>

    <!-- 主要内容区域 -->
    <div class="page-content">
      <!-- 扫码类型选择 -->
      <div class="type-selector-section">
        <div class="type-tabs">
          <div
            v-for="type in scanTypes"
            :key="type.value"
            :class="['type-tab', { active: selectedType === type.value }]"
            @click="selectType(type.value)"
          >
            <Icon :name="type.icon" size="1.25rem" />
            <span>{{ type.label }}</span>
          </div>
        </div>
      </div>

      <!-- 扫码区域 -->
      <div class="scan-area-section">
        <div class="scan-preview">
          <!-- 添加 html5-qrcode 挂载点 -->
          <div id="reader" class="scan-video"></div>

          <!-- 扫描框覆盖层 -->
          <div class="scan-overlay" v-if="!scanResult">
            <div class="scan-frame">
              <div class="corner corner-tl"></div>
              <div class="corner corner-tr"></div>
              <div class="corner corner-bl"></div>
              <div class="corner corner-br"></div>
              <div class="scan-line"></div>
            </div>
            <p class="scan-tip">{{ scanTip }}</p>
          </div>
        </div>

        <!-- 扫码结果 -->
        <div v-if="scanResult && resultData" class="scan-result">
          <div class="result-header">
            <div class="success-icon">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span class="success-text">扫码成功</span>
          </div>

          <!-- 物料信息 -->
          <div v-if="selectedType === 'material'" class="result-content">
            <div class="result-item">
              <span class="label">物料编码</span>
              <span class="value">{{ resultData.code }}</span>
            </div>
            <div class="result-item">
              <span class="label">物料名称</span>
              <span class="value">{{ resultData.name }}</span>
            </div>
            <div class="result-item">
              <span class="label">规格型号</span>
              <span class="value">{{ resultData.specification || '-' }}</span>
            </div>
            <div class="result-item">
              <span class="label">单位</span>
              <span class="value">{{ resultData.unit }}</span>
            </div>
          </div>

          <!-- 库位信息 -->
          <div v-else-if="selectedType === 'location'" class="result-content">
            <div class="result-item">
              <span class="label">库位编码</span>
              <span class="value">{{ resultData.code }}</span>
            </div>
            <div class="result-item">
              <span class="label">库位名称</span>
              <span class="value">{{ resultData.name }}</span>
            </div>
            <div class="result-item">
              <span class="label">仓库</span>
              <span class="value">{{ resultData.warehouse || '-' }}</span>
            </div>
          </div>

          <!-- 订单信息 -->
          <div v-else-if="selectedType === 'order'" class="result-content">
            <div class="result-item">
              <span class="label">订单编号</span>
              <span class="value">{{ resultData.orderNo }}</span>
            </div>
            <div class="result-item">
              <span class="label">客户</span>
              <span class="value">{{ resultData.customerName }}</span>
            </div>
            <div class="result-item">
              <span class="label">状态</span>
              <span class="value">{{ resultData.statusText }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="result-actions">
            <van-button type="primary" block @click="handleViewDetail"> 查看详情 </van-button>
            <van-button plain block @click="resetScan" style="margin-top: 0.75rem">
              重新扫码
            </van-button>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
          <van-loading size="24px" color="#667eea">查询中...</van-loading>
        </div>
      </div>

      <!-- 手动输入 -->
      <div class="manual-input-section">
        <div class="input-card" @click="showManualInput = true">
          <Icon name="pencil" size="1.25rem" class-name="input-icon" />
          <span class="input-text">手动输入编码</span>
          <Icon name="chevron-right" size="1rem" class-name="text-secondary" />
        </div>
      </div>

      <!-- 快捷功能 -->
      <div class="quick-actions-section">
        <h3 class="section-title">快捷功能</h3>
        <div class="actions-grid">
          <div
            v-for="action in quickActions"
            :key="action.value"
            class="action-card"
            @click="handleQuickAction(action)"
          >
            <div class="action-icon" :style="{ background: action.gradient }">
              <Icon :name="action.icon" size="1.25rem" />
            </div>
            <span class="action-label">{{ action.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 手动输入弹窗 -->
    <van-popup v-model:show="showManualInput" position="bottom" round>
      <div class="manual-input-popup">
        <div class="popup-header">
          <h3>手动输入</h3>
          <button class="close-btn" @click="showManualInput = false">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div class="popup-content">
          <van-field
            v-model="manualCode"
            type="textarea"
            placeholder="请输入编码或扫描内容"
            :autosize="{ minHeight: 80, maxHeight: 120 }"
            :border="false"
          />
        </div>
        <div class="popup-actions">
          <van-button type="primary" block @click="confirmManualInput"> 确认 </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import Icon from '@/components/icons/index.vue'
  import { showToast, showLoadingToast, closeToast } from 'vant'
  import { baseDataApi, inventoryApi, salesApi } from '@/services/api'
  import { Html5Qrcode } from 'html5-qrcode'

  const router = useRouter()

  // 状态
  const selectedType = ref('material')
  const scanResult = ref('')
  const resultData = ref(null)
  const showManualInput = ref(false)
  const manualCode = ref('')
  const loading = ref(false)
  const flashlightOn = ref(false)
  const html5QrCode = ref(null)
  const cameraId = ref('')
  const hasFlash = ref(false)

  // 扫码类型
  const scanTypes = [
    { value: 'material', label: '物料', icon: 'cube' },
    { value: 'location', label: '库位', icon: 'location-marker' },
    { value: 'order', label: '订单', icon: 'document-text' },
    { value: 'product', label: '产品', icon: 'shopping-bag' }
  ]

  // 快捷功能
  const quickActions = [
    {
      value: 'inbound',
      label: '入库扫码',
      icon: 'download',
      gradient: 'linear-gradient(135deg, #2CCFB0 0%, #1BA392 100%)'
    },
    {
      value: 'outbound',
      label: '出库扫码',
      icon: 'upload',
      gradient: 'linear-gradient(135deg, #FF9F45 0%, #FF8A3D 100%)'
    },
    {
      value: 'check',
      label: '盘点扫码',
      icon: 'clipboard-check',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    {
      value: 'transfer',
      label: '调拨扫码',
      icon: 'refresh',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    }
  ]

  // 扫码提示
  const scanTip = computed(() => {
    const tips = {
      material: '将物料条码/二维码放入框内',
      location: '将库位条码/二维码放入框内',
      order: '将订单条码/二维码放入框内',
      product: '将产品条码/二维码放入框内'
    }
    return tips[selectedType.value] || '将条码/二维码放入框内'
  })

  // 方法
  const goBack = () => {
    router.back()
  }

  const selectType = (type) => {
    selectedType.value = type
    resetScan()
  }

  // 模拟扫码（实际应用中应该调用摄像头API）
  const simulateScan = () => {
    setTimeout(() => {
      const mockCodes = {
        material: 'MAT001',
        location: 'WH-A-01-001',
        order: 'SO202501001',
        product: 'PRD001'
      }
      const code = mockCodes[selectedType.value]
      if (code) {
        handleScanCode(code)
      }
    }, 1500)
  }

  // 处理扫码结果
  const handleScanCode = async (code) => {
    scanResult.value = code
    loading.value = true

    try {
      if (selectedType.value === 'material') {
        await queryMaterial(code)
      } else if (selectedType.value === 'location') {
        await queryLocation(code)
      } else if (selectedType.value === 'order') {
        await queryOrder(code)
      } else if (selectedType.value === 'product') {
        await queryMaterial(code)
      }
    } catch (error) {
      console.error('查询失败:', error)
      showToast({
        type: 'fail',
        message: error.message || '查询失败'
      })
      scanResult.value = ''
      resultData.value = null
    } finally {
      loading.value = false
    }
  }

  // 查询物料信息
  const queryMaterial = async (code) => {
    try {
      const response = await baseDataApi.getMaterials({
        code: code,
        page: 1,
        pageSize: 1
      })

      if (response.data && response.data.list && response.data.list.length > 0) {
        const material = response.data.list[0]
        resultData.value = {
          code: material.code,
          name: material.name,
          specification: material.specification,
          unit: material.unit,
          id: material.id
        }
        showToast({
          type: 'success',
          message: '查询成功'
        })
      } else {
        throw new Error('未找到该物料')
      }
    } catch (error) {
      throw new Error(error.message || '查询物料失败')
    }
  }

  // 查询库位信息
  const queryLocation = async (code) => {
    try {
      const response = await inventoryApi.getLocations({
        code: code,
        page: 1,
        pageSize: 1
      })

      if (response.data && response.data.length > 0) {
        const location = response.data[0]
        resultData.value = {
          code: location.code,
          name: location.name,
          warehouse: location.warehouse_name,
          id: location.id
        }
        showToast({
          type: 'success',
          message: '查询成功'
        })
      } else {
        throw new Error('未找到该库位')
      }
    } catch (error) {
      throw new Error(error.message || '查询库位失败')
    }
  }

  // 查询订单信息
  const queryOrder = async (orderNo) => {
    try {
      const response = await salesApi.getSalesOrders({
        orderNo: orderNo,
        page: 1,
        pageSize: 1
      })

      if (response.data && response.data.list && response.data.list.length > 0) {
        const order = response.data.list[0]
        const statusMap = {
          pending: '待确认',
          confirmed: '已确认',
          in_production: '生产中',
          completed: '已完成',
          cancelled: '已取消'
        }
        resultData.value = {
          orderNo: order.order_no,
          customerName: order.customer_name,
          statusText: statusMap[order.status] || order.status,
          id: order.id
        }
        showToast({
          type: 'success',
          message: '查询成功'
        })
      } else {
        throw new Error('未找到该订单')
      }
    } catch (error) {
      throw new Error(error.message || '查询订单失败')
    }
  }

  // 查看详情
  const handleViewDetail = () => {
    if (!resultData.value) return

    const routeMap = {
      material: `/baseData/materials/${resultData.value.id}`,
      location: `/inventory/stock?locationId=${resultData.value.id}`,
      order: `/sales/orders/${resultData.value.id}`,
      product: `/baseData/materials/${resultData.value.id}`
    }

    const route = routeMap[selectedType.value]
    if (route) {
      router.push(route)
    }
  }

  // 重置扫码
  const resetScan = () => {
    scanResult.value = ''
    resultData.value = null
    loading.value = false

    // 恢复扫描
    if (html5QrCode.value) {
      html5QrCode.value.resume()
    }
  }

  // 确认手动输入
  const confirmManualInput = () => {
    if (!manualCode.value.trim()) {
      showToast('请输入编码')
      return
    }

    showManualInput.value = false
    handleScanCode(manualCode.value.trim())
    manualCode.value = ''
  }

  // 处理快捷功能
  const handleQuickAction = (action) => {
    const routeMap = {
      inbound: '/inventory/inbound',
      outbound: '/inventory/outbound',
      check: '/inventory/check',
      transfer: '/inventory/transfer'
    }

    const route = routeMap[action.value]
    if (route) {
      router.push(route)
    }
  }

  // 检查相机权限并启动
  const checkCameraPermissionAndStart = async () => {
    try {
      // 获取设备列表
      const devices = await Html5Qrcode.getCameras()
      if (devices && devices.length) {
        // 优先使用后置摄像头
        const backCamera = devices.find((device) => device.label.toLowerCase().includes('back'))
        cameraId.value = backCamera ? backCamera.id : devices[0].id
        startScanning()
      } else {
        showToast('未检测到摄像头')
      }
    } catch (err) {
      console.error('获取摄像头失败:', err)
      showToast('无法访问摄像头，请检查权限')
      // 降级为手动输入或模拟
      // simulateScan()
    }
  }

  // 启动扫描
  const startScanning = async () => {
    const qrCodeScanner = new Html5Qrcode('reader')
    html5QrCode.value = qrCodeScanner

    try {
      const config = { fps: 10, qrbox: { width: 250, height: 250 } }

      await qrCodeScanner.start(
        cameraId.value,
        config,
        (decodedText, decodedResult) => {
          // 扫码成功回调
          handleScanCode(decodedText)
          // 暂停扫描，避免重复触发
          qrCodeScanner.pause()
        },
        (errorMessage) => {
          // 扫码失败/识别中回调，通常忽略
          // console.log(errorMessage)
        }
      )

      // 检查是否有闪光灯功能 (Html5Qrcode目前对闪光灯支持有限，需根据实际情况调整)
      // 暂定认为后置摄像头可能有闪光灯
      hasFlash.value = true
    } catch (err) {
      console.error('启动扫描失败:', err)
      showToast('启动相机失败')
    }
  }

  // 停止扫描
  const stopScanning = async () => {
    if (html5QrCode.value) {
      try {
        if (html5QrCode.value.isScanning) {
          await html5QrCode.value.stop()
        }
        html5QrCode.value.clear()
      } catch (err) {
        console.error('停止扫描失败:', err)
      }
    }
  }

  // 切换闪光灯
  const toggleFlashlight = async () => {
    if (!html5QrCode.value) return

    try {
      // Html5Qrcode 的 applyVideoConstraints 方法可以用来控制手电筒
      // 但取决于浏览器支持。这里尝试使用 torch 约束
      const track = html5QrCode.value.getRunningTrackCameraCapabilities()[0] // 获取视频轨道
      // 注意：Html5Qrcode 库本身可能没有直接暴露 getRunningTrack... 方法，需查看其文档或源码
      // 如果没有直接方法，通常是一个更底层的操作。
      // Html5QrcodePro 才有直接的 API。开源版可能需要 hack。

      // 尝试目前通用的方法：
      // 由于 html5-qrcode 封装较深，我们暂时只能通过重新应用约束或使用 applyVideoConstraints
      // 文档显示 applyVideoConstraints 是支持的

      flashlightOn.value = !flashlightOn.value
      await html5QrCode.value.applyVideoConstraints({
        advanced: [{ torch: flashlightOn.value }]
      })
    } catch (error) {
      console.error('切换闪光灯失败:', error)
      showToast('该设备不支持闪光灯控制')
      flashlightOn.value = false
    }
  }

  // 组件卸载时停止扫描
  onUnmounted(() => {
    stopScanning()
  })

  onMounted(() => {
    // 检查相机权限并启动扫描
    checkCameraPermissionAndStart()
  })
</script>

<style lang="scss" scoped>
  .scan-page {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--bg-primary);
  }

  .page-header {
    padding: 3rem 1.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    background: var(--bg-secondary);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .header-btn {
    padding: 0.5rem;
    margin: -0.5rem;
    border-radius: 50%;
    background: none;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-btn:active {
    transform: scale(0.95);
  }

  .header-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .page-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .page-content::-webkit-scrollbar {
    display: none;
  }

  /* 类型选择器 */
  .type-selector-section {
    margin-bottom: 1.5rem;
  }

  .type-tabs {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }

  .type-tabs::-webkit-scrollbar {
    display: none;
  }

  .type-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--glass-border);
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.3s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .type-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: transparent;
    color: var(--text-primary);
  }

  .type-tab:active {
    transform: scale(0.95);
  }

  /* 扫码区域 */
  .scan-area-section {
    margin-bottom: 1.5rem;
  }

  .scan-preview {
    position: relative;
    width: 100%;
    height: 20rem;
    /* 固定高度，或者根据视口调整 */
    background: var(--bg-black, #000);
    border-radius: 1rem;
    overflow: hidden;
    border: 1px solid var(--glass-border);
  }

  .scan-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .scan-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
    /* 让点击穿透 */
  }

  .scan-frame {
    position: relative;
    width: 15rem;
    height: 15rem;
  }

  .corner {
    position: absolute;
    width: 2.5rem;
    height: 2.5rem;
    border: 3px solid #667eea;
  }

  .corner-tl {
    top: 0;
    left: 0;
    border-right: none;
    border-bottom: none;
  }

  .corner-tr {
    top: 0;
    right: 0;
    border-left: none;
    border-bottom: none;
  }

  .corner-bl {
    bottom: 0;
    left: 0;
    border-right: none;
    border-top: none;
  }

  .corner-br {
    bottom: 0;
    right: 0;
    border-left: none;
    border-top: none;
  }

  .scan-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #667eea, transparent);
    animation: scan 2s linear infinite;
  }

  @keyframes scan {
    0% {
      transform: translateY(0);
    }

    100% {
      transform: translateY(15rem);
    }
  }

  .scan-tip {
    position: absolute;
    bottom: 1.25rem;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--text-primary);
    font-size: 0.875rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  /* 扫码结果 */
  .scan-result {
    margin-top: 1.5rem;
    background: var(--bg-secondary);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .success-icon {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-success);
  }

  .success-text {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-success);
  }

  .result-content {
    margin-bottom: 1.25rem;
  }

  .result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--glass-border);
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .result-item .label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .result-item .value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    text-align: right;
  }

  .result-actions :deep(.van-button--primary) {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    height: 2.75rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .result-actions :deep(.van-button--plain) {
    background: transparent;
    border: 1px solid var(--van-border-color);
    color: var(--text-primary);
    height: 2.75rem;
    font-size: 1rem;
  }

  /* 加载状态 */
  .loading-state {
    margin-top: 1.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem;
  }

  /* 手动输入 */
  .manual-input-section {
    margin-bottom: 1.5rem;
  }

  .input-card {
    background: var(--bg-secondary);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .input-card:active {
    transform: scale(0.98);
  }

  .input-icon {
    color: var(--text-secondary);
  }

  .input-text {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .text-secondary {
    color: var(--text-secondary);
  }

  /* 快捷功能 */
  .quick-actions-section {
    margin-bottom: 1.5rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.75rem;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .action-card {
    background: var(--bg-secondary);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: 0.75rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-card:active {
    transform: scale(0.95);
  }

  .action-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
  }

  .action-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  /* 手动输入弹窗 */
  .manual-input-popup {
    padding: 1.5rem;
    background: var(--bg-secondary);
  }

  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .popup-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    padding: 0.25rem;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .popup-content {
    margin-bottom: 1rem;
  }

  .popup-content :deep(.van-field) {
    background: var(--bg-primary);
    border-radius: 0.5rem;
    padding: 0.75rem;
  }

  .popup-actions :deep(.van-button--primary) {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    height: 2.75rem;
    font-size: 1rem;
    font-weight: 600;
  }

  /* 工具类 */
  .w-5 {
    width: 1.25rem;
    height: 1.25rem;
  }

  .w-6 {
    width: 1.5rem;
    height: 1.5rem;
  }

  .rotate-180 {
    transform: rotate(180deg);
  }
</style>
