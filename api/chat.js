const OpenAI = require('openai');

const DEFAULT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = Number.isFinite(Number(process.env.OPENAI_CHAT_TEMPERATURE))
  ? Number(process.env.OPENAI_CHAT_TEMPERATURE)
  : 0.4;

let cachedClient = null;

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

function sanitizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((entry) => entry && typeof entry.content === 'string' && entry.content.trim().length > 0)
    .slice(-10)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content.trim(),
    }));
}

function buildContextSnippet(userContext, propertyInsights) {
  const contextParts = [];

  if (userContext && typeof userContext === 'object') {
    const { formData, lenderMatches } = userContext;
    if (formData) {
      contextParts.push(`Borrower profile: ${JSON.stringify(formData)}`);
    }
    if (Array.isArray(lenderMatches) && lenderMatches.length > 0) {
      const summary = lenderMatches
        .slice(0, 3)
        .map((match) => `${match.lenderName} (${Math.round((match.confidence || 0) * 100)}%)`)
        .join(', ');
      contextParts.push(`Current lender matches: ${summary}`);
    }
  }

  if (propertyInsights) {
    contextParts.push(`Property insights: ${JSON.stringify(propertyInsights)}`);
  }

  return contextParts.join('\n');
}

function extractResponseText(response) {
  if (!response) return '';

  if (Array.isArray(response.choices) && response.choices.length > 0) {
    const choice = response.choices[0];
    if (choice.message) {
      if (Array.isArray(choice.message.content)) {
        const content = choice.message.content
          .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
          .join('')
          .trim();
        if (content) return content;
      }
      if (typeof choice.message.content === 'string') {
        return choice.message.content.trim();
      }
    }
    if (choice.delta && typeof choice.delta.content === 'string') {
      return choice.delta.content.trim();
    }
  }

  if (Array.isArray(response.output_text) && response.output_text.length > 0) {
    return response.output_text.join('\n').trim();
  }

  const maybeText = response.content?.[0]?.text;
  if (maybeText) {
    return maybeText.trim();
  }

  return '';
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!cachedClient) {
    const config = {
      apiKey: process.env.OPENAI_API_KEY,
    };

    if (process.env.OPENAI_BASE_URL) {
      config.baseURL = process.env.OPENAI_BASE_URL;
    }

    if (process.env.OPENAI_ORG_ID) {
      config.organization = process.env.OPENAI_ORG_ID;
    }

    if (process.env.OPENAI_PROJECT_ID) {
      config.project = process.env.OPENAI_PROJECT_ID;
    }

    cachedClient = new OpenAI(config);
  }

  return cachedClient;
}

function buildFallbackResponse(message) {
  return {
    response: `I received your message: "${message}". The chat feature is currently using a simplified fallback mode. Please check back later for full AI-powered responses.`,
    timestamp: new Date().toISOString(),
    fallback: true,
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseRequestBody(req);
  const { message, userContext = null, conversationHistory = [], propertyInsights = null } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'A message is required.' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(200).json(buildFallbackResponse(message));
    return;
  }

  const sanitizedHistory = sanitizeConversationHistory(conversationHistory);
  const contextSnippet = buildContextSnippet(userContext, propertyInsights);
  const finalUserMessage = contextSnippet
    ? `${contextSnippet}\n\nClient question: ${message.trim()}`
    : message.trim();

  const messages = [
    {
      role: 'system',
      content:
        'You are Deal Desk, an expert AI analyst that helps investors understand lending options. ' +
        'Provide concise, actionable responses grounded in the borrower profile, current lender matches, ' +
        'and any property insights that are provided. Offer to explain lending concepts or next steps.',
    },
    ...sanitizedHistory,
    { role: 'user', content: finalUserMessage },
  ];

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: DEFAULT_TEMPERATURE,
      messages,
    });

    const assistantMessage = extractResponseText(response);

    res.status(200).json({
      response: assistantMessage || 'I reviewed your information but could not draft a reply. Please try again.',
      timestamp: new Date().toISOString(),
      fallback: false,
      usage: response?.usage ?? undefined,
    });
  } catch (error) {
    console.error('OpenAI chat error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({
      error: 'Failed to generate a response. Please try again shortly.',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
}

