<template>
  <div class="budget-ai-container">
    <!-- 页头卡片 -->
    <el-card class="header-card" shadow="hover">
      <div class="header-content">
        <div class="header-left">
          <h2 class="page-title">AI 预算智能分析</h2>
          <span class="header-desc">基于已配置的本地 Ollama 大模型 · 智能预算编制 · 异常检测 · 优化建议</span>
        </div>
        <div class="header-right">
          <div class="token-stats" v-if="usageStats.call_count > 0">
            <el-tag type="primary" effect="plain" round>调用 <strong>{{ usageStats.call_count }}</strong> 次</el-tag>
            <el-tag type="success" effect="plain" round>消耗 <strong>{{ formatTokens(usageStats.total_tokens) }}</strong> Tokens</el-tag>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 功能标签页 -->
    <el-tabs v-model="activeTab" type="border-card" class="ai-tabs">

      <!-- ==================== 智能预算建议 ==================== -->
      <el-tab-pane label="智能预算建议" name="recommendation">
        <div class="tab-header">
          <el-form :inline="true" class="search-form" >
            <el-form-item label="目标年度">
              <el-date-picker v-model="recYear" type="year" placeholder="选择年度" value-format="YYYY" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="fetchRecommendation" :loading="loading.recommendation">
                <el-icon><MagicStick /></el-icon> AI 生成预算建议
              </el-button>
            </el-form-item>
          </el-form>
          <UsageBadge :usage="recommendation?.usage" />
        </div>

        <!-- AI思考动画 -->
        <AiThinking v-if="loading.recommendation" text="AI正在分析历史数据并生成预算建议" />

        <div v-if="recommendation && !loading.recommendation">
          <!-- 汇总卡片 -->
          <el-row :gutter="20" class="summary-row">
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-blue">
                <div class="stat-label">建议总预算</div>
                <div class="stat-value">¥{{ formatNum(recommendation.total_recommended_budget) }}</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-purple">
                <div class="stat-label">分析科目数</div>
                <div class="stat-value">{{ recommendation.summary?.total_accounts || 0 }} <small>个</small></div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-green">
                <div class="stat-label">高置信度</div>
                <div class="stat-value">{{ recommendation.summary?.high_confidence || 0 }} <small>个</small></div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-orange">
                <div class="stat-label">数据来源</div>
                <div class="stat-value-sm">{{ recommendation.data_source }}</div>
                <div class="ai-model-tag"><el-icon style="vertical-align: middle; font-size: 14px;"><Cpu /></el-icon> {{ recommendation.ai_model }}</div>
              </el-card>
            </el-col>
          </el-row>

          <!-- AI 整体分析 -->
          <el-alert v-if="recommendation.overall_analysis" title="AI 整体分析" type="info"
            :description="recommendation.overall_analysis" show-icon :closable="false" class="ai-alert" />
          <el-alert v-if="recommendation.trend_analysis" title="趋势研判" type="success"
            :description="recommendation.trend_analysis" show-icon :closable="false" class="ai-alert" />

          <!-- 图表区 -->
          <el-row :gutter="20" style="margin-top:16px">
            <el-col :span="14">
              <el-card shadow="hover"><template #header>预算建议 vs 历史平均</template>
                <div ref="recBarChart" style="height:350px"></div>
              </el-card>
            </el-col>
            <el-col :span="10">
              <el-card shadow="hover"><template #header>预算构成分布</template>
                <div ref="recPieChart" style="height:350px"></div>
              </el-card>
            </el-col>
          </el-row>

          <!-- 建议明细表 -->
          <el-card shadow="hover" style="margin-top:16px">
            <template #header>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span><el-icon style="vertical-align: middle;"><List /></el-icon> 科目预算建议明细</span>
                <el-button type="success" size="small" @click="createBudgetFromAI" :loading="loading.createBudget" :disabled="!selectedRecs.length">
                  <el-icon><Promotion /></el-icon> 一键生成预算 ({{ selectedRecs.length }}项)
                </el-button>
              </div>
            </template>
            <el-table :data="recommendation.recommendations" border stripe max-height="400" style="width:100%" @selection-change="(rows) => selectedRecs = rows" ref="recTableRef">
              <el-table-column type="selection" width="50" />
              <el-table-column prop="account_code" label="科目代码" width="100" />
              <el-table-column prop="account_name" label="科目名称" min-width="130" />
              <el-table-column label="建议预算" width="130" align="right">
                <template #default="{ row }"><strong class="text-blue">¥{{ formatNum(row.recommended_budget) }}</strong></template>
              </el-table-column>
              <el-table-column label="历史均值" width="120" align="right">
                <template #default="{ row }">¥{{ formatNum(row.historical_avg) }}</template>
              </el-table-column>
              <el-table-column label="增长率" width="100" align="center">
                <template #default="{ row }">
                  <span :class="row.growth_rate > 0 ? 'text-red' : 'text-green'">
                    {{ row.growth_rate > 0 ? '↑' : '↓' }}{{ Math.abs(row.growth_rate) }}%
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="置信度" width="80" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.confidence === '高' ? 'success' : row.confidence === '中' ? 'warning' : 'info'" size="small" effect="dark">{{ row.confidence }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="reasoning" label="AI 分析理由" min-width="220" show-overflow-tooltip />
            </el-table>
          </el-card>

          <!-- 风险提示 & 优化建议 -->
          <el-row :gutter="20" style="margin-top:16px" v-if="recommendation.risk_warnings?.length || recommendation.optimization_tips?.length">
            <el-col :span="12" v-if="recommendation.risk_warnings?.length">
              <el-card shadow="hover" class="tip-card risk"><template #header><span><el-icon style="vertical-align: middle; color: var(--color-warning);"><Warning /></el-icon> 风险提示</span></template>
                <ul class="tip-list"><li v-for="(w, i) in recommendation.risk_warnings" :key="i">{{ w }}</li></ul>
              </el-card>
            </el-col>
            <el-col :span="12" v-if="recommendation.optimization_tips?.length">
              <el-card shadow="hover" class="tip-card success"><template #header><span><el-icon style="vertical-align: middle; color: var(--color-primary);"><InfoFilled /></el-icon> 优化建议</span></template>
                <ul class="tip-list"><li v-for="(t, i) in recommendation.optimization_tips" :key="i">{{ t }}</li></ul>
              </el-card>
            </el-col>
          </el-row>
        </div>
        <el-empty v-else-if="!loading.recommendation" description="请选择年度并点击生成建议" />
      </el-tab-pane>

      <!-- ==================== 异常检测 ==================== -->
      <el-tab-pane label="异常检测" name="anomalies">
        <div class="tab-header">
          <el-form :inline="true" class="search-form" >
            <el-form-item label="选择预算">
              <el-select v-model="anomalyBudgetId" placeholder="请选择预算">
                <el-option v-for="b in budgetList" :key="b.id" :label="b.budget_name" :value="b.id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="warning" @click="fetchAnomalies" :loading="loading.anomalies" :disabled="!anomalyBudgetId">
                <el-icon><Warning /></el-icon> AI 异常检测
              </el-button>
            </el-form-item>
          </el-form>
          <UsageBadge :usage="anomalies?.usage" />
        </div>

        <AiThinking v-if="loading.anomalies" text="AI正在扫描预算数据，识别异常模式" />

        <div v-if="anomalies && !loading.anomalies">
          <el-row :gutter="20" class="summary-row">
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-blue">
                <div class="stat-label">平均执行率</div>
                <div class="stat-value">{{ anomalies.statistics?.mean_execution_rate || 0 }}%</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-red">
                <div class="stat-label">风险评分</div>
                <div class="stat-value">{{ anomalies.risk_score || 0 }}<small>/100</small></div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-orange">
                <div class="stat-label">发现异常</div>
                <div class="stat-value">{{ anomalies.summary?.total || 0 }} <small>项</small></div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-purple">
                <div class="stat-label">严重问题</div>
                <div class="stat-value text-red">{{ anomalies.summary?.critical || 0 }} <small>项</small></div>
              </el-card>
            </el-col>
          </el-row>

          <el-alert v-if="anomalies.overall_assessment" title="AI 整体评估" type="warning"
            :description="anomalies.overall_assessment" show-icon :closable="false" class="ai-alert" />

          <!-- 散点图 -->
          <el-card shadow="hover" style="margin-top:16px"><template #header>执行率 vs 预算金额 散点分析</template>
            <div ref="anomalyScatterChart" style="height:350px"></div>
          </el-card>

          <!-- 异常列表 -->
          <el-card shadow="hover" style="margin-top:16px"><template #header>异常清单</template>
            <el-table :data="anomalies.anomalies" border stripe max-height="400">
              <el-table-column label="严重度" width="80" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.severity === '严重' ? 'danger' : row.severity === '警告' ? 'warning' : 'info'" effect="dark" size="small">{{ row.severity }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="account_code" label="科目" width="90" />
              <el-table-column prop="account_name" label="名称" width="130" />
              <el-table-column prop="department" label="部门" width="80" />
              <el-table-column label="预算/已用" width="160" align="right">
                <template #default="{ row }">
                  <div>预算: ¥{{ formatNum(row.budget_amount) }}</div>
                  <div>已用: ¥{{ formatNum(row.used_amount) }}</div>
                </template>
              </el-table-column>
              <el-table-column label="执行率" width="85" align="center">
                <template #default="{ row }">
                  <span :class="row.execution_rate > 100 ? 'text-red' : row.execution_rate < 20 ? 'text-orange' : 'text-green'" style="font-weight:bold">{{ row.execution_rate }}%</span>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="80" align="center">
                <template #default="{ row }"><el-tag size="small" :type="row.type === '超支' ? 'danger' : 'warning'">{{ row.type }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="diagnosis" label="AI 诊断" min-width="170" show-overflow-tooltip />
              <el-table-column prop="suggestion" label="AI 建议" min-width="170" show-overflow-tooltip />
            </el-table>
          </el-card>

          <el-card v-if="anomalies.management_advice?.length" shadow="hover" style="margin-top:16px" class="tip-card info">
            <template #header><span><el-icon style="vertical-align: middle;"><Memo /></el-icon> 管理层建议</span></template>
            <ul class="tip-list"><li v-for="(a, i) in anomalies.management_advice" :key="i">{{ a }}</li></ul>
          </el-card>
        </div>
        <el-empty v-else-if="!loading.anomalies" description="请选择预算并点击 AI 异常检测" />
      </el-tab-pane>

      <!-- ==================== 优化建议 ==================== -->
      <el-tab-pane label="优化建议" name="optimization">
        <div class="tab-header">
          <el-form :inline="true" class="search-form" >
            <el-form-item label="选择预算">
              <el-select v-model="optBudgetId" placeholder="请选择预算">
                <el-option v-for="b in budgetList" :key="b.id" :label="b.budget_name" :value="b.id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="success" @click="fetchOptimization" :loading="loading.optimization" :disabled="!optBudgetId">
                <el-icon><Promotion /></el-icon> AI 优化分析
              </el-button>
            </el-form-item>
          </el-form>
          <UsageBadge :usage="optimization?.usage" />
        </div>

        <AiThinking v-if="loading.optimization" text="AI正在评估预算健康度并制定调配方案" />

        <div v-if="optimization && !loading.optimization">
          <el-row :gutter="20" class="summary-row">
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card health-card">
                <div ref="healthGaugeChart" style="height:140px"></div>
                <div class="health-title">预算健康度</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-green">
                <div class="stat-label">可调配资金</div>
                <div class="stat-value">¥{{ formatNum(optimization.transferable_amount) }}</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-red">
                <div class="stat-label">资金缺口</div>
                <div class="stat-value">¥{{ formatNum(optimization.shortfall_amount) }}</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover" class="stat-card gradient-blue">
                <div class="stat-label">整体执行率</div>
                <div class="stat-value">{{ optimization.summary?.overall_rate || 0 }}%</div>
                <div class="ai-model-tag"><el-icon style="vertical-align: middle; font-size: 14px;"><Cpu /></el-icon> {{ optimization.ai_model }}</div>
              </el-card>
            </el-col>
          </el-row>

          <el-alert v-if="optimization.overall_analysis" title="AI 整体诊断" type="success"
            :description="optimization.overall_analysis" show-icon :closable="false" class="ai-alert" />

          <!-- 桑基图 -->
          <el-card v-if="optimization.sankey_data" shadow="hover" style="margin-top:16px">
            <template #header>资金调配流向图</template>
            <div ref="sankeyChart" style="height:350px"></div>
          </el-card>

          <!-- 资金调配方案 -->
          <el-card shadow="hover" style="margin-top:16px"><template #header>资金调配方案</template>
            <el-table :data="optimization.adjustments" border stripe max-height="350">
              <el-table-column label="优先级" width="70" align="center">
                <template #default="{ row }"><el-tag :type="row.priority === '高' ? 'danger' : row.priority === '中' ? 'warning' : 'info'" size="small">{{ row.priority }}</el-tag></template>
              </el-table-column>
              <el-table-column label="方向" width="70" align="center">
                <template #default="{ row }"><el-tag :type="row.direction === '调入' ? 'success' : 'warning'" effect="dark" size="small">{{ row.direction }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="account_code" label="科目" width="90" />
              <el-table-column prop="account_name" label="名称" width="130" />
              <el-table-column prop="department" label="部门" width="80" />
              <el-table-column label="当前预算" width="110" align="right">
                <template #default="{ row }">¥{{ formatNum(row.current_budget) }}</template>
              </el-table-column>
              <el-table-column label="执行率" width="80" align="center">
                <template #default="{ row }">{{ row.execution_rate?.toFixed?.(1) || row.execution_rate }}%</template>
              </el-table-column>
              <el-table-column label="建议调配" width="120" align="right">
                <template #default="{ row }">
                  <strong :class="row.suggested_amount > 0 ? 'text-green' : 'text-red'">
                    {{ row.suggested_amount > 0 ? '+' : '' }}¥{{ formatNum(Math.abs(row.suggested_amount)) }}
                  </strong>
                </template>
              </el-table-column>
              <el-table-column prop="reason" label="AI 理由" min-width="200" show-overflow-tooltip />
            </el-table>
          </el-card>

          <!-- 战略建议 -->
          <el-row :gutter="16" style="margin-top:16px" v-if="optimization.strategic_suggestions?.length">
            <el-col :span="8" v-for="(s, i) in optimization.strategic_suggestions" :key="i">
              <el-card shadow="hover" class="suggestion-card">
                <div class="suggestion-header">
                  <span class="suggestion-title">{{ s.title }}</span>
                  <el-tag :type="s.impact === '高' ? 'danger' : s.impact === '中' ? 'warning' : 'info'" size="small">{{ s.impact }}影响</el-tag>
                </div>
                <p class="suggestion-content">{{ s.content }}</p>
              </el-card>
            </el-col>
          </el-row>
        </div>
        <el-empty v-else-if="!loading.optimization" description="请选择预算并点击 AI 优化分析" />
      </el-tab-pane>

      <!-- ==================== 年度对比 ==================== -->
      <el-tab-pane label="年度对比" name="comparison">
        <div class="tab-header">
          <el-form :inline="true" class="search-form" >
            <el-form-item label="对比年度">
              <el-date-picker v-model="cmpYear1" type="year" placeholder="第一年" value-format="YYYY" />
              <span style="margin:0 8px;color:#909399">vs</span>
              <el-date-picker v-model="cmpYear2" type="year" placeholder="第二年" value-format="YYYY" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="fetchComparison" :loading="loading.comparison" :disabled="!cmpYear1 || !cmpYear2">
                <el-icon><TrendCharts /></el-icon> AI 对比分析
              </el-button>
            </el-form-item>
          </el-form>
          <UsageBadge :usage="comparison?.usage" />
        </div>

        <AiThinking v-if="loading.comparison" text="AI正在对比两个年度的预算执行数据" />

        <div v-if="comparison && !loading.comparison">
          <el-row :gutter="20" class="summary-row">
            <el-col :span="6"><el-card shadow="hover" class="stat-card gradient-blue">
              <div class="stat-label">{{ cmpYear1 }}年总预算</div>
              <div class="stat-value-sm">¥{{ formatNum(comparison.summary?.year1_total_budget) }}</div>
            </el-card></el-col>
            <el-col :span="6"><el-card shadow="hover" class="stat-card gradient-purple">
              <div class="stat-label">{{ cmpYear2 }}年总预算</div>
              <div class="stat-value-sm">¥{{ formatNum(comparison.summary?.year2_total_budget) }}</div>
            </el-card></el-col>
            <el-col :span="6"><el-card shadow="hover" class="stat-card gradient-green">
              <div class="stat-label">对比科目数</div>
              <div class="stat-value">{{ comparison.summary?.total_accounts || 0 }} <small>个</small></div>
            </el-card></el-col>
            <el-col :span="6"><el-card shadow="hover" class="stat-card gradient-orange">
              <div class="stat-label">关键变化</div>
              <div class="stat-value">{{ comparison.key_changes?.length || 0 }} <small>项</small></div>
            </el-card></el-col>
          </el-row>

          <el-alert v-if="comparison.overall_comparison" title="AI 对比分析" type="info"
            :description="comparison.overall_comparison" show-icon :closable="false" class="ai-alert" />

          <el-card shadow="hover" style="margin-top:16px"><template #header>年度预算对比图</template>
            <div ref="comparisonBarChart" style="height:380px"></div>
          </el-card>

          <el-row :gutter="20" style="margin-top:16px">
            <el-col :span="12" v-if="comparison.key_changes?.length">
              <el-card shadow="hover" class="tip-card info"><template #header><span><el-icon style="vertical-align: middle;"><Refresh /></el-icon> 关键变化</span></template>
                <div v-for="(c, i) in comparison.key_changes" :key="i" class="change-item">
                  <el-tag size="small" :type="c.change_type === '大幅增长' ? 'danger' : c.change_type === '大幅下降' ? 'success' : 'info'">{{ c.change_type }}</el-tag>
                  <strong>{{ c.account_name }}</strong>: {{ c.description }}
                </div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card shadow="hover" class="tip-card success" v-if="comparison.trend_insights?.length">
                <template #header><span><el-icon style="vertical-align: middle;"><TrendCharts /></el-icon> 趋势洞察</span></template>
                <ul class="tip-list"><li v-for="(t, i) in comparison.trend_insights" :key="i">{{ t }}</li></ul>
              </el-card>
              <el-card shadow="hover" class="tip-card risk" v-if="comparison.recommendations?.length" style="margin-top:16px">
                <template #header><span><el-icon style="vertical-align: middle; color: var(--color-primary);"><InfoFilled /></el-icon> 改进建议</span></template>
                <ul class="tip-list"><li v-for="(r, i) in comparison.recommendations" :key="i">{{ r }}</li></ul>
              </el-card>
            </el-col>
          </el-row>
        </div>
        <el-empty v-else-if="!loading.comparison" description="请选择两个年度并点击对比分析" />
      </el-tab-pane>

      <!-- ==================== 综合报告 ==================== -->
      <el-tab-pane label="综合报告" name="report">
        <div class="tab-header">
          <el-form :inline="true" class="search-form" >
            <el-form-item label="选择预算">
              <el-select v-model="reportBudgetId" placeholder="请选择预算">
                <el-option v-for="b in budgetList" :key="b.id" :label="b.budget_name" :value="b.id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="danger" @click="fetchReport" :loading="loading.report" :disabled="!reportBudgetId">
                <el-icon><Document /></el-icon> 一键生成综合报告
              </el-button>
            </el-form-item>
          </el-form>
          <UsageBadge :usage="report?.usage" />
        </div>

        <AiThinking v-if="loading.report" text="AI正在全面分析预算数据并生成综合报告" />

        <div v-if="report && !loading.report" class="report-container">
          <!-- 管理层摘要 -->
          <el-card shadow="hover" class="report-section">
            <template #header><span class="report-header"><el-icon style="vertical-align: middle;"><Stamp /></el-icon> 管理层摘要</span>
              <el-tag :type="report.report?.health_level === '健康' || report.report?.health_level === '良好' ? 'success' : report.report?.health_level === '一般' ? 'warning' : 'danger'" effect="dark">
                健康度 {{ report.report?.health_score }}/100 · {{ report.report?.health_level }}
              </el-tag>
            </template>
            <p class="report-text">{{ report.report?.executive_summary }}</p>
          </el-card>

          <!-- 分析章节 -->
          <el-card v-for="(sec, i) in report.report?.sections" :key="i" shadow="hover" class="report-section">
            <template #header><span class="report-header"><el-icon style="vertical-align: middle;"><Document /></el-icon> {{ sec.title }}</span></template>
            <p class="report-text">{{ sec.content }}</p>
            <div v-if="sec.key_metrics?.length" class="metrics-row">
              <div v-for="(m, j) in sec.key_metrics" :key="j" class="metric-item">
                <span class="metric-label">{{ m.label }}</span>
                <span class="metric-value" :class="m.status === '危险' ? 'text-red' : m.status === '警告' ? 'text-orange' : 'text-green'">{{ m.value }}</span>
              </div>
            </div>
          </el-card>

          <!-- 异常清单 -->
          <el-card v-if="report.report?.anomalies?.length" shadow="hover" class="report-section">
            <template #header><span class="report-header"><el-icon style="vertical-align: middle; color: var(--color-danger);"><Warning /></el-icon> 异常项清单</span></template>
            <el-table :data="report.report.anomalies" border stripe size="small">
              <el-table-column prop="account" label="科目" min-width="120" />
              <el-table-column label="严重度" width="80" align="center">
                <template #default="{ row }"><el-tag :type="row.severity === '严重' ? 'danger' : row.severity === '警告' ? 'warning' : 'info'" size="small" effect="dark">{{ row.severity }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="issue" label="问题" min-width="200" />
              <el-table-column prop="action" label="建议行动" min-width="200" />
            </el-table>
          </el-card>

          <!-- 行动计划 -->
          <el-card v-if="report.report?.action_plan?.length" shadow="hover" class="report-section">
            <template #header><span class="report-header"><el-icon style="vertical-align: middle;"><List /></el-icon> 行动计划</span></template>
            <el-table :data="report.report.action_plan" border stripe size="small">
              <el-table-column label="优先级" width="80" align="center">
                <template #default="{ row }"><el-tag :type="row.priority === '紧急' ? 'danger' : row.priority === '重要' ? 'warning' : 'info'" size="small" effect="dark">{{ row.priority }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="action" label="行动" min-width="200" />
              <el-table-column prop="expected_effect" label="预期效果" min-width="180" />
              <el-table-column prop="timeline" label="时间节点" width="120" />
            </el-table>
          </el-card>

          <!-- 未来展望 -->
          <el-card v-if="report.report?.outlook" shadow="hover" class="report-section">
            <template #header><span class="report-header"><el-icon style="vertical-align: middle;"><View /></el-icon> 未来展望</span></template>
            <p class="report-text">{{ report.report.outlook }}</p>
          </el-card>
        </div>
        <el-empty v-else-if="!loading.report" description="请选择预算并点击一键生成综合报告" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, h } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/services/axiosInstance'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Warning, Promotion, TrendCharts, Document } from '@element-plus/icons-vue'
