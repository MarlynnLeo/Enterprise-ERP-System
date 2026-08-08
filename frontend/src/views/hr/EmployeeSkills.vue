<template>
  <div class="module-page page-container">
    <PageHeader title="员工技能矩阵" subtitle="管理员工技能认证与技能矩阵">
      <template #actions>
<el-button @click="viewMode = viewMode === 'list' ? 'matrix' : 'list'">
            {{ viewMode === 'list' ? '矩阵视图' : '列表视图' }}
          </el-button>
          <el-button type="primary" v-permission="'hr:skills:create'" @click="openForm()">新增技能</el-button>
      </template>
    </PageHeader>

    <el-card class="data-card">
      <!-- 列表视图 -->
      <template v-if="viewMode === 'list'">
        <div class="filter-bar mb-md">
          <el-row :gutter="12">
            <el-col :span="5">
              <el-input v-model="filters.keyword" placeholder="搜索员工/技能" clearable @clear="fetchData" @keyup.enter="fetchData" />
            </el-col>
            <el-col :span="4">
              <el-select v-model="filters.skillCategory" placeholder="技能类别" clearable @change="fetchData" class="w-full">
                <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
              </el-select>
            </el-col>
            <el-col :span="4">
              <el-select v-model="filters.level" placeholder="技能等级" clearable @change="fetchData" class="w-full">
                <el-option label="初学" value="beginner" />
                <el-option label="中级" value="intermediate" />
                <el-option label="高级" value="advanced" />
                <el-option label="专家" value="expert" />
              </el-select>
            </el-col>
            <el-col :span="2"><el-button @click="fetchData">查询</el-button></el-col>
          </el-row>
        </div>

        <el-table :data="tableData" v-loading="loading" border stripe>
          <el-table-column prop="employeeName" label="员工姓名" width="120" />
          <el-table-column prop="departmentName" label="部门" width="120" />
          <el-table-column prop="skillName" label="技能名称" min-width="150" />
          <el-table-column prop="skillCategory" label="类别" width="100">
            <template #default="{ row }"><el-tag size="small" type="info">{{ row.skillCategory }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="level" label="等级" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="levelTag[row.level]">{{ levelLabel[row.level] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="certifiedDate" label="认证日期" width="110" />
          <el-table-column prop="expiryDate" label="到期日期" width="110">
            <template #default="{ row }">
              <span :class="isExpired(row.expiryDate) ? 'text-danger' : ''">{{ row.expiryDate || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" v-permission="'hr:skills:update'" @click="openForm(row)">编辑</el-button>
              <el-button link type="danger" v-permission="'hr:skills:delete'" @click="handleDelete(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-container">
          <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total, prev, pager, next" @change="fetchData" />
        </div>
      </template>

      <!-- 矩阵视图 -->
      <template v-if="viewMode === 'matrix'">
        <div v-loading="matrixLoading" class="matrix-container">
          <el-table :data="matrixData.employees" border stripe v-if="matrixData.employees?.length">
            <el-table-column prop="employeeName" label="员工" width="120" fixed />
            <el-table-column prop="departmentName" label="部门" width="100" fixed />
            <el-table-column v-for="skill in matrixData.skills" :key="skill" :label="skill" min-width="100" align="center">
              <template #default="{ row }">
                <template v-if="row.skills[skill]">
                  <el-tag
                    size="small"
                    :type="row.skills[skill].expired ? 'danger' : levelTag[row.skills[skill].level]"
                    :effect="row.skills[skill].expired ? 'dark' : 'light'"
                  >
                    {{ levelLabel[row.skills[skill].level] }}
                    <span v-if="row.skills[skill].expired"> ⚠</span>
                  </el-tag>
                </template>
                <span v-else class="skill-empty">—</span>
              </template>
            </el-table-column>
          </el-table>
          <EmptyState v-if="!matrixData.employees?.length && !matrixLoading" description="暂无技能数据" />
        </div>
      </template>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <AppDialog
      v-model="formVis"
      :title="editId ? '编辑技能' : '新增技能'"
      mode="form"
      width="550px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="员工ID" required v-if="!editId">
          <el-input v-model="form.userId" type="number" placeholder="输入员工用户ID" />
        </el-form-item>
        <el-form-item label="技能名称" required>
          <el-input v-model="form.skillName" placeholder="如：SMT焊接、电装装配" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="技能类别" required>
              <el-input v-model="form.skillCategory" placeholder="如：装配、检验" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="技能等级" required>
              <el-select v-model="form.level" class="w-full">
                <el-option label="初学" value="beginner" />
                <el-option label="中级" value="intermediate" />
                <el-option label="高级" value="advanced" />
                <el-option label="专家" value="expert" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="认证日期">
              <el-date-picker v-model="form.certifiedDate" value-format="YYYY-MM-DD" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="到期日期">
              <el-date-picker v-model="form.expiryDate" value-format="YYYY-MM-DD" class="w-full" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="证书编号"><el-input v-model="form.certificateNo" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button
          type="primary"
          v-permission="editId ? 'hr:skills:update' : 'hr:skills:create'"
          @click="submitForm"
          :loading="saving"
        >确定</el-button>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { employeeSkillApi } from '@/api/productionAssist'

const viewMode = ref('list')
const loading = ref(false)
const matrixLoading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const categories = ref([])
const formVis = ref(false)
const editId = ref(null)
const matrixData = ref({ employees: [], skills: [] })

const filters = ref({ keyword: '', skillCategory: '', level: '' })

const form = ref({
  user_id: '', skill_name: '', skill_category: '', level: 'beginner',
  certified_date: null, expiry_date: null, certificate_no: '', remark: '',
})

const levelLabel = { beginner: '初学', intermediate: '中级', advanced: '高级', expert: '专家' }
const levelTag = { beginner: 'info', intermediate: 'primary', advanced: 'warning', expert: 'success' }

const isExpired = (date) => date && new Date(date) < new Date()

const fetchData = async () => {
  loading.value = true
  try {
    const res = await employeeSkillApi.getList({ page: page.value, pageSize: pageSize.value, ...filters.value })
    const data = res.data || res
    tableData.value = data.list || []
    total.value = data.total || 0
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const fetchCategories = async () => {
  try {
    const res = await employeeSkillApi.getCategories()
    categories.value = res.data || res || []
  } catch { /* silent */ }
}

const fetchMatrix = async () => {
  matrixLoading.value = true
  try {
    const res = await employeeSkillApi.getMatrix()
    matrixData.value = res.data || res || { employees: [], skills: [] }
  } catch { ElMessage.error('加载矩阵失败') }
  finally { matrixLoading.value = false }
}

watch(viewMode, (v) => { if (v === 'matrix') fetchMatrix() })

const openForm = (row) => {
  if (row) {
    editId.value = row.id
    form.value = { ...row }
  } else {
    editId.value = null
    form.value = { user_id: '', skill_name: '', skill_category: '', level: 'beginner', certified_date: null, expiry_date: null, certificate_no: '', remark: '' }
  }
  formVis.value = true
}

const submitForm = async () => {
  if (!form.value.skill_name?.trim()) return ElMessage.warning('请填写技能名称')
  if (!form.value.skill_category?.trim()) return ElMessage.warning('请填写技能类别')
  saving.value = true
  try {
    if (editId.value) {
      await employeeSkillApi.update(editId.value, form.value)
    } else {
      if (!form.value.userId) return ElMessage.warning('请输入员工ID')
      await employeeSkillApi.create(form.value)
    }
    ElMessage.success(editId.value ? '更新成功' : '创建成功')
    formVis.value = false
    fetchData()
    fetchCategories()
  } catch (err) { ElMessage.error(err.response?.data?.message || '操作失败') }
  finally { saving.value = false }
}

const handleDelete = async (id) => {
  await ElMessageBox.confirm('确定删除此技能记录？', '确认')
  try {
    await employeeSkillApi.delete(id)
    ElMessage.success('删除成功')
    fetchData()
  } catch { ElMessage.error('删除失败') }
}

onMounted(() => { fetchData(); fetchCategories() })
</script>

<style scoped>
.matrix-container { overflow-x: auto; }
.skill-empty {
  color: var(--color-text-placeholder, var(--color-text-secondary, var(--el-text-color-placeholder)));
}
</style>
