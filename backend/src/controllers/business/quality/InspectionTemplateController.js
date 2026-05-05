/**
 * InspectionTemplateController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../models');
const { Op } = require('sequelize');
const { generateTemplateCode } = require('../../../utils/codeGenerator');
const { getCurrentUserName } = require('../../../utils/userHelper');

class InspectionTemplateController {
  // 获取模板列表
  async getTemplates(req, res) {
    try {
      const {
        page = 1,
        pageSize = 20,
        keyword,
        inspection_type,
        status,
        material_type,
        is_general,
        include_general,
      } = req.query;

      const offset = (page - 1) * pageSize;

      const where = {};
      if (keyword) {
        where[Op.or] = [
          { template_code: { [Op.like]: `%${keyword}%` } },
          { template_name: { [Op.like]: `%${keyword}%` } },
        ];
      }
      if (inspection_type) where.inspection_type = inspection_type;
      if (status) where.status = status;

      // 物料匹配逻辑：支持查询指定物料的专属模板 + 通用模板
      if (material_type && (include_general === 'true' || include_general === true)) {
        // 同时查询：物料精确匹配 OR material_types JSON包含 OR 通用模板
        where[Op.or] = [
          { material_type: material_type },
          db.sequelize.literal(`JSON_CONTAINS(material_types, '${parseInt(material_type)}')`),
          { is_general: true },
        ];
      } else if (material_type) {
        // 仅查询指定物料的专属模板（旧逻辑兼容）
        where[Op.or] = [
          { material_type: material_type },
          db.sequelize.literal(`JSON_CONTAINS(material_types, '${parseInt(material_type)}')`),
        ];
      }

      // ✅ 添加: 支持查询通用模板
      if (is_general !== undefined && is_general !== null && is_general !== '') {
        // 将字符串 'true'/'false' 转换为布尔值
        where.is_general = is_general === 'true' || is_general === true || is_general === 1;
      }

      // 准备关联查询条件
      const includeOptions = [
        {
          model: db.InspectionItem,
          through: { attributes: [] },
          as: 'InspectionItems',
        },
      ];

      const { count, rows } = await db.InspectionTemplate.findAndCountAll({
        where,
        include: includeOptions,
        limit: parseInt(pageSize),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
      });

      // ✅ 优化: 预加载物料信息，避免前端反复请求和闪烁
      const materialIds = new Set();
      const plainRows = rows.map((r) => r.toJSON());

      plainRows.forEach((row) => {
        if (row.material_type) {
          materialIds.add(row.material_type);
        }
        if (row.material_types) {
          try {
            const types =
              typeof row.material_types === 'string'
                ? JSON.parse(row.material_types)
                : row.material_types;
            if (Array.isArray(types)) {
              types.forEach((id) => materialIds.add(id));
            }
          } catch {
            // ignore parse error
          }
        }
      });

      if (materialIds.size > 0) {
        const [materials] = await db.sequelize.query(
          'SELECT id, code, name, specs FROM materials WHERE id IN (?)',
          {
            replacements: [Array.from(materialIds)],
          }
        );

        const materialMap = {};
        materials.forEach((m) => {
          materialMap[m.id] = m;
        });

        // 将物料信息附加到行数据中
        plainRows.forEach((row) => {
          // 处理单个物料
          if (row.material_type && materialMap[row.material_type]) {
            row.material_code = materialMap[row.material_type].code;
            row.material_name = materialMap[row.material_type].name;
            row.material_specs = materialMap[row.material_type].specs;
          }

          // 处理多个物料 - 附加详细列表供前端使用
          const rowMaterialIds = [];
          if (row.material_type) rowMaterialIds.push(row.material_type);

          if (row.material_types) {
            try {
              const types =
                typeof row.material_types === 'string'
                  ? JSON.parse(row.material_types)
                  : row.material_types;
              if (Array.isArray(types)) {
                types.forEach((id) => {
                  if (!rowMaterialIds.includes(id)) rowMaterialIds.push(id);
                });
              }
            } catch (e) { logger.warn('解析 material_types 失败:', e.message); }
            // 静默忽略该错误
          }

          if (rowMaterialIds.length > 0) {
            row.material_details = rowMaterialIds.map((id) => materialMap[id]).filter(Boolean);
          }
        });
      }

      ResponseHandler.paginated(
        res,
        plainRows,
        count,
        parseInt(page),
        parseInt(pageSize),
        '获取检验模板列表成功'
      );
    } catch (error) {
      logger.error('获取模板列表失败:', error);
      logger.error('错误详情:', {
        message: error.message,
        stack: error.stack,
      });
      ResponseHandler.error(res, '获取模板列表失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 获取模板详情
  async getTemplate(req, res) {
    try {
      const { id } = req.params;

      // 使用更详细的关联查询以确保能够获取所有检验项
      const template = await db.InspectionTemplate.findByPk(id, {
        include: [
          {
            model: db.InspectionItem,
            through: { attributes: [] }, // 不包含中间表的属性
            as: 'InspectionItems',
          },
        ],
      });

      if (!template) {
        return ResponseHandler.error(res, '模板不存在', 'NOT_FOUND', 404);
      }

      // 将Items属性复制到items属性，以便前端可以统一访问
      const responseData = template.toJSON();
      if (responseData.InspectionItems && !responseData.items) {
        responseData.items = responseData.InspectionItems;
      }

      // ✅ 优化: 预加载物料信息，避免前端编辑时只显示ID
      const materialIds = new Set();
      if (responseData.material_type) {
        materialIds.add(responseData.material_type);
      }
      if (responseData.material_types) {
        try {
          const types =
            typeof responseData.material_types === 'string'
              ? JSON.parse(responseData.material_types)
              : responseData.material_types;
          if (Array.isArray(types)) {
            types.forEach((id) => materialIds.add(id));
          }
        } catch {
          // ignore parse error
        }
      }

      if (materialIds.size > 0) {
        const [materials] = await db.sequelize.query(
          'SELECT id, code, name, specs FROM materials WHERE id IN (?)',
          {
            replacements: [Array.from(materialIds)],
          }
        );

        const materialMap = {};
        materials.forEach((m) => {
          materialMap[m.id] = m;
        });

        // 处理单个物料
        if (responseData.material_type && materialMap[responseData.material_type]) {
          responseData.material_code = materialMap[responseData.material_type].code;
          responseData.material_name = materialMap[responseData.material_type].name;
          responseData.material_specs = materialMap[responseData.material_type].specs;
        }

        // 处理多个物料 - 附加详细列表供前端使用
        const rowMaterialIds = [];
        if (responseData.material_type) rowMaterialIds.push(responseData.material_type);

        if (responseData.material_types) {
          try {
            const types =
              typeof responseData.material_types === 'string'
                ? JSON.parse(responseData.material_types)
                : responseData.material_types;
            if (Array.isArray(types)) {
              types.forEach((id) => {
                if (!rowMaterialIds.includes(id)) rowMaterialIds.push(id);
              });
            }
          } catch (e) { logger.warn('解析 material_types 失败:', e.message); }
          // 静默忽略该错误
        }

        if (rowMaterialIds.length > 0) {
          responseData.material_details = rowMaterialIds
            .map((id) => materialMap[id])
            .filter(Boolean);
        }
      }

      ResponseHandler.success(res, responseData, '获取模板详情成功');
    } catch (error) {
      logger.error('获取模板详情失败:', error);
      ResponseHandler.error(res, '获取模板详情失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 创建模板
  async createTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const {
        template_name,
        inspection_type,
        material_type,
        material_types,
        version,
        description,
        is_general,
        items,
      } = req.body;

      // 检查用户认证
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '用户未认证',
        });
      }

      // 生成模板编号 格式：IT+日期+序号
      const template_code = await generateTemplateCode('IT', db);

      // 处理物料类型
      let finalMaterialType = null;
      let finalMaterialTypes = null;

      if (material_types && Array.isArray(material_types) && material_types.length > 0) {
        // 如果提供了多个物料，使用 material_types
        finalMaterialTypes = JSON.stringify(material_types);
        // 为了兼容性，将第一个物料ID设置为 material_type
        finalMaterialType = material_types[0];
      } else if (material_type) {
        // 如果只提供了单个物料，使用 material_type
        finalMaterialType = material_type;
        finalMaterialTypes = JSON.stringify([material_type]);
      }

      // 创建模板
      const template = await db.InspectionTemplate.create(
        {
          template_code,
          template_name,
          inspection_type,
          material_type: finalMaterialType,
          material_types: finalMaterialTypes,
          version,
          description,
          is_general: is_general || false,
          status: 'inactive',
          created_by: await getCurrentUserName(req),
        },
        { transaction: t }
      );

      // 创建/或复用检验项目
      const mappingPromises = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let itemId;

        // 检查是否需要复用现有项目
        if (item.reuse_item_id) {
          // 如果提供了复用项目ID，检查是否修改了检验项名称
          const existingReusedItem = await db.InspectionItem.findByPk(item.reuse_item_id, {
            transaction: t,
          });

          if (existingReusedItem && existingReusedItem.item_name !== item.item_name) {
            // 如果用户修改了检验项名称，创建新的检验项而不是更新原有项
            const newItem = await db.InspectionItem.create(
              {
                item_name: item.item_name,
                standard: item.standard,
                type: item.type,
                is_critical: item.is_critical,
                dimension_value: item.dimension_value,
                tolerance_upper: item.tolerance_upper,
                tolerance_lower: item.tolerance_lower,
              },
              { transaction: t }
            );

            itemId = newItem.id;
          } else if (existingReusedItem) {
            // 如果名称未改变，更新该项目的字段
            await db.InspectionItem.update(
              {
                item_name: item.item_name,
                standard: item.standard,
                type: item.type,
                is_critical: item.is_critical,
                dimension_value: item.dimension_value,
                tolerance_upper: item.tolerance_upper,
                tolerance_lower: item.tolerance_lower,
              },
              {
                where: { id: item.reuse_item_id },
                transaction: t,
              }
            );
            itemId = item.reuse_item_id;
          } else {
            // 如果找不到复用项，创建新项
            const newItem = await db.InspectionItem.create(
              {
                item_name: item.item_name,
                standard: item.standard,
                type: item.type,
                is_critical: item.is_critical,
                dimension_value: item.dimension_value,
                tolerance_upper: item.tolerance_upper,
                tolerance_lower: item.tolerance_lower,
              },
              { transaction: t }
            );

            itemId = newItem.id;
          }
        } else {
          // 没有复用ID，查找是否存在完全相同的检验项
          const existingItem = await db.InspectionItem.findOne({
            where: {
              item_name: item.item_name,
              standard: item.standard,
              type: item.type,
              is_critical: item.is_critical,
            },
            transaction: t,
          });

          if (existingItem) {
            // 如果找到了完全相同的检验项，更新它的尺寸数据
            await db.InspectionItem.update(
              {
                dimension_value: item.dimension_value,
                tolerance_upper: item.tolerance_upper,
                tolerance_lower: item.tolerance_lower,
              },
              {
                where: { id: existingItem.id },
                transaction: t,
              }
            );
            itemId = existingItem.id;
          } else {
            // 否则创建新的检验项
            const newItem = await db.InspectionItem.create(
              {
                item_name: item.item_name,
                standard: item.standard,
                type: item.type,
                is_critical: item.is_critical,
                dimension_value: item.dimension_value,
                tolerance_upper: item.tolerance_upper,
                tolerance_lower: item.tolerance_lower,
              },
              { transaction: t }
            );

            itemId = newItem.id;
          }
        }

        // 创建模板-项目关联
        mappingPromises.push(
          db.TemplateItemMapping.create(
            {
              template_id: template.id,
              item_id: itemId,
              sort_order: i,
            },
            { transaction: t }
          )
        );
      }

      await Promise.all(mappingPromises);

      await t.commit();

      ResponseHandler.success(res, template, '模板创建成功');
    } catch (error) {
      await t.rollback();
      logger.error('创建模板失败:', error);
      logger.error('错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      ResponseHandler.error(res, '创建模板失败: ' + error.message, 'SERVER_ERROR', 500, error);
    }
  }

  // 更新模板
  async updateTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        template_name,
        inspection_type,
        material_type,
        material_types,
        version,
        description,
        is_general,
        items,
      } = req.body;

      // 处理物料类型
      let finalMaterialType = null;
      let finalMaterialTypes = null;

      if (material_types && Array.isArray(material_types) && material_types.length > 0) {
        // 如果提供了多个物料，使用 material_types
        finalMaterialTypes = JSON.stringify(material_types);
        // 为了兼容性，将第一个物料ID设置为 material_type
        finalMaterialType = material_types[0];
      } else if (material_type) {
        // 如果只提供了单个物料，使用 material_type
        finalMaterialType = material_type;
        finalMaterialTypes = JSON.stringify([material_type]);
      }

      // 更新模板基本信息
      await db.InspectionTemplate.update(
        {
          template_name,
          inspection_type,
          material_type: finalMaterialType,
          material_types: finalMaterialTypes,
          version,
          description,
          is_general: is_general !== undefined ? is_general : false,
        },
        {
          where: { id },
          transaction: t,
        }
      );

      // 删除旧的检验项目关联
      await db.TemplateItemMapping.destroy({
        where: { template_id: id },
        transaction: t,
      });

      // 创建/或复用检验项目
      const mappingPromises = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let itemId;

        // 检查是否需要复用现有项目
        if (item.reuse_item_id) {
          // 如果提供了复用项目ID，需要更新该项目的字段
          await db.InspectionItem.update(
            {
              item_name: item.item_name,
              standard: item.standard,
              type: item.type,
              is_critical: item.is_critical,
              dimension_value: item.dimension_value,
              tolerance_upper: item.tolerance_upper,
              tolerance_lower: item.tolerance_lower,
            },
            {
              where: { id: item.reuse_item_id },
              transaction: t,
            }
          );
          itemId = item.reuse_item_id;
        } else if (item.id) {
          // 如果提供了项目ID，需要更新该项目的字段
          await db.InspectionItem.update(
            {
              item_name: item.item_name,
              standard: item.standard,
              type: item.type,
              is_critical: item.is_critical,
              dimension_value: item.dimension_value,
              tolerance_upper: item.tolerance_upper,
              tolerance_lower: item.tolerance_lower,
            },
            {
              where: { id: item.id },
              transaction: t,
            }
          );
          itemId = item.id;
        } else {
          // 否则查找是否存在相同标准的检验项
          const existingItem = await db.InspectionItem.findOne({
            where: {
              item_name: item.item_name,
              standard: item.standard,
              type: item.type,
              is_critical: item.is_critical,
            },
          });

          if (existingItem) {
            // 如果找到了相同的检验项，需要更新它的尺寸数据
            await db.InspectionItem.update(
              {
                item_name: item.item_name,
                standard: item.standard,
                type: item.type,
                is_critical: item.is_critical,
                dimension_value: item.dimension_value,
                tolerance_upper: item.tolerance_upper,
                tolerance_lower: item.tolerance_lower,
              },
              {
                where: { id: existingItem.id },
                transaction: t,
              }
            );
            itemId = existingItem.id;
          } else {
            // 否则创建新的检验项
            const newItem = await db.InspectionItem.create(
              {
                item_name: item.item_name,
                standard: item.standard,
                type: item.type,
                is_critical: item.is_critical,
                dimension_value: item.dimension_value,
                tolerance_upper: item.tolerance_upper,
                tolerance_lower: item.tolerance_lower,
              },
              { transaction: t }
            );

            itemId = newItem.id;
          }
        }

        // 创建模板-项目关联
        mappingPromises.push(
          db.TemplateItemMapping.create(
            {
              template_id: id,
              item_id: itemId,
              sort_order: i,
            },
            { transaction: t }
          )
        );
      }

      await Promise.all(mappingPromises);

      await t.commit();

      ResponseHandler.success(res, null, '模板更新成功');
    } catch (error) {
      await t.rollback();
      logger.error('更新模板失败:', error);
      ResponseHandler.error(res, '更新模板失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 更新模板状态
  async updateTemplateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await db.InspectionTemplate.update({ status }, { where: { id } });

      ResponseHandler.success(res, null, '模板状态更新成功');
    } catch (error) {
      logger.error('更新模板状态失败:', error);
      ResponseHandler.error(res, '更新模板状态失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 复制模板
  async copyTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const { id } = req.params;

      // 获取原模板信息
      const originalTemplate = await db.InspectionTemplate.findByPk(id, {
        include: [
          {
            model: db.InspectionItem,
            through: { attributes: [] },
          },
        ],
      });

      if (!originalTemplate) {
        return ResponseHandler.error(res, '模板不存在', 'NOT_FOUND', 404);
      }

      // 生成新的模板编号
      const template_code = await generateTemplateCode('IT', db);

      // 创建新模板
      const newTemplate = await db.InspectionTemplate.create(
        {
          template_code,
          template_name: `${originalTemplate.template_name} - 副本`,
          inspection_type: originalTemplate.inspection_type,
          material_type: originalTemplate.material_type,
          material_types: originalTemplate.material_types, // 保留多物料关联
          is_general: originalTemplate.is_general || false, // 保留通用模板标记
          version: originalTemplate.version,
          description: originalTemplate.description,
          status: 'draft',
          created_by: await getCurrentUserName(req),
        },
        { transaction: t }
      );

      // 复制检验项目
      const createdItems = await Promise.all(
        originalTemplate.InspectionItems.map((item) =>
          db.InspectionItem.create(
            {
              item_name: item.item_name,
              standard: item.standard,
              type: item.type,
              is_critical: item.is_critical,
              dimension_value: item.dimension_value,
              tolerance_upper: item.tolerance_upper,
              tolerance_lower: item.tolerance_lower,
            },
            { transaction: t }
          )
        )
      );

      // 创建新的模板-项目关联
      await Promise.all(
        createdItems.map((item, index) =>
          db.TemplateItemMapping.create(
            {
              template_id: newTemplate.id,
              item_id: item.id,
              sort_order: index,
            },
            { transaction: t }
          )
        )
      );

      await t.commit();

      ResponseHandler.success(res, newTemplate, '模板复制成功');
    } catch (error) {
      await t.rollback();
      logger.error('复制模板失败:', error);
      ResponseHandler.error(res, '复制模板失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 删除模板
  async deleteTemplate(req, res) {
    const t = await db.sequelize.transaction();

    try {
      const { id } = req.params;

      // 删除模板-项目关联
      await db.TemplateItemMapping.destroy({
        where: { template_id: id },
        transaction: t,
      });

      // 删除模板
      await db.InspectionTemplate.destroy({
        where: { id },
        transaction: t,
      });

      await t.commit();

      ResponseHandler.success(res, null, '模板删除成功');
    } catch (error) {
      await t.rollback();
      logger.error('删除模板失败:', error);
      ResponseHandler.error(res, '删除模板失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 获取可复用的检验项目列表
  async getReusableItems(req, res) {
    try {
      const { keyword, type } = req.query;

      // 构建查询条件
      const where = {};

      if (keyword) {
        where[Op.or] = [
          { item_name: { [Op.like]: `%${keyword}%` } },
          { standard: { [Op.like]: `%${keyword}%` } },
        ];
      }

      if (type) {
        where.type = type;
      }

      // 查询检验项目
      const items = await db.InspectionItem.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: 100, // 限制结果数量
      });

      ResponseHandler.success(res, items, '操作成功');
    } catch (error) {
      logger.error('获取可复用检验项目失败:', error);
      ResponseHandler.error(res, '获取可复用检验项目失败', 'SERVER_ERROR', 500, error);
    }
  }

  // 创建可复用的检验标准项目
  async createReusableItem(req, res) {
    try {
      const { item_name, standard, type, is_critical } = req.body;

      // 验证必填字段
      if (!item_name || !standard || !type) {
        return ResponseHandler.error(
          res,
          '检验项目名称、检验标准和检验类型不能为空',
          'BAD_REQUEST',
          400
        );
      }

      // 检查是否已存在相同的检验项目
      const existingItem = await db.InspectionItem.findOne({
        where: {
          item_name,
          standard,
          type,
        },
      });

      if (existingItem) {
        return ResponseHandler.success(res, existingItem, '该检验标准已存在');
      }

      // 创建新的检验项目
      const newItem = await db.InspectionItem.create({
        item_name,
        standard,
        type,
        is_critical: is_critical || false,
        dimension_value: req.body.dimension_value,
        tolerance_upper: req.body.tolerance_upper,
        tolerance_lower: req.body.tolerance_lower,
      });

      ResponseHandler.success(res, newItem, '检验标准创建成功');
    } catch (error) {
      logger.error('创建检验标准失败:', error);
      ResponseHandler.error(res, '创建检验标准失败', 'SERVER_ERROR', 500, error);
    }
  }
}

module.exports = new InspectionTemplateController();
