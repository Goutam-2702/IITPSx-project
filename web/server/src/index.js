'use strict';
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { config, checkToolchain } = require('./config');
const routes = require('./routes');
const workspace = require('./lib/workspace');
const db = require('./db');

/*
 * index.js - the Express app.
 *
 * Startup order: report any missing binaries, try MongoDB (optional), mount
 * the routes, start the temp-directory sweeper, listen.
 */

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: config.maxSourceBytes + 1024 }));

/* A malformed JSON body should read as a plain message, not a stack trace. */
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({
      error:
        'that request is larger than the ' +
        Math.round(config.maxSourceBytes / 1024) +
        ' KB limit'
    });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'the request body was not valid JSON' });
    return;
  }
  next(err);
});

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ error: 'no such endpoint: ' + req.method + ' ' + req.path });
});

/* Last-resort handler so nothing ever leaks a stack trace to the client. */
/* eslint-disable-next-line no-unused-vars */
app.use((err, req, res, next) => {
  if (!res.headersSent) {
    res.status(500).json({
      error: err && err.message ? err.message : 'something went wrong'
    });
  }
});

async function start() {
  const missing = checkToolchain();
  if (missing.length > 0) {
    console.warn(
      '\n  WARNING: bin/' +
        missing.join(' and bin/') +
        ' not found or not executable.\n' +
        '  Run `make` in ' +
        config.projectRoot +
        ' before assembling anything.\n'
    );
  }

  await db.connect();
  workspace.startSweeper();

  const server = app.listen(config.port, () => {
    console.log('  IITPSx server listening on http://localhost:' + config.port);
    console.log('  project root : ' + config.projectRoot);
    console.log(
      '  database     : ' +
        (db.state.available ? 'connected, saving enabled' : db.state.reason)
    );
  });

  const shutdown = async () => {
    server.close();
    await workspace.destroyAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  start();
}

module.exports = { app: app, start: start };
