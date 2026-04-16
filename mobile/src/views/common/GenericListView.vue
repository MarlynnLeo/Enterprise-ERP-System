<!--
/**
 * GenericListView.vue - 智能中枢列表页面视图
 * @description 自动根据路由 meta 配置调用通用接口渲染炫酷的 Unified 列表，消灭无意义的 ComingSoon 页面
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    v-if="moduleConfig && apiFunction"
    :config="moduleConfig"
    :api-function="apiFunction"
    :list-title="listTitle"
    :show-add="false"
    :show-filter="false"
    @item-click="handleItemClick"
  >
    <template v-if="$route.meta?.customHeader">
      <!-- Future custom extension slot -->
    </template>
  </UniversalListPage>
  <!-- 无后端接口时的优雅降级 -->
  <div v-else-if="noApiConfigured" class="page-container">
    <NavBar :title="$route.meta?.title || '功能模块'" left-arrow @click-left="router.back()" />
    <div
      class="content-container"
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 80vh;
      "
    >
      <Empty image="error" :description="`该模块正在开发中，敬请期待`">
        <template #default>
          <div style="margin-top: 16px; text-align: center">
            <Button plain type="primary" size="small" @click="router.back()">返回上一页</Button>
          </div>
        </template>
      </Empty>
    </div>
  </div>
  <div v-else class="generic-loading">
    <van-loading type="spinner" color="var(--van-primary-color)">渲染引擎初始化中...</van-loading>
  </div>
</template>

<script setup>
  import { ref, computed, watch, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import * as apiServices from '@/services/api'
  import { showToast, NavBar, Empty, Button } from 'vant'

  const route = useRoute()
  const router = useRouter()

  const moduleConfig = ref(null)
  const apiFunction = ref(null)
  const noApiConfigured = ref(false)

  const listTitle = computed(() => route.meta.title || '数据列表')

  // 核心初始化逻辑
  const initEngine = () => {
    const meta = route.meta
    if (!meta || !meta.config) {
      // 没有 config 时也不崩溃，展示空状态
      noApiConfigured.value = true
      return
    }

    moduleConfig.value = meta.config

    // 动态解析路由上的 api 配置 (如 "inventoryApi.getInboundList")
    const apiCallStr = meta.api || ''
    const [module, method] = apiCallStr.split('.')

    if (module && method && apiServices[module] && apiServices[module][method]) {
      apiFunction.value = apiServices[module][method]
    } else {
      // 没有配置 API 时，展示友好提示而非崩溃
      console.warn(`GenericListView: 该模块暂未配置后端接口 => ${meta.title}`)
      noApiConfigured.value = true
    }
  }

  onMounted(() => {
    initEngine()
  })

  // 当地址携带参数发生变更时，重新激活组件
  watch(
    () => route.path,
    () => {
      moduleConfig.value = null
      apiFunction.value = null
      initEngine()
    }
  )

  const handleItemClick = (item) => {
    // 移动端主要做查阅功能，如配置了动态路由可在此直接抛出
    if (moduleConfig.value.detailRoute) {
      const detailPath = moduleConfig.value.detailRoute.replace(
        ':id',
        item[moduleConfig.value.fields.id]
      )
      router.push(detailPath)
    } else {
      // showToast(`选中项目: ${item[moduleConfig.value.fields.title]}`)
    }
  }
</script>

<style lang="scss" scoped>
  .page-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: var(--van-background-2);
  }

  .generic-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--van-background-2);
  }
</style>
