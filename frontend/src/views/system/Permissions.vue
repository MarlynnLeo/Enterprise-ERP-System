<!--
/**
 * Permissions.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="permissions-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>权限管理</h2>
          <p class="subtitle">管理角色与菜单权限</p>
        </div>
      </div>
    </el-card>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <template #header>
        <div class="card-header">
          <span>权限管理</span>
          <el-radio-group v-model="activeTab" size="small">
            <el-radio-button value="roles">角色管理</el-radio-button>
            <el-radio-button value="menus">菜单权限</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 角色管理 -->
      <div v-if="activeTab === 'roles'">
        <div class="role-header">
          <h3>系统角色</h3>
          <el-button type="primary" v-permission="'system:permissions:manage'" @click="showAddRoleDialog">新增角色</el-button>
        </div>
        
        <el-table
          :data="roleList"
          style="width: 100%"
          border
          v-loading="roleLoading"
        >
          <template #empty>
            <el-empty description="暂无角色数据" />
          </template>
          <el-table-column prop="name" label="角色名称" width="180"></el-table-column>
          <el-table-column prop="code" label="角色编码" width="280"></el-table-column>
          <el-table-column prop="description" label="角色描述" min-width="400"></el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="scope">
              <el-tag :type="String(scope.row.status) === '1' ? 'success' : 'danger'">
                {{ String(scope.row.status) === '1' ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createTime" label="创建时间" width="180"></el-table-column>
          <el-table-column label="操作" min-width="250" fixed="right">
            <template #default="scope">
              <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                <el-popconfirm
                  v-if="String(scope.row.status) !== '1'"
                  title="确定要启用该角色吗？"
                  @confirm="handleToggleRoleStatus(scope.row)"
                >
                  <template #reference>
                    <el-button size="small" type="success" v-permission="'system:permissions:manage'">
                      <el-icon><Check /></el-icon> 启用
                    </el-button>
                  </template>
                </el-popconfirm>

                <el-popconfirm
                  v-if="String(scope.row.status) === '1'"
                  title="确定要禁用该角色吗？"
                  @confirm="handleToggleRoleStatus(scope.row)"
                  confirm-button-type="danger"
                >
                  <template #reference>
                    <el-button size="small" type="warning" v-permission="'system:permissions:manage'">
                      <el-icon><Close /></el-icon> 禁用
                    </el-button>
                  </template>
                </el-popconfirm>

                <el-button
                  v-if="String(scope.row.status) === '1'"
                  type="primary"
                  size="small"
                  @click="handleViewRole(scope.row)"
                ><el-icon><View /></el-icon> 查看</el-button>

                <el-button
                  v-if="String(scope.row.status) !== '1'"
                  type="primary"
                  size="small"
                  v-permission="'system:permissions:manage'"
                  @click="handleEditRole(scope.row)"
                ><el-icon><Edit /></el-icon> 编辑</el-button>

                <el-button type="info" size="small" v-permission="'system:permissions:manage'" @click="handleRolePermission(scope.row)">
                  <el-icon><Setting /></el-icon> 分配权限
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- 角色分页 -->
        <div class="pagination-container" style="display: flex; justify-content: flex-end; margin-top: 20px;">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            :total="roleTotal"
            :page-size="rolePageSize"
            :current-page="roleCurrentPage"
            @size-change="handleRoleSizeChange"
            @current-change="handleRoleCurrentChange"
          >
          </el-pagination>
        </div>
      </div>

      <!-- 菜单权限 -->
      <div v-if="activeTab === 'menus'">
        <div class="menu-header">
          <h3>菜单权限</h3>
          <div>
            <el-button type="primary" v-permission="'system:permissions:manage'" @click="showAddMenuDialog">新增菜单</el-button>
            <el-button type="success" v-permission="'system:permissions:manage'" @click="importMenuData">导入完整菜单</el-button>
          </div>
        </div>
        
        <el-table
          :data="menuList"
          style="width: 100%"
          border
          row-key="id"
          :tree-props="{children: 'children', hasChildren: 'hasChildren'}"
          v-loading="menuLoading"
          :default-sort="{ prop: 'sort', order: 'ascending' }"
        >
          <template #empty>
            <el-empty description="暂无菜单数据" />
          </template>
          <el-table-column prop="name" label="菜单名称" width="190">
            <template #default="scope">
              <span v-if="scope.row.icon" class="menu-icon">
                <i :class="scope.row.icon"></i>
              </span>
              {{ scope.row.name }}
              <menu-type-tag :type="scope.row.type" />
            </template>
          </el-table-column>
          <el-table-column prop="path" label="路由路径" width="280"></el-table-column>
          <el-table-column label="菜单类型" width="120">
            <template #default="scope">
              <menu-type-tag :type="scope.row.type" />
            </template>
          </el-table-column>
          <el-table-column prop="permission" label="权限标识" width="300"></el-table-column>
          <el-table-column prop="icon" label="图标" width="100">
            <template #default="scope">
              <el-icon v-if="scope.row.icon">
                <component :is="scope.row.icon" />
              </el-icon>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="sort" label="排序" width="80"></el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="scope">
              <el-tag :type="String(scope.row.status) === '1' ? 'success' : 'danger'">
                {{ String(scope.row.status) === '1' ? '显示' : '隐藏' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="400" fixed="right">
            <template #default="scope">
              <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                <el-popconfirm
                  v-if="String(scope.row.status) !== '1'"
                  title="确定要显示该菜单吗？"
                  @confirm="handleToggleRoleStatus(scope.row)"
                >
                  <template #reference>
                    <el-button size="small" type="success" v-permission="'system:permissions:manage'">
                      <el-icon><Check /></el-icon> 显示
                    </el-button>
                  </template>
                </el-popconfirm>

                <el-popconfirm
                  v-if="String(scope.row.status) === '1'"
                  title="确定要隐藏该菜单吗？"
                  @confirm="handleToggleRoleStatus(scope.row)"
                  confirm-button-type="danger"
                >
                  <template #reference>
                    <el-button size="small" type="warning" v-permission="'system:permissions:manage'">
                      <el-icon><Close /></el-icon> 隐藏
                    </el-button>
                  </template>
                </el-popconfirm>

                <el-button
                  v-if="String(scope.row.status) === '1'"
                  type="primary"
                  size="small"
                  @click="handleViewMenu(scope.row)"
                ><el-icon><View /></el-icon> 查看</el-button>

                <el-button
                  v-if="String(scope.row.status) !== '1'"
                  type="primary"
                  size="small"
                  v-permission="'system:permissions:manage'"
                  @click="handleEditMenu(scope.row)"
                ><el-icon><Edit /></el-icon> 编辑</el-button>

                <el-button type="success" size="small" v-permission="'system:permissions:manage'" @click="handleAddChildMenu(scope.row)" v-if="scope.row.type < 2">添加子菜单</el-button>

                <el-popconfirm
                  v-if="String(scope.row.status) !== '1'"
                  title="确定要删除该菜单吗？此操作无法恢复。"
                  @confirm="handleDeleteMenu(scope.row)"
                  confirm-button-type="danger"
                >
                  <template #reference>
                    <el-button size="small" type="danger" v-permission="'system:permissions:manage'">
                      <el-icon><Delete /></el-icon> 删除
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
    
    <!-- 角色添加/编辑/查看对话框 -->
    <el-dialog
      :title="roleDialogTitle"
      v-model="roleDialogVisible"
      width="600px"
    >
      <template v-if="roleIsViewMode">
        <el-descriptions :column="1" border style="margin-bottom: 20px;">
          <el-descriptions-item label="角色名称">{{ roleForm.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="角色编码">{{ roleForm.code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="Number(roleForm.status) === 1 ? 'success' : 'danger'">
              {{ Number(roleForm.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="角色描述">{{ roleForm.description || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <el-form v-else :model="roleForm" :rules="roleRules" ref="roleFormRef" label-width="100px">
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="roleForm.name" placeholder="请输入角色名称"></el-input>
        </el-form-item>
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="roleForm.code" placeholder="请输入角色编码"></el-input>
        </el-form-item>
        <el-form-item label="角色描述" prop="description">
          <el-input
            v-model="roleForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入角色描述"
          ></el-input>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="roleForm.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="roleDialogVisible = false">{{ roleIsViewMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!roleIsViewMode" type="primary" @click="saveRole" :loading="roleSaveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 分配权限对话框 -->
    <el-dialog
      title="分配权限"
      v-model="permissionDialogVisible"
      width="960px"
      top="5vh"
      destroy-on-close
      @opened="onPermissionDialogOpened"
    >
      <!-- 顶栏：角色 + 搜索 + 统计 -->
      <div class="perm-toolbar">
        <div class="perm-toolbar-left">
          <span class="perm-role-label">当前角色：<strong>{{ currentRole?.name || '未选择' }}</strong></span>
          <el-tag type="info" size="small" effect="plain" round>
            已选 <strong>{{ permSelectedCount }}</strong> 项
          </el-tag>
        </div>
        <el-input
          v-model="permSearchKeyword"
          placeholder="搜索权限名称或编码..."
          clearable
          style="width: 260px"
          size="small"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>

      <!-- 操作栏 -->
      <div class="perm-actions">
        <div class="perm-actions-left">
          <el-button type="primary" size="small" @click="expandAll">全部展开</el-button>
          <el-button type="info" size="small" @click="collapseAll">全部折叠</el-button>
          <el-button type="warning" size="small" @click="refreshMenuTree">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
        </div>
        <div class="perm-actions-right">
          <el-popover placement="bottom-end" :width="280" trigger="click">
            <template #reference>
              <el-button size="small">模块快捷操作</el-button>
            </template>
            <div class="module-quick-list">
              <div
                v-for="mod in topModules"
                :key="mod.id"
                class="module-quick-item"
              >
                <el-checkbox
                  :model-value="isModuleFullyChecked(mod)"
                  :indeterminate="isModuleIndeterminate(mod)"
                  @change="toggleModuleCheck(mod)"
                  size="small"
                />
                <span class="module-quick-name">{{ mod.name }}</span>
                <el-tag size="small" type="info" effect="plain">{{ getModuleCheckedCount(mod) }}</el-tag>
              </div>
            </div>
          </el-popover>
        </div>
      </div>

      <!-- 权限树 -->
      <div class="perm-tree-container" v-if="hasValidMenuTree">
        <div v-if="permissionDialogVisible && treeRenderFlag">
          <el-tree
            ref="permissionTreeRef"
            :data="validMenuTree"
            show-checkbox
            node-key="id"
            :props="{ label: 'name', children: 'children' }"
            :default-checked-keys="selectedMenuIds || []"
            :default-expand-all="false"
            :check-strictly="false"
            :highlight-current="false"
            :expand-on-click-node="true"
            :render-after-expand="true"
            :filter-node-method="filterNode"
            class="permission-menu-tree"
            @check="handleTreeCheck"
            @check-change="handleCheckChange"
          >
            <template #default="{ node, data }">
              <div class="perm-node" :class="'perm-node--type-' + data.type">
                <span class="perm-node__name">{{ data.name }}</span>
                <el-tag
                  :type="data.type === 0 ? 'primary' : data.type === 1 ? 'success' : 'warning'"
                  size="small"
                  effect="plain"
                  class="perm-node__tag"
                >{{ data.type === 0 ? '目录' : data.type === 1 ? '菜单' : '按钮' }}</el-tag>
                <span class="perm-node__code" v-if="data.permission">{{ data.permission }}</span>
                <el-button
                  v-if="data.type === 0 && data.children && data.children.length > 0"
                  size="small"
                  link
                  type="primary"
                  class="perm-node__select-all"
                  @click.stop="toggleModuleCheck(data)"
                >{{ isModuleFullyChecked(data) ? '取消全选' : '全选' }}</el-button>
              </div>
            </template>
          </el-tree>
        </div>
      </div>
      <div v-else class="empty-tree-message">
        <el-empty description="菜单数据为空，无法显示权限树">
          <div class="empty-actions">
            <el-button type="primary" @click="refreshMenuTree">刷新菜单数据</el-button>
          </div>
        </el-empty>
      </div>

      <template #footer>
        <div class="perm-dialog-footer">
          <span class="perm-footer-stats">
            完整选中 <strong>{{ permCheckedCount }}</strong> 项，
            部分选中 <strong>{{ permHalfCheckedCount }}</strong> 项
          </span>
          <span>
            <el-button @click="permissionDialogVisible = false">关闭</el-button>
            <el-button v-permission="'system:permissions:manage'" type="primary" @click="saveRolePermission" :loading="permissionSaveLoading">保存权限</el-button>
          </span>
        </div>
      </template>
    </el-dialog>

    <!-- 菜单添加/编辑/查看对话框 -->
    <el-dialog
      :title="menuDialogTitle"
      v-model="menuDialogVisible"
      width="600px"
    >
      <template v-if="menuIsViewMode">
        <el-descriptions :column="2" border style="margin-bottom: 20px;">
          <el-descriptions-item label="上级菜单" :span="2">
            {{ menuForm.parentId === 0 ? '顶级菜单' : (menuTree.find(m => m.id === menuForm.parentId)?.name || '未知') }}
          </el-descriptions-item>
          <el-descriptions-item label="菜单类型">
             {{ menuForm.type === 0 ? '目录' : (menuForm.type === 1 ? '菜单' : '按钮') }}
          </el-descriptions-item>
          <el-descriptions-item label="菜单名称">{{ menuForm.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="Number(menuForm.status) === 1 ? 'success' : 'danger'">
              {{ Number(menuForm.status) === 1 ? '显示' : '隐藏' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="排序">{{ menuForm.sort ?? '-' }}</el-descriptions-item>

          <el-descriptions-item label="路由路径" v-if="menuForm.type !== 2" :span="2">{{ menuForm.path || '-' }}</el-descriptions-item>
          <el-descriptions-item label="组件路径" v-if="menuForm.type === 1" :span="2">{{ menuForm.component || '-' }}</el-descriptions-item>
          <el-descriptions-item label="权限标识" v-if="menuForm.type !== 0" :span="2">{{ menuForm.permission || '-' }}</el-descriptions-item>
          <el-descriptions-item label="图标" v-if="menuForm.type !== 2" :span="2">
             <el-icon v-if="menuForm.icon" style="vertical-align: middle; margin-right: 5px;"><component :is="menuForm.icon" /></el-icon>
             {{ menuForm.icon || '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <el-form v-else :model="menuForm" :rules="menuRules" ref="menuFormRef" label-width="100px">
        <el-form-item label="上级菜单">
          <el-tree-select
            v-model="menuForm.parentId"
            :data="menuTree || []"
            check-strictly
            filterable
            node-key="id"
            :render-after-expand="true"
            :props="{ label: 'name', children: 'children' }"
            placeholder="请选择上级菜单"
            style="width: 100%"
          ></el-tree-select>
        </el-form-item>
        <el-form-item label="菜单类型" prop="type">
          <el-radio-group v-model="menuForm.type">
            <el-radio :value="0">目录</el-radio>
            <el-radio :value="1">菜单</el-radio>
            <el-radio :value="2">按钮</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="菜单名称" prop="name">
          <el-input v-model="menuForm.name" placeholder="请输入菜单名称"></el-input>
        </el-form-item>
        <el-form-item label="路由路径" prop="path" v-if="menuForm.type !== 2">
          <el-input v-model="menuForm.path" placeholder="请输入路由路径"></el-input>
        </el-form-item>
        <el-form-item label="组件路径" prop="component" v-if="menuForm.type === 1">
          <el-input v-model="menuForm.component" placeholder="请输入组件路径"></el-input>
        </el-form-item>
        <el-form-item label="权限标识" prop="permission" v-if="menuForm.type !== 0">
          <el-input v-model="menuForm.permission" placeholder="请输入权限标识"></el-input>
        </el-form-item>
        <el-form-item label="图标" prop="icon" v-if="menuForm.type !== 2">
          <el-input v-model="menuForm.icon" placeholder="请输入图标名称"></el-input>
        </el-form-item>
        <el-form-item label="排序" prop="sort">
          <el-input-number v-model="menuForm.sort" :min="0" :max="999" style="width: 100%"></el-input-number>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="menuForm.status">
            <el-radio :value="1">显示</el-radio>
            <el-radio :value="0">隐藏</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="menuDialogVisible = false">{{ menuIsViewMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!menuIsViewMode" type="primary" @click="saveMenu" :loading="menuSaveLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, computed, h, watch } from 'vue';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { Refresh, Search } from '@element-plus/icons-vue';
import { api, systemApi } from '@/services/api';
import menuPermissions, { buildMenuTree, generateMenuSQL } from '../../utils/menuPermissions';
import { useAuthStore } from '../../stores/auth';

// 权限store
const authStore = useAuthStore();

import Logger from '@/utils/logger';

// 菜单类型标签组件
const MenuTypeTag = (props) => {
  return h('el-tag', { 
    type: props.type === 0 ? 'primary' : props.type === 1 ? 'success' : 'warning',
    size: 'small'
  }, props.type === 0 ? '目录' : props.type === 1 ? '菜单' : '按钮');
};

// 当前激活的标签页
const activeTab = ref('roles');

// 角色相关
const roleList = ref([]);
const roleLoading = ref(false);
const roleSaveLoading = ref(false);
const roleDialogVisible = ref(false);
const roleDialogTitle = ref('新增角色');
const roleIsViewMode = ref(false);
const roleFormRef = ref(null);

// 角色分页相关
const roleTotal = ref(0);
const rolePageSize = ref(10);
const roleCurrentPage = ref(1);

// 菜单相关
const menuList = ref([]);
const menuTree = ref([]);
const menuLoading = ref(false);
const menuSaveLoading = ref(false);
const menuDialogVisible = ref(false);
const menuDialogTitle = ref('新增菜单');
const menuIsViewMode = ref(false);
const menuFormRef = ref(null);

// 权限分配相关
const permissionDialogVisible = ref(false);
const permissionTreeRef = ref(null);
const permissionSaveLoading = ref(false);
const currentRole = ref({});
const selectedMenuIds = ref([]);
const halfCheckedMenuIds = ref([]);
const treeRenderFlag = ref(false);  // 控制树组件的渲染
const treeKey = ref(Date.now());    // 用于强制树组件重新渲染

// 权限搜索关键词
const permSearchKeyword = ref('');

// 角色表单
const roleForm = reactive({
  id: null,
  name: '',
  code: '',
  description: '',
  status: 1
});

// 菜单表单
const menuForm = reactive({
  id: null,
  parentId: null,
  name: '',
  path: '',
  component: '',
  permission: '',
  type: 1,
  icon: '',
  sort: 0,
  status: 1
});

// 角色表单验证规则
const roleRules = {
  name: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { min: 2, max: 30, message: '角色名称长度在 2 到 30 个字符之间', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入角色编码', trigger: 'blur' },
    { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '编码只能包含英文字母、数字和下划线，且必须以字母或下划线开头', trigger: 'blur' }
  ]
};

// 菜单表单验证规则
const menuRules = {
  name: [
    { required: true, message: '请输入菜单名称', trigger: 'blur' }
  ],
  path: [
    { required: true, message: '请输入路由路径', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择菜单类型', trigger: 'change' }
  ]
};

// 添加计算属性来处理菜单树
const validMenuTree = computed(() => {
  if (!menuTree.value || !Array.isArray(menuTree.value) || menuTree.value.length === 0) {
    return [];
  }
  // 直接返回原始引用，避免创建新对象
  return menuTree.value;
});

// 计算菜单树是否有效
const hasValidMenuTree = computed(() => {
  return Array.isArray(validMenuTree.value) && validMenuTree.value.length > 0;
});

// 顶级模块列表（用于快捷操作弹出框）
const topModules = computed(() => validMenuTree.value || []);

// 已选权限计数
const permSelectedCount = computed(() => {
  return selectedMenuIds.value?.length || 0;
});

// 完整选中计数
const permCheckedCount = computed(() => {
  if (!permissionTreeRef.value) return selectedMenuIds.value?.length || 0;
  try { return permissionTreeRef.value.getCheckedKeys().length; } catch { return 0; }
});

// 半选中计数
const permHalfCheckedCount = computed(() => {
  if (!permissionTreeRef.value) return 0;
  try { return permissionTreeRef.value.getHalfCheckedKeys().length; } catch { return 0; }
});

// 搜索过滤树节点
const filterNode = (value, data) => {
  if (!value) return true;
  const kw = value.toLowerCase();
  return (data.name && data.name.toLowerCase().includes(kw)) ||
         (data.permission && data.permission.toLowerCase().includes(kw));
};

// 递归收集节点下所有叶子ID
const collectLeafIds = (node) => {
  if (!node.children || node.children.length === 0) return [node.id];
  return node.children.flatMap(c => collectLeafIds(c));
};

// 切换模块全选/取消全选
const toggleModuleCheck = (moduleData) => {
  if (!permissionTreeRef.value) return;
  const leafIds = collectLeafIds(moduleData);
  const checked = permissionTreeRef.value.getCheckedKeys();
  const allChecked = leafIds.length > 0 && leafIds.every(id => checked.includes(id));
  leafIds.forEach(id => permissionTreeRef.value.setChecked(id, !allChecked, true));
  handleTreeCheck();
};

// 模块是否全选
const isModuleFullyChecked = (moduleData) => {
  if (!permissionTreeRef.value) return false;
  const leafIds = collectLeafIds(moduleData);
  if (leafIds.length === 0) return false;
  const checked = permissionTreeRef.value.getCheckedKeys();
  return leafIds.every(id => checked.includes(id));
};

// 模块是否半选
const isModuleIndeterminate = (moduleData) => {
  if (!permissionTreeRef.value) return false;
  const leafIds = collectLeafIds(moduleData);
  if (leafIds.length === 0) return false;
  const checked = permissionTreeRef.value.getCheckedKeys();
  const count = leafIds.filter(id => checked.includes(id)).length;
  return count > 0 && count < leafIds.length;
};

// 获取模块已选计数
const getModuleCheckedCount = (moduleData) => {
  if (!permissionTreeRef.value) return '0';
  const leafIds = collectLeafIds(moduleData);
  const checked = permissionTreeRef.value.getCheckedKeys();
  const count = leafIds.filter(id => checked.includes(id)).length;
  return `${count}/${leafIds.length}`;
};

// 监听搜索关键词变化，触发树过滤
watch(permSearchKeyword, (val) => {
  if (permissionTreeRef.value) {
    permissionTreeRef.value.filter(val);
  }
});

// 加载角色列表
const loadRoles = async () => {
  roleLoading.value = true;
  try {
    const params = {
      page: roleCurrentPage.value,
      limit: rolePageSize.value
    };
    const response = await systemApi.getRoles(params);
    
    // 确保处理的是数组数据
    let responseData = response.data;
    const rolesData = responseData?.data || responseData?.list || responseData?.rows || (Array.isArray(responseData) ? responseData : []);
    
    roleList.value = rolesData;
    
    // 从多级结构中安全提取总数
    let totalCount = 0;
    if (responseData?.total !== undefined) {
      totalCount = Number(responseData.total);
    } else if (responseData?.count !== undefined) {
      totalCount = Number(responseData.count);
    } else if (Array.isArray(rolesData)) {
      totalCount = rolesData.length;
    }
    roleTotal.value = totalCount;
  } catch (error) {
    roleList.value = []; // 确保错误时也是空数组
    roleTotal.value = 0;
    ElMessage.error('加载角色列表失败');
  } finally {
    roleLoading.value = false;
  }
};

// 角色分页处理
const handleRoleSizeChange = (newSize) => {
  rolePageSize.value = newSize;
  loadRoles();
};

const handleRoleCurrentChange = (newPage) => {
  roleCurrentPage.value = newPage;
  loadRoles();
};

// 加载菜单数据
const loadMenus = async () => {
  try {
    menuLoading.value = true;

    // 先尝试使用直接从数据库获取菜单的API，这样可以绕过任何中间处理
    try {
      // 移除调试日志
      // 拦截器已解包，response.data 就是业务数据
      const directResponse = await systemApi.getMenusDirect();

      if (directResponse && directResponse.data && Array.isArray(directResponse.data)) {

        let menuData = directResponse.data;
        // 移除调试日志
        
        // 处理直接从数据库获取的菜单数据
        menuList.value = menuData.map(item => ({
          ...item,
          id: Number(item.id),
          parent_id: Number(item.parent_id || 0),
          parentId: Number(item.parent_id || 0), // 同时设置parentId以兼容前端代码
          sort: item.sort_order || item.sort || 0, // 处理排序字段
          type: Number(item.type || 0) // 确保type是数字
        }));
        
        // 缓存菜单数据
        try {
          localStorage.setItem('cachedMenus', JSON.stringify(menuList.value));
        } catch (cacheError) {
          // 缓存失败不影响主流程
        }
        
        // 构建菜单树
        const treeData = convertToTree(menuList.value);
        menuTree.value = treeData;
        
        // 移除调试日志
        menuLoading.value = false;
        return menuTree.value;
      }
    } catch (directError) {
      console.warn('直接API获取菜单失败，尝试标准API:', directError);
    }
    
    // 如果直接API失败，使用标准API获取菜单列表
    const response = await systemApi.getMenus();
    
    // 检查响应数据
    if (!response || !response.data) {
      ElMessage.error('加载菜单失败：响应数据无效');
      
      // 尝试从本地存储中恢复菜单数据
      const cachedMenus = localStorage.getItem('cachedMenus');
      if (cachedMenus) {
        try {
          const parsedMenus = JSON.parse(cachedMenus);
          menuList.value = parsedMenus;
          const treeData = convertToTree(menuList.value);
          menuTree.value = treeData;
          return menuTree.value;
        } catch (cacheError) {
          console.error('从本地缓存恢复菜单数据失败:', cacheError);
        }
      }
      
      return [];
    }
    
    let menuData = response.data;
    // 如果响应数据被包装在data字段中
    if (!Array.isArray(menuData) && menuData.data) {
      menuData = menuData.data;
    }
    
    if (Array.isArray(menuData)) {
      // 修复：确保所有菜单项都有正确的id和parent_id格式
      menuList.value = menuData.map(item => ({
        ...item,
        id: Number(item.id), // 确保id是数字
        parent_id: Number(item.parent_id || item.parentId || 0), // 确保parent_id是数字，默认为0
        parentId: Number(item.parent_id || item.parentId || 0), // 添加parentId字段以兼容不同命名
        sort: Number(item.sort_order || item.sort || 0), // 处理排序字段
        type: Number(item.type || 0) // 确保type是数字
      }));
      
      // 缓存菜单数据到本地存储，以便在API失败时使用
      try {
        localStorage.setItem('cachedMenus', JSON.stringify(menuList.value));
      } catch (cacheError) {
        console.warn('缓存菜单数据到本地存储失败:', cacheError);
      }
      
      // 构建菜单树
      const treeData = convertToTree(menuList.value);
      
      // 确保menuTree被正确赋值
      menuTree.value = treeData;
      
      return menuTree.value; // 返回菜单树数据
    } else {
      ElMessage.error('加载菜单失败：数据格式错误');
      menuTree.value = []; // 确保菜单树是空数组而不是undefined
    }
  } catch (error) {
    console.error('加载菜单失败:', error);
    
    if (error.response?.status === 401) {
      ElMessage.error('请先登录');
    } else {
      ElMessage.error('加载菜单失败：' + (error.response?.data?.message || error.message));
    }
    menuTree.value = []; // 确保菜单树是空数组而不是undefined
  } finally {
    menuLoading.value = false;
  }
  
  return menuTree.value; // 确保总是返回菜单树数据，即使是空数组
};

// 将平铺的菜单列表转换为树形结构
const convertToTree = (flatList) => {
  if (!flatList || !Array.isArray(flatList) || flatList.length === 0) {
    return [];
  }
  
  // 创建映射表和结果容器
  const map = {};
  const result = [];
  
  // 第一次遍历: 创建所有节点的映射
  flatList.forEach(item => {
    if (!item || typeof item !== 'object') return;
    
    const id = Number(item.id);
    if (isNaN(id) || id <= 0) {
      return;
    }
    
    // 确保parent_id和parentId都被正确处理
    let parentId = 0;
    if (item.parentId !== undefined) {
      parentId = Number(item.parentId);
    } else if (item.parent_id !== undefined) {
      parentId = Number(item.parent_id);
    }
    
    // 确保排序字段正确
    const sortValue = Number(item.sort_order || item.sort || 0);
    
    map[id] = { 
      ...item, 
      id,
      parent_id: parentId,
      parentId: parentId,
      sort: sortValue,
      sort_order: sortValue,
      children: [] 
    };
  });
  
  // 第二次遍历: 构建树结构
  Object.values(map).forEach(node => {
    const parentId = Number(node.parentId || node.parent_id || 0);
    
    if (parentId === 0) {
      // 根节点直接添加到结果中
      result.push(node);
    } else if (map[parentId]) {
      // 将当前节点添加为父节点的子节点
      map[parentId].children.push(node);
    } else {
      // 找不到父节点，作为顶级节点添加
      result.push(node);
    }
  });
  
  // 对所有节点进行排序
  const sortNodes = (nodes) => {
    if (!nodes || !Array.isArray(nodes)) return;
    
    // 按sort字段排序
    nodes.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    
    // 递归对子节点排序
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };
  
  sortNodes(result);
  
  return result;
};

// 新增角色
const showAddRoleDialog = () => {
  roleDialogTitle.value = '新增角色';
  roleIsViewMode.value = false;
  resetRoleForm();
  roleDialogVisible.value = true;
};

// 查看角色
const handleViewRole = (row) => {
  roleDialogTitle.value = '查看角色';
  roleIsViewMode.value = true;
  Object.assign(roleForm, row);
  // 特殊处理状态展示
  roleForm.status = Number(row.status);
  roleDialogVisible.value = true;
};

// 编辑角色
const handleEditRole = (row) => {
  roleDialogTitle.value = '编辑角色';
  roleIsViewMode.value = false;
  resetRoleForm();
  
  // 填充表单数据
  Object.keys(roleForm).forEach(key => {
    if (key in row) {
      roleForm[key] = row[key];
    }
  });
  
  roleDialogVisible.value = true;
};

// 切换角色状态（el-popconfirm 已在模板中处理确认，此处直接执行）
const handleToggleRoleStatus = async (row) => {
  const statusText = String(row.status) === '1' ? '禁用' : '启用';
  const newStatus = String(row.status) === '1' ? 0 : 1;
  try {
    await systemApi.updateRoleStatus(row.id, { status: newStatus });
    ElMessage.success(`${statusText}成功`);
    loadRoles();
  } catch (error) {
    console.error(`${statusText}失败:`, error);
    ElMessage.error(`${statusText}失败`);
  }
};

// 分配权限
const handleRolePermission = async (row) => {
  try {
    currentRole.value = row;
    // 移除调试日志
    
    // 显示加载中指示器
    const loading = ElLoading.service({
      lock: true,
      text: '正在加载菜单数据...',
      background: 'rgba(0, 0, 0, 0.7)'
    });
    
    try {
      // 检查菜单列表是否已加载
      if (!menuList.value || menuList.value.length === 0) {
        // 移除调试日志
        await loadMenus();
      } else {
        // 移除调试日志
        
        // 如果菜单树为空，但菜单列表已加载，则重新构建菜单树
        if (!menuTree.value || !Array.isArray(menuTree.value) || menuTree.value.length === 0) {
          // 移除调试日志
          menuTree.value = convertToTree(menuList.value);
        }
      }
      
      // 移除详细检查菜单树状态的调试日志
      
      // 如果菜单树仍然为空，尝试从本地存储恢复
      if (!menuTree.value || !Array.isArray(menuTree.value) || menuTree.value.length === 0) {
        // 移除调试日志
        const cachedMenus = localStorage.getItem('cachedMenus');
        if (cachedMenus) {
          try {
            const parsedMenus = JSON.parse(cachedMenus);
            if (Array.isArray(parsedMenus) && parsedMenus.length > 0) {
              // 移除调试日志
              menuList.value = parsedMenus;
              menuTree.value = convertToTree(parsedMenus);
              // 移除调试日志
            }
          } catch (cacheError) {
            console.error('从本地缓存恢复菜单数据失败:', cacheError);
          }
        }
      }
      
      if (!menuList.value || menuList.value.length === 0) {
        loading.close();
        console.error('菜单数据为空');
        ElMessage.error('无法加载菜单数据');
        return;
      }
      
      // 获取角色权限
      // 移除调试日志
      const response = await systemApi.getRolePermissions(row.id);
      // 移除调试日志
      
      if (!response || !response.data) {
        loading.close();
        console.error('角色权限响应无效:', response);
        ElMessage.error('获取角色权限失败：响应数据无效');
        return;
      }
      
      // 设置选中的菜单ID
      const permissionData = response.data;
      
      // 兼容新旧接口
      if (Array.isArray(permissionData)) {
        // 旧格式：直接是菜单ID数组
        const allSelectedIds = permissionData.map(id => Number(id));
        
        // 🔧 重要修复：只选中叶子节点，避免父节点导致子节点自动全选
        const leafNodeIds = filterLeafNodes(allSelectedIds);

        selectedMenuIds.value = leafNodeIds;
        halfCheckedMenuIds.value = [];
        // 移除调试日志
      } else {
        // 新格式：包含完全选中和半选状态的对象
        selectedMenuIds.value = (permissionData.checkedKeys || []).map(id => Number(id));
        halfCheckedMenuIds.value = (permissionData.halfCheckedKeys || []).map(id => Number(id));
        // 移除调试日志
      }
      
      // 保存当前角色的权限到localStorage，防止刷新丢失
      try {
        const roleSelectionsKey = `role_permissions_${row.id}`;
        localStorage.setItem(roleSelectionsKey, JSON.stringify({
          checked: selectedMenuIds.value,
          halfChecked: halfCheckedMenuIds.value
        }));
        // 移除调试日志
      } catch (err) {
        console.warn('保存角色权限到本地存储失败:', err);
      }
      
      // 利用原生的选中能力
      if (permissionTreeRef.value) {
        permissionTreeRef.value.setCheckedKeys(selectedMenuIds.value);
      }
      
      // 关闭加载指示器
      loading.close();
      
      // 显示对话框 - 对话框打开后会触发onPermissionDialogOpened事件
      permissionDialogVisible.value = true;
    } finally {
      // 确保加载指示器被关闭
      if (loading) {
        loading.close();
      }
    }
  } catch (error) {
    console.error('获取角色权限失败:', error);
    if (error.response?.status === 401) {
      ElMessage.error('请先登录');
    } else {
      ElMessage.error('获取角色权限失败：' + (error.response?.data?.message || error.message));
    }
  }
};

// 提取设置树选中状态的逻辑为独立函数
const setTreeCheckedStatus = () => {
  // 移除调试日志
  
  try {
    // 先清空所有选中状态
    if (typeof permissionTreeRef.value.setCheckedKeys === 'function') {
      permissionTreeRef.value.setCheckedKeys([]);
    } else {
      console.warn('树组件没有setCheckedKeys方法');
      return; // 如果没有这个方法，则退出
    }
    
    // 设置完全选中的菜单
    if (selectedMenuIds.value && selectedMenuIds.value.length > 0) {
      // 确保所有ID都是数字类型
      const numericIds = selectedMenuIds.value.map(id => Number(id));
      permissionTreeRef.value.setCheckedKeys(numericIds);
      // 移除调试日志
    }
    
    // 检查菜单树数据状态
    const menuTreeData = menuTree.value || [];
    
    // 移除调试日志
    
    // 检查树节点是否正确渲染
    if (permissionTreeRef.value.store && permissionTreeRef.value.store.nodesMap) {
      const nodeKeys = Object.keys(permissionTreeRef.value.store.nodesMap);
      // 移除调试日志
      if (nodeKeys.length > 0) {
        // 移除调试日志
      } else {
        console.warn('树节点未正确渲染');
      }
    } else {
      console.warn('树组件没有store或nodesMap属性');
    }
    
    // 强制展开所有节点 (使用正规 nextTick 而不是定时器)
    if (Array.isArray(menuTreeData) && menuTreeData.length > 0) {
      nextTick(() => {
        try {
          expandAll();
        } catch (expandError) {
          console.error('展开节点失败:', expandError);
        }
      });
    }
  } catch (error) {
    console.error('设置选中状态失败:', error);
    console.error('错误详情:', {
      message: error.message,
      stack: error.stack,
      permissionTreeRef: permissionTreeRef.value ? '存在' : '不存在',
      selectedMenuIds: selectedMenuIds.value ? selectedMenuIds.value.length : 0
    });
  }
};

// 保存角色
const saveRole = async () => {
  if (!roleFormRef.value) return

  // 🔒 防止重复提交：在验证之前就检查 loading 状态
  if (roleSaveLoading.value) {
    ElMessage.warning('正在保存中，请勿重复操作')
    return
  }

  try {
    // 表单验证
    const valid = await roleFormRef.value.validate()
    if (!valid) return

    // 🔒 立即设置 loading 状态，防止重复提交
    roleSaveLoading.value = true

    if (roleForm.id) {
      // 更新
      await systemApi.updateRole(roleForm.id, roleForm)
      ElMessage.success('更新成功')
    } else {
      // 新增
      await systemApi.createRole(roleForm)
      ElMessage.success('添加成功')
    }

    roleDialogVisible.value = false
    loadRoles()
  } catch (error) {
    // 表单验证失败
    if (error && typeof error === 'object' && !error.response) {
      return
    }

    console.error('保存角色失败:', error)

    // 提取后端返回的错误信息
    const errorMsg = error.response?.data?.error ||
                     error.response?.data?.message ||
                     error.message ||
                     '保存角色失败'

    // 如果是重复提交错误（409状态码），显示警告
    if (error.response?.status === 409) {
      ElMessage.warning(errorMsg)
    } else {
      ElMessage.error(errorMsg)
    }
  } finally {
    roleSaveLoading.value = false
  }
}

// 保存角色权限，确保严格按照用户勾选进行保存
const saveRolePermission = async () => {
  permissionSaveLoading.value = true;
  try {
    // 确保树组件存在
    if (!permissionTreeRef.value) {
      console.error('保存失败：树组件引用不存在');
      ElMessage.error('保存失败：无法获取权限数据');
      permissionSaveLoading.value = false;
      return;
    }
    
    // 获取完全选中的节点keys和半选中的节点keys
    const checkedKeys = permissionTreeRef.value.getCheckedKeys();
    const halfCheckedKeys = permissionTreeRef.value.getHalfCheckedKeys();

    // 确保获取到了所有选中的菜单ID
    if (!Array.isArray(checkedKeys)) {
      ElMessage.error('获取选中的菜单ID失败');
      permissionSaveLoading.value = false;
      return;
    }
    
    // 对比之前的选中状态和当前选中状态
    const rolePermissionsKey = `role_permissions_${currentRole.value.id}`;
    let uncheckedIds = [];
    
    try {
      const prevData = JSON.parse(localStorage.getItem(rolePermissionsKey) || '{}');
      let prevChecked = [];
      
      // 优先使用后端返回的完整数据作为比较基准
      if (prevData.fromBackend && prevData.checked) {
        // 移除调试日志
        prevChecked = prevData.checked;
      } 
      // 其次使用原始保存的选中状态
      else if (prevData.originalChecked) {
        // 移除调试日志
        prevChecked = prevData.originalChecked;
      }
      // 最后使用普通缓存数据
      else if (prevData.checked) {
        // 移除调试日志
        prevChecked = prevData.checked;
      }
      
      // 转换为数字格式进行比较
      const prevNumericChecked = prevChecked.map(id => Number(id));
      const currentNumericChecked = checkedKeys.map(id => Number(id));
      
      // 找出已取消选中的菜单ID
      uncheckedIds = prevNumericChecked.filter(id => !currentNumericChecked.includes(id));
      
      if (uncheckedIds.length > 0) {
        // 移除调试日志
        
        // 获取这些菜单的名称用于显示
        const uncheckedNames = uncheckedIds.map(id => {
          const node = permissionTreeRef.value.getNode(id);
          return node ? node.data.name : `菜单ID:${id}`;
        });
        
        // 移除调试日志
        
        // 显示提示，确保用户知道哪些权限被取消了
        ElMessage({
          message: `已取消 ${uncheckedNames.length} 项权限: ${uncheckedNames.slice(0, 3).join(', ')}${uncheckedNames.length > 3 ? '等' : ''}`,
          type: 'warning',
          duration: 5000
        });
      }
    } catch (err) {
      console.warn('对比选中状态失败:', err);
    }
    
    // 构建菜单ID列表 - 转换为数字格式并确保唯一性
    const menuIds = [...new Set(ensureNumericIds(checkedKeys))];
    const halfMenuIds = [...new Set(ensureNumericIds(halfCheckedKeys))];

    // 修复关键问题：将半选中的关键权限合并到完整选中列表中
    // 因为半选中通常表示父级权限，这些权限对功能访问至关重要
    const allSelectedMenuIds = [...new Set([...menuIds, ...halfMenuIds])];

    // 确保当前角色ID有效
    if (!currentRole.value || !currentRole.value.id) {
      console.error('当前角色无效:', currentRole.value);
      ElMessage.error('当前角色无效，请重新选择角色');
      permissionSaveLoading.value = false;
      return;
    }
    
    // 添加仪表盘权限（ID为1），确保每个角色至少有仪表盘权限
    if (menuIds.length > 0 && !menuIds.includes(1) && !halfMenuIds.includes(1)) {
      // 移除调试日志
      menuIds.push(1);
    }
    
    // 收集菜单名称用于确认提示
    const checkedMenuNames = menuIds.map(id => {
      const node = permissionTreeRef.value.getNode(id);
      return node ? node.data.name : `菜单ID:${id}`;
    });
    
    const halfCheckedMenuNames = halfMenuIds.map(id => {
      const node = permissionTreeRef.value.getNode(id);
      return node ? node.data.name : `菜单ID:${id}`;
    });
    
    // 显示更详细的权限分配信息
    let confirmMessage = `<strong>您将为角色 "${currentRole.value.name}" 分配以下权限：</strong><br><br>`;
    
    if (checkedMenuNames.length > 0) {
      confirmMessage += `<strong>完整权限菜单(${checkedMenuNames.length})：</strong><br>`;
      confirmMessage += checkedMenuNames.slice(0, 10).map(name => `- ${name}`).join('<br>');
      if (checkedMenuNames.length > 10) {
        confirmMessage += `<br>- 等${checkedMenuNames.length}个菜单...`;
      }
    }
    
    if (halfCheckedMenuNames.length > 0) {
      confirmMessage += `<br><br><strong>部分权限菜单(${halfCheckedMenuNames.length})：</strong><br>`;
      confirmMessage += halfCheckedMenuNames.slice(0, 10).map(name => `- ${name}`).join('<br>');
      if (halfCheckedMenuNames.length > 10) {
        confirmMessage += `<br>- 等${halfCheckedMenuNames.length}个菜单...`;
      }
    }
    
    if (uncheckedIds.length > 0) {
      confirmMessage += `<br><br><strong>已取消的权限(${uncheckedIds.length})：</strong><br>`;
      const uncheckedNames = uncheckedIds.map(id => {
        const node = permissionTreeRef.value.getNode(id);
        return node ? node.data.name : `菜单ID:${id}`;
      });
      confirmMessage += uncheckedNames.slice(0, 10).map(name => `- <span style="color:red">${name}</span>`).join('<br>');
      if (uncheckedNames.length > 10) {
        confirmMessage += `<br>- 等${uncheckedNames.length}个菜单...`;
      }
    }
    
    // 防止空数组导致清空所有权限
    if (menuIds.length === 0 && halfMenuIds.length === 0) {
      ElMessageBox.confirm(
        '确定要清空该角色的所有权限吗？清空后该角色将无法访问任何功能。',
        '确认清空',
        {
          confirmButtonText: '确认',
          cancelButtonText: '取消',
          type: 'warning',
          dangerouslyUseHTMLString: true
        }
      ).then(async () => {
        // 即使清空权限，也保留仪表盘权限
        await submitRolePermissions([1], [], uncheckedIds);
      }).catch(() => {
        permissionSaveLoading.value = false;
      });
    } else {
      // 使用更详细的确认提示
      ElMessageBox.confirm(
        confirmMessage,
        '确认分配权限',
        {
          confirmButtonText: '确认分配',
          cancelButtonText: '取消',
          type: 'info',
          dangerouslyUseHTMLString: true
        }
      ).then(async () => {
        // 先保存当前选择到本地缓存，确保选择不会丢失
        localStorage.setItem(rolePermissionsKey, JSON.stringify({
          checked: menuIds,
          halfChecked: halfMenuIds,
          unchecked: uncheckedIds,  // 特别记录取消选中的ID
          timestamp: Date.now(),
          userEdited: true,  // 标记为用户手动编辑
          exactSelection: true  // 标记为精确选择模式
        }));
        // 移除调试日志
        
        await submitRolePermissions(menuIds, halfMenuIds, uncheckedIds);
      }).catch(() => {
        permissionSaveLoading.value = false;
      });
    }
  } catch (error) {
    console.error('保存角色权限失败:', error);
    console.error('错误详情:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    ElMessage.error('保存角色权限失败: ' + (error.response?.data?.message || error.message));
    permissionSaveLoading.value = false;
  }
};

// 实际提交权限数据到后端的函数
const submitRolePermissions = async (menuIds, halfCheckedIds, uncheckedIds = []) => {
  try {
    // 新的权限处理逻辑：保持半选中状态，同时确保权限不丢失
    // 1. 完整选中的权限直接保存
    let numericMenuIds = menuIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);

    // 2. 重新设计权限处理逻辑：自动添加必要的父权限
    // 收集所有需要的父权限
    const allRequiredIds = new Set([...numericMenuIds]);

    // 为每个选中的权限添加其父权限链
    numericMenuIds.forEach(id => {
      let currentMenu = menuList.value.find(menu => menu.id === id);

      while (currentMenu && currentMenu.parent_id) {
        allRequiredIds.add(currentMenu.parent_id);
        currentMenu = menuList.value.find(menu => menu.id === currentMenu.parent_id);
      }
    });

    // 3. 重新计算完整选中和半选中状态
    const allRequiredArray = Array.from(allRequiredIds);
    const { checkedIds, halfCheckedIds: calculatedHalfCheckedIds } = calculateTreeState(allRequiredArray);

    // 4. 最终的权限列表
    // 🔧 关键修复：半选中的父节点也应该保存到数据库
    // 因为用户有该父节点下的部分权限，就应该能看到父节点菜单
    // 例如：用户有 production:plans:view 权限，就应该能看到 production:plans 菜单
    numericMenuIds = [...new Set([...checkedIds, ...calculatedHalfCheckedIds])];
    const finalHalfCheckedIds = calculatedHalfCheckedIds;

    const numericUncheckedIds = uncheckedIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);

    // 确保取消的ID真的不在选中列表中
    numericMenuIds = numericMenuIds.filter(id => !numericUncheckedIds.includes(id));
    
    // 保存到本地存储，确保即使后端保存失败也有备份
    const rolePermissionsKey = `role_permissions_${currentRole.value.id}`;
    try {
      localStorage.setItem(rolePermissionsKey, JSON.stringify({
        checked: numericMenuIds,
        halfChecked: finalHalfCheckedIds,
        unchecked: numericUncheckedIds,
        timestamp: Date.now(),
        saveInProgress: true,
        exactSelection: true,
        // 记录一份原始选择，用于在刷新页面后比对是否有变化
        originalChecked: numericMenuIds,
        originalHalfChecked: finalHalfCheckedIds,
        originalUnchecked: numericUncheckedIds
      }));
    } catch (err) {
      // 保存权限到本地存储失败
    }

    // 提交数据到API
    const response = await systemApi.updateRolePermissions(currentRole.value.id, {
      menuIds: numericMenuIds,
      halfCheckedIds: finalHalfCheckedIds,
      uncheckedIds: numericUncheckedIds
    });

    
    // 更新本地存储，标记保存成功
    try {
      const storedData = JSON.parse(localStorage.getItem(rolePermissionsKey) || '{}');
      storedData.saveInProgress = false;
      storedData.saveSuccess = true;
      storedData.saveTime = Date.now();
      storedData.confirmed = true; // 标记为已确认的最终状态
      localStorage.setItem(rolePermissionsKey, JSON.stringify(storedData));
    } catch (err) {
      // 本地存储失败不影响主流程
    }
    
    // 更新当前用户的权限缓存
    try {
      const authStore = useAuthStore();
      
      // 不管是否是当前用户角色，都刷新一次权限，以便确保权限状态最新
      try {
        await authStore.fetchUserProfile();
        await authStore.fetchUserPermissions();
      } catch (refreshError) {
        // 权限刷新失败不影响主流程
      }
      
      // 关闭权限分配对话框
      permissionDialogVisible.value = false;

      // 🔧 延迟清除权限选择状态，避免渲染错误
      setTimeout(() => {
        selectedMenuIds.value = [];
        currentRole.value = null;
      }, 100);

      // 显示成功消息
      ElMessage.success('权限分配成功！');

      // 刷新角色列表以显示最新状态
      await loadRoles();

    } catch (refreshError) {
      // 刷新权限缓存失败，不影响主流程，继续执行
      // 关闭权限分配对话框
      permissionDialogVisible.value = false;

      // 🔧 延迟清除权限选择状态，避免渲染错误
      setTimeout(() => {
        selectedMenuIds.value = [];
        currentRole.value = null;
      }, 100);

      // 显示成功消息
      ElMessage.success('权限分配成功！');

      // 刷新角色列表
      await loadRoles();
    }
    
    permissionSaveLoading.value = false;
  } catch (error) {
    console.error('提交权限数据失败:', error);
    ElMessage.error('提交权限数据失败: ' + (error.response?.data?.message || error.message));
    permissionSaveLoading.value = false;
  }
};

// 新增菜单
const showAddMenuDialog = () => {
  menuDialogTitle.value = '新增菜单';
  menuIsViewMode.value = false;
  resetMenuForm();
  menuForm.parentId = 0; // 默认顶级菜单
  menuDialogVisible.value = true;
};

// 查看菜单
const handleViewMenu = (row) => {
  menuDialogTitle.value = '查看菜单';
  menuIsViewMode.value = false; // 先临时重置，防止表单被禁用导致无法赋值
  resetMenuForm();
  
  menuIsViewMode.value = true;
  Object.assign(menuForm, row);
  menuForm.status = Number(row.status);
  menuForm.type = Number(row.type);
  menuDialogVisible.value = true;
};

// 添加子菜单
const handleAddChildMenu = (row) => {
  menuDialogTitle.value = '新增子菜单';
  menuIsViewMode.value = false;
  resetMenuForm();
  menuForm.parentId = row.id;
  
  // 如果父级是目录，则子级默认为菜单
  if (row.type === 0) {
    menuForm.type = 1;
  }
  // 如果父级是菜单，则子级默认为按钮
  else if (row.type === 1) {
    menuForm.type = 2;
  }
  
  menuDialogVisible.value = true;
};

// 编辑菜单
const handleEditMenu = (row) => {
  menuDialogTitle.value = '编辑菜单';
  menuIsViewMode.value = false;
  menuIsViewMode.value = false;
  resetMenuForm();
  
  // 填充表单数据
  Object.keys(menuForm).forEach(key => {
    if (key in row) {
      menuForm[key] = row[key];
    }
  });
  
  menuDialogVisible.value = true;
};

// 删除菜单
const handleDeleteMenu = (row) => {
  ElMessageBox.confirm(
    '确认要删除该菜单吗？删除后不可恢复！', 
    '警告', 
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await systemApi.deleteMenu(row.id);
      ElMessage.success('删除成功');
      loadMenus(); // 重新加载菜单数据
    } catch (error) {
      console.error('删除失败:', error);
      ElMessage.error('删除失败: ' + error.message);
    }
  }).catch(() => {});
};

// 保存菜单
const saveMenu = async () => {
  if (!menuFormRef.value) return

  // 🔒 防止重复提交：在验证之前就检查 loading 状态
  if (menuSaveLoading.value) {
    ElMessage.warning('正在保存中，请勿重复操作')
    return
  }

  try {
    // 表单验证
    const valid = await menuFormRef.value.validate()
    if (!valid) return

    // 🔒 立即设置 loading 状态，防止重复提交
    menuSaveLoading.value = true

    if (menuForm.id) {
      // 更新
      await systemApi.updateMenu(menuForm.id, menuForm)
      ElMessage.success('更新成功')
    } else {
      // 新增
      const response = await systemApi.createMenu(menuForm)
      ElMessage.success('添加成功')
      // 拦截器已解包，response.data 就是业务数据
      // 如果API返回了新创建的菜单ID，更新表单
      if (response.data?.id) {
        menuForm.id = response.data.id
      }
    }

    menuDialogVisible.value = false
    loadMenus() // 重新加载菜单数据
  } catch (error) {
    // 表单验证失败
    if (error && typeof error === 'object' && !error.response) {
      return
    }

    console.error('保存菜单失败:', error)

    // 提取后端返回的错误信息
    const errorMsg = error.response?.data?.error ||
                     error.response?.data?.message ||
                     error.message ||
                     '保存菜单失败'

    // 如果是重复提交错误（409状态码），显示警告
    if (error.response?.status === 409) {
      ElMessage.warning(errorMsg)
    } else {
      ElMessage.error(errorMsg)
    }
  } finally {
    menuSaveLoading.value = false
  }
}

// 重置角色表单
const resetRoleForm = () => {
  roleForm.id = null;
  roleForm.name = '';
  roleForm.code = '';
  roleForm.description = '';
  roleForm.status = 1;
  
  // 清除校验
  if (roleFormRef.value) {
    roleFormRef.value.resetFields();
  }
};

// 重置菜单表单
const resetMenuForm = () => {
  menuForm.id = null;
  menuForm.parentId = null;
  menuForm.name = '';
  menuForm.path = '';
  menuForm.component = '';
  menuForm.permission = '';
  menuForm.type = 1;
  menuForm.icon = '';
  menuForm.sort = 0;
  menuForm.status = 1;
  
  // 清除校验
  if (menuFormRef.value) {
    menuFormRef.value.resetFields();
  }
};

// 导入菜单数据
const importMenuData = async () => {
  ElMessageBox.confirm(
    '确认要导入完整的菜单数据吗？这将覆盖现有的菜单配置。',
    '确认导入',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await api.post('/api/system/menus/import', { menus: menuPermissions });
      ElMessage.success('菜单数据导入成功');
      loadMenus(); // 重新加载菜单数据
    } catch (error) {
      console.error('导入菜单数据失败:', error);
      ElMessage.error('导入菜单数据失败: ' + error.message);
    }
  }).catch(() => {});
};

// 展开所有节点
const expandAll = () => {
  if (!permissionTreeRef.value) {
    return;
  }

  try {
    // 使用Element Plus内置方法
    if (typeof permissionTreeRef.value.expandAll === 'function') {
      permissionTreeRef.value.expandAll();
    } else {
      // 手动展开所有节点
      const store = permissionTreeRef.value.store;
      if (store && store.nodesMap) {
        Object.keys(store.nodesMap).forEach(nodeId => {
          const node = store.nodesMap[nodeId];
          if (node && node.childNodes && node.childNodes.length > 0) {
            node.expanded = true;
          }
        });
      }
    }

    // 应用选中状态（使用 nextTick 代替定时器）
    nextTick(() => {
      forceApplyCheckedState();
    });

  } catch (error) {
    console.error('展开所有节点失败:', error);
  }
};

// 添加节点展开处理函数
const handleNodeExpand = (data, node) => {
  // 当节点展开时，重新检查选中状态
  setTimeout(() => {
    try {
      if (permissionTreeRef.value && selectedMenuIds.value && selectedMenuIds.value.length > 0) {
        const currentCheckedKeys = permissionTreeRef.value.getCheckedKeys();
        
        // 转换为数字格式，确保类型一致
        const numericCurrentKeys = ensureNumericIds(currentCheckedKeys);
        const numericSelectedKeys = ensureNumericIds(selectedMenuIds.value);
        
        // 检查是否有选中状态丢失
        const lostKeys = numericSelectedKeys.filter(id => !numericCurrentKeys.includes(id));
        
        // 如果有选中状态丢失，重新设置选中状态
        if (lostKeys.length > 0) {
          // 合并当前选中和应该选中的节点
          const mergedKeys = [...new Set([...numericCurrentKeys, ...numericSelectedKeys])];
          
          // 重新设置选中状态
          permissionTreeRef.value.setCheckedKeys(mergedKeys);
        }
      }
    } catch (err) {
      console.warn('节点展开后检查选中状态失败:', err);
    }
  }, 100);
};

// 修改权限对话框打开事件处理函数，处理精确选中问题
const onPermissionDialogOpened = async () => {
  // 显示加载提示
  const loading = ElLoading.service({
    lock: true,
    text: '正在加载菜单数据...',
    background: 'rgba(0, 0, 0, 0.7)'
  });

  try {
      // 检查菜单树数据是否有效，如果有效则不重新加载
      let needReloadMenus = false;
      
      if (!menuTree.value || !Array.isArray(menuTree.value) || menuTree.value.length === 0) {
        needReloadMenus = true;
      } else {
        // 检查是否有子节点
        let hasChildren = false;
        let childCount = 0;
        menuTree.value.forEach(node => {
          if (node.children && node.children.length > 0) {
            hasChildren = true;
            childCount += node.children.length;
          }
        });
        
        if (!hasChildren) {
          needReloadMenus = true;
        }
      }
      
      // 只有在必要时才重新加载菜单数据
      if (needReloadMenus) {
    await loadMenus();
    
        // 如果加载后菜单树仍为空，尝试从本地存储恢复
        if (!menuTree.value || !Array.isArray(menuTree.value) || menuTree.value.length === 0) {
          // 尝试从本地存储恢复
          const cachedMenus = localStorage.getItem('cachedMenus');
          if (cachedMenus) {
            try {
              const parsedMenus = JSON.parse(cachedMenus);
              if (Array.isArray(parsedMenus) && parsedMenus.length > 0) {
                menuList.value = parsedMenus;
                menuTree.value = convertToTree(parsedMenus);
              }
            } catch (error) {
              console.error('恢复缓存的菜单数据失败:', error);
            }
          }
        }
      }
      
      // 构建角色权限本地存储键
      const rolePermissionsKey = `role_permissions_${currentRole.value.id}`;
      
      // 优先级顺序: 
      // 1. 本地存储的角色权限(最新)
      // 2. 后端返回的角色权限(可能未更新)
      
      // 尝试从本地存储恢复角色权限
      let loadedFromCache = false;
      try {
        const savedPermissions = localStorage.getItem(rolePermissionsKey);
        if (savedPermissions) {
          const parsedData = JSON.parse(savedPermissions);
          
          // 检查是否有用户最近编辑过的数据
          if (parsedData.userEdited || parsedData.saveSuccess || parsedData.confirmed) {
            if (parsedData.checked && Array.isArray(parsedData.checked)) {
              // 确保ID是精确匹配的，不会自动选中同模块所有菜单
              selectedMenuIds.value = parsedData.checked.map(id => Number(id));
              halfCheckedMenuIds.value = (parsedData.halfChecked || []).map(id => Number(id));
              loadedFromCache = true;
            }
          } else if (parsedData.checked && Array.isArray(parsedData.checked) && parsedData.checked.length > 0) {
            // 使用普通缓存数据
            selectedMenuIds.value = parsedData.checked.map(id => Number(id));
            halfCheckedMenuIds.value = (parsedData.halfChecked || []).map(id => Number(id));
            loadedFromCache = true;
          }
        }
      } catch (err) {
        console.warn('从本地存储恢复角色权限失败:', err);
      }
      
      // 始终从后端获取最新的权限数据，确保数据一致性
      try {
        // 获取角色权限
        const response = await systemApi.getRolePermissions(currentRole.value.id);

        // API响应处理

        // 检查响应是否有效
        if (!response) {
          ElMessage.warning('获取角色权限失败：无响应');
          selectedMenuIds.value = [];
          halfCheckedMenuIds.value = [];
          return;
        }

        // 拦截器已解包，response.data 就是业务数据
        let permissionData = null;

        // 情况1：直接格式，响应就是数组
        if (Array.isArray(response.data)) {
          permissionData = response.data;
        }
        // 情况2：响应数据为null或undefined
        else if (response.data === null || response.data === undefined) {
          permissionData = [];
        }
        // 情况3：其他格式
        else {
          console.warn('未知的响应数据格式:', response.data);
          permissionData = [];
        }

        // 处理权限数据
        if (Array.isArray(permissionData)) {
          // 直接是菜单ID数组，需要过滤出叶子节点
          const allSelectedIds = permissionData.map(id => Number(id)).filter(id => !isNaN(id));

          // 🔧 重要修复：只选中叶子节点，避免父节点导致子节点自动全选
          const leafNodeIds = filterLeafNodes(allSelectedIds);

          // 使用叶子节点作为选中状态，树组件会自动计算父节点的半选状态
          selectedMenuIds.value = leafNodeIds;
          halfCheckedMenuIds.value = [];
        } else if (permissionData && typeof permissionData === 'object') {
          // 对象格式：包含完全选中和半选状态
          selectedMenuIds.value = (permissionData.checkedKeys || []).map(id => Number(id)).filter(id => !isNaN(id));
          halfCheckedMenuIds.value = (permissionData.halfCheckedKeys || []).map(id => Number(id)).filter(id => !isNaN(id));
        } else {
          // 无效数据
          selectedMenuIds.value = [];
          halfCheckedMenuIds.value = [];
        }

        // 权限数据获取完成

        // 清除旧的本地存储，避免数据不一致
        try {
          localStorage.removeItem(rolePermissionsKey);
        } catch (err) {
          console.warn('清除本地存储失败:', err);
        }

      } catch (error) {
        ElMessage.error('获取角色权限失败：' + (error.response?.data?.message || error.message));

        // 如果后端获取失败且有本地缓存，使用本地缓存
        if (!loadedFromCache) {
          selectedMenuIds.value = [];
          halfCheckedMenuIds.value = [];
        }
      }

      // 确保 selectedMenuIds 的值是普通数组而不是响应式Proxy对象
      if (selectedMenuIds.value && selectedMenuIds.value.length > 0) {
        // 克隆数组，消除Proxy包装
        const plainArray = [...selectedMenuIds.value].map(id => Number(id));
        selectedMenuIds.value = plainArray;
      }

      // 重置树渲染状态
      treeRenderFlag.value = false;

      // 使用新的key强制重新渲染树
      treeKey.value = Date.now();

      // 关闭加载提示
      loading.close();

      // 等待DOM更新完成后再处理树
      nextTick(() => {
        // 设置标志位表示可以渲染树了
        treeRenderFlag.value = true;

        // 等待树组件完成渲染后展开并应用选中状态
        nextTick(() => {
          expandAll();
          forceApplyCheckedState();
        });
      });

    } catch (error) {
      console.error('打开权限对话框时发生错误:', error);
      loading.close();
      ElMessage.error('加载菜单数据失败');
    }
};

// 在选中值处理部分添加一个专门处理菜单ID的函数
// 在convertToTree函数后面添加这个新函数
// 添加专门处理菜单ID的函数，确保ID类型一致性
const ensureNumericIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  
  // 过滤并转换所有ID为数字类型
  return ids.map(id => {
    const numId = Number(id);
    return !isNaN(numId) && numId > 0 ? numId : null;
  }).filter(id => id !== null);
};

// 🔧 提取公共函数：构建菜单映射关系
const buildMenuMaps = () => {
  const menuMap = {};
  const childrenMap = {};
  
  menuList.value.forEach(menu => {
    menuMap[menu.id] = menu;
    if (menu.parent_id) {
      if (!childrenMap[menu.parent_id]) {
        childrenMap[menu.parent_id] = [];
      }
      childrenMap[menu.parent_id].push(menu.id);
    }
  });
  
  return { menuMap, childrenMap };
};

// 🔧 提取公共函数：过滤出叶子节点（没有子节点的节点）
const filterLeafNodes = (selectedIds) => {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return [];
  }
  
  const { childrenMap } = buildMenuMaps();
  
  // 只保留叶子节点
  return selectedIds.filter(id => {
    const children = childrenMap[id] || [];
    return children.length === 0;
  });
};

// 🔧 计算树形结构的正确状态（完整选中 vs 半选中）
const calculateTreeState = (allSelectedIds) => {
  try {
    if (!Array.isArray(allSelectedIds) || !Array.isArray(menuList.value)) {
      return { checkedIds: allSelectedIds || [], halfCheckedIds: [] };
    }

    const checkedIds = [];
    const halfCheckedIds = [];

    // 使用公共函数构建菜单映射
    const { menuMap, childrenMap } = buildMenuMaps();

    // 遍历所有选中的权限
    allSelectedIds.forEach(id => {
      const menu = menuMap[id];
      if (!menu) return;

      // 检查是否有子菜单
      const children = childrenMap[id] || [];

      if (children.length === 0) {
        // 没有子菜单，直接添加到完整选中
        checkedIds.push(id);
      } else {
        // 有子菜单，检查子菜单的选中情况
        const selectedChildren = children.filter(childId => allSelectedIds.includes(childId));

        if (selectedChildren.length === 0) {
          // 没有子菜单被选中，说明用户直接选中了这个父菜单
          checkedIds.push(id);
        } else if (selectedChildren.length === children.length) {
          // 所有子菜单都被选中，父菜单应该是完整选中
          checkedIds.push(id);
        } else {
          // 部分子菜单被选中，父菜单应该是半选中
          halfCheckedIds.push(id);
        }
      }
    });

    return { checkedIds, halfCheckedIds };
  } catch (error) {
    return { checkedIds: allSelectedIds || [], halfCheckedIds: [] };
  }
};

// 优化的权限状态应用函数，减少重试警告
const forceApplyCheckedState = () => {
  try {
    if (!permissionTreeRef.value) {
      return;
    }

    if (!selectedMenuIds.value || !Array.isArray(selectedMenuIds.value)) {
      return;
    }

    // 确保ID格式一致
    const numericIds = ensureNumericIds(selectedMenuIds.value);

    if (numericIds.length === 0) {
      return;
    }

    // 直接设置选中状态
    permissionTreeRef.value.setCheckedKeys(numericIds);

    // 🔧 优化验证逻辑，减少不必要的重试
    setTimeout(() => {
      try {
        const currentChecked = permissionTreeRef.value.getCheckedKeys();
        const currentHalfChecked = permissionTreeRef.value.getHalfCheckedKeys();
        const totalSelected = [...currentChecked, ...currentHalfChecked];

        // 检查是否包含了所有必要的权限，而不是严格相等
        const missingIds = numericIds.filter(id => !totalSelected.includes(id));

        if (missingIds.length > 0 && missingIds.length < numericIds.length) {
          // 只有在确实缺少权限且不是全部缺少时才重试
          permissionTreeRef.value.setCheckedKeys(numericIds);
        }
      } catch (err) {
        // 静默处理验证错误，避免控制台警告
      }
    }, 150);

  } catch (err) {
    // 静默处理错误
  }
};

// 已移除未使用的updateParentNodeStatus函数

// 已移除未使用的saveCurrentTreeState函数

// 折叠所有节点
const collapseAll = () => {
  if (!permissionTreeRef.value) {
    return;
  }

  try {
    // 使用Element Plus内置方法
    if (typeof permissionTreeRef.value.collapseAll === 'function') {
      permissionTreeRef.value.collapseAll();
    } else {
      // 手动折叠所有节点
      const store = permissionTreeRef.value.store;
      if (store && store.nodesMap) {
        Object.keys(store.nodesMap).forEach(nodeId => {
          const node = store.nodesMap[nodeId];
          if (node && node.level === 1) { // 只折叠顶级节点
            node.expanded = false;
          }
        });
      }
    }
  } catch (error) {
    console.error('折叠所有节点失败:', error);
  }
};

// 刷新菜单树
const refreshMenuTree = async () => {
  try {
    // 显示加载提示
    const loading = ElLoading.service({
      lock: true,
      text: '正在刷新菜单数据...',
      background: 'rgba(0, 0, 0, 0.7)'
    });
    
    // 清除本地缓存，确保重新加载最新数据
    localStorage.removeItem('cachedMenus');
    
    // 重新加载菜单数据
    await loadMenus();
    
    // 如果菜单树仍然为空，但菜单列表有数据，则手动构建菜单树
    if ((!menuTree.value || menuTree.value.length === 0) && menuList.value && menuList.value.length > 0) {
      menuTree.value = convertToTree(menuList.value);
    }
    
    // 关闭加载提示
    loading.close();
    
    // 如果菜单树已加载，等待DOM更新后再展开所有节点
    if (menuTree.value && menuTree.value.length > 0) {
      // 使用nextTick确保DOM已更新
        nextTick(() => {
        // 添加延时，确保树组件已完全渲染
          setTimeout(() => {
          if (permissionTreeRef.value) {
              try {
                expandAll();
              ElMessage.success('菜单数据刷新成功');
              } catch (error) {
                // 展开失败不影响主流程
              }
            } else {
            ElMessage.success('菜单数据刷新成功，但无法自动展开节点');
            }
        }, 500); // 增加延迟时间，确保树组件已渲染完成
        });
      } else {
      ElMessage.error('菜单数据刷新失败，请检查网络或联系管理员');
    }
  } catch (error) {
    console.error('刷新菜单树失败:', error);
    ElMessage.error('刷新菜单树失败: ' + error.message);
  }
};

// 优化handleCheckChange函数，移除多余日志
const handleCheckChange = (data, checked, indeterminate) => {
  // 记录状态变更
  try {
    if (currentRole.value && currentRole.value.id) {
      const rolePermissionsKey = `role_permissions_${currentRole.value.id}`;
      
      const existingData = JSON.parse(localStorage.getItem(rolePermissionsKey) || '{}');
      
      // 标记为用户手动编辑过
      existingData.lastEditTime = Date.now();
      existingData.lastEditedNode = {
        id: data.id,
        name: data.name,
        checked: checked,
        indeterminate: indeterminate
      };
      existingData.userEdited = true;
      
      // 保存回本地存储
      localStorage.setItem(rolePermissionsKey, JSON.stringify(existingData));
    }
  } catch (err) {
    console.warn('记录节点状态变更失败:', err);
  }
};

// 优化handleTreeCheck函数，移除多余日志
const handleTreeCheck = () => {
  try {
    if (permissionTreeRef.value && currentRole.value && currentRole.value.id) {
      // 获取当前所有选中和半选状态
      const checkedKeys = permissionTreeRef.value.getCheckedKeys();
      const halfCheckedKeys = permissionTreeRef.value.getHalfCheckedKeys();
      
      // 确保数据类型一致
      const numericCheckedKeys = ensureNumericIds(checkedKeys);
      const numericHalfCheckedKeys = ensureNumericIds(halfCheckedKeys);
      
      // 保存当前选中状态到响应式变量，确保使用最新状态
      selectedMenuIds.value = numericCheckedKeys;
      halfCheckedMenuIds.value = numericHalfCheckedKeys;
      
      // 使用统一的key格式
      const rolePermissionsKey = `role_permissions_${currentRole.value.id}`;
      
      // 每次勾选变化时，立即保存到本地存储
      try {
        localStorage.setItem(rolePermissionsKey, JSON.stringify({
          checked: numericCheckedKeys,
          halfChecked: numericHalfCheckedKeys,
          timestamp: Date.now(),
          userEdited: true  // 标记为用户手动编辑
        }));
      } catch (err) {
        console.warn('保存选中状态失败:', err);
      }
    }
  } catch (err) {
    console.error('处理树节点选中状态失败:', err);
  }
};

// 页面加载时执行
onMounted(async () => {
  try {
    // 先加载角色列表
    await loadRoles();
    
    // 加载菜单数据
    await loadMenus();
    
    // 确保菜单树已正确初始化
    if (!Array.isArray(menuTree.value) || menuTree.value.length === 0) {
      setTimeout(async () => {
        await loadMenus();
      }, 1000);
      }
    } catch (error) {
    console.error('组件挂载时加载数据失败:', error);
    }
});
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

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-weight: 500;
  color: var(--color-text-primary);
}

.role-header, .menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.role-header h3, .menu-header h3 {
  margin: 0;
}

.current-role {
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: 500;
}

.permission-tips {
  margin-bottom: 15px;
}

.tips-content {
  margin-top: 5px;
}

.tips-content p {
  margin: 5px 0;
  font-size: 13px;
}

.permission-node {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.menu-type-tag {
  font-size: 12px;
  padding: 1px 6px;
  margin-left: 8px;
  border-radius: 3px;
}

.menu-type-tag.directory {
  background-color: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

.menu-type-tag.menu {
  background-color: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.menu-type-tag.button {
  background-color: #fff7e6;
  color: #fa8c16;
  border: 1px solid #ffd591;
}

.permission-code {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: 8px;
}

/* 添加半选状态的样式 */
:deep(.is-half-checked) .el-checkbox__input {
  background-color: #fff7e6 !important;
  border-color: #fa8c16 !important;
}

