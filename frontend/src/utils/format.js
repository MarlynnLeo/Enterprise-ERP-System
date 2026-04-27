/**
 * 通用格式化工具函数
 * @version 2.0.0
 * ✅ v2: 增加智能中文大数简写（万/亿），提升统计卡片可读性
 */

/**
 * 智能简写大数字（中文单位）
 * - |值| >= 1亿  → X.XX亿
 * - |值| >= 1万  → X.XX万
 * - 其他保持原样千分位
 * @param {number} val - 数值
 * @param {number} decimals - 小数位数
 * @returns {{ text: string, unit: string }} 格式化后的文本和单位
 */
const abbreviateNumber = (val, decimals = 2) => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';

    if (abs >= 1e8) {
        // 亿级
        return {
            text: sign + (abs / 1e8).toFixed(decimals),
            unit: '亿',
        };
    }
    if (abs >= 1e4) {
        // 万级
        return {
            text: sign + (abs / 1e4).toFixed(decimals),
            unit: '万',
        };
    }
    // 小数值保持千分位
    return {
        text: val.toLocaleString('zh-CN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }),
        unit: '',
    };
};

/**
 * 格式化货币金额（智能简写大数）
 * 示例：58885693.88 → ¥5,888.57万  |  123456789 → ¥1.23亿
 * @param {number|string} amount - 金额
 * @param {string} currency - 货币符号,默认¥
 * @param {number} decimals - 小数位数,默认2
 * @returns {string} 格式化后的金额字符串
 */
export const formatCurrency = (amount, currency = '¥', decimals = 2) => {
    if (amount === undefined || amount === null || amount === '') return `${currency}0.00`;
    const num = parseFloat(amount);
    if (isNaN(num)) return `${currency}0.00`;

    const { text, unit } = abbreviateNumber(num, decimals);
    return `${currency}${text}${unit}`;
};

/**
 * 格式化日期 (YYYY-MM-DD)
 * @param {string|Date} date - 日期
 * @returns {string} 格式化后的日期字符串
 */
export const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

/**
 * 格式化日期时间 (YYYY-MM-DD HH:mm:ss)
 * @param {string|Date} date - 日期时间
 * @returns {string} 格式化后的日期时间字符串
 */
export const formatDateTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 格式化数字（智能简写大数 + 千分位）
 * 示例：2616110.72 → 261.61万  |  370 → 370.00
 * @param {number|string} num - 数值
 * @param {number} decimals - 小数位数
 * @returns {string}
 */
export const formatNumber = (num, decimals = 2) => {
    if (num === undefined || num === null || num === '') return '0';
    const val = parseFloat(num);
    if (isNaN(val)) return '0';

    const { text, unit } = abbreviateNumber(val, decimals);
    return `${text}${unit}`;
};

/**
 * 格式化数字（仅千分位，不做大数简写）
 * 用于表格中需要精确数值的场景
 * @param {number|string} num - 数值
 * @param {number} decimals - 小数位数
 * @returns {string}
 */
/**
 * 格式化金额（不带货币符号，千分位）
 * 用于表格中显示纯数字金额的场景
 * @param {number|string} amount - 金额
 * @param {number} decimals - 小数位数,默认2
 * @returns {string} 格式化后的金额字符串，空值返回 '-'
 */
export const formatAmount = (amount, decimals = 2) => {
    if (amount === undefined || amount === null || amount === '') return '-';
    const num = parseFloat(amount);
    if (isNaN(num)) return '-';

    return num.toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

export const formatNumberRaw = (num, decimals = 2) => {
    if (num === undefined || num === null || num === '') return '0';
    const val = parseFloat(num);
    if (isNaN(val)) return '0';

    return val.toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};
