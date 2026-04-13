/**
 * useTodos.js
 * @description 待办事项与日历数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { todoApi } from '../../../services/api'
import { ElMessage } from 'element-plus'

export function useTodos() {
  const router = useRouter()
  const authStore = useAuthStore()

  // 待办事项数据
  const pendingTasks = ref([])
  // 已办事项数据
  const completedTasks = ref([])
  // 所有待办事项
  const todos = ref([])
  // 当前激活的待办标签（待办/已办）
  const activeTodoTab = ref('pending')

  // 当前日期相关
  const currentDate = ref(new Date())
  const currentYear = computed(() => currentDate.value.getFullYear())
  const currentMonth = computed(() => currentDate.value.getMonth() + 1) // getMonth() 返回 0-11
  const currentDay = computed(() => currentDate.value.getDate())
  const currentMonthStr = computed(() => `${currentYear.value}年${currentMonth.value}月`)

  // 日历相关
  const calendarDays = ref([])

  // === 全局状态常量映射字典 ===
  const PRIORITY_TEXT_MAP = {
    3: '高优先级',
    2: '中优先级',
    1: '低优先级'
  }

  // 根据优先级返回不同的类型
  const getPriorityType = (priority) => PRIORITY_TEXT_MAP[priority] || '待办事项'

  // 格式化日期
  const formatDate = (date) => {
    if (!date) return '--'
    if (typeof date === 'string') date = new Date(date)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  // 判断是否过期
  const isOverdue = (todo) => {
    if (!todo.deadline) return false
    const now = new Date()
    return new Date(todo.deadline) < now
  }

  // 判断是否即将到期（24小时内）
  const isUpcoming = (todo) => {
    if (!todo.deadline) return false
    const now = new Date()
    const deadline = new Date(todo.deadline)
    const diff = deadline - now
    return diff > 0 && diff < 24 * 60 * 60 * 1000
  }

  // 加载用户待办事项
  const loadUserTodos = async () => {
    try {
      // 检查登录状态
      if (!authStore.isAuthenticated) {
        console.warn('用户未登录，无法加载待办事项')
        return
      }

      const response = await todoApi.getAllTodos()

      // axios拦截器已自动解包，response.data 就是实际数据
      // 兼容多种数据格式
      const todoData = response.data?.data || response.data || response || []
      const todoList = Array.isArray(todoData) ? todoData : (todoData.list || todoData.items || [])

      // 保存所有待办事项
      todos.value = todoList.map(todo => ({
        ...todo,
        deadline: new Date(todo.deadline)
      }))

      // 转换为待办事项显示格式
      pendingTasks.value = todos.value
        .filter(todo => !todo.completed) // 只显示未完成的
        .slice(0, 10) // 限制最多显示10个
        .map(todo => ({
          type: getPriorityType(todo.priority), // 根据优先级显示不同类型
          sender: authStore.user?.real_name || '用户',
          date: formatDate(todo.deadline),
          status: isOverdue(todo) ? '已逾期' : isUpcoming(todo) ? '即将到期' : '待处理',
          title: todo.title,
          id: todo.id
        }))

      // 转换为已办事项显示格式
      completedTasks.value = todos.value
        .filter(todo => todo.completed) // 只显示已完成的
        .slice(0, 10) // 限制最多显示10个
        .map(todo => ({
          type: getPriorityType(todo.priority),
          sender: authStore.user?.real_name || '用户',
          date: formatDate(todo.completed_at || todo.updated_at || todo.deadline),
          status: '已完成',
          title: todo.title,
          id: todo.id
        }))

      // 更新日历
      calendarDays.value = generateCalendarDays(currentDate.value)
    } catch (error) {
      console.error('加载待办事项失败:', error)
      // 如果是认证问题，可能需要重新登录
      if (error.response && error.response.status === 401) {
        ElMessage.error('登录已过期，请重新登录')
      }
    }
  }

  // 获取待办事项总数（可用于更新统计数据）
  const getTodoCount = () => {
    return todos.value.filter(todo => !todo.completed).length
  }

  // 跳转到待办页面
  const goToTodoPage = () => {
    router.push({
      path: '/profile',
      query: { tab: 'todos' }  // 添加查询参数，指定要打开的标签页
    })
  }

  // 切换待办/已办标签
  const switchTodoTab = (tab) => {
    activeTodoTab.value = tab
  }

  // 查看待办详情
  const viewTodoDetail = (id) => {
    router.push({
      path: '/profile',
      query: { tab: 'todos', id: id }
    })
  }

  // 切换月份
  const changeMonth = (delta) => {
    const newDate = new Date(currentDate.value)
    newDate.setMonth(newDate.getMonth() + delta)
    currentDate.value = newDate
    // 日历会通过watch自动更新
  }

  // 生成日历天数
  const generateCalendarDays = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const today = new Date()

    // 当月第一天是星期几 (0-6, 0表示星期日)
    const firstDay = new Date(year, month, 1).getDay()

    // 当月天数
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // 上个月的天数
    const daysInLastMonth = new Date(year, month, 0).getDate()

    // 生成日历数组
    const days = []

    // 填充上个月的日期
    for (let i = 0; i < firstDay; i++) {
      const day = daysInLastMonth - firstDay + i + 1
      days.push({
        date: day,
        isCurrentMonth: false,
        isCurrentDay: false,
        hasEvents: false
      })
    }

    // 填充当前月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = year === today.getFullYear() &&
                      month === today.getMonth() &&
                      i === today.getDate()
      days.push({
        date: i,
        isCurrentMonth: true,
        isCurrentDay: isToday,
        hasEvents: hasTodoOnDay(i)
      })
    }

    // 填充下个月的日期
    const remainingCells = 42 - days.length // 保证6行
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        date: i,
        isCurrentMonth: false,
        isCurrentDay: false,
        hasEvents: false
      })
    }

    return days
  }

  // 检查某天是否有待办事项
  const hasTodoOnDay = (day) => {
    if (!todos.value || todos.value.length === 0) return false

    const year = currentDate.value.getFullYear()
    const month = currentDate.value.getMonth()

    // 检查是否有当天的待办
    return todos.value.some(todo => {
      if (!todo.deadline) return false
      const deadline = new Date(todo.deadline)
      return deadline.getFullYear() === year &&
             deadline.getMonth() === month &&
             deadline.getDate() === day
    })
  }

  return {
    pendingTasks,
    completedTasks,
    todos,
    activeTodoTab,
    currentDate,
    currentYear,
    currentMonth,
    currentDay,
    currentMonthStr,
    calendarDays,
    loadUserTodos,
    getTodoCount,
    goToTodoPage,
    switchTodoTab,
    viewTodoDetail,
    changeMonth,
    generateCalendarDays
  }
}
