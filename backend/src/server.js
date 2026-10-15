'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { configureDns } = require('./dns');
configureDns();

const { loadConfig } = require('./config');
const { connect } = require('./db');
const { createRepository } = require('./repository');
const { createServer } = require('./createServer');
const { createShutdown } = require('./shutdown');

async function main() {
  const config = loadConfig();
  const { client, events, ping } = await connect(config);
  // One HTTP server serves Express and Socket.IO. config.port comes from process.env.PORT (Render) or 4000.
  const service = createServer({ repo: createRepository(events, { ping }), config });
  await service.listen(config.port);
  console.log(`API listening on http://localhost:${config.port} (db: ${config.dbName})`);
  console.log('Socket.IO listening on /socket.io (read-only dashboard broadcast)');

  const shutdown = createShutdown({
    steps: [
      ['http+socket.io', () => service.close()], // stop new work and drain in-flight requests first,
      ['mongodb', () => client.close()], //         then close the database they were using
    ],
  });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
