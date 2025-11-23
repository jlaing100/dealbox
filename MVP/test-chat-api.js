// Test script to verify OpenAI API key works with your chat endpoint
const { getOpenAIClient, extractResponseText } = require('./lib/openai');

// Set your API key here temporarily for testing
process.env.OPENAI_API_KEY = 'sk-your-actual-openai-api-key-here'; // Replace with your real key

async function testChatAPI() {
  console.log('🧪 Testing chat API with your OpenAI key...');

  try {
    const client = getOpenAIClient();
    console.log('✅ OpenAI client created successfully');

    // Test the same prompt structure as your chat.js API
    const systemMessage = {
      role: 'system',
      content: 'You are Deal Desk AI, an expert real estate financing assistant. You help users understand real estate lending options, analyze deals, and provide guidance on property investments. Be professional, knowledgeable, and helpful. When given context about a user\'s deal or lender matches, use that information to provide personalized advice.'
    };

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        systemMessage,
        { role: 'user', content: 'Hello, can you help me with a real estate deal?' },
      ],
    });

    const assistantMessage = extractResponseText(response);
    console.log('✅ Chat API working! Response:', assistantMessage);
    console.log('🎉 Your OpenAI API key is configured correctly!');

  } catch (error) {
    console.error('❌ Chat API test failed:', error.message);
    if (error.message.includes('authentication')) {
      console.error('💡 This usually means your API key is invalid or expired');
    } else if (error.message.includes('billing')) {
      console.error('💡 This usually means you have a billing issue with OpenAI');
    }
  }
}

testChatAPI();
