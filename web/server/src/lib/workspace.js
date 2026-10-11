'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { config } = require('../config');

/*
 * workspace.js - a unique temp directory per request, with cleanup.
 *
 * An assembled workspace is kept for a short while so that /api/run can use
 * the object file produced by a previous /api/assemble. A sweeper removes
 * anything older than the TTL, so a client that never calls run cannot leave
 * files behind.
 */

const registry = new Map();

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

/* Create a fresh directory and return { id, dir }. */
async function create() {
  const id = newId();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'iitpsx-'));
  registry.set(id, { dir: dir, createdAt: Date.now() });
  return { id: id, dir: dir };
}

/* Look up a live workspace. Returns null when unknown or expired. */
function get(id) {
  if (typeof id !== 'string') {
    return null;
  }
  const entry = registry.get(id);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.createdAt > config.workspaceTtlMs) {
    return null;
  }
  return entry.dir;
}

/* Remove a workspace now. Never throws. */
async function destroy(id) {
  const entry = registry.get(id);
  registry.delete(id);
  if (!entry) {
    return;
  }
  try {
    await fs.rm(entry.dir, { recursive: true, force: true });
  } catch (err) {
    /* A temp directory that will not delete is not worth failing a request. */
  }
}

/* Delete a directory that was never registered (used by one-shot requests). */
async function destroyDir(dir) {
  if (!dir) {
    return;
  }
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    /* ignore */
  }
}

let sweeper = null;

function startSweeper() {
  if (sweeper) {
    return;
  }
  sweeper = setInterval(() => {
    const cutoff = Date.now() - config.workspaceTtlMs;
    registry.forEach((entry, id) => {
      if (entry.createdAt < cutoff) {
        destroy(id);
      }
    });
  }, 60 * 1000);
  sweeper.unref();
}

async function destroyAll() {
  const ids = Array.from(registry.keys());
  await Promise.all(ids.map(destroy));
}

module.exports = {
  create: create,
  get: get,
  destroy: destroy,
  destroyDir: destroyDir,
  startSweeper: startSweeper,
  destroyAll: destroyAll
};
