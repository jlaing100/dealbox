const { LenderMatcher, findMissingFields } = require('../lib/lenderMatcher');

// Vercel serverless function for lender matching
module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { buyerProfile, propertyInsights } = req.body;

    if (!buyerProfile) {
      return res.status(400).json({ error: 'Buyer profile is required' });
    }

    console.log('🔍 Processing lender match request:', {
      buyerProfile: JSON.stringify(buyerProfile, null, 2),
      hasPropertyInsights: !!propertyInsights
    });

    // Check for missing required fields
    const missingFields = findMissingFields(buyerProfile);
    if (missingFields.length > 0) {
      return res.status(200).json({
        requiresMoreInfo: true,
        missingFields,
        message: `Additional information needed: ${missingFields.join(', ')}`,
        matches: [],
        timestamp: new Date().toISOString()
      });
    }

    // Initialize lender matcher
    let matcher;
    try {
      matcher = new LenderMatcher();
    } catch (error) {
      console.error('Failed to initialize lender matcher:', error);
      return res.status(500).json({
        error: 'Failed to initialize lender matching system',
        matches: [],
        fallback: true,
        timestamp: new Date().toISOString()
      });
    }

    // Find matching lenders
    const matches = matcher.findTopMatches(buyerProfile, 5);

    console.log(`✅ Found ${matches.length} lender matches for profile:`, {
      propertyValue: buyerProfile.propertyValue,
      propertyType: buyerProfile.propertyType,
      creditScore: buyerProfile.creditScore,
      downPaymentPercent: buyerProfile.downPaymentPercent
    });

    const response = {
      matches: matches,
      requiresMoreInfo: false,
      timestamp: new Date().toISOString(),
      fallback: false,
      totalMatches: matches.length
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Lender matching API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      matches: [],
      fallback: true,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}
