/**
 * dingtalkService.js
 * @description 钉钉开放平台API服务
 * @date 2026-02-02
 * @version 1.0.0
 */

const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('../../utils/logger');
const dingtalkConfig = require('../../config/dingtalkConfig');

class DingtalkService {
  constructor() {
    this.accessToken = null;
    this.tokenExpireTime = 0;
    this.config = dingtalkConfig;
  }

  /**
   * 获取AccessToken
   * Token有效期7200秒，需要缓存
   */
  async getAccessToken() {
    // 检查缓存的Token是否有效
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    try {
      const { appKey, appSecret, apiBaseUrl } = this.config;

      if (!appKey || !appSecret) {
        throw new Error('钉钉AppKey或AppSecret未配置');
      }

      const response = await axios.get(`${apiBaseUrl}/gettoken`, {
        params: {
          appkey: appKey,
          appsecret: appSecret,
        },
        timeout: 10000,
      });

      if (response.data.errcode !== 0) {
        throw new Error(`获取AccessToken失败: ${response.data.errmsg}`);
      }

      this.accessToken = response.data.access_token;
      // 提前5分钟过期，避免边界情况
      this.tokenExpireTime = Date.now() + (response.data.expires_in - 300) * 1000;

      logger.info('[Dingtalk] AccessToken获取成功');
      return this.accessToken;
    } catch (error) {
      logger.error('[Dingtalk] 获取AccessToken失败:', error.message);
      throw error;
    }
  }

  /**
   * 发起审批实例
   * @param {Object} params 审批参数
   * @param {string} params.originatorUserId 发起人钉钉UserId
   * @param {number} params.deptId 发起人部门ID
   * @param {Object} params.formData 表单数据
   * @param {string} params.processCode 审批模板编码 (可选，默认使用配置)
   * @returns {Promise<Object>} 审批实例信息
   */
  async createApprovalInstance(params) {
    try {
      const accessToken = await this.getAccessToken();
      const { apiBaseUrl, processCode: defaultProcessCode, agentId } = this.config;

      const { originatorUserId, deptId, formData, processCode = defaultProcessCode } = params;

      if (!processCode) {
        throw new Error('审批模板编码(processCode)未配置');
      }

      if (!originatorUserId) {
        throw new Error('发起人UserId未提供');
      }

      const resolvedDeptId = Number.parseInt(deptId, 10);
      if (!Number.isInteger(resolvedDeptId) || resolvedDeptId <= 0) {
        throw new Error('Dingtalk deptId must be configured or provided');
      }

      // 构建表单组件数据
      const formComponentValues = this.buildFormComponents(formData);

      const requestBody = {
        process_code: processCode,
        originator_user_id: originatorUserId,
        dept_id: resolvedDeptId,
        form_component_values: formComponentValues,
      };

      // 如果有agentId，添加到请求
      if (agentId) {
        requestBody.agent_id = agentId;
      }

      const response = await axios.post(
        `${apiBaseUrl}/topapi/processinstance/create`,
        requestBody,
        {
          params: { access_token: accessToken },
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`发起审批失败: ${response.data.errmsg}`);
      }

      const instanceId = response.data.process_instance_id;
      logger.info(`[Dingtalk] 审批实例创建成功: ${instanceId}`);

      return {
        success: true,
        instanceId,
        message: '审批已发起',
      };
    } catch (error) {
      logger.error('[Dingtalk] 发起审批失败:', error.message);
      throw error;
    }
  }

  /**
   * 构建表单组件数据
   * 将ERP数据转换为钉钉表单格式
   */
  buildFormComponents(formData) {
    const components = [];

    // 费用报销单常见字段映射
    const fieldMapping = {
      expense_number: '报销单号',
      title: '报销事由',
      amount: '报销金额',
      category_name: '费用类型',
      department: '部门',
      applicant_name: '申请人',
      expense_date: '费用日期',
      remark: '备注',
    };

    for (const [key, label] of Object.entries(fieldMapping)) {
      if (formData[key] !== undefined && formData[key] !== null) {
        components.push({
          name: label,
          value: String(formData[key]),
        });
      }
    }

    // 添加明细数据 (如果有)
    if (formData.items && Array.isArray(formData.items)) {
      const detailRows = formData.items.map((item) => [
        { name: '费用项目', value: item.description || '' },
        { name: '金额', value: String(item.amount || 0) },
      ]);

      if (detailRows.length > 0) {
        components.push({
          name: '费用明细',
          value: JSON.stringify(detailRows),
        });
      }
    }

    return components;
  }

