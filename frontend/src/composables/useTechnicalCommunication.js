/**
 * useTechnicalCommunication.js
 * @description 技术通讯业务逻辑组合式函数
 * @date 2025-11-04
 */

import { ref, reactive } from 'vue';
import technicalCommunicationApi from '@/services/technicalCommunicationApi';
import { ElMessage } from 'element-plus';
import { parseListData } from '@/utils/responseParser';

/**
 * 技术通讯常量
 */
export const CATEGORIES = {
  update: { label: '更新日志', type: 'success', icon: 'Refresh' },
  guide: { label: '操作指南', type: 'primary', icon: 'Document' },
  specification: { label: '技术规范', type: 'warning', icon: 'Files' },
  announcement: { label: '公告', type: 'danger', icon: 'Bell' }
};

export const STATUSES = {
  draft: { label: '草稿', type: 'info' },
  published: { label: '已发布', type: 'success' },
  archived: { label: '已归档', type: 'warning' }
};

/**
 * 技术通讯列表管理
 */
export function useCommunicationList() {
  const loading = ref(false);
  const communicationList = ref([]);
  const total = ref(0);
  
  const pagination = reactive({
    page: 1,
    pageSize: 10
  });

  const filters = reactive({
    category: '',
    status: '',
    keyword: ''
  });

  /**
   * 加载通讯列表
   */
  const loadCommunications = async () => {
    try {
      loading.value = true;
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters
      };
      
      const res = await technicalCommunicationApi.getCommunications(params);
      // 使用统一解析器
      communicationList.value = parseListData(res, { enableLog: false });
      total.value = res.data?.total || 0;
    } catch {
      ElMessage.error('加载失败');
      communicationList.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 重置筛选条件
   */
  const resetFilters = () => {
    filters.category = '';
    filters.status = '';
    filters.keyword = '';
    pagination.page = 1;
    loadCommunications();
  };

  /**
   * 搜索
   */
  const handleSearch = () => {
    pagination.page = 1;
    loadCommunications();
  };

  /**
   * 分页变化
   */
  const handlePageChange = (page) => {
    pagination.page = page;
    loadCommunications();
  };

  /**
   * 每页数量变化
   */
  const handleSizeChange = (size) => {
    pagination.pageSize = size;
    pagination.page = 1;
    loadCommunications();
  };

  return {
    loading,
    communicationList,
    total,
    pagination,
    filters,
    loadCommunications,
    resetFilters,
    handleSearch,
    handlePageChange,
    handleSizeChange
  };
}

/**
 * 技术通讯详情管理
 */
export function useCommunicationDetail() {
  const loading = ref(false);
  const detail = ref(null);
  const comments = ref([]);

  /**
   * 加载通讯详情
   */
  const loadDetail = async (id) => {
    try {
      loading.value = true;
      const res = await technicalCommunicationApi.getCommunicationDetail(id);
      // axios拦截器已自动解包ResponseHandler格式
      detail.value = res.data.communication || null;
      comments.value = res.data.comments || [];
      
      return detail.value;
    } catch {
      ElMessage.error('加载详情失败');
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 清空详情
   */
  const clearDetail = () => {
    detail.value = null;
    comments.value = [];
  };

  return {
    loading,
    detail,
    comments,
    loadDetail,
    clearDetail
  };
}

/**
 * 技术通讯表单管理
 */
export function useCommunicationForm() {
  const formLoading = ref(false);
  const form = reactive({
    id: null,
    title: '',
    category: 'update',
    tags: [],
    summary: '',
    content: '',
    status: 'draft',
    is_pinned: 0,
    attachments: [],
    visibility: 'public',
    recipients: [],
    departmentRecipients: []
  });

  const formRules = {
    title: [
      { required: true, message: '请输入标题', trigger: 'blur' },
      { min: 2, max: 200, message: '标题长度在2-200个字符', trigger: 'blur' }
    ],
    category: [
      { required: true, message: '请选择分类', trigger: 'change' }
    ],
    summary: [
      { required: true, message: '请输入摘要', trigger: 'blur' },
      { max: 500, message: '摘要不能超过500个字符', trigger: 'blur' }
    ],
    content: [
      { required: true, message: '请输入内容', trigger: 'blur' }
    ]
  };

  /**
   * 重置表单
   */
  const resetForm = () => {
    form.id = null;
    form.title = '';
    form.category = 'update';
    form.tags = [];
    form.summary = '';
    form.content = '';
    form.status = 'draft';
    form.is_pinned = 0;
    form.attachments = [];
    form.visibility = 'public';
    form.recipients = [];
    form.departmentRecipients = [];
  };

  /**
   * 填充表单
   */
  const fillForm = (data) => {
    form.id = data.id;
    form.title = data.title;
    form.category = data.category;
    form.tags = data.tags ? (typeof data.tags === 'string' ? JSON.parse(data.tags) : data.tags) : [];
    form.summary = data.summary;
    form.content = data.content;
    form.status = data.status;
    form.is_pinned = data.is_pinned;
    form.attachments = data.attachments ? (typeof data.attachments === 'string' ? JSON.parse(data.attachments) : data.attachments) : [];
    form.visibility = data.visibility || 'public';
    form.recipients = data.recipients || [];
    form.departmentRecipients = data.departmentRecipients || [];
  };

  /**
   * 提交表单
   */
  const submitForm = async () => {
    try {
      formLoading.value = true;

      const submitData = {
        title: form.title,
        category: form.category,
        tags: JSON.stringify(form.tags),
        summary: form.summary,
        content: form.content,
        status: form.status,
        is_pinned: form.is_pinned,
        attachments: JSON.stringify(form.attachments),
        visibility: form.visibility,
        recipients: form.recipients,
        departmentRecipients: form.departmentRecipients
      };

      if (form.id) {
        // 更新
        await technicalCommunicationApi.updateCommunication(form.id, submitData);
        ElMessage.success('更新成功');
      } else {
        // 创建
        await technicalCommunicationApi.createCommunication(submitData);
        ElMessage.success('创建成功');
      }
      
      return true;
    } catch {
      ElMessage.error(form.id ? '更新失败' : '创建失败');
      return false;
    } finally {
      formLoading.value = false;
    }
  };

  return {
    formLoading,
    form,
    formRules,
    resetForm,
    fillForm,
    submitForm
  };
}

/**
 * 技术通讯互动管理（点赞、收藏）
 */
export function useCommunicationInteraction() {
  const interactionLoading = ref(false);
  const liked = ref(false);
  const favorited = ref(false);

  /**
   * 加载用户互动状态
   */
  const loadInteraction = async (id) => {
    try {
      const res = await technicalCommunicationApi.getUserInteraction(id);
      // axios拦截器已自动解包ResponseHandler格式
      liked.value = res.data.liked || false;
      favorited.value = res.data.favorited || false;
    } catch {
      // 静默失败
      liked.value = false;
      favorited.value = false;
    }
  };

  /**
   * 切换点赞
   */
  const toggleLike = async (id) => {
    try {
      interactionLoading.value = true;
      const res = await technicalCommunicationApi.toggleLike(id);
      // axios拦截器已自动解包ResponseHandler格式
      liked.value = res.data.liked;
      ElMessage.success(liked.value ? '点赞成功' : '已取消点赞');
      
      return liked.value;
    } catch {
      ElMessage.error('操作失败');
      return null;
    } finally {
      interactionLoading.value = false;
    }
  };

  /**
   * 切换收藏
   */
  const toggleFavorite = async (id) => {
    try {
      interactionLoading.value = true;
      const res = await technicalCommunicationApi.toggleFavorite(id);
      // axios拦截器已自动解包ResponseHandler格式
      favorited.value = res.data.favorited;
      ElMessage.success(favorited.value ? '收藏成功' : '已取消收藏');
      
      return favorited.value;
    } catch {
      ElMessage.error('操作失败');
      return null;
    } finally {
      interactionLoading.value = false;
    }
  };

  return {
    interactionLoading,
    liked,
    favorited,
    loadInteraction,
    toggleLike,
    toggleFavorite
  };
}
