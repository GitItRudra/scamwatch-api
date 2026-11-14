const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');

const config = require('./config/env');
const routes = require('./routes');
const limiters = require('./middleware/rateLimiters');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// Swagger UI needs inline scripts, so it is mounted before helmet's strict CSP applies
if (config.enableDocs) {
  const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'ScamWatch API' }));
}

app.use(helmet());
app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : !config.isProduction }));
app.use(compression());
if (!config.isTest) app.use(morgan(config.isProduction ? 'combined' : 'dev'));

app.use(express.json({ limit: '20kb' }));
app.use(mongoSanitize());
app.use(hpp());

app.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    database: connected ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.use('/api', limiters.api, routes);

// Demo front end: plain HTML, CSS and JS with no build step
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
