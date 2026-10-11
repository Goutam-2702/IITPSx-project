'use strict';

const express = require('express');

const { config } = require('../config');
const toolchain = require('../lib/toolchain');
const workspace = require('../lib/workspace');
const examples = require('../lib/examples');
const db = require('../db');

/*
 * routes/index.js - every endpoint.
 *
 * Shared rules:
 *   - a source over config.maxSourceBytes is rejected before any work
 *   - errors return a friendly message, never a stack trace
 *   - temp directories are removed in a finally block on every path
 */

const router = express.Router();

/* Wrap an async handler so a rejection becomes a clean 500, not a crash. */
function handle(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (!res.headersSent) {
        res.status(500).json({
          error: err && err.message ? err.message : 'something went wrong'
        });
      }
    });
  };
}

/* Validate the source field. Returns an error string, or null when fine. */
function validateSource(source) {
  if (typeof source !== 'string') {
    return 'the request needs a "source" field containing assembly text';
  }
  if (source.trim().length === 0) {
    return 'there is nothing to assemble';
  }
  if (Buffer.byteLength(source, 'utf8') > config.maxSourceBytes) {
    return (
      'the source is larger than the ' +
      Math.round(config.maxSourceBytes / 1024) +
      ' KB limit'
    );
  }
  return null;
}

/* ------------------------------------------------------------- health ---- */

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    projectRoot: config.projectRoot,
    database: { available: db.state.available, reason: db.state.reason }
  });
});

/* ----------------------------------------------------------- assemble ---- */

router.post(
  '/assemble',
  handle(async (req, res) => {
    const body = req.body || {};
    const invalid = validateSource(body.source);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const outcome = await toolchain.assemble(
      body.source,
      Boolean(body.dumpFormat),
      true
    );
    res.json(outcome.response);
  })
);

/* ---------------------------------------------------------------- run ---- */

router.post(
  '/run',
  handle(async (req, res) => {
    const body = req.body || {};
    const dir = workspace.get(body.objectFileId);
    if (!dir) {
      res.status(410).json({
        error:
          'that assembled program is no longer on the server. Assemble it again.'
      });
      return;
    }

    const result = await toolchain.run(dir, {
      trace: Boolean(body.trace),
      dumpBefore: Boolean(body.dumpBefore),
      dumpAfter: Boolean(body.dumpAfter)
    });
    res.json(result);
  })
);

/* --------------------------------------------------------- run-source ---- */

router.post(
  '/run-source',
  handle(async (req, res) => {
    const body = req.body || {};
    const invalid = validateSource(body.source);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const outcome = await toolchain.assemble(
      body.source,
      Boolean(body.dumpFormat),
      true
    );

    /* Assembly failed, so there is nothing to run. Report it as an assemble
     * result and let the UI show the errors in the gutter. */
    if (!outcome.response.success) {
      res.json({ assemble: outcome.response, run: null });
      return;
    }

    try {
      const run = await toolchain.run(outcome.dir, {
        trace: body.trace === undefined ? true : Boolean(body.trace),
        dumpBefore: Boolean(body.dumpBefore),
        dumpAfter: body.dumpAfter === undefined ? true : Boolean(body.dumpAfter)
      });
      res.json({ assemble: outcome.response, run: run });
    } catch (err) {
      await outcome.cleanup();
      throw err;
    }
  })
);

/* ---------------------------------------------------------- downloads ---- */

router.get(
  '/download/:objectFileId/:kind',
  handle(async (req, res) => {
    const dir = workspace.get(req.params.objectFileId);
    if (!dir) {
      res.status(410).json({
        error: 'that assembled program has expired. Assemble it again.'
      });
      return;
    }

    const kind = req.params.kind;
    if (kind === 'object') {
      const data = await toolchain.readObject(dir);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="program.o"');
      res.send(data);
      return;
    }
    if (kind === 'listing') {
      const text = await toolchain.readListing(dir);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="program.lst"');
      res.send(text);
      return;
    }
    res.status(400).json({ error: 'ask for either "object" or "listing"' });
  })
);

/* ----------------------------------------------------------- examples ---- */

router.get(
  '/examples',
  handle(async (req, res) => {
    const list = await examples.list();
    res.json(list);
  })
);

router.post(
  '/examples',
  handle(async (req, res) => {
    const body = req.body || {};
    const invalid = validateSource(body.source);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    const name = body.name || 'test' + String(Date.now()).slice(-4);
    const created = await examples.saveExample(name, body.source);
    res.status(201).json(created);
  })
);

/* ----------------------------------------------------------- programs ---- */

function requireDatabase(res) {
  if (!db.state.available) {
    res.status(503).json({
      error: db.state.reason,
      databaseAvailable: false
    });
    return false;
  }
  return true;
}

router.get(
  '/programs',
  handle(async (req, res) => {
    if (db.state.isCloud && db.state.firestore) {
      try {
        const snapshot = await db.state.firestore.collection('programs')
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get();
        
        const rows = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          rows.push({
            id: doc.id,
            title: data.title,
            source: data.source,
            createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
          });
        });
        res.json(rows);
        return;
      } catch (err) {
        console.warn('Cloud firestore get failed, using local store:', err.message);
        db.state.isCloud = false;
      }
    }

    const rows = Array.from(db.localStore.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(rows);
  })
);

router.post(
  '/programs',
  handle(async (req, res) => {
    const body = req.body || {};
    const invalid = validateSource(body.source);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    const title =
      typeof body.title === 'string' && body.title.trim().length > 0
        ? body.title.trim().slice(0, 120)
        : 'untitled';

    if (db.state.isCloud && db.state.firestore) {
      try {
        const { FieldValue } = require('firebase-admin/firestore');
        const docRef = await db.state.firestore.collection('programs').add({
          title: title,
          source: body.source,
          createdAt: FieldValue.serverTimestamp()
        });
        res.status(201).json({
          id: docRef.id,
          title: title,
          source: body.source,
          createdAt: new Date()
        });
        return;
      } catch (err) {
        console.warn('Cloud firestore save failed, using local store:', err.message);
        db.state.isCloud = false;
      }
    }

    const id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const item = {
      id: id,
      title: title,
      source: body.source,
      createdAt: new Date().toISOString()
    };
    db.localStore.set(id, item);
    res.status(201).json(item);
  })
);

router.delete(
  '/programs/:id',
  handle(async (req, res) => {
    const id = req.params.id;
    if (db.state.isCloud && db.state.firestore) {
      try {
        const docRef = db.state.firestore.collection('programs').doc(id);
        const doc = await docRef.get();
        if (doc.exists) {
          await docRef.delete();
          res.json({ ok: true });
          return;
        }
      } catch (err) {
        console.warn('Cloud firestore delete failed, checking local store:', err.message);
      }
    }

    if (db.localStore.has(id)) {
      db.localStore.delete(id);
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: 'there is no saved program with that id' });
    }
  })
);

module.exports = router;
