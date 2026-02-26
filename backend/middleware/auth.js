const jwt = require('jsonwebtoken');
const config = require('../config.env');

const parseCookies = (cookieHeader = '') => cookieHeader.split(';').reduce((acc, part) => {
  const [key, ...rest] = part.trim().split('=');
  if (!key) return acc;
  acc[key] = decodeURIComponent(rest.join('='));
  return acc;
}, {});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.token || bearerToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    return next();
  });
};

module.exports = { authenticateToken };
