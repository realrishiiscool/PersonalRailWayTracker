import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const node = process.execPath;
const children = [];
let shuttingDown = false;

function start(label, script, args = []) {
  const child = spawn(node, [script, ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(child);
  child.on('error', error => {
    console.error(`[${label}] failed to start: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[${label}] stopped${signal ? ` (${signal})` : ` (exit ${code})`}`);
      shutdown(code || 0);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  const port = Number(process.env.PORT || 4000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) throw new Error(`API health returned HTTP ${response.status}`);
    const health = await response.json();
    if (health.status !== 'ok') throw new Error('Another service is using the API port');
    console.log(`[API] using existing service at http://127.0.0.1:${port}`);
  } catch {
    start('API', 'server/index.js');
  }
  start('Vite', 'node_modules/vite/bin/vite.js');
}

main().catch(error => {
  console.error(error.message);
  shutdown(1);
});
