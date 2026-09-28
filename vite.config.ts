// Modified for HomeTwin3D: independent hosting base and media proxy. See ORIGIN.md.
import { defineConfig, loadEnv } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode, command }) => {
  // Personal settings are never included in the default public production build.
  const privatePath = '.private/installation.json';
  const local = (command === 'serve' || process.env.HOMETWIN_PRIVATE_BUILD === '1') && existsSync(privatePath)
    ? JSON.parse(readFileSync(privatePath, 'utf8')) : {};
  const basePath = mode === 'addon' ? './' : '/HomeTwin3D/';
  const mediaProxyTarget = loadEnv(mode, '.', '').HA_MEDIA_PROXY_TARGET || local.mediaProxyTarget || 'http://homeassistant.local:8123';

  return {
    base: basePath,
    define: { __HOMETWIN_INSTALLATION__: JSON.stringify(local) },
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // Use the existing manifest files in public/.
        manifest: false,
        workbox: {
          // Keep install-time caching light; 3D chunks are runtime-cached on demand.
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          globIgnores: [
            '**/vendor-babylon-*.js',
            '**/Dashboard-*.js',
            '**/ConfigEditor-*.js',
            '**/lucide-*.js',
          ],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          runtimeCaching: [
            {
              // Icon chunks are immutable and must not evict the main app chunks.
              urlPattern: /\/assets\/lucide-.*\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'lucide-icon-cache',
                expiration: { maxEntries: 1800, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Cache lazily loaded JS chunks after first use.
              urlPattern: /\/assets\/.*\.js$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'js-chunk-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Cache images/icons.
              urlPattern: /\.(?:png|jpg|jpeg|webp|ico)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          navigateFallback: `${basePath}index.html`,
        },
      }),
    ],
    build: {
      modulePreload: {
        resolveDependencies(_url, deps) {
          return deps.filter((dep) =>
            !dep.includes('vendor-babylon-') &&
            !dep.includes('Dashboard-') &&
            !dep.includes('ConfigEditor-')
          );
        },
      },
      rollupOptions: {
        output: {
          chunkFileNames(chunk) {
            const id = chunk.facadeModuleId?.replace(/\\/g, '/') ?? '';
            return chunk.isDynamicEntry && id.includes('/lucide-react/')
              ? 'assets/lucide-[name]-[hash].js'
              : 'assets/[name]-[hash].js';
          },
          manualChunks(id) {
            if (id.includes('node_modules/@babylonjs/')) {
              return 'vendor-babylon';
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
          },
        },
      },
    },
    server: {
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.private/**'] },
      host: true,
      proxy: {
        '^/HomeTwin3D/ha-camera/camera\\.[a-z0-9_]+(?:\\?|$)': {
          target: mediaProxyTarget,
          changeOrigin: true,
          rewrite: path => path.replace('/HomeTwin3D/ha-camera/', '/api/camera_proxy/'),
          configure(proxy) {
            proxy.on('proxyReq', req => {
              req.removeHeader('authorization');req.removeHeader('cookie');req.removeHeader('referer');
            });
            proxy.on('proxyRes', response => { response.headers['cache-control'] = 'no-store'; });
          },
        },
        '^/HomeTwin3D/ha-media/media_player\\.[a-z0-9_]+(?:\\?|$)': {
          target: mediaProxyTarget,
          changeOrigin: true,
          rewrite: path => path.replace('/HomeTwin3D/ha-media/', '/api/media_player_proxy/'),
          configure(proxy) {
            proxy.on('proxyReq', req => {
              req.removeHeader('authorization');
              req.removeHeader('cookie');
              req.removeHeader('referer');
            });
            proxy.on('proxyRes', response => { response.headers['cache-control'] = 'no-store'; });
          },
        },
      },
    },
  };
});
