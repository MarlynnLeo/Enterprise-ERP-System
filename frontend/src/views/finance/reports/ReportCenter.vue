<template>
  <div class="module-page report-center">
    <PageHeader title="财务报表" subtitle="会计账簿、财务报表与经营分析，集中查询" />

    <el-card class="report-center__filters" shadow="never">
      <div class="report-center__toolbar">
        <el-input
          v-model="search"
          class="report-center__search"
          placeholder="搜索报表名称、科目或用途"
          aria-label="搜索财务报表"
          clearable
          :prefix-icon="Search"
        />
        <span class="report-center__count" role="status">共 {{ reportCount }} 项报表</span>
      </div>
      <div class="report-center__categories" aria-label="报表分类">
        <button
          v-for="category in categoryFilters"
          :key="category.id"
          type="button"
          class="report-center__category"
          :class="{ 'is-active': selectedCategory === category.id }"
          :aria-pressed="selectedCategory === category.id"
          @click="selectedCategory = category.id"
        >{{ category.title }}</button>
      </div>
    </el-card>

    <section
      v-for="group in visibleGroups"
      :key="group.id"
      class="report-center__section"
      :aria-labelledby="`report-group-${group.id}`"
    >
      <div class="report-center__section-heading">
        <h3 :id="`report-group-${group.id}`">{{ group.title }}</h3>
        <p>{{ group.description }}</p>
      </div>
      <div class="report-center__grid">
        <RouterLink
          v-for="report in group.reports"
          :key="report.path"
          :to="report.path"
          class="report-center__report"
        >
          <div class="report-center__report-top">
            <span class="report-center__icon" aria-hidden="true"><el-icon><component :is="group.icon" /></el-icon></span>
            <el-icon class="report-center__arrow" aria-hidden="true"><ArrowRight /></el-icon>
          </div>
          <h4>{{ report.title }}</h4>
          <p>{{ report.description }}</p>
          <span class="report-center__scope">{{ report.scope }}</span>
        </RouterLink>
      </div>
    </section>

    <el-card v-if="!visibleGroups.length" shadow="never">
      <EmptyState
        :title="authorizedCount ? '没有匹配的报表' : '暂无可查看的报表'"
        :description="authorizedCount ? '试试其他关键词，或切换报表分类。' : '当前账号尚未获得报表查看权限。'"
      >
        <el-button v-if="authorizedCount" @click="resetFilters">清除筛选</el-button>
      </EmptyState>
    </el-card>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowRight, DataAnalysis, Document, Search, TrendCharts, Wallet } from '@element-plus/icons-vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const search = ref('');
const selectedCategory = ref('all');
const reportPermission = 'finance:reports:view';

const groups = [
  {
    id: 'ledgers', title: '会计账簿', icon: Document,
    description: '按期间查看账簿发生额与结存。',
    reports: [
      { title: '增值税多栏账', path: '/finance/reports/ledgers/vat', description: '分栏查看进项税、销项税、出口退税及进项税额转出。', scope: '应交增值税 · 借贷发生额', permission: reportPermission },
      { title: '数量金额明细账', path: '/finance/reports/ledgers/quantity', description: '按物料及单位查看数量、单价、金额及逐笔结存。', scope: '存货核算 · 数量与金额', permission: reportPermission },
      { title: '总分类账', path: '/finance/reports/ledgers/general', description: '汇总科目期初余额、各期发生额与本年累计。', scope: '会计科目 · 期间汇总', permission: reportPermission },
      { title: '库存现金日记账', path: '/finance/reports/ledgers/cash', description: '查看库存现金的凭证收支、余额与期间合计。', scope: '库存现金 · 逐笔收支', permission: reportPermission },
      { title: '应付账款明细分类账', path: '/finance/reports/ledgers/payable', description: '按应付科目及供应商追踪借贷发生额和往来余额。', scope: '供应商往来 · 应付余额', permission: reportPermission },
    ],
  },
  {
    id: 'statements', title: '财务报表', icon: DataAnalysis,
    description: '查看财务状况、经营成果与资金流动。',
    reports: [
      { title: '资产负债表', path: '/finance/reports/balance-sheet', description: '汇总指定日期的资产、负债和所有者权益。', scope: '财务状况 · 日期比较', permission: reportPermission },
      { title: '利润表', path: '/finance/reports/income-statement', description: '查看营业收入、成本费用与利润构成。', scope: '经营成果 · 期间比较', permission: reportPermission },
      { title: '现金流量表', path: '/finance/reports/cash-flow', description: '查看现金流入、流出及净增加额。', scope: '现金流动 · 收支分析', permission: reportPermission },
      { title: '标准现金流量表', path: '/finance/reports/standard-cash-flow', description: '按经营、投资和筹资活动分类查看现金流量。', scope: '现金流量项目 · 标准格式', permission: 'finance:reports:standard-cash-flow:view' },
      { title: '试算平衡表', path: '/finance/gl/trial-balance', description: '核对科目的期初、发生额与期末借贷平衡。', scope: '会计科目 · 借贷核对', permission: reportPermission },
    ],
  },
  {
    id: 'balances', title: '往来分析', icon: Wallet,
    description: '关注应收、应付账龄和未结算款项。',
    reports: [
      { title: '应收账龄分析', path: '/finance/ar/aging', description: '按客户与账龄区间查看应收款和逾期情况。', scope: '客户往来 · 账龄分布', permission: reportPermission },
      { title: '应付账龄分析', path: '/finance/ap/aging', description: '按供应商与账龄区间查看应付款和到期情况。', scope: '供应商往来 · 账龄分布', permission: reportPermission },
      { title: '应收待结算', path: '/finance/ar/settlement', description: '查看待收款发票、收款核销与剩余应收。', scope: '客户往来 · 结算明细', permission: 'finance:ar:view' },
      { title: '应付待结算', path: '/finance/ap/settlement', description: '查看待付款发票、付款核销与剩余应付。', scope: '供应商往来 · 结算明细', permission: 'finance:ap:view' },
    ],
  },
  {
    id: 'analysis', title: '经营分析', icon: TrendCharts,
    description: '结合资产、预算与成本数据分析经营情况。',
    reports: [
      { title: '资产报表', path: '/finance/assets/reports', description: '查看固定资产分布、原值、折旧与净值。', scope: '固定资产 · 价值分析', permission: 'finance:assets:view' },
      { title: '预算执行分析', path: '/finance/budget/execution', description: '对比预算与实际执行，追踪差异和执行进度。', scope: '预算控制 · 执行差异', permission: 'finance:budgets:view' },
      { title: '成本明细账', path: '/finance/cost/ledger', description: '按成本中心、产品和期间查看成本明细。', scope: '成本核算 · 多维查询', permission: 'finance:cost:view' },
      { title: '成本差异分析', path: '/finance/cost/variance', description: '对比标准成本与实际成本，查看成本差异。', scope: '成本核算 · 标准与实际', permission: 'finance:cost:view' },
      { title: '盈利分析', path: '/finance/cost/profitability', description: '查看收入、成本与利润，分析业务盈利情况。', scope: '经营收益 · 利润分析', permission: 'finance:cost:view' },
    ],
  },
];

