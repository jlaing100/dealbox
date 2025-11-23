const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const OpenAI = require('openai');

// Environment variable validation
function validateEnvironmentVariables() {
  const requiredVars = ['OPENAI_API_KEY'];
  const optionalVars = ['REMINE_API_KEY'];
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName] || process.env[varName] === 'dummy-key-for-local-testing') {
      missing.push(varName);
    }
  }

  // Check optional variables
  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      warnings.push(`${varName} not set - some features will be limited`);
    }
  }

  return { missing, warnings };
}

// Initialize OpenAI client with error handling for missing API key
let openai = null;
const envValidation = validateEnvironmentVariables();

if (envValidation.missing.length === 0) {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ OpenAI API initialized successfully');
  } catch (error) {
    console.error('❌ OpenAI client initialization failed:', error.message);
    openai = null;
  }
} else {
  console.error('❌ Missing required environment variables:', envValidation.missing.join(', '));
  console.error('Please set these environment variables in your deployment platform (Vercel, Railway, etc.)');
}

// Log warnings for optional variables
envValidation.warnings.forEach(warning => console.warn('⚠️ ', warning));

// REmine PRD API Service
const RemineService = require('./backend/remine-service');
const remineService = new RemineService();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Requested-With']
}));

// Handle preflight requests explicitly
app.options('*', cors());

// Trust proxy for proper IP detection in production
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' })); // Add payload size limit for security

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Serve static files from root directory
app.use(express.static(path.join(__dirname)));

// Required fields for lender matching validation
const REQUIRED_FIELDS = [
  'propertyValue',
  'propertyType',
  'propertyLocation',
  'creditScore',
  'downPaymentPercent'
];

// Function to validate buyer profile has all required information
function validateBuyerProfile(buyerProfile) {
  if (!buyerProfile || typeof buyerProfile !== 'object') {
    return {
      isValid: false,
      missingFields: [...REQUIRED_FIELDS],
      validationMessage: 'Please provide your buyer profile information.'
    };
  }

  const missingFields = REQUIRED_FIELDS.filter(field => {
    const value = buyerProfile[field];
    return value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '');
  });

  const isValid = missingFields.length === 0;

  let validationMessage = '';
  if (!isValid) {
    const fieldLabels = {
      propertyValue: 'Property Value',
      propertyType: 'Property Type',
      propertyLocation: 'Location',
      creditScore: 'Credit Score',
      downPaymentPercent: 'Down Payment Percentage'
    };

    const missingLabels = missingFields.map(field => fieldLabels[field] || field);
    validationMessage = `Please provide the following information to get lender recommendations: ${missingLabels.join(', ')}.`;
  }

  return {
    isValid,
    missingFields,
    validationMessage
  };
}

// OpenAI Function Definitions for REmine API calls
const REMINE_FUNCTIONS = [
    {
        name: "get_recent_sales",
        description: "Get recent property sales transactions in a specific location. Use this when users ask about recent sales, home prices, property prices, housing prices, property values, what homes sold for, or market activity in an area.",
        parameters: {
            type: "object",
            properties: {
                city: {
                    type: "string",
                    description: "The city name (e.g., 'Alexandria', 'Phoenix')"
                },
                state: {
                    type: "string",
                    description: "The state abbreviation (e.g., 'VA', 'AZ')"
                },
                limit: {
                    type: "number",
                    description: "Number of recent sales to retrieve (default: 10, max: 20)",
                    default: 10
                }
            },
            required: ["city", "state"]
        }
    },
    {
        name: "get_rent_estimates",
        description: "Get estimated rental rates for properties in a specific location. Use this when users ask about rents, rental income, or cash flow potential.",
        parameters: {
            type: "object",
            properties: {
                city: {
                    type: "string",
                    description: "The city name (e.g., 'Alexandria', 'Phoenix')"
                },
                state: {
                    type: "string",
                    description: "The state abbreviation (e.g., 'VA', 'AZ')"
                },
                limit: {
                    type: "number",
                    description: "Number of rent estimates to retrieve (default: 10, max: 20)",
                    default: 10
                }
            },
            required: ["city", "state"]
        }
    },
    {
        name: "search_comparable_properties",
        description: "Find comparable properties in a location based on value and type. Use this when users ask about similar properties or want to see what else is available in an area.",
        parameters: {
            type: "object",
            properties: {
                city: {
                    type: "string",
                    description: "The city name (e.g., 'Alexandria', 'Phoenix')"
                },
                state: {
                    type: "string",
                    description: "The state abbreviation (e.g., 'VA', 'AZ')"
                },
                propertyValue: {
                    type: "number",
                    description: "Target property value for finding comparables (e.g., 500000)"
                },
                propertyType: {
                    type: "string",
                    description: "Property type filter (optional: 'single_family', 'condo', 'multi_family', etc.)"
                },
                limit: {
                    type: "number",
                    description: "Number of comparables to retrieve (default: 10, max: 20)",
                    default: 10
                }
            },
            required: ["city", "state"]
        }
    },
    {
        name: "get_property_details",
        description: "Get detailed information about a specific property address. Use this when users mention a specific street address and want detailed property information.",
        parameters: {
            type: "object",
            properties: {
                address: {
                    type: "string",
                    description: "Full street address (e.g., '123 Main St')"
                },
                city: {
                    type: "string",
                    description: "The city name"
                },
                state: {
                    type: "string",
                    description: "The state abbreviation"
                }
            },
            required: ["address", "city", "state"]
        }
    },
    {
        name: "get_property_insights",
        description: "Get market insights and statistics for a location including average property values, home prices, taxes, and flood zone information. Use this for general market analysis questions, home price inquiries, property value questions, or when users ask about property values in an area.",
        parameters: {
            type: "object",
            properties: {
                city: {
                    type: "string",
                    description: "The city name (e.g., 'Alexandria', 'Phoenix')"
                },
                state: {
                    type: "string",
                    description: "The state abbreviation (e.g., 'VA', 'AZ')"
                },
                propertyValue: {
                    type: "number",
                    description: "Reference property value for market analysis (optional)"
                }
            },
            required: ["city", "state"]
        }
    }
];

