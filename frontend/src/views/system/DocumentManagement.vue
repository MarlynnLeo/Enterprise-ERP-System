<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>文档管理</h2>
          <p class="subtitle">统一管理合同、图纸、规格书、报告等业务文档</p>
        </div>
        <el-button type="primary" @click="openForm">上传文档</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="搜索">
          <el-input v-model="keyword" placeholder="文档名称/编号" clearable @keyup.enter="fetchList">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="filterCategory" placeholder="全部" clearable @change="fetchList">
            <el-option label="合同" value="contract" /><el-option label="图纸" value="drawing" />
            <el-option label="规格书" value="specification" /><el-option label="报告" value="report" />
            <el-option label="证书" value="certificate" /><el-option label="手册" value="manual" /><el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="tableData" v-loading="loading" border stripe>
      <el-table-column prop="name" label="文档名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="80">
        <template #default="{ row }">{{ catLabel[row.category] || row.category }}</template>
      </el-table-column>
      <el-table-column prop="file_name" label="文件名" width="180" show-overflow-tooltip />
      <el-table-column prop="version" label="版本" width="60" align="center" />
      <el-table-column prop="file_size" label="大小" width="80" align="right">
        <template #default="{ row }">{{ (row.file_size / 1024).toFixed(0) }}KB</template>
      </el-table-column>
      <el-table-column prop="download_count" label="下载" width="60" align="center" />
      <el-table-column prop="created_by_name" label="上传人" width="100" />
      <el-table-column prop="created_at" label="上传时间" width="160" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleDownload(row)">下载</el-button>
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

    <el-dialog v-model="formVis" title="上传文档" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="文档名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" style="width:100%">
            <el-option v-for="(l,k) in catLabel" :key="k" :label="l" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件">
          <el-upload :auto-upload="false" :on-change="onFileChange" :limit="1" :file-list="fileList">
            <el-button type="primary">选择文件</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="版本"><el-input v-model="form.version" placeholder="1.0" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
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
import { Search } from '@element-plus/icons-vue'
import { documentApi } from '@/api/enhanced'
import { api } from '@/services/axiosInstance'

const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const filterCategory = ref('')
const page = ref(1)
const total = ref(0)
const tableData = ref([])
const formVis = ref(false)
const form = ref({})
const fileList = ref([])

const catLabel = { contract:'合同', drawing:'图纸', specification:'规格书', report:'报告', certificate:'证书', manual:'手册', other:'其他' }

const fetchList = async () => {
  loading.value = true
  try {
    const res = await documentApi.getList({ keyword: keyword.value, category: filterCategory.value, page: page.value, pageSize: 20 })
    const d = res.data || res
    tableData.value = d.list || []
    total.value = d.total || 0
  } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const openForm = () => { form.value = { name: '', category: 'other', version: '1.0', description: '' }; fileList.value = []; formVis.value = true }

const onFileChange = (file) => {
  form.value.file_name = file.name
  form.value.file_size = file.size
  form.value.file_type = file.raw?.type
  form.value._file = file.raw
}

const handleSave = async () => {
  if (!form.value.name) return ElMessage.warning('请输入文档名称')
  saving.value = true
  try {
    // 如果有文件，先上传
    let fileUrl = ''
    if (form.value._file) {
      const fd = new FormData()
      fd.append('file', form.value._file)
      const uploadRes = await api.post('/api/upload/file', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      fileUrl = uploadRes.data?.url || uploadRes.data?.filePath || ''
    }
    await documentApi.create({ ...form.value, file_url: fileUrl || 'manual' })
    ElMessage.success('上传成功'); formVis.value = false; fetchList()
  } catch (e) { ElMessage.error(e.message || '上传失败') }
  finally { saving.value = false }
}

const handleDownload = async (row) => {
  try {
    const res = await documentApi.download(row.id)
    const d = res.data || res
    if (d?.file_url) window.open(d.file_url, '_blank')
    else ElMessage.info('无文件链接')
  } catch { ElMessage.error('下载失败') }
}

const handleDelete = async (id) => {
  try { await documentApi.delete(id); ElMessage.success('已删除'); fetchList() }
  catch { ElMessage.error('删除失败') }
}

onMounted(fetchList)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>
