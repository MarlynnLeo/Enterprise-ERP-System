<!--
/**
 * Settings.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="page-container">
    <NavBar title="设置" />

    <div class="content-container">
      <!-- 用户信息卡片 -->
      <div class="user-card">
        <div class="user-avatar" @click="navigateTo('/profile')">
          <img v-if="userAvatar" :src="userAvatar" alt="头像" />
          <Icon v-else name="user-o" size="32" color="#fff" />
        </div>
        <div class="user-info">
          <div class="user-name">{{ userName }}</div>
          <div class="user-role">{{ userRole }}</div>
        </div>
        <Icon name="arrow" size="16" color="#969799" />
      </div>

      <div class="settings-list">
        <CellGroup inset title="个人设置">
          <Cell title="个人资料" is-link @click="navigateTo('/profile')" icon="user-o" />
          <Cell title="修改密码" is-link @click="navigateTo('/profile/change-password')" icon="lock" />
        </CellGroup>

        <CellGroup inset title="应用设置">
          <Cell title="语言设置" :value="language" is-link @click="showLanguagePicker = true" icon="globe-o" />
          <Cell title="主题模式" :value="themeMode" is-link @click="showThemePicker = true" icon="brush-o" />
          <Cell title="字体大小" :value="fontSize" is-link @click="showFontSizePicker = true" icon="font-o" />
        </CellGroup>

        <CellGroup inset title="系统信息">
          <Cell title="系统版本" :value="appVersion" icon="info-o" />
          <Cell title="服务器地址" :value="serverUrl" icon="cluster-o" />
          <Cell title="网络状态" :value="networkStatus" icon="wifi-o" />
        </CellGroup>

        <CellGroup inset title="通用设置">
          <Cell title="清除缓存" is-link @click="clearCache" icon="delete-o" />
          <Cell title="检查更新" is-link @click="checkUpdate" icon="upgrade" />
          <Cell title="使用帮助" is-link @click="showHelp" icon="question-o" />
          <Cell title="关于我们" is-link @click="showAbout" icon="info-o" />
        </CellGroup>
      </div>

      <div class="bottom-actions">
        <Button size="large" type="danger" @click="logout">退出登录</Button>
      </div>
    </div>

    <!-- 关于对话框 -->
    <Dialog v-model:show="aboutDialogVisible" title="关于我们" confirm-button-text="确定">
      <div class="about-content">
        <div class="about-logo">
          <Icon name="shop-o" size="48" color="#1989fa" />
        </div>
        <h3>KACON-ERP移动端</h3>
        <p>版本号：{{ appVersion }}</p>
        <p class="mt-xs">© 2025 企业资源管理系统</p>
        <p class="mt-xs">技术支持：技术部</p>
        <p class="mt-xs">联系方式：support@example.com</p>
      </div>
    </Dialog>

    <!-- 语言选择器 -->
    <Popup v-model:show="showLanguagePicker" position="bottom">
      <Picker
        :columns="languageOptions"
        @confirm="onLanguageConfirm"
        @cancel="showLanguagePicker = false"
      />
    </Popup>

    <!-- 主题选择器 -->
    <Popup v-model:show="showThemePicker" position="bottom">
      <Picker
        :columns="themeOptions"
        @confirm="onThemeConfirm"
        @cancel="showThemePicker = false"
      />
    </Popup>

    <!-- 字体大小选择器 -->
    <Popup v-model:show="showFontSizePicker" position="bottom">
      <Picker
        :columns="fontSizeOptions"
        @confirm="onFontSizeConfirm"
        @cancel="showFontSizePicker = false"
      />
    </Popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { NavBar, Cell, CellGroup, Button, Dialog, Popup, Picker, Icon, showToast, showLoadingToast } from 'vant';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';
import { API_CONFIG } from '@/config/api';

const router = useRouter();
const authStore = useAuthStore();
const aboutDialogVisible = ref(false);
const showLanguagePicker = ref(false);
const showThemePicker = ref(false);
const showFontSizePicker = ref(false);

// 应用版本
const appVersion = ref('v1.0.0');

// 服务器地址
const serverUrl = computed(() => {
  const url = API_CONFIG.baseURL || 'http://localhost:3000';
  return url.replace('http://', '').replace('https://', '');
});

// 网络状态
const networkStatus = ref('在线');

// 用户信息
const userInfo = computed(() => authStore.user || {});
const userName = computed(() => userInfo.value.name || userInfo.value.real_name || userInfo.value.username || '用户');
// ⚠️ 注意: 此处使用role仅用于显示角色名称,不用于权限判断
// 权限判断请使用 authStore.permissions
const userRole = computed(() => {
  if (userInfo.value.role === 'admin') return '管理员';
  if (userInfo.value.role === 'manager') return '经理';
  if (userInfo.value.role === 'user') return '用户';
  return userInfo.value.role || '用户';
});
const userAvatar = computed(() => userInfo.value.avatar || null);

// 语言设置
const language = ref('简体中文');
const languageOptions = [
  { text: '简体中文', value: 'zh-CN' },
  { text: 'English', value: 'en-US' }
];

// 主题设置
const themeMode = ref('浅色模式');
const themeOptions = [
  { text: '浅色模式', value: 'light' },
  { text: '深色模式', value: 'dark' },
  { text: '跟随系统', value: 'auto' }
];

// 字体大小设置
const fontSize = ref('标准');
const fontSizeOptions = [
  { text: '小', value: 'small' },
  { text: '标准', value: 'medium' },
  { text: '大', value: 'large' }
];

// 导航到指定页面
const navigateTo = (path) => {
  router.push(path);
};

// 语言选择确认
const onLanguageConfirm = ({ selectedOptions }) => {
  language.value = selectedOptions[0].text;
  showLanguagePicker.value = false;
  showToast(`已切换到${selectedOptions[0].text}`);
  // 这里可以添加实际的语言切换逻辑
};

// 主题选择确认
const onThemeConfirm = ({ selectedOptions }) => {
  themeMode.value = selectedOptions[0].text;
  showThemePicker.value = false;
  showToast(`已切换到${selectedOptions[0].text}`);
  // 这里可以添加实际的主题切换逻辑
};

// 字体大小选择确认
const onFontSizeConfirm = ({ selectedOptions }) => {
  fontSize.value = selectedOptions[0].text;
  showFontSizePicker.value = false;
  showToast(`字体大小已设置为${selectedOptions[0].text}`);
  // 这里可以添加实际的字体大小切换逻辑
};

// 清除缓存
const clearCache = () => {
  Dialog.confirm({
    title: '清除缓存',
    message: '确定要清除所有缓存数据吗？',
  })
    .then(() => {
      const toast = showLoadingToast({
        message: '清除中...',
        forbidClick: true,
        duration: 0
      });

      setTimeout(() => {
        // 清除localStorage中的缓存数据（保留token和用户信息）
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        const isLoggedIn = localStorage.getItem('isLoggedIn');

        localStorage.clear();

        // 恢复必要的数据
        if (token) localStorage.setItem('token', token);
        if (user) localStorage.setItem('user', user);
        if (isLoggedIn) localStorage.setItem('isLoggedIn', isLoggedIn);

        toast.close();
        showToast('缓存已清除');
      }, 1000);
    })
    .catch(() => {
      // 取消操作
    });
};

// 检查更新
const checkUpdate = () => {
  const toast = showLoadingToast({
    message: '检查中...',
    forbidClick: true,
    duration: 0
  });

  setTimeout(() => {
    toast.close();
    showToast('当前已是最新版本');
  }, 1500);
};

// 显示帮助
const showHelp = () => {
  Dialog.alert({
    title: '使用帮助',
    message: '如需帮助，请联系技术支持部门\n电话：400-xxx-xxxx\n邮箱：support@example.com',
  });
};

// 显示关于我们
const showAbout = () => {
  aboutDialogVisible.value = true;
};

// 退出登录
const logout = () => {
  Dialog.confirm({
    title: '提示',
    message: '确定要退出登录吗？',
  })
    .then(() => {
      // 调用退出登录方法
      authStore.logout();
      showToast('已退出登录');
      router.push('/login');
    })
    .catch(() => {
      // 取消操作
    });
};

// 检查网络状态
const checkNetworkStatus = () => {
  networkStatus.value = navigator.onLine ? '在线' : '离线';
};

onMounted(() => {
  checkNetworkStatus();

  // 监听网络状态变化
  window.addEventListener('online', checkNetworkStatus);
  window.addEventListener('offline', checkNetworkStatus);
});
</script>

<style lang="scss" scoped>
.page-container {
  min-height: 100vh;
  background-color: var(--bg-primary);
}

.content-container {
  padding-bottom: 80px; // 为底部按钮留出空间
}

// 用户信息卡片
.user-card {
  margin: 16px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: none;

  .user-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .user-info {
    flex: 1;

    .user-name {
      color: #fff;
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .user-role {
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
    }
  }
}

.settings-list {
  margin-top: $margin-md;
}

.bottom-actions {
  position: fixed;
  bottom: 60px; // 为底部导航栏留出空间
  left: 0;
  right: 0;
  padding: 16px;
  background-color: var(--bg-primary);
  border-top: 1px solid var(--van-border-color);
}

.about-content {
  padding: $padding-lg;
  text-align: center;

  .about-logo {
    margin-bottom: 16px;
  }

  h3 {
    margin: 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin: 4px 0;
    color: var(--text-secondary);
    font-size: 14px;
  }
}

// Vant组件样式覆盖
:deep(.van-cell) {
  padding: 14px 16px;
}

:deep(.van-cell__title) {
  font-size: 15px;
}

:deep(.van-cell__value) {
  color: var(--text-secondary);
}
</style>