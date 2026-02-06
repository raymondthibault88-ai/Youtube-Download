const { spawn } = require('node:child_process');
const electronBinary = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.VITE_DEV_SERVER_URL = 'http://localhost:5173';

const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
  env
});

child.on('error', (error) => {
  console.error('Impossible de lancer Electron en mode dev:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
