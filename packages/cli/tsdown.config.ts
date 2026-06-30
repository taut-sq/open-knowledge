import { createRequire } from 'node:module';
import { defineConfig } from 'tsdown';

const jsoncParserEsmEntry = createRequire(import.meta.url).resolve('jsonc-parser/lib/esm/main.js');

const dtsEmitFallbackNotice = '[rolldown-plugin-dts] Warning: Failed to emit declaration file';
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith(dtsEmitFallbackNotice)) {
    return;
  }
  originalWarn(...args);
};

export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  unbundle: false,
  format: 'esm',
  dts: true,
  clean: true,
  minify: true,
  plugins: [
    {
      name: 'jsonc-parser-esm-entry',
      resolveId(id) {
        return id === 'jsonc-parser' ? jsoncParserEsmEntry : null;
      },
    },
  ],
  inputOptions: (options) => {
    options.onLog = (level, log, defaultHandler) => {
      if (
        log.code === 'EVAL' &&
        typeof log.id === 'string' &&
        log.id.includes('/@protobufjs/inquire/')
      ) {
        return;
      }
      if (
        log.code === 'MISSING_EXPORT' &&
        typeof log.id === 'string' &&
        (log.id.endsWith('/src/commands/init.d.ts') || log.id.endsWith('/src/config/schema.d.ts'))
      ) {
        return;
      }
      if (
        log.pluginCode === 'rolldown-plugin-dts' &&
        typeof log.message === 'string' &&
        log.message.includes('Failed to emit declaration file')
      ) {
        return;
      }
      defaultHandler(level, log);
    };
    return options;
  },
  deps: {
    neverBundle: ['@parcel/watcher', '@napi-rs/keyring', '@inkeep/open-knowledge-native-config'],
    alwaysBundle: [
      /^@inquirer\/checkbox(\/|$)/,
      /^@inquirer\/password(\/|$)/,
      /^@inquirer\/select(\/|$)/,
      /^@modelcontextprotocol\/sdk(\/|$)/,
      /^@octokit\/auth-oauth-device(\/|$)/,
      /^@octokit\/request(\/|$)/,
      /^@octokit\/rest(\/|$)/,
      /^cli-boxes(\/|$)/,
      /^commander(\/|$)/,
      /^jsonc-parser(\/|$)/,
      /^just-bash(\/|$)/,
      /^picocolors(\/|$)/,
      /^picomatch(\/|$)/,
      /^pino(\/|$)/,
      /^shell-quote(\/|$)/,
      /^simple-git(\/|$)/,
      /^sirv(\/|$)/,
      /^smol-toml(\/|$)/,
      /^yaml(\/|$)/,
      /^yazl(\/|$)/,
      /^zod(\/|$)/,
    ],
  },
});
