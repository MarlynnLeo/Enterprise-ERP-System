import { defineComponent } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { expect, test, vi } from 'vitest'
import CreateMaterial from '@/views/baseData/CreateMaterial.vue'
import { baseDataApi } from '@/api'

const actions = vi.hoisted(() => ({ back: vi.fn(), upload: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {} }), useRouter: () => ({ back: actions.back }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true }) }))
vi.mock('@/api', () => ({
  baseDataApi: Object.fromEntries([
    'getCategories', 'getUnits', 'getProductCategoryOptions', 'getMaterialSources',
    'getInspectionMethods', 'getLocations', 'createMaterial', 'updateMaterial'
  ].map(name => [name, vi.fn(async () => ({ data: [] }))])),
  systemApi: { getUsers: vi.fn(async () => ({ data: [] })) }
}))
vi.mock('vant', async importOriginal => ({
  ...await importOriginal(), showToast: vi.fn(), showLoadingToast: vi.fn(), closeToast: vi.fn()
}))

test('retrying images after the material was created updates the same record instead of creating a duplicate', async () => {
  baseDataApi.createMaterial.mockResolvedValue({ data: { id: 81 } })
  actions.upload.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const ImageStub = defineComponent({
    setup(_, { expose }) {
      expose({ hasPending: () => true, uploadPending: actions.upload })
      return () => null
    }
  })
  const FormStub = defineComponent({
    setup(_, { slots, expose }) {
      expose({ validate: vi.fn(async () => {}) })
      return () => slots.default?.()
    }
  })
  const wrapper = shallowMount(CreateMaterial, {
    global: { stubs: { MaterialImages: ImageStub, Form: FormStub, VanForm: FormStub, VanIcon: true }, renderStubDefaultSlot: true }
  })
  try {
    await flushPromises()
    await wrapper.vm.submitForm()
    expect(baseDataApi.createMaterial).toHaveBeenCalledTimes(1)
    expect(actions.upload).toHaveBeenNthCalledWith(1, 81)
    expect(actions.back).not.toHaveBeenCalled()
    await wrapper.vm.submitForm()
    expect(baseDataApi.createMaterial).toHaveBeenCalledTimes(1)
    expect(baseDataApi.updateMaterial).toHaveBeenCalledWith(81, expect.any(Object))
    expect(actions.upload).toHaveBeenNthCalledWith(2, 81)
    expect(actions.back).toHaveBeenCalledTimes(1)
  } finally {
    wrapper.unmount()
  }
})
