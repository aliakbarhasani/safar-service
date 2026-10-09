'use strict';

// Start the API gateway and the two services it proxies to.
// npm start now represents the complete local application, not only the gateway.
const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const services = [
  { name: 'api-gateway', entry: 'server.js' },
  { name: 'marketplace', entry: '09-marketplace/run-server.js' },
  { name: 'ads-service', entry: '10-ads-service/run-server.js' },
];

const children = [];
let stopping = false;

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      try { child.kill('SIGTERM'); } catch (_) { /* already exited */ }
    }
  }
  const forceStop = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) {
        try { child.kill('SIGKILL'); } catch (_) { /* already exited */ }
      }
    }
    process.exit(exitCode);
  }, 5000);
  if (typeof forceStop.unref === 'function') forceStop.unref();
}

for (const service of services) {
  const entryPath = path.resolve(root, service.entry);
  const child = spawn(process.execPath, [entryPath], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(child);

  child.on('error', (error) => {
    console.error(`[start-all] Failed to start ${service.name}: ${error.message}`);
    stopAll(1);
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[start-all] ${service.name} exited unexpectedly (code=${code}, signal=${signal || 'none'}).`);
    stopAll(code || 1);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

console.log('[start-all] Started API Gateway, Marketplace, and Ads Service.');
