/**
 * 8D报告 AI 智能分析服务（专业深度优化版）
 * @description 基于本地 Ollama gemma4:26b 大模型，针对浙江开控电气有限公司(KACON)的成品质量问题
 *              生成符合 IATF 16949 标准的专业级8D报告
 * 
 * 核心优化：
 * 1. D1 团队基于公司真实部门结构（品质部/技术部/生产部/采购部等）
 * 2. D2 问题描述自动融入当日日期，符合5W2H专业格式
 * 3. D6 实施结果留空（尚未验证），仅生成验证方法和验证计划
 * 4. 提示词深度优化，贴合电气/工控产品制造场景
 * 
 * @module services/business/EightDAIService
 */

const { logger } = require('../../utils/logger');

// 本地 Ollama AI 配置（OpenAI 兼容 API）
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://192.168.1.251:11434/v1/chat/completions';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:26b';

// 速率限制
const RATE_LIMIT = {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 20000,
    minRequestIntervalMs: 1000,
};

// ===================== 公司背景常量 =====================
const COMPANY_CONTEXT = {
    name: '浙江开控电气有限公司',
    brand: 'KACON',
    industry: '工业电气控制元件制造',
    products: '脚踏开关、按钮开关、行程开关、工业控制元器件',
    // 真实部门结构
    departments: {
        quality: '品质部',
        engineering: '技术部',
        production: '生产部',
        purchasing: '采购部',
        warehouse: '仓储部',
        finance: '财务部',
        management: '总经办',
    },
    // 生产车间/工序
    workshops: ['脚踏组A', '脚踏组B', '行程组', '新产品组', '按钮开关组'],
};

class EightDAIService {

    static _lastRequestTime = 0;

    /**
     * 延迟工具
     */
    static _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 请求限流
     */
    static async _throttle() {
        const now = Date.now();
        const elapsed = now - this._lastRequestTime;
        if (elapsed < RATE_LIMIT.minRequestIntervalMs) {
            await this._sleep(RATE_LIMIT.minRequestIntervalMs - elapsed);
        }
        this._lastRequestTime = Date.now();
    }

