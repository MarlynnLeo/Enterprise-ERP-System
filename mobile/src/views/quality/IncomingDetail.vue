<!--
/**
 * IncomingDetail.vue
 * @description 来料检验详情页面（与网页端对齐）
 * @date 2026-04-24
 * @version 3.0.0
 *
 * 功能：
 * - 检验项目列表（自动加载模板或默认项）
 * - 每项可逐项判定合格/不合格
 * - 合格/不合格数量可编辑
 * - 提交检验结果
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="来料检验详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="inspection">
      <!-- 状态卡片 -->
      <div class="status-card">
        <div class="status-badge" :class="getStatusClass(inspection.status)">
          {{ getStatusLabel(inspection.status) }}
        </div>
        <div class="inspection-no">
          {{ inspection.inspectionNumber || inspection.inspectionNo }}
        </div>
      </div>

      <!-- 基本信息 -->
      <CellGroup inset title="基本信息">
        <Cell title="批次号" :value="inspection.batchNo || '--'" />
        <Cell title="物料名称" :value="inspection.itemName || '--'" />
        <Cell title="供应商" :value="inspection.supplierName || '--'" />
        <Cell
          title="检验日期"
          :value="formatDate(inspection.actualDate || inspection.createdAt)"
        />
      </CellGroup>

      <!-- 数量信息（检验中状态可编辑） -->
      <CellGroup inset title="数量信息">
        <Cell title="到货数量" :value="`${inspection.quantity || 0} ${inspection.unit || '件'}`" />
        <Cell title="抽检数量" :value="`${inspection.sampleSize || 0}`" />
      </CellGroup>

      <!-- 检验项目（检验中才显示，可操作） -->
      <div class="inspect-section" v-if="isInspecting || hasInspected">
        <div class="section-header">
          <span class="section-title">检验项目</span>
          <span class="section-hint" v-if="isInspecting">逐项判定</span>
        </div>
        <div class="inspect-items">
          <div
            class="inspect-item"
            v-for="(item, idx) in inspectItems"
            :key="idx"
            :class="{ 'item-passed': item.result === 'passed', 'item-failed': item.result === 'failed' }"
          >
            <div class="item-header">
              <span class="item-name">{{ item.itemName }}</span>
              <span class="item-method" v-if="item.method || item.inspectionMethod">{{ item.method || item.inspectionMethod }}</span>
              <span class="item-critical" v-if="item.isCritical">关键</span>
            </div>
            <div class="item-standard" v-if="item.standard">
              标准：{{ item.standard }}
            </div>
            <!-- 公差标准显示（若有结构化尺寸数据） -->
            <div class="item-dimension" v-if="formatTolerance(item)">
              公差：{{ formatTolerance(item) }}
            </div>
            <!-- 实测数值手动录入（由通用 inspectionMeasurement 引擎解析为数值型项目时自动启用） -->
            <div class="item-actual-row" v-if="isInspecting && item.isNumeric">
              <Field
                v-model="item.actualValue"
                label="实测值"
                :placeholder="item.placeholder"
                size="small"
                clearable
                class="actual-field"
                @input="onActualValueChange(item)"
              />
            </div>
            <div class="item-actual-text" v-else-if="item.actualValue">
              实测值：{{ item.actualValue }}
            </div>
            <!-- 结果判定（检验中可操作） -->
            <div class="item-actions" v-if="isInspecting">
              <button
                class="result-btn btn-pass"
                :class="{ active: item.result === 'passed' }"
                @click="item.result = 'passed'"
              >
                ✓ 合格
              </button>
              <button
                class="result-btn btn-fail"
                :class="{ active: item.result === 'failed' }"
                @click="item.result = 'failed'"
              >
                ✗ 不合格
              </button>
            </div>
            <!-- 已完成结果显示 -->
            <div class="item-result" v-else-if="hasInspected">
              <span :class="item.result === 'passed' ? 'result-pass' : 'result-fail'">
                {{ item.result === 'passed' ? '✓ 合格' : '✗ 不合格' }}
              </span>
            </div>
            <!-- 备注输入 -->
            <Field
              v-if="isInspecting"
              v-model="item.remarks"
              placeholder="备注（可选）"
              size="small"
              class="item-remark"
            />
          </div>
        </div>
      </div>

      <!-- 检验结果录入（检验中可编辑） -->
      <CellGroup v-if="isInspecting" inset title="检验结果录入">
        <Field
          v-model="inspectForm.qualifiedQuantity"
          type="digit"
          label="合格数量"
          placeholder="请输入合格数量"
          @input="onQualifiedChange"
        />
        <Field
          v-model="inspectForm.unqualifiedQuantity"
          type="digit"
          label="不合格数量"
          placeholder="自动计算"
          readonly
        />
        <Field
          v-model="inspectForm.inspectorName"
          label="检验员"
          placeholder="请输入检验员姓名"
        />
        <Cell title="合格率" :value="`${computedPassRate}%`" />
      </CellGroup>

      <!-- 已完成的结果展示 -->
      <CellGroup v-else-if="hasInspected" inset title="检验结果">
        <Cell title="合格数" :value="`${inspection.qualifiedQuantity || 0}`" value-class="pass-text" />
        <Cell
          title="不合格数"
          :value="`${inspection.unqualifiedQuantity || 0}`"
          value-class="fail-text"
        />
        <Cell title="合格率" :value="`${calculatePassRate(inspection)}%`" />
        <Cell
          v-if="inspection.inspectorName"
          title="检验员"
          :value="inspection.inspectorName"
        />
      </CellGroup>

      <!-- 问题照片留证（拍照上传 / 手机相册） -->
      <CellGroup inset title="问题照片留证">
        <div class="photo-card-body">
          <div class="photo-hint" v-if="isInspecting">
            如物料存在外观缺陷、尺寸超差或包装破损，请拍照或从相册选择照片留证
          </div>

          <!-- 照片网格列表 -->
          <div class="photo-grid">
            <div
              v-for="(photo, pIdx) in photoList"
              :key="pIdx"
              class="photo-item"
              @click="previewPhoto(pIdx)"
            >
              <img :src="buildResourceUrl(photo.url)" class="photo-img" alt="现场照片" />
              <div
                v-if="isInspecting"
                class="photo-delete"
                @click.stop="removePhoto(pIdx)"
              >
                ✕
              </div>
            </div>

            <!-- 拍照上传按钮（无 emoji） -->
            <div
              class="upload-trigger-btn camera-btn"
              v-if="isInspecting && photoList.length < INSPECTION_PHOTO_MAX_COUNT"
              @click="triggerCamera"
            >
              <CameraIcon class="trigger-svg-icon" />
              <div class="trigger-text">拍照上传</div>
            </div>

            <!-- 手机相册按钮（无 emoji） -->
            <div
              class="upload-trigger-btn album-btn"
              v-if="isInspecting && photoList.length < INSPECTION_PHOTO_MAX_COUNT"
              @click="triggerAlbum"
            >
              <PhotoIcon class="trigger-svg-icon" />
              <div class="trigger-text">手机相册</div>
            </div>
          </div>

          <div v-if="hasInspected && photoList.length === 0" class="photo-empty-text">
            未上传问题照片
          </div>
        </div>

        <!-- 隐形拍照 input (capture=environment) -->
        <input
          ref="cameraInputRef"
          type="file"
          :accept="INSPECTION_PHOTO_ACCEPT"
          capture="environment"
          style="display: none"
          @change="handlePhotoChange($event)"
        />

        <!-- 隐形相册多选 input -->
        <input
          ref="albumInputRef"
          type="file"
          :accept="INSPECTION_PHOTO_ACCEPT"
          multiple
          style="display: none"
          @change="handlePhotoChange($event)"
        />
      </CellGroup>

      <!-- 备注 -->
      <CellGroup v-if="isInspecting" inset title="备注">
        <Field
          v-model="inspectForm.note"
          type="textarea"
          rows="2"
          autosize
          placeholder="请输入检验备注"
        />
      </CellGroup>
      <CellGroup v-else-if="inspection.remark || inspection.note" inset title="备注">
        <Cell :title="inspection.remark || inspection.note" />
      </CellGroup>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="inspection.status === 'pending'" v-permission="'quality:incoming:update'">
        <VanButton round block type="primary" @click="handleStart" :loading="actionLoading">
          开始检验
        </VanButton>
      </div>
      <div class="action-section" v-else-if="isInspecting" v-permission="'quality:incoming:update'">
        <VanButton round block type="success" @click="handleSubmit" :loading="actionLoading">
          提交检验
        </VanButton>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="loading" class="loading-container">
      <Loading size="36" vertical>加载中...</Loading>
    </div>

    <div v-else class="error-container">
      <Empty :description="errorMessage || '来料检验记录不存在或已被删除'" />
      <div class="error-actions">
        <VanButton type="primary" size="small" :loading="loading" @click="loadDetail">重试</VanButton>
        <VanButton type="default" size="small" @click="goBack">返回列表</VanButton>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    NavBar,
    CellGroup,
    Cell,
    Field,
    Button as VanButton,
    Loading,
    Empty,
    showToast,
    showLoadingToast,
    closeToast,
    showConfirmDialog,
    showImagePreview
  } from 'vant'
  import { CameraIcon, PhotoIcon } from '@heroicons/vue/24/outline'
  import { qualityApi } from '@/api'
  import { buildResourceUrl } from '@/config/app'
  import { extractApiData, extractApiList } from '@/utils/apiHelper'
  import { useAuthStore } from '@/stores/auth'
  import {
    isNumericInspectionItem,
    parseInspectionStandard,
    compareInspectionMeasurement
  } from '@/utils/inspectionMeasurement'
  import {
    ATTACHMENT_MAX_SIZE_BYTES,
    ATTACHMENT_MAX_SIZE_MB,
    INSPECTION_PHOTO_ACCEPT,
    INSPECTION_PHOTO_EXTENSIONS,
    INSPECTION_PHOTO_MAX_COUNT,
    INSPECTION_PHOTO_MIME_TYPES
  } from '@/constants/attachmentUpload'

  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const inspection = ref(null)
  const loading = ref(true)
  const errorMessage = ref('')
  const actionLoading = ref(false)
  const inspectItems = ref([])
  const photoList = ref([])
  const uploadingPhotoCount = ref(0)
  const cameraInputRef = ref(null)
  const albumInputRef = ref(null)

  // 自动获取当前登录用户的姓名（参考网页版）
  const getCurrentUserDisplayName = () => {
    const currentUser = authStore.user || {}
    return (
      currentUser.realName ||
      currentUser.name ||
      currentUser.username ||
      ''
    )
  }

  // 拍照与相册触发
  const triggerCamera = () => {
    cameraInputRef.value?.click()
  }

  const triggerAlbum = () => {
    albumInputRef.value?.click()
  }

  const getFileExtension = (file) => {
    const fileName = String(file?.name || '').trim().toLowerCase()
    const lastDot = fileName.lastIndexOf('.')
    return lastDot >= 0 ? fileName.slice(lastDot) : ''
  }

  const isSupportedInspectionPhoto = (file) => {
    const mimeType = String(file?.type || '').split(';', 1)[0].trim().toLowerCase()
    return (
      INSPECTION_PHOTO_MIME_TYPES.includes(mimeType) ||
      INSPECTION_PHOTO_EXTENSIONS.includes(getFileExtension(file))
    )
  }

  const normalizePhoto = (photo) => {
    if (typeof photo === 'string') {
      return {
        url: photo,
        name: photo.split('/').pop() || '现场照片'
      }
    }

    return {
      ...photo,
      id: photo?.id,
      url: photo?.url || photo?.fileUrl || photo?.file_url || photo?.path || photo?.filePath || '',
      name: photo?.name || photo?.filename || photo?.originalName || '现场照片',
      size: photo?.size ?? photo?.fileSize ?? photo?.file_size,
      type: photo?.type || photo?.mimetype || photo?.mimeType || photo?.fileType || ''
    }
  }

  // 照片上传处理
  const handlePhotoChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const remainingCount = INSPECTION_PHOTO_MAX_COUNT - photoList.value.length - uploadingPhotoCount.value
    if (files.length > remainingCount) {
      showToast(`最多保留 ${INSPECTION_PHOTO_MAX_COUNT} 张照片，还可选择 ${Math.max(remainingCount, 0)} 张`)
      event.target.value = ''
      return
    }

    for (const file of files) {
      if (!isSupportedInspectionPhoto(file)) {
        showToast('请选择 JPG、PNG、GIF、BMP 或 WebP 图片')
        event.target.value = ''
        return
      }
      if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
        showToast(`单张图片大小不能超过 ${ATTACHMENT_MAX_SIZE_MB}MB`)
        event.target.value = ''
        return
      }
    }

    uploadingPhotoCount.value += files.length
    let successCount = 0
    let failureCount = 0
    let firstFailureMessage = ''

    try {
      showLoadingToast({
        message: '正在上传照片...',
        forbidClick: true,
        duration: 0
      })

      const inspectionId = inspection.value?.id || route.params.id

      for (const file of files) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('businessType', 'quality_inspection')
          formData.append('businessId', inspectionId)
          formData.append('isPublic', 'true')

          const res = await qualityApi.uploadInspectionPhoto(formData)
          const fileData = extractApiData(res, null) || res.data || res
          const uploadedUrl = String(fileData?.url || fileData?.fileUrl || '').trim()
          if (!uploadedUrl) {
            throw new Error('服务器未返回照片地址')
          }

          if (!photoList.value.some((photo) => String(photo.url || '') === uploadedUrl)) {
            photoList.value.push({
              id: fileData?.id,
              url: uploadedUrl,
              name: fileData?.filename || fileData?.originalName || file.name,
              size: fileData?.size ?? file.size,
              type: fileData?.mimetype || fileData?.mimeType || file.type || ''
            })
          }
          successCount += 1
        } catch (error) {
          failureCount += 1
          firstFailureMessage ||= error.response?.data?.message || error.message || ''
          console.error(`照片上传失败（${file.name}）:`, error)
        }
      }

      closeToast()
      if (successCount > 0 && failureCount > 0) {
        showToast(`成功上传 ${successCount} 张，${failureCount} 张失败`)
      } else if (successCount > 0) {
        showToast(`照片上传成功（${successCount} 张）`)
      } else {
        showToast(firstFailureMessage || '照片上传失败')
      }
    } catch (err) {
      closeToast()
      console.error('照片上传失败:', err)
      const msg = err.response?.data?.message || err.message || '照片上传失败'
      showToast(msg)
    } finally {
      uploadingPhotoCount.value = Math.max(0, uploadingPhotoCount.value - files.length)
      event.target.value = ''
    }
  }

  // 移除照片
  const removePhoto = (index) => {
    photoList.value.splice(index, 1)
    showToast('已移除该照片')
  }

  // 全屏高清双指缩放预览照片
  const previewPhoto = (startIndex) => {
    const urls = photoList.value.map((photo) => buildResourceUrl(photo.url)).filter(Boolean)
    if (urls.length > 0) {
      showImagePreview({
        images: urls,
        startPosition: Math.min(Math.max(startIndex, 0), urls.length - 1),
        closeable: true
      })
    }
  }

  // 检验表单
  const inspectForm = reactive({
    qualifiedQuantity: '',
    unqualifiedQuantity: '',
    inspectorName: '',
    note: ''
  })

  // 状态判断
  const isInspecting = computed(() => inspection.value?.status === 'in_progress')
  const hasInspected = computed(() => {
    const s = inspection.value?.status
    return ['passed', 'failed', 'completed', 'partial'].includes(s)
  })

  // 格式化公差
  const formatTolerance = (item) => {
    if (item.dimensionValue !== null && item.dimensionValue !== undefined && item.dimensionValue !== '') {
      const dv = parseFloat(item.dimensionValue)
      const upper = parseFloat(item.toleranceUpper) || 0
      const lower = Math.abs(parseFloat(item.toleranceLower)) || 0
      if (upper === 0 && lower === 0) return `${dv.toFixed(2)}`
      return `${dv.toFixed(2)} (+${upper.toFixed(2)}/-${lower.toFixed(2)})`
    }
    return ''
  }

  // 规范化单条检验项（统一底层规则，与 PC 端保持一致）
  const normalizeInspectionItem = (item) => {
    const isNumeric = isNumericInspectionItem(item)
    const actualVal = item.actualValue || item.measure1 || ''

    const readField = (...names) => {
      for (const name of names) {
        if (item?.[name] !== undefined && item?.[name] !== null && item?.[name] !== '') return item[name]
      }
      return null
    }

    let result = item.result || ''
    // 若已有实测值且尚未判定，自动通过通用引擎计算公差结果
    if (isNumeric && actualVal && !result) {
      const evaluation = compareInspectionMeasurement(item, actualVal)
      if (evaluation.result) result = evaluation.result
    }

    // 动态生成友好的输入引导
    const rule = parseInspectionStandard(item)
    let placeholder = '手动输入实测数值'
    if (rule.mode === 'numeric') {
      if (rule.operator === 'gte') placeholder = `实测值（要求 ≥${rule.nominal}）`
      else if (rule.operator === 'gt') placeholder = `实测值（要求 >${rule.nominal}）`
      else if (rule.operator === 'lte') placeholder = `实测值（要求 ≤${rule.nominal}）`
      else if (rule.operator === 'lt') placeholder = `实测值（要求 <${rule.nominal}）`
      else if (rule.operator === 'range' || rule.operator === 'tolerance') placeholder = `实测值（范围 ${rule.lowerBound}~${rule.upperBound}）`
      else if (rule.operator === 'eq') placeholder = `实测值（要求 =${rule.nominal}）`
    }

    return {
      id: item.id || undefined,
      itemName: readField('itemName', 'item_name') || '',
      standard: item.standard || item.criteria || item.requirement || '',
      method: readField('method', 'inspectionMethod', 'inspection_method') || '',
      type: readField('type', 'itemType', 'item_type') || 'other',
      isCritical: !!(item.isCritical ?? item.is_critical),
      dimensionValue: item.dimensionValue ?? item.dimension_value ?? null,
      toleranceUpper: item.toleranceUpper ?? item.tolerance_upper ?? null,
      toleranceLower: item.toleranceLower ?? item.tolerance_lower ?? null,
      actualValue: actualVal,
      result: result,
      remarks: item.remarks || item.remark || '',
      isNumeric,
      placeholder
    }
  }

  // 计算合格率
  const computedPassRate = computed(() => {
    const q = Number(inspectForm.qualifiedQuantity) || 0
    const uq = Number(inspectForm.unqualifiedQuantity) || 0
    const total = q + uq
    if (total === 0) return 0
    return Math.round((q / total) * 100)
  })

  // 合格数量变化自动计算不合格数量
  const onQualifiedChange = () => {
    const totalQty = Number(inspection.value?.quantity) || 0
    const qualifiedQty = Number(inspectForm.qualifiedQuantity) || 0
    if (qualifiedQty > totalQty) {
      inspectForm.qualifiedQuantity = String(totalQty)
      inspectForm.unqualifiedQuantity = '0'
    } else {
      inspectForm.unqualifiedQuantity = String(totalQty - qualifiedQty)
    }
  }

  // 实测数值输入时，通过通用引擎实时评估公差
  const onActualValueChange = (item) => {
    if (!item.isNumeric) return
    if (!item.actualValue && item.actualValue !== 0) {
      item.result = ''
      return
    }
    const evalResult = compareInspectionMeasurement(item, item.actualValue)
    if (evalResult.result) {
      item.result = evalResult.result
    }
  }

  const getStatusLabel = (status) => {
    const map = {
      pending: '待检验',
      in_progress: '检验中',
      completed: '已完成',
      passed: '已合格',
      failed: '不合格',
      partial: '部分合格',
      received: '已入库'
    }
    return map[status] || status
  }

  const getStatusClass = (status) => {
    const map = {
      pending: 'pending',
      in_progress: 'in-progress',
      completed: 'completed',
      passed: 'passed',
      failed: 'failed',
      partial: 'partial',
      received: 'received'
    }
    return map[status] || 'default'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const calculatePassRate = (item) => {
    const total = (item.qualifiedQuantity || 0) + (item.unqualifiedQuantity || 0)
    if (total === 0) return 0
    return Math.round(((item.qualifiedQuantity || 0) / total) * 100)
  }

  // 加载详情
  const loadDetail = async () => {
    loading.value = true
    errorMessage.value = ''
    inspection.value = null
    inspectItems.value = []
    photoList.value = []
    let lastError = null

    try {
      try {
      const response = await qualityApi.getIncomingInspection(route.params.id)
      const data = extractApiData(response, null)
      if (data && data.id) {
        inspection.value = data

        // 加载检验项目（从详情或独立项目接口）
        let itemsList = data.items || []
        if (itemsList.length === 0) {
          try {
            const itemsRes = await qualityApi.getInspectionItems(data.id)
            itemsList = extractApiList(itemsRes)
          } catch (error) {
            console.warn('检验项目加载失败:', error)
          }
        }

        // 若单据尚无检验项目，按物料自动匹配启用模板（与 PC 端逻辑完全对齐）
        if (itemsList.length === 0) {
          const materialId = data.materialId
          if (materialId) {
            try {
              const res = await qualityApi.getInspectionTemplates({
                material_type: materialId,
                inspection_type: 'incoming',
                status: 'active',
                include_general: true,
                pageSize: 10
              })
              const tmplList = extractApiList(res)
              if (tmplList.length > 0) {
                const targetTmpl = tmplList[0]
                const detailRes = await qualityApi.getInspectionTemplate(targetTmpl.id)
                const tmplData = extractApiData(detailRes, null) || detailRes.data || detailRes
                itemsList = tmplData.items || tmplData.InspectionItems || []
                data.templateId = targetTmpl.id
              }
            } catch (err) {
              console.warn('自动匹配模板失败:', err)
            }
          }
        }

        if (itemsList.length > 0) {
          inspectItems.value = itemsList.map(normalizeInspectionItem)
        } else if (data.status === 'in_progress' || data.status === 'pending') {
          inspectItems.value = []
          showToast('当前检验单未配置检验项目')
        }

        // 初始化照片列表
        if (Array.isArray(data.attachments)) {
          photoList.value = data.attachments.map(normalizePhoto).filter((photo) => photo.url)
        } else {
          photoList.value = []
        }

        // 初始化表单（参考网页版：若无历史检验员姓名则自动获取当前登录用户的姓名）
        inspectForm.qualifiedQuantity = String(data.qualifiedQuantity || data.quantity || '')
        inspectForm.unqualifiedQuantity = String(data.unqualifiedQuantity || '0')
        inspectForm.inspectorName = data.inspectorName || getCurrentUserDisplayName()
        inspectForm.note = data.note || data.remark || ''
        return
      }
      lastError = Object.assign(new Error('inspection not found'), { code: 'NOT_FOUND' })
      } catch (e) {
        lastError = e
        console.error('API加载失败，尝试备用方式:', e)
      }

    // 备用：从路由 query 获取
    if (route.query.data) {
      try {
        const data = JSON.parse(route.query.data)
        if (!data || typeof data !== 'object') throw new Error('invalid inspection data')
        inspection.value = data
        inspectForm.qualifiedQuantity = String(inspection.value.quantity || '')
        inspectForm.unqualifiedQuantity = '0'
        inspectForm.inspectorName = inspection.value.inspectorName || getCurrentUserDisplayName()
        inspectForm.note = inspection.value.note || inspection.value.remark || ''
        return
      } catch (error) {
        lastError = error
      }
    } else {
      // 通过列表 API 兜底
      try {
        const response = await qualityApi.getIncomingInspections({ id: route.params.id, limit: 1, include_supplier: true })
        const data = response.data || response
        const items = data.items || data.list || data.inspections || []
        if (items.length > 0) {
          inspection.value = items[0]
          inspectItems.value = Array.isArray(items[0].items) ? items[0].items.map(normalizeInspectionItem) : []
          photoList.value = Array.isArray(items[0].attachments)
            ? items[0].attachments.map(normalizePhoto).filter((photo) => photo.url)
            : []
          inspectForm.qualifiedQuantity = String(items[0].quantity || '')
          inspectForm.unqualifiedQuantity = '0'
          inspectForm.inspectorName = items[0].inspectorName || getCurrentUserDisplayName()
          inspectForm.note = items[0].note || items[0].remark || ''
          return
        } else {
          lastError = Object.assign(new Error('inspection not found'), { code: 'NOT_FOUND' })
        }
      } catch (error) {
        lastError = error
      }
    }

      const status = lastError?.response?.status
      errorMessage.value = status === 403
        ? '没有权限查看此来料检验记录'
        : status === 404 || lastError?.code === 'NOT_FOUND'
          ? '来料检验记录不存在或已被删除'
          : '加载失败，请重试'
      showToast(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  const goBack = () => router.back()

  // 开始检验
  const handleStart = async () => {
    actionLoading.value = true
    try {
      await qualityApi.startInspection(inspection.value.id)
      showToast('检验已开始')
      inspection.value.status = 'in_progress'
      if (inspectItems.value.length === 0) {
        showToast('当前检验单未配置检验项目，请先维护检验模板')
      }
      // 初始化合格数量为到货数量
      inspectForm.qualifiedQuantity = String(inspection.value.quantity || '')
      inspectForm.unqualifiedQuantity = '0'
      if (!inspectForm.inspectorName) {
        inspectForm.inspectorName = getCurrentUserDisplayName()
      }
    } catch (error) {
      console.error('开始检验失败:', error)
      const msg = error.response?.data?.message || '操作失败'
      showToast(msg)
    } finally {
      actionLoading.value = false
    }
  }

  // 提交检验
  const handleSubmit = async () => {
    if (inspectItems.value.length === 0) {
      showToast('当前检验单没有检验项目，不能提交')
      return
    }

    // 验证：检验项目是否全部判定
    const unjudgedItems = inspectItems.value.filter(item => !item.result)
    if (unjudgedItems.length > 0) {
      showToast(`还有 ${unjudgedItems.length} 项未判定`)
      return
    }

    // 验证：合格数量
    const qualifiedQty = Number(inspectForm.qualifiedQuantity) || 0
    const unqualifiedQty = Number(inspectForm.unqualifiedQuantity) || 0
    if (qualifiedQty + unqualifiedQty <= 0) {
      showToast('请输入有效的合格数量')
      return
    }

    // 自动判定总状态
    const failedCount = inspectItems.value.filter(i => i.result === 'failed').length
    let status = 'passed'
    if (failedCount > 0 && failedCount < inspectItems.value.length) {
      status = unqualifiedQty > 0 ? 'failed' : 'passed'
    } else if (failedCount === inspectItems.value.length) {
      status = 'failed'
    }
    if (unqualifiedQty > 0 && qualifiedQty > 0) {
      status = 'failed' // 有不合格品就标记不合格
    } else if (unqualifiedQty > 0 && qualifiedQty === 0) {
      status = 'failed'
    }

    try {
      await showConfirmDialog({
        title: '确认提交',
        message: `合格 ${qualifiedQty}，不合格 ${unqualifiedQty}\n照片留存：${photoList.value.length} 张\n检验结论：${status === 'passed' ? '合格' : '不合格'}\n\n确定提交吗？`
      })

      actionLoading.value = true

      const submitData = {
        templateId: inspection.value?.templateId || null,
        qualifiedQuantity: qualifiedQty,
        unqualifiedQuantity: unqualifiedQty,
        status,
        inspectorName: inspectForm.inspectorName,
        actualDate: new Date().toISOString().split('T')[0],
        note: inspectForm.note,
        attachments: photoList.value.map((photo) => photo.url).filter(Boolean),
        items: inspectItems.value.map(item => ({
          id: item.id || undefined,
          itemName: item.itemName,
          standard: item.standard,
          method: item.method || '',
          type: item.type,
          isCritical: item.isCritical ? 1 : 0,
          result: item.result,
          remarks: item.remarks || '',
          actualValue: item.actualValue || '',
          actual_value: item.actualValue || '',
          measure1: item.actualValue || '',
          dimensionValue: item.dimensionValue || null,
          toleranceUpper: item.toleranceUpper || null,
          toleranceLower: item.toleranceLower || null
        }))
      }

      await qualityApi.updateIncomingInspection(inspection.value.id, submitData)
      showToast('检验提交成功')

      // 刷新详情
      await loadDetail()
    } catch (error) {
      if (error === 'cancel') return
      console.error('提交检验失败:', error)
      const msg = error.response?.data?.message || '提交失败'
      showToast(msg)
    } finally {
      actionLoading.value = false
    }
  }

  onMounted(loadDetail)
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
    background-color: var(--bg-primary);
    padding-bottom: var(--app-bottom-space);
  }

  .content-container {
    padding: 12px;
  }

  .status-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 12px;
    text-align: center;
    border: 1px solid var(--surface-border, var(--border-subtle));
  }

  .status-card .status-badge {
    display: inline-block;
    padding: 4px 16px;
    border-radius: 20px;
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 8px;

    &.pending {
      background: rgba(255, 170, 0, 0.15);
      color: #ffaa00;
    }
    &.in-progress {
      background: rgba(94, 123, 246, 0.15);
      color: #5E7BF6;
    }
    &.completed {
      background: color-mix(in srgb, var(--color-success) 15%, transparent);
      color: var(--color-success);
    }
    &.received {
      background: color-mix(in srgb, var(--color-success) 15%, transparent);
      color: var(--color-success);
    }
    &.passed {
      background: rgba(16, 185, 129, 0.15);
      color: var(--color-success);
    }
    &.failed {
      background: rgba(239, 68, 68, 0.15);
      color: var(--color-error);
    }
    &.partial {
      background: rgba(245, 158, 11, 0.15);
      color: var(--color-warning);
    }
    &.default {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
    }
  }

  .status-card .inspection-no {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  /* 检验项目区域 */
  .inspect-section {
    margin: 12px 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px 8px;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .section-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .inspect-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;
  }

  .inspect-item {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 16px;
    border: 1px solid var(--surface-border, var(--border-subtle));
    transition: border-color 0.2s;

    &.item-passed {
      border-color: rgba(16, 185, 129, 0.4);
    }
    &.item-failed {
      border-color: rgba(239, 68, 68, 0.4);
    }
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .item-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .item-critical {
    font-size: 0.625rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.12);
    color: var(--color-error);
    font-weight: 600;
  }

  .item-standard {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-bottom: 8px;
  }

  .item-dimension {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 8px;
    font-family: 'SF Mono', monospace;
  }

  .item-actions {
    display: flex;
    gap: 10px;
  }

  .result-btn {
    flex: 1;
    padding: 8px 0;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 600;
    border: 1.5px solid;
    background: transparent;
    cursor: pointer;
    transition: background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s;

    &.btn-pass {
      border-color: rgba(16, 185, 129, 0.3);
      color: var(--color-success);
      &.active {
        background: rgba(16, 185, 129, 0.15);
        border-color: var(--color-success);
      }
    }

    &.btn-fail {
      border-color: rgba(239, 68, 68, 0.3);
      color: var(--color-error);
      &.active {
        background: rgba(239, 68, 68, 0.15);
        border-color: var(--color-error);
      }
    }
  }

  .item-result {
    margin-top: 4px;
  }

  .result-pass {
    color: var(--color-success);
    font-weight: 600;
    font-size: 0.8125rem;
  }

  .result-fail {
    color: var(--color-error);
    font-weight: 600;
    font-size: 0.8125rem;
  }

  .item-remark {
    margin-top: 8px;
    :deep(.van-field__control) {
      font-size: 0.75rem;
    }
  }

  .action-section {
    padding: 24px 16px;
  }

  .loading-container {
    display: flex;
    justify-content: center;
    padding: 60px 0;
  }

  .error-container {
    padding: 48px 16px;
    text-align: center;
  }

  .error-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
  }

  .item-method {
    font-size: 0.6875rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: 1px solid var(--surface-border, var(--border-subtle));
    font-weight: 500;
  }

  .item-actual-row {
    margin-bottom: 8px;
    background: var(--bg-tertiary);
    border-radius: 8px;
    padding: 2px 8px;
  }

  .actual-field {
    padding: 4px 0;
    background: transparent;
    :deep(.van-field__label) {
      width: 56px;
      font-size: 0.8125rem;
      color: var(--text-secondary);
      font-weight: 600;
    }
    :deep(.van-field__control) {
      font-size: 0.8125rem;
      font-weight: 600;
    }
  }

  .item-actual-text {
    font-size: 0.75rem;
    color: var(--color-primary);
    font-weight: 600;
    margin-bottom: 6px;
  }

  :deep(.pass-text) {
    color: var(--color-success) !important;
  }

  :deep(.fail-text) {
    color: var(--color-error) !important;
  }

  /* 问题照片留证区域 */
  .photo-card-body {
    padding: 12px 16px;
  }

  .photo-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary, #94a3b8);
    margin-bottom: 12px;
    line-height: 1.4;
  }

  .photo-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .photo-item {
    position: relative;
    width: 76px;
    height: 76px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg-tertiary, #f1f5f9);
    border: 1px solid var(--surface-border, #e2e8f0);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

    .photo-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .photo-delete {
      position: absolute;
      top: 3px;
      right: 3px;
      width: 20px;
      height: 20px;
      background: rgba(0, 0, 0, 0.65);
      color: #ffffff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      cursor: pointer;
      z-index: 2;
    }
  }

  .upload-trigger-btn {
    width: 76px;
    height: 76px;
    border: 1.5px dashed var(--border-subtle, #cbd5e1);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: var(--bg-secondary, #f8fafc);
    transition: all 0.2s;

    &:active {
      transform: scale(0.96);
      opacity: 0.85;
    }

    .trigger-svg-icon {
      width: 22px;
      height: 22px;
      margin-bottom: 4px;
    }

    .trigger-text {
      font-size: 0.6875rem;
      color: var(--text-secondary, #64748b);
      font-weight: 600;
    }

    &.camera-btn {
      border-color: rgba(59, 130, 246, 0.6);
      background: rgba(59, 130, 246, 0.06);

      .trigger-svg-icon {
        color: #2563eb;
      }
      .trigger-text {
        color: #2563eb;
      }
    }

    &.album-btn {
      border-color: rgba(16, 185, 129, 0.6);
      background: rgba(16, 185, 129, 0.06);

      .trigger-svg-icon {
        color: #059669;
      }
      .trigger-text {
        color: #059669;
      }
    }
  }

  .photo-empty-text {
    font-size: 0.8125rem;
    color: var(--text-tertiary, #94a3b8);
    padding: 4px 0;
  }
</style>
