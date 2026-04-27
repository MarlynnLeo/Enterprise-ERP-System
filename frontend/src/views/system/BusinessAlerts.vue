<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>业务告警配置</h2>
          <p class="subtitle">配置库存、财务、质量、生产等业务告警规则与检查频率</p>
        </div>
      </div>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="alertList" v-loading="loading" border stripe>
      <el-table-column prop="code" label="告警编码" width="180" />
      <el-table-column prop="name" label="告警名称" min-width="180" />
      <el-table-column prop="category" label="分类" width="80">
        <template #default="{ row }">{{ catLabel[row.category] || row.category }}</template>
      </el-table-column>
      <el-table-column prop="severity" label="级别" width="80">
        <template #default="{ row }">
          <el-tag :type="{ critical:'danger', warning:'warning', info:'info' }[row.severity] || 'info'" size="small">{{ { critical:'严重', warning:'警告', info:'提示' }[row.severity] || row.severity }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="check_interval_minutes" label="检查间隔(分)" width="110" align="center" />
      <el-table-column prop="is_active" label="状态" width="70">
        <template #default="{ row }"><el-switch v-model="row.is_active" :active-value="1" :inactive-value="0" @change="toggleActive(row)" /></template>
      </el-table-column>
      <el-table-column label="操作" width="80">
        <template #default="{ row }"><el-button link type="primary" @click="openEdit(row)">配置</el-button></template>
      </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="editVis" title="配置告警" width="450px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="告警名称"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="级别">
          <el-select v-model="editForm.severity" style="width:100%">
            <el-option label="提示" value="info" /><el-option label="警告" value="warning" /><el-option label="严重" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="检查间隔(分)"><el-input-number v-model="editForm.check_interval_minutes" :min="1" style="width:100%" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="editForm.is_active" :active-value="1" :inactive-value="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVis = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { alertApi } from '@/api/enhanced'

const loading = ref(false)
const saving = ref(false)
const alertList = ref([])
const editVis = ref(false)
const editForm = ref({})

const catLabel = { inventory:'库存', finance:'财务', contract:'合同', quality:'质量', production:'生产', hr:'人力' }

const fetchList = async () => {
  loading.value = true
  try { alertList.value = (await alertApi.getList()).data || [] }
  catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const openEdit = (row) => { editForm.value = { ...row }; editVis.value = true }

const toggleActive = async (row) => {
  try { await alertApi.update(row.id, row) }
  catch { ElMessage.error('更新失败'); fetchList() }
}

const saveEdit = async () => {
  saving.value = true
  try { await alertApi.update(editForm.value.id, editForm.value); ElMessage.success('保存成功'); editVis.value = false; fetchList() }
  catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

onMounted(fetchList)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>
