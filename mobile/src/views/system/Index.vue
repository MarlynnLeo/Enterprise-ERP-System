<!--
/**
 * Index.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="system-page">
    <NavBar title="系统管理" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container">
      <!-- 系统信息卡片 -->
      <div class="system-info-card">
        <div class="info-header">
          <div class="system-logo">
            <Icon name="setting-o" size="32" color="#5E7BF6" />
          </div>
          <div class="system-details">
            <div class="system-name">ERP管理系统</div>
            <div class="system-version">版本 v{{ systemInfo.version }}</div>
            <div class="system-status">
              <div class="status-indicator" :class="systemInfo.status"></div>
              <span>{{ getStatusText(systemInfo.status) }}</span>
            </div>
          </div>
        </div>

        <div class="info-stats">
          <div class="stat-item">
            <div class="stat-value">{{ systemInfo.onlineUsers }}</div>
            <div class="stat-label">在线用户</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ systemInfo.totalUsers }}</div>
            <div class="stat-label">总用户数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ systemInfo.uptime }}</div>
            <div class="stat-label">运行时间</div>
          </div>
        </div>
      </div>

      <!-- 管理功能模块 -->
      <div class="management-modules">
        <div class="module-section">
          <div class="section-title">用户管理</div>
          <div class="module-grid">
            <div
              v-for="module in userModules"
              :key="module.key"
              class="module-item"
              @click="navigateTo(module.path)"
            >
              <div class="module-icon">
                <Icon :name="module.icon" size="24" :color="module.color" />
                <Badge v-if="module.badge" :content="module.badge" />
              </div>
              <div class="module-content">
                <div class="module-title">{{ module.title }}</div>
                <div class="module-description">{{ module.description }}</div>
              </div>
              <Icon name="arrow" size="12" color="#c8c9cc" />
            </div>
          </div>
        </div>

        <div class="module-section">
          <div class="section-title">组织管理</div>
          <div class="module-grid">
            <div
              v-for="module in orgModules"
              :key="module.key"
              class="module-item"
              @click="navigateTo(module.path)"
            >
              <div class="module-icon">
                <Icon :name="module.icon" size="24" :color="module.color" />
                <Badge v-if="module.badge" :content="module.badge" />
              </div>
              <div class="module-content">
                <div class="module-title">{{ module.title }}</div>
                <div class="module-description">{{ module.description }}</div>
              </div>
              <Icon name="arrow" size="12" color="#c8c9cc" />
            </div>
          </div>
        </div>

        <div class="module-section">
          <div class="section-title">权限管理</div>
          <div class="module-grid">
            <div
              v-for="module in permissionModules"
              :key="module.key"
              class="module-item"
              @click="navigateTo(module.path)"
            >
              <div class="module-icon">
                <Icon :name="module.icon" size="24" :color="module.color" />
                <Badge v-if="module.badge" :content="module.badge" />
              </div>
              <div class="module-content">
                <div class="module-title">{{ module.title }}</div>
                <div class="module-description">{{ module.description }}</div>
              </div>
              <Icon name="arrow" size="12" color="#c8c9cc" />
            </div>
          </div>
        </div>

        <div class="module-section">
          <div class="section-title">系统设置</div>
          <div class="module-grid">
            <div
              v-for="module in systemModules"
              :key="module.key"
              class="module-item"
              @click="navigateTo(module.path)"
            >
              <div class="module-icon">
                <Icon :name="module.icon" size="24" :color="module.color" />
                <Badge v-if="module.badge" :content="module.badge" />
              </div>
              <div class="module-content">
                <div class="module-title">{{ module.title }}</div>
                <div class="module-description">{{ module.description }}</div>
              </div>
              <Icon name="arrow" size="12" color="#c8c9cc" />
            </div>
          </div>
        </div>
      </div>

      <!-- 快速操作 -->
      <div class="quick-actions">
        <div class="section-title">快速操作</div>
        <div class="action-buttons">
          <Button type="primary" size="large" icon="plus" @click="createUser"> 新建用户 </Button>
          <Button type="default" size="large" icon="cluster-o" @click="createDepartment">
            新建部门
          </Button>
          <Button type="default" size="large" icon="shield-o" @click="createRole">
            新建角色
          </Button>
        </div>
      </div>

      <!-- 系统监控 -->
      <div class="system-monitoring">
        <div class="section-title">系统监控</div>
        <div class="monitoring-cards">
          <div class="monitor-card">
            <div class="monitor-header">
              <Icon name="chart-trending-o" size="20" color="#5E7BF6" />
              <span>CPU使用率</span>
            </div>
            <div class="monitor-value">{{ systemMonitor.cpu }}%</div>
            <div class="monitor-chart">
              <div class="chart-bar" :style="{ width: `${systemMonitor.cpu}%` }"></div>
            </div>
          </div>

          <div class="monitor-card">
            <div class="monitor-header">
              <Icon name="records" size="20" color="#2CCFB0" />
              <span>内存使用率</span>
            </div>
            <div class="monitor-value">{{ systemMonitor.memory }}%</div>
            <div class="monitor-chart">
              <div class="chart-bar memory" :style="{ width: `${systemMonitor.memory}%` }"></div>
            </div>
          </div>

          <div class="monitor-card">
            <div class="monitor-header">
              <Icon name="database-o" size="20" color="#FF9F45" />
              <span>磁盘使用率</span>
            </div>
            <div class="monitor-value">{{ systemMonitor.disk }}%</div>
            <div class="monitor-chart">
              <div class="chart-bar disk" :style="{ width: `${systemMonitor.disk}%` }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Icon, Badge, Button, showToast } from 'vant'

  const router = useRouter()

  // 系统信息
  const systemInfo = reactive({
    version: '1.0.0',
    status: 'running', // running, maintenance, error
    onlineUsers: 25,
    totalUsers: 156,
    uptime: '15天'
  })

  // 系统监控数据
  const systemMonitor = reactive({
    cpu: 45,
    memory: 68,
    disk: 32
  })

  // 用户管理模块
  const userModules = ref([
    {
      key: 'users',
      title: '用户管理',
      description: '管理系统用户账号',
      icon: 'friends-o',
      color: '#5E7BF6',
      path: '/system/users',
      badge: null
    },
    {
      key: 'profiles',
      title: '用户档案',
      description: '查看用户详细信息',
      icon: 'contact',
      color: '#2CCFB0',
      path: '/system/profiles',
      badge: null
    },
    {
      key: 'sessions',
      title: '在线会话',
      description: '管理用户登录会话',
      icon: 'clock-o',
      color: '#FF9F45',
      path: '/system/sessions',
      badge: systemInfo.onlineUsers
    }
  ])

  // 组织管理模块
  const orgModules = ref([
    {
      key: 'departments',
      title: '部门管理',
      description: '管理组织架构',
      icon: 'cluster-o',
      color: '#A48BE0',
      path: '/system/departments',
      badge: null
    },
    {
      key: 'positions',
      title: '职位管理',
      description: '管理岗位设置',
      icon: 'medal-o',
      color: '#FF6B6B',
      path: '/system/positions',
      badge: null
    },
    {
      key: 'hierarchy',
      title: '组织架构',
      description: '查看组织结构图',
      icon: 'tree',
      color: '#FFC759',
      path: '/system/hierarchy',
      badge: null
    }
  ])

  // 权限管理模块
  const permissionModules = ref([
    {
      key: 'roles',
      title: '角色管理',
      description: '管理用户角色',
      icon: 'shield-o',
      color: '#5E7BF6',
      path: '/system/roles',
      badge: null
    },
    {
      key: 'permissions',
      title: '权限设置',
      description: '配置功能权限',
      icon: 'lock',
      color: '#2CCFB0',
      path: '/system/permissions',
      badge: null
    },
    {
      key: 'access-control',
      title: '访问控制',
      description: '管理访问策略',
      icon: 'eye-o',
      color: '#FF9F45',
      path: '/system/access-control',
      badge: null
    }
  ])

  // 系统设置模块
  const systemModules = ref([
    {
      key: 'config',
      title: '系统配置',
      description: '基础参数设置',
      icon: 'setting-o',
      color: '#A48BE0',
      path: '/system/config',
      badge: null
    },
    {
      key: 'logs',
      title: '系统日志',
      description: '查看操作日志',
      icon: 'notes-o',
      color: '#FF6B6B',
      path: '/system/logs',
      badge: null
    },
    {
      key: 'backup',
      title: '数据备份',
      description: '备份恢复管理',
      icon: 'replay',
      color: '#FFC759',
      path: '/system/backup',
      badge: null
    },
    {
      key: 'maintenance',
      title: '系统维护',
      description: '系统维护工具',
      icon: 'service-o',
      color: '#FF8A80',
      path: '/system/maintenance',
      badge: null
    }
  ])

  import { getSystemStatusText } from '@/constants/systemConstants'

  // 获取状态文本
  const getStatusText = (status) => {
    return getSystemStatusText(status)
  }

  // 导航到指定页面
  const navigateTo = (path) => {
    if (!path) {
      /* Feature Unlocked */
      return
    }
    router.push(path)
  }

  // 快速操作
  const createUser = () => {
    router.push('/system/users/create')
  }

  const createDepartment = () => {
    router.push('/system/departments/create')
  }

  const createRole = () => {
    router.push('/system/roles/create')
  }

  // 更新系统监控数据
  const updateMonitorData = () => {
    systemMonitor.cpu = Math.floor(Math.random() * 30) + 30
    systemMonitor.memory = Math.floor(Math.random() * 40) + 40
    systemMonitor.disk = Math.floor(Math.random() * 20) + 20
  }

  // 初始化
  onMounted(() => {
    // 定期更新监控数据
    setInterval(updateMonitorData, 5000)
  })
