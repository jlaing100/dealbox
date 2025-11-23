// ========================================
// DEAL DESK CONVERSATION MEMORY LIVE TEST
// ========================================
//
// Copy and paste this ENTIRE script into your browser console
// at https://dealdesk-mvp.vercel.app/ and press Enter
//
// This will test ALL conversation memory features automatically

(function() {
    console.log("🚀 DEAL DESK CONVERSATION MEMORY TEST");
    console.log("=====================================");
    console.log("Testing all fixes...");

    let testsPassed = 0;
    let testsTotal = 0;

    function test(name, condition, details) {
        testsTotal++;
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            testsPassed++;
        } else {
            console.log(`❌ FAIL: ${name}`);
            if (details) console.log(`   Details: ${details}`);
        }
    }

    // Test 1: Check if app is loaded
    test("App Initialization", typeof window.app !== 'undefined',
         "window.app should be defined");

    // Test 2: Check if chatService exists
    test("Chat Service Exists", window.app?.chatService !== undefined,
         "app.chatService should exist");

    // Test 3: Check sessionState exists
    test("Session State Initialized", window.app?.chatService?.sessionState !== undefined,
         "chatService.sessionState should exist");

    // Test 4: Check sessionState structure
    const sessionState = window.app?.chatService?.sessionState;
    if (sessionState) {
        test("Session State Structure", typeof sessionState.mentionedParameters === 'object' &&
             Array.isArray(sessionState.parameterHistory) &&
             Array.isArray(sessionState.corrections),
             "Should have mentionedParameters, parameterHistory, corrections arrays");
    }

    // Test 5: Check updateFormFieldsFromChat method exists
    test("Form Update Method", typeof window.app?.chatService?.updateFormFieldsFromChat === 'function',
         "updateFormFieldsFromChat method should exist");

    // Test 6: Check updateSessionState method exists
    test("Session State Method", typeof window.app?.chatService?.updateSessionState === 'function',
         "updateSessionState method should exist");

    // Test 7: Test parameter detection
    console.log("\n🧪 Testing Parameter Detection:");
    const testMessages = [
        { msg: "My credit score is 770", expected: { creditScore: 770 } },
        { msg: "I want a $150,000 loan", expected: { propertyValue: true } }, // Will calculate
        { msg: "25% down payment", expected: { downPaymentPercent: 25 } },
        { msg: "I'm an experienced investor", expected: { investmentExperience: 'experienced' } },
        { msg: "It's a single family home", expected: { propertyType: 'single_family' } }
    ];

    testMessages.forEach(({ msg, expected }) => {
        const detected = window.app?.chatService?.detectParameterChanges(msg);
        if (detected?.hasChanges) {
            let passed = true;
            for (const [key, value] of Object.entries(expected)) {
                if (key === 'propertyValue') {
                    passed = passed && (detected.propertyValue !== null);
                } else {
                    passed = passed && (detected[key] === value);
                }
            }
            test(`Parameter Detection: "${msg}"`, passed,
                 `Detected: ${JSON.stringify(detected)}`);
        } else {
            test(`Parameter Detection: "${msg}"`, false,
                 `No parameters detected in: "${msg}"`);
        }
    });

    // Test 8: Test form field updates (simulate)
    console.log("\n🧪 Testing Form Field Updates:");
    const creditField = document.getElementById('credit-score');
    const downPaymentField = document.getElementById('down-payment-percent');

    if (creditField) {
        const originalValue = creditField.value;
        console.log(`   Original credit score: ${originalValue}`);

        // Simulate update
        window.app?.chatService?.updateFormFieldsFromChat({
            creditScore: 777,
            downPaymentPercent: null,
            propertyValue: null,
            propertyType: null,
            investmentExperience: null
        });

        // Check if updated
        setTimeout(() => {
            const newValue = creditField.value;
            test("Form Field Update (Credit Score)", newValue === "777",
                 `Expected: 777, Got: ${newValue}`);
            console.log(`   Updated credit score: ${newValue}`);

            // Check for visual feedback
            const hasPurpleGlow = creditField.style.borderColor === '#8b5cf6' ||
                                 creditField.style.boxShadow.includes('rgba(139, 92, 246');
            test("Visual Feedback (Purple Glow)", hasPurpleGlow,
                 "Field should show purple glow when updated");

            // Reset for next test
            setTimeout(() => {
                creditField.value = originalValue;
                creditField.style.borderColor = '';
                creditField.style.boxShadow = '';
            }, 3000);
        }, 100);
    } else {
        test("Form Field Access", false, "Credit score field not found (submit form first)");
    }

    // Test 9: Test getUserContext enhancement
    console.log("\n🧪 Testing Enhanced Context:");
    const context = window.app?.chatService?.getUserContext();
    if (context) {
        test("Context Has conversationChanges", 'conversationChanges' in context,
             "getUserContext should return conversationChanges");
        test("Context Has sessionState", 'sessionState' in context,
             "getUserContext should return sessionState");

        if (context.conversationChanges) {
            console.log(`   Conversation Changes: ${context.conversationChanges}`);
        }
    }

    // Test 10: Test session state update
    console.log("\n🧪 Testing Session State Update:");
    const initialHistoryLength = sessionState?.parameterHistory?.length || 0;

    window.app?.chatService?.updateSessionState({
        creditScore: 800,
        downPaymentPercent: null,
        propertyValue: null,
        propertyType: null,
        investmentExperience: null
    });

    const updatedHistoryLength = sessionState?.parameterHistory?.length || 0;
    test("Session State Update", updatedHistoryLength > initialHistoryLength,
         `History length: ${initialHistoryLength} → ${updatedHistoryLength}`);

    if (sessionState?.mentionedParameters?.creditScore === 800) {
        console.log("   ✅ Session state correctly updated to creditScore: 800");
        testsPassed++;
    } else {
        console.log("   ❌ Session state not updated correctly");
    }
    testsTotal++;

    // Test 11: Test clearHistory functionality
    console.log("\n🧪 Testing History Clearing:");
    const beforeClear = {
        params: sessionState?.mentionedParameters,
        history: sessionState?.parameterHistory?.length,
        corrections: sessionState?.corrections?.length
    };

    window.app?.chatService?.clearHistory();

    const afterClear = {
        params: sessionState?.mentionedParameters,
        history: sessionState?.parameterHistory?.length,
        corrections: sessionState?.corrections?.length
    };

    test("History Clearing", JSON.stringify(beforeClear) !== JSON.stringify(afterClear),
         "Session state should reset after clearHistory");

    // Final Results
    setTimeout(() => {
        console.log("\n=====================================");
        console.log("🏆 FINAL TEST RESULTS");
        console.log("=====================================");
        console.log(`Tests Passed: ${testsPassed}/${testsTotal}`);
        console.log(`Success Rate: ${Math.round((testsPassed/testsTotal)*100)}%`);

        if (testsPassed >= testsTotal * 0.8) {
            console.log("🎉 EXCELLENT: Conversation memory system working!");
        } else if (testsPassed >= testsTotal * 0.6) {
            console.log("⚠️  GOOD: System mostly working, minor issues");
        } else {
            console.log("❌ POOR: Major issues detected, check implementation");
        }

        console.log("\n📝 MANUAL TESTS TO COMPLETE:");
        console.log("1. Submit form, then chat: 'my credit score is 750'");
        console.log("2. Watch for purple glow on credit score field");
        console.log("3. Chat: 'I want a $150k loan'");
        console.log("4. Verify bot mentions BOTH 750 AND 150k");
        console.log("5. Check: window.app.chatService.sessionState");

        console.log("\n=====================================");
    }, 2000);

})();
