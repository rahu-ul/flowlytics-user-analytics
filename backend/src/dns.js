'use strict';

const dns = require('node:dns');

function configureDns(env = process.env) {
  const configuredServers = env.MONGODB_DNS_SERVERS;
  if (!configuredServers) return;

  const servers = configuredServers
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length === 0) {
    throw new Error('MONGODB_DNS_SERVERS must contain at least one DNS server');
  }

  try {
    dns.setServers(servers);
  } catch (err) {
    throw new Error(`Invalid MONGODB_DNS_SERVERS: ${err.message}`, { cause: err });
  }
}

module.exports = { configureDns };