:deep(.is-half-checked) .el-checkbox__inner {
  background-color: #fff7e6 !important;
  border-color: #fa8c16 !important;
}

:deep(.is-half-checked) .el-tree-node__content {
  background-color: #fffbf2;
}

:deep(.is-half-checked) .permission-node:after {
  content: "(半选)";
  color: #fa8c16;
  font-size: 12px;
  margin-left: 5px;
}

.menu-header div {
  display: flex;
  gap: 10px;
}

.menu-icon {
  margin-right: 5px;
}

.mt-10 {
  margin-top: 10px;
}

.permission-examples {
  border: none;
  margin-top: 10px;
}

.example-content {
  padding: 5px;
  background-color: var(--color-bg-light);
  border-radius: var(--radius-sm);
}

.example-content h4 {
  margin: 0 0 10px 0;
  font-weight: 500;
  color: #1f2f3d;
}

.example-steps {
  padding-left: 10px;
  border-left: 2px solid #e6e6e6;
  margin-bottom: 10px;
}

.example-steps p {
  margin: 5px 0;
  font-size: 13px;
}

.example-result {
  background-color: var(--color-success-light);
  padding: 8px;
  border-radius: var(--radius-sm);
  margin-top: 10px;
}

.example-result p {
  margin: 0;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
}

