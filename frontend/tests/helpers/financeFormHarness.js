import { defineComponent, h, inject, onBeforeUnmount, provide, ref, toRef } from 'vue'
import { flushPromises } from '@vue/test-utils'
import AsyncValidatorModule from 'async-validator'
import { expect } from 'vitest'

const AsyncValidator = AsyncValidatorModule.default || AsyncValidatorModule
const Slot = { template: '<div><slot name="header"/><slot name="actions"/><slot name="basic"/><slot/><slot name="footer"/></div>' }
const Input = {
  props: ['modelValue', 'disabled', 'placeholder', 'size'], emits: ['update:modelValue', 'input', 'change'],
  template: '<input :disabled="disabled" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)" @change="$emit(\'change\', $event.target.value)"/>',
}
const NumberInput = {
  props: ['modelValue', 'disabled', 'placeholder', 'size'], emits: ['update:modelValue', 'change'],
  template: '<input type="number" :disabled="disabled" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))" @change="$emit(\'change\', Number($event.target.value))"/>',
}
const Select = {
  props: ['modelValue', 'remoteMethod', 'placeholder', 'disabled'], emits: ['update:modelValue', 'change'],
  methods: { choose(event) { const raw = event.target.value; const value = raw && Number.isFinite(Number(raw)) ? Number(raw) : raw; this.$emit('update:modelValue', value); this.$emit('change', value) } },
  template: '<div><input v-if="remoteMethod" :placeholder="placeholder" @input="remoteMethod($event.target.value)"/><select :disabled="disabled" :value="modelValue" @change="choose"><option value=""/><slot/></select></div>',
}
const TreeSelect = defineComponent({
  props: ['modelValue', 'options', 'data', 'props', 'disabled'], emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const flatten = list => (list || []).flatMap(item => [item, ...flatten(item.children)])
    return () => h('select', { disabled: props.disabled, value: props.modelValue, onChange: event => {
      const value = Number(event.target.value) || null
      emit('update:modelValue', value); emit('change', value)
    } }, [h('option', { value: '' }), ...flatten(props.options || props.data).map(item =>
      h('option', { value: item[props.props?.value || 'id'] }, item[props.props?.label || 'name']))])
  },
})
const Form = defineComponent({
  props: ['model', 'rules'],
  setup(props, { expose, slots }) {
    const fields = new Set()
    provide('financeTestFormFields', fields)
    expose({
      clearValidate() {}, resetFields() {},
      async validate(callback) {
        const rules = Object.fromEntries(Object.entries(props.rules || {}).filter(([key]) => fields.has(key)).map(([key, values]) => [key,
          (Array.isArray(values) ? values : [values]).map(({ trigger: _trigger, ...rule }) => rule),
        ]))
        try { await new AsyncValidator(rules).validate(props.model) }
        catch (error) {
          if (!error.fields) throw error
          if (callback) { await callback(false, error.fields); return false }
          throw error
        }
        await callback?.(true)
        return true
      },
    })
    return () => h('form', { onSubmit: event => event.preventDefault() }, slots.default?.())
  },
})
const FormItem = defineComponent({
  props: ['label', 'prop'],
  setup(props, { slots }) {
    const fields = inject('financeTestFormFields', null)
    if (props.prop) fields?.add(props.prop)
    onBeforeUnmount(() => fields?.delete(props.prop))
    return () => h('label', { 'data-field': props.prop || props.label }, [h('span', props.label), slots.default?.()])
  },
})
const Table = defineComponent({
  props: ['data'], emits: ['selection-change', 'row-click'],
  setup(props, { emit, expose, slots }) {
    const selected = ref([])
    provide('financeTestTable', { rows: toRef(props, 'data'), selected, select(row, checked) {
      selected.value = checked ? [...selected.value, row] : selected.value.filter(item => item !== row)
      emit('selection-change', selected.value)
    }, view: row => emit('row-click', row, {}, { target: { closest: () => null } }) })
    expose({ clearSelection() { selected.value = []; emit('selection-change', []) } })
    return () => h('div', { 'data-table': '' }, slots.default?.())
  },
})
const Column = defineComponent({
  props: ['prop', 'label', 'type'],
  setup(props, { slots }) {
    const table = inject('financeTestTable')
    return () => h('div', { 'data-column': props.label || props.type }, (table.rows.value || []).map((row, index) =>
      h('div', { 'data-row': index }, props.type === 'selection'
        ? h('input', { type: 'checkbox', checked: table.selected.value.includes(row), onChange: event => table.select(row, event.target.checked) })
        : slots.default ? slots.default({ row, $index: index }) : h('span', { onClick: () => table.view(row) }, String(row[props.prop] ?? '')))))
  },
})
const Tabs = defineComponent({
  props: ['modelValue'], emits: ['update:modelValue'],
  setup(props, { slots, emit }) {
    provide('financeTestTab', { active: toRef(props, 'modelValue'), change: value => emit('update:modelValue', value) })
    return () => h('div', slots.default?.())
  },
})
const TabPane = defineComponent({
  props: ['name', 'label'],
  setup(props, { slots }) {
    const tab = inject('financeTestTab')
    return () => h('div', [h('button', { type: 'button', onClick: () => tab.change(props.name) }, props.label),
      ...(tab.active.value === props.name ? [h('section', { 'data-tab': props.name }, slots.default?.())] : [])])
  },
})
const RadioGroup = defineComponent({
  props: ['modelValue'], emits: ['update:modelValue', 'change'],
  setup(props, { emit, slots }) {
    provide('financeTestRadio', { value: toRef(props, 'modelValue'), change(value) { emit('update:modelValue', value); emit('change', value) } })
    return () => h('div', slots.default?.())
  },
})
const Radio = defineComponent({
  props: ['value', 'label', 'disabled'],
  setup(props, { slots }) {
    const radio = inject('financeTestRadio')
    return () => h('label', [h('input', { type: 'radio', disabled: props.disabled, value: props.value ?? props.label,
      checked: radio.value.value === (props.value ?? props.label), onChange: () => radio.change(props.value ?? props.label) }), slots.default?.()])
  },
})
const Pagination = {
  props: ['currentPage', 'pageSize', 'total'], emits: ['update:currentPage', 'current-change'],
  template: '<div data-pagination><span>{{ total }}</span><button @click="$emit(\'update:currentPage\', 2); $emit(\'current-change\', 2)">下一页</button></div>',
}

