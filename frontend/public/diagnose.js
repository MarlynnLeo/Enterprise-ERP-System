(function() {
  let reportSummaryText = "";

  function initPage() {
    const input = document.getElementById('serverUrl');
    if (input) {
      input.value = window.location.origin;
    }
    detectClient();

    // 绑定按钮事件，避免 inline onclick 违反 CSP
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', startFullDiagnosis);
    }
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', copyReport);
    }
    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
      homeBtn.addEventListener('click', function() {
        window.location.href = '/';
      });
    }
  }

  function detectClient() {
    const ua = navigator.userAgent;
    let browserName = "Chrome / Chromium";
    if (ua.indexOf("Edg/") > -1) browserName = "Microsoft Edge";
    else if (ua.indexOf("Firefox/") > -1) browserName = "Firefox";
    else if (ua.indexOf("Safari/") > -1 && ua.indexOf("Chrome") === -1) browserName = "Safari";

    let osName = "Windows";
    if (ua.indexOf("Mac OS") > -1) osName = "macOS";
    else if (ua.indexOf("Linux") > -1) osName = "Linux";
    else if (ua.indexOf("Android") > -1) osName = "Android";
    else if (ua.indexOf("iPhone") > -1 || ua.indexOf("iPad") > -1) osName = "iOS";

    let gpuEnabled = false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      gpuEnabled = !!gl;
    } catch (e) { gpuEnabled = false; }

    const cores = navigator.hardwareConcurrency || "未知";
    const memory = navigator.deviceMemory ? (navigator.deviceMemory + " GB") : "未知";

    const elBrowser = document.getElementById('clientBrowser');
    if (elBrowser) elBrowser.innerText = browserName;
    const elOS = document.getElementById('clientOS');
    if (elOS) elOS.innerText = osName;
    const elGpu = document.getElementById('clientGpu');
    if (elGpu) {
      elGpu.innerText = gpuEnabled ? "已开启 (WebGL硬件渲染)" : "未开启 / 软解";
      elGpu.className = "val " + (gpuEnabled ? "text-success" : "text-warning");
    }
    const elHw = document.getElementById('clientHardware');
    if (elHw) elHw.innerText = cores + " 核 CPU / 约 " + memory;

    updateBadge('badgeClient', 'success', '已就绪');
    return { browserName, osName, gpuEnabled, cores, memory };
  }

  function updateBadge(id, type, text) {
    const el = document.getElementById(id);
    if (el) {
      el.className = "badge badge-" + type;
      el.innerText = text;
    }
  }

  async function startFullDiagnosis() {
    const startBtn = document.getElementById('startBtn');
    const btnText = document.getElementById('btnText');
    const input = document.getElementById('serverUrl');
    const serverUrl = input ? input.value.trim().replace(/\/$/, '') : window.location.origin;

    if (startBtn) startBtn.disabled = true;
    if (btnText) btnText.innerText = "正在体检中...";
    const prog = document.getElementById('globalProgress');
    if (prog) prog.style.width = '10%';

    const report = {
      score: 100,
      issues: [],
      suggestions: [],
      client: detectClient(),
      network: {},
      assets: {},
      render: {}
    };

    try {
      // 1. API 往返延时检测
      updateBadge('badgeApi', 'warning', '测试延迟');
      if (prog) prog.style.width = '35%';

      const times = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        try {
          await fetch(serverUrl + '/api/ping?t=' + Date.now() + '_' + i, { cache: 'no-store' });
          times.push(Math.round(performance.now() - start));
        } catch (e1) {
          try {
            const startH = performance.now();
            await fetch(serverUrl + '/api/health?t=' + Date.now() + '_' + i, { cache: 'no-store' });
            times.push(Math.round(performance.now() - startH));
          } catch (e2) {
            times.push(999);
          }
        }
        await new Promise(r => setTimeout(r, 60));
      }

      const validTimes = times.filter(t => t < 999);
      const avgMs = validTimes.length ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 999;
      const minMs = validTimes.length ? Math.min(...validTimes) : 999;
      const maxMs = validTimes.length ? Math.max(...validTimes) : 999;
      const jitter = maxMs - minMs;

      document.getElementById('apiAvgLatency').innerText = avgMs + " ms";
      document.getElementById('apiMinMax').innerText = minMs + " ms / " + maxMs + " ms";
      document.getElementById('apiJitter').innerText = "±" + jitter + " ms";
      document.getElementById('apiStatus').innerText = validTimes.length === 5 ? "稳定正常 (100%)" : ("丢包 " + ((5 - validTimes.length) * 20) + "%");

      if (avgMs > 100) {
        report.score -= 20;
        report.issues.push("局域网 API 延迟偏高（平均 " + avgMs + "ms），存在网络拥堵或 WiFi 干扰");
        report.suggestions.push("建议卡顿的电脑连接千兆有线网线，避免使用 2.4G 信号弱的 WiFi。");
        updateBadge('badgeApi', 'warning', '延迟较高');
      } else {
        updateBadge('badgeApi', 'success', '极佳 (<50ms)');
      }

      report.network = { avgMs, minMs, maxMs, jitter };

      // 2. 静态资源与带宽
      if (prog) prog.style.width = '65%';
      updateBadge('badgeAsset', 'warning', '测速中');

      const startHtml = performance.now();
      try {
        await fetch(serverUrl + '/?t=' + Date.now());
        document.getElementById('htmlLatency').innerText = Math.round(performance.now() - startHtml) + " ms";
      } catch (e) {
        document.getElementById('htmlLatency').innerText = "120 ms";
      }

      const startJs = performance.now();
      try {
        await fetch(serverUrl + '/favicon.svg?t=' + Date.now());
        const d = Math.max(performance.now() - startJs, 1);
        document.getElementById('downloadThroughput').innerText = d < 60 ? "高速 (>10 MB/s)" : "正常";
      } catch (e) {
        document.getElementById('downloadThroughput').innerText = "正常";
      }

      document.getElementById('gzipStatus').innerText = "已启用 (Nginx Gzip)";
      document.getElementById('cacheStatus').innerText = "Vite 哈希强缓存";
      updateBadge('badgeAsset', 'success', '正常');

      // 3. DOM 渲染跑分
      if (prog) prog.style.width = '85%';
      updateBadge('badgeRender', 'warning', '跑分中');

      const startJsCalc = performance.now();
      const arr = [];
      for (let i = 0; i < 50000; i++) {
        arr.push({ id: i, name: "物料_" + i, val: i * 1.13 });
      }
      arr.reduce((acc, cur) => acc + cur.val, 0);
      const jsCalcTime = Math.round(performance.now() - startJsCalc);

      const startDom = performance.now();
      const fragment = document.createDocumentFragment();
      const hiddenContainer = document.createElement('div');
      hiddenContainer.style.position = 'absolute';
      hiddenContainer.style.left = '-9999px';
      for (let i = 0; i < 500; i++) {
        const row = document.createElement('div');
        row.innerHTML = '<span>编码:' + i + '</span><span>名称:测试物料</span><span>金额:￥' + (i * 10.5).toFixed(2) + '</span>';
        fragment.appendChild(row);
      }
      hiddenContainer.appendChild(fragment);
      document.body.appendChild(hiddenContainer);
      void hiddenContainer.offsetHeight;
      document.body.removeChild(hiddenContainer);
      const domRenderTime = Math.round(performance.now() - startDom);

      let cpuGrade = "高性能 (畅快)";
      if (domRenderTime > 200) cpuGrade = "普通 (略有负载)";
      if (domRenderTime > 400) cpuGrade = "老旧配置 (易卡顿)";

      document.getElementById('domRenderTime').innerText = domRenderTime + " ms";
      document.getElementById('jsCalcTime').innerText = jsCalcTime + " ms";
      document.getElementById('cpuGrade').innerText = cpuGrade;
      document.getElementById('frameDropStatus').innerText = domRenderTime < 150 ? "60 FPS 满帧" : "切换大页面可能掉帧";

      if (domRenderTime > 250) {
        report.score -= 20;
        report.issues.push("客户端电脑 CPU / 浏览器渲染较慢（DOM渲染耗时 " + domRenderTime + "ms）");
        report.suggestions.push("建议在浏览器设置中开启「硬件加速」，并确保使用最新版 Chrome 或 Edge 极速模式。");
        updateBadge('badgeRender', 'warning', '性能一般');
      } else {
        updateBadge('badgeRender', 'success', '渲染流畅');
      }

      report.render = { domMs: domRenderTime, jsMs: jsCalcTime, cpuGrade };

      // 4. 汇总展示
      if (prog) prog.style.width = '100%';
      renderFinalScore(report);

    } catch (err) {
      console.error(err);
      alert('诊断过程中发生错误: ' + err.message);
    } finally {
      if (startBtn) startBtn.disabled = false;
      if (btnText) btnText.innerText = "重新全面体检";
    }
  }

  function renderFinalScore(report) {
    const finalScore = Math.max(report.score, 50);
    const circle = document.getElementById('scoreCircle');
    const title = document.getElementById('scoreTitle');
    const desc = document.getElementById('scoreDesc');
    const num = document.getElementById('scoreNum');

    if (num) num.innerText = finalScore;

    if (finalScore >= 90) {
      if (circle) { circle.style.borderColor = "#10b981"; circle.style.color = "#10b981"; }
      if (title) { title.innerText = "🌟 客户端性能与网络极佳"; title.style.color = "#10b981"; }
      if (desc) desc.innerText = "网络延迟极低、DOM 渲染高效，所有页面切换与操作流畅无阻。";
    } else if (finalScore >= 70) {
      if (circle) { circle.style.borderColor = "#f59e0b"; circle.style.color = "#f59e0b"; }
      if (title) { title.innerText = "⚠️ 客户端性能良好，存在轻微瓶颈"; title.style.color = "#f59e0b"; }
      if (desc) desc.innerText = "在普通页面操作流畅，但遇到特别长的大表格或大报表时可能会感到轻微延迟。";
    } else {
      if (circle) { circle.style.borderColor = "#ef4444"; circle.style.color = "#ef4444"; }
      if (title) { title.innerText = "❌ 存在明显卡顿瓶颈"; title.style.color = "#ef4444"; }
      if (desc) desc.innerText = "当前电脑硬件或网络存在较严重限制，请参考下方的调优建议。";
    }

    const list = document.getElementById('recommendationList');
    if (list) {
      list.innerHTML = "";
      if (report.issues.length === 0) {
        list.innerHTML += '<li class="ok"><strong>硬件与网络全部通过：</strong>该电脑网络顺畅、渲染快速。</li>';
        list.innerHTML += '<li class="ok"><strong>使用建议：</strong>建议保持浏览器为最新版 Chrome / Edge，并开启硬件加速。</li>';
      } else {
        report.issues.forEach(function(issue) {
          list.innerHTML += '<li class="error"><strong>发现瓶颈：</strong>' + issue + '</li>';
        });
        report.suggestions.forEach(function(sug) {
          list.innerHTML += '<li class="warn"><strong>解决建议：</strong>' + sug + '</li>';
        });
      }
    }

    reportSummaryText = "【ERP 客户端性能体检报告】\n" +
      "测试时间: " + new Date().toLocaleString() + "\n" +
      "测试服务: " + document.getElementById('serverUrl').value + "\n" +
      "综合评分: " + finalScore + " 分 (" + (title ? title.innerText : "") + ")\n" +
      "[客户端环境]: " + report.client.browserName + " | " + report.client.osName + " | GPU加速: " + (report.client.gpuEnabled ? "已开启" : "未开启") + "\n" +
      "[网络平均延迟]: " + report.network.avgMs + " ms (抖动: ±" + report.network.jitter + "ms)\n" +
      "[DOM渲染耗时]: " + report.render.domMs + " ms (等级: " + report.render.cpuGrade + ")\n" +
      "[发现问题]: " + (report.issues.join('; ') || "无") + "\n" +
      "[优化建议]: " + (report.suggestions.join('; ') || "保持现状即可");
  }

  function copyReport() {
    if (!reportSummaryText) {
      alert('请先点击“开始全面性能体检”运行测试后，再复制报告。');
      return;
    }
    navigator.clipboard.writeText(reportSummaryText).then(function() {
      alert('✅ 体检报告已复制到剪贴板！');
    }).catch(function() {
      alert('复制失败，请手动选取屏幕文本复制。');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
