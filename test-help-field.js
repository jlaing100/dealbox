// Test script for help field functionality
const testHelpFieldProcessing = () => {
    console.log('Testing help field information extraction...');

    // Mock the ChatService detectParameterChanges method
    const detectParameterChanges = (message) => {
        const lowerMessage = message.toLowerCase();
        const changes = {
            hasChanges: false,
            creditScore: null,
            downPaymentPercent: null,
            propertyValue: null,
            propertyType: null,
            investmentExperience: null,
            propertyLocation: null
        };

        // Test location detection patterns
        const locationPatterns = [
            // "property in Phoenix, AZ" (abbreviated state)
            /property\s+(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i,
            // "property in Los Angeles, California" (full state name)
            /property\s+(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/i,
            // "loan on a property in Phoenix, AZ" (abbreviated state)
            /loan.*?(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i,
            // "loan on a property in Los Angeles, California" (full state name)
            /loan.*?(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/i,
            // "in Phoenix, AZ" - general preposition (abbreviated)
            /(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i,
            // "in Los Angeles, California" - general preposition (full state)
            /(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/i,
            // "Los Angeles, California" - direct full state pattern
            /([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/i,
            // "Phoenix, AZ" - direct abbreviated pattern
            /,\s*([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i
        ];

        for (const pattern of locationPatterns) {
            const match = message.match(pattern);
            if (match && match.length >= 3) {
                const city = match[1].trim();
                let state = match[2].trim();

                // Convert full state names to abbreviations
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

                // Validate that the state is actually a valid state name
                let finalState = null;
                if (state.length === 2 && /^[A-Z]{2}$/.test(state)) {
                    // Already abbreviated
                    finalState = state.toUpperCase();
                } else if (state.length > 2) {
                    // Check if it's a full state name
                    const normalizedState = state.toLowerCase().split(' ')[0]; // Take first word only
                    finalState = stateMap[normalizedState];
                }

                // Basic validation - city should be reasonable length, valid state
                if (city.length >= 2 && city.length <= 50 && finalState && /^[A-Z]{2}$/.test(finalState)) {
                    changes.propertyLocation = `${city}, ${finalState}`;
                    changes.hasChanges = true;
                    console.log('🔍 Detected location change:', changes.propertyLocation);
                    break;
                }
            }
        }

        // Test other parameter detections (simplified versions)
        // Property value - updated patterns
        const propertyValuePatterns = [
            /property.*?value.*?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /property.*?worth.*?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /valued.*?at.*?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /\$(\d+(?:,\d{3})*(?:\.\d{2})?).*?(?:property|home|house|condo|single family|duplex|triplex|fourplex|townhouse)/i,
            /worth.*?\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /(\d+(?:,\d{3})*(?:\.\d{2})?)k?\s*(?:property|home|house|condo|single family|duplex|triplex|fourplex|townhouse)/i
        ];

        for (const pattern of propertyValuePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const valueStr = match[1].replace(/,/g, '');
                let value = parseFloat(valueStr);
                // Handle "k" suffix (e.g., "500k" -> 500000)
                if (message.toLowerCase().includes('k') && value < 10000) {
                    value *= 1000;
                }
                if (value >= 50000 && value <= 10000000) {
                    changes.propertyValue = value;
                    changes.hasChanges = true;
                    break;
                }
            }
        }

        // Credit score
        const creditMatch = message.match(/credit score.*?(\d{3})/i);
        if (creditMatch) {
            const score = parseInt(creditMatch[1]);
            if (score >= 300 && score <= 850) {
                changes.creditScore = score;
                changes.hasChanges = true;
            }
        }

        // Down payment
        const downPaymentMatch = message.match(/(\d+)%.*?down/i);
        if (downPaymentMatch) {
            const percent = parseInt(downPaymentMatch[1]);
            if (percent >= 0 && percent <= 50) {
                changes.downPaymentPercent = percent;
                changes.hasChanges = true;
            }
        }

        return changes;
    };

    // Test cases
    const testCases = [
        {
            input: "I'm looking for a loan on a $500k single family in Phoenix, AZ. Credit score 720, 20% down",
            expected: {
                propertyValue: 500000,
                propertyLocation: "Phoenix, AZ",
                creditScore: 720,
                downPaymentPercent: 20
            }
        },
        {
            input: "Need financing for a $750,000 property in Los Angeles, California with 25% down payment",
            expected: {
                propertyValue: 750000,
                propertyLocation: "Los Angeles, CA",
                downPaymentPercent: 25
            }
        },
        {
            input: "Looking for lenders for a property in Miami, FL",
            expected: {
                propertyLocation: "Miami, FL"
            }
        }
    ];

    console.log('\nRunning test cases...\n');

    testCases.forEach((testCase, index) => {
        console.log(`Test ${index + 1}: "${testCase.input}"`);
        const result = detectParameterChanges(testCase.input);

        console.log('Detected changes:', result);

        // Check if expected values were detected
        let passed = true;
        for (const [key, expectedValue] of Object.entries(testCase.expected)) {
            if (result[key] !== expectedValue) {
                console.log(`❌ Failed: Expected ${key}=${expectedValue}, got ${result[key]}`);
                passed = false;
            }
        }

        if (passed) {
            console.log('✅ Passed');
        }
        console.log('---');
    });

    console.log('Help field information extraction test completed!');
};

// Run the test
testHelpFieldProcessing();
