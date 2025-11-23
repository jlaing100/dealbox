const OpenAI = require('openai');

let cachedClient = null;

function buildClientConfig() {
  const config = {
    apiKey: process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: 'https://ai-gateway.vercel.sh/v1',
  };

  // Override with AI Gateway if key is available
  if (process.env.AI_GATEWAY_API_KEY) {
    config.apiKey = process.env.AI_GATEWAY_API_KEY;
    config.baseURL = 'https://ai-gateway.vercel.sh/v1';
  } else {
    // Fallback to direct OpenAI if AI Gateway not configured
    config.apiKey = process.env.OPENAI_API_KEY;

    if (process.env.OPENAI_BASE_URL) {
      config.baseURL = process.env.OPENAI_BASE_URL;
    }

    if (process.env.OPENAI_ORG_ID) {
      config.organization = process.env.OPENAI_ORG_ID;
    }

    if (process.env.OPENAI_PROJECT_ID) {
      config.project = process.env.OPENAI_PROJECT_ID;
    }
  }

  return config;
}

function getOpenAIClient() {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY or OPENAI_API_KEY is not configured');
  }

  if (!cachedClient) {
    cachedClient = new OpenAI(buildClientConfig());
  }

  return cachedClient;
}

function extractResponseText(response) {
  if (!response) {
    return '';
  }

  if (Array.isArray(response.choices) && response.choices.length > 0) {
    const choice = response.choices[0];
    if (choice.message) {
      if (Array.isArray(choice.message.content)) {
        const content = choice.message.content
          .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
          .join('')
          .trim();
        if (content) {
          return content;
        }
      }
      if (typeof choice.message.content === 'string') {
        return choice.message.content.trim();
      }
    }
    if (choice.delta && typeof choice.delta.content === 'string') {
      return choice.delta.content.trim();
    }
  }

  if (Array.isArray(response.output)) {
    const textChunks = [];
    response.output.forEach((block) => {
      if (Array.isArray(block.content)) {
        block.content.forEach((item) => {
          if ((item.type === 'output_text' || item.type === 'text') && item.text) {
            textChunks.push(item.text);
          }
        });
      }
    });
    if (textChunks.length > 0) {
      return textChunks.join('\n').trim();
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

module.exports = {
  getOpenAIClient,
  extractResponseText,
};

