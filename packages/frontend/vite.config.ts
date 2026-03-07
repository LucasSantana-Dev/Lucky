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
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