export const financeStubs = {
  PageHeader: Slot, FinanceQueryCard: { template: '<div><slot name="basic"/><button @click="$emit(\'search\')">查询</button><button @click="$emit(\'reset\')">重置</button></div>' },
  ElCard: Slot, ElRow: Slot, ElCol: Slot, ElTag: Slot, ElDescriptions: Slot, ElDescriptionsItem: Slot,
  ElForm: Form, ElFormItem: FormItem,
  ElButton: { props: ['loading', 'disabled'], emits: ['click'], template: '<button type="button" :disabled="loading || disabled" @click="$emit(\'click\')"><slot/></button>' },
  ElInput: Input, ElInputNumber: NumberInput, ElDatePicker: Input, ElSelect: Select,
  ElOption: { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  ElOptionGroup: { props: ['label'], template: '<optgroup :label="label"><slot/></optgroup>' }, ElCascader: TreeSelect, ElTreeSelect: TreeSelect,
  ElTable: Table, ElTableColumn: Column, ElTabs: Tabs, ElTabPane: TabPane,
  ElRadioGroup: RadioGroup, ElRadio: Radio, ElRadioButton: Radio,
  ElPagination: Pagination, ElProgress: true, ElIcon: true, ElUpload: true, ElTooltip: Slot,
  ElLink: { emits: ['click'], template: '<a href="#" @click.prevent="$emit(\'click\')"><slot/></a>' },
  ElSteps: Slot, ElStep: true,
  ElResult: { props: ['title', 'subTitle'], template: '<div><p>{{ title }}</p><p>{{ subTitle }}</p><slot name="extra"/></div>' },
  ElDropdown: Slot, ElDropdownMenu: Slot, ElDropdownItem: Slot,
  ElAlert: { props: ['title'], template: '<p>{{ title }}</p>' }, ElDivider: Slot,
  ElPopconfirm: { template: '<div><slot name="reference"/><button @click="$emit(\'confirm\')">确认操作</button></div>' },
  AppDialog: { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-dialog="title"><slot/><slot name="footer"/></section>' },
  EmptyState: true, FinanceStreamStatus: true, RelatedOrderDialog: true,
}
export const financeDirectives = { loading: () => {}, permission: () => {} }
export async function clickButton(scope, label) {
  const button = scope.findAll('button').find(item => item.text().trim() === label)
  expect(button, `button: ${label}`).toBeDefined()
  await button.trigger('click'); await flushPromises()
}
export async function fillField(scope, field, value) {
  const item = scope.get(`[data-field="${field}"]`)
  const control = item.find('select').exists() ? item.get('select') : item.get('input, textarea')
  await control.setValue(String(value))
  await flushPromises()
}
