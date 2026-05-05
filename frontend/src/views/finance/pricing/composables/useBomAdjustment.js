/**
 * BOM价格调整相关逻辑复用
 * 包含BOM查看、价格调整、历史记录等功能
 */
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { financeApi } from '@/api/finance';

export function useBomAdjustment() {
    // ========== BOM预览对话框状态 ==========
    const bomVisible = ref(false);
    const bomLoading = ref(false);
    const bomDialogMode = ref('preview'); // 'preview' | 'edit'
    const bomData = ref({
        hasBom: false,
        bom: null,
        details: [],
        totalCost: 0,
        lastSavedCost: 0,
        costVariance: 0,
        lastPricingDate: null
    });

    // ========== BOM价格调整对话框状态(简化版) ==========
    const bomPriceDialogVisible = ref(false);
    const bomPriceLoading = ref(false);
    const bomPriceData = ref({
        hasBom: false,
        details: [],
        totalCost: 0
    });

    // ========== 价格调整表单状态 ==========
    const priceAdjustDialogVisible = ref(false);
    const priceAdjustSubmitting = ref(false);
    const priceAdjustFormRef = ref(null);
    const priceAdjustForm = reactive({
        product_id: null,
        bom_id: null,
        material_id: null,
        material_name: '',
        material_code: '',
        original_price: 0,
        adjusted_price: 0,
        adjustment_reason: ''
    });

    // ========== 价格调整历史状态 ==========
    const priceHistoryDialogVisible = ref(false);
    const priceHistory = ref([]);
    const currentHistoryMaterial = ref('');

    // ========== 定价历史对话框状态 ==========
    const historyVisible = ref(false);
    const historyData = ref([]);

    // ========== 方法 ==========

    // 查看BOM预览 (只读模式)
    const handleViewBom = async (row, mode = 'preview', currentProduct = null) => {
        bomDialogMode.value = mode;
        bomVisible.value = true;
        bomLoading.value = true;
        bomData.value = {
            hasBom: false,
            bom: null,
            details: [],
            totalCost: 0,
            lastSavedCost: 0,
            costVariance: 0,
            lastPricingDate: null
        };

        if (currentProduct) {
            currentProduct.value = { ...row, strategies: [] };
        }

        try {
            const [bomRes, detailRes] = await Promise.all([
                financeApi.getBomDetails(row.product_id),
                financeApi.getPricingDetail(row.product_id)
            ]);

            bomData.value = bomRes.data;

            if (currentProduct && detailRes.data.strategies) {
                currentProduct.value.strategies = detailRes.data.strategies;
            }
        } catch (error) {
            ElMessage.error('获取BOM明细失败: ' + (error.response?.data?.message || error.message || '未知错误'));
        } finally {
            bomLoading.value = false;
        }
    };

    // 打开BOM价格调整对话框 (定价设置专用)
    const handleViewBomPrice = async (productId) => {
        bomPriceDialogVisible.value = true;
        bomPriceLoading.value = true;
        bomPriceData.value = {
            hasBom: false,
            details: [],
            totalCost: 0
        };

        try {
            const res = await financeApi.getBomDetails(productId);
            bomPriceData.value = res.data;
        } catch (error) {
            ElMessage.error('获取BOM明细失败: ' + (error.response?.data?.message || error.message || '未知错误'));
        } finally {
            bomPriceLoading.value = false;
        }
    };

    // 刷新BOM价格数据
    const refreshBomPrice = async (productId) => {
        bomPriceLoading.value = true;
        try {
            const res = await financeApi.getBomDetails(productId);
            bomPriceData.value = res.data;
        } catch {
            ElMessage.error('刷新BOM明细失败');
        } finally {
            bomPriceLoading.value = false;
        }
    };

    // 打开价格调整对话框
    const openPriceAdjustDialog = (row, productId) => {
        const actualBomId = bomData.value?.bom?.id || bomPriceData.value?.bom?.id || row.bom_id;

        Object.assign(priceAdjustForm, {
            product_id: productId,
            bom_id: actualBomId,
            material_id: row.material_id,
            material_name: row.material_name,
            material_code: row.material_code,
            original_price: Number(row.original_price || row.current_price) || 0,
            adjusted_price: Number(row.adjusted_price || row.current_price) || 0,
            adjustment_reason: ''
        });
        priceAdjustDialogVisible.value = true;
    };

    // 保存价格调整
    const savePriceAdjustment = async (productId) => {
        if (!priceAdjustForm.adjustment_reason || priceAdjustForm.adjustment_reason.trim() === '') {
            ElMessage.warning('请填写调整原因');
            return false;
        }

        if (priceAdjustForm.adjusted_price < 0) {
            ElMessage.warning('调整后价格不能为负数');
            return false;
        }

        try {
            priceAdjustSubmitting.value = true;
            await financeApi.saveBomPriceAdjustment(priceAdjustForm);
            ElMessage.success('价格调整成功');
            priceAdjustDialogVisible.value = false;

            // 刷新数据
            if (productId) {
                if (bomPriceDialogVisible.value) {
                    await refreshBomPrice(productId);
                } else if (bomVisible.value) {
                    await handleViewBom({ product_id: productId }, bomDialogMode.value);
                }
            }
            return true;
        } catch (error) {
            console.error('保存价格调整失败:', error);
            ElMessage.error(error.response?.data?.message || '保存失败');
            return false;
        } finally {
            priceAdjustSubmitting.value = false;
        }
    };

    // 查看价格调整历史
    const viewPriceHistory = async (row, productId) => {
        try {
            currentHistoryMaterial.value = `${row.material_name} (${row.material_code})`;
            const res = await financeApi.getBomPriceHistory(productId, row.material_id);
            priceHistory.value = res.data || [];
            priceHistoryDialogVisible.value = true;
        } catch (error) {
            console.error('获取调整历史失败:', error);
            ElMessage.error('获取调整历史失败');
        }
    };

    // 查看定价历史
    const handleHistory = async (row) => {
        historyVisible.value = true;
        historyData.value = [];
        try {
            const res = await financeApi.getPricingHistory(row.product_id);
            historyData.value = res.data;
        } catch {
            ElMessage.error('获取历史记录失败');
        }
    };

    return {
        // BOM预览状态
        bomVisible,
        bomLoading,
        bomDialogMode,
        bomData,
        // BOM价格调整状态
        bomPriceDialogVisible,
        bomPriceLoading,
        bomPriceData,
        // 价格调整表单状态
        priceAdjustDialogVisible,
        priceAdjustSubmitting,
        priceAdjustFormRef,
        priceAdjustForm,
        // 历史状态
        priceHistoryDialogVisible,
        priceHistory,
        currentHistoryMaterial,
        historyVisible,
        historyData,
        // 方法
        handleViewBom,
        handleViewBomPrice,
        refreshBomPrice,
        openPriceAdjustDialog,
        savePriceAdjustment,
        viewPriceHistory,
        handleHistory
    };
}
