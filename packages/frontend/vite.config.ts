/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootModules = path.resolve(__dirname, '../../node_modules')

export default defineConfig({
  base: process.env.NODE_ENV === 'development' ? '/' : process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
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
    host: true,
    port: 5173,
    strictPort: true,
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
        manualChunks: {
          'vendor-react': [
            'react',
            'react-dom',
            'react-router-dom',
          ],
          'vendor-radix': [
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
          'vendor-state': [
            'zustand',
            '@tanstack/react-query',
            'axios',
          ],
          'vendor-ui': [
            'framer-motion',
            'lucide-react',
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
            'sonner',
          ],
          'vendor-forms': [
            'react-hook-form',
            '@hookform/resolvers',
            'zod',
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
