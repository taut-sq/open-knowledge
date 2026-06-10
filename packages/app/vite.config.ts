import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { injectAppVersionEnv } from './src/build/app-version';
import { chromeTokensVitePlugin } from './src/build/chrome-tokens-vite-plugin';
import { rejectionLoopGuardPlugin } from './src/build/rejection-loop-guard-plugin';
import { hocuspocusPlugin } from './src/server/hocuspocus-plugin';
import { RENDERER_DEDUPE } from './vite.dedupe';
import { RENDERER_BABEL_OPTIONS } from './vite.react-babel';

injectAppVersionEnv();

const vitePort = process.env.VITE_PORT ? Number.parseInt(process.env.VITE_PORT, 10) : undefined;

const viteCacheDir = process.env.OK_TEST_VITE_CACHE_DIR;

export default defineConfig({
  base: './',
  cacheDir: viteCacheDir,
  optimizeDeps: {
    entries: ['index.html'],
  },
  plugins: [
    rejectionLoopGuardPlugin(),
    chromeTokensVitePlugin(),
    react(),
    babel(RENDERER_BABEL_OPTIONS),
    hocuspocusPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: [...RENDERER_DEDUPE],
  },
  server: {
    port: vitePort ?? 5173,
    strictPort: vitePort !== undefined,
    watch: {
      ignored: ['**/content/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        if (
          log.code === 'EVAL' &&
          typeof log.id === 'string' &&
          log.id.includes('/@protobufjs/inquire/')
        ) {
          return;
        }
        if (log.code === 'PLUGIN_TIMINGS') {
          return;
        }
        defaultHandler(level, log);
      },
    },
  },
});
