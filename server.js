const app = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { connectDatabase, disconnectDatabase } = require('./src/config/db');

async function start() {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    logger.info(`ScamWatch API listening on port ${config.port} (${config.env})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Do not hang forever on stuck connections
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server', err.message);
  process.exit(1);
});
