import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Short commit hash, so a phone can tell which build it is actually running. */
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit()),
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
