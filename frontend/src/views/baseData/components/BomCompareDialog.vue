<template>
  <el-dialog
    title="BOM版本对比"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="50%"
    top="3vh"
    destroy-on-close
  >
    <!-- 选择两个BOM -->
    <div class="compare-selector" v-if="!compareResult">
      <el-row :gutter="20">
        <el-col :span="11">
          <el-card shadow="hover">
            <template #header><strong>📋 BOM A</strong></template>
            <el-select
              v-model="selectedBomA"
              placeholder="请选择第一个BOM"
              filterable
              style="width: 100%"
              :loading="loadingList"
            >
              <el-option
                v-for="bom in allBomList"
                :key="'a-' + bom.id"
                :label="`${bom.product_code || ''} - ${bom.product_name || '未知产品'} - ${bom.version || 'V1.0'}${Number(bom.status) === 2 ? ' (历史)' : ''}`"
                :value="bom.id"
                :disabled="bom.id === selectedBomB"
              />
            </el-select>
          </el-card>
        </el-col>
        <el-col :span="2" style="display: flex; align-items: center; justify-content: center;">
          <el-icon :size="28" color="#409EFF"><Switch /></el-icon>
        </el-col>
        <el-col :span="11">
          <el-card shadow="hover">
            <template #header><strong>📋 BOM B</strong></template>
            <el-select
              v-model="selectedBomB"
              placeholder="请选择第二个BOM"
              filterable
              style="width: 100%"
              :loading="loadingList"
            >
              <el-option
                v-for="bom in allBomList"
                :key="'b-' + bom.id"
                :label="`${bom.product_code || ''} - ${bom.product_name || '未知产品'} - ${bom.version || 'V1.0'}${Number(bom.status) === 2 ? ' (历史)' : ''}`"
                :value="bom.id"
                :disabled="bom.id === selectedBomA"
              />
            </el-select>
          </el-card>
        </el-col>
      </el-row>
      <div style="text-align: center; margin-top: 20px;">
        <el-button
          type="primary"
          :disabled="!selectedBomA || !selectedBomB"
          :loading="comparing"
          @click="doCompare"
        >
          开始对比
        </el-button>
      </div>
    </div>

    <!-- 对比结果 -->
    <div v-if="compareResult" class="compare-result">
      <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <el-button @click="compareResult = null" size="small">
          <el-icon><ArrowLeft /></el-icon> 重新选择
        </el-button>
        <div>
          <el-tag type="success" effect="plain" style="margin-right: 8px;">
            ● 新增 {{ compareResult.stats.added }}
          </el-tag>
          <el-tag type="danger" effect="plain" style="margin-right: 8px;">
            ● 删除 {{ compareResult.stats.removed }}
          </el-tag>
          <el-tag type="warning" effect="plain">
            ● 变更 {{ compareResult.stats.changed }}
          </el-tag>
        </div>
      </div>

      <!-- BOM头信息对比 -->
      <el-row :gutter="16" style="margin-bottom: 16px;">
        <el-col :span="12">
          <el-card shadow="never" class="bom-header-card">
            <template #header>
              <strong>BOM A: {{ compareResult.bomA.product_name }} - {{ compareResult.bomA.version }}</strong>
            </template>
            <p>产品编码: {{ compareResult.bomA.product_code }}</p>
            <p>物料数量: {{ compareResult.bomA.details.length }}</p>
            <p>状态: <el-tag :type="compareResult.bomA.approved ? 'success' : 'info'" size="small">{{ compareResult.bomA.approved ? '已审核' : '未审核' }}</el-tag></p>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never" class="bom-header-card">
            <template #header>
              <strong>BOM B: {{ compareResult.bomB.product_name }} - {{ compareResult.bomB.version }}</strong>
            </template>
            <p>产品编码: {{ compareResult.bomB.product_code }}</p>
            <p>物料数量: {{ compareResult.bomB.details.length }}</p>
            <p>状态: <el-tag :type="compareResult.bomB.approved ? 'success' : 'info'" size="small">{{ compareResult.bomB.approved ? '已审核' : '未审核' }}</el-tag></p>
          </el-card>
        </el-col>
      </el-row>

      <!-- 差异明细表 -->
      <el-table :data="compareResult.diffRows" border style="width: 100%" :row-class-name="diffRowClass">
        <el-table-column label="差异类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.type === 'added'" type="success" size="small">新增</el-tag>
            <el-tag v-else-if="row.type === 'removed'" type="danger" size="small">删除</el-tag>
            <el-tag v-else-if="row.type === 'changed'" type="warning" size="small">变更</el-tag>
            <el-tag v-else type="info" size="small">相同</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="物料编码" prop="material_code" width="120" />
        <el-table-column label="物料名称" prop="material_name" min-width="150" />
        <el-table-column label="BOM A 用量" width="110" align="center">
          <template #default="{ row }">
            <span :class="{ 'diff-value': row.type === 'changed' && row.qty_a !== row.qty_b }">
              {{ row.qty_a !== null ? row.qty_a : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="BOM B 用量" width="110" align="center">
          <template #default="{ row }">
            <span :class="{ 'diff-value': row.type === 'changed' && row.qty_a !== row.qty_b }">
              {{ row.qty_b !== null ? row.qty_b : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位" prop="unit_name" width="80" />
        <el-table-column label="变更说明" min-width="180">
          <template #default="{ row }">
            <span v-if="row.type === 'added'" style="color: var(--color-success);">BOM A 新增此物料</span>
            <span v-else-if="row.type === 'removed'" style="color: var(--color-danger);">BOM A 中已移除此物料</span>
            <span v-else-if="row.type === 'changed'" style="color: var(--color-warning);">{{ row.changeDesc }}</span>
            <span v-else style="color: var(--color-text-secondary);">无变化</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Switch, ArrowLeft } from '@element-plus/icons-vue'
import { bomApi } from '@/api/bom'
import { parsePaginatedData } from '@/utils/responseParser'
const props = defineProps({
  modelValue: Boolean,
  bomList: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const selectedBomA = ref(null)
const selectedBomB = ref(null)
const comparing = ref(false)
const compareResult = ref(null)
// 包含历史版本的完整BOM列表（用于版本对比选择）
const allBomList = ref([])
const loadingList = ref(false)

// 每次弹窗打开时重新获取包含历史版本的BOM列表
watch(() => props.modelValue, async (visible) => {
  if (visible) {
    // 重置选择状态
    selectedBomA.value = null
    selectedBomB.value = null
    compareResult.value = null
    
    loadingList.value = true
    try {
      const res = await bomApi.getBoms({ page: 1, pageSize: 500, includeHistory: true })
      const { list } = parsePaginatedData(res)
      allBomList.value = list || []
    } catch (err) {
      console.error('获取BOM列表失败:', err)
      // 兜底使用父组件传入的列表
      allBomList.value = props.bomList
    } finally {
      loadingList.value = false
    }
  }
})

// 执行对比
const doCompare = async () => {
  if (!selectedBomA.value || !selectedBomB.value) {
    ElMessage.warning('请选择两个BOM进行对比')
    return
  }

  comparing.value = true
  try {
    // 并行获取两个BOM的详细数据
    const [resA, resB] = await Promise.all([
      bomApi.getBom(selectedBomA.value),
      bomApi.getBom(selectedBomB.value)
    ])

    const bomA = resA.data?.data || resA.data || resA
    const bomB = resB.data?.data || resB.data || resB

    // 执行差异对比
    compareResult.value = computeDiff(bomA, bomB)
  } catch (error) {
    console.error('BOM对比失败:', error)
    ElMessage.error('获取BOM数据失败')
  } finally {
    comparing.value = false
  }
}

// 计算差异
const computeDiff = (bomA, bomB) => {
  const detailsA = bomA.details || []
  const detailsB = bomB.details || []

  // 以物料ID为key构建map
  const mapA = new Map()
  const mapB = new Map()

  detailsA.forEach(d => mapA.set(d.material_id, d))
  detailsB.forEach(d => mapB.set(d.material_id, d))

  const diffRows = []
  let added = 0, removed = 0, changed = 0

    // 遍历A（新版本）中的物料
    for (const [matId, detA] of mapA) {
      if (mapB.has(matId)) {
        const detB = mapB.get(matId)
        const changes = []

        if (Number(detA.quantity) !== Number(detB.quantity)) {
          changes.push(`用量: ${detB.quantity} → ${detA.quantity}`)
        }
        if ((detA.remark || '') !== (detB.remark || '')) {
          changes.push('备注变更')
        }

        if (changes.length > 0) {
          changed++
          diffRows.push({
            type: 'changed',
            material_code: detA.material_code,
            material_name: detA.material_name,
            qty_a: detA.quantity,
            qty_b: detB.quantity,
            unit_name: detA.unit_name || detB.unit_name,
            changeDesc: changes.join('；')
          })
        } else {
          diffRows.push({
            type: 'same',
            material_code: detA.material_code,
            material_name: detA.material_name,
            qty_a: detA.quantity,
            qty_b: detB.quantity,
            unit_name: detA.unit_name,
            changeDesc: ''
          })
        }
      } else {
        // A有B没有 → 新版本新增了此物料
        added++
        diffRows.push({
          type: 'added',
          material_code: detA.material_code,
          material_name: detA.material_name,
          qty_a: detA.quantity,
          qty_b: null,
          unit_name: detA.unit_name,
          changeDesc: ''
        })
      }
    }

    // 遍历B（旧版本）中A没有的物料 → 新版本删除了此物料
    for (const [matId, detB] of mapB) {
      if (!mapA.has(matId)) {
        removed++
        diffRows.push({
          type: 'removed',
          material_code: detB.material_code,
          material_name: detB.material_name,
          qty_a: null,
          qty_b: detB.quantity,
          unit_name: detB.unit_name,
          changeDesc: ''
        })
      }
    }

  // 排序：变更→新增→删除→相同
  const typeOrder = { changed: 0, added: 1, removed: 2, same: 3 }
  diffRows.sort((a, b) => typeOrder[a.type] - typeOrder[b.type])

  return {
    bomA,
    bomB,
    diffRows,
    stats: { added, removed, changed }
  }
}

// 行样式
const diffRowClass = ({ row }) => {
  if (row.type === 'added') return 'diff-row-added'
  if (row.type === 'removed') return 'diff-row-removed'
  if (row.type === 'changed') return 'diff-row-changed'
  return ''
}
</script>

<style scoped>
.compare-selector {
  padding: 20px 0;
}

.bom-header-card p {
  margin: 4px 0;
  font-size: 13px;
  color: var(--color-text-regular);
}

.diff-value {
  font-weight: bold;
  color: var(--color-warning);
}

:deep(.diff-row-added) {
  background-color: #f0f9eb !important;
}

:deep(.diff-row-removed) {
  background-color: #fef0f0 !important;
}

:deep(.diff-row-changed) {
  background-color: #fdf6ec !important;
}
</style>
