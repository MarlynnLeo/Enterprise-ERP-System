<template>
  <el-main class="main-content">
    <router-view />
  </el-main>
</template>

<!-- Keep the route outlet behind a component with no shell-state props or
     dynamic slots. Sidebar toggles must not rerender a dense business table;
     RouterView still reacts to navigation and children to their own stores. -->
