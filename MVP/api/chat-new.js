const { setCorsHeaders, handleOptions, parseRequestBody } = require('../lib/http');
const { getOpenAIClient, extractResponseText } = require('../lib/openai');

// Version: 2025-11-22 - Force Vercel redeploy

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

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  const body = parseRequestBody(req);
  const { message, userContext = null, conversationHistory = [], propertyInsights = null } = body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'A message is required.' });
    return;
  }

  const sanitizedHistory = Array.isArray(conversationHistory)
    ? conversationHistory
        .filter((entry) => entry && typeof entry.content === 'string')
        .slice(-10)
        .map((entry) => ({
          role: entry.role === 'assistant' ? 'assistant' : 'user',
          content: entry.content,
        }))
    : [];

  const contextSnippet = buildContextSnippet(userContext, propertyInsights);
  const finalUserMessage = contextSnippet
    ? `${contextSnippet}\n\nClient question: ${message.trim()}`
    : message.trim();

  const systemMessage = {
    role: 'system',
    content: 'You are Deal Desk AI, an expert real estate financing assistant. You help users understand real estate lending options, analyze deals, and provide guidance on property investments. Be professional, knowledgeable, and helpful. When given context about a user\'s deal or lender matches, use that information to provide personalized advice.'
  };

  const messages = [
    systemMessage,
    ...sanitizedHistory,
    { role: 'user', content: finalUserMessage },
  ];

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages,
    });

    const assistantMessage = extractResponseText(response);

    res.status(200).json({
      response: assistantMessage,
    });
  } catch (error) {
    console.error('OpenAI chat error:', error.message || error);
    const status = error.status ?? 500;
    res.status(status).json({
      error: 'Failed to generate a response. Please try again shortly.',
      details: error?.message ?? 'Unknown error',
    });
  }
};