import * as echarts from 'echarts'

const router = useRouter()

// ==================== 小组件 ====================
const AiThinking = (props) => {
  return h('div', { class: 'ai-thinking' }, [
    // 旋转雷达环
    h('div', { class: 'ai-radar-wrap' }, [
      h('div', { class: 'ai-radar-ring' }),
      h('div', { class: 'ai-radar-ring ai-radar-ring-2' }),
      h('div', { class: 'ai-radar-sweep' }),
      h('div', { class: 'ai-radar-core' }, [
        h('div', { class: 'ai-radar-icon' }, [
          h('svg', { viewBox: '0 0 24 24', width: '28', height: '28', fill: 'none', stroke: '#409eff', 'stroke-width': '1.5', 'stroke-linecap': 'round' }, [
            h('path', { d: 'M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V11h2a3 3 0 0 1 3 3v1' }),
            h('path', { d: 'M8 6a4 4 0 0 1 4-4' }),
            h('path', { d: 'M5 14a3 3 0 0 1 3-3h2V9.5A4 4 0 0 1 8 6' }),
            h('path', { d: 'M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3' }),
            h('circle', { cx: '9', cy: '17', r: '1', fill: '#409eff', stroke: 'none' }),
            h('circle', { cx: '15', cy: '17', r: '1', fill: '#409eff', stroke: 'none' }),
          ]),
        ]),
      ]),
    ]),
    // 文字区域
    h('div', { class: 'ai-thinking-info' }, [
      h('div', { class: 'ai-thinking-title' }, props.text || 'AI 正在分析中...'),
      h('div', { class: 'ai-thinking-sub' }, '正在调用已配置的本地 Ollama 大模型，请稍候...'),
      // 进度条
      h('div', { class: 'ai-progress-bar' }, [
        h('div', { class: 'ai-progress-fill' }),
      ]),
    ]),
  ])
}
AiThinking.props = ['text']

