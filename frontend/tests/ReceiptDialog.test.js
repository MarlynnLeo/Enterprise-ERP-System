import { defineComponent, h, reactive, ref } from 'vue';
import { routeLocationKey } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ReceiptDialog from '@/views/purchase/ReceiptDialog.vue';
import { useInventoryPostingSourceLink } from '@/composables/useInventoryPostingSourceLink';

const getReceiptProcessingDetail = vi.fn();
const getReceiptDetail = vi.fn();

vi.mock('@/api/purchase', () => ({
  purchaseApi: {
    outsourcedProcessing: {
      getDetail: vi.fn(),
    },
    outsourcedReceipts: {
      getProcessingDetail: (...args) => getReceiptProcessingDetail(...args),
      getDetail: (...args) => getReceiptDetail(...args),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/api/finance', () => ({
  financeApi: {
    inventoryPostings: {
      getBySource: vi.fn(async () => ({ data: {} })),
      approve: vi.fn(),
      reject: vi.fn(),
      reverse: vi.fn(),
    },
  },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    canViewInventoryApproval: false,
    canApproveInventoryApproval: false,
    canReverseInventoryApproval: false,
  }),
}));

vi.mock('@/utils/optionLoaders', () => ({
  loadOutsourcedReceiptProcessingOptions: vi.fn(async () => []),
  loadOutsourcedReceiptWarehouseOptions: vi.fn(async () => []),
  searchOutsourcedReceiptProcessingOptions: vi.fn(async () => []),
}));

vi.mock('@/constants/systemConstants', () => ({
  getOutsourcedStatusText: (status) => ({ completed: '已完成' })[status] || status,
  getOutsourcedStatusColor: (status) => ({ completed: 'success' })[status] || 'info',
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const AppDialogStub = defineComponent({
  name: 'AppDialogStub',
  props: { modelValue: Boolean },
  template: '<section><slot/><slot name="footer"/></section>',
});

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: {
    data: { type: Array, default: () => [] },
  },
  template: '<div />',
});

const PassthroughStub = defineComponent({
  template: '<div><slot/></div>',
});

const inventoryApprovalTestStubs = {
  'el-steps': PassthroughStub,
  'el-step': PassthroughStub,
  'el-timeline': PassthroughStub,
  'el-timeline-item': PassthroughStub,
};

const inventoryApprovalTestDirectives = {
  loading: () => {},
  permission: () => {},
};

describe('ReceiptDialog inventory posting source navigation', () => {
  let wrapper;
  const detail = (id) => ({ data: {
    id, receiptNo: `RECEIPT-${id}`, processingNo: `PROCESSING-${id}`,
    items: [{ productId: id, productName: `Product ${id}`, actualQuantity: 1 }],
  } });
  const global = {
    stubs: {
      AppDialog: AppDialogStub,
      'el-descriptions': PassthroughStub, 'el-descriptions-item': PassthroughStub,
      'el-divider': PassthroughStub, 'el-tag': PassthroughStub,
      'el-table': ElTableStub, 'el-table-column': true, 'el-button': true,
      'el-form': PassthroughStub, 'el-card': PassthroughStub,
      'el-row': PassthroughStub, 'el-col': PassthroughStub, 'el-form-item': PassthroughStub,
      'el-select': PassthroughStub, 'el-option': true, 'el-input': true,
      'el-date-picker': true, 'el-input-number': true,
      InventoryPostingStatusPanel: true,
    },
    directives: inventoryApprovalTestDirectives,
  };

  beforeEach(() => {
    getReceiptDetail.mockReset().mockImplementation(async (id) => detail(id));
  });
  afterEach(() => wrapper?.unmount());

  test('loads an initially visible receipt opened synchronously by the source link', async () => {
    const route = reactive({ path: '/purchase/processing-receipts', query: {
      sourceType: 'outsourced_processing_receipt', sourceId: '9', sourceNo: 'RECEIPT-9',
    } });
    wrapper = mount(defineComponent({
      setup() {
        const visible = ref(false);
        const receiptId = ref(null);
        useInventoryPostingSourceLink({
          path: '/purchase/processing-receipts', sourceTypes: ['outsourced_processing_receipt'],
          open: ({ id }) => { receiptId.value = id; visible.value = true; },
        });
        return () => h(ReceiptDialog, { visible: visible.value, receiptId: receiptId.value, mode: 'view' });
      },
    }), { global: { ...global, provide: { [routeLocationKey]: route } } });
    await flushPromises();
    expect(getReceiptDetail).toHaveBeenCalledExactlyOnceWith(9);
    expect(wrapper.text()).toContain('RECEIPT-9');

    route.query = { sourceType: 'outsourced_processing_receipt', sourceId: '10', sourceNo: 'RECEIPT-10' };
    await flushPromises();
    expect(getReceiptDetail).toHaveBeenLastCalledWith(10);
    expect(wrapper.text()).toContain('RECEIPT-10');
    expect(wrapper.text()).not.toContain('RECEIPT-9');
  });

  test('keeps the newest receipt when the previous request finishes later', async () => {
    let finishFirst;
    getReceiptDetail.mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }));
    wrapper = mount(ReceiptDialog, { props: { visible: true, mode: 'view', receiptId: 9 }, global });
    await flushPromises();
    await wrapper.setProps({ receiptId: 10 });
    await flushPromises();
    finishFirst(detail(9));
    await flushPromises();
    expect(wrapper.text()).toContain('RECEIPT-10');
    expect(wrapper.text()).not.toContain('RECEIPT-9');
    expect(wrapper.findComponent({ name: 'InventoryPostingStatusPanel' }).props('sourceId')).toBe(10);
  });

  test('invalidates a closed dialog request before reopening the same receipt', async () => {
    let finishFirst;
    getReceiptDetail.mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }));
    wrapper = mount(ReceiptDialog, { props: { visible: true, mode: 'view', receiptId: 9 }, global });
    await flushPromises();
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await flushPromises();
    finishFirst({ data: { ...detail(9).data, receiptNo: 'STALE-RECEIPT' } });
    await flushPromises();
    expect(getReceiptDetail).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('RECEIPT-9');
    expect(wrapper.text()).not.toContain('STALE-RECEIPT');
  });
});

