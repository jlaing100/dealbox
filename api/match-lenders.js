// Vercel serverless function for lender matching
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { buyerProfile } = req.body;

    if (!buyerProfile) {
      return res.status(400).json({ error: 'Buyer profile is required' });
    }

    // Simple fallback response
    const response = {
      matches: [
        {
          lenderName: "Sample Lender",
          programName: "Investment Property Program",
          confidence: 0.85,
          isMatch: true,
          matchSummary: "This lender offers competitive rates for investment properties.",
          maxLTV: 80,
          minCreditScore: 680,
          maxLoanAmount: 2000000,
          website: "https://samplelender.com",
          contact_phone: "(555) 123-4567"
        }
      ],
      timestamp: new Date().toISOString(),
      fallback: true,
      message: "Lender matching is currently using fallback mode. Full AI-powered matching coming soon."
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Lender matching API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      matches: [],
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
