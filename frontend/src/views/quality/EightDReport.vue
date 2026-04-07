<template>
  <div class="eight-d-report-container">
    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.total || 0 }}</div>
        <div class="stat-label">全部报告</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #E6A23C;">{{ statistics.in_progress_count || 0 }}</div>
        <div class="stat-label">进行中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #409EFF;">{{ statistics.review_count || 0 }}</div>
        <div class="stat-label">待审核</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #67C23A;">{{ statistics.completed_count || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #F56C6C;">{{ statistics.critical_count || 0 }}</div>
        <div class="stat-label">紧急</div>
      </el-card>
    </div>

    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>8D问题解决报告</span>
          <el-button type="primary" @click="handleCreate">
            <el-icon><Plus /></el-icon>新增8D报告
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <div class="search-container">
        <el-row :gutter="16">
          <el-col :span="5">
            <el-input v-model="searchForm.keyword" placeholder="编号/标题/物料/负责人" @keyup.enter="fetchData" clearable>
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </el-col>
          <el-col :span="3">
            <el-select v-model="searchForm.status" placeholder="状态" clearable @change="fetchData" style="width: 100%">
              <el-option label="草稿" value="draft" />
              <el-option label="进行中" value="in_progress" />
              <el-option label="待审核" value="review" />
              <el-option label="已完成" value="completed" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-col>
          <el-col :span="3">
            <el-select v-model="searchForm.priority" placeholder="优先级" clearable @change="fetchData" style="width: 100%">
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
              <el-option label="紧急" value="critical" />
            </el-select>
          </el-col>
          <el-col :span="5">
            <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" @change="fetchData" style="width: 100%" />
          </el-col>
          <el-col :span="4">
            <el-button type="primary" @click="fetchData"><el-icon><Search /></el-icon>查询</el-button>
            <el-button @click="handleReset"><el-icon><Refresh /></el-icon>重置</el-button>
          </el-col>
        </el-row>
      </div>

      <!-- 表格 -->
      <el-table :data="tableData" border v-loading="loading" style="width: 100%; margin-top: 16px;">
        <el-table-column prop="report_no" label="报告编号" width="140" show-overflow-tooltip />
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="ncp_no" label="关联NCP" width="120" show-overflow-tooltip />
        <el-table-column prop="material_name" label="物料名称" width="120" show-overflow-tooltip />
        <el-table-column prop="initiated_by" label="发起人" width="90" show-overflow-tooltip />
        <el-table-column prop="owner" label="主负责人" width="90" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="getPriorityType(row.priority)" size="small">{{ getPriorityLabel(row.priority) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前阶段" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="!['completed', 'closed'].includes(row.current_phase)" :type="getPhaseType(row.current_phase)" size="small">{{ getPhaseLabel(row.current_phase) }}</el-tag>
            <span v-else style="color: #909399; font-size: 13px;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="进度" width="130">
          <template #default="{ row }">
            <el-progress :percentage="getProgress(row)" :stroke-width="8" :color="getProgressColor(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target_close_date" label="目标关闭" width="100">
          <template #default="{ row }">
            <span :class="{ 'text-danger': isOverdue(row) }">{{ formatDate(row.target_close_date) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="100">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="handleView(row)">查看</el-button>
            <el-button size="small" type="primary" @click="handleEdit(row)" v-if="row.status !== 'closed' && row.status !== 'completed'">编辑</el-button>
            <!-- 根据当前阶段显示不同的流程按钮 -->
            <el-button v-permission="'quality:eightdreport:submit'" size="small" type="warning" @click="handleSubmitReview(row)" v-if="row.status === 'in_progress' && row.current_phase === 'd1_d3'">提交初审</el-button>
            <el-button v-permission="'quality:eightdreport:submit'" size="small" type="warning" @click="handleSubmitPhase2(row)" v-if="row.status === 'in_progress' && row.current_phase === 'd4_d7'">提交结案</el-button>
            <el-button v-permission="'quality:eightdreport:audit'" size="small" type="success" @click="handleReview(row)" v-if="row.status === 'review'">审核</el-button>
            <el-button size="small" type="success" @click="handleComplete(row)" v-if="row.current_phase === 'd8' && row.status === 'in_progress'">完成</el-button>
            <el-button v-permission="'quality:eightdreport:delete'" size="small" type="danger" @click="handleDelete(row)" v-if="row.status === 'draft'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination v-model:current-page="pagination.current" v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 50]" :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData" @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end;" />
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="formDialogVisible" :title="isEdit ? '编辑8D报告' : '创建8D报告'" width="920px" destroy-on-close>

      <!-- 阶段进度指示器 -->
      <div class="phase-indicator" v-if="isEdit">
        <el-steps :active="getPhaseStep(formData.current_phase)" finish-status="success" align-center size="small">
          <el-step title="立案" description="D1-D3" />
          <el-step title="初审" />
          <el-step title="整改" description="D4-D7" />
          <el-step title="结案审核" />
          <el-step title="总结" description="D8" />
          <el-step title="完成" />
        </el-steps>
      </div>

      <el-tabs v-model="activeTab" type="border-card">
        <!-- 基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <el-form :model="formData" :rules="formRules" ref="formRef" label-width="120px">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="报告标题" prop="title">
                  <el-input v-model="formData.title" placeholder="请输入报告标题" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="优先级">
                  <el-select v-model="formData.priority" style="width: 100%">
                    <el-option label="低" value="low" />
                    <el-option label="中" value="medium" />
                    <el-option label="高" value="high" />
                    <el-option label="紧急" value="critical" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="发起人" prop="initiated_by">
                  <el-select v-model="formData.initiated_by" filterable placeholder="谁发现/上报了此问题" style="width: 100%" clearable>
                    <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="主负责人" prop="owner">
                  <el-select v-model="formData.owner" filterable placeholder="整个8D流程推进负责人" style="width: 100%" clearable>
                    <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="关联NCP单据">
                  <el-select
                    v-model="formData.ncp_id"
                    filterable
                    remote
                    reserve-keyword
                    placeholder="请输入NCP编号搜索..."
                    :remote-method="fetchNcpList"
                    :loading="loadingNcp"
                    @change="handleNcpSelect"
                    style="width: 100%"
                    clearable
                  >
                    <el-option
                      v-for="item in ncpList"
                      :key="item.id"
                      :label="`${item.ncp_no} - ${item.material_name}`"
                      :value="item.id"
                    >
                      <span style="float: left">{{ item.ncp_no }}</span>
                      <span style="float: right; color: var(--el-text-color-secondary); font-size: 13px">{{ item.material_name }}</span>
                    </el-option>
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="目标关闭日期">
                  <el-date-picker v-model="formData.target_close_date" placeholder="选择目标完成日期" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="客户">
                  <el-input v-model="formData.supplier_name" placeholder="投诉客户名称" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="客户联系人">
                  <el-input v-model="formData.customer_contact" placeholder="客诉触发时填写客户联系人" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="物料编码">
                  <el-input v-model="formData.material_code" placeholder="物料编码" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="物料名称">
                  <el-input v-model="formData.material_name" placeholder="物料名称" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-tab-pane>

        <!-- D1: 团队 -->
        <el-tab-pane label="D1 团队" name="d1">
          <el-form :model="formData" label-width="120px">
            <el-form-item label="团队组长">
              <el-select v-model="formData.d1_team_leader" filterable placeholder="请选择团队组长" style="width: 100%" clearable>
                <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
              </el-select>
            </el-form-item>
            <el-form-item label="团队成员">
              <el-input v-model="formData.d1_team_members_str" type="textarea" :rows="3" placeholder="团队成员（每行一人）" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- D2: 问题描述 -->
        <el-tab-pane label="D2 问题描述" name="d2">
          <el-form :model="formData" label-width="120px">
            <el-form-item label="问题描述">
              <el-input v-model="formData.d2_problem_description" type="textarea" :rows="4" placeholder="详细描述问题现象..." />
            </el-form-item>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="发生日期">
                  <el-date-picker v-model="formData.d2_occurrence_date" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="影响数量">
                  <el-input-number v-model="formData.d2_quantity_affected" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="缺陷类型">
              <el-input v-model="formData.d2_defect_type" placeholder="缺陷类型分类" />
            </el-form-item>
            <el-form-item label="责任人">
              <el-select v-model="formData.d2_responsible_person" filterable placeholder="请选择责任人" style="width: 100%" clearable>
                <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- D3: 遏制措施 -->
        <el-tab-pane label="D3 遏制措施" name="d3">
          <el-form :model="formData" label-width="120px">
            <el-form-item label="遏制措施">
              <el-input v-model="formData.d3_containment_actions_str" type="textarea" :rows="4" placeholder="临时遏制措施（每行一条）" />
            </el-form-item>
            <el-form-item label="生效日期">
              <el-date-picker v-model="formData.d3_effective_date" style="width: 100%" />
            </el-form-item>
            <el-form-item label="责任人">
              <el-select v-model="formData.d3_responsible_person" filterable placeholder="请选择责任人" style="width: 100%" clearable>
                <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- D4: 根因分析 -->
        <el-tab-pane label="D4 根因分析" name="d4">
          <el-alert v-if="formData.current_phase === 'd1_d3'" title="当前处于D1-D3阶段，请先完成初审后再填写D4" type="info" :closable="false" show-icon style="margin-bottom: 16px" />
          <el-form :model="formData" label-width="120px">
            <el-form-item label="根本原因">
              <el-input v-model="formData.d4_root_cause" type="textarea" :rows="4" placeholder="经分析得出的根本原因..." />
            </el-form-item>
            <el-form-item label="分析方法">
              <el-select v-model="formData.d4_analysis_method" style="width: 100%">
                <el-option label="5 Why 分析法" value="5why" />
                <el-option label="鱼骨图（因果图）" value="fishbone" />
                <el-option label="FMEA 失效模式分析" value="fmea" />
                <el-option label="帕累托分析" value="pareto" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
            <el-form-item label="促成因素">
              <el-input v-model="formData.d4_contributing_factors_str" type="textarea" :rows="3" placeholder="其他促成因素（每行一条）" />
            </el-form-item>
            <el-form-item label="责任人">
              <el-select v-model="formData.d4_responsible_person" filterable placeholder="请选择责任人" style="width: 100%" clearable>
                <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- D5: 纠正措施 -->
        <el-tab-pane label="D5 纠正措施" name="d5">
          <el-form :model="formData" label-width="120px">
            <el-form-item label="纠正措施">
              <el-input v-model="formData.d5_corrective_actions_str" type="textarea" :rows="4" placeholder="永久纠正措施（每行一条）" />
            </el-form-item>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="责任人">
                  <el-select v-model="formData.d5_responsible_person" filterable placeholder="请选择责任人" style="width: 100%" clearable>
                    <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="目标完成日期">
                  <el-date-picker v-model="formData.d5_target_date" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-tab-pane>

        <!-- D6: 验证 -->
        <el-tab-pane label="D6 实施验证" name="d6">
          <el-form :model="formData" label-width="120px">
            <el-form-item label="实施结果">
              <el-input v-model="formData.d6_implementation_results" type="textarea" :rows="4" placeholder="实施结果记录..." />
            </el-form-item>
            <el-form-item label="验证方法">
              <el-input v-model="formData.d6_verification_method" placeholder="使用的验证方法" />
            </el-form-item>
            <el-form-item label="验证结果">
              <el-select v-model="formData.d6_verification_result" style="width: 100%">
                <el-option label="待验证" value="pending" />
                <el-option label="通过" value="pass" />
                <el-option label="未通过" value="fail" />
              </el-select>
            </el-form-item>
            <el-form-item label="责任人">
              <el-select v-model="formData.d6_responsible_person" filterable placeholder="请选择责任人" style="width: 100%" clearable>
                <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- D7: 预防 -->
        <el-tab-pane label="D7 预防措施" name="d7">
          <el-form :model="formData" label-width="120px">
            <el-form-item label="预防措施">
              <el-input v-model="formData.d7_preventive_actions_str" type="textarea" :rows="4" placeholder="预防再发生措施（每行一条）" />
            </el-form-item>
            <el-form-item label="标准化内容">
              <el-input v-model="formData.d7_standardization" type="textarea" :rows="3" placeholder="需要标准化/制度化的内容" />
            </el-form-item>
            <el-form-item label="责任人">
              <el-select v-model="formData.d7_responsible_person" filterable placeholder="请选择责任人" style="width: 100%" clearable>
                <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- D8: 总结 -->
        <el-tab-pane label="D8 总结关闭" name="d8">
          <el-alert v-if="formData.current_phase !== 'd8' && formData.current_phase !== 'completed'" title="请先通过D4-D7结案审核后再填写D8总结" type="info" :closable="false" show-icon style="margin-bottom: 16px" />
          <el-form :model="formData" label-width="120px">
            <el-form-item label="总结">
              <el-input v-model="formData.d8_summary" type="textarea" :rows="4" placeholder="8D报告总结..." />
            </el-form-item>
            <el-form-item label="经验教训">
              <el-input v-model="formData.d8_lessons_learned" type="textarea" :rows="3" placeholder="经验教训总结" />
            </el-form-item>
            <el-form-item label="团队表彰">
              <el-input v-model="formData.d8_team_recognition" type="textarea" :rows="2" placeholder="团队贡献表彰" />
            </el-form-item>
            <el-form-item label="责任人">
              <el-select v-model="formData.d8_responsible_person" filterable placeholder="请选择责任人" style="width: 100%" clearable>
                <el-option v-for="user in userList" :key="user.id" :label="`${user.real_name || user.username}`" :value="user.real_name || user.username" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div>
            <el-button type="success" plain @click="openAiDialog" v-if="!isEdit">
              <el-icon class="el-icon--left"><MagicStick /></el-icon>AI辅助生成
            </el-button>
          </div>
          <div>
            <el-button @click="formDialogVisible = false">取消</el-button>
            <el-button v-permission="'quality:eightdreport:update'" type="primary" @click="submitForm" :loading="submitLoading">{{ isEdit ? '保存' : '创建' }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="8D报告详情" width="920px" destroy-on-close>
      <div v-if="detailData" id="pdf-detail-content" style="padding: 10px; background-color: #fff;">
        <!-- 角色信息卡片 -->
        <el-row :gutter="16" style="margin-bottom: 16px;">
          <el-col :span="8">
            <el-card shadow="never" class="role-card">
              <div class="role-icon" style="background: #E6F7FF;">📋</div>
              <div class="role-info">
                <div class="role-title">发起人</div>
                <div class="role-name">{{ detailData.initiated_by || detailData.created_by || '-' }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="never" class="role-card">
              <div class="role-icon" style="background: #FFF7E6;">👤</div>
              <div class="role-info">
                <div class="role-title">主负责人 (Champion)</div>
                <div class="role-name">{{ detailData.owner || '-' }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="never" class="role-card">
              <div class="role-icon" style="background: #F0FFF0;">👥</div>
              <div class="role-info">
                <div class="role-title">D1团队组长</div>
                <div class="role-name">{{ detailData.d1_team_leader || '-' }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 阶段进度 -->
        <el-steps :active="getPhaseStep(detailData.current_phase)" finish-status="success" align-center size="small" style="margin-bottom: 20px;">
          <el-step title="立案" description="D1-D3" />
          <el-step title="初审" />
          <el-step title="整改" description="D4-D7" />
          <el-step title="结案审核" />
          <el-step title="总结" description="D8" />
          <el-step title="完成" />
        </el-steps>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="报告编号">{{ detailData.report_no }}</el-descriptions-item>
          <el-descriptions-item label="标题">{{ detailData.title }}</el-descriptions-item>
          <el-descriptions-item label="关联NCP">{{ detailData.ncp_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(detailData.status)">{{ getStatusLabel(detailData.status) }}</el-tag>
            <el-tag v-if="!['completed', 'closed'].includes(detailData.current_phase)" :type="getPhaseType(detailData.current_phase)" style="margin-left: 8px;">{{ getPhaseLabel(detailData.current_phase) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="物料">{{ detailData.material_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ detailData.supplier_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="目标关闭日期">
            <span :class="{ 'text-danger': isOverdue(detailData) }">{{ formatDate(detailData.target_close_date) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="客户联系人">{{ detailData.customer_contact || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-timeline style="margin-top: 20px;">
          <el-timeline-item :type="detailData.d1_completed_at ? 'success' : 'info'" timestamp="D1 - 组建团队">
            <p><strong>组长:</strong> {{ detailData.d1_team_leader || '-' }}</p>
            <p><strong>成员:</strong> {{ Array.isArray(detailData.d1_team_members) ? detailData.d1_team_members.join(', ') : (detailData.d1_team_members || '-') }}</p>
          </el-timeline-item>
          <el-timeline-item :type="detailData.d2_completed_at ? 'success' : 'info'" timestamp="D2 - 问题描述">
            <p><strong>责任人:</strong> {{ detailData.d2_responsible_person || '-' }}</p>
            <p>{{ detailData.d2_problem_description || '未填写' }}</p>
          </el-timeline-item>
          <el-timeline-item :type="detailData.d3_completed_at ? 'success' : 'info'" timestamp="D3 - 遏制措施">
            <p><strong>责任人:</strong> {{ detailData.d3_responsible_person || '-' }}</p>
            <p>{{ Array.isArray(detailData.d3_containment_actions) ? detailData.d3_containment_actions.join('；') : (detailData.d3_containment_actions || '未填写') }}</p>
          </el-timeline-item>
          <el-timeline-item :type="detailData.d4_completed_at ? 'success' : 'info'" timestamp="D4 - 根因分析">
            <p><strong>责任人:</strong> {{ detailData.d4_responsible_person || '-' }}</p>
            <p><strong>根因:</strong> {{ detailData.d4_root_cause || '未填写' }}</p>
            <p><strong>方法:</strong> {{ detailData.d4_analysis_method || '-' }}</p>
          </el-timeline-item>
          <el-timeline-item :type="detailData.d5_completed_at ? 'success' : 'info'" timestamp="D5 - 纠正措施">
            <p><strong>责任人:</strong> {{ detailData.d5_responsible_person || '-' }}</p>
            <p>{{ Array.isArray(detailData.d5_corrective_actions) ? detailData.d5_corrective_actions.join('；') : (detailData.d5_corrective_actions || '未填写') }}</p>
          </el-timeline-item>
          <el-timeline-item :type="detailData.d6_completed_at ? 'success' : 'info'" timestamp="D6 - 验证">
            <p><strong>责任人:</strong> {{ detailData.d6_responsible_person || '-' }}</p>
            <p><strong>结果:</strong> {{ detailData.d6_implementation_results || '未填写' }}</p>
            <p><strong>验证:</strong> {{ detailData.d6_verification_result === 'pass' ? '✅ 通过' : detailData.d6_verification_result === 'fail' ? '❌ 未通过' : '⏳ 待验证' }}</p>
          </el-timeline-item>
          <el-timeline-item :type="detailData.d7_completed_at ? 'success' : 'info'" timestamp="D7 - 预防措施">
            <p><strong>责任人:</strong> {{ detailData.d7_responsible_person || '-' }}</p>
            <p>{{ Array.isArray(detailData.d7_preventive_actions) ? detailData.d7_preventive_actions.join('；') : (detailData.d7_preventive_actions || '未填写') }}</p>
          </el-timeline-item>
          <el-timeline-item :type="detailData.d8_completed_at ? 'success' : 'info'" timestamp="D8 - 总结关闭">
            <p><strong>责任人:</strong> {{ detailData.d8_responsible_person || '-' }}</p>
            <p>{{ detailData.d8_summary || '未填写' }}</p>
          </el-timeline-item>
        </el-timeline>
      </div>

      <!-- 审核信息 -->
      <el-descriptions :column="2" border style="margin-top: 16px" v-if="detailData && (detailData.phase1_approved_by || detailData.reviewed_by)">
        <el-descriptions-item label="初审人" v-if="detailData.phase1_approved_by">{{ detailData.phase1_approved_by }}</el-descriptions-item>
        <el-descriptions-item label="初审时间" v-if="detailData.phase1_approved_at">{{ formatDate(detailData.phase1_approved_at) }}</el-descriptions-item>
        <el-descriptions-item label="结案审核人" v-if="detailData.phase2_approved_by">{{ detailData.phase2_approved_by }}</el-descriptions-item>
        <el-descriptions-item label="结案审核时间" v-if="detailData.phase2_approved_at">{{ formatDate(detailData.phase2_approved_at) }}</el-descriptions-item>
        <el-descriptions-item label="审核意见" :span="2" v-if="detailData.review_comments">{{ detailData.review_comments }}</el-descriptions-item>
      </el-descriptions>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailDialogVisible = false">关闭</el-button>
          <el-button type="success" @click="exportDetailToPdf" :loading="exportPdfLoading">
            <el-icon style="margin-right: 4px"><Download /></el-icon> 导出 PDF
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 审核对话框 -->
    <el-dialog v-model="reviewDialogVisible" title="审核8D报告" width="500px">
      <el-alert
        :title="currentRow?.current_phase === 'd1_d3' ? '当前审核：D1-D3初审（审核通过后将进入D4-D7整改阶段）' : '当前审核：D4-D7结案审核（审核通过后将进入D8总结阶段）'"
        type="info" :closable="false" show-icon style="margin-bottom: 16px" />
      <el-form :model="reviewForm" label-width="100px">
        <el-form-item label="审核结果" required>
          <el-radio-group v-model="reviewForm.approved">
            <el-radio :value="true">通过</el-radio>
            <el-radio :value="false">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审核意见">
          <el-input v-model="reviewForm.comments" type="textarea" :rows="3" placeholder="请输入审核意见" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:eightdreport:submit'" type="primary" @click="submitReview" :loading="submitLoading">提交</el-button>
      </template>
    </el-dialog>

    <!-- AI生成对话框 -->
    <el-dialog v-model="aiDialogVisible" title="AI智能分析生成" width="600px" append-to-body>
      <el-alert title="基于KACON公司部门结构，智能生成符合IATF 16949标准的专业8D报告。团队组建将自动匹配品质部/技术部/生产部等真实部门，D2日期使用当天。" type="success" :closable="false" show-icon style="margin-bottom: 20px" />
      <el-form :model="aiForm" label-width="100px" v-loading="aiLoading" element-loading-text="AI正在深度思考生成中，约需要10-30秒...">
        <el-form-item label="问题描述" required>
          <el-input v-model="aiForm.problemDescription" type="textarea" :rows="5" placeholder="请详细描述问题（5W2H）：什么时候，在哪里，发现了什么缺陷，影响了多少数量，临时是怎么处理的..." />
        </el-form-item>
        <el-form-item label="物料/零件">
          <el-input v-model="aiForm.materialName" placeholder="(选填) 例如: 压铸铝外壳" />
        </el-form-item>
        <el-form-item label="客户">
          <el-input v-model="aiForm.supplierName" placeholder="(选填) 例如: 某某自动化科技有限公司" />
        </el-form-item>
        <el-form-item label="缺陷类型">
          <el-input v-model="aiForm.defectType" placeholder="(选填) 例如: 尺寸超差、外观划伤" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="aiDialogVisible = false" :disabled="aiLoading">取消</el-button>
        <el-button type="primary" @click="submitAiGenerate" :loading="aiLoading">开始生成</el-button>
      </template>
    </el-dialog>
  
    <!-- 流转审计日志弹窗 / 客户报告打印 -->
    <el-dialog v-model="logsDialogVisible" :title="isPrintMode ? '客户报告打印预览' : '8D生命周期审计流转记录'" width="800px">
      <div v-if="!isPrintMode">
        <el-timeline>
          <el-timeline-item v-for="(log, idx) in auditLogs" :key="idx" :timestamp="dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')" :type="log.action.includes('reject') ? 'danger' : 'success'">
            <h4>[{{ log.action }}] 由 {{ log.operator }} 触发</h4>
            <p>阶段变化: {{ log.old_phase || '起步' }} -> {{ log.new_phase }}</p>
            <p v-if="log.comments">意见/备注: {{ log.comments }}</p>
          </el-timeline-item>
        </el-timeline>
      </div>
      <div v-else class="print-container" id="printable-8d-report">
        <!-- 打印视图 -->
        <h1 style="text-align: center; border-bottom: 2px solid #ccc; padding-bottom: 20px;">8D 纠正预防措施报告</h1>
        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
          <span><strong>报告编号:</strong> {{ currentPrintRow?.report_no }}</span>
          <span><strong>发生日期:</strong> {{ dayjs(currentPrintRow?.d2_occurrence_date).format('YYYY-MM-DD') }}</span>
          <span><strong>缺陷描述:</strong> {{ currentPrintRow?.d2_defect_type }}</span>
        </div>
        <table border="1" style="width: 100%; border-collapse: collapse; text-align: left;" cellpadding="8">
          <tbody>
            <tr>
              <th width="20%">D1 团队组建</th>
              <td>组长: {{ currentPrintRow?.d1_team_leader }} | 成员: {{ typeof currentPrintRow?.d1_team_members==='string' ? JSON.parse(currentPrintRow?.d1_team_members||'[]').join(', ') : '' }}</td>
            </tr>
            <tr>
              <th>D2 问题描述</th>
              <td>{{ currentPrintRow?.d2_problem_description }}<br/><strong>影响数量:</strong> {{ currentPrintRow?.d2_quantity_affected }}</td>
            </tr>
            <tr>
              <th>D3 临时遏制措施</th>
              <td>
                 <p>{{ typeof currentPrintRow?.d3_containment_actions==='string' ? JSON.parse(currentPrintRow?.d3_containment_actions||'[]').join(', ') : '' }}</p>
                 <div v-if="currentPrintRow?.d3_attachments && currentPrintRow.d3_attachments !== '[]'">
                    <p>附图：已归档至服务器</p>
                 </div>
              </td>
            </tr>
            <tr>
              <th>D4 根本原因分析</th>
              <td>{{ currentPrintRow?.d4_root_cause }}</td>
            </tr>
            <tr>
              <th>D5 永久纠正措施</th>
              <td>{{ typeof currentPrintRow?.d5_corrective_actions==='string' ? JSON.parse(currentPrintRow?.d5_corrective_actions||'[]').join(', ') : '' }}</td>
            </tr>
            <tr>
              <th>D6 实施与效果验证</th>
              <td>{{ currentPrintRow?.d6_verification_method }}<br/>验证结果: {{ currentPrintRow?.d6_verification_result }}</td>
            </tr>
            <tr>
              <th>D7 预防与标准化</th>
              <td>{{ currentPrintRow?.d7_standardization }}</td>
            </tr>
            <tr>
              <th>D8 团队认可与结案</th>
              <td>{{ currentPrintRow?.d8_summary }}<br/><strong>经验教训:</strong> {{ currentPrintRow?.d8_lessons_learned }}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top: 50px; text-align: right; color: #888; font-size: 12px;">自动生成自 MES/ERP 系统 - {{ dayjs().format('YYYY-MM-DD HH:mm') }}</div>
      </div>
      <template #footer>
        <el-button @click="logsDialogVisible = false">关闭</el-button>
        <el-button v-permission="'quality:eightdreport:print'" type="primary" v-if="isPrintMode" @click="handlePrintCommand">确认打印 (A4)</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, MagicStick, Download } from '@element-plus/icons-vue'
import html2pdf from 'html2pdf.js'
import { eightDReportApi } from '@/api/quality'
import nonconformingProductApi from '@/api/nonconformingProductApi'
import { systemApi } from '@/api/system'
import { api } from '@/services/axiosInstance'
import dayjs from 'dayjs'

// 响应式状态

const logsDialogVisible = ref(false)
const isPrintMode = ref(false)
const auditLogs = ref([])
const currentPrintRow = ref(null)

const viewLogs = async (row) => {
  try {
    const res = await eightDReportApi.getReportLogs(row.id)
    auditLogs.value = res.data?.data || res.data
    isPrintMode.value = false
    logsDialogVisible.value = true
  } catch (err) {
    ElMessage.error('获取审计日志失败')
  }
}

const printCustomerReport = async (row) => {
  currentPrintRow.value = row
  isPrintMode.value = true
  logsDialogVisible.value = true
}

const handlePrintCommand = () => {
  const printContents = document.getElementById('printable-8d-report').innerHTML;
  const originalContents = document.body.innerHTML;
  document.body.innerHTML = printContents;
  window.print();
  document.body.innerHTML = originalContents;
  logsDialogVisible.value = false;
  location.reload(); // 防止 vue 挂载元素丢失
}

const exportPdfLoading = ref(false)
const exportDetailToPdf = () => {
  const element = document.getElementById('pdf-detail-content');
  if (!element) return;
  const opt = {
    margin:       10,
    filename:     `8D_Report_${detailData.value?.report_no || 'Detail'}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  exportPdfLoading.value = true;
  html2pdf().set(opt).from(element).save().then(() => {
    exportPdfLoading.value = false;
    ElMessage.success('PDF导出成功');
  }).catch(err => {
    exportPdfLoading.value = false;
    ElMessage.error('PDF导出失败');
    console.error('PDF Export error:', err);
  });
}

const loading = ref(false)
const submitLoading = ref(false)
const loadingNcp = ref(false)
const loadingUsers = ref(false)
const formDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const reviewDialogVisible = ref(false)
const aiDialogVisible = ref(false)
const aiLoading = ref(false)
const isEdit = ref(false)
const activeTab = ref('basic')
const currentRow = ref(null)
const tableData = ref([])
const statistics = ref({})
const detailData = ref(null)
const dateRange = ref([])
const ncpList = ref([])
const userList = ref([])
const formRef = ref(null)

// 搜索表单
const searchForm = reactive({
  keyword: '',
  status: '',
  priority: ''
})

// 分页
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0
})

// 表单校验规则
const formRules = {
  title: [{ required: true, message: '请输入报告标题', trigger: 'blur' }],
  initiated_by: [{ required: true, message: '请选择发起人', trigger: 'change' }],
  owner: [{ required: true, message: '请选择主负责人', trigger: 'change' }]
}

// AI表单
const aiForm = reactive({
  problemDescription: '',
  materialName: '',
  supplierName: '',
  defectType: '',
  quantityAffected: 0,
  priority: 'high'
})

// 表单数据
const formData = reactive({
  title: '',
  priority: 'medium',
  status: 'draft',
  current_phase: 'draft',
  ncp_id: '',
  ncp_no: '',
  material_code: '',
  material_name: '',
  supplier_name: '',
  // 角色字段
  initiated_by: '',
  owner: '',
  owner_department: '',
  customer_contact: '',
  target_close_date: '',
  // D1
  d1_team_leader: '',
  d1_team_members_str: '',
  // D2
  d2_problem_description: '',
  d2_occurrence_date: '',
  d2_quantity_affected: 0,
  d2_defect_type: '',
  d2_responsible_person: '',
  // D3
  d3_containment_actions_str: '',
  d3_effective_date: '',
  d3_responsible_person: '',
  // D4
  d4_root_cause: '',
  d4_analysis_method: '',
  d4_contributing_factors_str: '',
  d4_responsible_person: '',
  // D5
  d5_corrective_actions_str: '',
  d5_responsible_person: '',
  d5_target_date: '',
  // D6
  d6_implementation_results: '',
  d6_verification_method: '',
  d6_verification_result: 'pending',
  d6_responsible_person: '',
  // D7
  d7_preventive_actions_str: '',
  d7_standardization: '',
  d7_responsible_person: '',
  // D8
  d8_summary: '',
  d8_lessons_learned: '',
  d8_team_recognition: '',
  d8_responsible_person: ''
})

// 审核表单
const reviewForm = reactive({
  approved: true,
  comments: ''
})

// ===================== 数据获取 =====================

const fetchUsers = async () => {
  try {
    loadingUsers.value = true
    const res = await systemApi.getUsers({ page: 1, pageSize: 500, status: 1 })
    userList.value = res.data?.data?.list || res.data?.list || []
  } catch (error) {
    console.warn('获取用户列表失败', error)
  } finally {
    loadingUsers.value = false
  }
}

const fetchNcpList = async (query = '') => {
  try {
    loadingNcp.value = true
    const res = await nonconformingProductApi.getList({ page: 1, pageSize: 50, keyword: query, status: 'processing' })
    ncpList.value = res.data?.data?.list || res.data?.list || []
  } catch (error) {
    console.warn('获取NCP列表失败', error)
  } finally {
    loadingNcp.value = false
  }
}

const handleNcpSelect = (val) => {
  if (!val) {
    formData.ncp_id = ''
    formData.ncp_no = ''
    formData.material_code = ''
    formData.material_name = ''
    formData.supplier_name = ''
    formData.d2_problem_description = ''
    formData.d2_quantity_affected = 0
    return
  }
  const selectedNcp = ncpList.value.find(item => item.id === val)
  if (selectedNcp) {
    formData.ncp_no = selectedNcp.ncp_no || ''
    formData.material_code = selectedNcp.material_code || ''
    formData.material_name = selectedNcp.material_name || ''
    formData.supplier_name = selectedNcp.supplier_name || ''
    if (!formData.d2_problem_description) formData.d2_problem_description = selectedNcp.defect_description || ''
    if (!formData.d2_quantity_affected) formData.d2_quantity_affected = selectedNcp.defect_quantity || 0
  }
}

const fetchData = async () => {
  try {
    loading.value = true
    const params = { page: pagination.current, pageSize: pagination.pageSize, ...searchForm }
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    }
    const response = await eightDReportApi.getReports(params)
    const resData = response.data?.data || response.data || {}
    if (Array.isArray(resData)) {
      tableData.value = resData
      pagination.total = resData.length
    } else {
      tableData.value = resData.list || []
      pagination.total = Number(resData.total || 0)
    }
  } catch (error) {
    console.error('获取8D报告列表失败:', error)
    ElMessage.error('获取8D报告列表失败')
  } finally {
    loading.value = false
  }
}

const fetchStatistics = async () => {
  try {
    const response = await eightDReportApi.getStatistics()
    statistics.value = response.data?.data || response.data || {}
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

// ===================== AI 辅助生成 =====================
const openAiDialog = () => {
  aiForm.problemDescription = ''
  aiForm.materialName = formData.material_name || ''
  aiForm.supplierName = formData.supplier_name || ''
  aiForm.defectType = ''
  aiForm.quantityAffected = formData.d2_quantity_affected || 0
  aiForm.priority = formData.priority || 'medium'
  aiDialogVisible.value = true
}
const submitAiGenerate = async () => {
  if (!aiForm.problemDescription || aiForm.problemDescription.trim().length < 5) {
    ElMessage.warning('请输入至少5个字的详细问题描述')
    return
  }

  // 防覆盖警告机制
  if (formData.d2_problem_description || formData.d4_root_cause) {
    try {
      await ElMessageBox.confirm('您已经填写了部分报告数据，使用AI生成会直接覆盖当前的D1-D8表单内容，是否确认继续？', '防覆盖警告', {
        confirmButtonText: '坚决覆盖！',
        cancelButtonText: '取消生成',
        type: 'warning'
      })
    } catch {
      return
    }
  }

  aiLoading.value = true
  try {
    const response = await eightDReportApi.aiAnalyze(aiForm)
    const result = response.data?.data || response.data
    
    if (result) {
      // 成功获取AI数据，填充到主表单
      if (result.title) formData.title = result.title
      // D1 - 团队（基于公司真实部门结构）
      if (result.d1_team_leader) formData.d1_team_leader = result.d1_team_leader
      if (result.d1_team_members && result.d1_team_members.length) formData.d1_team_members_str = result.d1_team_members.join('\n')
      // D2 - 问题描述 + 发生日期设为当天
      if (result.d2_problem_description) formData.d2_problem_description = result.d2_problem_description
      if (result.d2_defect_type) formData.d2_defect_type = result.d2_defect_type
      if (aiForm.quantityAffected) formData.d2_quantity_affected = aiForm.quantityAffected
      // 发生日期：优先使用AI返回日期，否则用当天
      formData.d2_occurrence_date = result.d2_occurrence_date || dayjs().format('YYYY-MM-DD')
      // D3 - 遏制措施
      if (result.d3_containment_actions && result.d3_containment_actions.length) formData.d3_containment_actions_str = result.d3_containment_actions.join('\n')
      // D4 - 根因分析
      if (result.d4_root_cause) formData.d4_root_cause = result.d4_root_cause
      if (result.d4_analysis_method) formData.d4_analysis_method = result.d4_analysis_method
      if (result.d4_contributing_factors && result.d4_contributing_factors.length) formData.d4_contributing_factors_str = result.d4_contributing_factors.join('\n')
      // D5 - 纠正措施
      if (result.d5_corrective_actions && result.d5_corrective_actions.length) formData.d5_corrective_actions_str = result.d5_corrective_actions.join('\n')
      if (result.d5_target_date_days) {
        formData.d5_target_date = dayjs().add(result.d5_target_date_days, 'day').format('YYYY-MM-DD')
        formData.target_close_date = formData.d5_target_date // 同步目标关闭日期
      }
      // D6 - 验证方法（仅方法，实施结果留空待后续填写）
      if (result.d6_verification_method) formData.d6_verification_method = result.d6_verification_method
      formData.d6_implementation_results = '' // 显式清空——尚未实施验证
      formData.d6_verification_result = 'pending' // 标记为待验证
      // D7 - 预防措施
      if (result.d7_preventive_actions && result.d7_preventive_actions.length) formData.d7_preventive_actions_str = result.d7_preventive_actions.join('\n')
      if (result.d7_standardization) formData.d7_standardization = result.d7_standardization
      // D8 - 总结
      if (result.d8_summary) formData.d8_summary = result.d8_summary
      if (result.d8_lessons_learned) formData.d8_lessons_learned = result.d8_lessons_learned

      ElMessage.success('🎉 AI已生成专业级8D报告初稿（基于KACON部门结构），请逐步检查并完善')
      aiDialogVisible.value = false
    }
  } catch (error) {
    console.error('AI生成失败:', error)
    if (error.response?.data?.message?.includes('API Key')) {
      ElMessageBox.alert('智谱AI API Key 未配置，请查阅后端 .env 文件进行配置', 'AI 服务未就绪', { type: 'warning' })
    } else {
      ElMessage.error(error.response?.data?.message || 'AI生成失败，请稍后重试')
    }
  } finally {
    aiLoading.value = false
  }
}


// ===================== 附件上传 =====================
const handleFileUpload = async (options, targetArray) => {
  try {
    const fd = new FormData()
    fd.append('file', options.file)
    const res = await api.post('/upload/file', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const fileInfo = res.data?.data || res.data
    if (fileInfo && fileInfo.url) {
      targetArray.push({
        name: fileInfo.filename || options.file.name,
        url: fileInfo.url, // save raw url for db, prepend base URL for viewing
      })
      options.onSuccess(fileInfo)
      ElMessage.success('上传成功')
    } else {
      throw new Error('Upload config err')
    }
  } catch (error) {
    options.onError(error)
    ElMessage.error('上传失败')
  }
}

const handleRemoveFile = (file, targetArray) => {
  const index = targetArray.findIndex(item => item.name === file.name || item.uid === file.uid)
  if (index !== -1) targetArray.splice(index, 1)
}

const getFullUrl = (url) => {
  if (url && url.startsWith('http')) return url;
  return import.meta.env.VITE_API_BASE_URL + url;
}

// ===================== CRUD 操作 =====================

const handleCreate = () => {
  isEdit.value = false
  activeTab.value = 'basic'
  Object.keys(formData).forEach(key => {
    if (key === 'priority') formData[key] = 'medium'
    else if (key === 'status') formData[key] = 'draft'
    else if (key === 'current_phase') formData[key] = 'draft'
    else if (key === 'd6_verification_result') formData[key] = 'pending'
    else if (key === 'd2_quantity_affected') formData[key] = 0
    else formData[key] = ''
    if (key.endsWith('_attachments')) formData[key] = []
  })
  formDialogVisible.value = true
}

const handleEdit = async (row) => {
  isEdit.value = true
  activeTab.value = 'basic'
  currentRow.value = row
  try {
    const response = await eightDReportApi.getReportById(row.id)
    const data = response.data?.data || response.data

    Object.keys(formData).forEach(key => {
      if (key.endsWith('_str')) return
      if (data[key] !== undefined) formData[key] = data[key]
    })

    // 数组字段转为文本
    formData.d1_team_members_str = Array.isArray(data.d1_team_members) ? data.d1_team_members.join('\n') : (data.d1_team_members || '')
    formData.d3_containment_actions_str = Array.isArray(data.d3_containment_actions) ? data.d3_containment_actions.join('\n') : (data.d3_containment_actions || '')
    formData.d4_contributing_factors_str = Array.isArray(data.d4_contributing_factors) ? data.d4_contributing_factors.join('\n') : (data.d4_contributing_factors || '')
    formData.d5_corrective_actions_str = Array.isArray(data.d5_corrective_actions) ? data.d5_corrective_actions.join('\n') : (data.d5_corrective_actions || '')
    formData.d7_preventive_actions_str = Array.isArray(data.d7_preventive_actions) ? data.d7_preventive_actions.join('\n') : (data.d7_preventive_actions || '')

    
    // 附件数组解析
    try { formData.d3_attachments = typeof data.d3_attachments === 'string' ? JSON.parse(data.d3_attachments) : (data.d3_attachments || []) } catch(e) { formData.d3_attachments = [] }
    try { formData.d5_attachments = typeof data.d5_attachments === 'string' ? JSON.parse(data.d5_attachments) : (data.d5_attachments || []) } catch(e) { formData.d5_attachments = [] }
    try { formData.d6_attachments = typeof data.d6_attachments === 'string' ? JSON.parse(data.d6_attachments) : (data.d6_attachments || []) } catch(e) { formData.d6_attachments = [] }

    // 草稿自动转进行中
    if (data.status === 'draft') {
      formData.status = 'in_progress'
      formData.current_phase = 'd1_d3'
    }

    formDialogVisible.value = true
  } catch (error) {
    ElMessage.error('获取报告详情失败')
  }
}

const submitForm = async () => {
  // 表单校验
  if (formRef.value) {
    try {
      await formRef.value.validate()
    } catch (e) {
      activeTab.value = 'basic'
      ElMessage.warning('请完善基本信息中的必填项')
      return
    }
  }

  submitLoading.value = true
  try {
    const submitData = { ...formData }
    // 文本转数组
    submitData.d1_team_members = formData.d1_team_members_str ? formData.d1_team_members_str.split('\n').filter(s => s.trim()) : []
    submitData.d3_containment_actions = formData.d3_containment_actions_str ? formData.d3_containment_actions_str.split('\n').filter(s => s.trim()) : []
    submitData.d4_contributing_factors = formData.d4_contributing_factors_str ? formData.d4_contributing_factors_str.split('\n').filter(s => s.trim()) : []
    submitData.d5_corrective_actions = formData.d5_corrective_actions_str ? formData.d5_corrective_actions_str.split('\n').filter(s => s.trim()) : []
    submitData.d7_preventive_actions = formData.d7_preventive_actions_str ? formData.d7_preventive_actions_str.split('\n').filter(s => s.trim()) : []

    // 移除 _str 后缀字段
    delete submitData.d1_team_members_str
    delete submitData.d3_containment_actions_str
    delete submitData.d4_contributing_factors_str
    delete submitData.d5_corrective_actions_str
    delete submitData.d7_preventive_actions_str

    // 自动标记步骤完成时间
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss')
    if (submitData.d1_team_leader && !submitData.d1_completed_at) submitData.d1_completed_at = now
    if (submitData.d2_problem_description && !submitData.d2_completed_at) submitData.d2_completed_at = now
    if (submitData.d3_containment_actions?.length && !submitData.d3_completed_at) submitData.d3_completed_at = now
    if (submitData.d4_root_cause && !submitData.d4_completed_at) submitData.d4_completed_at = now
    if (submitData.d5_corrective_actions?.length && !submitData.d5_completed_at) submitData.d5_completed_at = now
    if (submitData.d6_implementation_results && !submitData.d6_completed_at) submitData.d6_completed_at = now
    if (submitData.d7_preventive_actions?.length && !submitData.d7_completed_at) submitData.d7_completed_at = now
    if (submitData.d8_summary && !submitData.d8_completed_at) submitData.d8_completed_at = now

    if (isEdit.value) {
      await eightDReportApi.updateReport(currentRow.value.id, submitData)
      ElMessage.success('更新成功')
    } else {
      await eightDReportApi.createReport(submitData)
      ElMessage.success('创建成功')
    }

    formDialogVisible.value = false
    fetchData()
    fetchStatistics()
  } catch (error) {
    ElMessage.error(isEdit.value ? '更新失败' : '创建失败')
  } finally {
    submitLoading.value = false
  }
}

const handleView = async (row) => {
  try {
    const response = await eightDReportApi.getReportById(row.id)
    detailData.value = response.data?.data || response.data
    detailDialogVisible.value = true
  } catch (error) {
    ElMessage.error('获取详情失败')
  }
}

// ===================== 流程操作 =====================

const handleSubmitReview = async (row) => {
  try {
    await ElMessageBox.confirm('确定提交D1-D3初审吗？系统将校验必填项。', '提交初审', { type: 'warning' })
    await eightDReportApi.submitReview(row.id)
    ElMessage.success('已提交初审')
    fetchData()
    fetchStatistics()
  } catch (error) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || '提交初审失败'
      ElMessage.error(msg)
    }
  }
}

const handleSubmitPhase2 = async (row) => {
  try {
    await ElMessageBox.confirm('确定提交D4-D7结案审核吗？系统将校验必填项。', '提交结案审核', { type: 'warning' })
    await eightDReportApi.submitPhase2Review(row.id)
    ElMessage.success('已提交结案审核')
    fetchData()
    fetchStatistics()
  } catch (error) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || '提交结案审核失败'
      ElMessage.error(msg)
    }
  }
}

const handleComplete = async (row) => {
  try {
    await ElMessageBox.confirm('确定完成此8D报告吗？请确认D8总结已填写。', '完成报告', { type: 'warning' })
    await eightDReportApi.completeReport(row.id)
    ElMessage.success('8D报告已完成')
    fetchData()
    fetchStatistics()
  } catch (error) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || '完成报告失败'
      ElMessage.error(msg)
    }
  }
}

const handleReview = (row) => {
  currentRow.value = row
  reviewForm.approved = true
  reviewForm.comments = ''
  reviewDialogVisible.value = true
}

const submitReview = async () => {
  submitLoading.value = true
  try {
    await eightDReportApi.reviewReport(currentRow.value.id, reviewForm)
    ElMessage.success(reviewForm.approved ? '审核通过' : '已驳回')
    reviewDialogVisible.value = false
    fetchData()
    fetchStatistics()
  } catch (error) {
    ElMessage.error('审核失败')
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除这条8D报告吗？', '提示', { type: 'warning' })
    await eightDReportApi.deleteReport(row.id)
    ElMessage.success('删除成功')
    fetchData()
    fetchStatistics()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  searchForm.priority = ''
  dateRange.value = []
  pagination.current = 1
  fetchData()
}

// ===================== 辅助方法 =====================

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD') : '-'

const isOverdue = (row) => {
  if (!row.target_close_date) return false
  if (['completed', 'closed'].includes(row.status)) return false
  return dayjs().isAfter(dayjs(row.target_close_date))
}

const getPriorityType = (p) => ({ low: 'info', medium: '', high: 'warning', critical: 'danger' }[p] || 'info')
const getPriorityLabel = (p) => ({ low: '低', medium: '中', high: '高', critical: '紧急' }[p] || p)

const getStatusType = (s) => ({ draft: 'info', in_progress: 'warning', review: '', completed: 'success', closed: 'info' }[s] || 'info')
const getStatusLabel = (s) => ({ draft: '草稿', in_progress: '进行中', review: '待审核', completed: '已完成', closed: '已关闭' }[s] || s)

const getPhaseType = (p) => ({ draft: 'info', d1_d3: 'warning', d4_d7: '', d8: 'success', completed: 'success', closed: 'info' }[p] || 'info')
const getPhaseLabel = (p) => ({ draft: '草稿', d1_d3: 'D1-D3', d4_d7: 'D4-D7', d8: 'D8总结', completed: '已完成', closed: '已归档' }[p] || p || '-')

const getPhaseStep = (phase) => {
  const map = { draft: 0, d1_d3: 1, d4_d7: 3, d8: 5, completed: 6, closed: 6 }
  return map[phase] || 0
}

const getProgress = (row) => {
  let count = 0
  if (row.d1_completed_at) count++
  if (row.d2_completed_at) count++
  if (row.d3_completed_at) count++
  if (row.d4_completed_at) count++
  if (row.d5_completed_at) count++
  if (row.d6_completed_at) count++
  if (row.d7_completed_at) count++
  if (row.d8_completed_at) count++
  return Math.round(count / 8 * 100)
}

const getProgressColor = (row) => {
  const p = getProgress(row)
  if (p >= 100) return '#67C23A'
  if (p >= 50) return '#409EFF'
  return '#E6A23C'
}

onMounted(() => {
  fetchData()
  fetchStatistics()
  fetchUsers()
  fetchNcpList()
})
</script>

<style scoped>
.search-container {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

:deep(.el-table th) {
  background-color: #f5f7fa;
  font-weight: 600;
}

.el-pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

:deep(.el-tabs__content) {
  padding: 20px;
}

:deep(.el-timeline-item__timestamp) {
  font-weight: 600;
  font-size: 14px;
}

/* 阶段进度指示器 */
.phase-indicator {
  margin-bottom: 20px;
  padding: 16px 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

/* 角色信息卡片 */
.role-card {
  display: flex;
  align-items: center;
  gap: 12px;
}
.role-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.role-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.role-info {
  flex: 1;
  min-width: 0;
}
.role-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}
.role-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 超期样式 */
.text-danger {
  color: #F56C6C;
  font-weight: 600;
}
</style>