const authorizedGroups = computed(() => groups
  .map(group => ({ ...group, reports: group.reports.filter(report => auth.hasPermission(report.permission)) }))
  .filter(group => group.reports.length));
const authorizedCount = computed(() => authorizedGroups.value.reduce((sum, group) => sum + group.reports.length, 0));
const categoryFilters = computed(() => [{ id: 'all', title: '全部报表' }, ...authorizedGroups.value]);
const visibleGroups = computed(() => {
  const keywords = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return authorizedGroups.value
    .filter(group => selectedCategory.value === 'all' || group.id === selectedCategory.value)
    .map(group => ({
      ...group,
      reports: group.reports.filter(report => {
        const text = `${group.title} ${report.title} ${report.description} ${report.scope}`.toLocaleLowerCase();
        return keywords.every(keyword => text.includes(keyword));
      }),
    }))
    .filter(group => group.reports.length);
});
const reportCount = computed(() => visibleGroups.value.reduce((sum, group) => sum + group.reports.length, 0));
const resetFilters = () => { search.value = ''; selectedCategory.value = 'all'; };
</script>

<style scoped>
.report-center { display: flex; flex-direction: column; gap: 20px; }
.report-center__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.report-center__search { max-width: 420px; }
.report-center__count { color: var(--color-text-secondary); font-size: 13px; white-space: nowrap; }
.report-center__categories { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.report-center__category {
  padding: 8px 15px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.report-center__category:hover, .report-center__category.is-active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}
.report-center__section-heading { margin: 0 0 12px; }
.report-center__section-heading h3 { margin: 0 0 5px; color: var(--color-text-primary); font-size: 17px; font-weight: 600; }
.report-center__section-heading p { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; }
.report-center__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(245px, 1fr)); gap: 14px; }
.report-center__report {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
  color: var(--color-text-primary);
  text-decoration: none;
}
.report-center__report:hover { border-color: var(--el-color-primary); background: var(--el-fill-color-light); }
.report-center__report:focus-visible, .report-center__category:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; }
.report-center__report-top { display: flex; align-items: center; justify-content: space-between; }
.report-center__icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--el-border-radius-base); color: var(--el-color-primary); background: var(--el-color-primary-light-9); font-size: 20px; }
.report-center__arrow { color: var(--el-text-color-placeholder); }
.report-center__report h4 { margin: 14px 0 8px; font-size: 16px; font-weight: 600; line-height: 1.5; }
.report-center__report p { margin: 0 0 16px; color: var(--color-text-secondary); font-size: 13px; line-height: 1.7; }
.report-center__scope { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--el-border-color-lighter); color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; }
@media (max-width: 600px) {
  .report-center__toolbar { align-items: stretch; flex-direction: column; gap: 10px; }
  .report-center__search { max-width: none; }
  .report-center__grid { grid-template-columns: 1fr; }
  .report-center__report { padding: 16px; }
}
</style>
