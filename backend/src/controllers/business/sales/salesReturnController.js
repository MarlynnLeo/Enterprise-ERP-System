/**
 * salesController.js
 * @description 鎺у埗鍣ㄦ枃浠? * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

// 状态常量
const STATUS = {
  SALES_ORDER: {
    DRAFT: 'draft',
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    READY_TO_SHIP: 'ready_to_ship',
    IN_PRODUCTION: 'in_production',
    IN_PROCUREMENT: 'in_procurement',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  OUTBOUND: businessConfig.status.outbound,
  SALES_RETURN: {
    DRAFT: 'draft',
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  EXCHANGE: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

// 绉婚櫎浜嗗簾寮冪殑 ensureSalesExchangeTablesExist, createSalesExchangeTablesDirectly, 鍜?updateSalesExchangeTableStructure
// 浣跨敤缁熶竴鐨勭紪鍙风敓鎴愭湇鍔?- 鏇夸唬鍘?generateTransactionNo 鍑芥暟
async function generateTransactionNo(connection) {
  return await CodeGenerators.generateTransactionCode(connection);
}

// Import the connection pool from db
// 娉ㄦ剰: 鏀瑰悕涓?connectionPool 閬垮厤涓庡嚱鏁板唴灞€閮ㄥ彉閲?connection 浜х敓閬斀
const connectionPool = db.pool;

// 统一的连接管理函数
const getConnection = async () => {
  return await connectionPool.getConnection();
};

// 甯︿簨鍔＄殑杩炴帴绠＄悊鍑芥暟
const getConnectionWithTransaction = async () => {
  const conn = await connectionPool.getConnection();
  await conn.beginTransaction();
  return conn;
};

// 缁熶竴鐨勯攢鍞鍗曠紪鍙风敓鎴愬嚱鏁?- 鏇夸唬鎵€鏈夐噸澶嶇殑鐢熸垚鍑芥暟
const generateSalesOrderNo = async (connection) => {
  return CodeGenerators.generateSalesOrderCode(connection);
};

// 淇濇寔鍚戝悗鍏煎鐨勫埆鍚嶅嚱鏁?const generateOrderNo = generateSalesOrderNo;

// 娣诲姞鏂扮殑鎺у埗鍣ㄦ柟娉?
exports.getSalesReturns = async (req, res) => {
  let conn;
  try {
    const { page = 1, pageSize = 10, search, startDate, endDate, status } = req.query;
    const offset = (page - 1) * pageSize;

    conn = await getConnection();

    // 鏋勫缓鏌ヨ鏉′欢
    let whereClause = '';
    const queryParams = [];

    if (search) {
      whereClause += ' AND (sr.return_no LIKE ? OR c.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      whereClause += ' AND sr.return_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND sr.return_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      whereClause += ' AND sr.status = ?';
      queryParams.push(status);
    }

    // 鏌ヨ鎬绘暟
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1 = 1 ${whereClause}
      `;

    const [countResult] = await conn.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 鏌ヨ鏁版嵁
    // 娉ㄦ剰锛歀IMIT 鍜?OFFSET 涓嶈兘浣跨敤鍙傛暟缁戝畾锛屽繀椤荤洿鎺ュ祵鍏?SQL
    const actualPageSize = parseInt(pageSize);
    const actualOffset = parseInt(offset);
    const query = `
      SELECT sr.*, c.name AS customer_name, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1 = 1 ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT ${actualPageSize} OFFSET ${actualOffset}
      `;

    const [results] = await conn.query(query, queryParams);

    // 获取状态明细
    for (let i = 0; i < results.length; i++) {
      const returnItem = results[i];

      // 淇濈暀鑻辨枃鐘舵€?key锛堜笌绯荤粺鍏朵粬妯″潡涓€鑷达級锛屾坊鍔犱腑鏂囨爣绛句緵鍓嶇灞曠ず
      const statusLabelMap = {
        draft: '鑽夌',
        pending: '',
        approved: '',
        completed: '',
        rejected: '',
      };
      results[i].status_label = statusLabelMap[returnItem.status] || returnItem.status;

      const detailsQuery = `
      SELECT
      sri.*,
        m.code as material_code,
        m.code as productCode,
        m.name as material_name,
        m.name as productName,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(soi.unit_price, m.price, 0) as unit_price,
        ROUND(sri.quantity * COALESCE(soi.unit_price, m.price, 0), 2) as amount
        FROM sales_return_items sri
        LEFT JOIN materials m ON sri.product_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN sales_order_items soi ON soi.order_id = ? AND soi.material_id = sri.product_id
        WHERE sri.return_id = ?
        `;

      const [detailsResults] = await conn.query(detailsQuery, [returnItem.order_id, returnItem.id]);
      results[i].items = detailsResults;

      // 汇总退货总额
      results[i].total_amount = detailsResults.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    }

    // 缁熻涓嶅悓鐘舵€佺殑鏁伴噺
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM sales_returns
      GROUP BY status
        `;

    const [statusCounts] = await conn.query(statusQuery);

    // 格式化状态数据
    const statusStats = {
      total: total,
      draftCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      completedCount: 0,
      rejectedCount: 0,
    };

    statusCounts.forEach((item) => {
      if (item.status === STATUS.SALES_RETURN.DRAFT) statusStats.draftCount = item.count;
      if (item.status === STATUS.SALES_RETURN.PENDING) statusStats.pendingCount = item.count;
      if (item.status === STATUS.SALES_RETURN.APPROVED) statusStats.approvedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.COMPLETED) statusStats.completedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.REJECTED) statusStats.rejectedCount = item.count;
    });

    res.json({
      items: results,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      statusStats,
    });
  } catch (error) {
    logger.error('鑾峰彇閿€鍞€€璐у崟鍒楄〃澶辫触:', error);
    res.status(500).json({ error: '鑾峰彇閿€鍞€€璐у崟鍒楄〃澶辫触' });
  } finally {
    if (conn) conn.release();
  }
};


exports.getSalesReturnById = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await getConnection();

    // 查询退货单主信息
    const query = `
      SELECT sr.*, c.name as customer_name, c.contact_person, c.contact_phone, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE sr.id = ?
        `;

    const [returnResults] = await conn.query(query, [id]);

    if (returnResults.length === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const returnData = returnResults[0];

    // 鏌ヨ閫€璐у崟鏄庣粏
    const detailsQuery = `
      SELECT
      sri.*,
        m.code as material_code,
        m.code as productCode,
        m.name as material_name,
        m.name as productName,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(soi.unit_price, m.price, 0) as unit_price,
        ROUND(sri.quantity * COALESCE(soi.unit_price, m.price, 0), 2) as amount
      FROM sales_return_items sri
      LEFT JOIN materials m ON sri.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN sales_order_items soi ON soi.order_id = ? AND soi.material_id = sri.product_id
      WHERE sri.return_id = ?
        `;

    const [detailsResults] = await conn.query(detailsQuery, [returnData.order_id, id]);

    // 淇濈暀鑻辨枃鐘舵€?key锛屾坊鍔犱腑鏂囨爣绛句緵鍓嶇灞曠ず
    const statusLabelMap = {
      draft: '鑽夌',
      pending: '',
      approved: '',
      completed: '',
      rejected: '',
    };
    returnData.status_label = statusLabelMap[returnData.status] || returnData.status;

    // 缁勫悎缁撴灉
    returnData.items = detailsResults;
    returnData.total_amount = detailsResults.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

    res.json(returnData);
  } catch (error) {
    logger.error('鑾峰彇閿€鍞€€璐у崟璇︽儏澶辫触:', error);
    res.status(500).json({ error: '鑾峰彇閿€鍞€€璐у崟璇︽儏澶辫触' });
  } finally {
    if (conn) conn.release();
  }
};


exports.createSalesReturn = async (req, res) => {
  let connection;
  try {
    const {
      return_date,
      order_id,
      outbound_id,
      outbound_no,
      order_no,
      customer_name,
      return_reason,
      status,
      remarks,
      items,
    } = req.body;

    // 楠岃瘉蹇呰鍙傛暟锛堟敮鎸佸熀浜庡嚭搴撳崟鎴栬鍗曠殑閫€璐э級
    if (!return_date || !return_reason) {
      return res.status(400).json({ error: 'Data not found' });
    }

    if (!outbound_id && !order_id) {
      return res.status(400).json({ error: '蹇呴』鎸囧畾鍑哄簱鍗旾D鎴栬鍗旾D' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Data not found' });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // 鐢熸垚閫€璐у崟鍙? RT + 骞存湀鏃?+ 3浣嶅簭鍙?
     date = new Date();
    const dateStr =
      date.getFullYear() +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      ('0' + date.getDate()).slice(-2);

    // 鏌ヨ褰撳ぉ鏈€澶у簭鍙?
     [seqResult] = await connection.query(
      'SELECT MAX(SUBSTRING(return_no, 11)) as max_seq FROM sales_returns WHERE return_no LIKE ?',
      [`RT${dateStr}%`]
    );

    const seq = seqResult[0].max_seq ? parseInt(seqResult[0].max_seq) + 1 : 1;
    const returnNo = `RT${dateStr}${seq.toString().padStart(3, '0')} `;

    // 濡傛灉鏄熀浜庡嚭搴撳崟鐨勯€€璐э紝闇€瑕佽幏鍙栬鍗曚俊鎭?
     finalOrderId = order_id;
    if (outbound_id && !order_id) {
      const [outboundResult] = await connection.query(
        'SELECT order_id FROM sales_outbound WHERE id = ?',
        [outbound_id]
      );
      if (outboundResult.length > 0) {
        finalOrderId = outboundResult[0].order_id;
      }
    }

    // 銆愭柊澧炪€戣秴棰濋€€璐ч槻鑼冩満鍒讹紝涓ユ牸鏍￠獙绱閫€璐ф暟閲忎笉寰楄秴杩囧師璁㈠崟璐拱鏁伴噺
    if (finalOrderId && items && items.length > 0) {
      for (const item of items) {
        const productId = item.product_id;
        const returnQty = parseFloat(item.quantity) || 0;

        // 鑾峰彇璁㈠崟鍘熷璐拱鏁伴噺
        const [orderItemResult] = await connection.query(
          'SELECT quantity FROM sales_order_items WHERE order_id = ? AND material_id = ?',
          [finalOrderId, productId]
        );

        if (orderItemResult.length === 0) {
          await connection.rollback();
          return res.status(400).json({ error: 'Data not found' });
        }

        const maxOrderQty = parseFloat(orderItemResult[0].quantity) || 0;

        // 姹囨€昏璁㈠崟涓嬫鐗╂枡鐨勬墍鏈夊巻鍙叉湁鏁堥€€璐ц褰曪紙鎺掗櫎宸茶鎷︽埅鍜屼綔搴熺殑璁板綍锛?
 [historicalReturn] = await connection.query(
          `SELECT SUM(sri.quantity) as total_returned
           FROM sales_return_items sri
           JOIN sales_returns sr ON sri.return_id = sr.id
           WHERE sr.order_id = ? AND sri.product_id = ? AND sr.status NOT IN ('rejected', 'cancelled')`,
          [finalOrderId, productId]
        );

        const alreadyReturnedQty = parseFloat(historicalReturn[0].total_returned) || 0;
        const maxReturnableQty = Math.max(0, maxOrderQty - alreadyReturnedQty);

        if (returnQty > maxReturnableQty) {
          await connection.rollback();
          return res.status(400).json({ error: `閫€璐ф暟閲忚秴闄愰樆姝紒鍘熻鍗曟€昏喘浠舵暟锛?{maxOrderQty}锛屽巻鍙插凡閫€绱浠舵暟锛?{alreadyReturnedQty}銆傛湰娆℃偍鏈€澶氬彧鑳界敵璇烽€€鍥炰綑鏁帮細${maxReturnableQty}浠躲` });
        }
      }
    }

    // 鎻掑叆閫€璐у崟涓昏〃
    const insertQuery = `
      INSERT INTO sales_returns(
          return_no, order_id, return_date, return_reason,
          status, remarks, created_by, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, NOW())
          `;

    const created_by = await getCurrentUserName(req);

    const [result] = await connection.query(insertQuery, [
      returnNo,
      finalOrderId,
      return_date,
      return_reason,
      status || 'pending',
      remarks,
      created_by,
    ]);

    const returnId = result.insertId;

    // 鎻掑叆鏄庣粏琛?
    if (items && items.length > 0) {
      const detailQuery = `
        INSERT INTO sales_return_items(
            return_id, product_id, quantity, reason
          ) VALUES ?
            `;

      const detailValues = items.map((item) => [
        returnId,
        item.product_id,
        item.quantity,
        item.reason || '',
      ]);

      await connection.query(detailQuery, [detailValues]);
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '閿€鍞€€璐у崟鍒涘缓鎴愬姛',
        id: returnId,
        return_no: returnNo,
      },
      '鍒涘缓鎴愬姛',
      201
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('鍒涘缓閿€鍞€€璐у崟澶辫触:', error);
    res.status(500).json({ error: '鍒涘缓閿€鍞€€璐у崟澶辫触' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


exports.updateSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { return_date, order_id, return_reason, status, remarks, items } = req.body;

    connection = await getConnection();
    await connection.beginTransaction();

    // 濡傛灉鏄熀浜庡嚭搴撳崟鐨勯€€璐э紝闇€瑕佽幏鍙栬鍗曚俊鎭?
     finalOrderId = order_id;
    // 濡傛灉鍓嶇鍙紶浜?outbound_id 娌℃湁 order_id锛堣櫧鐒跺墠绔湁鎺у埗锛屼絾涔熼槻鑼冧竴涓嬶級
    // 鎴栬€呯洿鎺ヤ娇鐢ㄥ師鏁版嵁搴撹褰曠殑 order_id 

    // 銆愭柊澧炪€戣秴棰濋€€璐ч槻鑼冩満鍒?
     if (finalOrderId && items && items.length > 0) {
      for (const item of items) {
        const productId = item.product_id;
        const returnQty = parseFloat(item.quantity) || 0;

        // 鑾峰彇璁㈠崟鍘熷璐拱鏁伴噺
        const [orderItemResult] = await connection.query(
          'SELECT quantity FROM sales_order_items WHERE order_id = ? AND material_id = ?',
          [finalOrderId, productId]
        );

        if (orderItemResult.length === 0) {
          await connection.rollback();
          return res.status(400).json({ error: '鏁版嵁寮傚父锛氬師璁㈠崟涓笉瀛樺湪鎮ㄨ淇敼鐨勪骇鍝侊紒' });
        }

        const maxOrderQty = parseFloat(orderItemResult[0].quantity) || 0;

        // 姹囨€昏璁㈠崟涓嬫鐗╂枡鐨勬墍鏈夊巻鍙叉湁鏁堥€€璐ц褰曪紙鎺掗櫎褰撳墠姝ｅ湪淇敼鐨勯€€璐у崟 itself 浠ュ強浣滃簾鍗曪級
        const [historicalReturn] = await connection.query(
          `SELECT SUM(sri.quantity) as total_returned
           FROM sales_return_items sri
           JOIN sales_returns sr ON sri.return_id = sr.id
           WHERE sr.order_id = ? AND sri.product_id = ? 
             AND sr.id != ? 
             AND sr.status NOT IN ('rejected', 'cancelled')`,
          [finalOrderId, productId, id]
        );

        const alreadyReturnedQty = parseFloat(historicalReturn[0].total_returned) || 0;
        const maxReturnableQty = Math.max(0, maxOrderQty - alreadyReturnedQty);

        if (returnQty > maxReturnableQty) {
          await connection.rollback();
          return res.status(400).json({ error: `淇敼鏁伴噺瓒呴檺闃绘锛佸師璁㈠崟鎬昏喘浠舵暟锛?{maxOrderQty}锛岄櫎褰撳墠鍗曞鍘嗗彶宸查€€浠舵暟锛?{alreadyReturnedQty}銆傛湰娆℃偍鏈€澶氬彧鑳藉皢浠舵暟淇敼涓猴細${maxReturnableQty}浠躲` });
        }
      }
    }

    // 鏇存柊涓昏〃
    const updateQuery = `
      UPDATE sales_returns SET
      return_date = ?,
        order_id = ?,
        return_reason = ?,
        status = ?,
        remarks = ?,
        updated_at = NOW()
      WHERE id = ?
        `;

    await connection.query(updateQuery, [
      return_date,
      order_id,
      return_reason,
      status,
      remarks,
      id,
    ]);

    // 鍒犻櫎鍘熸湁鏄庣粏
    await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);

    // 鎻掑叆鏂版槑缁?
    if (items && items.length > 0) {
      const detailQuery = `
        INSERT INTO sales_return_items(
          return_id, product_id, quantity, reason
        ) VALUES ?
          `;

      const detailValues = items.map((item) => [
        id,
        item.product_id,
        item.quantity,
        item.reason || '',
      ]);

      await connection.query(detailQuery, [detailValues]);
    }

    // 濡傛灉鐘舵€佸彉涓哄凡瀹屾垚锛屽鐞嗗簱瀛樺叆搴?
     if (status === STATUS.SALES_RETURN.COMPLETED && items && items.length > 0) {
      for (const item of items) {
        // 鍏煎涓嶅悓鐨勫瓧娈靛悕
        const productId = item.product_id || item.productId || item.material_id;
        const quantity = item.quantity || item.return_quantity;

        if (!productId || !quantity) {
          continue;
        }

        // 鑾峰彇鐗╂枡淇℃伅銆佸崟浣嶅拰榛樿浠撳簱
        const [materialResults] = await connection.query(
          `
          SELECT m.code, m.name, m.unit_id, m.location_id, m.location_name,
        u.name as unit_name, loc.name as warehouse_name
          FROM materials m
          LEFT JOIN units u ON m.unit_id = u.id
          LEFT JOIN locations loc ON m.location_id = loc.id
          WHERE m.id = ?
        `,
          [productId]
        );

        if (materialResults.length > 0) {
          const material = materialResults[0];

          // 浣跨敤鐗╂枡鐨勯粯璁や粨搴擄紝濡傛灉娌℃湁鍒欏己鍒舵姏閿欑粓姝笟鍔?
 warehouseId = material.location_id;
          if (!warehouseId) {
            throw new Error(`鐗╂枡 ${productId} 鏈厤缃粯璁や粨搴擄紝璇峰湪鐗╂枡璧勬枡涓缃悗鍐嶆搷浣溿`);
          }
          const warehouseName = material.warehouse_name || material.location_name || '';

          // 鑾峰彇褰撳墠搴撳瓨锛堜娇鐢ㄥ崟琛ㄦ灦鏋勶紝鍙傝€冮噰璐€€璐ч€昏緫锛?
 [stockResult] = await connection.query(
            `
            SELECT COALESCE(SUM(quantity), 0) as current_quantity
            FROM inventory_ledger
            WHERE material_id = ? AND location_id = ? FOR UPDATE
        `,
            [productId, warehouseId]
          );

          const beforeQuantity = parseFloat(stockResult[0]?.current_quantity || 0);
          const changeQuantity = parseFloat(quantity);
          const afterQuantity = beforeQuantity + changeQuantity;

          // 鑾峰彇鐗╂枡鍗曚綅ID
          const unitId = material.unit_id;

          // 鑾峰彇褰撳墠閫€璐у崟鐨勬纭紪鍙?
 [returnInfo] = await connection.query(
            'SELECT return_no FROM sales_returns WHERE id = ?',
            [id]
          );
          const actualReturnNo = returnInfo[0]?.return_no || `RT${id} `;

          // 馃敟 浣跨敤缁熶竴鐨?InventoryService 鏇存柊搴撳瓨锛堣嚜鍔ㄥ悓姝?batch_inventory锛?
 InventoryService = require('../../../services/InventoryService');
          await InventoryService.updateStock(
            {
              materialId: productId,
              locationId: warehouseId,
              quantity: changeQuantity, // 閫€璐т负姝ｆ暟锛堝叆搴擄級
              transactionType: 'sales_return',
              referenceNo: actualReturnNo,
              referenceType: 'sales_return',
              operator: 'system',
              remark: `閿€鍞€€璐у叆搴擄細${material.code} ${material.name} `,
              unitId: material.unit_id,
              batchNumber: null,
            },
            connection
          );

          logger.info(`鉁?閿€鍞€€璐у叆搴撳畬鎴愶紙缁熶竴鏈嶅姟锛? 鐗╂枡${productId}, 鏁伴噺${changeQuantity} `);
        }
      }

      // 閫€璐у崟搴撳瓨澶勭悊瀹屾垚

      // 鑾峰彇閫€璐у崟淇℃伅鐢ㄤ簬鐢熸垚绾㈠瓧鍙戠エ
      const [returnInfo] = await connection.query('SELECT * FROM sales_returns WHERE id = ?', [id]);

      // 鍦ㄤ簨鍔℃彁浜ゅ悗寮傛鐢熸垚绾㈠瓧鍙戠エ
      if (returnInfo.length > 0) {
        const salesReturn = returnInfo[0];
        setImmediate(async () => {
          try {
            const FinanceIntegrationService = require('../../../services/external/FinanceIntegrationService');
            await FinanceIntegrationService.generateARCreditNoteFromSalesReturn(salesReturn);
            logger.info(`鉁?閿€鍞€€璐х孩瀛楀彂绁ㄨ嚜鍔ㄧ敓鎴愭垚鍔?- 閫€璐у崟: ${salesReturn.return_no} `);
          } catch (financeError) {
            logger.warn(`鈿狅笍 閿€鍞€€璐х孩瀛楀彂绁ㄨ嚜鍔ㄧ敓鎴愬け璐ワ紙涓嶅奖鍝嶉€€璐э級: ${financeError.message} `);
          }
        });
      }
    }

    await connection.commit();

    res.json({
      message: '閿€鍞€€璐у崟鏇存柊鎴愬姛',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('鏇存柊閿€鍞€€璐у崟澶辫触:', error);
    res.status(500).json({ error: '鏇存柊閿€鍞€€璐у崟澶辫触' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 娣诲姞鍒犻櫎閫€璐у崟鍔熻兘

exports.deleteSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 鍒犻櫎鏄庣粏
    await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);

    // 鍒犻櫎涓昏〃
    await connection.query('DELETE FROM sales_returns WHERE id = ?', [id]);

    await connection.commit();

    res.json({
      message: '閿€鍞€€璐у崟鍒犻櫎鎴愬姛',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('鍒犻櫎閿€鍞€€璐у崟澶辫触:', error);
    res.status(500).json({ error: '鍒犻櫎閿€鍞€€璐у崟澶辫触' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Sales Exchange Controllers

