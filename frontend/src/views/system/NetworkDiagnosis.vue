<template>
  <div class="diagnosis-page">
    <div class="container">
      <div class="header">
        <h1 class="gradient-title">ERP 客户端网络与运行性能一键体检</h1>
        <p class="subtitle">可在任意电脑、工控机、手机/平板上直接运行，即时定位开网慢、切页卡顿瓶颈</p>
      </div>

      <div class="card">
        <!-- 顶部操作栏 -->
        <div class="control-panel">
          <div class="server-input-group">
            <label for="serverUrl">测试服务地址:</label>
            <el-input :model-value="serverUrl" readonly class="server-input" />
          </div>
          <el-button type="primary" size="large" :loading="testing" class="start-btn" @click="startDiagnosis">
            <template #icon v-if="!testing">⚡</template>
            {{ testing ? '正在体检中...' : '开始全面性能体检' }}
          </el-button>
        </div>

        <!-- 综合得分与大状态 Banner -->
        <div class="score-banner">
          <div class="score-circle" :style="{ borderColor: scoreColor, color: scoreColor }">
            <span class="score-num">{{ scoreDisplay }}</span>
            <span class="score-label">综合评分</span>
          </div>
          <div class="score-status">
            <h2 :style="{ color: scoreColor }">{{ scoreTitle }}</h2>
            <p class="score-desc">{{ scoreDesc }}</p>
            <div class="progress-bar-wrap">
              <div class="progress-bar-inner" :style="{ width: progress + '%' }"></div>
            </div>
          </div>
        </div>

        <!-- 4 个核心维度卡片 -->
        <div class="test-grid">
          <!-- 维度 1: 客户端环境与硬件 -->
          <div class="test-item">
            <div class="test-item-header">
              <div class="test-item-title">💻 电脑与浏览器环境</div>
              <el-tag :type="badgeType.client" size="small">{{ badgeText.client }}</el-tag>
            </div>
            <div class="test-item-metrics">
              <div class="metric-row"><span>浏览器内核</span><span class="val">{{ metrics.browser }}</span></div>
              <div class="metric-row"><span>操作系统</span><span class="val">{{ metrics.os }}</span></div>
              <div class="metric-row"><span>GPU 硬件加速</span><span class="val" :class="{ 'text-success': metrics.gpuOk, 'text-warning': !metrics.gpuOk }">{{ metrics.gpu }}</span></div>
              <div class="metric-row"><span>CPU/内存估算</span><span class="val">{{ metrics.hardware }}</span></div>
            </div>
          </div>

          <!-- 维度 2: API 接口网络延迟 -->
          <div class="test-item">
            <div class="test-item-header">
              <div class="test-item-title">🌐 后端 API 网络延迟</div>
              <el-tag :type="badgeType.api" size="small">{{ badgeText.api }}</el-tag>
            </div>
            <div class="test-item-metrics">
              <div class="metric-row"><span>基础 API 平均 RTT</span><span class="val">{{ metrics.apiAvg }}</span></div>
              <div class="metric-row"><span>最低 / 最高延迟</span><span class="val">{{ metrics.apiMinMax }}</span></div>
              <div class="metric-row"><span>网络抖动 (Jitter)</span><span class="val">{{ metrics.apiJitter }}</span></div>
              <div class="metric-row"><span>登录/权限/菜单链路</span><span class="val">{{ metrics.businessApi }}</span></div>
              <div class="metric-row"><span>业务接口最慢项</span><span class="val">{{ metrics.businessSlowest }}</span></div>
            </div>
          </div>

          <!-- 维度 3: 静态资源下载与 Gzip -->
          <div class="test-item">
            <div class="test-item-header">
              <div class="test-item-title">📦 静态资源传输带宽</div>
              <el-tag :type="badgeType.asset" size="small">{{ badgeText.asset }}</el-tag>
            </div>
            <div class="test-item-metrics">
              <div class="metric-row"><span>HTML 首屏响应</span><span class="val">{{ metrics.htmlLatency }}</span></div>
              <div class="metric-row"><span>实际加载资源</span><span class="val">{{ metrics.primaryAsset }}</span></div>
              <div class="metric-row"><span>资源读取速率（参考）</span><span class="val">{{ metrics.throughput }}</span></div>
              <div class="metric-row"><span>压缩响应头</span><span class="val">{{ metrics.gzip }}</span></div>
              <div class="metric-row"><span>缓存响应头</span><span class="val">{{ metrics.cache }}</span></div>
            </div>
          </div>

          <!-- 维度 4: JavaScript 与 DOM 渲染 -->
          <div class="test-item">
            <div class="test-item-header">
              <div class="test-item-title">⚡ 渲染与 JS 计算跑分</div>
              <el-tag :type="badgeType.render" size="small">{{ badgeText.render }}</el-tag>
            </div>
            <div class="test-item-metrics">
              <div class="metric-row"><span>500行基础表格 DOM</span><span class="val">{{ metrics.domRenderTime }}</span></div>
              <div class="metric-row"><span>响应式数据计算</span><span class="val">{{ metrics.jsCalcTime }}</span></div>
              <div class="metric-row"><span>单核 CPU 性能等级</span><span class="val">{{ metrics.cpuGrade }}</span></div>
              <div class="metric-row"><span>动画帧最大间隔</span><span class="val">{{ metrics.frameStatus }}</span></div>
              <div class="metric-row"><span>长任务阻塞</span><span class="val">{{ metrics.longTaskStatus }}</span></div>
            </div>
          </div>
        </div>

        <!-- 诊断结论与优化措施 -->
        <div class="recommendation-panel">
          <h3 class="panel-title">📋 诊断体检报告与针对性建议</h3>
          <ul class="recommendation-list">
            <li v-for="(item, idx) in recommendations" :key="idx" :class="item.type">
              <strong>{{ item.title }}：</strong>{{ item.content }}
            </li>
          </ul>
        </div>

        <!-- 底部按钮 -->
        <div class="footer-actions">
          <el-button @click="copyReport">📋 复制体检报告</el-button>
          <el-button @click="goToLogin">🚪 返回登录页</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index'
