<template>
  <div class="ncp-config-container">
    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <span><el-icon style="vertical-align: middle; margin-right: 4px;"><Setting /></el-icon> 不合格品自动处理配置</span>
          <el-tag :type="config.enable ? 'success' : 'info'">
            {{ config.enable ? '已启用' : '已禁用' }}
          </el-tag>
        </div>
      </template>

      <el-form :model="config" label-width="180px">
        <el-divider content-position="left">基础配置</el-divider>
        
        <el-form-item label="启用自动处理决策">
          <el-switch 
            v-model="config.enable" 
            active-text="启用" 
            inactive-text="禁用"
            @change="handleConfigChange"
          />
          <div class="form-item-tip">
            启用后,系统将根据规则自动判断不合格品的处理方式
          </div>
        </el-form-item>

        <el-form-item label="自动完成处理">
          <el-switch 
            v-model="config.auto_complete" 
            active-text="启用" 
            inactive-text="禁用"
            :disabled="!config.enable"
            @change="handleConfigChange"
          />
          <div class="form-item-tip">
            启用后,系统将自动完成处理,无需人工确认(谨慎使用)
          </div>
        </el-form-item>

        <el-form-item label="通知相关人员">
          <el-switch 
            v-model="config.notify_users" 
            active-text="启用" 
            inactive-text="禁用"
            :disabled="!config.enable"
            @change="handleConfigChange"
          />
          <div class="form-item-tip">
            启用后,系统将通知相关人员不合格品的处理决策
          </div>
        </el-form-item>

        <el-divider content-position="left">自动处理规则</el-divider>

        <el-table :data="config.rules" border style="width: 100%">
          <el-table-column prop="name" label="规则名称" width="200" />
          <el-table-column prop="inspection_type" label="检验类型" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.inspection_type === 'incoming'" type="primary">来料检验</el-tag>
              <el-tag v-else-if="row.inspection_type === 'process'" type="warning">过程检验</el-tag>
              <el-tag v-else-if="row.inspection_type === 'final'" type="success">成品检验</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="severity" label="严重程度" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.severity === 'critical'" type="danger">致命</el-tag>
              <el-tag v-else-if="row.severity === 'major'" type="warning">严重</el-tag>
              <el-tag v-else-if="row.severity === 'minor'" type="info">轻微</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="min_unqualified_rate" label="最小不合格率" width="130">
            <template #default="{ row }">
              {{ row.min_unqualified_rate ? row.min_unqualified_rate + '%' : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="disposition" label="处理方式" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.disposition === 'return'" type="primary">退货</el-tag>
              <el-tag v-else-if="row.disposition === 'rework'" type="warning">返工</el-tag>
              <el-tag v-else-if="row.disposition === 'scrap'" type="danger">报废</el-tag>
              <el-tag v-else-if="row.disposition === 'use_as_is'" type="success">让步接收</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="处理原因" show-overflow-tooltip />
        </el-table>

        <el-divider />

        <el-form-item>
          <el-button v-permission="'quality:nonconforming:update'" type="primary" @click="saveConfig">保存配置</el-button>
          <el-button @click="loadConfig">重新加载</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="info-card" style="margin-top: 20px;">
      <template #header>
        <span><el-icon style="vertical-align: middle; margin-right: 4px;"><Document /></el-icon> 使用说明</span>
      </template>
      <el-alert type="info" :closable="false">
        <template #default>
          <h4>自动处理流程:</h4>
          <ol>
            <li><strong>检验完成</strong> - 当检验单完成且有不合格品时,系统自动创建不合格品记录</li>
            <li><strong>智能判断</strong> - 系统根据检验类型、严重程度、不合格率等自动判断责任方和严重程度</li>
            <li><strong>规则匹配</strong> - 如果启用自动处理,系统将匹配预设规则,自动设置处理方式</li>
            <li><strong>自动完成</strong> - 如果启用自动完成,系统将直接完成处理,无需人工确认</li>
            <li><strong>通知提醒</strong> - 如果启用通知,系统将通知相关人员</li>
          </ol>
          <h4>注意事项:</h4>
          <ul>
            <li><el-icon style="color: var(--color-warning); vertical-align: middle;"><Warning /></el-icon> 自动完成功能会跳过人工审核,请谨慎使用</li>
            <li><el-icon style="color: var(--color-primary); vertical-align: middle;"><InfoFilled /></el-icon> 建议先启用自动处理决策,观察一段时间后再考虑启用自动完成</li>
            <li><el-icon style="color: var(--color-text-secondary); vertical-align: middle;"><Setting /></el-icon> 可以根据企业实际情况调整规则(需要修改后端代码)</li>
          </ul>
        </template>
      </el-alert>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
const config = ref({
  enable: false,
  auto_complete: false,
  notify_users: true,
  rules: []
})

const loadConfig = async () => {
  try {
    const response = await request.get('/nonconforming-products/config/auto-disposition')
    // 拦截器已解包，response.data 就是业务数据
    config.value = response.data
    ElMessage.success('配置加载成功')
  } catch (error) {
    console.error('Failed to load config:', error)
    ElMessage.error('加载配置失败')
  }
}

const saveConfig = async () => {
  try {
    const response = await request.put('/nonconforming-products/config/auto-disposition', {
      enable: config.value.enable,
      auto_complete: config.value.auto_complete,
      notify_users: config.value.notify_users
    })
    // 拦截器已解包，response.data 就是业务数据
    config.value = response.data
    ElMessage.success('配置保存成功')
  } catch (error) {
    console.error('Failed to save config:', error)
    ElMessage.error('保存配置失败')
  }
}

const handleConfigChange = () => {
  // 配置变更时的提示
  if (config.value.auto_complete && config.value.enable) {
    ElMessage.warning('自动完成功能已启用,系统将自动处理不合格品,请谨慎使用!')
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.ncp-config-container {
  padding: 20px;
}

.config-card {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
}

.form-item-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 5px;
}

.info-card {
  max-width: 1200px;
  margin: 20px auto 0;
}

.info-card h4 {
  margin-top: 10px;
  margin-bottom: 5px;
  color: var(--color-primary);
}

.info-card ol, .info-card ul {
  margin: 5px 0;
  padding-left: 20px;
}

.info-card li {
  margin: 5px 0;
  line-height: 1.6;
}
</style>

