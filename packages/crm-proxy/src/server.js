import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import session from 'express-session';
import { verifyCredentials, ntlmRequest } from './crmClient.js';

dotenv.config();

const {
  PORT = 5050,
  CRM_URL,
  CRM_DATA_URL,
  ALLOWED_ORIGINS = '',
  CRM_DOMAIN,
  CRM_USERNAME,
  CRM_PASSWORD,
  SESSION_SECRET = 'planner-ibcs-crm-session',
  SESSION_COOKIE_NAME = 'planner_ibcs_crm_session'
} = process.env;

const allowedOrigins = ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');

const app = express();

app.set('trust proxy', true);

app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

if (allowAllOrigins || allowedOrigins.length === 0) {
  app.use(cors({ credentials: true, origin: true }));
  app.options('*', cors({ credentials: true, origin: true }));
} else {
  const corsOptions = {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} is not allowed`));
      }
    }
  };
  app.options('*', cors(corsOptions));
  app.use((req, res, next) => {
    cors(corsOptions)(req, res, (err) => {
      if (err) {
        res.status(403).json({ error: 'Origin not allowed' });
        return;
      }
      next();
    });
  });
}

app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', crmUrlConfigured: Boolean(CRM_URL) });
});

const mapErrorToResponse = (error) => {
  const statusFromError = typeof error?.statusCode === 'number' ? error.statusCode : null;
  const errorBody = typeof error?.body === 'string' ? error.body : '';
  const crmMessageMatch = errorBody.match(/"value"\s*:\s*"([^"]+)"/i);
  const crmMessage = crmMessageMatch?.[1]?.trim();
  if (statusFromError === 401 || statusFromError === 403) {
    return {
      status: statusFromError,
      message: 'Nieprawidłowy login, hasło lub domena.'
    };
  }
  if (statusFromError && statusFromError >= 400 && statusFromError < 500) {
    return {
      status: statusFromError,
      message: crmMessage || 'Żądanie do CRM nie powiodło się.'
    };
  }
  return {
    status: 502,
    message: error?.message || 'Brak połączenia z CRM.'
  };
};

const getScope = (req) => {
  const bodyScope = typeof req.body?.scope === 'string' ? req.body.scope.trim() : '';
  const queryScope = typeof req.query?.scope === 'string' ? req.query.scope.trim() : '';
  const headerScope = typeof req.headers['x-crm-session-scope'] === 'string' ? req.headers['x-crm-session-scope'].trim() : '';
  return bodyScope || queryScope || headerScope || 'default';
};

const getScopedSessionAuth = (req, scope) => {
  const connections = req.session?.crmConnections;
  if (!connections || typeof connections !== 'object') return null;
  const entry = connections[scope];
  if (!entry || typeof entry !== 'object') return null;
  return entry;
};

const setScopedSessionAuth = (req, scope, auth) => {
  if (!req.session.crmConnections || typeof req.session.crmConnections !== 'object') {
    req.session.crmConnections = {};
  }
  req.session.crmConnections[scope] = auth;
};

const clearScopedSessionAuth = (req, scope) => {
  if (!req.session?.crmConnections || typeof req.session.crmConnections !== 'object') return;
  delete req.session.crmConnections[scope];
};

const resolveCrmAuth = (req, options = {}) => {
  const { requireSession = false } = options;
  const scope = getScope(req);
  const sessionAuth = getScopedSessionAuth(req, scope);
  const login = typeof req.body?.login === 'string' && req.body.login.trim() ? req.body.login.trim() : sessionAuth?.login || (requireSession ? '' : (CRM_USERNAME ?? '').trim());
  const password =
    typeof req.body?.password === 'string' && req.body.password.length
      ? req.body.password
      : sessionAuth?.password || (requireSession ? '' : CRM_PASSWORD);
  const domain = typeof req.body?.domain === 'string' && req.body.domain.trim() ? req.body.domain.trim() : sessionAuth?.domain || (requireSession ? '' : (CRM_DOMAIN ?? '').trim());
  const workstation = req.body?.workstation;

  return {
    scope,
    login,
    password,
    domain,
    workstation
  };
};

app.post('/crm/login', async (req, res) => {
  const { scope, login: effectiveLogin, password: effectivePassword, domain: effectiveDomain, workstation } = resolveCrmAuth(req);

  if (!effectiveLogin || !effectivePassword || !effectiveDomain) {
    res.status(400).json({ error: 'Podaj login, hasło i domenę.' });
    return;
  }
  if (!CRM_URL) {
    res.status(500).json({ error: 'Brak konfiguracji adresu CRM (CRM_URL).' });
    return;
  }

  try {
    await verifyCredentials({
      url: CRM_URL,
      username: effectiveLogin,
      password: effectivePassword,
      domain: effectiveDomain,
      workstation
    });
    setScopedSessionAuth(req, scope, {
      login: effectiveLogin,
      password: effectivePassword,
      domain: effectiveDomain,
      connectedAt: new Date().toISOString()
    });
    res.json({
      connected: true,
      scope,
      user: effectiveLogin,
      domain: effectiveDomain
    });
  } catch (error) {
    const response = mapErrorToResponse(error);
    if (process.env.NODE_ENV !== 'test') {
      const safeMessage = error?.message || error;
      console.error(`[crm-proxy] CRM login failed: ${safeMessage}`);
    }
    res.status(response.status).json({ error: response.message });
  }
});

app.get('/crm/session/status', (req, res) => {
  const scope = getScope(req);
  const auth = getScopedSessionAuth(req, scope);

  res.json({
    connected: !!(auth?.login && auth?.password && auth?.domain),
    scope,
    user: auth?.login || null,
    domain: auth?.domain || null,
    connectedAt: auth?.connectedAt || null
  });
});

app.post('/crm/session/logout', (req, res) => {
  const scope = getScope(req);
  clearScopedSessionAuth(req, scope);
  res.json({ connected: false, scope });
});

app.post('/crm/odata', async (req, res) => {
  if (!CRM_DATA_URL) {
    res.status(500).json({ error: 'Brak konfiguracji adresu CRM (CRM_DATA_URL).' });
    return;
  }

  const { path = '', method = 'GET', headers = {}, body } = req.body || {};
  const {
    login: effectiveLogin,
    password: effectivePassword,
    domain: effectiveDomain,
    workstation
  } = resolveCrmAuth(req);

  if (!effectiveLogin || !effectivePassword || !effectiveDomain) {
    res.status(400).json({ error: 'Podaj login, hasło i domenę.' });
    return;
  }

  let targetUrl;
  try {
    const relativePath = path ? path.toString().trim().replace(/^\//, '') : '';
    targetUrl = new URL(relativePath, CRM_DATA_URL).toString();
  } catch (error) {
    res.status(400).json({ error: 'Nieprawidłowa ścieżka zapytania.' });
    return;
  }

  const requestHeaders = {
    Accept: 'application/json;odata=verbose',
    ...(method && method.toString().toUpperCase() !== 'GET'
      ? { 'Content-Type': 'application/json; charset=utf-8' }
      : {}),
    ...headers
  };

  try {
    const response = await ntlmRequest({
      url: targetUrl,
      method,
      username: effectiveLogin,
      password: effectivePassword,
      domain: effectiveDomain,
      workstation,
      headers: requestHeaders,
      body
    });

    const contentType = (response.headers?.['content-type'] || '').toLowerCase();
    let data = response.body;
    if (contentType.includes('application/json')) {
      try {
        data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
      } catch {
        /* ignore JSON parse errors, return raw string */
      }
    }

    res.json({
      status: response.statusCode,
      headers: response.headers,
      data
    });
  } catch (error) {
    const response = mapErrorToResponse(error);
    if (process.env.NODE_ENV !== 'test') {
      const safeMessage = error?.message || error;
      console.error(`[crm-proxy] CRM data request failed: ${safeMessage}`);
      if (error?.body) {
        console.error('[crm-proxy] CRM response body:', error.body);
      }
    }
    res.status(response.status).json({ error: response.message });
  }
});

app.post('/crm/execute', async (req, res) => {
  if (!CRM_URL) {
    res.status(500).json({ error: 'Brak konfiguracji adresu CRM (CRM_URL).' });
    return;
  }

  const { body, soapAction } = req.body || {};
  const {
    login: effectiveLogin,
    password: effectivePassword,
    domain: effectiveDomain,
    workstation
  } = resolveCrmAuth(req);

  if (!effectiveLogin || !effectivePassword || !effectiveDomain) {
    res.status(400).json({ error: 'Podaj login, hasło i domenę.' });
    return;
  }

  if (typeof body !== 'string' || !body.trim()) {
    res.status(400).json({ error: 'Brak treści żądania SOAP.' });
    return;
  }

  const soapBody = body.replaceAll('__CRM_URL__', CRM_URL);

  try {
    const executeUrl = CRM_URL.endsWith('/web') ? CRM_URL : `${CRM_URL.replace(/\/$/, '')}/web`;
    const response = await ntlmRequest({
      url: executeUrl,
      method: 'POST',
      username: effectiveLogin,
      password: effectivePassword,
      domain: effectiveDomain,
      workstation,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction:
          soapAction ||
          'http://schemas.microsoft.com/xrm/2011/Contracts/Services/IOrganizationService/Execute'
      },
      body: soapBody
    });

    res.json({
      status: response.statusCode,
      headers: response.headers,
      data: response.body
    });
  } catch (error) {
    const response = mapErrorToResponse(error);
    if (process.env.NODE_ENV !== 'test') {
      const safeMessage = error?.message || error;
      console.error(`[crm-proxy] CRM execute request failed: ${safeMessage}`);
      if (error?.body) {
        console.error('[crm-proxy] CRM execute response body:', error.body);
      }
    }
    res.status(response.status).json({ error: response.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(Number(PORT), () => {
  console.log(`[crm-proxy] Listening on port ${PORT}`);
  if (!CRM_URL) {
    console.warn('[crm-proxy] Warning: CRM_URL is not configured. Login attempts will fail.');
  }
  if (!CRM_DATA_URL) {
    console.warn('[crm-proxy] Warning: CRM_DATA_URL is not configured. Zapytania o dane CRM będą odrzucane.');
  }
});

const shutDown = (signal) => {
  console.log(`[crm-proxy] Received ${signal}, shutting down...`);
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[crm-proxy] Unhandled rejection', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[crm-proxy] Uncaught exception', error);
  process.exit(1);
});
