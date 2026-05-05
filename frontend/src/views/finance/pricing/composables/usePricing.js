/**
 * 产品定价相关逻辑复用
 * 包含列表、搜索、定价表单等功能
 */
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import { financeApi } from '@/api/finance';

export function usePricing() {
    // ========== 列表状态 ==========
    const loading = ref(false);
    const tableData = ref([]);
    const currentPage = ref(1);
    const pageSize = ref(10);
    const total = ref(0);
    const searchQuery = ref('');
    const filterType = ref('');
    const exporting = ref(false);

    // ========== 定价抽屉状态 ==========
    const drawerVisible = ref(false);
    const drawerLoading = ref(false);
    const submitting = ref(false);
    const currentProduct = ref({});
    const formRef = ref(null);

    const pricingForm = reactive({
        product_id: null,
        cost_price: 0,
        suggested_price: 0,
        profit_margin: 0,
        effective_date: '',
        remarks: '',
        strategies: []
    });

    // ========== 成本类型 ==========
    const costType = ref('bom');

    // ========== 设置(用于筛选和验证) ==========
    const settingsForm = reactive({
        lowMarginThreshold: 10,
        costVarianceThreshold: 5,
        minProfitMargin: -100,
        allowCostPrice: false,
        defaultFilter: ''
    });

    // ========== 验证规则 ==========
    const rules = {
        suggested_price: [{ required: true, message: '请输入建议售价', trigger: 'blur' }],
        effective_date: [{ required: true, message: '请选择生效日期', trigger: 'change' }]
    };

    // ========== 方法 ==========

    // 获取列表数据
    const fetchData = async () => {
        loading.value = true;
        try {
            const res = await financeApi.getPricingList({
                page: currentPage.value,
                pageSize: pageSize.value,
                search: searchQuery.value,
                filterType: filterType.value
            });

            let list = res.data.list;
            let listTotal = res.data.total;

            // 应用成本变动阈值
            list = list.map(row => {
                const showCostWarning = row.cost_variance_percent > settingsForm.costVarianceThreshold;
                return { ...row, cost_variance_flag: showCostWarning };
            });

            // 低利润率筛选
            if (filterType.value === 'low_margin') {
                list = list.filter(row =>
                    row.profit_margin !== null &&
                    row.profit_margin < settingsForm.lowMarginThreshold
                );
                listTotal = list.length;
            }

            tableData.value = list;
            total.value = listTotal;
        } catch (error) {
            console.error(error);
            ElMessage.error('获取列表失败');
        } finally {
            loading.value = false;
        }
    };

    // 搜索
    const handleSearch = () => {
        currentPage.value = 1;
        fetchData();
    };

    // 打开定价编辑
    const handleEdit = async (row, availableStrategyFields, selectedStrategyFieldIds) => {
        drawerVisible.value = true;
        drawerLoading.value = true;
        currentProduct.value = {
            id: row.product_id,
            code: row.product_code,
            name: row.product_name,
            specs: row.product_specs
        };

        // 重置表单
        pricingForm.product_id = row.product_id;
        pricingForm.cost_price = 0;
        pricingForm.suggested_price = 0;
        pricingForm.profit_margin = 0;
        pricingForm.effective_date = dayjs().format('YYYY-MM-DD');
        pricingForm.remarks = '';

        // 重置策略字段
        if (availableStrategyFields?.value) {
            availableStrategyFields.value.forEach(field => {
                field.selected = false;
                field.value = 0;
            });
        }
        if (selectedStrategyFieldIds?.value) {
            selectedStrategyFieldIds.value = [];
        }

        try {
            const res = await financeApi.getPricingDetail(row.product_id);
            const { currentPricing, latestBomCost, costType: type, strategies } = res.data;

            costType.value = type || 'none';
            pricingForm.cost_price = latestBomCost || 0;

            if (currentPricing) {
                pricingForm.suggested_price = Number(currentPricing.suggested_price);
                pricingForm.profit_margin = Number(currentPricing.profit_margin);
                pricingForm.remarks = currentPricing.remarks;
            }

            // 回显策略字段
            if (strategies && strategies.length > 0 && availableStrategyFields?.value) {
                const selectedIds = [];
                strategies.forEach(strategyData => {
                    const field = availableStrategyFields.value.find(f => f.id === strategyData.field_id);
                    if (field) {
                        field.selected = true;
                        field.value = Number(strategyData.field_value);
                        selectedIds.push(field.id);
                    }
                });
                if (selectedStrategyFieldIds?.value !== undefined) {
                    selectedStrategyFieldIds.value = selectedIds;
                }
            }
        } catch {
            ElMessage.error('获取详情失败');
        } finally {
            drawerLoading.value = false;
        }
    };

    // 重新计算成本
    const recalculateCost = async () => {
        try {
            const res = await financeApi.calculateBomCost(currentProduct.value.id);
            pricingForm.cost_price = res.data.cost;
            costType.value = res.data.costType || 'none';
            ElMessage.success('成本已更新');
        } catch {
            ElMessage.error('计算成本失败');
        }
    };

    // 价格变化时更新利润率
    const handlePriceChange = (calculateAdjustedCost) => {
        const cost = calculateAdjustedCost ? calculateAdjustedCost() : Number(pricingForm.cost_price) || 0;
        const price = Number(pricingForm.suggested_price) || 0;
        if (cost > 0) {
            const margin = ((price - cost) / cost) * 100;
            pricingForm.profit_margin = Number(margin.toFixed(2));
        }
    };

    // 利润率变化时更新价格
    const handleMarginChange = (calculateAdjustedCost) => {
        const cost = calculateAdjustedCost ? calculateAdjustedCost() : Number(pricingForm.cost_price) || 0;
        const margin = Number(pricingForm.profit_margin) || 0;
        if (cost > 0) {
            const price = cost * (1 + margin / 100);
            pricingForm.suggested_price = Number(price.toFixed(2));
        }
    };

    // 提交定价
    const submitPricing = async (selectedStrategies = []) => {
        if (!formRef.value) return false;

        const cost = Number(pricingForm.cost_price) || 0;
        const price = Number(pricingForm.suggested_price) || 0;
        const margin = Number(pricingForm.profit_margin) || 0;

        // 验证
        if (price < cost && !settingsForm.allowCostPrice) {
            ElMessage.error('售价不能低于成本价');
            return false;
        }

        if (!settingsForm.allowCostPrice && price === cost) {
            ElMessage.error('当前设置不允许成本价销售');
            return false;
        }

        if (settingsForm.minProfitMargin > -100 && margin < settingsForm.minProfitMargin) {
            ElMessage.error(`利润率不能低于 ${settingsForm.minProfitMargin}%`);
            return false;
        }

        if (margin < settingsForm.lowMarginThreshold && margin >= settingsForm.minProfitMargin) {
            ElMessage.warning(`⚠️ 低利润率警告：当前利润率 ${margin.toFixed(2)}%`);
        }

        return new Promise((resolve) => {
            formRef.value.validate(async (valid) => {
                if (valid) {
                    submitting.value = true;
                    try {
                        const submitData = {
                            ...pricingForm,
                            strategies: selectedStrategies
                        };
                        await financeApi.createPricing(submitData);
                        ElMessage.success('保存成功');
                        drawerVisible.value = false;
                        fetchData();
                        resolve(true);
                    } catch {
                        ElMessage.error('保存失败');
                        resolve(false);
                    } finally {
                        submitting.value = false;
                    }
                } else {
                    resolve(false);
                }
            });
        });
    };

    // 导出
    const handleExport = async () => {
        exporting.value = true;
        try {
            const res = await financeApi.exportPricingList({
                search: searchQuery.value,
                filterType: filterType.value
            });

            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `产品定价表_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
            link.click();
            window.URL.revokeObjectURL(url);

            ElMessage.success('导出成功');
        } catch (error) {
            console.error(error);
            ElMessage.error('导出失败');
        } finally {
            exporting.value = false;
        }
    };

    // 加载设置
    const loadSettings = async () => {
        try {
            // 尝试从后端加载
            const res = await financeApi.getPricingSettings();
            if (res.data && Object.keys(res.data).length > 0) {
                Object.assign(settingsForm, res.data);
                if (settingsForm.defaultFilter) {
                    filterType.value = settingsForm.defaultFilter;
                }
            } else {
                // 如果后端没有，尝试本地或者使用默认
                const saved = localStorage.getItem('pricingSettings');
                if (saved) {
                    try {
                        const settings = JSON.parse(saved);
                        Object.assign(settingsForm, settings);
                        // 同步到后端
                        saveSettings();
                    } catch { }
                }
            }
        } catch (error) {
            console.error('加载设置失败', error);
            // 降级到本地存储
            const saved = localStorage.getItem('pricingSettings');
            if (saved) {
                try {
                    const settings = JSON.parse(saved);
                    Object.assign(settingsForm, settings);
                } catch { }
            }
        }
    };

    // 保存设置
    const saveSettings = async () => {
        try {
            // 保存到后端
            await financeApi.updatePricingSettings(settingsForm);
            // 同时保存到本地作为备份
            localStorage.setItem('pricingSettings', JSON.stringify(settingsForm));

            ElMessage.success('设置已保存');
            fetchData();
        } catch {
            ElMessage.error('保存设置失败');
        }
    };

    // 重置设置
    const resetSettings = async () => {
        settingsForm.lowMarginThreshold = 10;
        settingsForm.costVarianceThreshold = 5;
        settingsForm.minProfitMargin = -100;
        settingsForm.allowCostPrice = false;
        settingsForm.defaultFilter = '';
        await saveSettings(); // 保存默认值到服务器
        ElMessage.success('已恢复默认设置');
    };

    return {
        // 状态
        loading,
        tableData,
        currentPage,
        pageSize,
        total,
        searchQuery,
        filterType,
        exporting,
        drawerVisible,
        drawerLoading,
        submitting,
        currentProduct,
        formRef,
        pricingForm,
        costType,
        settingsForm,
        rules,
        // 方法
        fetchData,
        handleSearch,
        handleEdit,
        recalculateCost,
        handlePriceChange,
        handleMarginChange,
        submitPricing,
        handleExport,
        loadSettings,
        saveSettings,
        resetSettings
    };
}