const UsageBadge = (props) => {
  if (!props.usage) return null
  return h('div', { class: 'usage-badge' }, [
    h('span', null, `Token: ${props.usage.total_tokens || 0}`),
    h('span', null, `(推理:${props.usage.reasoning_tokens || 0})`),
  ])
}
UsageBadge.props = ['usage']

// ==================== 状态 ====================
const activeTab = ref('recommendation')
const AI_TIMEOUT = { timeout: 120000 }
const loading = ref({ recommendation: false, anomalies: false, optimization: false, comparison: false, report: false, createBudget: false })
const budgetList = ref([])
const usageStats = ref({ call_count: 0, total_tokens: 0 })
const selectedRecs = ref([])
const recTableRef = ref(null)

// 各功能数据
const recYear = ref(String(new Date().getFullYear() + 1))
const recommendation = ref(null)
const anomalyBudgetId = ref('')
const anomalies = ref(null)
const optBudgetId = ref('')
const optimization = ref(null)
const cmpYear1 = ref(String(new Date().getFullYear() - 1))
const cmpYear2 = ref(String(new Date().getFullYear()))
const comparison = ref(null)
const reportBudgetId = ref('')
const report = ref(null)

// 图表引用
const recBarChart = ref(null)
const recPieChart = ref(null)
const anomalyScatterChart = ref(null)
const healthGaugeChart = ref(null)
const sankeyChart = ref(null)
const comparisonBarChart = ref(null)

