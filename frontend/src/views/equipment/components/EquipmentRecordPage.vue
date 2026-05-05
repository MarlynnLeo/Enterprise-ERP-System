<template>
  <div class="equipment-record-page">
    <el-card>
      <template #header>
        <div class="page-header">
          <h3>{{ title }}</h3>
          <el-button :icon="Refresh" @click="loadData">刷新</el-button>
        </div>
      </template>

      <div class="toolbar">
        <el-input
          v-model="query.search"
          clearable
          placeholder="搜索设备编号、名称或记录内容"
          @keyup.enter="handleSearch"
        />
        <el-select v-model="query.status" clearable placeholder="状态">
          <el-option
            v-for="option in statusOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-button type="primary" @click="handleSearch">查询</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column
          v-for="column in columns"
          :key="column.prop"
          :prop="column.prop"
          :label="column.label"
          :min-width="column.minWidth || 120"
        >
          <template #default="{ row }">
            <el-tag v-if="column.type === 'status'" :type="getStatusTag(row[column.prop])">
              {{ formatStatus(row[column.prop]) }}
            </el-tag>
            <span v-else>{{ formatCell(row, column) }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          background
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          @size-change="handlePageChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { equipmentApi } from '@/services/api'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  apiMethod: {
    type: String,
    required: true
  },
  columns: {
    type: Array,
    required: true
  },
  statusOptions: {
    type: Array,
    default: () => []
  },
  statusLabels: {
    type: Object,
    default: () => ({})
  }
})

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const query = reactive({
  page: 1,
  pageSize: 20,
  search: '',
  status: ''
})

const extractData = (response) => {
  const data = response?.data || response || {}
  return {
    list: data.list || data.rows || data.data || (Array.isArray(data) ? data : []),
    total: data.total || data.count || (Array.isArray(data) ? data.length : 0)
  }
}

const loadData = async () => {
  const request = equipmentApi[props.apiMethod]
  if (typeof request !== 'function') {
    ElMessage.error('设备数据接口未配置')
    return
  }

  loading.value = true
  try {
    const response = await request({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      status: query.status || undefined
    })
    const data = extractData(response)
    rows.value = data.list
    total.value = data.total
  } catch (error) {
    console.error('加载设备记录失败:', error)
    ElMessage.error('加载设备记录失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.page = 1
  loadData()
}

const handlePageChange = () => {
  loadData()
}

const formatDate = (value) => {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

const formatCell = (row, column) => {
  const value = row[column.prop]
  if (column.type === 'date') return formatDate(value)
  if (column.type === 'money') return value === null || value === undefined ? '-' : Number(value).toFixed(2)
  return value ?? '-'
}

const formatStatus = (status) => {
  return props.statusLabels[status] || status || '-'
}

const getStatusTag = (status) => {
  const success = ['normal', 'completed', 'pass', 'active']
  const warning = ['maintenance', 'planned', 'pending', 'repair', 'abnormal']
  const danger = ['failed', 'scrapped', 'overdue', 'reported']
  if (success.includes(status)) return 'success'
  if (warning.includes(status)) return 'warning'
  if (danger.includes(status)) return 'danger'
  return 'info'
}

onMounted(loadData)
</script>

<style scoped>
.equipment-record-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header h3 {
  margin: 0;
  font-size: 18px;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 180px auto;
  gap: 12px;
  margin-bottom: 16px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 768px) {
  .equipment-record-page {
    padding: 12px;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
