const config = require('../../config.env');
const logger = require('../../infrastructure/logger');

const withErrorBoundary = (handler: any) => async (req: any, res: any) => {
  try {
    await handler(req, res);
  } catch (error: any) {
    (req.log || logger).error({ err: error, requestId: req.id }, 'Unhandled API request error');
    if (error.code === 'RESOURCE_NOT_FOUND') return res.status(404).json({ error: error.message, code: error.code });
    if (error.code === 'IDEMPOTENCY_CONFLICT') return res.status(409).json({ error: error.message, code: error.code });
    const message = config.isProduction ? 'An unexpected error occurred.' : (error.message || 'Unexpected server error.');
    return res.status(500).json({ error: message, requestId: req.id });
  }
};

module.exports = { withErrorBoundary };