// ==================== 工具函数 ====================
const formatNum = (val) => parseFloat(val || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatTokens = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : n

const fetchUsageStats = async () => {
  try {
    const res = await api.get('/finance/budgets/ai/usage-stats')
    usageStats.value = res.data || { call_count: 0, total_tokens: 0 }
  } catch { /* 静默 */ }
}

// ==================== 图表渲染 ====================
const initChart = (el) => {
  if (!el) return null
  const existing = echarts.getInstanceByDom(el)
  if (existing) existing.dispose()
  return echarts.init(el)
}

const renderRecCharts = () => {
  const recs = recommendation.value?.recommendations || []
  if (!recs.length) return

  nextTick(() => {
    // 柱状图
    const bar = initChart(recBarChart.value)
    if (bar) {
      bar.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['建议预算', '历史均值'] },
        grid: { left: 80, right: 20, bottom: 80 },
        xAxis: { type: 'category', data: recs.map(r => r.account_name), axisLabel: { rotate: 30, fontSize: 11 } },
        yAxis: { type: 'value', axisLabel: { formatter: v => '¥' + (v >= 10000 ? (v/10000).toFixed(0) + '万' : v) } },
        series: [
          { name: '建议预算', type: 'bar', data: recs.map(r => r.recommended_budget), itemStyle: { color: 'var(--color-primary)', borderRadius: [4,4,0,0] } },
          { name: '历史均值', type: 'bar', data: recs.map(r => r.historical_avg || 0), itemStyle: { color: 'var(--color-warning)', borderRadius: [4,4,0,0] } },
        ],
      })
    }
    // 饼图
    const pie = initChart(recPieChart.value)
    if (pie) {
      pie.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
        series: [{
          type: 'pie', radius: ['35%', '65%'], center: ['50%', '50%'],
          label: { formatter: '{b}\n{d}%', fontSize: 11 },
          data: recs.map(r => ({ name: r.account_name, value: r.recommended_budget })),
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
        }],
      })
    }
  })
}

