/**
 * swagger-definitions.js
 * @description 集中管理 Swagger 注解定义 — 不修改路由文件，独立维护
 * @date 2026-06-22
 *
 * 本文件被 swagger.js 自动扫描（apis 配置），提供核心路由的 OpenAPI 文档。
 * 后续新增接口文档时，只需在此文件中追加注解块即可。
 */

// ==================== 基础数据 ====================

/**
 * @swagger
 * tags:
 *   - name: 物料管理
 *     description: 物料基础数据 CRUD、导入导出
 *   - name: BOM管理
 *     description: 物料清单（Bill of Materials）管理
 *   - name: 客户管理
 *     description: 客户基础数据
 *   - name: 供应商管理
 *     description: 供应商基础数据
 *   - name: 库存管理
 *     description: 库存台账、出入库管理
 *   - name: 销售管理
 *     description: 销售订单、出库单、退换货
 *   - name: 生产管理
 *     description: 生产计划、生产任务、工序
 */

/**
 * @swagger
 * /base-data/materials:
 *   get:
 *     summary: 获取物料列表（分页）
 *     tags: [物料管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 搜索关键词（编码/名称/规格）
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *         description: 分类ID筛选
 *       - in: query
 *         name: status
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: 状态筛选（0=禁用, 1=启用）
 *     responses:
 *       200:
 *         description: 分页物料列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */

/**
 * @swagger
 * /base-data/materials/{id}:
 *   get:
 *     summary: 获取物料详情
 *     tags: [物料管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 物料详情
 *       404:
 *         description: 物料不存在
 *   put:
 *     summary: 更新物料
 *     tags: [物料管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               specs:
 *                 type: string
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除物料
 *     tags: [物料管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */

/**
 * @swagger
 * /base-data/materials/options:
 *   get:
 *     summary: 获取物料下拉选项
 *     tags: [物料管理]
 *     responses:
 *       200:
 *         description: 物料选项列表
 */

/**
 * @swagger
 * /base-data/materials/stats:
 *   get:
 *     summary: 获取物料统计信息
 *     tags: [物料管理]
 *     responses:
 *       200:
 *         description: 物料统计数据
 */

// ==================== BOM ====================

/**
 * @swagger
 * /base-data/boms:
 *   get:
 *     summary: 获取BOM列表
 *     tags: [BOM管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: BOM列表
 *   post:
 *     summary: 创建BOM
 *     tags: [BOM管理]
 *     responses:
 *       201:
 *         description: 创建成功
 */

/**
 * @swagger
 * /base-data/boms/{id}:
 *   get:
 *     summary: 获取BOM详情
 *     tags: [BOM管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: BOM详情
 *   put:
 *     summary: 更新BOM
 *     tags: [BOM管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除BOM
 *     tags: [BOM管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */

/**
 * @swagger
 * /base-data/boms/{id}/explode:
 *   get:
 *     summary: BOM展开（获取所有层级物料）
 *     tags: [BOM管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 展开后的物料树
 */

// ==================== 客户 ====================

/**
 * @swagger
 * /base-data/customers:
 *   get:
 *     summary: 获取客户列表
 *     tags: [客户管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 客户列表
 *   post:
 *     summary: 创建客户
 *     tags: [客户管理]
 *     responses:
 *       201:
 *         description: 创建成功
 */

/**
 * @swagger
 * /base-data/customers/{id}:
 *   get:
 *     summary: 获取客户详情
 *     tags: [客户管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 客户详情
 *   put:
 *     summary: 更新客户
 *     tags: [客户管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除客户
 *     tags: [客户管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */

// ==================== 供应商 ====================

/**
 * @swagger
 * /base-data/suppliers:
 *   get:
 *     summary: 获取供应商列表
 *     tags: [供应商管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 供应商列表
 *   post:
 *     summary: 创建供应商
 *     tags: [供应商管理]
 *     responses:
 *       201:
 *         description: 创建成功
 */

// ==================== 库存 ====================

/**
 * @swagger
 * /inventory/stock:
 *   get:
 *     summary: 获取库存台账
 *     tags: [库存管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *       - in: query
 *         name: warehouse_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 库存台账列表
 */

/**
 * @swagger
 * /inventory/inbound:
 *   get:
 *     summary: 获取入库单列表
 *     tags: [库存管理]
 *     responses:
 *       200:
 *         description: 入库单列表
 *   post:
 *     summary: 创建入库单
 *     tags: [库存管理]
 *     responses:
 *       201:
 *         description: 创建成功
 */

/**
 * @swagger
 * /inventory/outbound:
 *   get:
 *     summary: 获取出库单列表
 *     tags: [库存管理]
 *     responses:
 *       200:
 *         description: 出库单列表
 *   post:
 *     summary: 创建出库单
 *     tags: [库存管理]
 *     responses:
 *       201:
 *         description: 创建成功
 */

// ==================== 销售 ====================

/**
 * @swagger
 * /sales/orders:
 *   get:
 *     summary: 获取销售订单列表
 *     tags: [销售管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 销售订单列表
 *   post:
 *     summary: 创建销售订单
 *     tags: [销售管理]
 *     responses:
 *       201:
 *         description: 创建成功
 */

/**
 * @swagger
 * /sales/orders/{id}:
 *   get:
 *     summary: 获取销售订单详情
 *     tags: [销售管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 订单详情
 */

/**
 * @swagger
 * /sales/outbound:
 *   get:
 *     summary: 获取销售出库单列表
 *     tags: [销售管理]
 *     responses:
 *       200:
 *         description: 出库单列表
 */

// ==================== 生产 ====================

/**
 * @swagger
 * /production/tasks:
 *   get:
 *     summary: 获取生产任务列表
 *     tags: [生产管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, allocated, preparing, material_issued, in_progress, completed, cancelled]
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 生产任务列表（含工序和统计）
 *   post:
 *     summary: 创建生产任务
 *     tags: [生产管理]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_id, quantity]
 *             properties:
 *               plan_id:
 *                 type: integer
 *                 description: 关联的生产计划ID
 *               product_id:
 *                 type: integer
 *                 description: 产品ID
 *               quantity:
 *                 type: number
 *                 description: 生产数量
 *               start_date:
 *                 type: string
 *                 format: date
 *               expected_end_date:
 *                 type: string
 *                 format: date
 *               manager:
 *                 type: string
 *     responses:
 *       201:
 *         description: 创建成功
 */

/**
 * @swagger
 * /production/tasks/{id}:
 *   get:
 *     summary: 获取生产任务详情（含工序）
 *     tags: [生产管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 任务详情
 *       404:
 *         description: 任务不存在
 *   put:
 *     summary: 更新生产任务
 *     tags: [生产管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除生产任务
 *     tags: [生产管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */

/**
 * @swagger
 * /production/tasks/{id}/status:
 *   put:
 *     summary: 更新生产任务状态
 *     tags: [生产管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, allocated, preparing, material_issued, in_progress, completed, cancelled]
 *     responses:
 *       200:
 *         description: 状态更新成功
 */
