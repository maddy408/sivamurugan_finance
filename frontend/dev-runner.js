import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '../backend');

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function start() {
  const isWin = process.platform === 'win32';
  const phpRunning = await isPortOpen(8000);
  let phpProc = null;

  if (!phpRunning) {
    console.log('\x1b[36m[Backend]\x1b[0m Starting PHP API server on http://127.0.0.1:8000 ...');
    phpProc = spawn('php', ['-S', '0.0.0.0:8000', '-t', 'public', 'public/router.php'], {
      cwd: backendDir,
      stdio: 'inherit',
    });

    phpProc.on('error', (err) => {
      console.error('\x1b[31m[Backend Error]\x1b[0m Failed to start PHP server:', err.message);
      console.log('Ensure PHP is in your system PATH or run backend manually.');
    });
  } else {
    console.log('\x1b[32m[Backend]\x1b[0m PHP API server is already active on http://127.0.0.1:8000');
  }

  // Start Vite
  const viteBin = path.resolve(__dirname, 'node_modules/vite/bin/vite.js');
  let viteProc;
  if (fs.existsSync(viteBin)) {
    viteProc = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
      cwd: __dirname,
      stdio: 'inherit',
    });
  } else {
    viteProc = spawn(isWin ? 'npx.cmd' : 'npx', ['vite', ...process.argv.slice(2)], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: isWin,
    });
  }

  viteProc.on('error', (err) => {
    console.error('\x1b[31m[Vite Error]\x1b[0m Failed to start Vite:', err.message);
  });

  viteProc.on('exit', (code) => {
    cleanup();
  });

  const cleanup = () => {
    if (phpProc) {
      try { phpProc.kill(); } catch {}
    }
    if (viteProc) {
      try { viteProc.kill(); } catch {}
    }
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
}

start();