const renderAnomalyChart = () => {
  const scatter = anomalies.value?.scatter_data || []
  if (!scatter.length) return
  nextTick(() => {
    const chart = initChart(anomalyScatterChart.value)
    if (!chart) return
    chart.setOption({
      tooltip: { formatter: p => `${p.data[3]}<br>预算: ¥${formatNum(p.data[0])}<br>执行率: ${p.data[1]}%<br>部门: ${p.data[2]}` },
      xAxis: { name: '预算金额', type: 'value', axisLabel: { formatter: v => '¥' + (v >= 10000 ? (v/10000).toFixed(0)+'万' : v) } },
      yAxis: { name: '执行率(%)', type: 'value' },
      visualMap: { min: 0, max: 150, dimension: 1, inRange: { color: ['#67c23a', '#e6a23c', '#f56c6c'] }, show: false },
      series: [{ type: 'scatter', symbolSize: 14, data: scatter.map(d => [d.budget, d.rate, d.department, d.name]) }],
    })
  })
}

const renderHealthGauge = () => {
  if (!optimization.value) return
  nextTick(() => {
    const chart = initChart(healthGaugeChart.value)
    if (!chart) return
    const score = optimization.value.health_score || 0
    chart.setOption({
      series: [{
        type: 'gauge', radius: '90%', startAngle: 200, endAngle: -20,
        min: 0, max: 100,
        axisLine: { lineStyle: { width: 15, color: [[0.3, '#f56c6c'], [0.5, '#e6a23c'], [0.7, '#409eff'], [1, '#67c23a']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        pointer: { width: 4, length: '60%' },
        detail: { formatter: `${score}\n${optimization.value.health_level}`, fontSize: 16, offsetCenter: [0, '60%'], color: 'auto' },
        data: [{ value: score }],
      }],
    })
  })
}

const renderSankeyChart = () => {
  const sk = optimization.value?.sankey_data
  if (!sk) return
  nextTick(() => {
    const chart = initChart(sankeyChart.value)
    if (!chart) return
    chart.setOption({
      tooltip: { trigger: 'item', formatter: p => p.dataType === 'edge' ? `${p.data.source} → ${p.data.target}: ¥${formatNum(p.data.value)}` : p.name },
      series: [{
        type: 'sankey', layout: 'none', emphasis: { focus: 'adjacency' },
        nodeAlign: 'left', orient: 'horizontal',
        data: sk.nodes, links: sk.links,
        lineStyle: { color: 'gradient', curveness: 0.5 },
        label: { fontSize: 12 },
      }],
    })
  })
}

const renderComparisonChart = () => {
  const data = comparison.value?.comparison_data || []
  if (!data.length) return
  nextTick(() => {
    const chart = initChart(comparisonBarChart.value)
    if (!chart) return
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: [`${cmpYear1.value}预算`, `${cmpYear1.value}实际`, `${cmpYear2.value}预算`, `${cmpYear2.value}实际`] },
      grid: { left: 80, right: 20, bottom: 80 },
      xAxis: { type: 'category', data: data.map(d => d.name), axisLabel: { rotate: 30, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => '¥' + (v >= 10000 ? (v/10000).toFixed(0)+'万' : v) } },
      series: [
        { name: `${cmpYear1.value}预算`, type: 'bar', data: data.map(d => d.y1_budget || 0), itemStyle: { color: 'var(--color-primary)' } },
        { name: `${cmpYear1.value}实际`, type: 'bar', data: data.map(d => d.y1_used || 0), itemStyle: { color: '#a0cfff' } },
        { name: `${cmpYear2.value}预算`, type: 'bar', data: data.map(d => d.y2_budget || 0), itemStyle: { color: 'var(--color-success)' } },
        { name: `${cmpYear2.value}实际`, type: 'bar', data: data.map(d => d.y2_used || 0), itemStyle: { color: '#b3e19d' } },
      ],
    })
  })
}

