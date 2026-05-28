<template>
  <div class="record-page">
    <NavBar :title="config.title" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="state">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else-if="record" class="content">
      <div class="hero">
        <div class="hero-icon">
          <SvgIcon :name="config.icon || 'description'" size="1.35rem" />
        </div>
        <div class="hero-main">
          <div class="hero-title">{{ valueOf(config.titleField) || '-' }}</div>
          <div class="hero-sub">{{ valueOf(config.subtitleField) || config.subtitle || '' }}</div>
        </div>
        <Tag v-if="statusText" :type="statusType">{{ statusText }}</Tag>
      </div>

      <CellGroup inset :title="config.groupTitle || '基础信息'">
        <Cell
          v-for="field in config.fields"
          :key="field.label"
          :title="field.label"
          :value="formatValue(field)"
        />
      </CellGroup>

      <CellGroup v-if="config.extraFields?.length" inset title="补充信息">
        <Cell
          v-for="field in config.extraFields"
          :key="field.label"
          :title="field.label"
          :label="formatValue(field)"
        />
      </CellGroup>
    </div>

    <Empty v-else description="记录不存在或已被删除" />
  </div>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Cell, CellGroup, Empty, Loading, NavBar, Tag, showToast } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { baseDataApi, qualityApi, systemApi } from '@/services/api'
  import { extractApiData, extractApiList } from '@/utils/apiHelper'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(true)
  const record = ref(null)

  const statusMap = {
    active: '启用',
    inactive: '停用',
    normal: '正常',
    void: '已作废',
    enabled: '启用',
    disabled: '停用'
  }
  const bomStatusMap = { draft: '草稿', approved: '已审核', disabled: '已停用' }
  const inspectionTypeMap = { IQC: '来料检验', IPQC: '过程检验', FQC: '成品检验' }
  const permissionTypeMap = { menu: '菜单', button: '按钮', api: 'API', permission: '权限' }

  const resourceConfigs = {
    baseCategory: {
      title: '分类详情',
      icon: 'label-o',
      titleField: 'name',
      subtitleField: 'code',
      list: (params) => baseDataApi.getCategories(params),
      fields: [
        { label: '分类编码', field: 'code' },
        { label: '分类名称', field: 'name' },
        { label: '上级分类', field: 'parent_name' },
        { label: '状态', field: 'status', map: statusMap },
        { label: '说明', field: 'description' }
      ]
    },
    baseUnit: {
      title: '单位详情',
      icon: 'orders-o',
      titleField: 'name',
      subtitleField: 'symbol',
      list: (params) => baseDataApi.getUnits(params),
      fields: [
        { label: '单位名称', field: 'name' },
        { label: '符号', field: 'symbol' },
        { label: '状态', field: 'status', map: statusMap },
        { label: '说明', field: 'description' }
      ]
    },
    baseLocation: {
      title: '库位详情',
      icon: 'location',
      titleField: 'name',
      subtitleField: 'code',
      get: (id) => baseDataApi.getLocation(id),
      fields: [
        { label: '库位编码', field: 'code' },
        { label: '库位名称', field: 'name' },
        { label: '所属仓库', field: 'warehouse_name' },
        { label: '库位类型', field: 'type' },
        { label: '状态', field: 'status', map: statusMap },
        { label: '说明', field: 'description' }
      ]
    },
    baseBom: {
      title: 'BOM详情',
      icon: 'cog',
      titleField: 'product_name',
      subtitleField: 'bom_code',
      get: (id) => baseDataApi.getBom(id),
      fields: [
        { label: 'BOM编码', field: 'bom_code' },
        { label: '产品', field: 'product_name' },
        { label: '版本', field: 'version' },
        { label: '组件数', field: 'component_count' },
        { label: '状态', field: 'status', map: bomStatusMap },
        { label: '备注', field: 'remark' }
      ],
      extraFields: [{ label: '组件明细', field: 'items', type: 'list' }]
    },
    baseProcessTemplate: {
      title: '工序模板详情',
      icon: 'cog',
      titleField: 'name',
      subtitleField: 'code',
      get: (id) => baseDataApi.getProcessTemplate(id),
      fields: [
        { label: '模板编码', field: 'code' },
        { label: '模板名称', field: 'name' },
        { label: '适用产品', field: 'product_name' },
        { label: '工序数', field: 'step_count' },
        { label: '状态', field: 'status', map: statusMap },
        { label: '说明', field: 'description' }
      ],
      extraFields: [{ label: '工序明细', field: 'steps', type: 'list' }]
    },
    qualityTemplate: {
      title: '检验模板详情',
      icon: 'description',
      titleField: 'name',
      subtitleField: 'code',
      get: (id) => qualityApi.getInspectionTemplate(id),
      fields: [
        { label: '模板编码', field: 'code' },
        { label: '模板名称', field: 'name' },
        { label: '检验类型', field: 'inspection_type', map: inspectionTypeMap },
        { label: '项目数', field: 'item_count' },
        { label: '状态', field: 'status', map: statusMap },
        { label: '更新时间', field: 'updated_at', type: 'datetime' }
      ],
      extraFields: [{ label: '检验项目', field: 'items', type: 'list' }]
    },
    systemDepartment: {
      title: '部门详情',
      icon: 'cluster-o',
      titleField: 'name',
      subtitleField: 'code',
      get: (id) => systemApi.getDepartment(id),
      fields: [
        { label: '部门编码', field: 'code' },
        { label: '部门名称', field: 'name' },
        { label: '上级部门', field: 'parent_name' },
        { label: '负责人', field: 'manager_name' },
        { label: '人数', field: 'member_count' },
        { label: '状态', field: 'status', map: statusMap }
      ]
    },
    systemRole: {
      title: '角色详情',
      icon: 'shield-o',
      titleField: 'name',
      subtitleField: 'code',
      list: (params) => systemApi.getRoles(params),
      fields: [
        { label: '角色编码', field: 'code' },
        { label: '角色名称', field: 'name' },
        { label: '用户数', field: 'user_count' },
        { label: '状态', field: 'status', map: statusMap },
        { label: '说明', field: 'description' }
      ]
    },
    systemPermission: {
      title: '权限详情',
      icon: 'lock',
      titleField: 'name',
      subtitleField: 'code',
      list: (params) => systemApi.getPermissions(params),
      fields: [
        { label: '权限编码', field: 'code' },
        { label: '权限名称', field: 'name' },
        { label: '类型', field: 'type', map: permissionTypeMap },
        { label: '归属模块', field: 'module' },
        { label: '说明', field: 'description' }
      ]
    },
    systemLog: {
      title: '日志详情',
      icon: 'notes-o',
      titleField: 'action',
      subtitleField: 'username',
      list: (params) => systemApi.getLogs(params),
      fields: [
        { label: '操作用户', field: 'username' },
        { label: '操作动作', field: 'action' },
        { label: '操作类型', field: 'type' },
        { label: '操作模块', field: 'module' },
        { label: 'IP地址', field: 'ip_address' },
        { label: '操作时间', field: 'created_at', type: 'datetime' }
      ],
      extraFields: [{ label: '详细内容', field: 'description' }]
    }
  }

  const config = computed(() => resourceConfigs[route.meta.resource] || resourceConfigs.baseCategory)

  const valueOf = (field) => {
    if (!field || !record.value) return ''
    if (typeof field === 'function') return field(record.value)
    return record.value[field]
  }

  const statusText = computed(() => {
    const statusField = config.value.fields.find((field) => field.field === 'status')
    return statusField ? formatValue(statusField) : ''
  })

  const statusType = computed(() => {
    const status = record.value?.status
    if (['active', 'normal', 'approved', 'enabled'].includes(status)) return 'success'
    if (['inactive', 'disabled', 'void'].includes(status)) return 'default'
    return 'primary'
  })

  const formatValue = (field) => {
    const value = typeof field.field === 'function' ? field.field(record.value) : record.value?.[field.field]
    if (field.map) return field.map[value] || value || '-'
    if (field.type === 'date' && value) return String(value).slice(0, 10)
    if (field.type === 'datetime' && value) return new Date(value).toLocaleString('zh-CN')
    if (field.type === 'list') return formatList(value)
    return value === undefined || value === null || value === '' ? '-' : String(value)
  }

  const formatList = (value) => {
    if (!Array.isArray(value) || value.length === 0) return '-'
    return value
      .map((item, index) => item.name || item.item_name || item.process_name || item.material_name || `明细${index + 1}`)
      .join('、')
  }

  const findRecordFromList = async (id) => {
    const response = await config.value.list({ page: 1, pageSize: 100, limit: 100 })
    return extractApiList(response).find((item) => String(item.id || item.code) === String(id))
  }

  const fetchRecord = async () => {
    loading.value = true
    try {
      const id = route.params.id
      if (config.value.get) {
        record.value = extractApiData(await config.value.get(id), null)
      } else if (config.value.list) {
        record.value = await findRecordFromList(id)
      }
    } catch (error) {
      console.error('加载详情失败:', error)
      showToast('加载详情失败')
    } finally {
      loading.value = false
    }
  }

  onMounted(fetchRecord)
</script>

<style lang="scss" scoped>
  .record-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .hero {
    margin: 0 12px 12px;
    padding: 16px;
    border-radius: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--surface-border);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .hero-icon {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--ds-blue) 10%, transparent);
    color: var(--color-primary);
  }

  .hero-main {
    flex: 1;
    min-width: 0;
  }

  .hero-title {
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hero-sub {
    margin-top: 3px;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .state {
    padding-top: 35vh;
  }
</style>