describe('ReceiptDialog processing product mapping', () => {
  test('shows product fields and expected/actual quantities when creating a receipt', async () => {
    getReceiptProcessingDetail.mockResolvedValue({
      data: {
        id: 7,
        processingNo: 'WW260824001',
        supplierId: 472,
        supplierName: '北京英拓文远智能科技有限公司',
        products: [
          {
            productId: 12147,
            productCode: '300300402024',
            productName: '底座（钻孔）',
            specification: '钻孔',
            unit: '个',
            unitId: 2,
            quantity: '1.00',
            receivableQuantity: '1.00',
            unitPrice: '20.00',
            totalPrice: '20.00',
          },
        ],
      },
    });

    const wrapper = mount(ReceiptDialog, {
      props: {
        visible: false,
        mode: 'create',
        processingId: 7,
      },
      global: {
        stubs: {
          ...inventoryApprovalTestStubs,
          AppDialog: AppDialogStub,
          'el-form': PassthroughStub,
          'el-card': PassthroughStub,
          'el-row': PassthroughStub,
          'el-col': PassthroughStub,
          'el-form-item': PassthroughStub,
          'el-input': true,
          'el-date-picker': true,
          'el-select': PassthroughStub,
          'el-option': true,
          'el-descriptions': PassthroughStub,
          'el-descriptions-item': PassthroughStub,
          'el-divider': PassthroughStub,
          'el-tag': PassthroughStub,
          'el-table': ElTableStub,
          'el-table-column': true,
          'el-input-number': true,
          'el-button': true,
        },
        directives: inventoryApprovalTestDirectives,
      },
    });

    await wrapper.setProps({ visible: true });
    await flushPromises();

    expect(getReceiptProcessingDetail).toHaveBeenCalledWith(7);
    expect(wrapper.findComponent(ElTableStub).props('data')).toEqual([
      expect.objectContaining({
        productId: 12147,
        productCode: '300300402024',
        productName: '底座（钻孔）',
        specification: '钻孔',
        expectedQuantity: 1,
        actualQuantity: 0,
        unitPrice: 20,
        totalPrice: 0,
      }),
    ]);
  });

  test('renders a read-only receipt detail layout instead of disabled form controls', async () => {
    getReceiptDetail.mockResolvedValue({
      data: {
        id: 9,
        receiptNo: 'WWRK260825002',
        processingId: 8,
        processingNo: 'WW260825002',
        supplierId: 472,
        supplierName: '北京英拓文远智能科技有限公司',
        locationId: 3,
        warehouseName: '成品库',
        receiptDate: '2026-08-25',
        operator: '管理员',
        remarks: '委外入库完成',
        status: 'completed',
        items: [
          {
            productId: 12147,
            productCode: '300300402024',
            productName: '底座（钻孔）',
            specification: '钻孔',
            unit: '个',
            unitId: 2,
            expectedQuantity: '1.00',
            actualQuantity: '1.00',
            unitPrice: '20.00',
            totalPrice: '20.00',
          },
        ],
      },
    });

    const wrapper = mount(ReceiptDialog, {
      props: {
        visible: false,
        mode: 'view',
        receiptId: 9,
      },
      global: {
        stubs: {
          ...inventoryApprovalTestStubs,
          AppDialog: AppDialogStub,
          'el-form': PassthroughStub,
          'el-card': PassthroughStub,
          'el-row': PassthroughStub,
          'el-col': PassthroughStub,
          'el-form-item': PassthroughStub,
          'el-input': true,
          'el-date-picker': true,
          'el-select': PassthroughStub,
          'el-option': true,
          'el-descriptions': PassthroughStub,
          'el-descriptions-item': PassthroughStub,
          'el-divider': PassthroughStub,
          'el-tag': PassthroughStub,
          'el-table': ElTableStub,
          'el-table-column': true,
          'el-input-number': true,
          'el-button': PassthroughStub,
        },
        directives: inventoryApprovalTestDirectives,
      },
    });

    await wrapper.setProps({ visible: true });
    await flushPromises();

    expect(getReceiptDetail).toHaveBeenCalledWith(9);
    expect(wrapper.find('.receipt-view').exists()).toBe(true);
    expect(wrapper.find('.form-container').exists()).toBe(false);
    expect(wrapper.text()).toContain('WWRK260825002');
    expect(wrapper.text()).toContain('北京英拓文远智能科技有限公司');
    expect(wrapper.text()).toContain('入库成品明细');
    expect(wrapper.findComponent(ElTableStub).props('data')).toEqual([
      expect.objectContaining({
        productCode: '300300402024',
        productName: '底座（钻孔）',
        expectedQuantity: 1,
        actualQuantity: 1,
        unitPrice: 20,
        totalPrice: 20,
      }),
    ]);
  });
});
