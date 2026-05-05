/**
 * 策略字段管理composable
 * 包含策略字段的CRUD操作
 */
import { ref, reactive, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { financeApi } from '@/api/finance';

export function useStrategyFields() {
    // ========== 状态 ==========
    const fieldsList = ref([]);
    const fieldsLoading = ref(false);
    const availableFields = ref([]);
    const selectedFieldIds = ref([]);

    const dialogVisible = ref(false);
    const submitting = ref(false);
    const formRef = ref(null);

    const form = reactive({
        id: null,
        field_name: '',
        field_label: '',
        field_type: 'amount',
        unit: '元',
        sort_order: 999,
        description: '',
        is_additive: 1
    });

    const rules = {
        field_label: [{ required: true, message: '请输入显示标签', trigger: 'blur' }],
        field_name: [
            { required: true, message: '请输入字段名', trigger: 'blur' },
            { pattern: /^[a-z_][a-z0-9_]*$/i, message: '只能包含英文字母、数字和下划线', trigger: 'blur' }
        ],
        field_type: [{ required: true, message: '请选择字段类型', trigger: 'change' }],
        unit: [{ required: true, message: '请输入单位', trigger: 'blur' }]
    };

    // ========== 方法 ==========

    // 加载所有策略字段
    const loadFields = async () => {
        fieldsLoading.value = true;
        try {
            const res = await financeApi.getStrategyFields();
            fieldsList.value = res.data;
        } catch {
            ElMessage.error('加载策略字段失败');
        } finally {
            fieldsLoading.value = false;
        }
    };

    // 加载可用策略字段(已启用的)
    const loadAvailableFields = async () => {
        try {
            const res = await financeApi.getStrategyFields({ isActive: 1 });
            availableFields.value = res.data;
        } catch (error) {
            console.error('加载可用策略字段失败:', error);
        }
    };

    // 重置表单
    const resetForm = () => {
        Object.assign(form, {
            id: null,
            field_name: '',
            field_label: '',
            field_type: 'amount',
            unit: '元',
            sort_order: 999,
            description: '',
            is_additive: 1
        });
    };

    // 打开新增对话框
    const handleAdd = () => {
        resetForm();
        dialogVisible.value = true;
    };

    // 打开编辑对话框
    const handleEdit = (row) => {
        Object.assign(form, row);
        dialogVisible.value = true;
    };

    // 删除策略字段
    const handleDelete = async (row) => {
        try {
            await ElMessageBox.confirm(
                `确定要删除策略字段"${row.field_label}"吗?`,
                '确认删除',
                { type: 'warning' }
            );
            await financeApi.deleteStrategyField(row.id);
            ElMessage.success('删除成功');
            loadFields();
            loadAvailableFields();
        } catch (error) {
            if (error !== 'cancel') {
                ElMessage.error(error.response?.data?.message || '删除失败');
            }
        }
    };

    // 切换启用状态
    const handleToggle = async (row, nextStatus = row.is_active === 1 ? 0 : 1) => {
        const previousStatus = row.is_active;
        row.is_active = nextStatus;
        try {
            await financeApi.toggleStrategyField(row.id);
            await nextTick();
            loadAvailableFields();
        } catch {
            row.is_active = previousStatus;
            ElMessage.error('操作失败');
            loadFields();
        }
    };

    // 保存策略字段
    const save = async () => {
        if (!formRef.value) return;

        await formRef.value.validate(async (valid) => {
            if (!valid) return;

            submitting.value = true;
            try {
                if (form.id) {
                    await financeApi.updateStrategyField(form.id, form);
                    ElMessage.success('策略字段更新成功');
                } else {
                    await financeApi.createStrategyField(form);
                    ElMessage.success('策略字段创建成功');
                }
                dialogVisible.value = false;
                loadFields();
                loadAvailableFields();
            } catch (error) {
                ElMessage.error(error.response?.data?.message || '保存失败');
            } finally {
                submitting.value = false;
            }
        });
    };

    // 通过ID获取字段
    const getFieldById = (fieldId) => {
        return availableFields.value.find(f => f.id === fieldId) || {};
    };

    // 获取字段标签
    const getFieldLabel = (fieldId) => {
        const field = getFieldById(fieldId);
        return field.field_label ? `${field.field_label} (${field.unit})` : '';
    };

    // 处理字段选择变更
    const handleFieldsChange = (selectedIds) => {
        selectedIds.forEach(fieldId => {
            const field = availableFields.value.find(f => f.id === fieldId);
            if (field && (field.value === undefined || field.value === null)) {
                field.value = 0;
            }
        });
    };

    // 计算调整后成本
    const calculateAdjustedCost = (baseCost) => {
        let adjustedCost = Number(baseCost) || 0;

        selectedFieldIds.value.forEach(fieldId => {
            const field = getFieldById(fieldId);
            const value = Number(field.value) || 0;

            if (value > 0) {
                // 判断该字段是否参与成本计算
                if (field.is_additive === 1 || field.is_additive === undefined) {
                    if (field.field_type === 'percentage') {
                        adjustedCost += baseCost * (value / 100);
                    } else if (field.field_type === 'amount') {
                        adjustedCost += value;
                    }
                }
            }
        });

        return Number(adjustedCost.toFixed(2));
    };

    // 获取选中策略的提交数据
    const getSelectedStrategies = () => {
        return selectedFieldIds.value
            .map(fieldId => {
                const field = getFieldById(fieldId);
                const value = Number(field.value) || 0;
                if (value > 0) {
                    return { field_id: fieldId, field_value: value };
                }
                return null;
            })
            .filter(item => item !== null);
    };

    // 重置选中状态
    const resetSelection = () => {
        availableFields.value.forEach(field => {
            field.selected = false;
            field.value = 0;
        });
        selectedFieldIds.value = [];
    };

    // 回显已保存的策略
    const echoStrategies = (strategies) => {
        if (!strategies || strategies.length === 0) return;

        const ids = [];
        strategies.forEach(strategyData => {
            const field = availableFields.value.find(f => f.id === strategyData.field_id);
            if (field) {
                field.selected = true;
                field.value = Number(strategyData.field_value);
                ids.push(field.id);
            }
        });
        selectedFieldIds.value = ids;
    };

    return {
        // 状态
        fieldsList,
        fieldsLoading,
        availableFields,
        selectedFieldIds,
        dialogVisible,
        submitting,
        formRef,
        form,
        rules,
        // 方法
        loadFields,
        loadAvailableFields,
        resetForm,
        handleAdd,
        handleEdit,
        handleDelete,
        handleToggle,
        save,
        getFieldById,
        getFieldLabel,
        handleFieldsChange,
        calculateAdjustedCost,
        getSelectedStrategies,
        resetSelection,
        echoStrategies
    };
}
