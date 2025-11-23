# Deal Desk - AI-Powered Real Estate Lender Matching Platform

A modern web application that helps real estate investors find the perfect lenders for their deals using AI-powered matching, interactive chat support, and real-time property data integration.

## 🚀 Features

- **Intelligent Lender Matching**: AI analyzes buyer profiles and matches them with appropriate lenders from a comprehensive database
- **Comprehensive Lender Database**: Contains detailed information about 5+ major wholesale lenders including:
  - ACRA Lending
  - Angel Oak (multiple programs)
  - Arc Home Wholesale
  - HomeExpress (HomeXpress & InvestorX)
  - LoanStream
- **Interactive Chat Interface**: OpenAI GPT-4 powered chatbot with awareness of lender guidelines and deal analysis
- **Q&A Workflow**: Dynamic question-and-answer interface for deal analysis with real-time recommendations
- **REmine API Integration**: Access to real-time property sales data and market information
- **Real-time Results**: Dynamic lender recommendations with confidence scores and detailed program information
- **Modern UI**: Apple-inspired design with smooth animations and transitions
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🛠️ Tech Stack

### Frontend
- **HTML5, CSS3, JavaScript (ES6+)**
- **OpenAI GPT-4 API** - For lender matching and chat functionality
- **Responsive design** with modern animations and transitions
- **LocalStorage** - For API key management and user preferences

### Backend
- **Node.js** with Express.js
- **OpenAI GPT-4 API** - For lender matching and chat functionality
- **REmine PRD API** - For property sales data and market information
- **Rate limiting** - Express rate limiting middleware
- **CORS** - Enabled for cross-origin requests
- **Error handling** - Comprehensive error handling and logging

### Deployment
- **Frontend**: Static hosting (GitHub Pages, Netlify, Vercel, etc.)
- **Backend**: Cloud hosting (Vercel recommended, Railway, Render)

## 📋 Prerequisites

### 1. OpenAI Account Setup
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an account and verify your email
3. Navigate to **API Keys** section
4. Create a new API key and save it securely
5. Add billing information (required for API access)

### 2. REmine API Setup (Optional)
1. Contact REmine for API access
2. Obtain your API key
3. Configure in backend environment variables

### 3. Node.js Installation
```bash
# Check if Node.js is installed
node --version
npm --version

# If not installed, download from https://nodejs.org/
# Recommended: Node.js 18+ (for built-in fetch support)
```

## 🚀 Quick Start

### Local Development

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd MVP
```

#### 2. Setup Frontend
```bash
# Navigate to project root
cd /path/to/MVP

# Start a local web server (choose one method)
# Option A: Python
python3 -m http.server 8080

# Option B: Node.js http-server
npx http-server -p 8080

# Option C: VS Code Live Server extension
# Right-click index.html -> "Open with Live Server"

# Open http://localhost:8080 in your browser
```

#### 3. Setup Backend API
```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env  # If .env.example exists
# Or create .env manually

# Edit .env and add your API keys:
# OPENAI_API_KEY=your_openai_api_key_here
# REMINE_API_KEY=your_remine_api_key_here (optional)
# REMINE_API_BASE_URL=https://api.remine.com/v1 (optional)

# Start the backend server
npm start
# API will be available at http://localhost:3001
```

#### 4. Configure Frontend API Endpoint
In `script.js`, ensure the API endpoint points to your backend:
```javascript
// For local development
this.apiEndpoint = 'http://localhost:3001/api/chat';

// For production, update to your deployed backend URL
// this.apiEndpoint = 'https://your-backend-url.vercel.app/api/chat';
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
NODE_ENV=development

# Optional - OpenAI Configuration
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=1000

# Optional - REmine API Configuration
REMINE_API_KEY=your_remine_api_key_here
REMINE_API_BASE_URL=https://api.remine.com/v1
REMINE_API_TIMEOUT=30000
REMINE_CACHE_TTL=3600000

# Optional - Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### API Endpoints

The backend provides the following endpoints:

- `GET /api/health` - Health check endpoint
- `POST /api/chat` - Main chat endpoint for lender matching and Q&A
- `POST /api/match-lenders` - Direct lender matching endpoint
- `POST /api/remine/property-insights` - Property market insights (requires REMINE_API_KEY)
- `POST /api/remine/search-comparables` - Search comparable properties (requires REMINE_API_KEY)
- `POST /api/remine/property-details` - Get detailed property information (requires REMINE_API_KEY)

## 📦 Production Deployment

### Option A: Vercel (Recommended)

#### Prerequisites
- Vercel account (free tier available)
- OpenAI API key
- Optional: REmine API key for property insights

#### Deploy Backend:
```bash
# Install Vercel CLI globally (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy the entire application (frontend + backend)
vercel --prod

# Set required environment variables
vercel env add OPENAI_API_KEY
# Enter your OpenAI API key when prompted

# Set optional environment variables
vercel env add REMINE_API_KEY  # For property market insights
vercel env add NODE_ENV
# Set NODE_ENV to "production"

# Verify deployment and environment variables
vercel ls
vercel env ls
```