// ==================== 数据获取 ====================
const fetchBudgetList = async () => {
  try { const res = await api.get('/finance/budgets'); budgetList.value = res.data.list || res.data || [] }
  catch (e) { console.error('获取预算列表失败:', e) }
}

const fetchRecommendation = async () => {
  loading.value.recommendation = true; recommendation.value = null
  try {
    const res = await api.get('/finance/budgets/ai/recommendation', { params: { year: recYear.value }, ...AI_TIMEOUT })
    recommendation.value = res.data
    ElMessage.success(`AI 已生成${res.data?.recommendations?.length || 0}个科目的预算建议`)
    renderRecCharts()
    fetchUsageStats()
  } catch (e) { ElMessage.error('AI 预算建议生成失败: ' + (e.response?.data?.message || e.message)); console.error(e) }
  finally { loading.value.recommendation = false }
}

// 一键生成预算到预算管理
const createBudgetFromAI = async () => {
  if (!selectedRecs.value.length) {
    ElMessage.warning('请先勾选需要纳入预算的科目')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将为 ${recYear.value} 年创建预算，包含 ${selectedRecs.value.length} 个科目，总金额 ¥${formatNum(selectedRecs.value.reduce((s, r) => s + (parseFloat(r.recommended_budget) || 0), 0))}`,
      '确认生成预算',
      { type: 'info', confirmButtonText: '生成预算', cancelButtonText: '取消' }
    )
  } catch { return }

  loading.value.createBudget = true
  try {
    const res = await api.post('/finance/budgets/ai/create-from-ai', {
      budget_year: parseInt(recYear.value),
      budget_name: `${recYear.value}年AI智能预算`,
      recommendations: selectedRecs.value.map(r => ({
        account_code: r.account_code,
        account_name: r.account_name,
        recommended_budget: r.recommended_budget,
        confidence: r.confidence,
      })),
    })
    ElMessage.success(`预算创建成功！编号: ${res.data.budget_no}`)
    try {
      await ElMessageBox.confirm('预算已创建为草稿状态，是否立即跳转到预算管理页面？', '创建成功', {
        type: 'success', confirmButtonText: '去查看', cancelButtonText: '留在当前页'
      })
      router.push('/finance/budget/list')
    } catch { /* 用户选择留在当前页 */ }
  } catch (e) {
    ElMessage.error('预算创建失败: ' + (e.response?.data?.message || e.message))
  } finally {
    loading.value.createBudget = false
  }
}

const fetchAnomalies = async () => {
  loading.value.anomalies = true; anomalies.value = null
  try {
    const res = await api.get(`/finance/budgets/${anomalyBudgetId.value}/ai/anomalies`, AI_TIMEOUT)
    anomalies.value = res.data
    const count = res.data?.summary?.total || 0
    count > 0 ? ElMessage.warning(`AI 检测到${count}个异常项`) : ElMessage.success('AI 未检测到异常')
    renderAnomalyChart()
    fetchUsageStats()
  } catch (e) { ElMessage.error('AI 异常检测失败: ' + (e.response?.data?.message || e.message)); console.error(e) }
  finally { loading.value.anomalies = false }
}

const fetchOptimization = async () => {
  loading.value.optimization = true; optimization.value = null
  try {
    const res = await api.get(`/finance/budgets/${optBudgetId.value}/ai/optimization`, AI_TIMEOUT)
    optimization.value = res.data
    ElMessage.success(`AI 评估完成: 健康度 ${res.data?.health_score || 0}分 (${res.data?.health_level || ''})`)
    renderHealthGauge()
    renderSankeyChart()
    fetchUsageStats()
  } catch (e) { ElMessage.error('AI 优化分析失败: ' + (e.response?.data?.message || e.message)); console.error(e) }
  finally { loading.value.optimization = false }
}

const fetchComparison = async () => {
  loading.value.comparison = true; comparison.value = null
  try {
    const res = await api.get('/finance/budgets/ai/year-comparison', { params: { year1: cmpYear1.value, year2: cmpYear2.value }, ...AI_TIMEOUT })
    comparison.value = res.data
    ElMessage.success(`AI 已完成${cmpYear1.value}vs${cmpYear2.value}对比分析`)
    renderComparisonChart()
    fetchUsageStats()
  } catch (e) { ElMessage.error('AI 年度对比失败: ' + (e.response?.data?.message || e.message)); console.error(e) }
  finally { loading.value.comparison = false }
}

const fetchReport = async () => {
  loading.value.report = true; report.value = null
  try {
    const res = await api.get(`/finance/budgets/${reportBudgetId.value}/ai/comprehensive-report`, AI_TIMEOUT)
    report.value = res.data
    ElMessage.success('AI 综合报告已生成')
    fetchUsageStats()
  } catch (e) { ElMessage.error('AI 综合报告失败: ' + (e.response?.data?.message || e.message)); console.error(e) }
  finally { loading.value.report = false }
}

onMounted(() => { fetchBudgetList(); fetchUsageStats() })
</script>

<style scoped>
/* ===== 全局容器（匹配生产看板） ===== */
.budget-ai-container { padding: 20px; }

/* ===== 页头卡片（白色简洁） ===== */
.header-card { margin-bottom: 20px; border-radius: 8px !important; }
.header-content { display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; flex-direction: column; gap: 4px; }
.page-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--color-text-primary); }
.header-desc { font-size: 12px; color: var(--color-text-secondary); }
.header-right { display: flex; align-items: center; }
.token-stats { display: flex; gap: 8px; }
.token-stats :deep(.el-tag) { font-size: 12px; }
.token-stats strong { margin-left: 2px; }

/* ===== 标签页（CostSettings风格：圆角+渐变+hover） ===== */
.ai-tabs {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  border: none;
  overflow: hidden;
}
.ai-tabs :deep(.el-tabs__header) {
  background: var(--color-bg-section);
  margin: 0;
  padding: 16px 20px 0;
  border-bottom: 1px solid var(--color-border-light);
}
.ai-tabs :deep(.el-tabs__item) {
  border-radius: 8px 8px 0 0;
  padding: 12px 24px;
  font-weight: 500;
  font-size: 14px;
  height: auto;
  line-height: 1.5;
  transition: all 0.3s;
}
.ai-tabs :deep(.el-tabs__item:hover) {
  background: rgba(64, 158, 255, 0.05);
}
.ai-tabs :deep(.el-tabs__item.is-active) {
  background: white;
  color: var(--color-primary) !important;
  font-weight: 600;
}
.ai-tabs :deep(.el-tabs__content) {
  padding: 24px !important;
}
.tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }

/* ===== 统计卡片 ===== */
.summary-row { margin-bottom: 16px; }
.summary-row :deep(.el-col) { display: flex; }
.stat-card { text-align: center; padding: 16px; border-radius: 8px !important; transition: all .3s; width: 100%; box-shadow: 0 2px 12px 0 rgba(0,0,0,.05) !important; display: flex; flex-direction: column; justify-content: center; min-height: 110px; }
.stat-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.1) !important; transform: translateY(-2px); }
.stat-label { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 8px; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--color-text-primary); }
.stat-value small { font-size: 14px; font-weight: 400; color: var(--color-text-secondary); margin-left: 2px; }
.stat-value-sm { font-size: 16px; font-weight: 600; color: var(--color-text-primary); }
.ai-model-tag { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }

/* ===== 渐变卡片 ===== */
.gradient-blue { border-top: 3px solid #409eff; }
.gradient-blue .stat-value { color: var(--color-primary); }
.gradient-purple { border-top: 3px solid #9b59b6; }
.gradient-purple .stat-value { color: #9b59b6; }
.gradient-green { border-top: 3px solid #67c23a; }
.gradient-green .stat-value { color: var(--color-success); }
.gradient-orange { border-top: 3px solid #e6a23c; }
.gradient-orange .stat-value { color: var(--color-warning); }
.gradient-red { border-top: 3px solid #f56c6c; }
.gradient-red .stat-value { color: var(--color-danger); }

/* ===== 颜色工具 ===== */
.text-blue { color: var(--color-primary); }
.text-red { color: var(--color-danger); }
.text-green { color: var(--color-success); }
.text-orange { color: var(--color-warning); }

/* ===== AI 提示/诊断 ===== */
.ai-alert { margin-top: 12px; margin-bottom: 4px; border-radius: 8px; }
.ai-alert :deep(.el-alert__description) { font-size: 14px; line-height: 1.8; white-space: pre-wrap; }

/* ===== AI 思考动画（浅色科技风） ===== */
.ai-thinking {
  display: flex; align-items: center; justify-content: center;
  flex-direction: column; padding: 50px 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f0f7ff 0%, #e8f2ff 50%, #f5f9ff 100%);
  border: 1px solid #d9ecff;
  min-height: 240px;
  gap: 28px;
}

/* 雷达环 */
.ai-radar-wrap {
  position: relative; width: 100px; height: 100px;
  display: flex; align-items: center; justify-content: center;
}
.ai-radar-ring {
  position: absolute; inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(64, 158, 255, 0.15);
  animation: radar-spin 6s linear infinite;
}
.ai-radar-ring::before {
  content: ''; position: absolute;
  top: -2px; left: 50%; width: 8px; height: 8px;
  background: #409eff; border-radius: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 12px rgba(64,158,255,0.6);
}
.ai-radar-ring-2 {
  inset: 10px;
  border-color: rgba(64, 158, 255, 0.25);
  animation-direction: reverse;
  animation-duration: 4s;
}
.ai-radar-ring-2::before {
  background: #67c23a;
  box-shadow: 0 0 12px rgba(103,194,58,0.6);
}
@keyframes radar-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* 扫描扇形 */
.ai-radar-sweep {
  position: absolute; inset: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(64,158,255,0.12) 60deg, transparent 120deg);
  animation: radar-spin 3s linear infinite;
}

/* 中心核心 */
.ai-radar-core {
  width: 44px; height: 44px; border-radius: 50%;
  background: white;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 16px rgba(64,158,255,0.2);
  z-index: 2;
  animation: core-breathe 2s ease-in-out infinite;
}
.ai-radar-icon { display: flex; align-items: center; justify-content: center; }
@keyframes core-breathe {
  0%, 100% { box-shadow: 0 2px 16px rgba(64,158,255,0.2); }
  50% { box-shadow: 0 2px 24px rgba(64,158,255,0.4), 0 0 40px rgba(64,158,255,0.1); }
}

/* 文字区 */
.ai-thinking-info {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.ai-thinking-title {
  font-size: 16px; font-weight: 600; color: var(--color-text-primary);
  letter-spacing: 0.5px;
}
.ai-thinking-sub {
  font-size: 13px; color: var(--color-text-secondary);
}

/* 进度条 */
.ai-progress-bar {
  width: 200px; height: 3px; border-radius: 3px;
  background: rgba(64,158,255,0.12);
  margin-top: 4px; overflow: hidden;
}
.ai-progress-fill {
  width: 40%; height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, #409eff, #67c23a);
  animation: progress-slide 2s ease-in-out infinite;
}
@keyframes progress-slide {
  0% { width: 20%; margin-left: 0; }
  50% { width: 50%; margin-left: 30%; }
  100% { width: 20%; margin-left: 80%; }
}

/* ===== Token 用量徽章 ===== */
.usage-badge { display: inline-flex; gap: 8px; font-size: 12px; color: var(--color-primary); background: var(--color-primary-light-9); padding: 4px 12px; border-radius: 12px; border: 1px solid #d9ecff; }

/* ===== 提示卡片 ===== */
.tip-card { border-radius: 4px !important; }
.tip-card.risk :deep(.el-card__header) { color: var(--color-danger); }
.tip-card.success :deep(.el-card__header) { color: var(--color-success); }
.tip-card.info :deep(.el-card__header) { color: var(--color-primary); }
.tip-list { margin: 0; padding-left: 20px; line-height: 2; color: var(--color-text-regular); font-size: 14px; }
.tip-list li { margin-bottom: 4px; }

/* ===== 健康度卡片 ===== */
.health-card { align-items: center; }
.health-title { text-align: center; margin-top: 4px; color: var(--color-text-secondary); font-size: 13px; }

/* ===== 战略建议卡片（等高） ===== */
.suggestion-card { height: 100%; display: flex; flex-direction: column; }
.suggestion-card :deep(.el-card__body) { flex: 1; display: flex; flex-direction: column; }
.suggestion-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #f0f2f5; }
.suggestion-title { font-weight: 600; color: var(--color-text-primary); font-size: 15px; }
.suggestion-content { color: var(--color-text-regular); font-size: 13px; line-height: 1.7; margin: 0; flex: 1; }

/* ===== 年度对比 ===== */
.change-item { padding: 8px 0; border-bottom: 1px solid var(--color-border-lighter); display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-regular); }
.change-item:last-child { border-bottom: none; }

/* ===== 综合报告 ===== */
.report-container { max-width: 1000px; }
.report-section { margin-bottom: 16px; border-radius: 4px; }
.report-section :deep(.el-card__header) { display: flex; justify-content: space-between; align-items: center; }
.report-header { font-size: 16px; font-weight: 600; color: var(--color-text-primary); }
.report-text { font-size: 14px; line-height: 1.9; color: var(--color-text-regular); white-space: pre-wrap; margin: 0; }
.metrics-row { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border-lighter); }
.metric-item { display: flex; flex-direction: column; align-items: center; min-width: 100px; }
.metric-label { font-size: 12px; color: var(--color-text-secondary); }
.metric-value { font-size: 16px; font-weight: 700; }

/* ===== 表格 ===== */
.ai-tabs :deep(.el-table th) { background: #f8f9fb !important; font-weight: 600; font-size: 13px; }
</style>
