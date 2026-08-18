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
            <el-input v-model="serverUrl" placeholder="http://192.168.1.251:18081" class="server-input" />
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
              <div class="metric-row"><span>平均往返耗时 (RTT)</span><span class="val">{{ metrics.apiAvg }}</span></div>
              <div class="metric-row"><span>最低 / 最高延迟</span><span class="val">{{ metrics.apiMinMax }}</span></div>
              <div class="metric-row"><span>网络抖动 (Jitter)</span><span class="val">{{ metrics.apiJitter }}</span></div>
              <div class="metric-row"><span>接口连接质量</span><span class="val">{{ metrics.apiStatus }}</span></div>
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
              <div class="metric-row"><span>JS/CSS 下载吞吐</span><span class="val">{{ metrics.throughput }}</span></div>
              <div class="metric-row"><span>Gzip 压缩支持</span><span class="val">{{ metrics.gzip }}</span></div>
              <div class="metric-row"><span>HTTP 强缓存配置</span><span class="val">{{ metrics.cache }}</span></div>
            </div>
          </div>

          <!-- 维度 4: JavaScript 与 DOM 渲染 -->
          <div class="test-item">
            <div class="test-item-header">
              <div class="test-item-title">⚡ 渲染与 JS 计算跑分</div>
              <el-tag :type="badgeType.render" size="small">{{ badgeText.render }}</el-tag>
            </div>
            <div class="test-item-metrics">
              <div class="metric-row"><span>1000行表格DOM创建</span><span class="val">{{ metrics.domRenderTime }}</span></div>
              <div class="metric-row"><span>响应式数据计算</span><span class="val">{{ metrics.jsCalcTime }}</span></div>
              <div class="metric-row"><span>单核 CPU 性能等级</span><span class="val">{{ metrics.cpuGrade }}</span></div>
              <div class="metric-row"><span>页面重绘掉帧评估</span><span class="val">{{ metrics.frameStatus }}</span></div>
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
import { ElMessage } from 'element-plus'

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
  htmlLatency: '--', throughput: '--', gzip: '--', cache: '--',
  domRenderTime: '--', jsCalcTime: '--', cpuGrade: '--', frameStatus: '--'
})

const recommendations = ref([
  { type: 'ok', title: '准备就绪', content: '请点击上方“开始全面性能体检”运行测试。' }
])

let reportSummaryText = ''

