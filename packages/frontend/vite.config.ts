/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'

const rootModules = path.resolve(__dirname, '../../node_modules')

// Source-map upload + release creation. Active only when SENTRY_AUTH_TOKEN is set
// (CI / Vercel build env), so local and dev builds are unaffected.
const sentryPlugins: PluginOption[] = process.env.SENTRY_AUTH_TOKEN
  ? [
      sentryVitePlugin({
        org: process.env.SENTRY_ORG ?? 'lucas-santana-gm',
        project: process.env.SENTRY_PROJECT ?? 'lucky',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        telemetry: false,
        release: {
          name:
            process.env.VITE_SENTRY_RELEASE ?? process.env.VITE_COMMIT_SHA,
        },
        // Upload maps for symbolication, then strip them so they are not served.
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      }),
    ]
  : []

const manualChunkGroups: Array<{ name: string; packages: string[] }> = [
  {
    name: 'vendor-react',
    packages: ['react', 'react-dom', 'react-router-dom'],
  },
  {
    name: 'vendor-radix',
    packages: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-switch',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-slot',
    ],
  },
  {
    name: 'vendor-state',
    packages: ['zustand', '@tanstack/react-query', 'axios'],
  },
  {
    name: 'vendor-ui',
    packages: [
      'framer-motion',
      'lucide-react',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'sonner',
    ],
  },
  {
    name: 'vendor-forms',
    packages: ['react-hook-form', '@hookform/resolvers', 'zod'],
  },
]

export default defineConfig({
  base: process.env.NODE_ENV === 'development' ? '/' : process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    ...sentryPlugins,
    visualizer({
      open: false,
      filename: 'dist/bundle-analysis.html',
      title: 'Lucky Frontend Bundle Analysis',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react': path.resolve(rootModules, 'react'),
      'react-dom': path.resolve(rootModules, 'react-dom'),
      'react/jsx-runtime': path.resolve(rootModules, 'react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(rootModules, 'react/jsx-dev-runtime'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          for (const group of manualChunkGroups) {
            if (group.packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
              return group.name
            }
          }

          return undefined
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        '**/components/ui/avatar.tsx',
        '**/components/ui/badge.tsx',
        '**/components/ui/checkbox.tsx',
        '**/components/ui/dialog.tsx',
        '**/components/ui/dropdown-menu.tsx',
        '**/components/ui/input.tsx',
        '**/components/ui/label.tsx',
        '**/components/ui/scroll-area.tsx',
        '**/components/ui/select.tsx',
        '**/components/ui/sonner.tsx',
        '**/components/ui/switch.tsx',
      ],
      thresholds: {
        statements: 85.3,
        branches: 76,
        functions: 79.3,
        lines: 87.3,
      },
    },
  },
})
