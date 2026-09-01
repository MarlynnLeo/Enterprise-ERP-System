/**
 * 跨模块只读查找（下拉选项、名录、字典）的统一权限入口。
 *
 * 授权面：这些端点对任何已登录用户开放。
 *
 *   lookup:read 会在统一角色权限同步时下发给每个普通角色，
 *   因此它等价于「已登录即可读」。
 *   这是有意的产品取舍：选人、选部门、选往来单位这类下拉框
 *   在几乎所有业务表单里都要用，逐模块重复授权会让权限表爆炸。
 *
 *   代价是这些端点返回的字段就是全员可见的。新增端点挂到这里之前，
 *   请确认响应体里没有敏感字段（价格、成本、薪资、证件号等）；
 *   价格类字段另有 priceAccessControl 脱敏兜底，但不要依赖它。
 *   需要按岗位收紧的接口，请直接写具体权限码，不要复用本文件。
 *
 * 历史 dashboard 兼容入口已移除，避免一个首页权限隐式获得全员名录读取权。
 */

/** 显式查找权限码；由 migrations 注册并随 COMMON_PERMISSIONS 下发。 */
const LOOKUP_READ_PERMISSION = 'lookup:read';

const LOOKUP_READ_PERMISSIONS = Object.freeze([LOOKUP_READ_PERMISSION]);

module.exports = {
  LOOKUP_READ_PERMISSION,
  LOOKUP_READ_PERMISSIONS,
  USER_OPTION_PERMISSIONS: LOOKUP_READ_PERMISSIONS,
  DEPARTMENT_OPTION_PERMISSIONS: LOOKUP_READ_PERMISSIONS,
  FINANCE_BUSINESS_OPTION_PERMISSIONS: LOOKUP_READ_PERMISSIONS,
  SUPPLEMENT_REASON_PERMISSIONS: LOOKUP_READ_PERMISSIONS,
};
