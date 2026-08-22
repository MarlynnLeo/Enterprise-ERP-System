<template>
  <AppDialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    :title="dialogTitle"
    mode="form"
    wide
    @open="handleOpen"
    @close="handleClose"
  >
    <div v-loading="loading" class="metal-price-dialog">
      <el-alert type="info" :closable="false" show-icon class="mb-12" title="按供应商维护金属价区间报价。采购下单时系统会写入当日金属价，并自动匹配对应区间单价。" />
      <el-form :model="form" label-width="100px" class="mb-12">
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="方案名称"><el-input v-model="form.name" placeholder="例如：铝价区间报价" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="金属类型"><el-select v-model="form.metalSymbol" class="w-full"><el-option label="铝 ALUMINUM" value="ALUMINUM" /><el-option label="铜 COPPER" value="COPPER" /><el-option label="银 SILVER" value="SILVER" /><el-option label="金 GOLD" value="GOLD" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="档位步长"><el-input-number v-model="form.bandStep" :min="1" :step="100" class="w-full" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="启用"><el-switch v-model="form.isEnabled" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="默认方案"><el-switch v-model="form.isDefault" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="备注"><el-input v-model="form.remark" placeholder="可选" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <div class="section-header"><div class="section-title">金属价区间</div><el-button size="small" type="primary" @click="addBand">新增区间</el-button></div>
      <el-table :data="form.bands" border size="small" class="mb-16">
        <el-table-column label="起始价" min-width="140"><template #default="{ row }"><el-input-number v-model="row.metalPriceMin" :min="0" :step="form.bandStep || 1000" controls-position="right" class="w-full" @change="syncBandLabels" /></template></el-table-column>
        <el-table-column label="结束价" min-width="140"><template #default="{ row }"><el-input-number v-model="row.metalPriceMax" :min="0" :step="form.bandStep || 1000" controls-position="right" class="w-full" @change="syncBandLabels" /></template></el-table-column>
        <el-table-column label="区间标签" min-width="160"><template #default="{ row }"><el-input v-model="row.label" placeholder="自动生成" /></template></el-table-column>
        <el-table-column label="操作" width="90" fixed="right" class-name="operation-column" header-class-name="operation-column-header"><template #default="{ $index }"><el-button link type="danger" @click="removeBand($index)">删除</el-button></template></el-table-column>
      </el-table>
      <div class="section-header"><div class="section-title">物料区间单价</div><el-button size="small" type="primary" @click="addItem">新增物料</el-button></div>
      <el-table :data="form.items" border size="small" max-height="420">
        <el-table-column label="物料编码" min-width="140" fixed="left"><template #default="{ row }"><el-input v-model="row.materialCode" placeholder="物料编码" /></template></el-table-column>
        <el-table-column label="物料名称" min-width="160"><template #default="{ row }"><el-input v-model="row.materialName" placeholder="可选" /></template></el-table-column>
        <el-table-column label="规格" min-width="140"><template #default="{ row }"><el-input v-model="row.specification" placeholder="可选" /></template></el-table-column>
        <el-table-column v-for="(band, bandIndex) in form.bands" :key="bandIndex + '-' + (band.metalPriceMin)" :label="band.label || ((band.metalPriceMin || 0) + '-' + (band.metalPriceMax || 0))" min-width="130">
          <template #default="{ row }"><el-input-number v-model="row.bandPrices[bandIndex]" :min="0" :precision="4" :step="0.01" controls-position="right" class="w-full" /></template>
        </el-table-column>
        <el-table-column label="差价/档" min-width="110"><template #default="{ row }"><el-input-number v-model="row.priceStep" :min="0" :precision="4" :step="0.01" controls-position="right" class="w-full" /></template></el-table-column>
        <el-table-column label="备注" min-width="140"><template #default="{ row }"><el-input v-model="row.remark" /></template></el-table-column>
        <el-table-column label="操作" width="90" fixed="right" class-name="operation-column" header-class-name="operation-column-header"><template #default="{ $index }"><el-button link type="danger" @click="removeItem($index)">删除</el-button></template></el-table-column>
      </el-table>
    </div>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存区间报价</el-button>
    </template>
    </AppDialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { supplierApi } from '@/api/supplier'
import { parseResponseData } from '@/utils/responseParser'

