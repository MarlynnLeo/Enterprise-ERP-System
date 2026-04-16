<!--
/**
 * Report.vue - 生产报工
 * @description 统一卡片风格
 * @date 2026-04-15
 * @version 3.0.0
 */
-->
<template>
  <div class="report-page">
    <NavBar title="生产报工" left-arrow @click-left="$router.go(-1)" />

    <div class="content-wrapper">
      <!-- 选择任务 -->
      <div class="info-section">
        <div class="section-title">选择任务</div>
        <Field
          v-model="selectedTaskName"
          is-link
          readonly
          placeholder="请选择生产任务"
          @click="showTaskPicker = true"
        />
      </div>

      <!-- 任务信息 -->
      <div class="info-section" v-if="selectedTask">
        <div class="section-title">任务信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">任务编号</span
            ><span class="info-value mono">{{ selectedTask.task_code || selectedTask.code }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">产品名称</span
            ><span class="info-value">{{
              selectedTask.product_name || selectedTask.productName
            }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">计划数量</span
            ><span class="info-value highlight"
              >{{ selectedTask.planned_quantity || selectedTask.quantity }}
              {{ selectedTask.unit_name || '件' }}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">已完成</span
            ><span class="info-value">{{ selectedTask.completed_quantity || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- 报工表单 -->
      <div class="info-section">
        <div class="section-title">报工信息</div>
        <CellGroup inset>
          <Field
            v-model="reportForm.completed_quantity"
            type="number"
            label="完成数量"
            placeholder="请输入本次完成数量"
            :rules="[{ required: true }]"
          />
          <Field
            v-model="reportForm.defective_quantity"
            type="number"
            label="不良数量"
            placeholder="请输入不良品数量（可选）"
          />
          <Field
            v-model="reportForm.remarks"
            type="textarea"
            label="备注"
            placeholder="请输入备注"
            rows="3"
          />
        </CellGroup>
      </div>

      <!-- 提交按钮 -->
      <div class="action-bar">
        <VanButton type="primary" block round :loading="submitting" @click="submitReport"
          >提交报工</VanButton
        >
      </div>
    </div>

    <!-- 任务选择器 -->
    <Popup v-model:show="showTaskPicker" position="bottom" :style="{ height: '60%' }" round>
      <div class="picker-header">
        <span class="picker-title">选择任务</span>
        <Icon name="cross" size="18" @click="showTaskPicker = false" />
      </div>
      <div class="picker-list">
        <div
          v-for="task in taskList"
          :key="task.id"
          class="picker-item"
          :class="{ active: selectedTask?.id === task.id }"
          @click="selectTask(task)"
        >
          <div class="picker-item-title">{{ task.product_name || task.productName }}</div>
          <div class="picker-item-sub">
            {{ task.task_code || task.code }} · {{ task.planned_quantity || task.quantity }}
            {{ task.unit_name || '件' }}
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Field, CellGroup, Popup, Button as VanButton, Icon, showToast } from 'vant'
  import { productionApi } from '@/services/api'

  const router = useRouter()
  const taskList = ref([])
  const selectedTask = ref(null)
  const selectedTaskName = ref('')
  const showTaskPicker = ref(false)
  const submitting = ref(false)
  const reportForm = reactive({ completed_quantity: '', defective_quantity: '', remarks: '' })

  const selectTask = (task) => {
    selectedTask.value = task
    selectedTaskName.value = `${task.task_code || task.code} - ${task.product_name || task.productName}`
    showTaskPicker.value = false
  }

  const loadTasks = async () => {
    try {
      const response = await productionApi.getProductionTasks({
        page: 1,
        pageSize: 100,
        status: 'in_progress'
      })
      let tasks = response.data?.items || response.data || response.items || []
      taskList.value = Array.isArray(tasks) ? tasks : []
    } catch (e) {
      console.error('加载任务失败:', e)
    }
  }

  const submitReport = async () => {
    if (!selectedTask.value) {
      showToast('请选择任务')
      return
    }
    if (!reportForm.completed_quantity) {
      showToast('请输入完成数量')
      return
    }
    submitting.value = true
    try {
      await productionApi.reportProductionProgress({
        task_id: selectedTask.value.id,
        completed_quantity: Number(reportForm.completed_quantity),
        defective_quantity: Number(reportForm.defective_quantity) || 0,
        remarks: reportForm.remarks
      })
      showToast('报工成功')
      router.go(-1)
    } catch (e) {
      console.error('报工失败:', e)
      showToast('报工失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => loadTasks())
</script>

<style lang="scss" scoped>
  .report-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 120px;
  }
  .content-wrapper {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .info-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .info-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .info-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    &.mono {
      font-family: 'SF Mono', monospace;
    }
    &.highlight {
      color: #3b82f6;
      font-weight: 700;
    }
  }

  .action-bar {
    margin-top: 8px;
  }

  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--glass-border);
  }
  .picker-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .picker-list {
    padding: 8px 16px;
    overflow-y: auto;
  }
  .picker-item {
    padding: 12px;
    border-radius: 10px;
    margin-bottom: 6px;
    cursor: pointer;
    border: 1px solid var(--glass-border);
    transition: all 0.2s;
    &:active {
      transform: scale(0.98);
    }
    &.active {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.05);
    }
  }
  .picker-item-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .picker-item-sub {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-top: 4px;
  }
</style>
