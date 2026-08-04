<template>
  <div class="module-page backup-page">
    <PageHeader title="数据备份" subtitle="数据库备份、下载与恢复前校验">
      <template #actions>
        <el-button :icon="Refresh" @click="loadBackups" :loading="loading">刷新</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          v-permission="'system:backup:create'"
          @click="createBackup"
          :loading="creating"
        >
          手动备份
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="lastVerification"
      class="verify-alert"
      :type="lastVerification.valid ? 'success' : 'error'"
      :closable="true"
      show-icon
      @close="lastVerification = null"
    >
      <template #title>
        {{ lastVerification.filename }} 校验{{ lastVerification.valid ? '通过' : '未通过' }}
      </template>
      <div class="verify-summary">
        <span>表结构 {{ lastVerification.table_count }}</span>
        <span>INSERT {{ lastVerification.insert_count }}</span>
        <span>语句 {{ lastVerification.statement_count }}</span>
        <span>SHA256 {{ lastVerification.checksum }}</span>
      </div>
    </el-alert>

    <el-table :data="backups" v-loading="loading" border stripe>
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="backup-detail">
            <div>文件名：{{ row.filename }}</div>
            <div>校验和：{{ row.checksum || '-' }}</div>
            <div>消息：{{ row.message || '-' }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="filename" label="文件名" min-width="220" />
      <el-table-column label="大小" width="120">
        <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'success' ? 'success' : 'danger'">
            {{ row.status === 'success' ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :icon="CircleCheck"
            v-permission="'system:backup:view'"
            @click="verifyBackup(row)"
          >
            校验
          </el-button>
          <el-button
            link
            type="primary"
            :icon="Download"
            v-permission="'system:backup:download'"
            @click="downloadBackup(row)"
          >
            下载
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Download, Plus, Refresh } from '@element-plus/icons-vue'
import { systemApi } from '@/api'

const backups = ref([])
const loading = ref(false)
const creating = ref(false)
const lastVerification = ref(null)

const getPayload = (response) => response?.data?.data ?? response?.data ?? response

const formatSize = (value) => {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

const loadBackups = async () => {
  loading.value = true
  try {
    backups.value = getPayload(await systemApi.getBackups()) || []
  } catch (error) {
    ElMessage.error(error.message || '加载备份列表失败')
  } finally {
    loading.value = false
  }
}

const createBackup = async () => {
  creating.value = true
  try {
    await systemApi.createBackup()
    ElMessage.success('备份创建成功')
    await loadBackups()
  } catch (error) {
    ElMessage.error(error.message || '备份创建失败')
  } finally {
    creating.value = false
  }
}

const verifyBackup = async (row) => {
  try {
    lastVerification.value = getPayload(await systemApi.verifyBackup(row.filename))
    if (lastVerification.value?.valid) {
      ElMessage.success('备份校验通过')
    } else {
      ElMessage.error('备份校验未通过')
    }
  } catch (error) {
    ElMessage.error(error.message || '备份校验失败')
  }
}

const downloadBackup = async (row) => {
  try {
    const response = await systemApi.downloadBackup(row.filename)
    const blob = new Blob([response.data], { type: 'application/sql' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = row.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(error.message || '下载失败')
  }
}

onMounted(loadBackups)
</script>

<style scoped>
.verify-alert {
  margin-bottom: 12px;
}

.verify-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  word-break: break-all;
}

.backup-detail {
  display: grid;
  gap: 6px;
  padding: 4px 16px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
</style>
