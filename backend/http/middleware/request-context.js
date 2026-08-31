const crypto = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('../../infrastructure/logger');

const safeRequestId = (value) => (
  typeof value === 'string' && /^[a-zA-Z0-9._:-]{8,128}$/.test(value)
    ? value
    : crypto.randomUUID()
);

const requestContext = pinoHttp({
  logger,
  genReqId(req, res) {
    const requestId = safeRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', requestId);
    return requestId;
  },
  customProps(req) {
    return { requestId: req.id };
  },
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url, remoteAddress: req.remoteAddress };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

module.exports = { requestContext, safeRequestId };
