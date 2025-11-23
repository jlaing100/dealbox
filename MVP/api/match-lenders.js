const { setCorsHeaders, handleOptions, parseRequestBody } = require('../lib/http');
const { LenderMatcher, findMissingFields } = require('../lib/lenderMatcher');
const { getOpenAIClient, extractResponseText } = require('../lib/openai');

const matcher = new LenderMatcher();

async function generateAnalysisSummary(payload) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-5-nano',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are DealDesk, an AI that summarizes lender matches for internal analysts. ' +
            'Respond in JSON with keys "summary" (string) and "talkingPoints" (array of short bullet strings).',
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    });

    const text = extractResponseText(response);
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.warn('Failed to parse OpenAI analysis JSON:', parseError);
      return {
        summary: text,
        talkingPoints: [],
      };
    }
  } catch (error) {
    console.warn('OpenAI analysis generation failed:', error);
    return null;
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseRequestBody(req);
  const { buyerProfile, propertyInsights = null } = body || {};

  if (!buyerProfile || typeof buyerProfile !== 'object') {
    res.status(400).json({ error: 'buyerProfile is required.' });
    return;
  }

  const missingFields = findMissingFields(buyerProfile);
  const requiresMoreInfo = missingFields.length > 0;

  try {
    const matches = matcher.findTopMatches(buyerProfile, 8);

    let analysis = null;
    if (!requiresMoreInfo && matches.length > 0) {
      analysis = await generateAnalysisSummary({
        buyerProfile,
        propertyInsights,
        sampleMatches: matches.slice(0, 3),
      });
    }

    res.status(200).json({
      requiresMoreInfo,
      missingFields,
      matches,
      analysis,
    });
  } catch (error) {
    console.error('Match lender error:', error);
    res.status(500).json({
      error: 'Failed to evaluate lender matches.',
      details: error?.message ?? 'Unknown error',
    });
  }
};

