function setCorsHeaders(res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.status(204).end();
    return true;
  }
  return false;
}

function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (!req.body) {
    return {};
  }

  try {
    return JSON.parse(req.body);
  } catch (error) {
    console.warn('Failed to parse JSON body:', error);
    return {};
  }
}

module.exports = {
  setCorsHeaders,
  handleOptions,
  parseRequestBody,
};

