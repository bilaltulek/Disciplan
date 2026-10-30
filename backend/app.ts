const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config.env');
const { requestContext } = require('./http/middleware/request-context');
const { csrfProtection } = require('./http/middleware/csrf');
const accountRoutes = require('./http/routes/account');
const agentRoutes = require('./http/routes/agent');
const studyRoutes = require('./http/routes/study');

const app = express();
app.use(helmet());
app.use(requestContext);
app.use(cors({
  origin(origin: any, callback: any) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-CSRF-Token', 'X-Request-ID'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(csrfProtection);
app.get('/api/health', (_req: any, res: any) => res.status(200).json({ status: 'ok' }));
app.use(accountRoutes, agentRoutes, studyRoutes);

export = app;
