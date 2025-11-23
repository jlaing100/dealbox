// Test script for AI Gateway integration
const { getOpenAIClient, extractResponseText } = require('./lib/openai');

async function testAIGateway() {
  console.log('Testing AI Gateway integration...');

  try {
    // Set environment variables for testing
    process.env.AI_GATEWAY_API_KEY = 'vck_8fLvXdjKZ19InfY0YnUODSIPt6gm9zMT81AUoleo4AVDKkwzBJ3I2QbB';
    process.env.OPENAI_API_KEY = 'dummy-key'; // fallback

    const client = getOpenAIClient();
    console.log('✅ Client created successfully');

    // Test a simple chat completion
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini', // This will go through AI Gateway
      messages: [
        { role: 'user', content: 'Say hello in 3 words.' }
      ],
      temperature: 0.4,
      max_tokens: 50
    });

    const text = extractResponseText(response);
    console.log('✅ AI Gateway response:', text);
    console.log('✅ AI Gateway integration working!');

  } catch (error) {
    console.error('❌ AI Gateway test failed:', error.message);
    console.error('Full error:', error);
  }
}

testAIGateway();
