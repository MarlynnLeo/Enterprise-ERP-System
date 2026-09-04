import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import DecorativeAvatarFrame from '@/views/auth/components/DecorativeAvatarFrame.vue';

const ElAvatarStub = defineComponent({
  name: 'ElAvatarStub',
  props: {
    src: String,
    size: Number,
  },
  emits: ['error'],
  template: '<span><img class="avatar-stub" :src="src" @error="$emit(\'error\')" /><slot /></span>',
});

const mountAvatar = (props = {}) =>
  mount(DecorativeAvatarFrame, {
    props: {
      avatar: '/uploads/avatars/missing.jpg',
      defaultAvatar: '/default-avatar.webp',
      ...props,
    },
    global: {
      stubs: {
        'el-avatar': ElAvatarStub,
      },
    },
  });

describe('DecorativeAvatarFrame image fallback', () => {
  test('switches a missing user avatar to the default image', async () => {
    const wrapper = mountAvatar();

    expect(wrapper.get('.avatar-stub').attributes('src')).toBe('/uploads/avatars/missing.jpg');
    await wrapper.get('.avatar-stub').trigger('error');

    expect(wrapper.get('.avatar-stub').attributes('src')).toBe('/default-avatar.webp');
    expect(wrapper.emitted('avatar-error')).toEqual([['/uploads/avatars/missing.jpg']]);
  });

  test('falls back to initials if the default image also fails', async () => {
    const wrapper = mountAvatar();

    await wrapper.get('.avatar-stub').trigger('error');
    await wrapper.get('.avatar-stub').trigger('error');

    expect(wrapper.get('.avatar-stub').attributes('src') || '').toBe('');
    expect(wrapper.text()).toContain('U');
  });

  test('retries when the avatar prop changes', async () => {
    const wrapper = mountAvatar();
    await wrapper.get('.avatar-stub').trigger('error');

    await wrapper.setProps({ avatar: '/uploads/avatars/replacement.png' });
    await nextTick();

    expect(wrapper.get('.avatar-stub').attributes('src')).toBe('/uploads/avatars/replacement.png');
  });
});
