/**
 * AI预算分析服务 - 基于环境变量配置的本地 Ollama 大模型
 *
 * 功能矩阵：
 * 1. 预算编制建议 - 基于历史数据+AI分析推荐预算
 * 2. 异常检测 - AI识别执行率异常并给出专业解读
 * 3. 预算优化建议 - AI给出资金调配和管理优化方案
 * 4. 年度对比分析 - AI对比两个年度的预算执行差异
 * 5. 综合报告生成 - 一键生成完整的AI分析报告
 *
 * 增强特性：
 * - 内存缓存（30分钟有效期），避免重复调用浪费Token
 * - Token用量追踪，每次调用记录消耗
 * - 指数退避重试 + 请求限流
 *
 * @module services/business/BudgetAIService
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const { assertOllamaConfigured, getOllamaConfig } = require('../../config/aiConfig');
const crypto = require('crypto');

// 本地 Ollama AI 配置（OpenAI 兼容 API）
const getAIConfig = () => assertOllamaConfigured('Budget AI service');
const getAIModel = () => getOllamaConfig().model || null;

// 速率限制配置
const RATE_LIMIT_CONFIG = {
    maxRetries: 3,              // 最大重试次数
    baseDelayMs: 3000,          // 基础等待时间（3秒）
    maxDelayMs: 30000,          // 最大等待时间（30秒）
    minRequestIntervalMs: 1500, // 请求最小间隔（1.5秒）
};

// 缓存配置
const CACHE_TTL_MS = 30 * 60 * 1000; // 缓存有效期30分钟

class BudgetAIService {

    // ==================== 基础设施 ====================

    // 上次请求时间戳，用于控制请求频率
    static _lastRequestTime = 0;

    // 内存缓存 Map<string, { data, timestamp }>
    static _cache = new Map();

    // 累计Token用量统计
    static _totalUsage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 0,
        call_count: 0,
    };

    /**
     * 延迟指定毫秒
     */
    static _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 请求间隔限流
     */
    static async _throttle() {
        const now = Date.now();
        const elapsed = now - this._lastRequestTime;
        if (elapsed < RATE_LIMIT_CONFIG.minRequestIntervalMs) {
            const waitTime = RATE_LIMIT_CONFIG.minRequestIntervalMs - elapsed;
            logger.info(`[Ollama AI限流] 距上次请求仅${elapsed}ms，等待${waitTime}ms...`);
            await this._sleep(waitTime);
        }
        this._lastRequestTime = Date.now();
    }

    /**
     * 缓存读取
     * @param {string} key - 缓存键
     * @returns {Object|null} 缓存数据或null
     */
    static _getCache(key) {
        const entry = this._cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            this._cache.delete(key);
            return null;
        }
        logger.info(`[AI缓存] 命中缓存: ${key}`);
        return entry.data;
    }

    /**
     * 缓存写入
     */
    static _setCache(key, data) {
        this._cache.set(key, { data, timestamp: Date.now() });
        // 清理过期缓存
        for (const [k, v] of this._cache.entries()) {
            if (Date.now() - v.timestamp > CACHE_TTL_MS) {
                this._cache.delete(k);
            }
        }
    }

    /**
     * 获取Token用量统计
     */
    static getUsageStats() {
        return { ...this._totalUsage };
    }

    // ==================== 核心AI调用 ====================

    /**
     * 调用本地 Ollama AI 大模型（含指数退避重试、请求限流、Token追踪）
     * @param {string} systemPrompt - 系统提示词
     * @param {string} userPrompt - 用户消息（包含数据）
     * @returns {Promise<{content: string, usage: Object}>} AI回复内容和Token用量
     */
    static async callOllamaAI(systemPrompt, userPrompt) {
        const { apiUrl, model, timeoutMs } = getAIConfig();
        // 使用动态 import 加载 node-fetch（兼容性处理）
        let fetchFn;
        try {
            fetchFn = (await import('node-fetch')).default;
        } catch {
            fetchFn = globalThis.fetch;
        }

        const requestBody = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            stream: false,
        });

        // 带重试的请求循环
        for (let attempt = 0; attempt <= RATE_LIMIT_CONFIG.maxRetries; attempt++) {
            try {
                await this._throttle();

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                const response = await fetchFn(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: requestBody,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // 处理 429 速率限制
                if (response.status === 429) {
                    if (attempt < RATE_LIMIT_CONFIG.maxRetries) {
                        const jitter = crypto.randomInt(0, 1000);
                        const delayMs = Math.min(
                            RATE_LIMIT_CONFIG.baseDelayMs * Math.pow(2, attempt) + jitter,
                            RATE_LIMIT_CONFIG.maxDelayMs
                        );
                        logger.warn(`[Ollama AI] 触发速率限制(429)，第${attempt + 1}次重试，等待${Math.round(delayMs)}ms...`);
                        await this._sleep(delayMs);
                        continue;
                    }
                    throw new Error(`Ollama AI 速率限制: 已重试${RATE_LIMIT_CONFIG.maxRetries}次仍被限流，请稍后再试`);
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error('Ollama AI API调用失败:', response.status, errorText);
                    throw new Error(`Ollama AI API错误: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;

                // Token用量提取（Ollama OpenAI 兼容格式）
                const usage = {
                    prompt_tokens: data.usage?.prompt_tokens || 0,
                    completion_tokens: data.usage?.completion_tokens || 0,
                    reasoning_tokens: 0,
                    total_tokens: data.usage?.total_tokens || 0,
                };

                // 累计Token统计
                this._totalUsage.prompt_tokens += usage.prompt_tokens;
                this._totalUsage.completion_tokens += usage.completion_tokens;
                this._totalUsage.reasoning_tokens += usage.reasoning_tokens;
                this._totalUsage.total_tokens += usage.total_tokens;
                this._totalUsage.call_count += 1;

                logger.info(`[Ollama AI] 调用成功 | 模型:${model} | Token: 输入${usage.prompt_tokens} 输出${usage.completion_tokens} 总计${usage.total_tokens}`);

                if (!content) {
                    logger.error('[Ollama AI] 返回内容为空，完整响应:', JSON.stringify(data, null, 2));
                    throw new Error('Ollama AI返回内容为空');
                }

                return { content, usage };
            } catch (error) {
                if (attempt < RATE_LIMIT_CONFIG.maxRetries && (error.code === 'ECONNRESET' || error.name === 'AbortError')) {
                    logger.warn(`[Ollama AI] 网络异常或超时，第${attempt + 1}次重试...`);
                    await this._sleep(RATE_LIMIT_CONFIG.baseDelayMs);
                    continue;
                }
                logger.error('Ollama AI调用异常:', error.message);
                throw error;
            }
        }
    }

    /**
     * 从AI回复中提取JSON
     */
    static extractJSON(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }
            const braceMatch = text.match(/\{[\s\S]*\}/);
            if (braceMatch) {
                return JSON.parse(braceMatch[0]);
            }
            throw new Error('无法从AI回复中提取JSON', { cause: e });
        }
    }

    // ==================== 业务功能 ====================

    /**
     * 生成预算编制建议
     */
    static async generateBudgetRecommendation(targetYear, departmentId = null) {
        const cacheKey = `recommendation:${targetYear}:${departmentId || 'all'}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        try {
            // 1. 获取历史数据
            const lookbackYears = 3;
            const startYear = targetYear - lookbackYears;

            let historicalQuery = `
                SELECT 
                    ga.id as account_id, ga.account_code, ga.account_name,
                    YEAR(ge.entry_date) as year,
                    SUM(gei.debit_amount) as total_debit,
                    SUM(gei.credit_amount) as total_credit
                FROM gl_entry_items gei
                JOIN gl_entries ge ON gei.entry_id = ge.id
                JOIN gl_accounts ga ON gei.account_id = ga.id
                WHERE YEAR(ge.entry_date) >= ? AND YEAR(ge.entry_date) < ?
                    AND ga.account_type IN ('费用', '成本')
                    AND ga.is_active = true
            `;
            const params = [startYear, targetYear];

            if (departmentId) {
                historicalQuery += ' AND ge.department_id = ?';
                params.push(departmentId);
            }

            historicalQuery += ' GROUP BY ga.id, ga.account_code, ga.account_name, YEAR(ge.entry_date) ORDER BY ga.account_code, year';

            const [historicalData] = await db.pool.execute(historicalQuery, params);

            // 按科目整理数据
            const accountMap = {};
            historicalData.forEach(row => {
                if (!accountMap[row.account_id]) {
                    accountMap[row.account_id] = {
                        account_code: row.account_code,
                        account_name: row.account_name,
                        yearly_spending: {},
                    };
                }
                const amount = Math.max(parseFloat(row.total_debit) - parseFloat(row.total_credit), 0);
                accountMap[row.account_id].yearly_spending[row.year] = Math.round(amount * 100) / 100;
            });

            const accountsSummary = Object.values(accountMap).map(a => ({
                code: a.account_code,
                name: a.account_name,
                spending: a.yearly_spending,
            }));

            if (accountsSummary.length === 0) {
                return {
                    target_year: targetYear,
                    ai_model: getAIModel(),
                    recommendations: [],
                    ai_summary: '没有找到历史支出数据，无法生成预算建议。请确保系统中有过去几年的会计分录记录。',
                    data_source: '无可用数据',
                    usage: null,
                };
            }

            // 2. 构建AI提示词
            const systemPrompt = `你是一位资深的企业财务预算分析师，擅长根据历史财务数据制定预算方案。
请根据提供的历史支出数据，为目标年度生成详细的预算编制建议。

你必须返回标准JSON格式（不要包含markdown代码块标记），结构如下：
{
  "total_recommended_budget": 数字,
  "overall_analysis": "对整体预算形势的分析（100-200字）",
  "recommendations": [
    {
      "account_code": "科目代码",
      "account_name": "科目名称",
      "recommended_budget": 数字,
      "historical_avg": 数字（历史年平均支出）,
      "growth_rate": 数字（百分比，如5.2）,
      "confidence": "高/中/低",
      "reasoning": "具体分析理由（50-100字）"
    }
  ],
  "risk_warnings": ["风险提示1", "风险提示2"],
  "optimization_tips": ["优化建议1", "优化建议2"],
  "trend_analysis": "整体趋势分析（80-120字，描述支出趋势走向）"
}`;

            const userPrompt = `请为${targetYear}年编制预算建议。

历史支出数据（${startYear}-${targetYear - 1}年）：
${JSON.stringify(accountsSummary, null, 2)}

${departmentId ? `仅针对部门ID: ${departmentId}` : '全公司范围'}

请综合考虑：
1. 各科目的年度增长趋势
2. 异常波动的合理调整
3. 行业通用的预算编制经验
4. 风险预留和优化空间`;

            // 3. 调用AI
            logger.info(`[AI预算建议] 开始为${targetYear}年生成建议，${accountsSummary.length}个科目...`);
            const { content: aiResponse, usage } = await this.callOllamaAI(systemPrompt, userPrompt);
            const result = this.extractJSON(aiResponse);

            // 用真实科目名称补全AI返回数据（AI可能遗漏account_name）
            const codeToName = {};
            Object.values(accountMap).forEach(a => { codeToName[a.account_code] = a.account_name; });
            if (result.recommendations) {
                result.recommendations.forEach(r => {
                    if (!r.account_name && r.account_code && codeToName[r.account_code]) {
                        r.account_name = codeToName[r.account_code];
                    }
                });
            }

            const response = {
                target_year: targetYear,
                department_id: departmentId,
                analysis_period: `${startYear}-${targetYear - 1}`,
                ai_model: getAIModel(),
                total_recommended_budget: result.total_recommended_budget,
                overall_analysis: result.overall_analysis,
                trend_analysis: result.trend_analysis || '',
                recommendations: result.recommendations || [],
                risk_warnings: result.risk_warnings || [],
                optimization_tips: result.optimization_tips || [],
                summary: {
                    total_accounts: (result.recommendations || []).length,
                    high_confidence: (result.recommendations || []).filter(r => r.confidence === '高').length,
                    medium_confidence: (result.recommendations || []).filter(r => r.confidence === '中').length,
                    low_confidence: (result.recommendations || []).filter(r => r.confidence === '低').length,
                },
                data_source: `${accountsSummary.length}个科目，${lookbackYears}年历史数据`,
                usage,
            };

            this._setCache(cacheKey, response);
            return response;
        } catch (error) {
            logger.error('AI预算建议生成失败:', error);
            throw error;
        }
    }

    /**
     * 预算异常检测
     */
    static async detectAnomalies(budgetId) {
        const cacheKey = `anomalies:${budgetId}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        try {
            // 1. 获取预算执行数据
            const [details] = await db.pool.execute(`
                SELECT 
                    bd.*, ga.account_code, ga.account_name,
                    d.name as department_name,
                    CASE WHEN bd.budget_amount > 0 
                        THEN ROUND((bd.used_amount / bd.budget_amount) * 100, 2) 
                        ELSE 0 END as execution_rate
                FROM budget_details bd
                LEFT JOIN gl_accounts ga ON bd.account_id = ga.id
                LEFT JOIN departments d ON bd.department_id = d.id
                WHERE bd.budget_id = ?
                ORDER BY execution_rate DESC
            `, [budgetId]);

            const [budgetInfo] = await db.pool.execute(
                'SELECT budget_name, budget_year, total_amount FROM budgets WHERE id = ?',
                [budgetId]
            );

            if (details.length === 0) {
                return {
                    budget_id: budgetId,
                    ai_model: getAIModel(),
                    anomalies: [],
                    ai_summary: '该预算没有明细数据，无法进行异常检测。',
                    summary: { total: 0, critical: 0, warning: 0, info: 0 },
                    usage: null,
                };
            }

            // 2. 整理数据
            const executionData = details.map(d => ({
                code: d.account_code,
                name: d.account_name,
                department: d.department_name || '全公司',
                budget: parseFloat(d.budget_amount),
                used: parseFloat(d.used_amount),
                remaining: parseFloat(d.remaining_amount),
                rate: parseFloat(d.execution_rate),
            }));

            // 3. 构建AI提示词
            const systemPrompt = `你是一位资深的企业财务风控分析师，擅长从预算执行数据中发现异常和风险。
请分析以下预算执行数据，找出所有异常项目并给出专业的诊断和建议。

你必须返回标准JSON格式（不要包含markdown代码块标记），结构如下：
{
  "overall_assessment": "整体评价（100-150字，包含关键数据指标）",
  "risk_score": 0-100的整数（整体风险评分，越高越危险），
  "anomalies": [
    {
      "account_code": "科目代码",
      "account_name": "科目名称",
      "department": "部门",
      "budget_amount": 数字,
      "used_amount": 数字,
      "execution_rate": 数字,
      "severity": "严重/警告/提示",
      "type": "超支/偏高/偏低/异常波动",
      "diagnosis": "异常原因诊断（30-60字）",
      "suggestion": "改进建议（30-60字）"
    }
  ],
  "management_advice": ["管理层建议1", "管理层建议2"],
  "normal_items_summary": "正常项目的概括说明（30-50字）"
}

异常判定标准：
- 严重：执行率>120% 或 大额科目执行率>100%
- 警告：执行率>90% 或 执行率<15%且预算金额>5000
- 提示：明显偏离平均水平的项目`;

            const budgetName = budgetInfo[0]?.budget_name || '未知预算';
            const userPrompt = `预算名称: ${budgetName}
预算总额: ¥${budgetInfo[0]?.total_amount || 0}

预算执行明细（共${executionData.length}项）：
${JSON.stringify(executionData, null, 2)}

请仔细分析每个科目的执行情况，重点关注：
1. 执行率异常偏高或偏低的项目
2. 大额预算的执行风险
3. 同部门不同科目之间的不协调
4. 可能导致年度超支的隐患`;

            // 4. 调用AI
            logger.info(`[AI异常检测] 开始检测预算#${budgetId}，${executionData.length}个明细项...`);
            const { content: aiResponse, usage } = await this.callOllamaAI(systemPrompt, userPrompt);
            const result = this.extractJSON(aiResponse);

            const rates = executionData.map(d => d.rate);
            const mean = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

            const response = {
                budget_id: budgetId,
                budget_name: budgetName,
                ai_model: getAIModel(),
                risk_score: result.risk_score || 0,
                statistics: {
                    mean_execution_rate: Math.round(mean * 100) / 100,
                    total_items: details.length,
                    max_rate: Math.max(...rates),
                    min_rate: Math.min(...rates),
                },
                overall_assessment: result.overall_assessment,
                normal_items_summary: result.normal_items_summary || '',
                anomalies: result.anomalies || [],
                management_advice: result.management_advice || [],
                // 散点图数据：每个明细的 { 预算金额, 执行率, 科目名 }
                scatter_data: executionData.map(d => ({
                    name: d.name,
                    budget: d.budget,
                    rate: d.rate,
                    department: d.department,
                })),
                summary: {
                    total: (result.anomalies || []).length,
                    critical: (result.anomalies || []).filter(a => a.severity === '严重').length,
                    warning: (result.anomalies || []).filter(a => a.severity === '警告').length,
                    info: (result.anomalies || []).filter(a => a.severity === '提示').length,
                },
                usage,
            };

            this._setCache(cacheKey, response);
            return response;
        } catch (error) {
            logger.error('AI异常检测失败:', error);
            throw error;
        }
    }

    /**
     * 预算优化建议
     */
    static async optimizeBudgetAllocation(budgetId) {
        const cacheKey = `optimization:${budgetId}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        try {
            // 1. 获取数据
            const [details] = await db.pool.execute(`
                SELECT 
                    bd.*, ga.account_code, ga.account_name,
                    d.name as department_name,
                    CASE WHEN bd.budget_amount > 0 
                        THEN ROUND((bd.used_amount / bd.budget_amount) * 100, 2) 
                        ELSE 0 END as execution_rate
                FROM budget_details bd
                LEFT JOIN gl_accounts ga ON bd.account_id = ga.id
                LEFT JOIN departments d ON bd.department_id = d.id
                WHERE bd.budget_id = ?
            `, [budgetId]);

            const [budgetInfo] = await db.pool.execute(
                'SELECT budget_name, budget_year, total_amount, start_date, end_date FROM budgets WHERE id = ?',
                [budgetId]
            );

            if (details.length === 0) {
                return {
                    budget_id: budgetId,
                    ai_model: getAIModel(),
                    health_score: 0,
                    health_level: '无数据',
                    ai_analysis: '该预算没有明细数据，无法进行优化分析。',
                    adjustments: [],
                    usage: null,
                };
            }

            // 2. 整理数据
            const executionData = details.map(d => ({
                code: d.account_code,
                name: d.account_name,
                department: d.department_name || '全公司',
                budget: parseFloat(d.budget_amount),
                used: parseFloat(d.used_amount),
                remaining: parseFloat(d.remaining_amount),
                rate: parseFloat(d.execution_rate),
            }));

            const totalBudget = executionData.reduce((s, d) => s + d.budget, 0);
            const totalUsed = executionData.reduce((s, d) => s + d.used, 0);

            // 3. 构建AI提示词
            const systemPrompt = `你是一位资深的企业财务优化顾问，擅长预算资金调配和效率优化。
请分析预算执行数据，给出预算健康度评分和资金优化调配方案。

你必须返回标准JSON格式（不要包含markdown代码块标记），结构如下：
{
  "health_score": 0-100的整数,
  "health_level": "健康/良好/一般/需关注/风险",
  "overall_analysis": "整体诊断（150-250字，包含关键问题和亮点）",
  "distribution": {
    "tight": { "count": 数字, "total_shortfall": 数字 },
    "normal": { "count": 数字 },
    "loose": { "count": 数字, "total_surplus": 数字 }
  },
  "adjustments": [
    {
      "direction": "调入/调出",
      "account_code": "科目代码",
      "account_name": "科目名称",
      "department": "部门",
      "current_budget": 数字,
      "execution_rate": 数字,
      "suggested_amount": 数字（调入为正，调出为负）,
      "reason": "调配理由（30-50字）",
      "priority": "高/中/低"
    }
  ],
  "strategic_suggestions": [
    {
      "title": "建议标题",
      "content": "具体建议内容（50-100字）",
      "impact": "高/中/低"
    }
  ]
}

健康度评分标准：
- 90-100: 预算执行良好，无明显风险
- 70-89: 总体正常，个别科目需关注
- 50-69: 存在问题，需要调整
- 30-49: 问题较多，需要干预
- 0-29: 严重偏离，需全面检视`;

            const budgetName = budgetInfo[0]?.budget_name || '未知预算';
            const userPrompt = `预算名称: ${budgetName}
预算年度: ${budgetInfo[0]?.budget_year || ''}
预算周期: ${budgetInfo[0]?.start_date || ''} 至 ${budgetInfo[0]?.end_date || ''}
预算总额: ¥${totalBudget.toFixed(2)}
已使用: ¥${totalUsed.toFixed(2)}（总体执行率: ${totalBudget > 0 ? (totalUsed / totalBudget * 100).toFixed(1) : 0}%）

预算执行明细（共${executionData.length}项）：
${JSON.stringify(executionData, null, 2)}

请给出：
1. 预算整体健康度评分和诊断
2. 具体的资金调配方案（从宽裕科目调出到紧张科目）
3. 管理层面的战略建议`;

            // 4. 调用AI
            logger.info(`[AI优化建议] 开始分析预算#${budgetId}...`);
            const { content: aiResponse, usage } = await this.callOllamaAI(systemPrompt, userPrompt);
            const result = this.extractJSON(aiResponse);

            const response = {
                budget_id: budgetId,
                budget_name: budgetName,
                ai_model: getAIModel(),
                health_score: result.health_score || 0,
                health_level: result.health_level || '未知',
                overall_analysis: result.overall_analysis || '',
                distribution: result.distribution || {},
                transferable_amount: (result.adjustments || [])
                    .filter(a => a.suggested_amount < 0)
                    .reduce((s, a) => s + Math.abs(a.suggested_amount), 0),
                shortfall_amount: (result.adjustments || [])
                    .filter(a => a.suggested_amount > 0)
                    .reduce((s, a) => s + a.suggested_amount, 0),
                adjustments: result.adjustments || [],
                strategic_suggestions: result.strategic_suggestions || [],
                // 桑基图数据
                sankey_data: this._buildSankeyData(result.adjustments || []),
                summary: {
                    total_budget: totalBudget,
                    total_used: totalUsed,
                    overall_rate: totalBudget > 0 ? Math.round(totalUsed / totalBudget * 10000) / 100 : 0,
                },
                usage,
            };

            this._setCache(cacheKey, response);
            return response;
        } catch (error) {
            logger.error('AI预算优化分析失败:', error);
            throw error;
        }
    }

    /**
     * 构建桑基图数据
     */
    static _buildSankeyData(adjustments) {
        if (!adjustments || adjustments.length === 0) return null;
        const sources = adjustments.filter(a => a.suggested_amount < 0); // 调出
        const targets = adjustments.filter(a => a.suggested_amount > 0); // 调入
        if (sources.length === 0 || targets.length === 0) return null;

        const nodes = [];
        const links = [];
        const nodeSet = new Set();

        sources.forEach(s => {
            const name = `${s.account_name}(调出)`;
            if (!nodeSet.has(name)) { nodes.push({ name }); nodeSet.add(name); }
        });
        targets.forEach(t => {
            const name = `${t.account_name}(调入)`;
            if (!nodeSet.has(name)) { nodes.push({ name }); nodeSet.add(name); }
        });

        // 按比例分配资金流
        const totalOut = sources.reduce((s, a) => s + Math.abs(a.suggested_amount), 0);
        sources.forEach(src => {
            const srcRatio = Math.abs(src.suggested_amount) / totalOut;
            targets.forEach(tgt => {
                const flowAmount = Math.round(tgt.suggested_amount * srcRatio);
                if (flowAmount > 0) {
                    links.push({
                        source: `${src.account_name}(调出)`,
                        target: `${tgt.account_name}(调入)`,
                        value: flowAmount,
                    });
                }
            });
        });

        return { nodes, links };
    }

    /**
     * 年度对比分析
     */
    static async compareYearlyBudgets(year1, year2) {
        const cacheKey = `comparison:${year1}:${year2}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        try {
            // 获取两个年度的预算执行数据
            const [data] = await db.pool.execute(`
                SELECT 
                    b.budget_year,
                    ga.account_code, ga.account_name,
                    bd.budget_amount, bd.used_amount,
                    CASE WHEN bd.budget_amount > 0 
                        THEN ROUND((bd.used_amount / bd.budget_amount) * 100, 2) 
                        ELSE 0 END as execution_rate
                FROM budget_details bd
                JOIN budgets b ON bd.budget_id = b.id
                LEFT JOIN gl_accounts ga ON bd.account_id = ga.id
                WHERE b.budget_year IN (?, ?)
                ORDER BY ga.account_code, b.budget_year
            `, [year1, year2]);

            if (data.length === 0) {
                return {
                    year1, year2,
                    ai_model: getAIModel(),
                    comparison: [],
                    ai_analysis: '没有找到这两个年度的预算数据。',
                    usage: null,
                };
            }

            // 按科目整理对比数据
            const comparisonMap = {};
            data.forEach(row => {
                const key = row.account_code;
                if (!comparisonMap[key]) {
                    comparisonMap[key] = { code: row.account_code, name: row.account_name };
                }
                const prefix = String(row.budget_year) === String(year1) ? 'y1' : 'y2';
                comparisonMap[key][`${prefix}_budget`] = parseFloat(row.budget_amount);
                comparisonMap[key][`${prefix}_used`] = parseFloat(row.used_amount);
                comparisonMap[key][`${prefix}_rate`] = parseFloat(row.execution_rate);
            });

            const comparisonData = Object.values(comparisonMap);

            const systemPrompt = `你是一位资深的企业财务分析师，擅长预算年度对比分析。
分析两个年度的预算和实际执行数据，找出关键变化和趋势。

你必须返回标准JSON格式（不要包含markdown代码块标记），结构如下：
{
  "overall_comparison": "总体对比分析（150-200字，包含关键指标变化）",
  "key_changes": [
    {
      "account_code": "科目代码",
      "account_name": "科目名称",
      "change_type": "大幅增长/大幅下降/趋势逆转/基本稳定",
      "description": "变化描述（40-60字）"
    }
  ],
  "trend_insights": ["趋势洞察1", "趋势洞察2"],
  "recommendations": ["改进建议1", "改进建议2"]
}`;

            const userPrompt = `请对比${year1}年和${year2}年的预算执行情况：

${JSON.stringify(comparisonData, null, 2)}

字段说明：y1_=第一年, y2_=第二年, budget=预算, used=实际使用, rate=执行率

请分析：
1. 两年间的显著变化
2. 预算编制是否越来越准确
3. 哪些科目需要特别关注
4. 整体趋势研判`;

            logger.info(`[AI年度对比] 开始对比${year1}年和${year2}年...`);
            const { content: aiResponse, usage } = await this.callOllamaAI(systemPrompt, userPrompt);
            const result = this.extractJSON(aiResponse);

            const response = {
                year1, year2,
                ai_model: getAIModel(),
                overall_comparison: result.overall_comparison || '',
                key_changes: result.key_changes || [],
                trend_insights: result.trend_insights || [],
                recommendations: result.recommendations || [],
                comparison_data: comparisonData, // 图表用原始数据
                summary: {
                    year1_total_budget: comparisonData.reduce((s, d) => s + (d.y1_budget || 0), 0),
                    year1_total_used: comparisonData.reduce((s, d) => s + (d.y1_used || 0), 0),
                    year2_total_budget: comparisonData.reduce((s, d) => s + (d.y2_budget || 0), 0),
                    year2_total_used: comparisonData.reduce((s, d) => s + (d.y2_used || 0), 0),
                    total_accounts: comparisonData.length,
                },
                usage,
            };

            this._setCache(cacheKey, response);
            return response;
        } catch (error) {
            logger.error('AI年度对比分析失败:', error);
            throw error;
        }
    }

    /**
     * 综合报告生成 - 一键生成完整的AI分析报告
     */
    static async generateComprehensiveReport(budgetId) {
        const cacheKey = `comprehensive:${budgetId}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        try {
            // 获取预算完整数据
            const [budgetInfo] = await db.pool.execute(
                'SELECT * FROM budgets WHERE id = ?', [budgetId]
            );
            if (!budgetInfo.length) throw new Error('预算不存在');

            const [details] = await db.pool.execute(`
                SELECT 
                    bd.*, ga.account_code, ga.account_name,
                    d.name as department_name,
                    CASE WHEN bd.budget_amount > 0 
                        THEN ROUND((bd.used_amount / bd.budget_amount) * 100, 2) 
                        ELSE 0 END as execution_rate
                FROM budget_details bd
                LEFT JOIN gl_accounts ga ON bd.account_id = ga.id
                LEFT JOIN departments d ON bd.department_id = d.id
                WHERE bd.budget_id = ?
                ORDER BY execution_rate DESC
            `, [budgetId]);

            if (details.length === 0) {
                return {
                    budget_id: budgetId,
                    ai_model: getAIModel(),
                    report: { summary: '该预算没有明细数据，无法生成综合报告。' },
                    usage: null,
                };
            }

            const executionData = details.map(d => ({
                code: d.account_code,
                name: d.account_name,
                department: d.department_name || '全公司',
                budget: parseFloat(d.budget_amount),
                used: parseFloat(d.used_amount),
                remaining: parseFloat(d.remaining_amount),
                rate: parseFloat(d.execution_rate),
            }));

            const totalBudget = executionData.reduce((s, d) => s + d.budget, 0);
            const totalUsed = executionData.reduce((s, d) => s + d.used, 0);

            const systemPrompt = `你是一位资深的企业CFO顾问，需要为管理层撰写一份专业的预算分析综合报告。
报告需要全面、数据驱动、可操作。

你必须返回标准JSON格式（不要包含markdown代码块标记），结构如下：
{
  "executive_summary": "管理层摘要（200-300字，包含关键指标和核心结论）",
  "health_score": 0-100整数,
  "health_level": "健康/良好/一般/需关注/风险",
  "sections": [
    {
      "title": "章节标题",
      "content": "章节详细内容（100-200字）",
      "key_metrics": [{ "label": "指标名", "value": "指标值", "status": "正常/警告/危险" }]
    }
  ],
  "anomalies": [
    {
      "account": "科目名称",
      "severity": "严重/警告/提示",
      "issue": "问题描述",
      "action": "建议行动"
    }
  ],
  "action_plan": [
    {
      "priority": "紧急/重要/一般",
      "action": "行动描述",
      "expected_effect": "预期效果",
      "timeline": "时间节点"
    }
  ],
  "outlook": "未来展望（100-150字）"
}`;

            const budget = budgetInfo[0];
            const userPrompt = `请为以下预算生成综合分析报告：

预算名称: ${budget.budget_name}
预算年度: ${budget.budget_year}
预算周期: ${budget.start_date} 至 ${budget.end_date}
预算总额: ¥${totalBudget.toFixed(2)}
已使用: ¥${totalUsed.toFixed(2)}
整体执行率: ${totalBudget > 0 ? (totalUsed / totalBudget * 100).toFixed(1) : 0}%

预算执行明细（共${executionData.length}项）：
${JSON.stringify(executionData, null, 2)}

请全面分析并生成一份管理层可参考的综合报告，包含：
1. 管理层摘要
2. 各维度深入分析（执行率、风险、效率）
3. 异常项清单和处置建议
4. 后续行动计划
5. 未来展望`;

            logger.info(`[AI综合报告] 开始生成预算#${budgetId}的综合报告...`);
            const { content: aiResponse, usage } = await this.callOllamaAI(systemPrompt, userPrompt);
            const result = this.extractJSON(aiResponse);

            const response = {
                budget_id: budgetId,
                budget_name: budget.budget_name,
                budget_year: budget.budget_year,
                ai_model: getAIModel(),
                generated_at: new Date().toISOString(),
                report: result,
                execution_data: executionData,
                summary: {
                    total_budget: totalBudget,
                    total_used: totalUsed,
                    overall_rate: totalBudget > 0 ? Math.round(totalUsed / totalBudget * 10000) / 100 : 0,
                    total_items: executionData.length,
                },
                usage,
            };

            this._setCache(cacheKey, response);
            return response;
        } catch (error) {
            logger.error('AI综合报告生成失败:', error);
            throw error;
        }
    }
}

module.exports = BudgetAIService;