import { api } from '../../services/axiosInstance'

const router = useRouter()
const serverUrl = ref('')
const testing = ref(false)
const progress = ref(0)
const score = ref(null)

const badgeType = reactive({ client: 'info', api: 'info', asset: 'info', render: 'info' })
const badgeText = reactive({ client: '待检测', api: '待检测', asset: '待检测', render: '待检测' })

const metrics = reactive({
  browser: '--', os: '--', gpu: '--', gpuOk: false, hardware: '--',
  apiAvg: '--', apiMinMax: '--', apiJitter: '--', apiStatus: '--',
  businessApi: '--', businessSlowest: '--',
  htmlLatency: '--', primaryAsset: '--', throughput: '--', gzip: '--', cache: '--',
  domRenderTime: '--', jsCalcTime: '--', cpuGrade: '--', frameStatus: '--', longTaskStatus: '--'
})

const recommendations = ref([
  { type: 'ok', title: '准备就绪', content: '请点击上方“开始全面性能体检”运行真实链路测试。' }
])

let reportSummaryText = ''
let requestSequence = 0

const formatBytes = (bytes) => {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '--'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

const withCacheBust = (path) => {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('_erp_diagnose', `${Date.now()}_${requestSequence++}`)
  return url.toString()
}

const timedRequest = async (path, options = {}) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeout = window.setTimeout(() => controller?.abort(), 8000)
  const startedAt = performance.now()
  try {
    const response = await api.request({
      url: path,
      method: options.method || 'get',
      timeout: 8000,
      withCredentials: true,
      validateStatus: () => true,
      signal: controller?.signal,
      responseType: options.read === 'arrayBuffer' ? 'arraybuffer' : 'text',
      headers: { 'Cache-Control': 'no-cache' }
    })
    let body = null
    if (options.read === 'text' || options.read === 'arrayBuffer') body = response.data
    return {
      response,
      status: response.status,
      ok: response.ok,
      duration: Math.round(performance.now() - startedAt),
      body
    }
  } catch (error) {
    const response = error?.response || null
    return {
      response,
      status: response?.status || 0,
      ok: Boolean(response && response.status >= 200 && response.status < 300),
      duration: Math.round(performance.now() - startedAt),
      error
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

onMounted(() => {
  serverUrl.value = window.location.origin
  detectClient()
})

function detectClient() {
  const ua = navigator.userAgent
  let browser = 'Chrome / Chromium'
  if (ua.indexOf('Edg/') > -1) browser = 'Microsoft Edge'
  else if (ua.indexOf('Firefox/') > -1) browser = 'Firefox'
  else if (ua.indexOf('Safari/') > -1 && ua.indexOf('Chrome') === -1) browser = 'Safari'

  let os = 'Windows'
  if (ua.indexOf('Mac OS') > -1) os = 'macOS'
  else if (ua.indexOf('Linux') > -1) os = 'Linux'
  else if (ua.indexOf('Android') > -1) os = 'Android'
  else if (ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) os = 'iOS'

  let gpuOk = false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    gpuOk = !!gl
  } catch { gpuOk = false }

  const cores = navigator.hardwareConcurrency || '未知'
  const memory = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : '未知'
  metrics.browser = browser
  metrics.os = os
  metrics.gpu = gpuOk ? '已开启 (WebGL硬件渲染)' : '未开启 / 软解或不可用'
  metrics.gpuOk = gpuOk
  metrics.hardware = `${cores} 核 CPU / 约 ${memory}`
  badgeType.client = gpuOk ? 'success' : 'warning'
  badgeText.client = gpuOk ? '已就绪' : '需关注'
}

const scoreDisplay = computed(() => score.value === null ? '--' : score.value)
const scoreColor = computed(() => {
  if (score.value === null) return 'var(--color-primary)'
  if (score.value >= 90) return 'var(--color-success)'
  if (score.value >= 70) return 'var(--color-warning)'
  return 'var(--color-danger)'
})

const scoreTitle = computed(() => {
  if (score.value === null) return '等待开始体检'
  if (score.value >= 90) return '🌟 本次检测链路表现良好'
  if (score.value >= 70) return '⚠️ 检测到轻微瓶颈'
  return '❌ 检测到明显卡顿风险'
})

const scoreDesc = computed(() => {
  if (score.value === null) return '检测会访问当前站点的真实登录、权限、菜单、首页接口和首屏资源，不会用固定值代替结果。'
  if (score.value >= 90) return '本次检测的网络、业务接口、资源和浏览器渲染表现良好；这不代表所有业务页面和大表格都没有瓶颈。'
  if (score.value >= 70) return '基础链路可以使用，但某个业务接口、资源响应头或浏览器渲染环节仍可能造成切页卡顿。'
  return '当前检测链路存在明显风险，请按下方问题和建议处理，并结合具体卡顿页面复测。'
})

async function measureBusinessEndpoints(target) {
  const endpoints = [
    { label: '用户资料', path: '/api/auth/profile' },
    { label: '权限', path: '/api/auth/permissions' },
    { label: '菜单', path: '/api/auth/menus' },
    { label: '首页待办', path: '/api/todos/dashboard-summary' },
    { label: '生产计划', path: '/api/production/dashboard/plans?page=1&limit=1' }
  ]
  return Promise.all(endpoints.map(async (endpoint) => ({
    ...endpoint,
    result: await timedRequest(`${target}${endpoint.path}${endpoint.path.includes('?') ? '&' : '?'}_erp_diagnose=${Date.now()}_${requestSequence++}`)
  })))
}

async function measureInitialResources(target, htmlResult) {
  const entries = performance.getEntriesByType('resource')
    .filter((entry) => entry.name.startsWith(target) && /\/assets\//.test(entry.name))
  const largestEntry = entries.reduce((largest, entry) => {
    const size = entry.transferSize || entry.decodedBodySize || 0
    return !largest || size > (largest.transferSize || largest.decodedBodySize || 0) ? entry : largest
  }, null)

  let resourcePath = largestEntry?.name || null
  if (!resourcePath && htmlResult.body) {
    const parsed = new DOMParser().parseFromString(htmlResult.body, 'text/html')
    const firstScript = parsed.querySelector('script[src], link[rel="modulepreload"]')
    resourcePath = firstScript?.getAttribute('src') || firstScript?.getAttribute('href') || null
    if (resourcePath) resourcePath = new URL(resourcePath, target).toString()
  }

  let headerResult = null
  if (resourcePath) {
    headerResult = await timedRequest(withCacheBust(resourcePath), { method: 'HEAD' })
  }

  const transferBytes = largestEntry?.transferSize || Number(headerResult?.response?.headers.get('content-length')) || 0
  const decodedBytes = largestEntry?.decodedBodySize || 0
  const duration = largestEntry?.duration || headerResult?.duration || 0
  const encoding = headerResult?.response?.headers.get('content-encoding') || '未返回'
  const cacheControl = headerResult?.response?.headers.get('cache-control') || '未返回'
  metrics.primaryAsset = `${entries.length || (resourcePath ? 1 : 0)} 个，最大 ${formatBytes(transferBytes || decodedBytes)}`
  metrics.throughput = duration > 0 && (transferBytes || decodedBytes)
    ? `${((transferBytes || decodedBytes) / 1024 / 1024 / (duration / 1000)).toFixed(2)} MB/s（浏览器参考）`
    : '--'
  metrics.gzip = encoding === '未返回' ? encoding : encoding.toLowerCase()
  metrics.cache = cacheControl

  return {
    count: entries.length,
    largest: resourcePath ? new URL(resourcePath, target).pathname : '--',
    bytes: transferBytes || decodedBytes,
    encoding,
    cacheControl
  }
}

function measureFrames() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve(null)
      return
    }
    let frames = 0
    let previous = performance.now()
    let maxGap = 0
    const tick = (now) => {
      maxGap = Math.max(maxGap, now - previous)
      previous = now
      frames += 1
      if (frames >= 24) resolve(Math.round(maxGap))
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

async function measureRendering() {
  let longTaskCount = 0
  let longTaskObserver = null
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      longTaskObserver = new PerformanceObserver((list) => {
        longTaskCount += list.getEntries().length
      })
      longTaskObserver.observe({ type: 'longtask', buffered: false })
    }
  } catch { longTaskObserver = null }

  const startJsCalc = performance.now()
  let total = 0
  for (let i = 0; i < 50000; i += 1) total += i * 1.13
  const jsCalcTime = Math.round(performance.now() - startJsCalc)

  const startDom = performance.now()
  const table = document.createElement('table')
  const body = document.createElement('tbody')
  const fragment = document.createDocumentFragment()
  for (let i = 0; i < 500; i += 1) {
    const row = document.createElement('tr')
    const code = document.createElement('td')
    const name = document.createElement('td')
    const amount = document.createElement('td')
    code.textContent = `编码:${i}`
    name.textContent = '名称:测试物料'
    amount.textContent = `金额:￥${(i * 10.5).toFixed(2)}`
    row.append(code, name, amount)
    fragment.appendChild(row)
  }
  body.appendChild(fragment)
  table.appendChild(body)
  table.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden'
  document.body.appendChild(table)
  void table.offsetHeight
  table.remove()
  const domRenderTime = Math.round(performance.now() - startDom)
  const frameGap = await measureFrames()
  longTaskObserver?.disconnect()

  return { jsCalcTime, domRenderTime, frameGap, longTaskCount, total }
}

async function startDiagnosis() {
  testing.value = true
  progress.value = 5
  score.value = null
  const issues = []
  const suggestions = []
  const currentOrigin = window.location.origin
  if (serverUrl.value !== currentOrigin) {
    serverUrl.value = currentOrigin
    testing.value = false
    ElMessage.error('诊断目标必须是当前 ERP 站点')
    return
  }
  const target = currentOrigin

  try {
    badgeType.api = 'warning'
    badgeText.api = '采样真实接口...'
    progress.value = 20
    const times = []
    const statuses = []
    for (let i = 0; i < 5; i += 1) {
      let result = await timedRequest(withCacheBust('/api/ping'))
      if (!result.response || result.status === 404) result = await timedRequest(withCacheBust('/api/health'))
      if (result.response) {
        times.push(result.duration)
        statuses.push(result.status)
      }
    }
    const avgMs = times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : null
    const minMs = times.length ? Math.min(...times) : null
    const maxMs = times.length ? Math.max(...times) : null
    const jitter = times.length ? maxMs - minMs : null
    metrics.apiAvg = avgMs === null ? '无响应' : `${avgMs} ms`
    metrics.apiMinMax = minMs === null ? '--' : `${minMs} ms / ${maxMs} ms`
    metrics.apiJitter = jitter === null ? '--' : `±${jitter} ms`
    metrics.apiStatus = `${times.length}/5 次收到响应（HTTP ${[...new Set(statuses)].join(', ') || '--'}）`
    const apiScore = times.length === 0 ? 0 : Math.max(0, Math.min(100, 100 - Math.max(0, avgMs - 50) * 0.6)) * (times.length / 5)
    if (avgMs === null || avgMs > 100) {
      issues.push(avgMs === null ? '基础 API 无响应' : `基础 API 延迟偏高（平均 ${avgMs}ms）`)
      suggestions.push('先检查卡顿电脑到 ERP 服务器的有线/Wi-Fi 链路、交换机端口和代理设置。')
      badgeType.api = 'warning'
      badgeText.api = '延迟需关注'
    } else {
      badgeType.api = 'success'
      badgeText.api = '网络正常'
    }

    progress.value = 42
    const businessResults = await measureBusinessEndpoints(target)
    const reachableBusiness = businessResults.filter(({ result }) => result.response)
    const successfulBusiness = businessResults.filter(({ result }) => result.ok)
    const slowestBusiness = reachableBusiness.reduce((slowest, item) => (
      !slowest || item.result.duration > slowest.result.duration ? item : slowest
    ), null)
    metrics.businessApi = `${successfulBusiness.length}/${businessResults.length} 成功，${reachableBusiness.length}/${businessResults.length} 可达`
    metrics.businessSlowest = slowestBusiness
      ? `${slowestBusiness.label} ${slowestBusiness.result.duration} ms (HTTP ${slowestBusiness.result.status})`
      : '无响应'
    const businessScore = businessResults.length
      ? (successfulBusiness.length / businessResults.length) * 100 * (reachableBusiness.length / businessResults.length)
      : 0
    businessResults.forEach(({ label, result }) => {
      if (!result.response) {
        issues.push(`${label}接口无响应`)
      } else if (!result.ok) {
        issues.push(`${label}接口返回 HTTP ${result.status}（可能是登录或权限问题）`)
      } else if (result.duration > 500) {
        issues.push(`${label}接口耗时 ${result.duration}ms`)
      }
    })
    if (businessResults.some(({ result }) => !result.ok)) {
      suggestions.push('若 profile/权限/菜单返回 401，请重新登录；若返回 403，请检查该账号的菜单和动作权限。')
      badgeType.api = 'warning'
      badgeText.api = '业务链路需检查'
    }

    progress.value = 65
    const htmlResult = await timedRequest(withCacheBust('/'), { read: 'text' })
    metrics.htmlLatency = htmlResult.response ? `${htmlResult.duration} ms (HTTP ${htmlResult.status})` : '无响应'
    const asset = await measureInitialResources(target, htmlResult)
    const assetScore = asset.count > 0
      ? ((asset.encoding !== '未返回' ? 50 : 25) + (asset.cacheControl !== '未返回' ? 50 : 25))
      : 0
    if (asset.encoding === '未返回' || !/gzip|br/i.test(asset.encoding)) {
      issues.push(`首屏最大资源未确认使用压缩（响应头: ${asset.encoding}）`)
      suggestions.push('检查 Nginx 的 gzip/brotli 配置，并确认请求没有被代理层去掉 Content-Encoding。')
    }
    if (asset.cacheControl === '未返回' || !/immutable|max-age/i.test(asset.cacheControl)) {
      issues.push(`首屏哈希资源未确认强缓存（响应头: ${asset.cacheControl}）`)
      suggestions.push('为 /assets/ 下的哈希文件返回 immutable 长缓存，避免部门电脑每次切页重新下载。')
    }
    badgeType.asset = issues.some((issue) => issue.includes('资源')) ? 'warning' : 'success'
    badgeText.asset = badgeType.asset === 'success' ? '资源正常' : '资源需检查'

    progress.value = 84
    const render = await measureRendering()
    metrics.domRenderTime = `${render.domRenderTime} ms`
    metrics.jsCalcTime = `${render.jsCalcTime} ms`
    metrics.cpuGrade = render.domRenderTime < 80 ? '高性能' : render.domRenderTime < 250 ? '普通' : '低性能/主线程繁忙'
    metrics.frameStatus = render.frameGap === null ? '浏览器不支持' : `${render.frameGap} ms`
    metrics.longTaskStatus = `${render.longTaskCount} 个（>50ms）`
    const renderScore = Math.max(0, Math.min(100,
      100 - Math.max(0, render.domRenderTime - 80) * 0.25 - Math.max(0, (render.frameGap || 16) - 32) * 0.8 - render.longTaskCount * 10
    ))
    if (render.domRenderTime > 250 || (render.frameGap || 0) > 50 || render.longTaskCount > 0) {
      issues.push(`浏览器主线程存在渲染压力（DOM ${render.domRenderTime}ms，最大帧间隔 ${render.frameGap ?? '--'}ms，长任务 ${render.longTaskCount} 个）`)
      suggestions.push('在卡顿电脑上关闭不必要的浏览器扩展，开启硬件加速；若只有大表格卡顿，应继续做分页/虚拟滚动。')
      badgeType.render = 'warning'
      badgeText.render = '渲染需关注'
    } else {
      badgeType.render = 'success'
      badgeText.render = '渲染正常'
    }

    score.value = Math.round((apiScore + businessScore + assetScore + renderScore) / 4)
    progress.value = 100
    if (issues.length === 0) {
      recommendations.value = [
        { type: 'ok', title: '检测链路通过', content: '当前站点的基础 API、登录权限链路、首屏资源和浏览器渲染均未发现明显问题。' },
        { type: 'warn', title: '检测边界', content: '该结果只覆盖上述真实链路，不等于所有业务页面、大表格和数据库查询都已通过。' }
      ]
    } else {
      recommendations.value = [
        ...issues.map(issue => ({ type: 'error', title: '发现问题', content: issue })),
        ...suggestions.map(suggestion => ({ type: 'warn', title: '处理建议', content: suggestion }))
      ]
    }

    reportSummaryText = `【ERP 客户端真实性能体检报告】
测试时间: ${new Date().toLocaleString()}
测试站点: ${target}
综合评分: ${score.value} 分（仅代表本次检测链路）
[客户端]: ${metrics.browser} | ${metrics.os} | GPU: ${metrics.gpu}
[基础 API]: ${metrics.apiAvg} | ${metrics.apiMinMax} | ${metrics.apiJitter}
[业务接口]: ${metrics.businessApi} | 最慢: ${metrics.businessSlowest}
[首屏资源]: ${metrics.primaryAsset} | ${metrics.throughput}
[响应头]: Content-Encoding=${metrics.gzip} | Cache-Control=${metrics.cache}
[渲染]: DOM=${metrics.domRenderTime} | JS=${metrics.jsCalcTime} | 帧间隔=${metrics.frameStatus} | 长任务=${metrics.longTaskStatus}
[发现问题]: ${issues.join('; ') || '无'}
[优化建议]: ${suggestions.join('; ') || '继续观察具体业务页面'}`
  } catch (error) {
    ElMessage.error(`诊断过程出错: ${error.message}`)
  } finally {
    testing.value = false
  }
}

function copyReport() {
  if (!reportSummaryText) {
    ElMessage.warning('请先点击“开始全面性能体检”运行测试后再复制报告。')
    return
  }
  navigator.clipboard.writeText(reportSummaryText).then(() => {
    ElMessage.success('✅ 体检报告已复制到剪贴板！')
  }).catch(() => {
    ElMessage.error('复制失败，请手动选取屏幕内容复制。')
  })
}

function goToLogin() {
  router.push('/login')
}
</script>

<style scoped>
.diagnosis-page {
  min-height: 100vh;
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  padding: 32px 16px;
  display: flex;
  justify-content: center;
}

.container {
  width: 100%;
  max-width: 920px;
}

.header {
  text-align: center;
  margin-bottom: 24px;
}

.gradient-title {
  font-size: 26px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light-3, var(--color-primary)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
}

.subtitle {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.card {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-lg, 12px);
  padding: 24px;
  box-shadow: var(--shadow-card, 0 4px 16px rgba(0, 0, 0, 0.06));
}

.control-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.server-input-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 280px;
}

