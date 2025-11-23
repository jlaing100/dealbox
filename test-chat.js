// Test script for Deal Desk Chatbot
// Run with: node test-chat.js

const https = require('https');
const http = require('http');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_USER_CONTEXT = {
    formData: {
        propertyValue: 1300000,
        propertyType: 'single_family',
        propertyLocation: 'Phoenix, Arizona',
        downPaymentPercent: 20,
        propertyVacant: 'no',
        currentRent: 3500,
        creditScore: 770,
        investmentExperience: 'experienced'
    },
    lenderMatches: [
        {
            lenderName: 'LoanStream Wholesale',
            programName: 'NON-QM DSCR INVESTOR',
            confidence: 0.95
        },
        {
            lenderName: 'AOMS (Angel Oak Mortgage Solutions)',
            programName: 'DSCR Investment Property Loan',
            confidence: 0.90
        }
    ]
};

const TEST_QUESTIONS = [
    "What lenders do you recommend for my investment property?",
    "Tell me about AOMS programs",
    "What's the difference between DSCR and traditional loans?",
    "Can you explain the credit requirements for LoanStream?",
    "What are my options if I want to put less than 20% down?",
    "How do I improve my chances of approval?"
];

async function makeRequest(endpoint, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, API_BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: data ? 'POST' : 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    resolve({ status: res.statusCode, data: response });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testHealthCheck() {
    console.log('\n🔍 Testing Health Check...');
    try {
        const response = await makeRequest('/api/health');
        if (response.status === 200) {
            console.log('✅ Health check passed');
            console.log('📊 Server info:', response.data);
        } else {
            console.log('❌ Health check failed:', response.status, response.data);
        }
    } catch (error) {
        console.log('❌ Health check error:', error.message);
    }
}

async function testChat(question, context = null) {
    console.log(`\n💬 Testing chat: "${question}"`);
    try {
        const payload = {
            message: question,
            userContext: context,
            conversationHistory: []
        };

        const response = await makeRequest('/api/chat', payload);

        if (response.status === 200) {
            console.log('✅ Chat response received');
            console.log('🤖 Response:', response.data.response.substring(0, 200) + '...');
            console.log('📊 Tokens used:', response.data.tokens);
        } else {
            console.log('❌ Chat request failed:', response.status, response.data);
        }
    } catch (error) {
        console.log('❌ Chat error:', error.message);
    }
}

async function runTests() {
    console.log('🧪 Starting Deal Desk Chatbot Tests');
    console.log('=====================================');
    console.log(`🌐 Testing against: ${API_BASE_URL}`);

    // Check environment
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  Warning: OPENAI_API_KEY not set in environment');
        console.log('   Make sure your backend has the API key configured');
    }

    // Test health check
    await testHealthCheck();

    // Test basic chat functionality
    console.log('\n🧪 Testing Chat Functionality...');

    // Test with user context
    await testChat("What lenders do you recommend for my property?", TEST_USER_CONTEXT);

    // Test without context
    await testChat("Explain DSCR loans");

    // Test error handling
    console.log('\n🧪 Testing Error Handling...');
    await testChat(""); // Empty message

    console.log('\n✨ Test suite completed!');
    console.log('=====================================');
    console.log('💡 Tips for manual testing:');
    console.log('1. Start the frontend server: python3 -m http.server 8080');
    console.log('2. Open http://localhost:8080');
    console.log('3. Fill out the form and test the chat interface');
    console.log('4. Try the "Ask About This Lender" buttons');
}

// Run tests if this script is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { testHealthCheck, testChat, TEST_USER_CONTEXT, TEST_QUESTIONS };
