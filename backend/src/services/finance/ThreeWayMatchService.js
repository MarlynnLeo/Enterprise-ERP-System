/**
 * 采购三单匹配（PO – 收货 – 供应商发票金额）
 * MVP：按物料汇总数量/金额比对，容差内 matched，否则 variance。
 */

const db = require('../../config/db');
const CodeGeneratorService = require('../business/CodeGeneratorService');
const SystemConfigService = require('../system/SystemConfigService');
const { logger } = require('../../utils/logger');
const { roundMoney } = require('../../utils/money');

function money(n) {
  return roundMoney(n || 0);
}

class ThreeWayMatchService {
  static async getTolerances() {
    const qtyPct = Number(
      (await SystemConfigService.get('ap_match_qty_tolerance_pct', 0.02)) || 0.02
    );
    const amountTol = Number(
      (await SystemConfigService.get('ap_match_amount_tolerance', 1)) || 1
    );
    return {
      qtyTolerancePct: Number.isFinite(qtyPct) ? qtyPct : 0.02,
      amountTolerance: Number.isFinite(amountTol) ? amountTol : 1,
    };
  }

  static async isMatchRequired() {
    return (await SystemConfigService.get('ap_three_way_match_required', false)) === true
      || (await SystemConfigService.get('ap_three_way_match_required', 'false')) === 'true';
  }

  /**
   * 从收货单创建匹配草稿（引用 PO 数量价 + 收货合格量）
   */
  static async createFromReceipt(receiptId, options = {}) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [receipts] = await connection.execute(
        `SELECT pr.*, s.name AS supplier_name
         FROM purchase_receipts pr
         LEFT JOIN suppliers s ON pr.supplier_id = s.id
         WHERE pr.id = ? AND pr.deleted_at IS NULL
         FOR UPDATE`,
        [receiptId]
      );
      if (!receipts.length) throw new Error('采购入库单不存在');
      const receipt = receipts[0];

      const [items] = await connection.execute(
        `SELECT pri.*, poi.price AS po_price, poi.quantity AS po_qty
         FROM purchase_receipt_items pri
         LEFT JOIN purchase_order_items poi
           ON poi.order_id = ? AND poi.material_id = pri.material_id
         WHERE pri.receipt_id = ?`,
        [receipt.order_id, receiptId]
      );
      if (!items.length) throw new Error('入库单无明细');

      const tol = await this.getTolerances();
      let matchNo;
      try {
        matchNo = await CodeGeneratorService.nextCode('ap_match', connection);
      } catch {
        matchNo = `APM${Date.now()}`;
      }

      const lines = items.map((it) => {
        const poQty = Number(it.po_qty || it.ordered_quantity || 0);
        const poPrice = Number(it.po_price || it.price || 0);
        const recQty = Number(it.qualified_quantity || it.received_quantity || it.quantity || 0);
        const recPrice = Number(it.price || poPrice || 0);
        // 发票侧默认按收货填，后续可改
        const invQty = recQty;
        const invPrice = recPrice;
        const qtyVar = invQty - recQty;
        const amtVar = money(invQty * invPrice - recQty * recPrice);
        const qtyOk =
          Math.abs(qtyVar) <= Math.max(Math.abs(recQty) * tol.qtyTolerancePct, 0.0001);
        const amtOk = Math.abs(amtVar) <= tol.amountTolerance;
        return {
          material_id: it.material_id,
          material_code: it.material_code,
          material_name: it.material_name,
          po_qty: poQty,
          po_price: poPrice,
          receipt_qty: recQty,
          receipt_price: recPrice,
          invoice_qty: invQty,
          invoice_price: invPrice,
          qty_variance: qtyVar,
          amount_variance: amtVar,
          within_tolerance: qtyOk && amtOk,
        };
      });

