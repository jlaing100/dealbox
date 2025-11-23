const { setCorsHeaders, handleOptions, parseRequestBody } = require('../../lib/http');

const MARKET_OUTLOOKS = ['Stable', 'Improving', 'Cooling'];

function calculateEstimates({ propertyValue, downPaymentPercent, currentRent }) {
  const value = typeof propertyValue === 'number' ? propertyValue : null;
  const downPayment = typeof downPaymentPercent === 'number' ? downPaymentPercent : 20;

  const estimatedRent =
    currentRent && typeof currentRent === 'number'
      ? currentRent
      : value
      ? Math.round((value * 0.0075) / 50) * 50
      : 2500;

  const leverage = 100 - downPayment;
  const noi = estimatedRent * 12 * 0.6;
  const debtService = value ? (value * (leverage / 100) * 0.065) : estimatedRent * 12 * 0.5;
  const dscr = Number((noi / debtService).toFixed(2));

  return {
    estimatedRent,
    leverageIndex: leverage,
    dscrEstimate: dscr,
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseRequestBody(req);
  const { city, state, propertyValue = null, propertyType = null, downPaymentPercent = null, currentRent = null } =
    body || {};

  if (!city || !state) {
    res.status(400).json({ error: 'city and state are required.' });
    return;
  }

  const estimates = calculateEstimates({ propertyValue, downPaymentPercent, currentRent });
  const outlook = MARKET_OUTLOOKS[(city.length + state.length) % MARKET_OUTLOOKS.length];

  res.status(200).json({
    insights: {
      market: `${city}, ${state}`,
      marketOutlook: outlook,
      propertyType: propertyType || 'Not specified',
      estimatedRent: estimates.estimatedRent,
      dscrEstimate: estimates.dscrEstimate,
      leverageIndex: estimates.leverageIndex,
      commentary: `Demand in ${city}, ${state} is ${outlook.toLowerCase()} with estimated rents around $${estimates.estimatedRent.toLocaleString()}.`,
      risks: [
        `Monitor DSCR performance (est. ${estimates.dscrEstimate}).`,
        `Leverage around ${estimates.leverageIndex}% may require reserves.`,
      ],
    },
  });
};

