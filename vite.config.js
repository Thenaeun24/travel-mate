import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'icons.svg',
      ],
      manifest: {
        name: '나만의 해외여행 메이트',
        short_name: '여행메이트',
        description: '여행 일정과 가계부를 한 곳에서 관리하는 나만의 해외여행 메이트',
        theme_color: '#7C3AED',
        background_color: '#F8F7BA',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'ko',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Only precache static build assets. Firebase realtime DB sockets,
        // Google Maps API calls, and exchange-rate fetches must hit the
        // network directly so they keep working when the app comes back online.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/__/],
        runtimeCaching: [
          {
            // Pretendard web font CDN — cache so PWA loads quickly offline
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Firebase Realtime Database — NEVER cache. Always go to network.
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/,
            handler: 'NetworkOnly',
          },
          {
            // Google Maps APIs — NEVER cache (API keys, signed URLs, freshness)
            urlPattern: /^https:\/\/(maps|maps-api-ssl)\.google(apis)?\.com\/.*/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/maps\.gstatic\.com\/.*/,
            handler: 'NetworkOnly',
          },
          {
            // Exchange rate API — short cache so it works offline briefly
            urlPattern: /^https:\/\/open\.er-api\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'exchange-rate-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 6, // 6 hours
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
