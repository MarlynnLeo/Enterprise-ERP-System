<!--
/**
 * TechnicalCommunication.vue
 * @description 即时通讯管理页面
 * @date 2025-11-03
 */
-->
<template>
  <div class="technical-communication-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>即时通讯</h2>
          <p class="subtitle">发布与查看即时通讯</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="handleCreate" v-permission="'system:tech-comm:create'">发布通讯</el-button>
      </div>
    </el-card>

    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <el-form :inline="true" class="search-form" :model="filterForm">
        <el-form-item label="分类">
          <el-select  v-model="filterForm.category" placeholder="全部分类" clearable>
            <el-option v-for="item in $dict.getOptions('communication_category')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select  v-model="filterForm.status" placeholder="全部状态" clearable>
            <el-option v-for="item in $dict.getOptions('communication_status')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input  
            v-model="filterForm.keyword" 
            placeholder="搜索标题或内容"
            clearable
            @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 通讯列表 -->
    <el-card class="list-card">
      <div class="communication-list" v-loading="loading">
        <div 
          v-for="item in communicationList" 
          :key="item.id"
          class="communication-item"
          @click="handleView(item)"
        >
          <!-- 置顶标签 -->
          <el-tag v-if="item.is_pinned" type="danger" size="small" class="pinned-tag">
            置顶
          </el-tag>

          <div class="item-header">
            <h3 class="item-title">
              <!-- 私有标识 -->
              <el-icon v-if="item.visibility === 'private'" color="#e6a23c" style="margin-right: 5px;">
                <Lock />
              </el-icon>
              {{ item.title }}
            </h3>
            <div class="item-meta">
              <el-tag :type="getCategoryType(item.category)" size="small">
                {{ getCategoryText(item.category) }}
              </el-tag>
              <el-tag :type="getStatusType(item.status)" size="small">
                {{ getStatusText(item.status) }}
              </el-tag>
              <!-- 私有标签 -->
              <el-tag v-if="item.visibility === 'private'" type="warning" size="small">
                <el-icon><Lock /></el-icon> 私有
              </el-tag>
            </div>
          </div>

          <div class="item-summary">{{ item.summary }}</div>

          <div class="item-footer">
            <div class="item-info">
              <span class="author">
                <el-icon><User /></el-icon>
                {{ item.author_name }}
              </span>
              <span class="time">
                <el-icon><Clock /></el-icon>
                {{ formatDate(item.published_at || item.created_at) }}
              </span>
              <span class="views">
                <el-icon><View /></el-icon>
                {{ item.view_count || 0 }} 次浏览
              </span>
              <span class="comments">
                <el-icon><ChatDotRound /></el-icon>
                {{ item.comment_count || 0 }} 评论
              </span>
              <span class="likes">
                <el-icon><Star /></el-icon>
                {{ item.like_count || 0 }} 点赞
              </span>
              <span class="favorites">
                <el-icon><Collection /></el-icon>
                {{ item.favorite_count || 0 }} 收藏
              </span>
              <!-- 抄送人数（仅私有通讯显示） -->
              <span v-if="item.visibility === 'private'" class="recipients">
                <el-icon><User /></el-icon>
                {{ item.recipient_count || 0 }} 人抄送
              </span>
            </div>
            <div class="item-actions">
              <el-button 
                link 
                type="primary" 
                @click.stop="handleEdit(item)"
                v-permission="'system:tech-comm:edit'"
              >
                编辑
              </el-button>
              <el-button 
                link 
                type="danger" 
                @click.stop="handleDelete(item)"
                v-permission="'system:tech-comm:delete'"
              >
                删除
              </el-button>
            </div>
          </div>

          <!-- 标签 -->
          <div v-if="item.tags && item.tags.length > 0" class="item-tags">
            <el-tag 
              v-for="tag in item.tags" 
              :key="tag" 
              size="small"
              effect="plain"
            >
              {{ tag }}
            </el-tag>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty 
          v-if="!loading && communicationList.length === 0" 
          description="暂无即时通讯"
        />
      </div>

      <!-- 分页 -->
      <el-pagination
        v-if="total > 0"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </el-card>

    <!-- 查看/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="60%"
      :close-on-click-modal="false"
      @close="handleDialogClose"
    >
      <el-form 
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
        v-if="dialogType !== 'view'"
      >
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="form.category" placeholder="请选择分类">
            <el-option v-for="item in $dict.getOptions('communication_category')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="摘要" prop="summary">
          <el-input 
            v-model="form.summary" 
            type="textarea"
            :rows="3"
            placeholder="请输入摘要"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            placeholder="请选择或输入标签"
          >
            <el-option 
              v-for="tag in commonTags" 
              :key="tag" 
              :label="tag" 
              :value="tag" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" prop="content">
          <RichTextEditor v-model="form.content" placeholder="请输入内容" />
        </el-form-item>
        <el-form-item label="附件">
          <AttachmentUpload v-model="form.attachments" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="draft">草稿</el-radio>
            <el-radio value="published">发布</el-radio>
            <el-radio value="archived">归档</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="form.isPinned" />
        </el-form-item>

        <!-- 可见性选择 -->
        <el-form-item label="可见性" prop="visibility">
          <el-radio-group v-model="form.visibility">
            <el-radio value="public">
              <el-icon><View /></el-icon> 公开（所有人可见）
            </el-radio>
            <el-radio value="private">
              <el-icon><Lock /></el-icon> 私有（仅抄送人可见）
            </el-radio>
          </el-radio-group>
          <div style="color: var(--color-text-secondary); font-size: 12px; margin-top: 5px;">
            私有模式下，只有被抄送的人员才能查看此通讯
          </div>
        </el-form-item>

        <!-- 抄送人员选择（仅私有模式显示） -->
        <el-form-item
          v-if="form.visibility === 'private'"
          label="抄送人员"
          required
        >
          <UserSelector v-model="selectedRecipients" />
          <div style="color: var(--color-warning); font-size: 12px; margin-top: 5px;">
            <el-icon><Warning /></el-icon> 请至少选择一个用户或部门
          </div>
        </el-form-item>
      </el-form>

      <!-- 查看模式 -->
      <div v-else class="view-content">
        <div class="view-header">
          <h2>{{ viewData.title }}</h2>
          <div class="view-meta">
            <el-tag :type="getCategoryType(viewData.category)">
              {{ getCategoryText(viewData.category) }}
            </el-tag>
            <span class="author">作者：{{ viewData.author_name }}</span>
            <span class="time">发布时间：{{ formatDate(viewData.published_at) }}</span>
            <span class="views">浏览：{{ viewData.view_count || 0 }} 次</span>
          </div>
          <div class="view-stats">
            <span><el-icon><Star /></el-icon> {{ viewData.like_count || 0 }} 点赞</span>
            <span><el-icon><Collection /></el-icon> {{ viewData.favorite_count || 0 }} 收藏</span>
            <span><el-icon><ChatDotRound /></el-icon> {{ comments.length }} 评论</span>
          </div>
          <div class="view-actions">
            <el-button
              :type="userLiked ? 'primary' : 'default'"
              @click="handleToggleLike"
              :loading="interactionLoading"
            >
              <el-icon><Star /></el-icon> {{ userLiked ? '已点赞' : '点赞' }}
            </el-button>
            <el-button
              :type="userFavorited ? 'warning' : 'default'"
              @click="handleToggleFavorite"
              :loading="interactionLoading"
            >
              <el-icon><Collection /></el-icon> {{ userFavorited ? '已收藏' : '收藏' }}
            </el-button>
          </div>
        </div>
        <div class="view-summary">{{ viewData.summary }}</div>
        <div class="view-body" v-html="sanitizedContent"></div>

        <!-- 附件列表 -->
        <div v-if="viewData.attachments && viewData.attachments.length > 0" class="view-attachments">
          <h3>附件</h3>
          <AttachmentUpload :model-value="viewData.attachments" :readonly="true" />
        </div>

        <!-- 抄送人员信息（仅私有通讯显示） -->
        <div v-if="viewData.visibility === 'private'" class="recipients-section">
          <el-divider />
          <div class="section-header">
            <h3>
              <el-icon><Lock /></el-icon> 抄送人员
            </h3>
            <el-button
              type="primary"
              link
              @click="showRecipients = !showRecipients"
            >
              {{ showRecipients ? '收起' : '展开' }}
              <el-icon>
                <ArrowDown v-if="!showRecipients" />
                <ArrowUp v-else />
              </el-icon>
            </el-button>
          </div>

          <el-collapse-transition>
            <div v-show="showRecipients">
              <RecipientsList :communication-id="viewData.id" ref="recipientsListRef" />
            </div>
          </el-collapse-transition>
        </div>

        <!-- 评论区 -->
        <div class="comments-section">
          <h3>评论 ({{ comments.length }})</h3>
          <div class="comment-input">
            <el-input
              v-model="commentContent"
              type="textarea"
              :rows="3"
              placeholder="写下你的评论..."
            />
            <el-button type="primary" @click="handleAddComment" style="margin-top: 10px;">
              发表评论
            </el-button>
          </div>
          <div class="comment-list">
            <div v-for="comment in comments" :key="comment.id" class="comment-item">
              <div class="comment-header">
                <span class="comment-author">{{ comment.user_name }}</span>
                <span class="comment-time">{{ formatDate(comment.created_at) }}</span>
              </div>
              <div class="comment-content">{{ comment.content }}</div>
            </div>
          </div>
        </div>
      </div>

      <template #footer v-if="dialogType !== 'view'">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ dialogType === 'create' ? '发布' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { formatDateTime } from '@/utils/helpers/dateUtils'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Search, Refresh, User, Clock, View, Star, Collection, ChatDotRound,
  Lock, Warning, ArrowDown, ArrowUp
} from '@element-plus/icons-vue'
import technicalCommunicationApi from '@/services/technicalCommunicationApi'
import RichTextEditor from '@/components/RichTextEditor.vue'
import AttachmentUpload from '@/components/AttachmentUpload.vue'
import UserSelector from '@/components/UserSelector.vue'
import RecipientsList from '@/components/RecipientsList.vue'
import DOMPurify from 'dompurify'

