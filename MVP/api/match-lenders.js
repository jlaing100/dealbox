const { setCorsHeaders, handleOptions, parseRequestBody } = require('../lib/http');
const { LenderMatcher, findMissingFields } = require('../lib/lenderMatcher');
const { getOpenAIClient, extractResponseText } = require('../lib/openai');
const lenderDatabase = require('../lender_details/Comprehensive/comprehensive_lender_database.json');

const matcher = new LenderMatcher();

async function evaluateLendersWithLLM(buyerProfile, propertyInsights = null) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
    console.warn('No OpenAI API key available, falling back to rule-based matching');
    return null;
  }

  try {
    const client = getOpenAIClient();

    // Create comprehensive prompt for lender evaluation
    const prompt = `You are an expert real estate lending consultant for Deal Desk. Evaluate ALL lenders in our database against the buyer's profile and determine which ones are suitable matches.

BUYER PROFILE:
${JSON.stringify(buyerProfile, null, 2)}

${propertyInsights ? `PROPERTY MARKET INTELLIGENCE:
${JSON.stringify(propertyInsights, null, 2)}

` : ''}LENDER DATABASE:
${JSON.stringify(lenderDatabase, null, 2)}

CRITICAL REQUIREMENTS:
1. Evaluate EVERY lender and program in the database
2. For each lender/program combination, determine if it's a match (isMatch: true/false)
3. If it's a MATCH (isMatch: true):
   - confidence: number 0.0-1.0 (how strong the match is)
   - matchSummary: detailed explanation of why this lender fits the buyer
   - nonMatchReason: null
4. If it's NOT a match (isMatch: false):
   - confidence: 0.0
   - matchSummary: null
   - nonMatchReason: detailed explanation of why this lender doesn't fit
5. Consider ALL lender requirements (credit score, LTV, loan amount, property types, etc.)
6. For buyer's profile (630 credit score, first-time investor), most lenders should be non-matches due to strict eligibility requirements
7. Include lender contact information in response

Return JSON array of all evaluated lenders:
[
  {
    "lenderName": "Exact lender company name",
    "programName": "Specific program name",
    "confidence": 0.85,
    "isMatch": true,
    "matchSummary": "Detailed reason why this is a good match",
    "nonMatchReason": null,
    "maxLTV": 80,
    "minCreditScore": 680,
    "maxLoanAmount": 2000000,
    "website": "https://lenderwebsite.com",
    "contact_phone": "phone number",
    "department_contacts": {"email": "contact@example.com"}
  },
  {
    "lenderName": "Another lender",
    "programName": "Another program",
    "confidence": 0.0,
    "isMatch": false,
    "matchSummary": null,
    "nonMatchReason": "Detailed reason why this doesn't match (e.g., credit score too low, insufficient down payment)",
    "maxLTV": 75,
    "minCreditScore": 700,
    "maxLoanAmount": 1500000,
    "website": "https://anotherlender.com",
    "contact_phone": "another phone"
  }
]

Sort by: matches first (highest confidence), then non-matches (alphabetical by lender name).`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      temperature: 0.1, // Low temperature for consistent evaluation
      max_tokens: 8000,
      messages: [
        {
          role: 'system',
          content: 'You are a precise real estate lender evaluator. Return only valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = extractResponseText(response);
    if (!text) {
      throw new Error('No response from LLM');
    }

    // Parse the JSON response - handle markdown code blocks
    let evaluatedLenders;
    try {
      // Remove markdown code block formatting if present
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      evaluatedLenders = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Failed to parse LLM lender evaluation JSON:', parseError);
      console.error('Raw response:', text);
      throw new Error('Invalid JSON response from LLM');
    }

    // Validate the response structure
    if (!Array.isArray(evaluatedLenders)) {
      throw new Error('LLM response is not an array');
    }

    // Ensure all lenders have required fields
    const validatedLenders = evaluatedLenders.map(lender => ({
      lenderName: lender.lenderName || 'Unknown Lender',
      programName: lender.programName || lender.lenderName || 'General Program',
      confidence: typeof lender.confidence === 'number' ? Math.max(0, Math.min(1, lender.confidence)) : 0,
      isMatch: Boolean(lender.isMatch),
      matchSummary: lender.isMatch ? (lender.matchSummary || 'Good match for your profile') : null,
      nonMatchReason: !lender.isMatch ? (lender.nonMatchReason || 'Does not meet lender requirements') : null,
      maxLTV: lender.maxLTV || null,
      minCreditScore: lender.minCreditScore || null,
      maxLoanAmount: lender.maxLoanAmount || null,
      website: lender.website || null,
      contact_phone: lender.contact_phone || null,
      department_contacts: lender.department_contacts || null,
    }));

    // Sort: matches first by confidence (desc), then non-matches alphabetically
    validatedLenders.sort((a, b) => {
      if (a.isMatch && !b.isMatch) return -1;
      if (!a.isMatch && b.isMatch) return 1;
      if (a.isMatch && b.isMatch) return b.confidence - a.confidence;
      return a.lenderName.localeCompare(b.lenderName);
    });

    return validatedLenders;

  } catch (error) {
    console.error('LLM lender evaluation failed:', error);
    return null; // Will fallback to rule-based matching
  }
}

async function generateAnalysisSummary(payload) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
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
      // Remove markdown code block formatting if present
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      return JSON.parse(cleanText);
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
    let matches;

    if (!requiresMoreInfo) {
      // Try LLM-based evaluation first
      matches = await evaluateLendersWithLLM(buyerProfile, propertyInsights);

      if (!matches) {
        console.log('LLM evaluation failed, falling back to rule-based matching');
        // Fallback to rule-based matching
        const ruleBasedMatches = matcher.findTopMatches(buyerProfile, 20);
        // Convert rule-based matches to expected format
        matches = ruleBasedMatches.map(match => ({
          ...match,
          lenderName: match.lenderName,
          programName: match.programName || match.lenderName,
          confidence: match.confidence || 0,
          isMatch: match.isMatch,
          matchSummary: match.isMatch ? match.matchSummary : null,
          nonMatchReason: !match.isMatch ? match.nonMatchReason : null,
        }));
      }
    } else {
      // Need more info, return empty matches array
      matches = [];
    }

    let analysis = null;
    if (!requiresMoreInfo && matches.length > 0) {
      const matchCount = matches.filter(m => m.isMatch).length;
      analysis = await generateAnalysisSummary({
        buyerProfile,
        propertyInsights,
        totalLenders: matches.length,
        matchCount: matchCount,
        sampleMatches: matches.filter(m => m.isMatch).slice(0, 3),
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