.server-input-group label {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.server-input :deep(.el-input__wrapper) {
  background: var(--color-bg-hover, var(--color-bg-page));
  border: 1px solid var(--color-border-base);
  box-shadow: none;
}

.server-input :deep(input) {
  color: var(--color-text-primary);
}

.start-btn {
  background: var(--color-primary) !important;
  border: none !important;
  font-weight: 600;
  box-shadow: var(--shadow-glow-primary, 0 4px 12px rgba(0, 0, 0, 0.1));
}

.score-banner {
  display: flex;
  align-items: center;
  padding: 20px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-hover, var(--color-bg-page));
  border: 1px solid var(--color-border-light, var(--color-border-base));
  margin-bottom: 24px;
}

.score-circle {
  width: 95px;
  height: 95px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 4px solid var(--color-primary);
  font-size: 26px;
  font-weight: 700;
  margin-right: 20px;
  flex-shrink: 0;
  background: var(--color-bg-base);
}

.score-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: 400;
}

.score-status {
  flex: 1;
}

.score-status h2 {
  font-size: 18px;
  margin-bottom: 4px;
}

.score-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.progress-bar-wrap {
  width: 100%;
  height: 6px;
  background: var(--color-border-light, var(--color-border-base));
  border-radius: 3px;
  overflow: hidden;
  margin-top: 10px;
}