// 路由 - 必须在 setup 顶层调用
const route = useRoute()

// 数据
const loading = ref(false)
const communicationList = ref([])
const total = ref(0)
const pagination = reactive({
  page: 1,
  pageSize: 10
})

const filterForm = reactive({
  category: '',
  status: '',  // 默认显示所有状态
  keyword: ''
})

const dialogVisible = ref(false)
const dialogType = ref('create') // create, edit, view
const dialogTitle = computed(() => {
  const titleMap = {
    create: '发布即时通讯',
    edit: '编辑即时通讯',
    view: '查看即时通讯'
  }
  return titleMap[dialogType.value]
})

const form = reactive({
  title: '',
  category: '',
  tags: [],
  summary: '',
  content: '',
  attachments: [],
  status: 'published',  // 默认为已发布
  isPinned: false,
  visibility: 'public',  // 默认公开
  recipients: [],
  departmentRecipients: []
})

const formRef = ref(null)
const formRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  summary: [{ required: true, message: '请输入摘要', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }]
}

const commonTags = ['系统更新', '功能优化', '问题修复', '新功能', '操作指南', '最佳实践']
const submitting = ref(false)
const viewData = ref({})
const comments = ref([])
const commentContent = ref('')

// ✅ 安全修复: 使用 DOMPurify 替代正则表达式清洗，防止 XSS
const sanitizeHtml = (html) => {
  if (!html) return ''
  return DOMPurify.sanitize(html)
}

