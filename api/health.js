// Vercel serverless function for health check
export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      message: 'Deal Desk API is running',
      environment: process.env.NODE_ENV || 'development'
    });
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed' });
  }
}