<template>
  <div class="module-page page-container">
    <PageHeader title="工位管理" subtitle="管理装配产线和工位，查看工位实时状态">
      <template #actions>
<el-button type="primary" v-permission="'production:stations:create'" @click="openDialog()">
            <el-icon><Plus /></el-icon> 新增工位
          </el-button>
      </template>
    </PageHeader>

    <!-- 筛选 -->
    <el-card class="data-card">
      <el-form :inline="true" class="mb-md">
        <el-form-item label="产线">
          <el-select v-model="filters.lineCode" placeholder="全部产线" clearable class="form-control-md" @change="loadList">
            <el-option v-for="l in lines" :key="l.line_code" :label="l.lineName || l.lineCode" :value="l.line_code" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.stationType" placeholder="全部类型" clearable class="form-control-sm" @change="loadList">
            <el-option label="装配" value="assembly" />
            <el-option label="测试" value="test" />
            <el-option label="包装" value="pack" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" placeholder="编号/名称" clearable class="form-control-md" @keyup.enter="loadList" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">查询</el-button>
        </el-form-item>
      </el-form>

      <!-- 工位状态概览 -->
      <div class="station-overview" v-if="statusList.length">
        <div v-for="s in statusList" :key="s.id" class="station-card" :class="s.current_status">
          <div class="station-code">{{ s.code }}</div>
          <div class="station-name">{{ s.name }}</div>
          <el-tag :type="s.current_status === 'busy' ? 'danger' : 'success'" size="small">
            {{ s.current_status === 'busy' ? '忙碌' : '空闲' }}
          </el-tag>
          <div class="station-info" v-if="s.current_status === 'busy'">
            <div>{{ s.current_task_code }}</div>
            <div>{{ s.current_step_name }}</div>
            <div>{{ s.current_operator }}</div>
          </div>
        </div>
      </div>

      <!-- 工位列表 -->
      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="code" label="工位编号" width="120" />
        <el-table-column prop="name" label="工位名称" width="150" />
        <el-table-column prop="lineName" label="产线" width="120">
          <template #default="{ row }">{{ row.lineName || row.lineCode || '-' }}</template>
        </el-table-column>
        <el-table-column prop="stationType" label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ typeMap[row.stationType] || row.stationType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="capacity" label="容量" width="70" align="center" />
        <el-table-column prop="equipmentName" label="关联设备" width="150">
          <template #default="{ row }">{{ row.equipmentName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
              {{ row.isActive ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="70" align="center" />
        <el-table-column label="操作" min-width="200" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button type="primary" size="small" v-permission="'production:stations:update'" @click="openDialog(row)">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-popconfirm title="确定删除?" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button type="danger" size="small" v-permission="'production:stations:delete'">
                  <el-icon><Delete /></el-icon> 删除
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        :current-page="page" :page-size="pageSize" :total="total"
        layout="total, prev, pager, next"
        class="pagination-bar"
        @current-change="p => { page = p; loadList() }"
      />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <AppDialog
      v-model="dialogVisible"
      :title="editId ? '编辑工位' : '新增工位'"
      mode="form"
      width="520px"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="工位编号" required>
          <el-input v-model="form.code" placeholder="如 WS-A01" />
        </el-form-item>
        <el-form-item label="工位名称" required>
          <el-input v-model="form.name" placeholder="如 底盘装配工位" />
        </el-form-item>
        <el-form-item label="产线编号">
          <el-input v-model="form.lineCode" placeholder="如 LINE-01" />
        </el-form-item>
        <el-form-item label="产线名称">
          <el-input v-model="form.lineName" placeholder="如 一号产线" />
        </el-form-item>
        <el-form-item label="工位类型">
          <el-select v-model="form.stationType" class="w-full">
            <el-option label="装配" value="assembly" />
            <el-option label="测试" value="test" />
            <el-option label="包装" value="pack" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人容量">
          <el-input-number v-model="form.capacity" :min="1" :max="10" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          v-permission="editId ? 'production:stations:update' : 'production:stations:create'"
          @click="handleSave"
          :loading="saving"
        >保存</el-button>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { workStationApi } from '../../api/assembly'

const typeMap = { assembly: '装配', test: '测试', pack: '包装', other: '其他' }

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const lines = ref([])
const statusList = ref([])
const filters = reactive({ lineCode: '', stationType: '', keyword: '' })

const dialogVisible = ref(false)
const editId = ref(null)
const form = reactive({
  code: '', name: '', line_code: '', line_name: '',
  stationType: 'assembly', capacity: 1, sort_order: 0, description: ''
})

const loadList = async () => {
  loading.value = true
  try {
    const { data } = await workStationApi.getList({
      page: page.value, pageSize: pageSize.value,
      ...filters
    })
    list.value = data?.data?.list || data?.list || []
    total.value = data?.data?.total || data?.total || 0
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadLines = async () => {
  try {
    const { data } = await workStationApi.getLines()
    lines.value = data?.data || []
  } catch {}
}

const loadStatus = async () => {
  try {
    const { data } = await workStationApi.getStatus()
    statusList.value = data?.data || []
  } catch {}
}

const openDialog = (row) => {
  editId.value = row?.id || null
  Object.assign(form, row || {
    code: '', name: '', line_code: '', line_name: '',
    stationType: 'assembly', capacity: 1, sort_order: 0, description: ''
  })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.code || !form.name) return ElMessage.warning('请填写编号和名称')
  saving.value = true
  try {
    if (editId.value) {
      await workStationApi.update(editId.value, form)
    } else {
      await workStationApi.create(form)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadList()
    loadStatus()
    loadLines()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  try {
    await workStationApi.delete(id)
    ElMessage.success('删除成功')
    loadList()
    loadStatus()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

onMounted(() => {
  loadList()
  loadLines()
  loadStatus()
})
</script>

<style scoped>
.station-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--el-fill-color-lighter, var(--color-bg-section));
  border-radius: 8px;
}
.station-card {
  min-width: 140px;
  padding: 12px 16px;
  background: var(--color-bg-base);
  border-radius: 8px;
  border: 2px solid var(--color-border-lighter, var(--el-border-color-lighter));
  text-align: center;
  transition: all 0.3s;
}
.station-card.busy {
  border-color: var(--el-color-danger-light-3, var(--color-danger-light-3, var(--color-danger)));
  background: var(--el-color-danger-light-9);
}
.station-card.idle {
  border-color: var(--el-color-success-light-3, var(--color-success-light-3, var(--color-success)));
  background: var(--el-color-success-light-9);
}
.station-code {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}
.station-name {
  font-size: 13px;
  color: var(--color-text-regular);
  margin-bottom: 8px;
}
.station-info {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
</style>