// 安全的内容渲染
const sanitizedContent = computed(() => sanitizeHtml(viewData.value.content))

// 互动状态
const userLiked = ref(false)
const userFavorited = ref(false)
const interactionLoading = ref(false)

// 抄送相关
const selectedRecipients = ref({ users: [], departments: [] })
const showRecipients = ref(false)
const recipientsListRef = ref(null)

// 监听抄送选择变化
watch(selectedRecipients, (val) => {
  form.recipients = val.users
  form.departmentRecipients = val.departments
}, { deep: true })

// 辅助函数：统一解析API响应数据
const parseResponseData = (res) => {
  // axios拦截器已自动解包ResponseHandler格式
  return res.data
}

// 方法
const loadCommunications = async () => {
  try {
    loading.value = true
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...filterForm
    }
    const res = await technicalCommunicationApi.getCommunications(params)
    const responseData = parseResponseData(res)
    communicationList.value = responseData.list || []
    total.value = Number(responseData.total) || 0
  } catch (error) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  loadCommunications()
}

const handleReset = () => {
  filterForm.category = ''
  filterForm.status = ''  // 重置为显示所有状态
  filterForm.keyword = ''
  handleSearch()
}

const handleSizeChange = () => {
  loadCommunications()
}

const handlePageChange = () => {
  loadCommunications()
}

const handleCreate = () => {
  dialogType.value = 'create'
  resetForm()
  dialogVisible.value = true
}

