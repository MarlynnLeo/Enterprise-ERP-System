/**
 * 页面配置文件
 * @description 统一管理所有列表页面的配置
 * @date 2025-12-27
 * @version 1.0.0
 */

export const pageConfigs = {
  // ==================== 基础数据模块 ====================
  materials: {
    title: '物料管理',
    api: 'baseDataApi.getMaterials',
    searchPlaceholder: '搜索物料编码或名称',
    tags: [
      { label: '全部', value: 'all' },
      { label: '原材料', value: 'raw' },
      { label: '半成品', value: 'semi' },
      { label: '成品', value: 'finished' }
    ],
    stats: [
      { label: '总物料', field: 'total', icon: 'cube', iconClass: 'bg-blue' },
      { label: '低库存', field: 'lowStock', icon: 'cube', iconClass: 'bg-red' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      emoji: (item) => '📦',
      details: [
        { label: '规格', field: 'specs' },
        { label: '单位', field: 'unit_name' },
        { label: '分类', field: 'category_name' }
      ]
    },
    detailRoute: '/baseData/materials/:id'
  },

  customers: {
    title: '客户管理',
    api: 'baseDataApi.getCustomers',
    searchPlaceholder: '搜索客户名称或联系人',
    tags: [
      { label: '全部', value: 'all' },
      { label: '重点客户', value: 'vip' },
      { label: '普通客户', value: 'normal' }
    ],
    stats: [
      { label: '总客户', field: 'total', icon: 'user-group', iconClass: 'bg-blue' },
      { label: '活跃客户', field: 'active', icon: 'user-group', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'contact',
      emoji: (item) => '👤',
      details: [
        { label: '联系电话', field: 'phone' },
        { label: '地址', field: 'address' },
        { label: '信用等级', field: 'credit_level' }
      ]
    },
    detailRoute: '/baseData/customers/:id'
  },

  suppliers: {
    title: '供应商管理',
    api: 'baseDataApi.getSuppliers',
    searchPlaceholder: '搜索供应商名称或联系人',
    tags: [
      { label: '全部', value: 'all' },
      { label: '战略供应商', value: 'strategic' },
      { label: '普通供应商', value: 'normal' }
    ],
    stats: [
      { label: '总供应商', field: 'total', icon: 'office-building', iconClass: 'bg-blue' },
      { label: '合作中', field: 'active', icon: 'office-building', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'contact',
      emoji: (item) => '🏢',
      details: [
        { label: '联系电话', field: 'phone' },
        { label: '地址', field: 'address' },
        { label: '评级', field: 'rating' }
      ]
    },
    detailRoute: '/baseData/suppliers/:id'
  },

  // ==================== 生产模块 ====================
  productionPlans: {
    title: '生产计划',
    api: 'productionApi.getProductionPlans',
    searchPlaceholder: '搜索计划编号或产品名称',
    tags: [
      { label: '全部', value: 'all' },
      { label: '待开始', value: 'pending' },
      { label: '进行中', value: 'in_progress' },
      { label: '已完成', value: 'completed' }
    ],
    stats: [
      { label: '总计划', field: 'total', icon: 'clipboard-check', iconClass: 'bg-blue' },
      { label: '进行中', field: 'inProgress', icon: 'clipboard-check', iconClass: 'bg-yellow' },
      { label: '已完成', field: 'completed', icon: 'badge-check', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'product_name',
      subtitle: 'code',
      emoji: (item) => '📋',
      details: [
        { label: '计划数量', field: 'quantity', suffix: 'unit_name' },
        { label: '开始日期', field: 'start_date', format: 'date' },
        { label: '结束日期', field: 'end_date', format: 'date' }
      ],
      status: {
        field: 'status',
        map: {
          pending: { text: '待开始', class: 'status-pending' },
          in_progress: { text: '进行中', class: 'status-progress' },
          completed: { text: '已完成', class: 'status-completed' }
        }
      }
    },
    detailRoute: '/production/plans/:id'
  },

  productionTasks: {
    title: '生产任务',
    api: 'productionApi.getProductionTasks',
    searchPlaceholder: '搜索任务编号或产品名称',
    tags: [
      { label: '全部', value: 'all' },
      { label: '待开始', value: 'pending' },
      { label: '进行中', value: 'in_progress' },
      { label: '已完成', value: 'completed' }
    ],
    stats: [
      { label: '总任务', field: 'total', icon: 'clipboard-check', iconClass: 'bg-blue' },
      { label: '进行中', field: 'inProgress', icon: 'clipboard-check', iconClass: 'bg-yellow' },
      { label: '已完成', field: 'completed', icon: 'badge-check', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'product_name',
      subtitle: 'task_code',
      emoji: (item) => '⚙️',
      details: [
        { label: '任务数量', field: 'planned_quantity', suffix: 'unit_name' },
        { label: '关联计划', field: 'plan_name' },
        { label: '创建时间', field: 'created_at', format: 'datetime' }
      ],
      status: {
        field: 'status',
        map: {
          pending: { text: '待开始', class: 'status-pending' },
          in_progress: { text: '进行中', class: 'status-progress' },
          completed: { text: '已完成', class: 'status-completed' }
        }
      },
      progress: {
        field: 'completed_quantity',
        total: 'planned_quantity'
      }
    },
    detailRoute: '/production/tasks/:id'
  },

  // ==================== 库存模块 ====================
  inventory: {
    title: '库存管理',
    api: 'inventoryApi.getInventoryStock',
    searchPlaceholder: '搜索SKU或名称',
    tags: [
      { label: '全部商品', value: 'all' },
      { label: '低库存预警', value: 'low' }
    ],
    stats: [
      { label: '总 SKU', field: 'totalMaterials', icon: 'cube', iconClass: 'bg-blue' },
      { label: '需补货', field: 'lowStock', icon: 'cube', iconClass: 'bg-red', suffix: ' 项' }
    ],
    fields: {
      id: 'id',
      title: 'material_name',
      subtitle: 'material_code',
      emoji: (item) => {
        const name = item.material_name?.toLowerCase() || ''
        if (name.includes('电脑') || name.includes('笔记本')) return '💻'
        if (name.includes('手机')) return '📱'
        if (name.includes('耳机')) return '🎧'
        if (name.includes('键盘')) return '⌨️'
        if (name.includes('鼠标')) return '🖱️'
        return '📦'
      },
      details: [
        { label: '库存', field: 'quantity', suffix: 'unit_name' },
        { label: '库位', field: 'location_name' }
      ],
      progress: {
        field: 'quantity',
        total: 'max_stock',
        min: 'min_stock',
        calculate: (item) => {
          const qty = item.quantity || 0
          const min = item.min_stock || 0
          if (qty === 0) return { level: 'low', text: '无库存', percent: 0 }
          if (min && qty <= min)
            return { level: 'low', text: '急需补货', percent: Math.min((qty / min) * 100, 100) }
          if (min && qty <= min * 2)
            return {
              level: 'medium',
              text: '正常',
              percent: Math.min((qty / (min * 3)) * 100, 100)
            }
          return { level: 'good', text: '充足', percent: 85 }
        }
      }
    },
    detailRoute: '/inventory/stock/:id'
  },

  // ==================== 采购模块 ====================
  purchaseOrders: {
    title: '采购订单',
    api: 'purchaseApi.getPurchaseOrders',
    searchPlaceholder: '搜索订单编号或供应商',
    tags: [
      { label: '全部', value: 'all' },
      { label: '待审核', value: 'pending' },
      { label: '已审核', value: 'approved' },
      { label: '已完成', value: 'completed' }
    ],
    stats: [
      { label: '总订单', field: 'total', icon: 'shopping-cart', iconClass: 'bg-blue' },
      { label: '待审核', field: 'pending', icon: 'shopping-cart', iconClass: 'bg-yellow' },
      { label: '已完成', field: 'completed', icon: 'badge-check', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'supplier_name',
      subtitle: 'order_code',
      emoji: (item) => '🛒',
      details: [
        { label: '订单金额', field: 'total_amount', prefix: '¥' },
        { label: '订单日期', field: 'order_date', format: 'date' },
        { label: '预计到货', field: 'expected_date', format: 'date' }
      ],
      status: {
        field: 'status',
        map: {
          pending: { text: '待审核', class: 'status-pending' },
          approved: { text: '已审核', class: 'status-progress' },
          completed: { text: '已完成', class: 'status-completed' }
        }
      }
    },
    detailRoute: '/purchase/orders/:id'
  },

  // ==================== 销售模块 ====================
  salesOrders: {
    title: '销售订单',
    api: 'salesApi.getOrders',
    searchPlaceholder: '搜索订单编号或客户',
    tags: [
      { label: '全部', value: 'all' },
      { label: '待审核', value: 'pending' },
      { label: '已审核', value: 'approved' },
      { label: '已完成', value: 'completed' }
    ],
    stats: [
      { label: '总订单', field: 'total', icon: 'shopping-bag', iconClass: 'bg-blue' },
      { label: '待审核', field: 'pending', icon: 'shopping-bag', iconClass: 'bg-yellow' },
      { label: '已完成', field: 'completed', icon: 'badge-check', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'customer_name',
      subtitle: 'order_code',
      emoji: (item) => '🛍️',
      details: [
        { label: '订单金额', field: 'total_amount', prefix: '¥' },
        { label: '订单日期', field: 'order_date', format: 'date' },
        { label: '交货日期', field: 'delivery_date', format: 'date' }
      ],
      status: {
        field: 'status',
        map: {
          pending: { text: '待审核', class: 'status-pending' },
          approved: { text: '已审核', class: 'status-progress' },
          completed: { text: '已完成', class: 'status-completed' }
        }
      }
    },
    detailRoute: '/sales/orders/:id'
  },

  // ==================== 质量模块 ====================
  qualityInspections: {
    title: '质量检验',
    api: 'qualityApi.getInspections',
    searchPlaceholder: '搜索检验单号',
    tags: [
      { label: '全部', value: 'all' },
      { label: '待检验', value: 'pending' },
      { label: '已检验', value: 'completed' }
    ],
    stats: [
      { label: '总检验', field: 'total', icon: 'badge-check', iconClass: 'bg-blue' },
      { label: '合格', field: 'passed', icon: 'badge-check', iconClass: 'bg-green' },
      { label: '不合格', field: 'failed', icon: 'badge-check', iconClass: 'bg-red' }
    ],
    fields: {
      id: 'id',
      title: 'material_name',
      subtitle: 'inspection_code',
      emoji: (item) => '✅',
      details: [
        { label: '检验类型', field: 'type_name' },
        { label: '检验日期', field: 'inspection_date', format: 'date' },
        { label: '检验员', field: 'inspector' }
      ],
      status: {
        field: 'status',
        map: {
          pending: { text: '待检验', class: 'status-pending' },
          passed: { text: '合格', class: 'status-completed' },
          failed: { text: '不合格', class: 'status-cancelled' }
        }
      }
    },
    detailRoute: '/quality/inspections/:id'
  }
}
