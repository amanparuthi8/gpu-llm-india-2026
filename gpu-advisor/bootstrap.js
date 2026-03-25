#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const requiredModulePath = path.join(
  __dirname,
  'node_modules',
  '@mariozechner',
  'pi-ai',
  'package.json',
);

if (fs.existsSync(requiredModulePath)) {
  process.exit(0);
}

console.log('Installing app dependencies...');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCmd, ['install'], {
  cwd: __dirname,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
