import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiServerPlugin } from './src/vite-plugin-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  plugins: [apiServerPlugin()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 10000,
  },
});
