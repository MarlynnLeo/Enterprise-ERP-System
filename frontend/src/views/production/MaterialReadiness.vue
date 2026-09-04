<template>
  <div class="module-page page-container">
    <PageHeader title="物料齐套检查" subtitle="检查生产任务所需 BOM 物料的库存充足情况" />

    <el-card class="data-card">
      <el-form :inline="true" class="mb-md">
        <el-form-item label="生产任务ID">
          <el-input v-model="taskId" placeholder="输入任务ID" class="form-control-lg" @keyup.enter="checkReadiness" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="checkReadiness" :loading="loading">检查齐套</el-button>
        </el-form-item>
      </el-form>

      <template v-if="result">
        <el-alert
          :title="result.ready ? '物料齐套 — 可以开始生产' : `存在缺料 — ${result.shortageItems} 种物料不足`"
          :type="result.ready ? 'success' : 'warning'"
          :closable="false"
          show-icon
          class="mb-md"
        />

        <el-descriptions :column="3" border size="small" class="mb-md">
          <el-descriptions-item label="任务编号">{{ result.taskCode }}</el-descriptions-item>
          <el-descriptions-item label="计划数量">{{ result.taskQuantity }}</el-descriptions-item>
          <el-descriptions-item label="BOM 物料数">{{ result.totalItems }}</el-descriptions-item>
        </el-descriptions>

        <el-table :data="result.details" border stripe>
          <el-table-column prop="materialCode" label="物料编码" width="140" />
          <el-table-column prop="materialName" label="物料名称" min-width="180" />
          <el-table-column prop="unit" label="单位" width="60" align="center" />
          <el-table-column prop="unitQuantity" label="BOM 单位用量" width="120" align="right" />
          <el-table-column prop="requiredQty" label="需求量" width="100" align="right">
            <template #default="{ row }">{{ row.requiredQty.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="availableQty" label="库存量" width="100" align="right">
            <template #default="{ row }">{{ row.availableQty.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="shortageQty" label="缺料量" width="100" align="right">
            <template #default="{ row }">
              <span class="font-weight-600" :class="row.shortageQty > 0 ? 'text-danger' : 'text-success'">
                {{ row.shortageQty.toFixed(2) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="isReady" label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.isReady ? 'success' : 'danger'" size="small">{{ row.isReady ? '充足' : '缺料' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <EmptyState v-if="!result && !loading" description="输入生产任务ID开始检查" />
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { productionAssistApi } from '@/api/productionAssist'

const taskId = ref('')
const loading = ref(false)
const result = ref(null)

const checkReadiness = async () => {
  if (!taskId.value) return ElMessage.warning('请输入任务ID')
  loading.value = true
  result.value = null
  try {
    const res = await productionAssistApi.checkReadiness(taskId.value)
    result.value = res.data || res
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '检查失败')
  } finally {
    loading.value = false
  }
}
</script>
