const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config.env');
const logger = require('../../infrastructure/logger');
const { cancelProviderRun } = require('../../infrastructure/cancel-provider-run');
const { appendCookie } = require('../middleware/csrf');
const { withErrorBoundary } = require('../middleware/error-boundary');
const { createWorkosAuthRouter } = require('./workos-auth');
const { authRateLimit, agentRateLimit } = require('../middleware/rate-limit');
const { authenticateToken } = require('../../middleware/auth');
const { validateRegister, validateLogin, validateSettingsPatch } = require('../../middleware/validate');
const { createUser, findUserForLogin, getSettings, getUser, updateProfile, updateSettings } = require('../../services/user-service');
const { deleteAccount } = require('../../services/account-deletion-service');

const router = express.Router();

const issueToken = (userId: any) => jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '24h' });

const setAuthCookie = (res: any, token: any) => {
  const secure = config.cookieSecure ? ' Secure;' : '';
  appendCookie(res, `token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400;${secure}`);
};

router.use('/api/auth', createWorkosAuthRouter({
  config,
  issueToken,
  setAuthCookie,
  rateLimit: authRateLimit,
  logger,
}));

router.post('/api/register', validateRegister, authRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const { email, password, name } = req.body;
  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await createUser({ email, hashedPassword, name });
    const token = issueToken(user.id);
    setAuthCookie(res, token);
    return res.json({ user });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account could not be created.' });
    }
    throw error;
  }
}));

router.post('/api/login', validateLogin, authRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const { email, password } = req.body;

  const user = await findUserForLogin(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const isValid = typeof user.password === 'string' && await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = issueToken(user.id);
  setAuthCookie(res, token);
  return res.json({ user: { id: user.id, email: user.email, name: user.name } });
}));

router.post('/api/logout', (_req: any, res: any) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0;');
  res.json({ message: 'Logged out.' });
});

router.get('/api/me', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  const user = await getUser(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
}));

router.get('/api/settings', authenticateToken, withErrorBoundary(async (req: any, res: any) => {
  return res.json({ settings: await getSettings(req.user.id) });
}));

router.patch('/api/settings', authenticateToken, validateSettingsPatch, withErrorBoundary(async (req: any, res: any) => {
  return res.json({ settings: await updateSettings({ userId: req.user.id, patch: req.body }) });
}));


router.patch('/api/profile', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'Display name must be 2-100 characters.', code: 'VALIDATION_FAILED' });
  }
  const user = await updateProfile({ userId: req.user.id, name });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
}));


router.delete('/api/account', authenticateToken, agentRateLimit, withErrorBoundary(async (req: any, res: any) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) return res.status(400).json({ error: 'Password confirmation is required.' });
  const result = await deleteAccount({
    userId: req.user.id,
    password,
    verifyPassword: bcrypt.compare,
    cancelProviderRun,
  });
  if (result.reauthRequired) {
    return res.status(409).json({ error: 'Provider reauthentication is required before account deletion.', code: 'PROVIDER_REAUTH_REQUIRED' });
  }
  if (!result.verified) return res.status(403).json({ error: 'Password confirmation failed.' });
  appendCookie(res, `token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0;${config.cookieSecure ? ' Secure;' : ''}`);
  return res.json({ message: 'Account deleted.' });
}));

export = router;
