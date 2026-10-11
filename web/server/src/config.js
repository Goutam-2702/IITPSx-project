'use strict';

const path = require('path');
const fs = require('fs');

/*
 * config.js - every tunable in one place.
 *
 * IITPSX_ROOT is the root of the C project, the directory that holds the
 * Makefile, bin/, and tests/. By default it is resolved two levels up from
 * web/server, which is correct when this app lives at <project>/web.
 */

const serverDir = path.resolve(__dirname, '..');
const defaultRoot = path.resolve(serverDir, '..', '..');

const projectRoot = process.env.IITPSX_ROOT
  ? path.resolve(process.env.IITPSX_ROOT)
  : defaultRoot;

function getBinaryPath(name) {
  if (process.platform === 'win32') {
    const exePath = path.join(projectRoot, 'bin', name + '.exe');
    if (fs.existsSync(exePath)) return exePath;
  }
  return path.join(projectRoot, 'bin', name);
}

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  projectRoot: projectRoot,
  asmPath: getBinaryPath('asm'),
  emuPath: getBinaryPath('emu'),
  testsDir: path.join(projectRoot, 'tests'),

  /* Limits. A source larger than this is rejected before any work happens. */
  maxSourceBytes: 100 * 1024,
  toolTimeoutMs: 5000,
  maxOutputBytes: 4 * 1024 * 1024,
  maxTraceSteps: 20000,

  /* How long an assembled workspace stays available for /api/run. */
  workspaceTtlMs: 5 * 60 * 1000,

  mongoUri: process.env.MONGODB_URI || '',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

/* Report missing binaries once at startup rather than per request. */
function checkToolchain() {
  const missing = [];
  [['asm', config.asmPath], ['emu', config.emuPath]].forEach((entry) => {
    try {
      fs.accessSync(entry[1], fs.constants.X_OK);
    } catch (err) {
      missing.push(entry[0]);
    }
  });
  return missing;
}

module.exports = { config, checkToolchain };
