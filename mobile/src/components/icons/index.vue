<!--
/**
 * Material Symbols Icon 组件
 * @description 根据 Google Design 规范全局映射原 Heroicons 到 Material Symbols Rounded
 */
-->
<template>
  <span
    class="material-symbols-rounded"
    :class="className"
    :style="customStyle"
  >
    {{ materialName }}
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  size: {
    type: [String, Number],
    default: '1.5rem'
  },
  color: {
    type: String,
    default: 'inherit'
  },
  className: {
    type: String,
    default: ''
  },
  weight: {
    type: Number,
    default: 400
  },
  fill: {
    type: Boolean,
    default: false
  }
});

// 计算出最终渲染的 Material Symbol 名称
const materialName = computed(() => {
  const map = {
    // ---- 库存与基础业务 ----
    'cube': 'inventory_2',
    'archive': 'inventory',
    'beaker': 'science',
    'clipboard-check': 'assignment_turned_in',
    'document-text': 'description',
    'notes': 'receipt_long',
    'receipt': 'receipt',
    'truck': 'local_shipping',
    
    // ---- 销售、采购与财务 ----
    'shopping-bag': 'local_mall',
    'shopping-cart': 'shopping_cart',
    'cart': 'shopping_cart',
    'coin': 'monetization_on',
    'cash': 'payments',
    'credit-card': 'credit_card',
    'bank': 'account_balance',
    'safe': 'savings',
    'exchange': 'swap_horiz',
    'gift': 'card_giftcard',
    
    // ---- 安全、验证与质量 ----
    'lock-closed': 'lock',
    'lock-open': 'lock_open',
    'shield-check': 'gpp_good',
    'shield': 'gpp_good',
    'badge-check': 'verified',
    'shield-exclamation': 'gpp_maybe',

    // ---- 用户、客户与供应商 ----
    'user': 'person',
    'users': 'groups',
    'user-group': 'group',
    'office-building': 'domain',
    'briefcase': 'work',
    
    // ---- 系统行为 ----
    'logout': 'logout',
    'login': 'login',
    'camera': 'photo_camera',
    'photograph': 'photo_camera',
    'information-circle': 'info',
    'question-mark-circle': 'help',
    'qrcode': 'qr_code',
    'search': 'search',
    'home': 'home',
    'bell': 'notifications',
    'calendar': 'calendar_month',
    'clock': 'schedule',
    'plus': 'add',
    'refresh': 'refresh',
    'cog': 'settings',
    'filter': 'filter_alt',
    'download': 'download',
    'upload': 'upload',
    'trash': 'delete',
    'pencil': 'edit',
    'eye': 'visibility',
    'printer': 'print',
    'mail': 'mail',
    'phone': 'phone',
    'location-marker': 'location_on',
    'tag': 'sell',
    'star': 'star',
    'heart': 'favorite',
    'book-open': 'chrome_reader_mode',
    'apps': 'apps',
    'folder': 'folder',
    'wrench': 'build',
    'undo': 'undo',

    // ---- 图表 ----
    'chart-bar': 'bar_chart',
    'chart-bar-alt': 'bar_chart',
    'chart-pie': 'pie_chart',
    'chart-trending-o': 'trending_up',
    'trending-down': 'trending_down',

    // ---- 状态与方向 ----
    'chevron-right': 'chevron_right',
    'chevron-down': 'expand_more',
    'chevron-up': 'expand_less',
    'arrow-left': 'arrow_back',
    'check': 'check',
    'check-circle': 'check_circle',
    'x-circle': 'cancel'
  };
  
  return map[props.name] || props.name; // 若未命中则直接传原值尝试渲染
});

// 计算 CSS 变量：字体粗细和填充、字号
const customStyle = computed(() => {
  const sizeValue = typeof props.size === 'number' ? `${props.size}px` : props.size;
  return {
    fontSize: sizeValue,
    color: props.color,
    fontVariationSettings: `'FILL' ${props.fill ? 1 : 0}, 'wght' ${props.weight}, 'GRAD' 0, 'opsz' 24`
  };
});
</script>

<style scoped>
.material-symbols-rounded {
  display: inline-block;
  line-height: 1;
  text-transform: none;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  /* 确保图标与附近文字对齐 */
  vertical-align: middle;
}
</style>
