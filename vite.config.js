import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': '{}',
    'process': '{}',
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
  },
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'STPresetManager',
      fileName: 'index',
      formats: ['iife'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: true,
  },
})
