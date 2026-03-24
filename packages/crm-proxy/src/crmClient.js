import httpntlm from 'httpntlm';

const sanitize = (value) => (typeof value === 'string' ? value.trim() : '');

const methodMap = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  DELETE: 'del',
  DEL: 'del'
};

const normalizeMethod = (method = 'GET') => method.toString().trim().toUpperCase();

const runNtlmRequest = (options, method = 'GET') =>
  new Promise((resolve, reject) => {
    const normalizedMethod = normalizeMethod(method);
    const driverKey = methodMap[normalizedMethod];
    const driver = httpntlm[driverKey];

    if (!driver) {
      const error = new Error(`Unsupported NTLM method: ${normalizedMethod}`);
      error.statusCode = 405;
      reject(error);
      return;
    }

    driver(options, (err, response) => {
      if (err) {
        reject(err);
        return;
      }

      if (!response) {
        reject(new Error('CRM returned empty response'));
        return;
      }

      const { statusCode } = response;

      if (statusCode >= 200 && statusCode < 300) {
        resolve({
          statusCode,
          headers: response.headers,
          body: response.body
        });
        return;
      }

      const error = new Error(`CRM request failed with status ${statusCode}`);
      error.statusCode = statusCode;
      error.body = response.body;
      error.headers = response.headers;
      reject(error);
    });
  });

export async function verifyCredentials({ url, username, password, domain, workstation = '' }) {
  const targetUrl = sanitize(url);
  const user = sanitize(username);
  const userDomain = sanitize(domain);

  if (!targetUrl || !user || !password || !userDomain) {
    const error = new Error('Missing CRM URL, username, password or domain');
    error.statusCode = 400;
    throw error;
  }

  return runNtlmRequest(
    {
      url: targetUrl,
      username: user,
      password,
      domain: userDomain,
      workstation: sanitize(workstation),
      headers: {
        'User-Agent': 'Planner-CRM-Proxy/0.1',
        Accept: 'application/json,text/html,*/*'
      }
    },
    'GET'
  );
}

export async function ntlmRequest({
  url,
  method = 'GET',
  username,
  password,
  domain,
  workstation = '',
  headers = {},
  body
}) {
  const targetUrl = sanitize(url);
  const normalizedMethod = normalizeMethod(method);
  const user = sanitize(username);
  const userDomain = sanitize(domain);

  if (!targetUrl || !user || !password || !userDomain) {
    const error = new Error('Missing CRM URL, username, password or domain');
    error.statusCode = 400;
    throw error;
  }

  const options = {
    url: targetUrl,
    username: user,
    password,
    domain: userDomain,
    workstation: sanitize(workstation),
    headers: {
      'User-Agent': 'Planner-CRM-Proxy/0.1',
      ...headers
    }
  };

  if (normalizedMethod !== 'GET' && typeof body !== 'undefined') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  return runNtlmRequest(options, normalizedMethod);
}
