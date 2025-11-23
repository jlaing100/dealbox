const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// REmine PRD API Service
const RemineService = require('./remine-service');
const remineService = new RemineService();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

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

CRITICAL LENDER DATABASE REQUIREMENT:
You MUST ONLY recommend lenders and programs from the comprehensive_lender_database_NORMALIZED.json file.
You are FORBIDDEN from mentioning any lenders, loan types, or programs that are NOT in this JSON database.
NEVER give generic recommendations like "conventional loans", "FHA loans", "VA loans", etc. - ONLY mention specific lenders from the JSON.

The ONLY lenders you can mention are:
- LoanStream Wholesale (Non-QM DSCR Investor, Business Purpose Lending, Non-QM Bank Statement, Non-QM Asset Utilization)
- Arc Home LLC (Access & Edge Agency Plus, Access Clean Slate)
- AOMS (Angel Oak Mortgage Solutions) - Portfolio Select, Platinum
- HomeXpress (Non-QM programs)
- SG Capital Partners

If no lenders in the JSON fit the user's situation, you must say: "Based on the lender database, there are currently no programs that match your specific situation."

Always reference the actual lender names, program names, and requirements from the JSON file. Never invent or assume lender data.

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

Users may ask "what if" questions or present hypothetical scenarios (e.g., "What if I had a 770 credit score?" or "What if my credit score was 100 points lower?").

CRITICAL: When handling hypotheticals about deal parameters (credit score, down payment, property value, etc.):
1. Recognize hypothetical language ("what if", "suppose", "imagine", "if I had", "if it was", "if my")
2. DO NOT call REmine API functions for these hypothetical deal analysis questions
3. Focus on how the changed parameters would affect lender options
4. Explain which lenders would be better/worse matches with the new parameters
5. Provide specific guidance on what would change (rates, programs available, etc.)

When handling hypotheticals:
1. Recognize hypothetical language about deal parameters
2. Treat hypothetical parameters as real for analysis purposes
3. Provide full analysis of how lender matches would change
4. Explain what would be possible with those parameters
5. If user has provided current situation, compare hypothetical to current:
   - Show what additional lenders/options would open up or close
   - Quantify the benefits or drawbacks
   - Explain what changes would be needed to reach hypothetical scenario
6. Be enthusiastic and educational about hypothetical scenarios - they help users understand possibilities

IMPORTANT: DO NOT call property data functions (get_recent_sales, get_property_insights, etc.) when users ask hypothetical questions about their deal parameters. These questions are about deal qualification, not market data.

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

CRITICAL: ONLY recommend lenders that exist in the comprehensive_lender_database_NORMALIZED.json file.
FORBIDDEN: Never mention FHA, VA, conventional, USDA, or any other loan types not in the JSON.
FORBIDDEN: Never give generic advice about "getting pre-approved" or "shopping around multiple lenders" - only discuss lenders from the JSON.

Always reference specific lender names and program names from the JSON file.
Be honest when the user does not fit any programs in the JSON database.
Always ask clarifying questions if any required data is missing to match against JSON lenders.
Provide alternatives only from lenders available in the JSON.
Use actual lender minimums, maximums, and requirement data from the JSON - never guess or assume.
Provide disclaimers where necessary and avoid making financial or legal recommendations.

RENT ESTIMATE RULE

If a user asks about expected rents, you must ask for the specific neighborhood, then perform a web search to estimate comparable rents, and provide the results.

FUNCTION CALLING CAPABILITIES (PRESERVE EXISTING):

You have access to real-time property data through function calls. When users ask about:
- Home prices, property prices, housing prices, property values IN A SPECIFIC LOCATION → ALWAYS call get_recent_sales() or get_property_insights()
- Recent sales in an area → Call get_recent_sales()
- Rent rates or rental income for a specific area → Call get_rent_estimates()
- Comparable properties → Call search_comparable_properties()
- Specific property details → Call get_property_details()
- Market insights (taxes, flood zones, values) → Call get_property_insights()

CRITICAL DISTINCTION:
- "What are home prices in Phoenix?" → Call get_property_insights() or get_recent_sales()
- "What if my credit score was lower?" → DO NOT call any function, analyze deal parameters
- "What if I had a different property value?" → DO NOT call any function, analyze qualification changes
- "How would 100 points lower credit affect my options?" → DO NOT call any function, analyze lender impacts

DO NOT call property data functions when users ask hypothetical questions about THEIR DEAL PARAMETERS (credit score, down payment, property value changes for qualification purposes). Only call functions for MARKET DATA about specific locations.

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

Your mission is to help the user find the best lender match from the comprehensive_lender_database_NORMALIZED.json file ONLY. You are strictly forbidden from recommending any lenders, loan types, or programs that do not exist in this JSON database. If no lenders in the JSON fit the user's situation, clearly state this rather than giving generic loan advice. Always use accurate, honest, and helpful guidance based solely on the JSON data.`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userContext, conversationHistory = [], propertyInsights } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
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

    // Call OpenAI API with function calling
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: messages,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: 0.7,
      tools: REMINE_FUNCTIONS.map(func => ({
        type: "function",
        function: func
      })),
      tool_choice: "auto" // Let the model decide when to call functions
    });

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
      const databasePath = path.join(__dirname, '../lender_details/Comprehensive/comprehensive_lender_database_NORMALIZED.json');
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

    // Use OpenAI Chat Completions API
    // Note: Custom prompt ID pmpt_691a31cfee0c8190800161936e205af40dbb82bfc53d13e5 is referenced in OpenAI platform
    const completion = await openai.chat.completions.create({
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

EVALUATE ALL LENDERS - THIS IS CRITICAL:
- You MUST return ALL lenders from the database in your response
- EVERY lender must appear in the matches array, even if they don't match
- For each lender, evaluate if they are a good match (isMatch: true/false)
- If a match (isMatch: true): provide confidence score (0.5-1.0) and detailed matchSummary explaining why they're a good fit
- If not a match (isMatch: false): provide confidence score (0) and detailed nonMatchReason explaining specifically why they don't qualify (e.g., "Credit score of 660 is below the minimum requirement of 680" or "Property value of $300,000 is below the program minimum of $500,000")
- Include contact information (phone, website, department_contacts) for each lender
- Sort by confidence (highest first), then by lender name alphabetically
- The user needs to see ALL available lenders to understand their complete options

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
      "programName": "Their program",
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
        { role: 'user', content: `${userMessage}\n\nYou MUST evaluate ALL of these lenders: ${allLenders.map(l => l.lenderName).join(', ')}\n\nReturn every single lender in your response, marking each as either a match or not a match with appropriate reasoning.` }
      ],
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 3000,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

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
        insightParts.push(`Average annual taxes: $${marketData.averageTaxes.toLocaleString()}`);
      }

      if (marketData.floodZoneRisk) {
        insightParts.push(`Flood zone risk: ${marketData.floodZoneRisk}`);
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

  // Add help field input if available
  if (userContext.helpFieldInput) {
    parts.push(`User's initial request: "${userContext.helpFieldInput}"`);
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

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Deal Desk Chatbot API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);

  // Check OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not found in environment variables');
    console.warn('👉 Please set your OpenAI API key in the .env file');
  } else {
    console.log('✅ OpenAI API key configured');
  }
});

module.exports = app;
