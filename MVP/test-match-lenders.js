// Test script for lender matching API with user's profile
const matchLendersHandler = require('./api/match-lenders');

async function testLenderMatching() {
  console.log('🧪 Testing lender matching with user profile...');

  // User's profile from the website
  const buyerProfile = {
    propertyValue: 1000000,
    propertyType: 'single_family',
    propertyLocation: 'Phoenix, Arizona',
    downPaymentPercent: 20,
    propertyVacant: 'no',
    currentRent: 5000,
    creditScore: 630,
    investmentExperience: 'first_time'
  };

  console.log('📊 Buyer Profile:', JSON.stringify(buyerProfile, null, 2));

  // Mock request/response objects
  const mockReq = {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ buyerProfile })
  };

  const mockRes = {
    status: (code) => ({
      json: (data) => {
        console.log(`📋 Response Status: ${code}`);
        console.log('📋 Response Data:', JSON.stringify(data, null, 2));

        // Analyze the results
        if (data.matches && Array.isArray(data.matches)) {
          const totalLenders = data.matches.length;
          const matches = data.matches.filter(m => m.isMatch);
          const nonMatches = data.matches.filter(m => !m.isMatch);

          console.log(`\n📈 Analysis:`);
          console.log(`   Total lenders evaluated: ${totalLenders}`);
          console.log(`   Matches found: ${matches.length}`);
          console.log(`   Non-matches: ${nonMatches.length}`);

          if (matches.length > 0) {
            console.log(`\n✅ MATCHES (${matches.length}):`);
            matches.slice(0, 3).forEach((match, i) => {
              console.log(`   ${i+1}. ${match.lenderName} - ${match.programName}: ${(match.confidence * 100).toFixed(0)}% match`);
              console.log(`      Reason: ${match.matchSummary}`);
            });
            if (matches.length > 3) {
              console.log(`   ... and ${matches.length - 3} more matches`);
            }
          }

          if (nonMatches.length > 0) {
            console.log(`\n❌ NON-MATCHES (${nonMatches.length}):`);
            nonMatches.slice(0, 3).forEach((match, i) => {
              console.log(`   ${i+1}. ${match.lenderName} - ${match.programName}: Non-match`);
              console.log(`      Reason: ${match.nonMatchReason}`);
            });
            if (nonMatches.length > 3) {
              console.log(`   ... and ${nonMatches.length - 3} more non-matches`);
            }
          }

          // Check if most lenders are non-matches (as expected for 630 credit score)
          const matchPercentage = (matches.length / totalLenders) * 100;
          console.log(`\n🎯 Match Rate: ${matchPercentage.toFixed(1)}%`);

          if (matchPercentage < 30) {
            console.log('✅ SUCCESS: Most lenders correctly identified as non-matches for 630 credit score!');
          } else {
            console.log('⚠️  WARNING: Higher match rate than expected for 630 credit score');
          }
        }

        return data;
      }
    }),
    setHeader: () => {},
    end: () => {}
  };

  try {
    // Set required environment variables for testing
    process.env.AI_GATEWAY_API_KEY = 'vck_8fLvXdjKZ19InfY0YnUODSIPt6gm9zMT81AUoleo4AVDKkwzBJ3I2QbB';
    process.env.OPENAI_API_KEY = 'dummy-key'; // fallback

    await matchLendersHandler(mockReq, mockRes);
    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testLenderMatching();
