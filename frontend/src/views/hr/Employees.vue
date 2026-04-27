<template>
  <div class="employees-container">
    <el-card>
      <template #header>
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <span>员工档案与薪酬基数设定</span>
          <div>
            <el-button type="success" :loading="syncing" @click="handleSyncDingtalk">
              <el-icon><Refresh /></el-icon> 钉钉通讯录全量拉取
            </el-button>
            <el-button type="primary" @click="handleAdd"><el-icon><Plus /></el-icon>手动新增</el-button>
          </div>
        </div>
      </template>

      <el-table :data="tableData" border v-loading="loading" height="calc(100vh - 250px)" style="width:100%">
        <el-table-column type="index" label="序号" width="55" fixed />
        <el-table-column prop="employee_no" label="工号" width="240" fixed show-overflow-tooltip />
        <el-table-column prop="name" label="姓名" width="100" fixed />
        <el-table-column prop="department_name" label="部门" width="100" />
        <el-table-column prop="insurance_type" label="社保类型" width="100" />
        <el-table-column label="薪酬基数" align="center">
          <el-table-column prop="base_salary" label="基本工资" width="100" />
          <el-table-column prop="split_base_salary" label="拆分报税基数" width="110" />
        </el-table-column>
        <el-table-column label="补贴设定" align="center">
          <el-table-column prop="position_allowance" label="职位/外补" width="100" />
          <el-table-column prop="housing_allowance" label="房补/交补" width="100" />
          <el-table-column prop="meal_allowance" label="餐补" width="100" />
          <el-table-column prop="overtime_rate" label="加班时薪" width="100" />
        </el-table-column>
        <el-table-column prop="employment_status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.employment_status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.employment_status === 'active' ? '在职' : '离职' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="handleEdit(row)"
              v-permission="'hr:employees:update'">编辑</el-button>
            <el-button type="danger" size="small" link @click="handleDelete(row)" v-if="row.employment_status==='active'">离职</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog :title="isEdit ? '编辑员工薪酬' : '手动新增员工'" v-model="dialogVisible" width="650px" :close-on-click-modal="false">
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="110px">
        <el-divider content-position="left">基本信息</el-divider>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="formData.name" :disabled="isEdit" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工号" prop="employee_no">
              <el-input v-model="formData.employee_no" :disabled="isEdit" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="所属部门">
              <el-select v-model="formData.department_id" placeholder="请选择部门" style="width:100%" filterable clearable>
                <el-option v-for="d in departmentList" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="社保类型">
              <el-select v-model="formData.insurance_type" style="width:100%">
                <el-option label="有社有公" value="有社有公" />
                <el-option label="有社无公" value="有社无公" />
                <el-option label="无社无公" value="无社无公" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="在职状态">
              <el-select v-model="formData.employment_status" style="width:100%">
                <el-option label="在职" value="active" />
                <el-option label="离职" value="left" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">薪酬基数</el-divider>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="基本工资">
              <el-input-number v-model="formData.base_salary" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="拆分报税基数">
              <el-input-number v-model="formData.split_base_salary" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">补贴设定</el-divider>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="职位/外补">
              <el-input-number v-model="formData.position_allowance" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="房补/交补">
              <el-input-number v-model="formData.housing_allowance" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="餐补">
              <el-input-number v-model="formData.meal_allowance" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="加班时薪">
              <el-input-number v-model="formData.overtime_rate" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { hrApi } from '@/api/hr'
import { api } from '@/services/axiosInstance'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'

const tableData = ref([])
const departmentList = ref([])
const loading = ref(false)
const syncing = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const defaultForm = {
  name: '', employee_no: '', department_id: null, insurance_type: '有社有公', employment_status: 'active',
  base_salary: 3070, split_base_salary: 1215,
  position_allowance: 150, housing_allowance: 78.57, meal_allowance: 102.14, overtime_rate: 20
}
const formData = ref({ ...defaultForm })

const formRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  employee_no: [{ required: true, message: '请输入工号', trigger: 'blur' }]
}

const fetchEmployees = async () => {
  loading.value = true
  try {
    const res = await hrApi.getEmployees({})
    tableData.value = res.data.data || res.data
  } catch(e) {
    ElMessage.error('获取员工列表失败')
  } finally {
    loading.value = false
  }
}

const handleAdd = () => {
  isEdit.value = false
  formData.value = { ...defaultForm }
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  formData.value = {
    id: row.id,
    name: row.name,
    employee_no: row.employee_no,
    department_id: row.department_id || null,
    insurance_type: row.insurance_type || '有社有公',
    employment_status: row.employment_status || 'active',
    base_salary: Number(row.base_salary) || 0,
    split_base_salary: Number(row.split_base_salary) || 0,
    position_allowance: Number(row.position_allowance) || 0,
    housing_allowance: Number(row.housing_allowance) || 0,
    meal_allowance: Number(row.meal_allowance) || 0,
    overtime_rate: Number(row.overtime_rate) || 0
  }
  dialogVisible.value = true
}

const handleSave = async () => {
  try {
    await formRef.value.validate()
    saving.value = true
    if (isEdit.value) {
      await hrApi.updateEmployee(formData.value.id, formData.value)
      ElMessage.success('更新成功')
    } else {
      await hrApi.createEmployee(formData.value)
      ElMessage.success('添加成功')
    }
    dialogVisible.value = false
    fetchEmployees()
  } catch(e) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确定将 ${row.name} 设为离职吗？`, '确认', { type: 'warning' })
    await hrApi.deleteEmployee(row.id)
    ElMessage.success('已设为离职')
    fetchEmployees()
  } catch(e) { if (e !== 'cancel') ElMessage.error(e.response?.data?.message || '操作失败') }
}

const handleSyncDingtalk = async () => {
  try {
    await ElMessageBox.confirm('从钉钉全量拉取通讯录成员，自动插入未建档人员。确认执行？', '确认同步', { type: 'warning' })
    syncing.value = true
    const res = await hrApi.syncDingtalk()
    ElMessage.success(res.data.message || '同步完毕')
    fetchEmployees()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '同步失败')
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  fetchEmployees()
  // 加载部门列表
  api.get('/system/departments/list').then(res => {
    departmentList.value = res.data.data || res.data || []
  }).catch(() => {})
})
</script>