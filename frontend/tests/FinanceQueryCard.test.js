import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import FinanceQueryCard from '@/components/common/FinanceQueryCard.vue'

const createPassthroughStub = (tag, props = {}) =>
  defineComponent({
    inheritAttrs: false,
    props,
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    }
  })

const ElButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          onClick: (event) => emit('click', event)
        },
        slots.default?.()
      )
  }
})

const mountCard = ({ props = {}, slots = {} } = {}) =>
  mount(FinanceQueryCard, {
    props: {
      model: {},
      ...props
    },
    slots,
    global: {
      stubs: {
        'el-card': createPassthroughStub('section'),
        'el-form': createPassthroughStub('form', {
          inline: Boolean,
          model: Object
        }),
        'el-form-item': createPassthroughStub('div'),
        'el-button': ElButtonStub,
        'el-icon': createPassthroughStub('span')
      }
    }
  })

describe('FinanceQueryCard Enter search', () => {
  test('clicking the query button still emits search', async () => {
    const wrapper = mountCard()

    await wrapper.findAll('button')[0].trigger('click')

    expect(wrapper.emitted('search')).toHaveLength(1)
  })

  test('Enter in a text input emits search once and suppresses a legacy listener', async () => {
    const legacyEnter = vi.fn()
    const wrapper = mountCard({
      slots: {
        basic: () =>
          h('input', {
            class: 'query-input',
            type: 'text',
            onKeyup: (event) => {
              if (event.key === 'Enter') legacyEnter()
            }
          })
      }
    })

    await wrapper.get('.query-input').trigger('keyup', { key: 'Enter' })

    expect(wrapper.emitted('search')).toHaveLength(1)
    expect(legacyEnter).not.toHaveBeenCalled()
  })

  test('Enter also searches from an expanded advanced filter', async () => {
    const wrapper = mountCard({
      props: { expanded: true },
      slots: {
        advanced: () => h('input', { class: 'advanced-query-input', type: 'number' })
      }
    })

    await wrapper.get('.advanced-query-input').trigger('keyup', { key: 'Enter' })

    expect(wrapper.emitted('search')).toHaveLength(1)
  })

  test('IME composition Enter does not search or reach a legacy listener', () => {
    const legacyEnter = vi.fn()
    const wrapper = mountCard({
      slots: {
        basic: () =>
          h('input', {
            class: 'ime-query-input',
            type: 'text',
            onKeyup: legacyEnter
          })
      }
    })
    const event = new KeyboardEvent('keyup', {
      key: 'Enter',
      bubbles: true,
      isComposing: true
    })

    wrapper.get('.ime-query-input').element.dispatchEvent(event)

    expect(wrapper.emitted('search')).toBeUndefined()
    expect(legacyEnter).not.toHaveBeenCalled()
  })

  test('Enter remains available to selects and textareas', async () => {
    const controlEnter = vi.fn()
    const wrapper = mountCard({
      slots: {
        basic: () => [
          h('div', { class: 'el-select' }, [
            h('input', {
              class: 'select-input',
              type: 'text',
              role: 'combobox',
              onKeyup: controlEnter
            })
          ]),
          h('textarea', { class: 'query-textarea', onKeyup: controlEnter })
        ]
      }
    })

    await wrapper.get('.select-input').trigger('keyup', { key: 'Enter' })
    await wrapper.get('.query-textarea').trigger('keyup', { key: 'Enter' })

    expect(wrapper.emitted('search')).toBeUndefined()
    expect(controlEnter).toHaveBeenCalledTimes(2)
  })
})
