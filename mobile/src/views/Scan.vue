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
      <div class="header-actions">
        <!-- 切换摄像头按钮 -->
        <button v-if="cameras.length > 1" class="header-btn" @click="switchCamera" :title="currentFacingLabel">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            <!-- 切换箭头 -->
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7.5 3l-2 2 2 2" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M16.5 21l2-2-2-2" />
          </svg>
        </button>
        <!-- 闪光灯按钮 -->
        <button class="header-btn" @click="toggleFlashlight">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </button>
      </div>
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

          <!-- 物料信息（通用 + 盘点模式共用） -->
          <div v-if="selectedType === 'material' || selectedType === 'check'" class="result-content">
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

          <!-- 盘点模式：选择盘点单 -->
          <div v-if="selectedType === 'check' && resultData" class="check-select-section">
            <div class="check-section-title">选择盘点单添加物料</div>
            <div v-if="activeCheckList.length === 0" class="check-empty">
              <p>暂无进行中的盘点单</p>
              <van-button size="small" type="primary" plain @click="router.push('/inventory/check/new')">新建盘点单</van-button>
            </div>
            <div v-else class="check-list">
              <div
                v-for="ck in activeCheckList"
                :key="ck.id"
                class="check-item"
                @click="addToCheck(ck)"
              >
                <div class="check-item-info">
                  <span class="check-no">{{ ck.check_no }}</span>
                  <span class="check-meta">{{ ck.warehouse || '' }} · {{ ck.check_date || '' }}</span>
                </div>
                <div class="check-item-action">
                  <span class="add-hint">添加</span>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                </div>
              </div>
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
            <van-button v-if="selectedType !== 'check'" type="primary" block @click="handleViewDetail"> 查看详情 </van-button>
            <van-button plain block @click="resetScan" style="margin-top: 0.75rem">
              重新扫码
            </van-button>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
          <van-loading size="24px" color="var(--color-primary)">查询中...</van-loading>
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
  import { useRouter, useRoute } from 'vue-router'
  import Icon from '@/components/icons/index.vue'
  import { showToast, showLoadingToast, closeToast } from 'vant'
  import { baseDataApi, inventoryApi, salesApi } from '@/services/api'
  import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

  // 支持的条码格式列表（包含所有常见一维码和二维码）
  const SUPPORTED_FORMATS = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
    Html5QrcodeSupportedFormats.PDF_417,
  ]

  const router = useRouter()
  const route = useRoute()

  // 状态
  const scanMode = ref('')  // URL 参数传入的模式（如 'check'）
  const selectedType = ref('material')
  const scanResult = ref('')
  const activeCheckList = ref([])  // 进行中的盘点单列表
  const resultData = ref(null)
  const showManualInput = ref(false)
  const manualCode = ref('')
  const loading = ref(false)
  const flashlightOn = ref(false)
  const html5QrCode = ref(null)
  const cameraId = ref('')
  const hasFlash = ref(false)
  const cameras = ref([])         // 所有可用摄像头列表
  const currentCameraIndex = ref(0)  // 当前使用的摄像头索引

  // 当前摄像头方向标签（显示给用户）
  const currentFacingLabel = computed(() => {
    if (cameras.value.length === 0) return ''
    const cam = cameras.value[currentCameraIndex.value]
    if (!cam) return ''
    const label = cam.label.toLowerCase()
    if (isBackCamera(label)) return '后置摄像头'
    if (label.includes('front') || label.includes('前')) return '前置摄像头'
    return `摄像头 ${currentCameraIndex.value + 1}`
  })

  // 判断是否为后置摄像头（兼容中英文标签）
  const isBackCamera = (label) => {
    const lowerLabel = (label || '').toLowerCase()
    return lowerLabel.includes('back')
      || lowerLabel.includes('rear')
      || lowerLabel.includes('后')
      || lowerLabel.includes('environment')
      || lowerLabel.includes('0, facing back')
  }

  // 扫码类型
  const scanTypes = computed(() => {
    const types = [
      { value: 'check', label: '盘点', icon: 'clipboard-check' },
      { value: 'material', label: '物料', icon: 'cube' },
      { value: 'location', label: '库位', icon: 'location-marker' },
      { value: 'order', label: '订单', icon: 'document-text' },
      { value: 'product', label: '产品', icon: 'shopping-bag' }
    ]
    return types
  })

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
      gradient: 'linear-gradient(135deg, var(--color-warning) 0%, #FF8A3D 100%)'
    },
    {
      value: 'check',
      label: '盘点扫码',
      icon: 'clipboard-check',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%)'
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
      check: '扫描物料条码，添加到盘点单',
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

  // 处理扫码结果
  const handleScanCode = async (code) => {
    scanResult.value = code
    loading.value = true

    try {
      if (selectedType.value === 'check') {
        // 盘点模式：查询物料 + 加载可用盘点单
        await queryMaterial(code)
        await loadActiveChecks()
      } else if (selectedType.value === 'material') {
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

  // 加载进行中和草稿状态的盘点单列表
  const loadActiveChecks = async () => {
    try {
      const res = await inventoryApi.getCheckList({ status: 'in_progress', limit: 50 })
      let items = []
      if (res.data && Array.isArray(res.data)) {
        items = res.data
      } else {
        items = res.data?.list || res.data?.items || res.data?.rows || []
      }
      // 如果没有进行中的，也查草稿状态的
      if (items.length === 0) {
        const res2 = await inventoryApi.getCheckList({ status: 'draft', limit: 50 })
        if (res2.data && Array.isArray(res2.data)) {
          items = res2.data
        } else {
          items = res2.data?.list || res2.data?.items || res2.data?.rows || []
        }
      }
      activeCheckList.value = items
    } catch (err) {
      console.error('加载盘点单失败:', err)
      activeCheckList.value = []
    }
  }

  // 将扫描到的物料添加到选中的盘点单
  const addToCheck = async (checkOrder) => {
    if (!resultData.value) return

    try {
      showLoadingToast({ message: '添加中...', forbidClick: true })

      // 先获取盘点单详情，检查是否已包含该物料
      const detailRes = await inventoryApi.getCheckDetail(checkOrder.id)
      const checkData = detailRes?.data || {}
      const existingItems = checkData.items || []
      const alreadyExists = existingItems.some(i => i.material_id === resultData.value.id)

      if (alreadyExists) {
        closeToast()
        showToast({ type: 'fail', message: '该物料已在盘点单中' })
        return
      }

      // 获取物料库存数量
      let bookQty = 0
      try {
        const stockRes = await inventoryApi.getMaterialStock(resultData.value.id, checkData.warehouse_id)
        bookQty = stockRes.data?.quantity ? parseFloat(stockRes.data.quantity) : 0
      } catch (e) {
        console.warn('获取物料库存失败，使用默认值0', e)
      }

      // 添加物料到盘点单
      const newItem = {
        material_id: resultData.value.id,
        material_code: resultData.value.code,
        material_name: resultData.value.name,
        specs: resultData.value.specification || '',
        book_qty: bookQty,
        actual_qty: bookQty,
        unit_name: resultData.value.unit || '',
        remarks: ''
      }

      existingItems.push(newItem)
      await inventoryApi.updateCheck(checkOrder.id, { ...checkData, items: existingItems })

      closeToast()
      showToast({ type: 'success', message: `已添加到 ${checkOrder.check_no}` })

      // 继续扫码
      setTimeout(() => resetScan(), 1500)
    } catch (err) {
      closeToast()
      console.error('添加到盘点单失败:', err)
      showToast({ type: 'fail', message: err.message || '添加失败' })
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
          specification: material.specs,
          unit: material.unit_name || material.unit,
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

    const targetRoute = routeMap[selectedType.value]
    if (targetRoute) {
      router.push(targetRoute)
    }
  }

  // 封装底层组件的防护性方法，避免在非期待状态时抛出内部异常导致应用崩溃
  const safeResumeCamera = () => {
    if (!html5QrCode.value) return
    try {
      if (typeof html5QrCode.value.resume === 'function') {
        const state = typeof html5QrCode.value.getState === 'function' ? html5QrCode.value.getState() : 0
        // Html5QrcodeScannerState.PAUSED === 3, 若组件无状态返回则当防卫性兜底
        if (state === 3 || !state) {
          html5QrCode.value.resume()
        }
      }
    } catch (e) {
      console.warn('相机恢复指令执行偏离预期:', e)
    }
  }

  const safePauseCamera = (scannerInstance) => {
    if (!scannerInstance) return
    try {
      if (typeof scannerInstance.pause === 'function') {
        const state = typeof scannerInstance.getState === 'function' ? scannerInstance.getState() : 0
        // Html5QrcodeScannerState.SCANNING === 2
        if (state === 2) {
          scannerInstance.pause()
        }
      }
    } catch (e) {
      console.warn('相机暂停指令执行偏离预期:', e)
    }
  }

  // 重置扫码状态
  const resetScan = () => {
    try {
      scanResult.value = ''
      resultData.value = null
      loading.value = false
      safeResumeCamera()
    } catch (err) {
      console.warn('状态重置过程中发生未捕获异常:', err)
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
    // 盘点扫码：直接在当前页面切换到盘点模式
    if (action.value === 'check') {
      scanMode.value = 'check'
      selectedType.value = 'check'
      resetScan()
      showToast('已切换到盘点扫码模式')
      return
    }

    const routeMap = {
      inbound: '/inventory/inbound',
      outbound: '/inventory/outbound',
      transfer: '/inventory/transfer'
    }

    const r = routeMap[action.value]
    if (r) {
      router.push(r)
    }
  }

  // 检查相机权限并启动
  const checkCameraPermissionAndStart = async () => {
    try {
      // HTTP 环境下 navigator.mediaDevices 不存在（需要 HTTPS 或 localhost）
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('当前环境不支持摄像头 API（需要 HTTPS 或 localhost）')
        showToast('请使用 HTTPS 访问以启用摄像头，或使用手动输入')
        return
      }

      // 获取设备列表
      const devices = await Html5Qrcode.getCameras()
      if (devices && devices.length) {
        cameras.value = devices

        // 智能识别后置摄像头（兼容中英文设备标签）
        let backIdx = devices.findIndex((d) => isBackCamera(d.label))

        if (backIdx >= 0) {
          currentCameraIndex.value = backIdx
          cameraId.value = devices[backIdx].id
          startScanning(cameraId.value)
        } else {
          // 无法通过标签识别后置摄像头，使用 facingMode 回退
          currentCameraIndex.value = devices.length > 1 ? devices.length - 1 : 0
          cameraId.value = ''
          startScanning({ facingMode: 'environment' })
        }
      } else {
        showToast('未检测到摄像头')
      }
    } catch (err) {
      console.error('获取摄像头失败:', err)
      const errMsg = (err && (err.message || String(err))) || '无法访问摄像头'
      showToast(`${errMsg}，请使用手动输入`)
    }
  }

  // 启动扫描
  // cameraIdOrConstraints 可以是摄像头ID字符串，或 { facingMode: 'environment' } 约束对象
  const startScanning = async (cameraIdOrConstraints) => {
    // 如果之前有扫描实例在运行，先停止
    await stopScanning()

    const qrCodeScanner = new Html5Qrcode('reader', {
      formatsToSupport: SUPPORTED_FORMATS,
      verbose: false
    })
    html5QrCode.value = qrCodeScanner

    // 扫描区域配置：使用宽矩形适配一维条码
    // 根据预览容器宽度动态计算
    const readerEl = document.getElementById('reader')
    const previewWidth = readerEl ? readerEl.clientWidth : 300
    const boxWidth = Math.min(Math.floor(previewWidth * 0.85), 320)
    const boxHeight = Math.floor(boxWidth * 0.45)  // 宽高比约 2.2:1，适配一维条码
    const config = {
      fps: 15,
      qrbox: { width: boxWidth, height: boxHeight },
      aspectRatio: 1.0,
      disableFlip: false,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true  // 优先使用浏览器原生 BarcodeDetector API
      }
    }

    try {

      await qrCodeScanner.start(
        cameraIdOrConstraints,
        config,
        (decodedText) => {
          handleScanCode(decodedText)
          safePauseCamera(qrCodeScanner)
        },
        () => {
          // 扫码失败/识别中回调，通常忽略
        }
      )

      // 后置摄像头可能有闪光灯
      hasFlash.value = true
    } catch (err) {
      console.error('启动扫描失败:', err)

      // 如果 facingMode 方式失败，回退到最后一个摄像头（通常是后置）
      if (typeof cameraIdOrConstraints === 'object' && cameras.value.length > 0) {
        // facingMode 方式失败，回退到最后一个摄像头
        const lastDevice = cameras.value[cameras.value.length - 1]
        try {
          await qrCodeScanner.start(
            lastDevice.id,
            config,
            (decodedText) => {
              handleScanCode(decodedText)
              safePauseCamera(qrCodeScanner)
            },
            () => {}
          )
          currentCameraIndex.value = cameras.value.length - 1
          cameraId.value = lastDevice.id
          hasFlash.value = true
          return
        } catch (fallbackErr) {
          console.error('回退启动也失败:', fallbackErr)
        }
      }

      showToast('启动相机失败')
    }
  }

  // 切换摄像头（前后切换）
  const switchCamera = async () => {
    if (cameras.value.length < 2) {
      showToast('只有一个摄像头，无法切换')
      return
    }

    // 循环切换到下一个摄像头
    const nextIndex = (currentCameraIndex.value + 1) % cameras.value.length
    currentCameraIndex.value = nextIndex
    cameraId.value = cameras.value[nextIndex].id

    showToast(`切换到${currentFacingLabel.value}`)

    // 重新启动扫描
    await startScanning(cameraId.value)
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
       // 获取视频轨道
      // 使用 html5-qrcode 暴露的 applyVideoConstraints 尝试应用 torch 约束

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
    try {
      // 检查 URL 参数，判断扫码模式
      if (route.query.mode === 'check') {
        scanMode.value = 'check'
        selectedType.value = 'check'
      }
      // 检查相机权限并启动扫描
      checkCameraPermissionAndStart()
    } catch (e) {
      console.error('扫码页初始化错误:', e)
    }
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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-btn {
    padding: 0.5rem;
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
    padding: 0.75rem 0.5rem;
    border-radius: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--glass-border);
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.3s;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .type-tab.active {
    background: linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%);
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
    width: 85%;
    max-width: 20rem;
    height: 7rem;
  }

  .corner {
    position: absolute;
    width: 2.5rem;
    height: 1.5rem;
    border: 3px solid var(--color-primary);
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
    background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
    animation: scan 2s linear infinite;
  }

  @keyframes scan {
    0% {
      transform: translateY(0);
    }

    100% {
      transform: translateY(7rem);
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
    background: linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%);
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

  /* 盘点模式 - 选择盘点单区域 */
  .check-select-section {
    margin: 1rem 0;
    padding-top: 1rem;
    border-top: 1px solid var(--glass-border);
  }
  .check-section-title {
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
  }
  .check-empty {
    text-align: center;
    padding: 1rem 0;
    p {
      font-size: 0.8125rem;
      color: var(--text-tertiary);
      margin-bottom: 0.75rem;
    }
  }
  .check-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .check-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--bg-primary);
    border-radius: 10px;
    border: 1px solid var(--glass-border);
    cursor: pointer;
    transition: all 0.2s;
    &:active {
      transform: scale(0.98);
      border-color: var(--color-primary);
    }
  }
  .check-item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .check-no {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Menlo', monospace;
  }
  .check-meta {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .check-item-action {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--color-primary);
    flex-shrink: 0;
  }
  .add-hint {
    font-size: 0.75rem;
    font-weight: 600;
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
    background: linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%);
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
