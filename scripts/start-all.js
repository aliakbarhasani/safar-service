'use strict';

// Start the complete local application. In non-production environments,
// apply the idempotent SQL migration set before starting services.
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
  process.exitCode = exitCode;
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

function startServices() {
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

  console.log('[start-all] Started API Gateway, Marketplace, and Ads Service.');
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

const autoMigrateSetting = String(process.env.AUTO_MIGRATE || '').toLowerCase();
const shouldAutoMigrate = autoMigrateSetting === 'true'
  || (process.env.NODE_ENV !== 'production' && autoMigrateSetting !== 'false');

if (!shouldAutoMigrate) {
  console.log('[start-all] Automatic migrations are disabled; set AUTO_MIGRATE=true to run them explicitly.');
  startServices();
} else {
  const migrationPath = path.resolve(root, '00-infrastructure/database/migrations/run-all-migrations.js');
  console.log('[start-all] Applying database migrations before starting services...');
  const migration = spawn(process.execPath, [migrationPath], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(migration);

  migration.on('error', (error) => {
    console.error(`[start-all] Failed to start migration runner: ${error.message}`);
    stopAll(1);
  });

  migration.on('exit', (code, signal) => {
    if (stopping) return;
    const index = children.indexOf(migration);
    if (index >= 0) children.splice(index, 1);
    if (code !== 0) {
      console.error(`[start-all] Database migrations failed (code=${code}, signal=${signal || 'none'}); services were not started.`);
      stopAll(code || 1);
      return;
    }
    console.log('[start-all] Database migrations completed.');
    startServices();
  });
}