// System prompt for the chatbot
const SYSTEM_PROMPT = `You are an expert real estate lending consultant for Deal Desk, a platform that helps real estate investors find the right lenders for their property deals. You communicate like a knowledgeable industry friend: friendly, helpful, professional, and casual.

KNOWLEDGE BASE

You have access to a comprehensive lender database stored in the file:

comprehensive_lender_database_NORMALIZED.json

Always use Retrieval-Augmented Generation (RAG) to pull factual information from this file. Do not guess program data. Use only what is in the JSON.

The JSON includes the following for every lender:

company_name

website

contact_phone

minimum_loan_amount (global lender minimum)

maximum_loan_amount (global lender maximum)

loan_minimums (program-specific minimums, if available)

source_pdfs

The lenders included are: LoanStream Wholesale, Arc Home LLC, AOMS (Angel Oak Mortgage Solutions), HomeXpress, and SG Capital Partners.

ROLE AND COMMUNICATION

You must:

Be friendly, approachable, and helpful.

Use natural conversational language such as "Hey, great question."

Offer guidance like a trusted advisor using industry insight.

Reference actual lender programs and data stored in the JSON.

Never recommend any lenders not found in the JSON.

Always base recommendations on the user's scenario using RAG.

MANDATORY INFORMATION REQUIREMENTS

CRITICAL: Before asking for ANY information, check the "Current user context" message that appears above. The user context shows what information has already been provided.

Required fields for lender matching:
- Property Value
- Property Type
- Location (City, State)
- Credit Score
- Down Payment Percentage

IMPORTANT RULES:
1. Check user context FIRST - if a field is listed in the context, the user has already provided it
2. Only ask for fields that are NOT in the user context
3. Ask for ONE missing field at a time when possible (unless multiple are missing and needed together)
4. Never ask for "loan amount" - it can be calculated from property value and down payment
5. Never ask for "purpose" or "income documentation" - these are not required for lender matching
6. Acknowledge what the user has already provided before asking for missing information

Example good response:
"I can see you've provided property type: single_family, location: Boston, MA, down payment: 20%. To complete your lender recommendations, I just need your credit score."

Example bad response (asking for info already provided):
"I need property type, location, down payment, and credit score" (when user already provided first three)

LOAN MINIMUM RULE

If the user's requested loan amount is below the lowest lender minimum found in your JSON, you must tell the user:

"There are no available lenders that offer loans below that amount."

LOAN AMOUNT VALIDATION RULE

If the loan amount exceeds the lender's maximum, you must notify the user:

"That loan amount is above the maximum available through these lenders."

DEAL OPTIMIZATION GUIDANCE

When users have suboptimal profiles (low credit, insufficient down payment, etc.), proactively help them find the best deal by:

1. Credit Score Optimization:
   - If credit score is below 680: Suggest specific strategies to improve (pay down credit card debt, dispute errors, become authorized user, etc.)
   - Explain how each 20-point improvement opens new lender options
   - Provide timeline estimates for credit improvement

2. Down Payment Optimization:
   - If down payment is below 20%: Suggest saving strategies, alternative property types that require less down payment, or programs that accept lower down payments
   - Explain LTV implications and how more down payment improves rates/terms
   - Suggest creative financing options if applicable

3. Alternative Qualification Paths:
   - If traditional qualification is difficult: Suggest DSCR programs, bank statement programs, asset-based programs
   - Explain documentation alternatives
   - Help users understand which path fits their situation

4. Positioning Strategies:
   - Compare current situation to what's needed for best rates/terms
   - Provide actionable steps to improve position
   - Help users understand trade-offs (proceed now vs. wait to improve)

HYPOTHETICAL SCENARIO HANDLING

Users may ask "what if" questions or present hypothetical scenarios (e.g., "What if I had a 770 credit score and 2mil property?").

When handling hypotheticals:
1. Recognize hypothetical language ("what if", "suppose", "imagine", "if I had")
2. Treat hypothetical parameters as real for analysis purposes
3. Provide full lender recommendations based on hypothetical scenario
4. Explain what would be possible with those parameters
5. If user has provided current situation, compare hypothetical to current:
   - Show what additional lenders/options would open up
   - Quantify the benefits (better rates, lower down payment, etc.)
   - Explain what changes would be needed to reach hypothetical scenario
6. Be enthusiastic about hypothetical scenarios - they help users understand possibilities

LENDER MATCHING CRITERIA

When matching the user to a lender, consider:

Minimum and maximum loan amounts

Credit score requirements

Down payment or LTV

Property type

Documentation type (DSCR, full doc, bank statement, etc.)

Experience level (first-time or experienced investor)

Program-specific minimums (for example, HomeXpress No Ratio $200,000 minimum)

RESPONSE RULES

Only recommend lenders from the JSON.

Always reference specific program names when relevant.

Be honest when the user does not fit a program.

Always ask clarifying questions if any required data is missing.

Provide alternatives when possible.

Use actual lender minimums, maximums, and requirement data from the JSON.

Provide disclaimers where necessary and avoid making financial or legal recommendations.

RENT ESTIMATE RULE

If a user asks about expected rents, you must ask for the specific neighborhood, then perform a web search to estimate comparable rents, and provide the results.

FUNCTION CALLING CAPABILITIES (PRESERVE EXISTING):

You have access to real-time property data through function calls. When users ask about:
- Home prices, property prices, housing prices, property values → ALWAYS call get_recent_sales() or get_property_insights()
- Recent sales in an area → Call get_recent_sales()
- Rent rates or rental income → Call get_rent_estimates()
- Comparable properties → Call search_comparable_properties()
- Specific property details → Call get_property_details()
- Market insights (taxes, flood zones, values) → Call get_property_insights()

CRITICAL: If a user asks about prices, values, or market data for ANY location, you MUST call a function. Do not respond without calling a function first.

LOCATION HANDLING:
- If the user mentions a location, extract city and state from their message
- If a neighborhood is mentioned (e.g., "Kearny Mesa, San Diego"), extract the city (San Diego) and state (CA)
- Common neighborhood patterns: "Neighborhood, City, State" or "City neighborhood" - extract the city name
- If location is ambiguous or missing, ask the user for clarification
- Use the user's form location as a hint when asking for clarification
- Always provide city and state when calling functions

RESPONSE GUIDELINES FOR FUNCTION CALLING:
- ALWAYS call a function when users ask about prices, values, or market data for a location
- Call functions proactively when users ask property-related questions
- Present function results in natural, conversational language
- Reference specific data points (prices, dates, property details) from function results
- If a function call fails or returns no data, explain this to the user and offer alternatives
- Continue the conversation naturally after presenting function results

ESCALATION RULE

If the user asks for legal, tax, underwriting sign-off, or personalized financial advice beyond your scope, you must respond:

"To get personalized and compliant guidance, please call (111) 111-1111 to speak with one of our expert real estate advisors."

MISSION

Your mission is to help the user find the best lender match based on the real data inside comprehensive_lender_database_NORMALIZED.json, using accurate, honest, and helpful guidance.`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userContext, conversationHistory = [], propertyInsights } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if OpenAI is available
    if (!openai) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        response: 'The chat service is currently unavailable. Please try again later or contact our team for assistance.',
        details: process.env.NODE_ENV === 'development' ? 'OpenAI API key not configured' : undefined
      });
    }

    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory.slice(-20)); // Keep last 20 messages to manage token limits
    }

    // Add user context if available
    if (userContext) {
      const contextString = buildContextString(userContext);
      if (contextString) {
        messages.splice(1, 0, {
          role: 'system',
          content: `CRITICAL - User Context Analysis:

${contextString}

MANDATORY INSTRUCTIONS:
1. The "AVAILABLE INFORMATION" section shows what the user HAS ALREADY PROVIDED - DO NOT ask for these fields
2. The "MISSING INFORMATION" section shows what you need to ask for
3. Only ask for fields listed in "MISSING INFORMATION"
4. If "MISSING INFORMATION" is empty, the user has provided everything needed - proceed with lender recommendations
5. Acknowledge what's available before asking for what's missing
6. Never repeat requests for information that's already in the AVAILABLE section

The frontend will automatically update lender matches when parameters change.`
        });
      }
    }

    // Add property insights if available
    if (propertyInsights) {
      const insightsContext = buildPropertyInsightsContext(propertyInsights);
      if (insightsContext) {
        messages.splice(1, 0, {
          role: 'system',
          content: `Property market intelligence: ${insightsContext}`
        });
      }
    }

    // Check if user mentioned a specific property address
    const addressMatch = extractAddressFromMessage(message);
    if (addressMatch && !propertyInsights) {
      try {
        console.log('User mentioned property address, fetching REmine data:', addressMatch);
        const propertyData = await remineService.getPropertyInsights(addressMatch.city, addressMatch.state, 500000); // Default value
        if (propertyData && propertyData.insights) {
          const propertyContext = buildPropertyInsightsContext(propertyData);
          // Find specific property if they mentioned a street address
          let specificPropertyInfo = '';
          if (addressMatch.street && propertyData.comparables) {
            const matchingProperty = propertyData.comparables.find(prop =>
              prop.address && prop.address.toLowerCase().includes(addressMatch.street.toLowerCase())
            );
            if (matchingProperty) {
              specificPropertyInfo = ` Specific property details: ${matchingProperty.address} - Value: $${matchingProperty.value?.toLocaleString() || 'Unknown'}, ${matchingProperty.bedrooms || 'Unknown'} bed, ${matchingProperty.bathrooms || 'Unknown'} bath, ${matchingProperty.squareFootage || 'Unknown'} sq ft, built ${matchingProperty.yearBuilt || 'Unknown'}.`;
            }
          }
          messages.splice(1, 0, {
            role: 'system',
            content: `Property information for ${addressMatch.fullAddress}: ${propertyContext}${specificPropertyInfo}`
          });
        }
      } catch (error) {
        console.warn('Failed to fetch property data for mentioned address:', error.message);
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: message });

    // Call OpenAI API with function calling and timeout
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: messages,
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
        temperature: 0.7,
        tools: REMINE_FUNCTIONS.map(func => ({
          type: "function",
          function: func
        })),
        tool_choice: "auto" // Let the model decide when to call functions
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API request timed out')), 25000)
      )
    ]);

    const responseMessage = completion.choices[0].message;

    // Handle function calls
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Add the assistant's message with function calls to conversation
      messages.push(responseMessage);

      // Execute all function calls
      for (const toolCall of responseMessage.tool_calls) {
        try {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log(`Executing function: ${functionName}`, functionArgs);

          let functionResult;

          // Execute the appropriate function
          switch (functionName) {
            case 'get_recent_sales':
              functionResult = await remineService.getTransactionsForLocation(
                functionArgs.city,
                functionArgs.state,
                functionArgs.limit || 10
              );
              break;

            case 'get_rent_estimates':
              functionResult = await remineService.getRentEstimatesForLocation(
                functionArgs.city,
                functionArgs.state,
                functionArgs.limit || 10
              );
              break;

            case 'search_comparable_properties':
              functionResult = await remineService.searchComparableProperties(
                functionArgs.city,
                functionArgs.state,
                functionArgs.propertyValue || 500000,
                functionArgs.propertyType,
                functionArgs.limit || 10
              );
              break;

            case 'get_property_details':
              functionResult = await remineService.getPropertyKey({
                street: functionArgs.address,
                city: functionArgs.city,
                state: functionArgs.state
              }).then(async (propertyKey) => {
                if (propertyKey) {
                  return await remineService.getBuildingData(propertyKey);
                }
                throw new Error('Property not found');
              });
              break;

            case 'get_property_insights':
              functionResult = await remineService.getPropertyInsights(
                functionArgs.city,
                functionArgs.state,
                functionArgs.propertyValue || 500000
              );
              break;

            default:
              throw new Error(`Unknown function: ${functionName}`);
          }

          // Add function result to conversation
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(functionResult)
          });

        } catch (error) {
          console.error(`Function call failed: ${toolCall.function.name}`, error);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: `Failed to execute ${toolCall.function.name}: ${error.message}`,
              suggestion: "Try rephrasing your question or asking about a different location."
            })
          });
        }
      }

      // Get final response from AI with function results
      const finalCompletion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: messages,
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
        temperature: 0.7,
      });

      var response = finalCompletion.choices[0].message.content;

    } else {
      // No function calls, use the direct response
      var response = responseMessage.content;
    }

    // Return response with metadata
    res.json({
      response: response,
      timestamp: new Date().toISOString(),
      model: completion.model,
      tokens: {
        prompt: completion.usage.prompt_tokens,
        completion: completion.usage.completion_tokens,
        total: completion.usage.total_tokens
      }
    });

  } catch (error) {
    console.error('OpenAI API Error:', error);

    // Handle different types of errors
    if (error.status === 401) {
      return res.status(500).json({
        error: 'Invalid API key. Please check your OpenAI API key configuration.'
      });
    } else if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.'
      });
    } else if (error.status === 400) {
      return res.status(400).json({
        error: 'Invalid request. Please check your message format.'
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

// Lender matching endpoint using OpenAI Assistant API
app.post('/api/match-lenders', async (req, res) => {
  try {
    const { buyerProfile, propertyInsights } = req.body;

    if (!buyerProfile) {
      return res.status(400).json({ error: 'Buyer profile is required' });
    }

    // Check if OpenAI is available
    if (!openai) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Lender matching service is currently unavailable. Please try again later.',
        matches: [],
        details: process.env.NODE_ENV === 'development' ? 'OpenAI API key not configured' : undefined
      });
    }

    // Validate required fields
    const validation = validateBuyerProfile(buyerProfile);
    if (!validation.isValid) {
      return res.json({
        requiresMoreInfo: true,
        missingFields: validation.missingFields,
        message: validation.validationMessage,
        matches: []
      });
    }

    // Build user message with buyer profile and property insights
    let userMessage = `Find matching lenders for this buyer profile:

Property Value: $${buyerProfile.propertyValue?.toLocaleString() || 'Not specified'}
Property Type: ${buyerProfile.propertyType || 'Not specified'}
Location: ${buyerProfile.propertyLocation || 'Not specified'}
Down Payment: ${buyerProfile.downPaymentPercent || 'Not specified'}%
Property Vacant: ${buyerProfile.propertyVacant || 'Not specified'}
Current Rent: $${buyerProfile.currentRent?.toLocaleString() || 'Not specified'}/month
Credit Score: ${buyerProfile.creditScore || 'Not specified'}
Investment Experience: ${buyerProfile.investmentExperience || 'Not specified'}
Additional Details: ${buyerProfile.additionalDetails || 'None'}`;

    // Add property insights if available
    if (propertyInsights) {
      userMessage += '\n\nProperty Market Intelligence:';

      if (propertyInsights.location) {
        userMessage += `\nLocation: ${propertyInsights.location.city}, ${propertyInsights.location.state}`;
      }

      if (propertyInsights.insights) {
        const insights = propertyInsights.insights;

        if (insights.averageValue) {
          userMessage += `\nAverage Property Value: $${insights.averageValue.toLocaleString()}`;
        }

        if (insights.averageTaxes) {
          userMessage += `\nAverage Annual Taxes: $${insights.averageTaxes.toLocaleString()}`;
        }

        if (insights.floodZoneRisk) {
          userMessage += `\nFlood Zone Risk: ${insights.floodZoneRisk}`;
        }

        if (insights.averageSquareFootage) {
          userMessage += `\nAverage Square Footage: ${insights.averageSquareFootage.toLocaleString()} sq ft`;
        }

        if (insights.averageYearBuilt) {
          userMessage += `\nAverage Property Age: ${new Date().getFullYear() - insights.averageYearBuilt} years`;
        }

        if (insights.propertyTypes && insights.propertyTypes.length > 0) {
          userMessage += `\nCommon Property Types: ${insights.propertyTypes.join(', ')}`;
        }
      }

      if (propertyInsights.comparables && propertyInsights.comparables.length > 0) {
        userMessage += `\nComparable Properties Analyzed: ${propertyInsights.comparables.length}`;
      }
    }

    // Load all lenders from the database
    const fs = require('fs');
    const path = require('path');

    let allLenders = [];
    try {
      const databasePath = path.join(__dirname, 'lender_details/Comprehensive/comprehensive_lender_database_NORMALIZED.json');
      const databaseContent = fs.readFileSync(databasePath, 'utf8');
      const database = JSON.parse(databaseContent);

      // Extract all lenders from the database
      allLenders = Object.entries(database.lenders || {}).map(([key, lenderData]) => ({
        lenderKey: key,
        lenderName: lenderData.company_name || key,
        website: lenderData.website || null,
        contact_phone: lenderData.contact_phone || null,
        department_contacts: lenderData.department_contacts || null,
        programs: lenderData.loan_programs || lenderData.programs || [],
        specialty: lenderData.specialty || '',
        maximum_loan_amount: lenderData.maximum_loan_amount || null,
        minimum_loan_amount: lenderData.minimum_loan_amount || null
      }));
    } catch (error) {
      console.error('Error loading lender database:', error);
      allLenders = []; // Fallback to empty array
    }

    // Use OpenAI Chat Completions API with timeout
    // Note: Custom prompt ID pmpt_691a31cfee0c8190800161936e205af40dbb82bfc53d13e5 is referenced in OpenAI platform
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert real estate lending consultant for Deal Desk. You have access to a comprehensive lender database with detailed information about all available lenders in the system.

You also have access to property market intelligence that may include:
- Average property values and tax rates in the area
- Flood zone information and risk assessments
- Property characteristics and market trends
- Comparable property data

Consider this property intelligence when making lender recommendations. For example:
- Properties in flood zones may require additional insurance considerations
- High tax areas may affect DTI calculations
- Market trends can inform investment property recommendations

IMPORTANT: You are using custom prompt ID: pmpt_691a31cfee0c8190800161936e205af40dbb82bfc53d13e5 which contains enhanced lender database information. Use this comprehensive knowledge to provide accurate recommendations.

CRITICAL REQUIREMENTS:
- Required fields: Property Value, Property Type, Location, Credit Score, Down Payment Percentage
- If ANY required information is missing, you MUST ask the user for it before providing lender recommendations
- Do not provide lender matches until ALL required information is provided
- Politely ask for missing information and explain why it's needed

EVALUATE ALL LENDERS:
- Return ALL lenders from the database, not just matches
- For each lender, evaluate if they are a good match (isMatch: true/false)
- If a match (isMatch: true): provide confidence score (0-1) and detailed matchSummary
- If not a match (isMatch: false): provide confidence score (0) and detailed nonMatchReason
- Include contact information (phone, website, department_contacts) for each lender
- Sort by confidence (matches first, then non-matches)

Return your response as valid JSON in this exact format:

{
  "matches": [
    {
      "lenderName": "Exact lender company name",
      "programName": "Specific program name",
      "confidence": 0.85,
      "isMatch": true,
      "matchSummary": "Why this lender is a good match for this buyer",
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
      "isMatch": false,
      "confidence": 0.0,
      "matchSummary": null,
      "nonMatchReason": "Why this lender is not a good match",
      "website": "https://anotherlender.com",
      "contact_phone": "another phone"
    }
  ]
}

Return ALL lenders sorted by confidence (highest first), then by lender name.`
          },
          { role: 'user', content: `${userMessage}\n\nAvailable lenders to evaluate: ${allLenders.map(l => l.lenderName).join(', ')}` }
        ],
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 3000,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API request timed out')), 25000)
      )
    ]);

    const responseText = completion.choices[0].message.content;
    console.log('Raw OpenAI Response:', responseText);

    // Parse JSON response
    let matches;
    try {
      // Remove markdown code blocks if present
      let cleanResponse = responseText.trim();
      console.log('Clean response before processing:', cleanResponse);

      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
      }
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      cleanResponse = cleanResponse.trim();

      console.log('Clean response after processing:', cleanResponse);

      const parsed = JSON.parse(cleanResponse);
      matches = parsed.matches || [];
      console.log('Parsed matches:', matches);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('Raw response text:', responseText);
      throw new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
    }

    // Return matches
    res.json({
      matches: matches,
      timestamp: new Date().toISOString(),
      model: completion.model || 'gpt-4o',
      threadId: typeof thread !== 'undefined' ? thread.id : null
    });

  } catch (error) {
    console.error('OpenAI Assistant Matching Error:', error);

    // Handle different types of errors
    if (error.status === 401) {
      return res.status(500).json({
        error: 'Invalid API key. Please check your OpenAI API key configuration.',
        matches: []
      });
    } else if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        matches: []
      });
    } else {
      return res.status(500).json({
        error: 'Failed to get lender matches. Please try again.',
        matches: [],
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

// REmine API Endpoints

// Search for comparable properties
app.post('/api/remine/search-comparables', async (req, res) => {
  try {
    const { city, state, propertyValue, propertyType } = req.body;

    if (!city || !state || !propertyValue) {
      return res.status(400).json({
        error: 'City, state, and property value are required'
      });
    }

    const comparables = await remineService.searchComparableProperties(
      city,
      state,
      parseFloat(propertyValue),
      propertyType
    );

    res.json({
      comparables,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('REmine comparables search error:', error);
    res.status(500).json({
      error: 'Failed to search comparable properties',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get property insights for location
app.post('/api/remine/property-insights', async (req, res) => {
  try {
    const { city, state, propertyValue, propertyType } = req.body;

    if (!city || !state || !propertyValue) {
      return res.status(400).json({
        error: 'City, state, and property value are required'
      });
    }

    const insights = await remineService.getPropertyInsights(
      city,
      state,
      parseFloat(propertyValue),
      propertyType
    );

    res.json({
      insights,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('REmine property insights error:', error);
    res.status(500).json({
      error: 'Failed to get property insights',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get detailed property data by address
app.post('/api/remine/property-details', async (req, res) => {
  try {
    const { address, propertyKey } = req.body;

    if (!address && !propertyKey) {
      return res.status(400).json({
        error: 'Either address or property key is required'
      });
    }

    let propertyKeyToUse = propertyKey;

    // If address provided but no property key, resolve it
    if (address && !propertyKeyToUse) {
      propertyKeyToUse = await remineService.getPropertyKey(address);
    }

    // Fetch all available property data
    const [buildingData, taxData, mortgageData] = await Promise.all([
      remineService.getBuildingData(propertyKeyToUse).catch(err => {
        console.warn('Building data fetch failed:', err.message);
        return null;
      }),
      remineService.getTaxData(propertyKeyToUse).catch(err => {
        console.warn('Tax data fetch failed:', err.message);
        return null;
      }),
      remineService.getMortgageData(propertyKeyToUse).catch(err => {
        console.warn('Mortgage data fetch failed:', err.message);
        return null;
      })
    ]);

    res.json({
      propertyKey: propertyKeyToUse,
      building: buildingData,
      tax: taxData,
      mortgages: mortgageData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('REmine property details error:', error);
    res.status(500).json({
      error: 'Failed to get property details',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Helper function to build context string from user data
function buildContextString(userContext) {
  const parts = [];

  // Define required fields
  const REQUIRED_FIELDS = {
    propertyValue: 'Property Value',
    propertyType: 'Property Type',
    propertyLocation: 'Location',
    creditScore: 'Credit Score',
    downPaymentPercent: 'Down Payment Percentage'
  };

  // CRITICAL: Add conversation changes first (highest priority)
  if (userContext.conversationChanges) {
    parts.push(`IMPORTANT - ${userContext.conversationChanges}`);
  }

  if (userContext.formData) {
    const form = userContext.formData;
    const available = [];
    const missing = [];

    // Check each required field
    Object.entries(REQUIRED_FIELDS).forEach(([key, label]) => {
      const value = form[key];
      if (value !== null && value !== undefined && value !== '') {
        if (key === 'propertyValue') {
          available.push(`${label}: $${value.toLocaleString()}`);
        } else if (key === 'downPaymentPercent') {
          available.push(`${label}: ${value}%`);
        } else {
          available.push(`${label}: ${value}`);
        }
      } else {
        missing.push(label);
      }
    });

    if (available.length > 0) {
      parts.push(`AVAILABLE INFORMATION: ${available.join(', ')}`);
    }
    if (missing.length > 0) {
      parts.push(`MISSING INFORMATION: ${missing.join(', ')}`);
    }

    // Add optional fields if present
    const optional = [];
    if (form.propertyVacant) optional.push(`Property vacant: ${form.propertyVacant}`);
    if (form.currentRent) optional.push(`Current rent: $${form.currentRent.toLocaleString()}/month`);
    if (form.investmentExperience) optional.push(`Investment experience: ${form.investmentExperience}`);
    if (form.additionalDetails) optional.push(`Additional details: ${form.additionalDetails}`);
    if (optional.length > 0) {
      parts.push(`Additional details: ${optional.join(', ')}`);
    }
  }

  if (userContext.lenderMatches && userContext.lenderMatches.length > 0) {
    const lenders = userContext.lenderMatches.map(match => match.lenderName).join(', ');
    parts.push(`Previously recommended lenders: ${lenders}`);
  }

  // Add property insights from REmine API
  if (userContext.propertyInsights) {
    const insights = userContext.propertyInsights;
    const insightParts = [];

    if (insights.location) {
      insightParts.push(`Market data for ${insights.location.city}, ${insights.location.state}`);
    }

    if (insights.insights) {
      const marketData = insights.insights;

      if (marketData.averageValue) {
        insightParts.push(`Average property value: $${marketData.averageValue.toLocaleString()}`);
      }

      if (marketData.averageTaxes) {
        insightParts.push(`Average annual property taxes: $${marketData.averageTaxes.toLocaleString()}`);
      }

      if (marketData.floodZoneRisk) {
        insightParts.push(`Flood zone risk level: ${marketData.floodZoneRisk}`);
      }

      if (marketData.averageSquareFootage) {
        insightParts.push(`Average square footage: ${marketData.averageSquareFootage.toLocaleString()} sq ft`);
      }

      if (marketData.averageYearBuilt) {
        insightParts.push(`Average property age: ${new Date().getFullYear() - marketData.averageYearBuilt} years`);
      }

      if (marketData.propertyTypes && marketData.propertyTypes.length > 0) {
        insightParts.push(`Common property types: ${marketData.propertyTypes.join(', ')}`);
      }
    }

    if (insights.comparables && insights.comparables.length > 0) {
      const compCount = insights.comparables.length;
      insightParts.push(`${compCount} comparable propert${compCount > 1 ? 'ies' : 'y'} analyzed`);
    }

    if (insightParts.length > 0) {
      parts.push(`Property market insights: ${insightParts.join(', ')}`);
    }
  }

  return parts.join('. ');
}

// Helper function to normalize state names/abbreviations
function normalizeState(stateInput) {
  if (!stateInput) return null;

  const state = stateInput.trim();

  // State name to abbreviation mapping
  const stateMap = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY'
  };

  // If already an abbreviation (2 letters), return uppercase
  if (state.length === 2) {
    return state.toUpperCase();
  }

  // Try to find in state map
  const normalized = state.toLowerCase();
  return stateMap[normalized] || state.toUpperCase();
}

// Helper function to extract city from neighborhood patterns
function extractCityFromNeighborhood(locationString) {
  // Pattern: "Neighborhood, City, State" - extract City
  const neighborhoodPattern = /^([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z][a-z]+|[A-Z]{2})$/i;
  const match = locationString.match(neighborhoodPattern);

  if (match && match.length === 4) {
    // match[1] = neighborhood, match[2] = city, match[3] = state
    return {
      neighborhood: match[1].trim(),
      city: match[2].trim(),
      state: normalizeState(match[3])
    };
  }

  return null;
}

// Helper function to extract location from function arguments
function extractLocationFromFunctionArgs(functionArgs) {
  if (!functionArgs) return null;

  // Check if location parameters are provided in the function call
  if (functionArgs.city && functionArgs.state) {
    // Check if city might be a neighborhood pattern
    const cityState = `${functionArgs.city}, ${functionArgs.state}`;
    const neighborhoodMatch = extractCityFromNeighborhood(cityState);

    if (neighborhoodMatch) {
      return {
        city: neighborhoodMatch.city,
        state: neighborhoodMatch.state,
        neighborhood: neighborhoodMatch.neighborhood,
        fullAddress: `${neighborhoodMatch.city}, ${neighborhoodMatch.state}`
      };
    }

    return {
      city: functionArgs.city,
      state: normalizeState(functionArgs.state),
      fullAddress: `${functionArgs.city}, ${normalizeState(functionArgs.state)}`
    };
  }

  return null;
}

// Helper function to build property insights context string
function extractAddressFromMessage(message) {
  // Look for patterns like "123 Main St, City, State" or "property at 123 Main St in City, State"
  // Also handle city/state mentions without street addresses
  const addressPatterns = [
    // "123 Main St, Springfield, IL"
    /(\d+)\s+([A-Za-z0-9\s]+),\s*([A-Za-z\s]+),\s*([A-Z]{2})/i,
    // "123 Main St in Springfield, IL"
    /(\d+)\s+([A-Za-z0-9\s]+)\s+in\s+([A-Za-z\s]+),\s*([A-Z]{2})/i,
    // "property at 123 Main St, Springfield, IL"
    /property\s+at\s+(\d+)\s+([A-Za-z0-9\s]+),\s*([A-Za-z\s]+),\s*([A-Z]{2})/i,
    // "123 Main St Springfield IL"
    /(\d+)\s+([A-Za-z0-9\s]+)\s+([A-Za-z\s]+)\s+([A-Z]{2})/i,
    // "properties in Alexandria, Virginia" or "Alexandria, Virginia"
    /(?:properties?\s+in\s+|rents?\s+in\s+|sales?\s+in\s+|prices?\s+in\s+|homes?\s+in\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z][a-z]+|[A-Z]{2})/i,
    // "in New Orleans, LA" or "for Phoenix, Arizona"
    /(?:in|for|around|near)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z][a-z]+|[A-Z]{2})/i,
    // "Kearny Mesa, San Diego" or "neighborhood, City, State" - extract city and state
    /([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z][a-z]+|[A-Z]{2})/i
  ];

  for (const pattern of addressPatterns) {
    const match = message.match(pattern);
    if (match) {
      // Check if this is a street address pattern (has street number) or just city/state
      if (match.length === 5 && /^\d+$/.test(match[1])) {
        // Street address pattern
        const streetNumber = match[1];
        const streetName = match[2].trim();
        const city = match[3].trim();
        const state = match[4];

        return {
          fullAddress: `${streetNumber} ${streetName}, ${city}, ${state}`,
          street: `${streetNumber} ${streetName}`,
          city: city,
          state: state
        };
      } else if (match.length === 3) {
        // City, State pattern
        const city = match[1].trim();
        const state = normalizeState(match[2]);

        return {
          fullAddress: `${city}, ${state}`,
          street: null,
          city: city,
          state: state
        };
      } else if (match.length === 4 && !/^\d+$/.test(match[1])) {
        // Neighborhood, City, State pattern (e.g., "Kearny Mesa, San Diego, CA")
        const neighborhood = match[1].trim();
        const city = match[2].trim();
        const state = normalizeState(match[3]);

        return {
          fullAddress: `${city}, ${state}`,
          street: null,
          city: city,
          state: state,
          neighborhood: neighborhood
        };
      }
    }
  }

  return null;
}

function buildPropertyInsightsContext(propertyInsights) {
  const parts = [];

  if (propertyInsights.location) {
    parts.push(`Market data for ${propertyInsights.location.city}, ${propertyInsights.location.state}`);
  }

  if (propertyInsights.insights) {
    const insights = propertyInsights.insights;

    if (insights.averageValue) {
      parts.push(`Average property value: $${insights.averageValue.toLocaleString()}`);
    }

    if (insights.averageTaxes) {
      parts.push(`Average annual property taxes: $${insights.averageTaxes.toLocaleString()}`);
    }

    if (insights.floodZoneRisk) {
      parts.push(`Flood zone risk level: ${insights.floodZoneRisk}`);
    }

    if (insights.averageSquareFootage) {
      parts.push(`Typical property size: ${insights.averageSquareFootage.toLocaleString()} sq ft`);
    }

    if (insights.averageYearBuilt) {
      const age = new Date().getFullYear() - insights.averageYearBuilt;
      parts.push(`Average property age: ${age} years`);
    }

    if (insights.propertyTypes && insights.propertyTypes.length > 0) {
      parts.push(`Common property types: ${insights.propertyTypes.join(', ')}`);
    }
  }

  if (propertyInsights.comparables && propertyInsights.comparables.length > 0) {
    parts.push(`${propertyInsights.comparables.length} comparable properties analyzed`);

    // Add specific flood zone information if available
    const floodZones = propertyInsights.comparables
      .filter(comp => comp.building && comp.building.floodZone)
      .map(comp => comp.building.floodZone);

    if (floodZones.length > 0) {
      const uniqueZones = [...new Set(floodZones)];
      parts.push(`Flood zones found in area: ${uniqueZones.join(', ')}`);
    }

    // Add tax range if available
    const taxValues = propertyInsights.comparables
      .filter(comp => comp.tax && comp.tax.annualTaxes)
      .map(comp => comp.tax.annualTaxes);

    if (taxValues.length > 0) {
      const minTax = Math.min(...taxValues);
      const maxTax = Math.max(...taxValues);
      parts.push(`Property tax range: $${minTax.toLocaleString()} - $${maxTax.toLocaleString()}/year`);
    }
  }

  return parts.join('. ');
}

// Enhanced error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Handle different types of errors
  let statusCode = 500;
  let errorMessage = 'Internal server error';

  if (error.message.includes('timeout')) {
    statusCode = 504;
    errorMessage = 'Request timed out';
  } else if (error.message.includes('fetch')) {
    statusCode = 503;
    errorMessage = 'Service temporarily unavailable';
  } else if (error.status) {
    statusCode = error.status;
    errorMessage = error.message;
  }

  res.status(statusCode).json({
    error: errorMessage,
    timestamp: new Date().toISOString(),
    details: isDevelopment ? error.message : undefined
  });
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// SPA fallback: serve index.html for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Deal Desk API is running'
  });
});

// Export for Vercel serverless function
// Vercel serverless function export
module.exports = app;

// For local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🤖 Deal Desk Unified App running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
    console.log(`🏠 Frontend: http://localhost:${PORT}`);

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️  WARNING: OPENAI_API_KEY not found in environment variables');
      console.warn('👉 Please set your OpenAI API key in the .env file');
    } else {
      console.log('✅ OpenAI API key configured');
    }
  });
}
// Deployment trigger: Fri Nov 21 23:43:40 PST 2025
// Force redeployment
