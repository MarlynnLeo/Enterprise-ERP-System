<template>
  <div class="page-container">
    <NavBar title="数据备份" left-arrow @click-left="$router.go(-1)" />

    <PullRefresh v-model="refreshing" @refresh="loadBackups">
      <div class="page-body">
        <CellGroup inset title="备份状态">
          <Cell title="备份数量" :value="String(backups.length)" />
          <Cell title="最后备份时间" :value="latestBackup ? formatDate(latestBackup.created_at) : '-'" />
          <Cell title="最后备份状态">
            <template #value>
              <Tag :type="latestBackup?.status === 'success' ? 'success' : 'danger'">
                {{ latestBackup?.status === 'success' ? '成功' : latestBackup ? '失败' : '-' }}
              </Tag>
            </template>
          </Cell>
        </CellGroup>

        <CellGroup inset title="操作">
          <Cell title="手动备份" is-link @click="handleBackup">
            <template #value>
              <Tag type="primary" size="medium">{{ creating ? '执行中' : '立即执行' }}</Tag>
            </template>
          </Cell>
          <Cell
            v-if="latestBackup"
            title="恢复预检"
            :label="latestBackup.filename"
            is-link
            @click="handleVerify(latestBackup)"
          />
        </CellGroup>

        <CellGroup inset title="备份记录">
          <Cell
            v-for="item in backups"
            :key="item.filename"
            :title="item.filename"
            :label="`${formatSize(item.file_size)} / ${formatDate(item.created_at)}`"
            is-link
            @click="handleVerify(item)"
          >
            <template #value>
              <Tag :type="item.status === 'success' ? 'success' : 'danger'">
                {{ item.status === 'success' ? '成功' : '失败' }}
              </Tag>
            </template>
          </Cell>
          <Empty v-if="!loading && backups.length === 0" description="暂无备份记录" />
        </CellGroup>
      </div>
    </PullRefresh>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { NavBar, CellGroup, Cell, Tag, Empty, PullRefresh, showConfirmDialog, showToast } from 'vant'
import { systemApi } from '@/api/modules/system'

const backups = ref([])
const loading = ref(false)
const refreshing = ref(false)
const creating = ref(false)

const latestBackup = computed(() => backups.value[0] || null)

const getPayload = (response) => response?.data?.data ?? response?.data ?? response

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

const formatSize = (value) => {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const loadBackups = async () => {
  loading.value = true
  try {
    backups.value = getPayload(await systemApi.getBackups()) || []
  } catch (error) {
    showToast(error.message || '加载失败')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const handleBackup = async () => {
  if (creating.value) return
  try {
    await showConfirmDialog({
      title: '手动备份',
      message: '确认立即创建数据库备份？'
    })
  } catch {
    return
  }

  creating.value = true
  try {
    await systemApi.createBackup()
    showToast('备份创建成功')
    await loadBackups()
  } catch (error) {
    showToast(error.message || '备份失败')
  } finally {
    creating.value = false
  }
}

const handleVerify = async (backup) => {
  try {
    const result = getPayload(await systemApi.verifyBackup(backup.filename))
    showToast(result?.valid ? '恢复预检通过' : '恢复预检未通过')
  } catch (error) {
    showToast(error.message || '校验失败')
  }
}

onMounted(loadBackups)
</script>

<style lang="scss" scoped>
.page-container {
  min-height: 100%;
  background: var(--bg-primary);
}

.page-body {
  padding: 0 12px var(--app-bottom-space);
}

:deep(.van-cell-group) {
  margin-top: 12px;
}
</style>
