<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>汇率维护</h2>
          <p class="subtitle">维护各币种与人民币的汇率，支持外币结算与报表折算</p>
        </div>
        <el-button type="primary" @click="openForm">新增汇率</el-button>
      </div>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="tableData" v-loading="loading" border stripe>
      <el-table-column prop="from_currency" label="源币种" width="100" />
      <el-table-column prop="to_currency" label="目标币种" width="100" />
      <el-table-column prop="rate" label="汇率" width="140" align="right">
        <template #default="{ row }">{{ Number(row.rate).toFixed(6) }}</template>
      </el-table-column>
      <el-table-column prop="effective_date" label="生效日期" width="120" />
      <el-table-column prop="source" label="来源" width="80">
        <template #default="{ row }"><el-tag size="small">{{ row.source === 'api' ? '自动' : '手动' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" min-width="160" />
      <el-table-column label="操作" width="80">
        <template #default="{ row }">
          <el-popconfirm title="确定删除？" @confirm="handleDelete(row.id)">
            <template #reference><el-button link type="danger">删除</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" @change="fetchList" />
      </div>
    </el-card>

    <el-dialog v-model="formVis" title="新增汇率" width="400px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="源币种" required>
          <el-select v-model="form.from_currency" filterable style="width:100%">
            <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标币种"><el-input v-model="form.to_currency" placeholder="默认 CNY" /></el-form-item>
        <el-form-item label="汇率" required><el-input-number v-model="form.rate" :precision="6" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="生效日期" required><el-date-picker v-model="form.effective_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVis = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { exchangeRateApi } from '@/api/enhanced'

const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const total = ref(0)
const tableData = ref([])
const formVis = ref(false)
const form = ref({})

const currencies = ['USD','EUR','GBP','JPY','KRW','HKD','TWD','SGD','AUD','CAD','CHF','THB','MYR','PHP','VND','IDR','INR']

const fetchList = async () => {
  loading.value = true
  try {
    const res = await exchangeRateApi.getList({ page: page.value, pageSize: 50 })
    const d = res.data || res
    tableData.value = d.list || []
    total.value = d.total || 0
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const openForm = () => { form.value = { from_currency: 'USD', to_currency: 'CNY', rate: 0, effective_date: '' }; formVis.value = true }

const handleSave = async () => {
  if (!form.value.rate || !form.value.effective_date) return ElMessage.warning('请填写完整')
  saving.value = true
  try { await exchangeRateApi.create(form.value); ElMessage.success('保存成功'); formVis.value = false; fetchList() }
  catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

const handleDelete = async (id) => {
  try { await exchangeRateApi.delete(id); ElMessage.success('已删除'); fetchList() }
  catch { ElMessage.error('删除失败') }
}

onMounted(fetchList)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>