      const poAmount = money(lines.reduce((s, l) => s + l.po_qty * l.po_price, 0));
      const receiptAmount = money(lines.reduce((s, l) => s + l.receipt_qty * l.receipt_price, 0));
      const invoiceAmount = money(lines.reduce((s, l) => s + l.invoice_qty * l.invoice_price, 0));
      const qtyVariance = lines.reduce((s, l) => s + Number(l.qty_variance || 0), 0);
      const amountVariance = money(invoiceAmount - receiptAmount);
      const allOk = lines.every((l) => l.within_tolerance);
      const status = allOk ? 'matched' : 'variance';
      const matchResult = allOk ? 'within_tolerance' : 'over_tolerance';

      const [ins] = await connection.execute(
        `INSERT INTO ap_match_headers
          (match_no, supplier_id, purchase_order_id, purchase_receipt_id,
           supplier_invoice_number, match_date, po_amount, receipt_amount, invoice_amount,
           qty_variance, amount_variance, qty_tolerance_pct, amount_tolerance,
           status, match_result, remark, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          matchNo,
          receipt.supplier_id,
          receipt.order_id,
          receipt.id,
          options.supplierInvoiceNumber || null,
          poAmount,
          receiptAmount,
          invoiceAmount,
          qtyVariance,
          amountVariance,
          tol.qtyTolerancePct,
          tol.amountTolerance,
          status,
          matchResult,
          options.remark || `三单匹配 - 入库 ${receipt.receipt_no}`,
          options.userId || null,
        ]
      );
      const matchId = ins.insertId;

      for (const line of lines) {
        await connection.execute(
          `INSERT INTO ap_match_items
            (match_id, material_id, material_code, material_name,
             po_qty, po_price, receipt_qty, receipt_price,
             invoice_qty, invoice_price, qty_variance, amount_variance,
             within_tolerance, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            matchId,
            line.material_id,
            line.material_code,
            line.material_name,
            line.po_qty,
            line.po_price,
            line.receipt_qty,
            line.receipt_price,
            line.invoice_qty,
            line.invoice_price,
            line.qty_variance,
            line.amount_variance,
            line.within_tolerance ? 1 : 0,
          ]
        );
      }

      await connection.commit();
      return this.getById(matchId);
    } catch (e) {
      await connection.rollback();
      logger.error('[ThreeWayMatch] createFromReceipt failed', e);
      throw e;
    } finally {
      connection.release();
    }
  }

  static async getById(id) {
    const [headers] = await db.pool.execute(
      `SELECT h.*, s.name AS supplier_name, pr.receipt_no, po.order_no AS po_no
       FROM ap_match_headers h
       LEFT JOIN suppliers s ON h.supplier_id = s.id
       LEFT JOIN purchase_receipts pr ON h.purchase_receipt_id = pr.id
       LEFT JOIN purchase_orders po ON h.purchase_order_id = po.id
       WHERE h.id = ?`,
      [id]
    );
    if (!headers.length) return null;
    const [items] = await db.pool.execute(
      `SELECT id, match_id, material_id, material_code, material_name,
              po_qty, po_price, receipt_qty, receipt_price,
              invoice_qty, invoice_price, qty_variance, amount_variance,
              within_tolerance, created_at, updated_at
       FROM ap_match_items WHERE match_id = ? ORDER BY id`,
      [id]
    );
    return { ...headers[0], items };
  }

  static async list(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const where = ['1=1'];
    const params = [];
    if (query.status) {
      where.push('h.status = ?');
      params.push(query.status);
    }
    if (query.supplierId) {
      where.push('h.supplier_id = ?');
      params.push(query.supplierId);
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await db.pool.execute(
      `SELECT COUNT(*) AS total FROM ap_match_headers h WHERE ${whereSql}`,
      params
    );
    const [list] = await db.pool.execute(
      `SELECT h.id, h.match_no, h.supplier_id, h.purchase_order_id, h.purchase_receipt_id,
              h.supplier_invoice_number, h.match_date, h.po_amount, h.receipt_amount, h.invoice_amount,
              h.qty_variance, h.amount_variance, h.status, h.match_result, h.remark, h.created_at,
              s.name AS supplier_name, pr.receipt_no
       FROM ap_match_headers h
       LEFT JOIN suppliers s ON h.supplier_id = s.id
       LEFT JOIN purchase_receipts pr ON h.purchase_receipt_id = pr.id
       WHERE ${whereSql}
       ORDER BY h.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );
    return { list, total: Number(total || 0), page, pageSize };
  }

  /**
   * 更新匹配单发票侧数量/单价（差异处理），重算容差与状态
   * @param {number} matchId
   * @param {Array<{id?:number, material_id?:number, invoice_qty:number, invoice_price:number}>} lines
   * @param {object} options
   */
  static async updateInvoiceLines(matchId, lines = [], options = {}) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new Error('请提供至少一行发票数量/单价');
    }
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [headers] = await connection.execute(
        `SELECT id, match_no, supplier_id, purchase_order_id, purchase_receipt_id,
                supplier_invoice_number, match_date, po_amount, receipt_amount, invoice_amount,
                qty_variance, amount_variance, qty_tolerance_pct, amount_tolerance,
                status, match_result, remark, created_by, created_at, updated_at
         FROM ap_match_headers WHERE id = ? FOR UPDATE`,
        [matchId]
      );
      if (!headers.length) throw new Error('匹配单不存在');
      const header = headers[0];
      if (header.status === 'cancelled') throw new Error('匹配单已取消，不能修改');
      if (header.status === 'confirmed') {
        throw new Error('匹配单已确认，不能修改发票量价；请先取消后重建');
      }

      const tol = {
        qtyTolerancePct: Number(header.qty_tolerance_pct) || 0.02,
        amountTolerance: Number(header.amount_tolerance) || 1,
      };

      const [items] = await connection.execute(
        `SELECT id, match_id, material_id, material_code, material_name,
                po_qty, po_price, receipt_qty, receipt_price,
                invoice_qty, invoice_price, qty_variance, amount_variance,
                within_tolerance, created_at, updated_at
         FROM ap_match_items WHERE match_id = ? FOR UPDATE`,
        [matchId]
      );
      if (!items.length) throw new Error('匹配单无明细');

      const byId = new Map(items.map((it) => [Number(it.id), it]));
      const byMat = new Map(items.map((it) => [Number(it.material_id), it]));

      for (const line of lines) {
        let target = null;
        if (line.id != null) target = byId.get(Number(line.id));
        if (!target && line.material_id != null) target = byMat.get(Number(line.material_id));
        if (!target) {
          throw new Error(`找不到匹配明细 id=${line.id} material=${line.material_id}`);
        }
        const invQty = Number(line.invoice_qty);
        const invPrice = Number(line.invoice_price);
        if (!Number.isFinite(invQty) || invQty < 0) {
          throw new Error(`发票数量无效 material=${target.material_code || target.id}`);
        }
        if (!Number.isFinite(invPrice) || invPrice < 0) {
          throw new Error(`发票单价无效 material=${target.material_code || target.id}`);
        }
        const recQty = Number(target.receipt_qty || 0);
        const recPrice = Number(target.receipt_price || 0);
        const qtyVar = invQty - recQty;
        const amtVar = money(invQty * invPrice - recQty * recPrice);
        const qtyOk =
          Math.abs(qtyVar) <= Math.max(Math.abs(recQty) * tol.qtyTolerancePct, 0.0001);
        const amtOk = Math.abs(amtVar) <= tol.amountTolerance;
        await connection.execute(
          `UPDATE ap_match_items
           SET invoice_qty = ?, invoice_price = ?,
               qty_variance = ?, amount_variance = ?,
               within_tolerance = ?, updated_at = NOW()
           WHERE id = ?`,
          [invQty, invPrice, qtyVar, amtVar, qtyOk && amtOk ? 1 : 0, target.id]
        );
      }

      const [fresh] = await connection.execute(
        `SELECT id, match_id, material_id, material_code, material_name,
                po_qty, po_price, receipt_qty, receipt_price,
                invoice_qty, invoice_price, qty_variance, amount_variance,
                within_tolerance, created_at, updated_at
         FROM ap_match_items WHERE match_id = ?`,
        [matchId]
      );
      const receiptAmount = money(
        fresh.reduce((s, l) => s + Number(l.receipt_qty || 0) * Number(l.receipt_price || 0), 0)
      );
      const invoiceAmount = money(
        fresh.reduce((s, l) => s + Number(l.invoice_qty || 0) * Number(l.invoice_price || 0), 0)
      );
      const qtyVariance = fresh.reduce((s, l) => s + Number(l.qty_variance || 0), 0);
      const amountVariance = money(invoiceAmount - receiptAmount);
      const allOk = fresh.every((l) => Number(l.within_tolerance) === 1);
      const status = allOk ? 'matched' : 'variance';
      const matchResult = allOk ? 'within_tolerance' : 'over_tolerance';

      await connection.execute(
        `UPDATE ap_match_headers
         SET receipt_amount = ?, invoice_amount = ?,
             qty_variance = ?, amount_variance = ?,
             status = ?, match_result = ?,
             remark = CONCAT(COALESCE(remark,''), CASE WHEN COALESCE(remark,'')='' THEN '' ELSE ' | ' END, ?),
             updated_at = NOW()
         WHERE id = ?`,
        [
          receiptAmount,
          invoiceAmount,
          qtyVariance,
          amountVariance,
          status,
          matchResult,
          options.remark || `调整发票量价 by ${options.userId || 'user'}`,
          matchId,
        ]
      );

      await connection.commit();
      return this.getById(matchId);
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }

  /**
   * 取消匹配单（允许重做）
   */
  static async cancel(matchId, userId, reason = '') {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, match_no, supplier_id, purchase_order_id, purchase_receipt_id,
                status, match_result, remark
         FROM ap_match_headers WHERE id = ? FOR UPDATE`,
        [matchId]
      );
      if (!rows.length) throw new Error('匹配单不存在');
      if (rows[0].status === 'cancelled') {
        await connection.commit();
        return this.getById(matchId);
      }
      await connection.execute(
        `UPDATE ap_match_headers
         SET status = 'cancelled',
             remark = CONCAT(COALESCE(remark,''), CASE WHEN COALESCE(remark,'')='' THEN '' ELSE ' | ' END, ?),
             updated_at = NOW()
         WHERE id = ?`,
        [`取消 by ${userId || 'user'}${reason ? ': ' + reason : ''}`, matchId]
      );
      await connection.commit();
      return this.getById(matchId);
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }

  static async confirm(matchId, userId, options = {}) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, match_no, supplier_id, purchase_order_id, purchase_receipt_id,
                status, match_result, remark
         FROM ap_match_headers WHERE id = ? FOR UPDATE`,
        [matchId]
      );
      if (!rows.length) throw new Error('匹配单不存在');
      const row = rows[0];
      if (row.status === 'cancelled') throw new Error('匹配单已取消');
      if (row.status === 'confirmed') {
        await connection.commit();
        return this.getById(matchId);
      }
      const overTolerance =
        row.status === 'variance' || row.match_result === 'over_tolerance';
      if (overTolerance && !options.forceVariance) {
        throw new Error('差异超容差，不能确认匹配；请调整发票数量/单价，或使用强制确认（需权限）');
      }
      await connection.execute(
        `UPDATE ap_match_headers
         SET status = 'confirmed', confirmed_by = ?, confirmed_at = NOW(),
             remark = CASE WHEN ? = 1
               THEN CONCAT(COALESCE(remark,''), CASE WHEN COALESCE(remark,'')='' THEN '' ELSE ' | ' END, '强制确认超容差差异')
               ELSE remark END,
             updated_at = NOW()
         WHERE id = ?`,
        [userId || null, overTolerance && options.forceVariance ? 1 : 0, matchId]
      );
      await connection.commit();
      return this.getById(matchId);
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }

  /**
   * 收货单是否已有 confirmed 匹配（强制三单时用）
   */
  static async hasConfirmedMatchForReceipt(receiptId) {
    const [rows] = await db.pool.execute(
      `SELECT id FROM ap_match_headers
       WHERE purchase_receipt_id = ? AND status = 'confirmed'
       LIMIT 1`,
      [receiptId]
    );
    return rows.length > 0;
  }
}

module.exports = ThreeWayMatchService;
