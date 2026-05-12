import { defineStore } from 'pinia';
import { systemApi } from '@/api';

export const useDictionaryStore = defineStore('dictionary', {
  state: () => ({
    // 全局业务数据字典映射
    types: [],
    // 按分组分类的数据
    groups: {},
    isLoaded: false,
    isLoading: false
  }),

  // 全局无需 getters 封壳，统一迁移至 actions 以获取纯净的响应式代理追踪
  getters: {
    // Vue 3 Pinia: Getter 返回高阶函数时，外部包裹的 Computed 依赖可能追踪失效。
    // 所以清空这些闭合函数，降维至 Actions.
  },

  actions: {
    /**
     * 获取指定分组的 code -> name 映射
     */
    getMap(groupCode) {
      // 强制读取代理引用触发响应追踪
      const groups = this.groups;
      const group = groups[groupCode] || [];
      const map = {};
      group.forEach(item => {
        map[item.code] = item.name;
      });
      return map;
    },

    /**
     * 获取指定分组的选项列表 (供 el-select 使用)
     */
    getOptions(groupCode) {
      const groups = this.groups;
      const group = groups[groupCode] || [];
      return group.map(item => ({
        value: item.code,
        label: item.name
      }));
    },

    /**
     * 获取指定分组下某个 code 的名称
     */
    getText(groupCode, code) {
      const groups = this.groups;
      const group = groups[groupCode] || [];
      const item = group.find(i => i.code === code);
      return item ? item.name : code;
    },

    /**
     * 获取指定分组下某个 code 的标签颜色
     */
    getColor(groupCode, code) {
      const groups = this.groups;
      const group = groups[groupCode] || [];
      const item = group.find(i => i.code === code);
      return item && item.tag_type ? item.tag_type : 'info';
    },

    /**
     * 初始化/刷新全局业务字典
     */
    async fetchDictionary() {
      // 避免重复请求
      if (this.isLoading) return;
      // 如果已经加载过并要求优先使用缓存
      if (this.isLoaded) return;

      this.isLoading = true;
      try {
        // 请求后台数据，需确保引入的是正确的 api
        const apiToUse = systemApi;

        if (!apiToUse) {
          console.error('[Dictionary Store] 无法找到 getBusinessTypes API');
          return;
        }

        const response = await apiToUse.getBusinessTypes({ status: 1 });
        if (response.data) {
          // 处理后端分页包裹或者直接数组的格式
          const allTypes = Array.isArray(response.data) ? response.data : (response.data.list || []);
          this.types = allTypes;

          // 根据 group_code 对所有字典进行分组，便于前端快速查找
          const newGroups = {};
          allTypes.forEach(item => {
            const groupCode = item.group_code;
            if (!groupCode) return;

            if (!newGroups[groupCode]) {
              newGroups[groupCode] = [];
            }
            newGroups[groupCode].push(item);
          });

          this.groups = newGroups;
          this.isLoaded = true;
        }
      } catch (error) {
        console.error('[Dictionary Store] 初始化字典错误:', error);
      } finally {
        this.isLoading = false;
      }
    }
  }
});