.expand-icon {
  cursor: pointer;
  margin-right: 5px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-icon-placeholder {
  width: 16px;
  margin-right: 5px;
}

.expand-icon .is-expanded {
  transform: rotate(90deg);
  transition: transform 0.3s;
}

.menu-name {
  margin-right: 8px;
  font-weight: 500;
}

/* 添加鼠标悬停效果 */
:deep(.el-tree-node__content:hover) {
  background-color: var(--color-bg-hover);
}

/* 优化二级菜单样式 */
:deep(.el-tree-node.is-expanded .el-tree-node__children .el-tree-node__content) {
  padding-left: 20px !important;
  position: relative;
}

:deep(.el-tree-node.is-expanded .el-tree-node__children .el-tree-node__content::before) {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: #e6e6e6;
}

/* 注意：对话框基础样式已在全局主题中定义，这里只定义页面特定样式 */
:deep(.el-dialog__body) {
  max-height: 70vh;  /* 页面特定：确保能看到更多菜单项 */
  overflow-y: auto;
  /* padding 使用全局主题的 24px */
}

/* ========== 分配权限对话框样式 ========== */
.perm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.perm-toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.perm-role-label {
  font-size: 15px;
}

.perm-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.perm-actions-left {
  display: flex;
  gap: 8px;
}

.perm-actions-right {
  display: flex;
  gap: 8px;
}

.module-quick-list {
  max-height: 400px;
  overflow-y: auto;
}

.module-quick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.module-quick-item:hover {
  background-color: var(--color-bg-hover);
}

.module-quick-name {
  flex: 1;
  font-size: 13px;
}

.perm-tree-container {
  border: 1px solid var(--color-border-lighter);
  border-radius: 6px;
  padding: 8px;
  background-color: #fafafa;
  max-height: 55vh;
  overflow-y: auto;
}

.permission-menu-tree {
  background: transparent;
}

/* 权限节点样式 */
.perm-node {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 13px;
}

.perm-node__name {
  font-weight: 500;
}

.perm-node--type-2 .perm-node__name {
  font-weight: 400;
  color: var(--color-text-regular);
}

.perm-node__tag {
  flex-shrink: 0;
}

.perm-node__code {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  flex-shrink: 0;
}

.perm-node__select-all {
  margin-left: auto;
  font-size: 12px !important;
  flex-shrink: 0;
}

.perm-dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.perm-footer-stats {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 自定义树节点样式 */
:deep(.el-tree-node__content) {
  height: 36px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  margin: 2px 0;
  transition: background-color 0.3s;
}

:deep(.el-tree-node__content:hover) {
  background-color: var(--color-bg-hover);
}

/* 修复展开图标样式 */
:deep(.el-tree-node__expand-icon) {
  padding: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: transform 0.3s;
}

:deep(.el-tree-node__expand-icon.expanded) {
  transform: rotate(90deg);
}

/* 复选框样式优化 */
:deep(.el-checkbox) {
  margin-right: 8px;
}

:deep(.el-checkbox__input) {
  vertical-align: middle;
}

/* 子菜单缩进样式 */
:deep(.el-tree-node__children) {
  padding-left: 20px;
}

:deep(.el-tree-node__children .el-tree-node__content) {
  background-color: var(--color-bg-light);
  border-left: 2px solid #e6e6e6;
  margin-left: 8px;
  padding-left: 12px;
}

/* 三级菜单样式 */
:deep(.el-tree-node__children .el-tree-node__children .el-tree-node__content) {
  background-color: #f0f0f0;
  border-left: 2px solid #d9d9d9;
  margin-left: 16px;
}

.empty-tree-message {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 0;
  background-color: var(--color-bg-section);
  border-radius: var(--radius-sm);
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;
}

/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style> 