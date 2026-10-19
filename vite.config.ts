import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  publicDir: mode === 'content' ? false : 'public',
  build: {
    target: 'chrome120',
    emptyOutDir: mode !== 'content',
    lib: {
      entry: mode === 'content' ? 'src/content/inspector.ts' : 'src/background.ts',
      name: 'ContrastInspector',
      formats: mode === 'content' ? ['iife'] : ['es'],
      fileName: () => mode === 'content' ? 'inspector.js' : 'background.js',
    },
  },
}));