  /**
   * 查询审批实例详情
   * @param {string} instanceId 审批实例ID
   */
  async getApprovalDetail(instanceId) {
    try {
      const accessToken = await this.getAccessToken();
      const { apiBaseUrl } = this.config;

      const response = await axios.post(
        `${apiBaseUrl}/topapi/processinstance/get`,
        { process_instance_id: instanceId },
        {
          params: { access_token: accessToken },
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`查询审批详情失败: ${response.data.errmsg}`);
      }

      const instance = response.data.process_instance;

      // 解析表单数据 - 处理钉钉的复杂嵌套结构
      const formData = this.parseFormData(instance.form_component_values);

      return {
        instanceId,
        title: instance.title,
        status: instance.status, // RUNNING, COMPLETED, TERMINATED
        result: instance.result, // agree, refuse
        createTime: instance.create_time,
        finishTime: instance.finish_time,
        originatorUserId: instance.originator_userid,
        originatorDeptId: instance.originator_dept_id,
        formData,
        businessId: instance.business_id,
      };
    } catch (error) {
      logger.error('[Dingtalk] 查询审批详情失败:', error.message);
      throw error;
    }
  }

  /**
   * 解析钉钉表单数据
   * 处理复杂的嵌套结构，提取关键字段
   */
  parseFormData(formComponents) {
    const result = {
      申请事由: '',
      期望交付日期: '',
      总价格: 0,
      名称: '',
      数量: '',
      单位: '',
      价格: 0,
      备注: '',
      采购类型: '',
    };

    if (!formComponents || !Array.isArray(formComponents)) {
      return result;
    }

    for (const field of formComponents) {
      const componentType = field.component_type;
      const name = field.name;
      const value = field.value;

      // 处理DDBizSuite嵌套组件（钉钉把所有数据放在这里）
      if (componentType === 'DDBizSuite' && value) {
        try {
          const nestedComponents = JSON.parse(value);
          this.parseNestedComponents(nestedComponents, result);
        } catch (e) {
          logger.error('[Dingtalk] 解析DDBizSuite失败:', e.message);
        }
        continue;
      }

      // 处理普通字段
      if (name && value) {
        result[name] = value;
      }
    }

    // 如果没有总价格但有单价，使用单价
    if (!result['总价格'] && result['价格']) {
      result['总价格'] = result['价格'];
    }

    return result;
  }

  /**
   * 解析嵌套的表单组件（DDBizSuite内部结构）
   */
  parseNestedComponents(components, result) {
    if (!Array.isArray(components)) return;

    for (const comp of components) {
      const label = comp.props?.label || comp.props?.bizAlias;
      const value = comp.value;
      const extValue = comp.extValue;

      // 提取普通字段值
      if (label && value) {
        if (label === '申请事由' || comp.props?.bizAlias === 'requisition_reason') {
          result['申请事由'] = value;
        } else if (label === '期望交付日期' || comp.props?.bizAlias === 'expected_deliver_date') {
          result['期望交付日期'] = value;
        } else if (label === '备注' || comp.props?.bizAlias === 'remark') {
          result['备注'] = value;
        } else if (label === '采购类型' || comp.props?.bizAlias === 'requisition_type') {
          result['采购类型'] = value;
        }
      }

      // 处理TableField（采购明细）
      if (comp.componentType === 'TableField' || comp.componentName === 'TableField') {
        // 从extValue提取统计值（总价格）
        if (extValue) {
          try {
            const ext = JSON.parse(extValue);
            if (ext.statValue && Array.isArray(ext.statValue)) {
              for (const stat of ext.statValue) {
                if (stat.label === '总价格' || stat.label === '价格') {
                  result['总价格'] = parseFloat(stat.num) || 0;
                  logger.info(`[Dingtalk] 提取总价格: ${result['总价格']}`);
                }
              }
            }
          } catch (e) {
            logger.error('[Dingtalk] 解析TableField extValue失败:', e.message);
          }
        }

        // 从value提取明细行数据
        if (value) {
          try {
            const rows = JSON.parse(value);
            if (Array.isArray(rows) && rows.length > 0) {
              const firstRow = rows[0].rowValue;
              if (firstRow) {
                for (const cell of firstRow) {
                  if (cell.label === '名称' && cell.value) {
                    result['名称'] = cell.value;
                  }
                  if (cell.label === '数量' && cell.value) {
                    result['数量'] = cell.value;
                  }
                  if (cell.label === '单位' && cell.value) {
                    result['单位'] = cell.value;
                  }
                  if (cell.label === '价格' && cell.value) {
                    result['价格'] = parseFloat(cell.value) || 0;
                  }
                }
              }
            }
          } catch (e) {
            logger.error('[Dingtalk] 解析TableField value失败:', e.message);
          }
        }
      }
    }
  }

