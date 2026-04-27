<!--
/**
 * DocumentLinks.vue
 * @description 单据关联追溯组件 — 可嵌入到任何业务详情页面
 * @usage <DocumentLinks business-type="sales_order" :business-id="orderId" />
 */
-->
<template>
  <div v-if="links.length" class="document-links">
    <el-divider content-position="left">
      <el-icon><Connection /></el-icon> 关联单据
    </el-divider>
    <el-tag
      v-for="link in links"
      :key="link.id"
      :type="link.direction === 'forward' ? '' : 'info'"
      class="link-tag"
      @click="$emit('navigate', link)"
    >
      {{ link.direction === 'forward' ? '→' : '←' }}
      {{ link.related_type_label }}
      <template v-if="link.related_code">: {{ link.related_code }}</template>
    </el-tag>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { Connection } from '@element-plus/icons-vue'
import { docLinkApi } from '@/api/enhanced'

const props = defineProps({
  businessType: { type: String, required: true },
  businessId: { type: [Number, String], required: true },
})

defineEmits(['navigate'])

const links = ref([])

const fetchLinks = async () => {
  if (!props.businessId) return
  try {
    const res = await docLinkApi.getLinks(props.businessType, props.businessId)
    links.value = (res.data || res) || []
  } catch { /* 静默 */ }
}

watch(() => [props.businessType, props.businessId], fetchLinks)
onMounted(fetchLinks)
</script>

<style scoped>
.document-links { margin: var(--spacing-sm, 8px) 0; }
.link-tag { margin-right: 8px; margin-bottom: 4px; cursor: pointer; }
</style>