</script>

<style lang="scss" scoped>
  .system-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
  }

  .content-container {
    padding: 12px;
  }

  .system-info-card {
    background: linear-gradient(135deg, var(--color-info), #4a90e2);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 16px;
    color: var(--text-primary);

    .info-header {
      display: flex;
      align-items: center;
      margin-bottom: 16px;

      .system-logo {
        margin-right: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 12px;
      }

      .system-details {
        flex: 1;

        .system-name {
          font-size: 1.125rem;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .system-version {
          font-size: 0.875rem;
          opacity: 0.8;
          margin-bottom: 8px;
        }

        .system-status {
          display: flex;
          align-items: center;
          font-size: 0.75rem;

          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;

            &.running {
              color: var(--color-success);
            }

            &.maintenance {
              color: var(--color-warning);
            }

            &.error {
              color: var(--color-error);
            }
          }
        }
      }
    }

    .info-stats {
      display: flex;
      justify-content: space-between;

      .stat-item {
        text-align: center;

        .stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 0.75rem;
          opacity: 0.8;
        }
      }
    }
  }

  .management-modules {
    .module-section {
      margin-bottom: 20px;

      .section-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 12px;
        padding-left: 4px;
      }

      .module-grid {
        background: var(--bg-secondary);
        border-radius: 12px;
        overflow: hidden;

        .module-item {
          display: flex;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--glass-border);
          transition: background-color 0.2s;

          &:last-child {
            border-bottom: none;
          }

          &:active {
            background-color: var(--bg-secondary);
          }

          .module-icon {
            position: relative;
            margin-right: 16px;
            padding: 8px;
            background-color: var(--bg-secondary);
            border-radius: 8px;
          }

          .module-content {
            flex: 1;

            .module-title {
              font-size: 0.875rem;
              font-weight: 500;
              color: var(--text-primary);
              margin-bottom: 4px;
            }

            .module-description {
              font-size: 0.75rem;
              color: var(--text-secondary);
            }
          }
        }
      }
    }
  }

  .quick-actions {
    margin-bottom: 20px;

    .section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
      padding-left: 4px;
    }

    .action-buttons {
      display: flex;
      gap: 12px;

      .van-button {
        flex: 1;
      }
    }
  }

  .system-monitoring {
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
      padding-left: 4px;
    }

    .monitoring-cards {
      display: flex;
      flex-direction: column;
      gap: 12px;

      .monitor-card {
        background: var(--bg-secondary);
        border-radius: 12px;
        padding: 16px;

        .monitor-header {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          font-size: 0.875rem;
          color: var(--text-primary);

          span {
            margin-left: 8px;
          }
        }

        .monitor-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .monitor-chart {
          height: 6px;
          background-color: var(--bg-tertiary);
          border-radius: 3px;
          overflow: hidden;

          .chart-bar {
            height: 100%;
            color: var(--color-info);
            border-radius: 3px;
            transition: width 0.3s ease;

            &.memory {
              color: var(--color-success);
            }

            &.disk {
              color: var(--color-warning);
            }
          }
        }
      }
    }
  }
</style>