const props = defineProps({ modelValue: Boolean, supplier: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'success'])
const loading = ref(false)
const saving = ref(false)
const form = reactive({ id: null, name: '默认铝价区间报价', metal_symbol: 'ALUMINUM', metal_unit: '¥/吨', band_step: 1000, is_enabled: true, is_default: true, remark: '', bands: [{ metal_price_min: 22000, metal_price_max: 23000, label: '22000-23000' }, { metal_price_min: 23001, metal_price_max: 24000, label: '23001-24000' }, { metal_price_min: 24001, metal_price_max: 25000, label: '24001-25000' }], items: [] })
const dialogTitle = computed(() => { const name = props.supplier?.name || props.supplier?.supplierName || ''; return name ? ('区间报价设置 - ' + name) : '区间报价设置' })
function createEmptyItem() { return { material_code: '', material_name: '', specification: '', price_step: null, remark: '', band_prices: form.bands.map(() => null) } }
function syncItemPriceColumns() { form.items.forEach((item) => { item.bandPrices = form.bands.map((_, index) => (Array.isArray(item.bandPrices) ? item.bandPrices[index] : null) ?? null) }) }
function syncBandLabels() { form.bands.forEach((band) => { if (!band.label || /^\d+-\d+$/.test(String(band.label))) { const min = Number(band.metal_price_min || 0); const max = Number(band.metal_price_max || 0); band.label = Math.round(min) + '-' + Math.round(max) } }); syncItemPriceColumns() }
function addBand() { const last = form.bands[form.bands.length - 1]; const step = Number(form.bandStep || 1000); const min = last ? Number(last.metal_price_max || 0) + 1 : 20000; const max = min + step - 1; form.bands.push({ metal_price_min: min, metal_price_max: max, label: min + '-' + max }); syncItemPriceColumns() }
function removeBand(index) { if (form.bands.length <= 1) { ElMessage.warning('至少保留一个区间'); return } form.bands.splice(index, 1); syncItemPriceColumns() }
function addItem() { form.items.push(createEmptyItem()) }
function removeItem(index) { form.items.splice(index, 1) }
function resetForm() { form.id = null; form.name = '默认铝价区间报价'; form.metalSymbol = 'ALUMINUM'; form.metalUnit = '¥/吨'; form.bandStep = 1000; form.isEnabled = true; form.isDefault = true; form.remark = ''; form.bands = [{ metal_price_min: 22000, metal_price_max: 23000, label: '22000-23000' }, { metal_price_min: 23001, metal_price_max: 24000, label: '23001-24000' }, { metal_price_min: 24001, metal_price_max: 25000, label: '24001-25000' }]; form.items = [createEmptyItem()] }
function applyScheme(scheme) { form.id = scheme.id; form.name = scheme.name || '默认铝价区间报价'; form.metalSymbol = scheme.metal_symbol || 'ALUMINUM'; form.metalUnit = scheme.metal_unit || '¥/吨'; form.bandStep = Number(scheme.band_step || 1000); form.isEnabled = scheme.is_enabled !== false; form.isDefault = scheme.isDefault !== false; form.remark = scheme.remark || ''; form.bands = (scheme.bands || []).map((band) => ({ metal_price_min: Number(band.metal_price_min), metal_price_max: Number(band.metal_price_max), label: band.label || (Math.round(band.metal_price_min) + '-' + Math.round(band.metal_price_max)) })); if (!form.bands.length) form.bands = [{ metal_price_min: 22000, metal_price_max: 23000, label: '22000-23000' }]; form.items = (scheme.items || []).map((item) => { const priceMap = new Map(); (item.bandPrices || []).forEach((price) => { const key = price.label || (Math.round(price.metal_price_min) + '-' + Math.round(price.metal_price_max)); priceMap.set(key, Number(price.unitPrice)); priceMap.set(String(price.band_index), Number(price.unitPrice)); }); return { material_id: item.materialId, material_code: item.materialCode || '', material_name: item.materialName || '', specification: item.specification || '', price_step: item.priceStep == null ? null : Number(item.priceStep), remark: item.remark || '', band_prices: form.bands.map((band, index) => priceMap.get(band.label) ?? priceMap.get(String(index)) ?? null) }; }); if (!form.items.length) form.items = [createEmptyItem()]; }
async function loadScheme() { if (!props.supplier?.id) return; loading.value = true; try { const listRes = await supplierApi.getSupplierMetalPriceSchemes(props.supplier.id); const list = parseResponseData(listRes) || []; const preferred = list.find((item) => item.isDefault) || list[0]; if (!preferred) { resetForm(); return } const detailRes = await supplierApi.getSupplierMetalPriceScheme(props.supplier.id, preferred.id); const detail = parseResponseData(detailRes); if (detail) applyScheme(detail); else resetForm(); } catch (error) { console.error(error); resetForm(); ElMessage.warning(error?.response?.data?.message || '暂无区间报价，可直接新建'); } finally { loading.value = false } }
async function handleOpen() { resetForm(); await loadScheme() }
function handleClose() { emit('update:modelValue', false) }
async function handleSave() { if (!props.supplier?.id) { ElMessage.error('缺少供应商信息'); return } if (!form.bands.length) { ElMessage.error('请至少配置一个金属价区间'); return } const validItems = form.items.filter((item) => String(item.materialCode || '').trim()); if (!validItems.length) { ElMessage.error('请至少配置一个物料编码'); return } const payload = { id: form.id, name: form.name, metal_symbol: form.metalSymbol, metal_unit: form.metalUnit, band_step: form.bandStep, is_enabled: form.isEnabled, is_default: form.isDefault, remark: form.remark, bands: form.bands.map((band, index) => ({ band_index: index, metal_price_min: band.metal_price_min, metal_price_max: band.metal_price_max, label: band.label })), items: validItems.map((item, index) => ({ material_id: item.materialId || null, material_code: String(item.materialCode).trim(), material_name: item.materialName || '', specification: item.specification || '', price_step: item.priceStep, remark: item.remark || '', sort_order: index, band_prices: form.bands.map((band, bandIndex) => item.bandPrices?.[bandIndex]) })) }; saving.value = true; try { if (form.id) await supplierApi.updateSupplierMetalPriceScheme(props.supplier.id, form.id, payload); else await supplierApi.createSupplierMetalPriceScheme(props.supplier.id, payload); ElMessage.success('区间报价已保存'); emit('success'); handleClose(); } catch (error) { console.error(error); ElMessage.error(error?.response?.data?.message || error.message || '保存失败'); } finally { saving.value = false } }
</script>

<style scoped>
.metal-price-dialog { min-height: 240px; }
.mb-12 { margin-bottom: 12px; }
.mb-16 { margin-bottom: 16px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.section-title { font-weight: 600; }
.w-full { width: 100%; }
</style>