#### Environment Variables Required for Vercel:
- **`OPENAI_API_KEY`** (required) - Your OpenAI API key for chat and lender matching
- **`REMINE_API_KEY`** (optional) - For real-time property market data
- **`NODE_ENV`** (recommended) - Set to "production" for better error handling

#### Troubleshooting Vercel Deployment:
- If API calls fail with "Failed to fetch", check that environment variables are set correctly
- Use `vercel env ls` to verify environment variables are configured
- Check Vercel function logs in the dashboard for detailed error messages
- Ensure the application is deployed from the root directory (not the backend subdirectory)

#### Deploy Frontend Only (Alternative):
If you prefer to deploy frontend and backend separately:

1. **Frontend Deployment**:
   ```bash
   # Deploy frontend to Vercel/Netlify/etc
   vercel --prod
   ```

2. **Backend Deployment**:
   ```bash
   # Deploy backend separately
   cd backend
   vercel --prod
   ```

3. **Update Frontend API URLs**:
   Update the API endpoints in `script.js` to point to your backend URL:
   ```javascript
   // In script.js, update these lines:
   this.apiEndpoint = 'https://your-backend-app.vercel.app/api/chat';
   // And the matching service endpoint:
   this.apiEndpoint = 'https://your-backend-app.vercel.app/api/match-lenders';
   ```

### Option B: Railway

```bash
cd backend

# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables
railway variables set OPENAI_API_KEY=your_key_here
railway variables set REMINE_API_KEY=your_key_here  # If using
```

### Option C: Render

1. Connect your GitHub repository to Render
2. Create a new **Web Service**
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`
4. Add environment variables:
   - `OPENAI_API_KEY`
   - `REMINE_API_KEY` (optional)
   - `PORT` (Render will set this automatically)

## 🔧 Troubleshooting

### Common Issues

#### API Calls Failing with "Failed to fetch"
**Symptoms**: Form submissions show "Analyzing..." but never complete, chat messages don't send

**Solutions**:
1. **Check Environment Variables**: Ensure `OPENAI_API_KEY` is set in your deployment platform
   ```bash
   # For Vercel
   vercel env ls
   ```
2. **Verify API Endpoints**: Make sure the frontend is calling the correct backend URLs
3. **Check CORS**: The backend allows all origins, but ensure your deployment allows cross-origin requests

#### Chat Service Unavailable
**Symptoms**: Chat input shows error messages about service being unavailable

**Solutions**:
1. **OpenAI API Key**: Verify the key is valid and has sufficient credits
2. **Network Issues**: Check if OpenAI's API is accessible from your deployment region
3. **Rate Limits**: OpenAI has rate limits - the app includes retry logic but may still fail during high usage

#### Property Insights Not Working
**Symptoms**: Form submissions work but no property market data is shown

**Solutions**:
1. **REmine API Key**: Set `REMINE_API_KEY` environment variable (optional feature)
2. **Fallback Behavior**: The app works without property insights - it just uses rule-based matching

### Development vs Production

- **Local Development**: Uses relative URLs (`''`) for API calls
- **Production**: API calls go to the same domain (Vercel handles routing)
- **Environment Variables**: Must be set in deployment platform, not in `.env` files

## 🎯 Usage

### For Investors

1. **Fill out the investor profile form** with:
   - Property details (value, type, location, down payment)
   - Buyer profile (credit score, investment experience)
   - Additional information (property vacancy, current rent)

2. **Click "Find Matching Lenders"** or use the "Deals" button to get AI-powered recommendations

3. **View lender cards** with:
   - Match confidence scores
   - Program requirements
   - Direct links to lender resources
   - Detailed program information

4. **Chat with the AI assistant** for:
   - Detailed explanations of lender programs
   - Deal analysis and recommendations
   - Answers to specific questions
   - Market insights (if REmine API is configured)

5. **Click "Ask About This Lender"** on any card for specific program details

### Q&A Workflow

The application features an interactive Q&A workflow:
- **Left Column**: Chat interface for deal analysis and questions
- **Right Column**: Dynamic solution cards with lender recommendations
- **Real-time Updates**: Solutions appear as the conversation progresses

## 🧪 Testing

### Test Scenarios

#### High Credit Score Investor:
- Property Value: $1,300,000
- Property Type: Single Family
- Location: Phoenix, Arizona
- Credit Score: 770
- Down Payment: 20%
- Investment Experience: Experienced

#### First-time Investor:
- Property Value: $500,000
- Property Type: Single Family
- Location: Phoenix, Arizona
- Credit Score: 680
- Down Payment: 30%
- Investment Experience: First-time

#### Investment Property:
- Property Value: $750,000
- Property Type: Duplex
- Location: Phoenix, Arizona
- Credit Score: 720
- Down Payment: 25%
- Investment Experience: Some Experience

### API Testing

```bash
# Health check
curl http://localhost:3001/api/health

