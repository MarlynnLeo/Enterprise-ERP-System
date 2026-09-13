const Precision = require('./precision');

// 物料需求和领料校验统一保留 6 位小数，去除浮点计算尾差。
// 只在输出、校验边界舍入，BOM 展开的中间计算保留原有精度。
const QUANTITY_DECIMAL_PLACES = 6;

const roundQuantity = (value) => Precision.round(value, QUANTITY_DECIMAL_PLACES);

module.exports = { roundQuantity };
