import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number.parseInt(env.VITE_DEV_PORT || '3001', 10);
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:8080';
  const buildTime = env.VITE_BUILD_TIME || '';

  return {
    plugins: [
      vue(),
      mode === 'development' ? basicSsl() : null
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    define: {
      // 注入构建时间供 About.vue 使用
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime)
    },
    server: {
      port: Number.isNaN(devPort) ? 3001 : devPort,
      host: env.VITE_DEV_HOST || '0.0.0.0',
      // hmr config removed to let vite auto-detect
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/assets/styles/variables.scss" as *;`,
          silenceDeprecations: ['legacy-js-api', 'import']
        },
      },
    },
    esbuild: {
      // 生产构建时移除 console 和 debugger
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      minify: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            const normalizedId = id.replace(/\\/g, '/');
            if (/\/node_modules\/(vue|vue-router|pinia)\//.test(normalizedId)) {
              return 'vendor-vue';
            }
            if (normalizedId.includes('/node_modules/vant/')) {
              return 'vendor-vant';
            }
            if (normalizedId.includes('/node_modules/html5-qrcode/')) {
              return 'vendor-scan';
            }
            if (/\/node_modules\/(socket\.io-client|@socket\.io|engine\.io-client)\//.test(normalizedId)) {
              return 'vendor-realtime';
            }
            return undefined;
          },
        },
      },
    },
  };
});
