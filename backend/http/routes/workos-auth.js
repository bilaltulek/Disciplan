const express = require('express');
const { parseCookies } = require('../../middleware/auth');
const { appendCookie } = require('../middleware/csrf');
const authService = require('../../services/workos-auth-service');

const OAUTH_STATE_COOKIE = 'disciplan_oauth_state';
const OAUTH_STATE_MAX_AGE_SECONDS = 600;
const allowedProviders = new Set(Object.keys(authService.PROVIDERS));
const allowedIntents = new Set(authService.INTENTS);

const authPageForIntent = (intent) => (intent === 'signup' ? '/signup' : '/login');
const authErrorRedirect = (intent, code) => `${authPageForIntent(intent)}?auth_error=${encodeURIComponent(code)}`;

const setStateCookie = (res, state, secure) => {
  appendCookie(res, `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS};${secure ? ' Secure;' : ''}`);
};

const clearStateCookie = (res, secure) => {
  appendCookie(res, `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0;${secure ? ' Secure;' : ''}`);
};

const createWorkosAuthRouter = ({
  config,
  issueToken,
  setAuthCookie,
  rateLimit,
  logger,
  service = authService,
}) => {
  const router = express.Router();

  router.get('/providers', (_req, res) => res.json(service.providerCapabilities(config)));

  router.get('/callback', rateLimit, async (req, res) => {
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieState = cookies[OAUTH_STATE_COOKIE];
    const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
    clearStateCookie(res, config.cookieSecure);

    let state;
    try {
      state = await service.consumeOAuthState({ cookieState, returnedState });
      if (!state) return res.redirect(302, authErrorRedirect('login', 'state_invalid'));
      const capabilities = service.providerCapabilities(config);
      if (!capabilities[state.provider]) {
        return res.redirect(302, authErrorRedirect(state.intent, 'provider_unavailable'));
      }
      if (typeof req.query.error === 'string') {
        return res.redirect(302, authErrorRedirect(state.intent, 'provider_failed'));
      }
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code || code.length > 2048) {
        return res.redirect(302, authErrorRedirect(state.intent, 'provider_failed'));
      }

      const authenticated = await service.exchangeAuthorizationCode({
        config,
        code,
        ipAddress: req.ip,
        userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent').slice(0, 500) : undefined,
      });
      if (!service.authenticationMatchesProvider(state.provider, authenticated.authenticationMethod)) {
        return res.redirect(302, authErrorRedirect(state.intent, 'provider_mismatch'));
      }
      const resolved = await service.resolveWorkosIdentity({ identity: authenticated.user, intent: state.intent });
      if (resolved.status !== 'authenticated') {
        const errorByStatus = {
          unverified: 'email_unverified',
          not_found: 'account_not_found',
          account_link_required: 'account_link_required',
          conflict: 'account_conflict',
        };
        return res.redirect(302, authErrorRedirect(state.intent, errorByStatus[resolved.status] || 'provider_failed'));
      }

      setAuthCookie(res, issueToken(resolved.user.id));
      return res.redirect(302, service.sanitizeReturnPath(state.return_path));
    } catch (error) {
      logger.warn({
        requestId: req.id,
        reason: 'workos_callback_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }, 'WorkOS authentication callback failed');
      return res.redirect(302, authErrorRedirect(state?.intent, 'provider_failed'));
    }
  });

  router.get('/:provider/start', (req, res, next) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const intent = typeof req.query.intent === 'string' ? req.query.intent : '';
    const capabilities = service.providerCapabilities(config);
    if (!allowedProviders.has(provider)) return res.status(404).json({ error: 'Authentication provider not found.' });
    if (!capabilities[provider]) return res.status(404).json({ error: 'Authentication provider not available.' });
    if (!allowedIntents.has(intent)) return res.status(400).json({ error: 'A valid authentication intent is required.' });
    req.workosAuth = { provider, intent, returnPath: service.sanitizeReturnPath(req.query.returnTo) };
    return next();
  }, rateLimit, async (req, res, next) => {
    try {
      const { provider, intent, returnPath } = req.workosAuth;
      const state = await service.createOAuthState({ provider, intent, returnPath });
      setStateCookie(res, state, config.cookieSecure);
      const authorizationUrl = service.getAuthorizationUrl({ config, provider, intent, state });
      return res.redirect(302, authorizationUrl);
    } catch (error) {
      return next(error);
    }
  });

  return router;
};

module.exports = {
  OAUTH_STATE_COOKIE,
  authErrorRedirect,
  createWorkosAuthRouter,
};