const handleEdit = async (item) => {
  dialogType.value = 'edit'
  form.id = item.id
  form.title = item.title
  form.category = item.category
  form.tags = item.tags || []
  form.summary = item.summary
  form.content = item.content
  form.attachments = item.attachments || []
  form.status = item.status
  form.isPinned = item.is_pinned === 1
  form.visibility = item.visibility || 'public'

  // 如果是私有通讯，加载抄送人员信息
  if (item.visibility === 'private') {
    try {
      const res = await technicalCommunicationApi.getRecipients(item.id)
      const data = parseResponseData(res)

      // 提取用户ID和部门ID
      const userIds = data.recipients?.filter(r => r.recipient_type === 'cc').map(r => r.user_id) || []
      const deptIds = data.departments?.map(d => d.department_id) || []

      selectedRecipients.value = {
        users: userIds,
        departments: deptIds
      }
    } catch (error) {
      console.error('加载抄送人员失败:', error)
    }
  }

  dialogVisible.value = true
}

const handleView = async (item) => {
  try {
    dialogType.value = 'view'
    const res = await technicalCommunicationApi.getCommunicationDetail(item.id)
    const responseData = parseResponseData(res)
    viewData.value = responseData
    comments.value = responseData.comments || []

    // 加载用户互动状态
    await loadUserInteraction(item.id)

    // 自动标记为已读
    try {
      await technicalCommunicationApi.markAsRead(item.id)
    } catch (error) {
      // 静默失败，不影响用户体验
      console.error('标记已读失败:', error)
    }

    dialogVisible.value = true
  } catch (error) {
    ElMessage.error('加载详情失败')
  }
}

// 加载用户互动状态
const loadUserInteraction = async (id) => {
  try {
    const res = await technicalCommunicationApi.getUserInteraction(id)
    const data = parseResponseData(res)
    userLiked.value = data.liked || false
    userFavorited.value = data.favorited || false
  } catch (error) {
    console.error('加载互动状态失败:', error)
  }
}

// 切换点赞
const handleToggleLike = async () => {
  if (interactionLoading.value) return

  try {
    interactionLoading.value = true
    await technicalCommunicationApi.toggleLike(viewData.value.id)
    userLiked.value = !userLiked.value

    // 更新统计数据
    if (userLiked.value) {
      viewData.value.like_count = (viewData.value.like_count || 0) + 1
    } else {
      viewData.value.like_count = Math.max((viewData.value.like_count || 0) - 1, 0)
    }

    ElMessage.success(userLiked.value ? '点赞成功' : '取消点赞')

    // 刷新列表
    loadCommunications()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    interactionLoading.value = false
  }
}

// 切换收藏
const handleToggleFavorite = async () => {
  if (interactionLoading.value) return

  try {
    interactionLoading.value = true
    await technicalCommunicationApi.toggleFavorite(viewData.value.id)
    userFavorited.value = !userFavorited.value

    // 更新统计数据
    if (userFavorited.value) {
      viewData.value.favorite_count = (viewData.value.favorite_count || 0) + 1
    } else {
      viewData.value.favorite_count = Math.max((viewData.value.favorite_count || 0) - 1, 0)
    }

    ElMessage.success(userFavorited.value ? '收藏成功' : '取消收藏')

    // 刷新列表
    loadCommunications()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    interactionLoading.value = false
  }
}

const handleDelete = (item) => {
  ElMessageBox.confirm('确定要删除这条即时通讯吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await technicalCommunicationApi.deleteCommunication(item.id)
      ElMessage.success('删除成功')
      loadCommunications()
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return

  // 私有模式验证
  if (form.visibility === 'private') {
    if (selectedRecipients.value.users.length === 0 &&
        selectedRecipients.value.departments.length === 0) {
      ElMessage.warning('私有模式下请至少选择一个用户或部门')
      return
    }
  }

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    try {
      submitting.value = true
      const data = {
        title: form.title,
        category: form.category,
        tags: form.tags,
        summary: form.summary,
        content: form.content,
        attachments: form.attachments,
        status: form.status,
        isPinned: form.isPinned ? 1 : 0,
        visibility: form.visibility,
        recipients: form.recipients,
        departmentRecipients: form.departmentRecipients
      }

      if (dialogType.value === 'create') {
        await technicalCommunicationApi.createCommunication(data)
        ElMessage.success('发布成功')
      } else {
        await technicalCommunicationApi.updateCommunication(form.id, data)
        ElMessage.success('保存成功')
      }

      dialogVisible.value = false
      loadCommunications()
    } catch (error) {
      ElMessage.error('操作失败')
    } finally {
      submitting.value = false
    }
  })
}

const handleAddComment = async () => {
  if (!commentContent.value.trim()) {
    ElMessage.warning('请输入评论内容')
    return
  }

  try {
    await technicalCommunicationApi.addComment(viewData.value.id, {
      content: commentContent.value
    })
    ElMessage.success('评论成功')
    commentContent.value = ''
    // 重新加载详情
    const res = await technicalCommunicationApi.getCommunicationDetail(viewData.value.id)
    const responseData = parseResponseData(res)
    comments.value = responseData.comments || []
  } catch (error) {
    ElMessage.error('评论失败')
  }
}