  /**
   * 获取钉钉审批实例ID列表
   * @param {Object} options 查询选项
   * @param {number} options.startTime 开始时间戳(毫秒)
   * @param {number} options.endTime 结束时间戳(毫秒)
   */
  async fetchApprovalList(options = {}) {
    try {
      const accessToken = await this.getAccessToken();
      const { apiBaseUrl, processCode } = this.config;

      if (!processCode) {
        throw new Error('审批模板编码(processCode)未配置');
      }

      // 默认查询最近7天
      const now = Date.now();
      const startTime = options.startTime || now - 7 * 24 * 60 * 60 * 1000;
      const endTime = options.endTime || now;

      const allInstanceIds = [];
      let cursor = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await axios.post(
          `${apiBaseUrl}/topapi/processinstance/listids`,
          {
            process_code: processCode,
            start_time: startTime,
            end_time: endTime,
            size: 20,
            cursor,
          },
          {
            params: { access_token: accessToken },
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
          }
        );

        if (response.data.errcode !== 0) {
          throw new Error(`获取审批列表失败: ${response.data.errmsg}`);
        }

        const result = response.data.result;
        if (result.list && result.list.length > 0) {
          allInstanceIds.push(...result.list);
        }

        cursor = result.next_cursor;
        hasMore = cursor > 0 && allInstanceIds.length < 1000; // 限制最多1000条
      }

      logger.info(`[Dingtalk] 获取到 ${allInstanceIds.length} 条审批实例`);
      return allInstanceIds;
    } catch (error) {
      logger.error('[Dingtalk] 获取审批列表失败:', error.message);
      throw error;
    }
  }

  /**
   * 从钉钉同步审批到ERP
   * 拉取钉钉审批列表，导入到ERP费用表
   */
  async syncFromDingtalk(options = {}) {
    try {
      const db = require('../../config/db');

      // 1. 获取审批实例ID列表
      const instanceIds = await this.fetchApprovalList(options);

      if (instanceIds.length === 0) {
        return { imported: 0, skipped: 0, message: '没有找到审批记录' };
      }

      let imported = 0;
      let skipped = 0;
      let updated = 0;

      for (const instanceId of instanceIds) {
        try {
          // 检查是否已存在
          const [existing] = await db.pool.execute(
            'SELECT id, status FROM expenses WHERE dingtalk_instance_id = ? AND deleted_at IS NULL',
            [instanceId]
          );

          if (existing.length > 0) {
            // 已存在，检查是否需要更新状态
            const detail = await this.getApprovalDetail(instanceId);
            if (detail.status === 'COMPLETED' && existing[0].status === 'pending') {
              const newStatus = detail.result === 'agree' ? 'approved' : 'rejected';
              await db.pool.execute(
                'UPDATE expenses SET status = ?, dingtalk_status = ?, dingtalk_result = ?, approved_at = ? WHERE id = ?',
                [newStatus, detail.status, detail.result, new Date(), existing[0].id]
              );
              updated++;
            }
            skipped++;
            continue;
          }

          // 2. 获取详情
          const detail = await this.getApprovalDetail(instanceId);

          // 3. 解析表单数据并插入ERP
          const formData = detail.formData;

          // 使用钉钉审批编号作为费用编号（方便对应钉钉单据）
          const expenseNumber = detail.businessId || instanceId;

          // 确定状态
          let status = 'pending';
          if (detail.status === 'COMPLETED') {
            status = detail.result === 'agree' ? 'approved' : 'rejected';
          } else if (detail.status === 'TERMINATED') {
            status = 'cancelled';
          }

          // 从表单中提取金额（parseFormData已经处理好了）
          const amount = formData['总价格'] || formData['价格'] || 0;

          // 生成可读的费用说明
          const descParts = [];
          if (formData['申请事由']) descParts.push(`事由: ${formData['申请事由']}`);
          if (formData['名称']) descParts.push(`采购: ${formData['名称']}`);
          if (formData['数量'] && formData['单位'])
            descParts.push(`数量: ${formData['数量']}${formData['单位']}`);
          if (formData['采购类型']) descParts.push(`类型: ${formData['采购类型']}`);
          if (formData['备注']) descParts.push(`备注: ${formData['备注']}`);
          const description = descParts.length > 0 ? descParts.join('; ') : detail.title;

          // 采购类型到费用类型的映射
          const categoryMapping = {
            办公用品: 40,
            生产原料: 26, // 模具费用
            加工费: 47, // 咨询费
            工具检具: 50, // 工具检具
            设备采购: 37,
            设备维修: 38,
            差旅费: 29,
            交通费: 43,
            住宿费: 44,
            餐饮: 45, // 餐饮补贴
            培训费: 46,
            认证费用: 25,
            模具费用: 26,
            其他: 48,
          };
          const categoryId = categoryMapping[formData['采购类型']] || 48; // 默认为"其他"

          // 计算审批时间
          const submittedAt = detail.createTime ? new Date(detail.createTime) : new Date();
          const approvedAt =
            (status === 'approved' || status === 'rejected') && detail.finishTime
              ? new Date(detail.finishTime)
              : null;

          // 插入到ERP
          await db.pool.execute(
            `INSERT INTO expenses (
                            expense_number, title, amount, status, 
                            category_id, description, expense_date, created_by,
                            submitted_by, submitted_at, approved_by, approved_at, approval_remark,
                            dingtalk_instance_id, dingtalk_status, dingtalk_result, dingtalk_submit_time,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              expenseNumber,
              detail.title || formData['申请事由'] || formData['名称'] || '钉钉审批',
              amount,
              status,
              categoryId,
              description,
              formData['期望交付日期'] || new Date().toISOString().split('T')[0],
              1, // created_by 系统用户
              1, // submitted_by 系统用户 (钉钉中的发起人)
              submittedAt,
              status === 'approved' || status === 'rejected' ? 1 : null, // approved_by
              approvedAt,
              status === 'approved'
                ? '钉钉审批通过'
                : status === 'rejected'
                  ? '钉钉审批拒绝'
                  : null,
              instanceId,
              detail.status,
              detail.result,
              detail.createTime,
            ]
          );

          imported++;
          logger.info(`[Dingtalk] 导入审批: ${instanceId} -> ${expenseNumber}`);
        } catch (err) {
          logger.error(`[Dingtalk] 处理审批 ${instanceId} 失败:`, err.message, err.stack);
        }
      }

      logger.info(`[Dingtalk] 同步完成: 导入${imported}, 更新${updated}, 跳过${skipped}`);
      return { imported, updated, skipped, total: instanceIds.length };
    } catch (error) {
      logger.error('[Dingtalk] 从钉钉同步失败:', error.message);
      throw error;
    }
  }

  /**
   * 处理审批回调
   * 钉钉推送审批状态变更时调用
   * @param {Object} callbackData 回调数据
   */
  async handleApprovalCallback(callbackData) {
    try {
      const { EventType, processInstanceId } = callbackData;

      logger.info(
        `[Dingtalk] 收到审批回调: EventType=${EventType}, instanceId=${processInstanceId}`
      );

      // 事件类型说明:
      // bpms_instance_change - 审批实例状态变化
      // bpms_task_change - 审批任务状态变化

      if (EventType === 'bpms_instance_change') {
        // 查询审批实例最新状态
        const detail = await this.getApprovalDetail(processInstanceId);

        return {
          instanceId: processInstanceId,
          status: detail.status,
          result: detail.result,
          needSync: detail.status === 'COMPLETED' || detail.status === 'TERMINATED',
        };
      }

      return { instanceId: processInstanceId, needSync: false };
    } catch (error) {
      logger.error('[Dingtalk] 处理审批回调失败:', error.message);
      throw error;
    }
  }

  /**
   * 验证回调签名
   * @param {string} signature 签名
   * @param {string} timestamp 时间戳
   * @param {string} nonce 随机数
   * @param {string} encrypt 加密数据
   */
  verifyCallback(signature, timestamp, nonce, encrypt) {
    const { token } = this.config.callback;

    if (!token) {
      logger.warn('[Dingtalk] 回调Token未配置，跳过签名验证');
      return true;
    }

    const arr = [token, timestamp, nonce, encrypt].sort();
    const str = arr.join('');
    const hash = crypto.createHash('sha1').update(str).digest('hex');

    return hash === signature;
  }

  /**
   * 解密回调数据
   * @param {string} encrypt 加密数据
   */
  decryptCallback(encrypt) {
    const { aesKey } = this.config.callback;

    if (!aesKey) {
      logger.warn('[Dingtalk] 回调AESKey未配置，无法解密');
      return null;
    }

    try {
      // 钉钉使用AES-CBC模式
      const key = Buffer.from(aesKey + '=', 'base64');
      const iv = key.slice(0, 16);

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      decipher.setAutoPadding(true);

      let decrypted = decipher.update(encrypt, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      // 去除前16字节随机数和4字节长度
      const content = decrypted.slice(20);
      // 去除末尾的corpid
      const corpIdLen = this.config.corpId.length;
      const plainText = content.slice(0, -corpIdLen);

      return JSON.parse(plainText);
    } catch (error) {
      logger.error('[Dingtalk] 解密回调数据失败:', error.message);
      return null;
    }
  }

  /**
   * 根据手机号获取钉钉UserId
   * @param {string} mobile 手机号
   */
  async getUserIdByMobile(mobile) {
    try {
      const accessToken = await this.getAccessToken();
      const { apiBaseUrl } = this.config;

      const response = await axios.post(
        `${apiBaseUrl}/topapi/v2/user/getbymobile`,
        { mobile },
        {
          params: { access_token: accessToken },
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`获取用户ID失败: ${response.data.errmsg}`);
      }

      return response.data.result.userid;
    } catch (error) {
      logger.error('[Dingtalk] 根据手机号获取UserId失败:', error.message);
      return null;
    }
  }

  /**
   * 启动定时同步任务（内网环境使用）
   * 每天晚上12点从钉钉拉取新审批并更新状态
   * 注意：钉钉API限制每月5000次调用
   */
  startPollingSync() {
    const cron = require('node-cron');

    // 每天0点执行一次（减少API调用次数）
    cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('[Dingtalk] 每日定时同步任务开始');

        // 从钉钉拉取最近3天的审批（包括新增和状态更新）
        const now = Date.now();
        const startTime = now - 3 * 24 * 60 * 60 * 1000; // 最近3天

        const result = await this.syncFromDingtalk({ startTime, endTime: now });
        logger.info(
          `[Dingtalk] 每日定时同步完成: 新增${result.imported}, 更新${result.updated}, 跳过${result.skipped}`
        );
      } catch (error) {
        logger.error('[Dingtalk] 每日定时同步失败:', error.message);
      }
    });

    logger.info('[Dingtalk] 定时同步任务已启动 (每天0点执行，拉取最近3天审批)');
  }
}

// 导出单例
const dingtalkService = new DingtalkService();

// 启动定时同步（内网环境替代回调）
const shouldStartPollingSync =
  process.env.NODE_ENV !== 'test' &&
  !process.env.JEST_WORKER_ID &&
  process.env.DISABLE_CRON !== 'true';

if (shouldStartPollingSync) {
  const dingtalkPollingTimer = setTimeout(() => {
    dingtalkService.startPollingSync();
  }, 10000);
  dingtalkPollingTimer.unref?.();
}

module.exports = dingtalkService;
