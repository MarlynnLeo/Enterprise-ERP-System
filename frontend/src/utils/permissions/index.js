/**
 * 菜单权限数据 - 按模块拆分后的汇总入口
 * 从各子模块导入并合并所有菜单权限配置
 */

import { dashboardPerms } from './dashboardPerms';
import { productionPerms } from './productionPerms';
import { basedataPerms } from './basedataPerms';
import { inventoryPerms } from './inventoryPerms';
import { purchasePerms } from './purchasePerms';
import { salesPerms } from './salesPerms';
import { financePerms } from './financePerms';
import { qualityPerms } from './qualityPerms';
import { systemPerms } from './systemPerms';
import { overviewPerms } from './overviewPerms';
import { equipmentPerms } from './equipmentPerms';
import { hrPerms } from './hrPerms';

export const baseMenuPermissions = [
  ...dashboardPerms,
  ...productionPerms,
  ...basedataPerms,
  ...inventoryPerms,
  ...purchasePerms,
  ...salesPerms,
  ...financePerms,
  ...qualityPerms,
  ...systemPerms,
  ...overviewPerms,
  ...equipmentPerms,
  ...hrPerms,
];

export default baseMenuPermissions;
