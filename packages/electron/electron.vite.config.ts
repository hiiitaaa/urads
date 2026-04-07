import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: 'app/main.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-log'] })],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: 'app/preload.ts',
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: 'src',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: 'src/index.html',
      },
    },
  },
});