    /**
     * 获取当日日期字符串（YYYY-MM-DD 格式）
     */
    static _getToday() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 调用智谱AI（含重试机制）
     * @param {string} systemPrompt - 系统提示词
     * @param {string} userPrompt - 用户消息
     * @returns {Promise<{content: string, usage: Object}>}
     */
    static async callAI(systemPrompt, userPrompt) {
        let fetchFn;
        try {
            fetchFn = (await import('node-fetch')).default;
        } catch (e) {
            fetchFn = globalThis.fetch;
        }

        const requestBody = JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.35,
            stream: false,
        });

        for (let attempt = 0; attempt <= RATE_LIMIT.maxRetries; attempt++) {
            try {
                await this._throttle();

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 300000); // 本地模型5分钟超时

                const response = await fetchFn(OLLAMA_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: requestBody,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (response.status === 429) {
                    if (attempt < RATE_LIMIT.maxRetries) {
                        const delay = Math.min(
                            RATE_LIMIT.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
                            RATE_LIMIT.maxDelayMs
                        );
                        logger.warn(`[8D-AI] 速率限制(429)，第${attempt + 1}次重试，等待${Math.round(delay)}ms`);
                        await this._sleep(delay);
                        continue;
                    }
                    throw new Error('AI服务繁忙，请稍后再试');
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`AI API错误: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                const usage = {
                    prompt_tokens: data.usage?.prompt_tokens || 0,
                    completion_tokens: data.usage?.completion_tokens || 0,
                    total_tokens: data.usage?.total_tokens || 0,
                };

                logger.info(`[8D-AI] 调用成功 | 模型:${OLLAMA_MODEL} | Token: 输入${usage.prompt_tokens} 输出${usage.completion_tokens} 总计${usage.total_tokens}`);

                if (!content) throw new Error('AI返回内容为空');
                return { content, usage };
            } catch (error) {
                if (attempt < RATE_LIMIT.maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.name === 'AbortError')) {
                    logger.warn(`[8D-AI] 网络异常或超时，第${attempt + 1}次重试...`);
                    await this._sleep(RATE_LIMIT.baseDelayMs);
                    continue;
                }
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
            // 尝试从markdown代码块中提取
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) return JSON.parse(jsonMatch[1]);
            // 尝试匹配最外层大括号
            const braceMatch = text.match(/\{[\s\S]*\}/);
            if (braceMatch) return JSON.parse(braceMatch[0]);
            throw new Error('无法从AI回复中提取JSON');
        }
    }

    // ==================== 核心业务方法 ====================

    /**
     * 一键生成8D报告全部内容（专业深度优化版）
     * @param {Object} params - 参数
     * @param {string} params.problemDescription - 问题描述（必填）
     * @param {string} [params.materialName] - 物料名称
     * @param {string} [params.supplierName] - 供应商名称
     * @param {string} [params.defectType] - 缺陷类型
     * @param {number} [params.quantityAffected] - 影响数量
     * @param {string} [params.priority] - 优先级
     * @param {string} [params.usersListStr] - 真实公司员工花名册
     * @returns {Promise<Object>} 生成的8D报告内容
     */
    static async generateFullReport(params) {
        const { problemDescription, materialName, supplierName, defectType, quantityAffected, priority, usersListStr } = params;

        if (!problemDescription || problemDescription.trim().length < 5) {
            throw new Error('请输入至少5个字的问题描述');
        }

        const today = this._getToday();

        const systemPrompt = `你是浙江开控电气有限公司(KACON品牌)的资深质量管理总监，精通8D问题解决方法论、IATF 16949和ISO 9001标准。
公司主营工业电气控制元件（脚踏开关、按钮开关、行程开关等），产品面向全球工业客户。

公司组织架构（真实部门）：
- 品质部：负责IQC来料检验、IPQC过程检验、FQC成品检验、客诉处理
- 技术部：负责产品设计、工艺开发、技术标准制定、FMEA分析
- 生产部：负责产线管理、设备维护、生产排程、车间现场管理
- 采购部：负责供应商管理、来料质量协调、供应商审核
- 仓储部：负责原材料和成品出入库管理、先进先出(FIFO)
- 总经办：负责质量体系管理、管理评审、资源协调

生产车间：脚踏组A、脚踏组B、行程组、新产品组、按钮开关组

你需要根据客户投诉或内部发现的质量问题，生成面向客户的专业级8D纠正预防措施报告。

今日日期：${today}

请严格返回以下JSON格式（不要包含任何markdown代码块标记，直接输出JSON）：
{
  "title": "简明专业的报告标题（格式：[产品类型][缺陷]纠正预防措施报告，15-30字）",
  "d1_team_leader": "张三（仅输出纯数字或纯汉字的人名，绝对不允许带任何括号、职务或部门名）",
  "d1_team_members": ["李四", "王五", "赵六（数组内每个元素必须是纯粹的姓名，绝对不要在名字后面追加任何括号或部门）"],
  "d2_problem_description": "结构化的问题描述，必须包含5W2H要素：What(具体缺陷现象)、When(${today}发现/反馈)、Where(发现环节-客户端/出货检验/过程巡检)、Who(发现人-客户/QC)、Why(影响-功能/安全/外观)、How(缺陷表现形式)、How many(影响数量/批次)",
  "d2_defect_type": "缺陷分类",
  "d3_containment_actions": ["24小时内可执行的紧急遏制措施1", "措施2", "措施3（至少3条，含隔离/排查/通知客户等）"],
  "d4_root_cause": "根本原因分析，使用5-Why逐层深入：Why1→Why2→Why3→Why4→Why5→根因结论。必须区分直接原因与根本原因",
  "d4_analysis_method": "5why",
  "d4_contributing_factors": ["人(Man)-操作相关因素", "机(Machine)-设备/工装因素", "料(Material)-原材料因素", "法(Method)-工艺/标准因素", "环(Environment)-环境因素"],
  "d5_corrective_actions": ["针对根因的永久纠正措施1(需具体到责任部门)", "措施2", "措施3"],
  "d5_target_date_days": 14,
  "d6_verification_method": "验证方案描述（含验证方法、抽样方案、判定标准、验证周期，但不含最终结果——因为尚未实施验证）",
  "d7_preventive_actions": ["横向展开预防措施1(防止类似问题在其他产线/产品重现)", "措施2"],
  "d7_standardization": "需要修订或新增的文件清单：包括作业指导书(WI)、控制计划(CP)、检验标准、FMEA更新等",
  "d8_summary": "总结概要（100-200字：问题概述→原因→采取的措施→预期效果→后续监控计划）",
  "d8_lessons_learned": "经验教训（从体系/流程/人员能力三个维度总结，并提出改善方向）"
}

硬性要求：
1. D1团队组长和成员必须从下文【公司部门负责人名单】中挑选真实的员工姓名填充，【极其重要】输出必须仅仅是干干净净的姓名（如：张三），不要、严禁在姓名后面增加任何括号、部门名或冒号（绝不能输出类似“李四(品质部)”或“生产部主管：王五”这种格式，这会导致系统崩溃，只能输出“李四”）。
2. D2问题描述中所有日期必须使用 ${today}
3. D3遏制措施至少3条，且必须是24小时内可落地执行的动作
4. D4根因分析必须体现逐层递进的5-Why逻辑链
5. D4促成因素必须按人/机/料/法/环五大维度分析
6. D5纠正措施必须与D4根因一一对应
7. D6只提供验证方案和方法，明确说明"待实施验证"，不要编造验证结果数据
8. D7必须包含横向展开（同类产品/工序排查）和文件标准化两部分
9. 所有措施必须具体、可量化、可追溯，避免"加强管理""提高意识"等空话
10. 语言风格：严谨专业、面向客户可呈现，体现KACON作为专业电气制造商的专业水准`;

        // 构建上下文信息
        let contextInfo = `【客户投诉/质量问题描述】\n${problemDescription}`;
        if (materialName) contextInfo += `\n【涉及产品/物料】${materialName}`;
        if (supplierName) contextInfo += `\n【投诉客户】${supplierName}`;
        if (defectType) contextInfo += `\n【初步缺陷分类】${defectType}`;
        if (quantityAffected) contextInfo += `\n【影响数量】${quantityAffected} 件/批`;
        contextInfo += `\n【问题发现/反馈日期】${today}`;
        if (priority) {
            const priorityMap = { low: '一般', medium: '重要', high: '紧急', critical: '特急(停线级)' };
            contextInfo += `\n【紧急程度】${priorityMap[priority] || priority}`;
        }
        if (usersListStr) {
            contextInfo += `\n\n【公司当前各部门实际负责人名单(请从以下名单中抽取组长和成员)】\n${usersListStr}`;
        }

        const userPrompt = `请根据以下质量问题信息，为浙江开控电气有限公司(KACON)生成一份专业的8D纠正预防措施报告。
此报告将直接呈送给投诉客户，代表公司的质量管控水平和问题处理态度，请确保内容专业严谨。

${contextInfo}

特别注意：
1. D1团队组长必须从提供名单的"品质部"或"总经办"负责人中挑选其真实姓名，团队成员也必须从名单里的各个部门负责人中挑选真名，同时涵盖3个以上的不同部门。【最重要的铁律】：只需输出纯姓名字符串，不要带上任何职务、括号、修饰词！！
2. D2日期统一使用 ${today}
3. D3遏制措施须立即可执行：如对在库成品100%全检、暂停发货、向客户发出质量预警通知等
4. D4因果分析要追溯到管理体系层面的根本原因，而不仅仅是操作层面
5. D6验证方法要明确但不包含结果数据（注明"待纠正措施实施后执行验证"）
6. 措施中所涉及的部门请使用公司实际部门名称`;

        logger.info(`[8D-AI] 开始生成专业级8D报告 | 公司:KACON | 日期:${today} | 描述长度:${problemDescription.length}字`);

        try {
            const { content, usage } = await this.callAI(systemPrompt, userPrompt);
            const result = this.extractJSON(content);

            // 规范化返回数据 —— 确保所有字段有合理默认值
            return {
                success: true,
                data: {
                    title: result.title || `成品质量问题纠正预防措施报告-${today}`,
                    // D1 - 团队（基于公司真实部门）
                    d1_team_leader: result.d1_team_leader || '',
                    d1_team_members: Array.isArray(result.d1_team_members) 
                        ? result.d1_team_members 
                        : [],
                    // D2 - 问题描述（日期使用当天）
                    d2_problem_description: result.d2_problem_description || problemDescription,
                    d2_defect_type: result.d2_defect_type || defectType || '',
                    d2_occurrence_date: today, // 强制使用当天日期
                    // D3 - 遏制措施
                    d3_containment_actions: Array.isArray(result.d3_containment_actions) 
                        ? result.d3_containment_actions 
                        : [],
                    // D4 - 根因分析
                    d4_root_cause: result.d4_root_cause || '',
                    d4_analysis_method: result.d4_analysis_method || '5why',
                    d4_contributing_factors: Array.isArray(result.d4_contributing_factors) 
                        ? result.d4_contributing_factors 
                        : [],
                    // D5 - 纠正措施
                    d5_corrective_actions: Array.isArray(result.d5_corrective_actions) 
                        ? result.d5_corrective_actions 
                        : [],
                    d5_target_date_days: result.d5_target_date_days || 14,
                    // D6 - 验证方法（仅方法，不含结果——因为尚未实施）
                    d6_verification_method: result.d6_verification_method || '',
                    d6_implementation_results: '', // 显式留空——待纠正措施实施后填写
                    d6_verification_result: 'pending', // 显式标记为待验证
                    // D7 - 预防措施
                    d7_preventive_actions: Array.isArray(result.d7_preventive_actions) 
                        ? result.d7_preventive_actions 
                        : [],
                    d7_standardization: result.d7_standardization || '',
                    // D8 - 总结
                    d8_summary: result.d8_summary || '',
                    d8_lessons_learned: result.d8_lessons_learned || '',
                },
                usage,
                model: OLLAMA_MODEL,
            };
        } catch (error) {
            logger.error('[8D-AI] 生成8D报告失败:', error.message);
            throw error;
        }
    }
}

module.exports = EightDAIService;
