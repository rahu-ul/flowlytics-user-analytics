'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { configureDns } = require('./dns');
configureDns();

const { loadConfig } = require('./config');
const { connect } = require('./db');
const { createRepository } = require('./repository');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  const { client, events, ping } = await connect(config);
  const app = createApp({ repo: createRepository(events, { ping }), config });

  const server = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port} (db: ${config.dbName})`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
