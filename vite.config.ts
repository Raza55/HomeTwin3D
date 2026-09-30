// Modified for HomeTwin3D: independent hosting base and media proxy. See ORIGIN.md.
import { defineConfig, loadEnv } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createSharedStoreMiddleware } from './tools/shared-store-middleware.mjs';

export default defineConfig(({ mode, command }) => {
  // Personal settings are never included in the default public production build.
  const privatePath = '.private/installation.json';
  const local = (command === 'serve' || process.env.HOMETWIN_PRIVATE_BUILD === '1') && existsSync(privatePath)
    ? JSON.parse(readFileSync(privatePath, 'utf8')) : {};
  const basePath = mode === 'addon' ? './' : '/HomeTwin3D/';
  const env = loadEnv(mode, '.', '');
  const mediaProxyTarget = env.HA_MEDIA_PROXY_TARGET || local.mediaProxyTarget || 'http://homeassistant.local:8123';
  // Shared installation (config, model, objects) for every browser in the LAN.
  // Data stays in .private/shared; without HOMETWIN_SHARED_PIN it is read-only.
  const sharedStore = createSharedStoreMiddleware({ base: basePath, dir: '.private/shared', pin: env.HOMETWIN_SHARED_PIN });
  // LAN HTTPS for `vite preview` (Safari offers WebGPU only on secure pages).
  // Local certificate from tools/lan-https-cert.mjs; the iPad trusts its CA,
  // served at <base>hometwin-ca.crt. The dev server keeps plain HTTP.
  const tlsDir = '.private/tls';
  const lanTls = existsSync(`${tlsDir}/lan.key`) && existsSync(`${tlsDir}/lan.crt`)
    ? { key: readFileSync(`${tlsDir}/lan.key`), cert: readFileSync(`${tlsDir}/lan.crt`) } : undefined;

  return {
    base: basePath,
    // Build time in the perf overlay shows which bundle a device really runs (service worker caches).
    define: { __HOMETWIN_INSTALLATION__: JSON.stringify(local), __HOMETWIN_BUILD__: JSON.stringify(command === 'build' ? new Date().toLocaleString('sv-SE').slice(0, 16) : 'dev') },
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      react(),
      {
        name: 'hometwin-shared-store',
        configureServer(server) { server.middlewares.use(sharedStore); },
        configurePreviewServer(server) {
          server.middlewares.use(sharedStore);
          server.middlewares.use(`${basePath}hometwin-ca.crt`, (_req, res) => {
            if (!existsSync(`${tlsDir}/ca.crt`)) { res.statusCode = 404; res.end(); return; }
            res.setHeader('content-type', 'application/x-x509-ca-cert');
            res.end(readFileSync(`${tlsDir}/ca.crt`));
          });
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        // LAN builds change constantly; a cached app shell kept tablets on old
        // versions. Their service worker unregisters itself (and old ones) instead.
        selfDestroying: process.env.HOMETWIN_NO_SERVICE_WORKER === '1',
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
    preview: { https: lanTls },
    server: {
      port: 5187,
      strictPort: true,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.private/**'] },
      host: true,
      // QA output, private data and build artifacts are large and change outside the source tree.
      watch: { ignored: ['**/.qa/**', '**/.private/**', '**/dist/**', '**/dist-server/**'] },
      proxy: {
        // Same-origin Home Assistant WebSocket for HTTPS LAN builds (VITE_HA_WS_PROXY=1).
        '/HomeTwin3D/ha-ws': {
          target: mediaProxyTarget,
          ws: true,
          changeOrigin: true,
          rewrite: () => '/api/websocket',
        },
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