.progress-bar-inner {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-success));
  transition: width 0.3s ease;
}

.test-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.test-item {
  background: var(--color-bg-hover, var(--color-bg-page));
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-md, 8px);
  padding: 16px;
}

.test-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.test-item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.test-item-metrics {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-secondary);
}

.metric-row .val {
  color: var(--color-text-primary);
  font-weight: 600;
  font-family: monospace;
}

.text-success { color: var(--color-success) !important; }
.text-warning { color: var(--color-warning) !important; }

.recommendation-panel {
  background: var(--color-bg-hover, var(--color-bg-page));
  border-radius: var(--radius-md, 8px);
  padding: 16px 20px;
  border-left: 4px solid var(--color-primary);
  border-top: 1px solid var(--color-border-light, var(--color-border-base));
  border-right: 1px solid var(--color-border-light, var(--color-border-base));
  border-bottom: 1px solid var(--color-border-light, var(--color-border-base));
}

.panel-title {
  font-size: 15px;
  margin-bottom: 10px;
  color: var(--color-primary);
  font-weight: 600;
}

.recommendation-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  line-height: 1.6;
}

.recommendation-list li {
  position: relative;
  padding-left: 18px;
}

.recommendation-list li::before {
  content: '•';
  position: absolute;
  left: 4px;
  font-size: 16px;
}

.recommendation-list li.ok::before { color: var(--color-success); }
.recommendation-list li.warn::before { color: var(--color-warning); }
.recommendation-list li.error::before { color: var(--color-danger); }

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
</style>
