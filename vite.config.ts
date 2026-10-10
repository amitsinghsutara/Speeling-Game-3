/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new version waits; the app applies it only on the Welcome/level screens,
      // never in the middle of a child's puzzle (see src/pwa/status.ts).
      registerType: 'prompt',
      // Registration happens in src/pwa/register.ts so App can stay testable.
      injectRegister: null,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Spelling Adventure',
        short_name: 'Spelling',
        description: 'Listen, spell and explore the forest with Fern the fox.',
        lang: 'en',
        theme_color: '#8fdcff',
        background_color: '#8fdcff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything needed to play offline: app, content (bundled in JS), fonts, icons and all word audio.
        // woff2 only: every browser that supports service workers supports woff2.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
        navigateFallback: '/index.html',
        // The first worker takes control at once, so the first visit is already offline-ready.
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