const handleDialogClose = () => {
  resetForm()
}

const resetForm = () => {
  form.id = null
  form.title = ''
  form.category = ''
  form.tags = []
  form.summary = ''
  form.content = ''
  form.attachments = []
  form.status = 'published'  // 默认为已发布
  form.isPinned = false
  form.visibility = 'public'  // 重置为公开
  form.recipients = []
  form.departmentRecipients = []

  // 重置抄送选择
  selectedRecipients.value = { users: [], departments: [] }
  showRecipients.value = false

  if (formRef.value) {
    formRef.value.clearValidate()
  }

  // 重置互动状态
  userLiked.value = false
  userFavorited.value = false
}

const getCategoryType = (category) => {
  const typeMap = {
    update: 'primary',
    guide: 'success',
    specification: 'warning',
    announcement: 'danger'
  }
  return typeMap[category] || 'info'
}

const getCategoryText = (category) => {
  const textMap = {
    update: '更新日志',
    guide: '操作指南',
    specification: '技术规范',
    announcement: '公告'
  }
  return textMap[category] || category
}

const getStatusType = (status) => {
  const typeMap = {
    published: 'success',
    draft: 'info',
    archived: 'warning'
  }
  return typeMap[status] || 'info'
}

const getStatusText = (status) => {
  const textMap = {
    published: '已发布',
    draft: '草稿',
    archived: '已归档'
  }
  return textMap[status] || status
}

const formatDate = (date) => formatDateTime(date)

// 生命周期
onMounted(async () => {
  await loadCommunications()

  // 检查URL参数，如果有id参数，自动打开对应的通讯详情
  if (route.query?.id) {
    const id = parseInt(route.query.id)
    const item = communicationList.value.find(c => c.id === id)
    if (item) {
      await handleView(item)
    } else {
      // 如果列表中没有，直接通过API获取
      try {
        const res = await technicalCommunicationApi.getCommunicationDetail(id)
        const responseData = parseResponseData(res)
        if (responseData) {
          dialogType.value = 'view'
          viewData.value = responseData
          comments.value = responseData.comments || []
          dialogVisible.value = true
        }
      } catch (error) {
        ElMessage.error('加载通讯详情失败')
      }
    }
  }
})
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.technical-communication-container {
  padding: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.filter-card {
  margin-bottom: 20px;
}

.list-card {
  min-height: 400px;
}

.communication-list {
  min-height: 300px;
}

.communication-item {
  padding: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
}

.communication-item:hover {
  background-color: var(--el-fill-color-light);
}

.communication-item:last-child {
  border-bottom: none;
}

.pinned-tag {
  position: absolute;
  top: 10px;
  right: 10px;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.item-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 1;
}

.item-meta {
  display: flex;
  gap: 8px;
}

.item-summary {
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  line-height: 1.6;
}

.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-info {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.item-info span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.item-tags {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.editor-container {
  width: 100%;
}

.content-editor {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
}

.content-editor:focus {
  outline: none;
  border-color: var(--el-color-primary);
}

.view-content {
  padding: 20px;
}

.view-header {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.view-header h2 {
  margin: 0 0 12px 0;
  font-size: 28px;
  font-weight: 600;
}

.view-meta {
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.view-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.view-stats span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.view-attachments {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.view-attachments h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
}

.view-summary {
  padding: 16px;
  background-color: var(--el-fill-color-light);
  border-left: 4px solid var(--el-color-primary);
  margin-bottom: 24px;
  font-size: 15px;
  line-height: 1.6;
}

.view-body {
  line-height: 1.8;
  font-size: 15px;
  color: var(--el-text-color-primary);
  margin-bottom: 40px;
}

.view-body :deep(h1),
.view-body :deep(h2),
.view-body :deep(h3) {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
}

.view-body :deep(p) {
  margin-bottom: 16px;
}

.view-body :deep(code) {
  background-color: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.view-body :deep(pre) {
  background-color: var(--el-fill-color-dark);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

.comments-section {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.comments-section h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
}

.comment-input {
  margin-bottom: 24px;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-item {
  padding: 16px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.comment-author {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.comment-time {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.comment-content {
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

/* 抄送相关样式 */
.recipients-section {
  margin-top: 20px;
  padding: 20px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-header h3 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