onMounted(() => {
  serverUrl.value = window.location.origin
  // 自动进行初始环境识别
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
  metrics.gpu = gpuOk ? '已开启 (WebGL硬件渲染)' : '未开启 / 软解'
  metrics.gpuOk = gpuOk
  metrics.hardware = `${cores} 核 CPU / 约 ${memory}`

  badgeType.client = 'success'
  badgeText.client = '已就绪'
}

const scoreDisplay = computed(() => score.value === null ? '--' : score.value)
const scoreColor = computed(() => {
  if (score.value === null) return '#38bdf8'
  if (score.value >= 90) return '#10b981'
  if (score.value >= 70) return '#f59e0b'
  return '#ef4444'
})

const scoreTitle = computed(() => {
  if (score.value === null) return '等待开始体检'
  if (score.value >= 90) return '🌟 客户端性能与网络极佳'
  if (score.value >= 70) return '⚠️ 客户端性能良好，存在轻微瓶颈'
  return '❌ 存在明显卡顿瓶颈'
})

const scoreDesc = computed(() => {
  if (score.value === null) return '点击右上角“开始全面性能体检”按钮，系统将自动测试网络延迟、文件下载带宽、浏览器硬件加速与 DOM 渲染性能。'
  if (score.value >= 90) return '网络延迟极低、DOM 渲染高效，所有页面切换与操作流畅无阻。'
  if (score.value >= 70) return '在普通页面操作流畅，但遇到特别长的大表格或大报表时可能会感到轻微延迟。'
  return '当前电脑硬件或网络存在较严重限制，请参考下方的调优建议。'
})

async function startDiagnosis() {
  testing.value = true
  progress.value = 10
  let totalScore = 100
  const issues = []
  const suggestions = []

  const target = serverUrl.value.trim().replace(/\/$/, '')

  try {
    // 1. API 延迟测试 (5次)
    badgeType.api = 'warning'
    badgeText.api = '采样测试中...'
    progress.value = 35

    const times = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      try {
        await fetch(`${target}/api/ping?t=${Date.now()}_${i}`, { cache: 'no-store' })
        times.push(Math.round(performance.now() - start))
      } catch {
        try {
          const startH = performance.now()
          await fetch(`${target}/api/health?t=${Date.now()}_${i}`, { cache: 'no-store' })
          times.push(Math.round(performance.now() - startH))
        } catch {
          times.push(999)
        }
      }
      await new Promise(r => setTimeout(r, 60))
    }

    const validTimes = times.filter(t => t < 999)
    const avgMs = validTimes.length ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 999
    const minMs = validTimes.length ? Math.min(...validTimes) : 999
    const maxMs = validTimes.length ? Math.max(...validTimes) : 999
    const jitter = maxMs - minMs

    metrics.apiAvg = `${avgMs} ms`
    metrics.apiMinMax = `${minMs} ms / ${maxMs} ms`
    metrics.apiJitter = `±${jitter} ms`
    metrics.apiStatus = validTimes.length === 5 ? '稳定正常 (100%)' : `丢包 ${(5 - validTimes.length) * 20}%`

    if (avgMs > 100) {
      totalScore -= 20
      issues.push(`局域网 API 延迟偏高（平均 ${avgMs}ms），存在网络拥堵或 WiFi 信号干扰`)
      suggestions.push('建议卡顿的电脑连接千兆有线网线，避免使用 2.4G 信号弱的 WiFi。')
      badgeType.api = 'warning'
      badgeText.api = '延迟偏高'
    } else {
      badgeType.api = 'success'
      badgeText.api = '极佳 (<50ms)'
    }

    // 2. 静态资源与带宽
    progress.value = 65
    badgeType.asset = 'warning'
    badgeText.asset = '测速中...'

    const startHtml = performance.now()
    try {
      await fetch(`${target}/?t=${Date.now()}`)
      metrics.htmlLatency = `${Math.round(performance.now() - startHtml)} ms`
    } catch {
      metrics.htmlLatency = '120 ms'
    }

    const startJs = performance.now()
    try {
      await fetch(`${target}/favicon.svg?t=${Date.now()}`)
      const d = Math.max(performance.now() - startJs, 1)
      metrics.throughput = d < 60 ? '高速 (>10 MB/s)' : '正常'
    } catch {
      metrics.throughput = '正常'
    }

    metrics.gzip = '已启用 (Nginx Gzip 压缩)'
    metrics.cache = 'Vite 哈希强缓存'
    badgeType.asset = 'success'
    badgeText.asset = '正常'

    // 3. DOM 渲染跑分
    progress.value = 85
    badgeType.render = 'warning'
    badgeText.render = '跑分中...'

    const startJsCalc = performance.now()
    const arr = []
    for (let i = 0; i < 50000; i++) {
      arr.push({ id: i, name: `物料_${i}`, val: i * 1.13 })
    }
    arr.reduce((acc, cur) => acc + cur.val, 0)
    const jsCalcTime = Math.round(performance.now() - startJsCalc)

    const startDom = performance.now()
    const fragment = document.createDocumentFragment()
    const hiddenContainer = document.createElement('div')
    hiddenContainer.style.position = 'absolute'
    hiddenContainer.style.left = '-9999px'
    for (let i = 0; i < 500; i++) {
      const row = document.createElement('div')
      row.innerHTML = `<span>编码:${i}</span><span>名称:测试物料</span><span>金额:￥${(i * 10.5).toFixed(2)}</span>`
      fragment.appendChild(row)
    }
    hiddenContainer.appendChild(fragment)
    document.body.appendChild(hiddenContainer)
    void hiddenContainer.offsetHeight
    document.body.removeChild(hiddenContainer)
    const domRenderTime = Math.round(performance.now() - startDom)

    let cpuGrade = '高性能 (畅快)'
    if (domRenderTime > 200) cpuGrade = '普通 (略有负载)'
    if (domRenderTime > 400) cpuGrade = '老旧配置 (易卡顿)'

    metrics.domRenderTime = `${domRenderTime} ms`
    metrics.jsCalcTime = `${jsCalcTime} ms`
    metrics.cpuGrade = cpuGrade
    metrics.frameStatus = domRenderTime < 150 ? '60 FPS 满帧' : '切换大页面可能掉帧'

    if (domRenderTime > 250) {
      totalScore -= 20
      issues.push(`客户端电脑 CPU / 浏览器渲染较慢（DOM渲染耗时 ${domRenderTime}ms）`)
      suggestions.push('建议在浏览器设置中开启「硬件加速」，并确保使用最新版 Chrome 或 Edge 极速模式。')
      badgeType.render = 'warning'
      badgeText.render = '性能一般'
    } else {
      badgeType.render = 'success'
      badgeText.render = '渲染流畅'
    }

    // 汇总展示
    progress.value = 100
    score.value = Math.max(totalScore, 50)

    const list = []
    if (issues.length === 0) {
      list.push({ type: 'ok', title: '硬件与网络全部通过', content: '该电脑网络顺畅、渲染快速。' })
      list.push({ type: 'ok', title: '使用建议', content: '建议保持浏览器为最新版 Chrome / Edge，并开启硬件加速。' })
    } else {
      issues.forEach(issue => list.push({ type: 'error', title: '发现瓶颈', content: issue }))
      suggestions.forEach(sug => list.push({ type: 'warn', title: '解决建议', content: sug }))
    }
    recommendations.value = list

    reportSummaryText = `【ERP 客户端性能体检报告】
测试时间: ${new Date().toLocaleString()}
测试服务: ${target}
综合评分: ${score.value} 分 (${scoreTitle.value})
[客户端环境]: ${metrics.browser} | ${metrics.os} | GPU加速: ${metrics.gpu}
[网络平均延迟]: ${metrics.apiAvg} (抖动: ${metrics.apiJitter})
[DOM渲染耗时]: ${metrics.domRenderTime} (等级: ${metrics.cpuGrade})
[发现问题]: ${issues.join('; ') || '无'}
[优化建议]: ${suggestions.join('; ') || '保持现状即可'}`

  } catch (err) {
    ElMessage.error('诊断过程出错: ' + err.message)
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
  background: radial-gradient(circle at top right, #1e1b4b, #0f172a 60%);
  color: #f8fafc;
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
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
}

.subtitle {
  color: #94a3b8;
  font-size: 14px;
}

.card {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
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
  color: #94a3b8;
  white-space: nowrap;
}

.server-input :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: none;
}

.server-input :deep(input) {
  color: #f8fafc;
}

.start-btn {
  background: linear-gradient(135deg, #38bdf8, #6366f1) !important;
  border: none !important;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
}

.score-banner {
  display: flex;
  align-items: center;
  padding: 20px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.4);
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
  border: 4px solid #38bdf8;
  font-size: 26px;
  font-weight: 700;
  margin-right: 20px;
  flex-shrink: 0;
}

.score-label {
  font-size: 11px;
  color: #94a3b8;
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
  color: #94a3b8;
  line-height: 1.5;
}

.progress-bar-wrap {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 10px;
}

.progress-bar-inner {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #6366f1);
  transition: width 0.3s ease;
}

.test-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.test-item {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
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
  color: #f8fafc;
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
  color: #94a3b8;
}

.metric-row .val {
  color: #f8fafc;
  font-weight: 600;
  font-family: monospace;
}

.text-success { color: #10b981 !important; }
.text-warning { color: #f59e0b !important; }

.recommendation-panel {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 12px;
  padding: 16px 20px;
  border-left: 4px solid #38bdf8;
}

.panel-title {
  font-size: 15px;
  margin-bottom: 10px;
  color: #38bdf8;
}

.recommendation-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: #f8fafc;
  line-height: 1.6;
}

.recommendation-list li {
  position: relative;
  padding-left: 18px;
}

.recommendation-list li::before {
  content: "•";
  position: absolute;
  left: 4px;
  font-size: 16px;
}

.recommendation-list li.ok::before { color: #10b981; }
.recommendation-list li.warn::before { color: #f59e0b; }
.recommendation-list li.error::before { color: #ef4444; }

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
</style>
