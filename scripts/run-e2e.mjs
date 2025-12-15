import { spawn } from 'node:child_process';
import net from 'node:net';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const HOST = process.env.E2E_HOST || '127.0.0.1';
const PORT = Number(process.env.E2E_PORT || 5173);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

function spawnProcess(command, args, extraEnv = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv
    }
  });
}

function waitForPort(host, port, timeoutMs = 30_000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });

      const onError = () => {
        socket.removeAllListeners();
        socket.destroy();

        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }

        setTimeout(tryConnect, 250);
      };

      socket.once('error', onError);
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
    };

    tryConnect();
  });
}

async function main() {
  console.log(`\n🧪 e2e: compiling test files...`);
  const compile = spawnProcess(npmCmd, ['run', 'test:e2e:compile']);
  const compileExitCode = await new Promise((resolve) => compile.once('exit', resolve));
  if (compileExitCode !== 0) process.exit(Number(compileExitCode ?? 1));

  console.log(`\n🚀 e2e: starting Vite dev server on ${HOST}:${PORT}...`);
  const vite = spawnProcess(
    npmCmd,
    ['run', 'dev', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
    { BASE_URL }
  );

  const shutdown = async (code = 0) => {
    if (vite && !vite.killed) {
      vite.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1500));
      if (!vite.killed) vite.kill('SIGKILL');
    }
    process.exit(code);
  };

  process.once('SIGINT', () => shutdown(130));
  process.once('SIGTERM', () => shutdown(143));

  try {
    await waitForPort(HOST, PORT, 30_000);
    console.log(`\n✅ e2e: dev server is up. Running tests against ${BASE_URL}...\n`);

    const test = spawnProcess(npmCmd, ['run', 'test:e2e:runner'], { BASE_URL });
    const testExitCode = await new Promise((resolve) => test.once('exit', resolve));
    await shutdown(Number(testExitCode ?? 1));
  } catch (err) {
    console.error(`\n❌ e2e: ${err?.message || err}`);
    await shutdown(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