# Chat test
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What lenders do you recommend for investment properties?",
    "buyerProfile": {
      "propertyValue": 500000,
      "propertyType": "single_family",
      "creditScore": 700,
      "downPaymentPercent": "20"
    }
  }'

# Lender matching test
curl -X POST http://localhost:3001/api/match \
  -H "Content-Type: application/json" \
  -d '{
    "propertyValue": 500000,
    "propertyType": "single_family",
    "propertyLocation": "Phoenix, Arizona",
    "creditScore": 700,
    "downPaymentPercent": "20",
    "investmentExperience": "some_experience"
  }'
```

## 📊 Monitoring & Performance

### Cost Tracking

#### OpenAI API Costs:
- **GPT-4**: ~$0.03 per 1K input tokens, ~$0.06 per 1K output tokens
- **Typical query**: ~10,000 input tokens + 1,000 output tokens = ~$0.36 per query
- **Monitor usage**: [platform.openai.com/usage](https://platform.openai.com/usage)

#### REmine API Costs:
- Contact REmine for pricing information
- Caching is implemented to reduce API calls

### Performance Metrics
- **Response times**: Typically 2-5 seconds for lender matching
- **Rate limits**: 100 requests per 15 minutes (configurable)
- **Caching**: REmine API responses cached for 1 hour (configurable)

### Logging

Backend logs are written to:
- `backend/server.log` - General server logs
- `backend/server_debug.log` - Debug information

## 🐛 Troubleshooting

### Common Issues

#### "OpenAI API key not found"
- Ensure `.env` file exists in `backend` directory
- Verify `OPENAI_API_KEY` is set correctly (no quotes, no spaces)
- Restart the backend server after changing `.env`

#### "CORS errors"
- Backend includes CORS middleware for local development
- For production, ensure proper CORS configuration
- Check that frontend URL is allowed in backend CORS settings

#### "Rate limit exceeded"
- Increase rate limit settings in environment variables
- Implement user authentication for higher limits
- Consider implementing request queuing

#### "REmine API errors"
- Verify `REMINE_API_KEY` is set correctly
- Check `REMINE_API_BASE_URL` matches your REmine endpoint
- Review API logs in `backend/server_debug.log`
- Ensure API key has proper permissions

#### "Failed to fetch" or Network Errors
- Verify backend server is running (`npm start` in backend directory)
- Check backend URL in `script.js` matches your deployment
- For local development, ensure frontend is served via HTTP server (not file://)
- Check browser console for detailed error messages

### Debug Mode

Set `NODE_ENV=development` in `.env` to see:
- Detailed error messages
- API request/response logs
- Debug information in console

### Browser Console

Check browser developer console (F12) for:
- API connection status
- Error messages
- Network request details
- LocalStorage contents

## 📁 Project Structure

```
MVP/
├── backend/
│   ├── chatbot-api.js          # Main Express server
│   ├── remine-service.js       # REmine API integration
│   ├── package.json            # Backend dependencies
│   ├── vercel.json             # Vercel deployment config
│   ├── .env                    # Environment variables (create this)
│   ├── server.log              # Server logs
│   └── server_debug.log        # Debug logs
├── lender_details/             # Lender program documentation
│   ├── ACRA Lending/
│   ├── Angel Oak/
│   ├── Comprehensive/          # Normalized lender database
│   ├── HomeExpress/
│   └── ...
├── index.html                  # Main HTML file
├── script.js                   # Frontend JavaScript
├── styles.css                  # Styling
├── README.md                   # This file
└── GEMINI_SETUP_GUIDE.md      # Alternative API setup (if needed)
```

## 🔐 Security Best Practices

### Development
- ✅ Never commit `.env` files to version control
- ✅ Use environment variables for all API keys
- ✅ Implement rate limiting on API endpoints
- ✅ Validate and sanitize user inputs

### Production
- ✅ Use HTTPS for all API communications
- ✅ Implement proper CORS policies
- ✅ Use secure environment variable management
- ✅ Monitor API usage and costs
- ✅ Implement authentication for sensitive endpoints
- ✅ Regular security updates for dependencies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details.

## 📞 Support

For questions or issues:
- Check the troubleshooting section above
- Review OpenAI API documentation: [platform.openai.com/docs](https://platform.openai.com/docs)
- Review REmine API documentation (if applicable)
- Check browser console and server logs for error details
- Test with the provided scenarios

## 🎓 Additional Resources

- **OpenAI API Documentation**: [platform.openai.com/docs](https://platform.openai.com/docs)
- **OpenAI Pricing**: [openai.com/pricing](https://openai.com/pricing)
- **Express.js Documentation**: [expressjs.com](https://expressjs.com/)
- **Vercel Deployment Guide**: [vercel.com/docs](https://vercel.com/docs)

---

**Built with ❤️ for real estate investors**

*Last updated: January 2025*
