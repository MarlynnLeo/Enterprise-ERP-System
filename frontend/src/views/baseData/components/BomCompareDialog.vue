<template>
  <AppDialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    title="BOM版本对比"
    mode="view"
    content-width="wide"
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
              remote
              reserve-keyword
              class="w-full"
              :loading="loadingList"
              :remote-method="searchBomOptions"
            >
              <el-option
                v-for="bom in allBomList"
                :key="'a-' + bom.id"
                :label="`${bom.label} - ${bom.version || 'V1.0'}${Number(bom.status) === 2 ? ' (历史)' : ''}`"
                :value="bom.id"
                :disabled="bom.id === selectedBomB"
              />
            </el-select>
          </el-card>
        </el-col>
        <el-col :span="2" class="flex-row flex-center">
          <el-icon :size="28" color="var(--color-primary)"><Switch /></el-icon>
        </el-col>
        <el-col :span="11">
          <el-card shadow="hover">
            <template #header><strong>📋 BOM B</strong></template>
            <el-select
              v-model="selectedBomB"
              placeholder="请选择第二个BOM"
              filterable
              remote
              reserve-keyword
              class="w-full"
              :loading="loadingList"
              :remote-method="searchBomOptions"
            >
              <el-option
                v-for="bom in allBomList"
                :key="'b-' + bom.id"
                :label="`${bom.label} - ${bom.version || 'V1.0'}${Number(bom.status) === 2 ? ' (历史)' : ''}`"
                :value="bom.id"
                :disabled="bom.id === selectedBomA"
              />
            </el-select>
          </el-card>
        </el-col>
      </el-row>
      <div class="text-center mt-20">
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
      <div class="mb-md flex-between">
        <el-button @click="compareResult = null" size="small">
          <el-icon><ArrowLeft /></el-icon> 重新选择
        </el-button>
        <div>
          <el-tag type="success" effect="plain" class="mr-8">
            ● 新增 {{ compareResult.stats.added }}
          </el-tag>
          <el-tag type="danger" effect="plain" class="mr-8">
            ● 删除 {{ compareResult.stats.removed }}
          </el-tag>
          <el-tag type="warning" effect="plain">
            ● 变更 {{ compareResult.stats.changed }}
          </el-tag>
        </div>
      </div>

      <!-- BOM头信息对比 -->
      <el-row :gutter="16" class="mb-md">
        <el-col :span="12">
          <el-card shadow="never" class="bom-header-card">
            <template #header>
              <strong>BOM A: {{ compareResult.bomA.productName }} - {{ compareResult.bomA.version }}</strong>
            </template>
            <p>产品编码: {{ compareResult.bomA.productCode }}</p>
            <p>物料数量: {{ compareResult.bomA.details.length }}</p>
            <p>状态: <el-tag :type="compareResult.bomA.approved ? 'success' : 'info'" size="small">{{ compareResult.bomA.approved ? '已审核' : '未审核' }}</el-tag></p>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never" class="bom-header-card">
            <template #header>
              <strong>BOM B: {{ compareResult.bomB.productName }} - {{ compareResult.bomB.version }}</strong>
            </template>
            <p>产品编码: {{ compareResult.bomB.productCode }}</p>
            <p>物料数量: {{ compareResult.bomB.details.length }}</p>
            <p>状态: <el-tag :type="compareResult.bomB.approved ? 'success' : 'info'" size="small">{{ compareResult.bomB.approved ? '已审核' : '未审核' }}</el-tag></p>
          </el-card>
        </el-col>
      </el-row>

      <!-- 差异明细表 -->
      <el-table :data="compareResult.diffRows" border class="w-full" :row-class-name="diffRowClass">
        <el-table-column label="差异类型" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.type === 'added'" type="success" size="small">新增</el-tag>
            <el-tag v-else-if="row.type === 'removed'" type="danger" size="small">删除</el-tag>
            <el-tag v-else-if="row.type === 'changed'" type="warning" size="small">变更</el-tag>
            <el-tag v-else type="info" size="small">相同</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="物料编码" prop="materialCode" width="120" />
        <el-table-column label="物料名称" prop="materialName" min-width="150" />
        <el-table-column label="BOM A 用量" width="110">
          <template #default="{ row }">
            <span :class="{ 'diff-value': row.type === 'changed' && row.qtyA !== row.qtyB }">
              {{ row.qtyA !== null ? row.qtyA : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="BOM B 用量" width="110">
          <template #default="{ row }">
            <span :class="{ 'diff-value': row.type === 'changed' && row.qtyA !== row.qtyB }">
              {{ row.qtyB !== null ? row.qtyB : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位" prop="unitName" width="80" />
        <el-table-column label="变更说明" min-width="180">
          <template #default="{ row }">
            <span v-if="row.type === 'added'" class="text-success">BOM A 新增此物料</span>
            <span v-else-if="row.type === 'removed'" class="text-danger">BOM A 中已移除此物料</span>
            <span v-else-if="row.type === 'changed'" class="text-warning">{{ row.changeDesc }}</span>
            <span v-else class="text-muted">无变化</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    </AppDialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { Switch, ArrowLeft } from '@element-plus/icons-vue'
import { bomApi } from '@/api'
import { parseResponseData } from '@/utils/responseParser'
import { normalizeBomOption, searchBomOptions as fetchBomOptions } from '@/utils/optionLoaders'
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
let bomSearchId = 0

const mergeBomOptions = (items = []) => {
  const selectedIds = new Set([selectedBomA.value, selectedBomB.value].filter(Boolean))
  const selectedItems = allBomList.value.filter(item => selectedIds.has(item.id))
  const next = []
  ;[...selectedItems, ...items].forEach(item => {
    if (item?.id && !next.some(existing => existing.id === item.id)) {
      next.push(item)
    }
  })
  allBomList.value = next
}

const searchBomOptions = async (query = '') => {
  const searchId = ++bomSearchId
  loadingList.value = true
  try {
    const list = await fetchBomOptions(query, { includeHistory: true })
    if (searchId === bomSearchId) {
      mergeBomOptions(list)
    }
  } catch (err) {
    console.error('获取BOM列表失败:', err)
    if (searchId === bomSearchId) {
      allBomList.value = props.bomList.map(normalizeBomOption)
    }
  } finally {
    if (searchId === bomSearchId) {
      loadingList.value = false
    }
  }
}

// 每次弹窗打开时重新获取包含历史版本的BOM列表
watch(() => props.modelValue, async (visible) => {
  if (visible) {
    // 重置选择状态
    selectedBomA.value = null
    selectedBomB.value = null
    compareResult.value = null

    await searchBomOptions('')
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

    const bomA = parseResponseData(resA)
    const bomB = parseResponseData(resB)

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

  detailsA.forEach(d => mapA.set(d.materialId, d))
  detailsB.forEach(d => mapB.set(d.materialId, d))

  const diffRows = []
  let added = 0, removed = 0, changed = 0

    // 遍历A（新版本）中的物料
    for (const [matId, detA] of mapA) {
      if (mapB.has(matId)) {
        const detB = mapB.get(matId)
        const changes = []

        const baseA = Number(detA.baseQuantity) > 0 ? Number(detA.baseQuantity) : 1
        const baseB = Number(detB.baseQuantity) > 0 ? Number(detB.baseQuantity) : 1
        const critA = Boolean(detA.isCritical)
        const critB = Boolean(detB.isCritical)

        if (Number(detA.quantity) !== Number(detB.quantity) || baseA !== baseB) {
          const textA = baseA > 1 ? `${detA.quantity}(每${baseA})` : `${detA.quantity}`
          const textB = baseB > 1 ? `${detB.quantity}(每${baseB})` : `${detB.quantity}`
          changes.push(`用量/基数: ${textB} → ${textA}`)
        }
        if (critA !== critB) {
          changes.push(`关键件: ${critB ? '是' : '否'} → ${critA ? '是' : '否'}`)
        }
        if ((detA.remark || '') !== (detB.remark || '')) {
          changes.push('备注变更')
        }

        if (changes.length > 0) {
          changed++
          diffRows.push({
            type: 'changed',
            material_code: detA.materialCode,
            material_name: detA.materialName,
            qty_a: detA.quantity,
            qty_b: detB.quantity,
            unit_name: detA.unitName || detB.unitName,
            changeDesc: changes.join('；')
          })
        } else {
          diffRows.push({
            type: 'same',
            material_code: detA.materialCode,
            material_name: detA.materialName,
            qty_a: detA.quantity,
            qty_b: detB.quantity,
            unit_name: detA.unitName,
            changeDesc: ''
          })
        }
      } else {
        // A有B没有 → 新版本新增了此物料
        added++
        diffRows.push({
          type: 'added',
          material_code: detA.materialCode,
          material_name: detA.materialName,
          qty_a: detA.quantity,
          qty_b: null,
          unit_name: detA.unitName,
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
          material_code: detB.materialCode,
          material_name: detB.materialName,
          qty_a: null,
          qty_b: detB.quantity,
          unit_name: detB.unitName,
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
  background-color: var(--ds-green-bg) !important;
}

:deep(.diff-row-removed) {
  background-color: var(--ds-red-bg) !important;
}

:deep(.diff-row-changed) {
  background-color: var(--ds-yellow-bg) !important;
}
</style>
