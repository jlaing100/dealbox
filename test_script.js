console.log("🧪 Running Conversation Memory Tests After Fix...");

// Test 1: Check if window.app and chatService exist
let test1_pass = false;
try {
    if (window.app && window.app.chatService) {
        console.log("✅ PASS: window.app and window.app.chatService exist");
        test1_pass = true;
    } else {
        console.log("❌ FAIL: window.app or window.app.chatService missing");
    }
} catch (e) {
    console.log("❌ ERROR checking app structure:", e.message);
}

// Test 2: Check sessionState structure
let test2_pass = false;
try {
    const sessionState = window.app.chatService.sessionState;
    if (sessionState &&
        typeof sessionState.mentionedParameters === "object" &&
        Array.isArray(sessionState.parameterHistory) &&
        typeof sessionState.corrections === "object") {
        console.log("✅ PASS: sessionState has correct structure");
        test2_pass = true;
    } else {
        console.log("❌ FAIL: sessionState missing or malformed");
    }
} catch (e) {
    console.log("❌ ERROR checking sessionState:", e.message);
}

// Test 3: Check if updateFormFieldsFromChat exists
let test3_pass = false;
try {
    if (typeof window.app.chatService.updateFormFieldsFromChat === "function") {
        console.log("✅ PASS: updateFormFieldsFromChat method exists");
        test3_pass = true;
    } else {
        console.log("❌ FAIL: updateFormFieldsFromChat method missing");
    }
} catch (e) {
    console.log("❌ ERROR checking updateFormFieldsFromChat:", e.message);
}

// Test 4: Test parameter detection
let test4_pass = false;
try {
    const testMessages = [
        "My credit score is actually 720",
        "I can put 25% down instead",
        "The property is worth $275,000",
        "I have 2 years of investment experience"
    ];

    let detectedCount = 0;
    testMessages.forEach((msg, idx) => {
        const changes = window.app.chatService.detectParameterChanges(msg);
        if (changes && changes.hasChanges) {
            detectedCount++;
            console.log(`✅ PASS: Message ${idx + 1} detected changes:`, Object.keys(changes).filter(k => k !== "hasChanges"));
        } else {
            console.log(`❌ FAIL: Message ${idx + 1} no changes detected: "${msg}"`);
        }
    });

    if (detectedCount > 0) {
        console.log(`✅ PASS: Parameter detection working (${detectedCount}/${testMessages.length} messages)`);
        test4_pass = true;
    } else {
        console.log("❌ FAIL: Parameter detection not working");
    }
} catch (e) {
    console.log("❌ ERROR testing parameter detection:", e.message);
}

console.log("\n📊 Test Results:");
console.log(`✅ ${[test1_pass, test2_pass, test3_pass, test4_pass].filter(Boolean).length}/4 tests passed`);

if ([test1_pass, test2_pass, test3_pass, test4_pass].every(Boolean)) {
    console.log("🎉 All automated tests passed! Now testing manual chat interactions...");
} else {
    console.log("⚠️  Some automated tests failed. Check implementation.");
}
