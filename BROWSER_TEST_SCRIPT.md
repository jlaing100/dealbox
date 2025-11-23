# Browser Testing Script for Conversation Memory

## Quick Automated Test

Copy and paste this into your browser console at https://dealdesk-mvp.vercel.app/

```javascript
// ========================================
// DEAL DESK CONVERSATION MEMORY TEST
// ========================================

console.log("🧪 Starting Conversation Memory Test...\n");

// Test 1: Check if sessionState exists
console.log("Test 1: Session State Initialization");
if (window.app && window.app.chatService && window.app.chatService.sessionState) {
    console.log("✅ PASS: Session state exists");
    console.log("   State:", window.app.chatService.sessionState);
} else {
    console.log("❌ FAIL: Session state not found");
}

// Test 2: Check if updateFormFieldsFromChat method exists
console.log("\nTest 2: Form Update Method");
if (window.app && window.app.chatService && typeof window.app.chatService.updateFormFieldsFromChat === 'function') {
    console.log("✅ PASS: updateFormFieldsFromChat method exists");
} else {
    console.log("❌ FAIL: updateFormFieldsFromChat method not found");
}

// Test 3: Check if updateSessionState method exists
console.log("\nTest 3: Session State Update Method");
if (window.app && window.app.chatService && typeof window.app.chatService.updateSessionState === 'function') {
    console.log("✅ PASS: updateSessionState method exists");
} else {
    console.log("❌ FAIL: updateSessionState method not found");
}

// Test 4: Test parameter detection
console.log("\nTest 4: Parameter Detection");
const testMessage = "My credit score is 770 and I want a $150,000 loan";
if (window.app && window.app.chatService) {
    const detected = window.app.chatService.detectParameterChanges(testMessage);
    if (detected.hasChanges) {
        console.log("✅ PASS: Parameters detected");
        console.log("   Credit Score:", detected.creditScore);
        console.log("   Property Value:", detected.propertyValue);
    } else {
        console.log("❌ FAIL: No parameters detected");
    }
} else {
    console.log("⚠️  SKIP: Chat service not initialized yet");
}

// Test 5: Simulate form field update
console.log("\nTest 5: Form Field Update Simulation");
const creditField = document.getElementById('credit-score');
if (creditField) {
    const originalValue = creditField.value;
    console.log("   Original value:", originalValue);
    
    // Simulate a parameter change
    if (window.app && window.app.chatService) {
        window.app.chatService.updateFormFieldsFromChat({
            creditScore: 770,
            downPaymentPercent: null,
            propertyValue: null,
            propertyType: null,
            investmentExperience: null
        });
        
        setTimeout(() => {
            const newValue = creditField.value;
            if (newValue === "770") {
                console.log("✅ PASS: Form field updated to 770");
                console.log("   Check for purple glow on the field!");
            } else {
                console.log("❌ FAIL: Form field not updated (value:", newValue, ")");
            }
        }, 100);
    }
} else {
    console.log("⚠️  SKIP: Credit score field not found (may need to submit form first)");
}

// Test 6: Check getUserContext enhancement
console.log("\nTest 6: Enhanced User Context");
if (window.app && window.app.chatService) {
    const context = window.app.chatService.getUserContext();
    if (context.conversationChanges !== undefined && context.sessionState !== undefined) {
        console.log("✅ PASS: Context includes conversationChanges and sessionState");
        console.log("   Context:", context);
    } else {
        console.log("❌ FAIL: Context missing new fields");
    }
} else {
    console.log("⚠️  SKIP: Chat service not initialized yet");
}

console.log("\n========================================");
console.log("🧪 Test Complete!");
console.log("========================================");
```

## Manual Testing Steps

### Step 1: Initial Setup (2 minutes)
1. Open https://dealdesk-mvp.vercel.app/
2. Open browser DevTools (F12 or right-click → Inspect)
3. Go to Console tab
4. Paste the test script above and run it

### Step 2: Fill Out Form (1 minute)
Fill in the form with these values:
```
Property Value: $500,000
Property Type: Single Family
Location: Phoenix, Arizona
Down Payment: 20%
Property Vacant: No
Current Rent: $2,500
Credit Score: 680
Investment Experience: Some Experience
```

Click **"Find Matching Lenders"**

### Step 3: Test Sequential Updates (2 minutes)

**Message 1:** Type in chat:
```
Actually, my credit score is 770
```

**What to check:**
- [ ] Credit score field updates to 770
- [ ] Field shows purple glow for ~2 seconds
- [ ] Console shows: `✅ Form fields updated from chat: {creditScore: 770}`
- [ ] Console shows: `📝 Session state updated: {...}`
- [ ] Bot acknowledges the 770 score in response

**Message 2:** Type in chat:
```
And I want a $150,000 loan
```

**What to check:**
- [ ] Bot's response mentions BOTH 770 credit score AND the loan amount
- [ ] Lender recommendations update (if applicable)
- [ ] Console shows session state with both parameters

**Verify in console:**
```javascript
window.app.chatService.sessionState
```

Should show:
```javascript
{
  mentionedParameters: {
    creditScore: 770,
    propertyValue: [some calculated value]
  },
  parameterHistory: [
    {parameter: 'creditScore', value: 770, ...},
    {parameter: 'propertyValue', value: ..., ...}
  ],
  corrections: []
}
```

### Step 4: Test Corrections (1 minute)

**Message 3:** Type in chat:
```
Sorry, I meant my credit score is 780
```

**What to check:**
- [ ] Credit score field updates to 780
- [ ] Purple glow appears again
- [ ] Console shows correction tracked
- [ ] Bot acknowledges the correction

**Verify in console:**
```javascript
window.app.chatService.sessionState.corrections
```

Should show:
```javascript
[{
  parameter: 'creditScore',
  oldValue: 770,
  newValue: 780,
  timestamp: '...'
}]
```

### Step 5: Test Multiple Parameters (1 minute)

**Message 4:** Type in chat:
```
I have 25% down payment and I'm an experienced investor
```

**What to check:**
- [ ] Down payment dropdown updates to "25%"
- [ ] Investment experience dropdown updates to "Experienced"
- [ ] Both fields show purple glow
- [ ] Console shows both updates

### Step 6: Verify Context Sending (Advanced)

1. Go to **Network** tab in DevTools
2. Filter by "chat"
3. Send another message
4. Click on the POST request to `/api/chat`
5. Go to **Payload** tab
6. Look for `userContext` → `conversationChanges`

**Should see something like:**
```
"conversationChanges": "User mentioned in conversation: Credit Score: 780, Down Payment: 25%, Investment Experience: experienced"
```

## Quick Visual Test

If you just want to see it working quickly:

1. Go to https://dealdesk-mvp.vercel.app/
2. Fill out form and submit
3. Type: **"my credit score is 750"**
4. **WATCH THE FORM** - credit score field should:
   - ✨ Update to 750
   - 💜 Show purple glow
   - ⏱️ Glow fades after 2 seconds

If you see the purple glow and the field updates, **the fix is working!** ✅

## Expected Console Output

When everything is working, you should see:

```
✅ Form fields updated from chat: {creditScore: 770}
📝 Session state updated: {
  mentionedParameters: { creditScore: 770 },
  parameterHistory: [...],
  corrections: []
}
```

## Troubleshooting

### "Session state not found"
- Solution: Submit the form first to initialize chat service

### "Form field not updated"
- Check if you submitted the form and are in chat view
- Check console for any JavaScript errors

### "No parameters detected"
- Try more explicit messages: "credit score is 770"
- Check the pattern matching in detectParameterChanges()

### "Purple glow not showing"
- Check if CSS is loaded
- Look for the element with borderColor style change

## Success Criteria

✅ Form fields update automatically from chat  
✅ Purple glow appears on updated fields  
✅ Session state tracks all changes  
✅ Bot remembers all previous parameters  
✅ Corrections override old values  
✅ Multiple parameters can be updated at once  
✅ Context includes conversationChanges  
✅ No JavaScript errors in console  

## Report Issues

If any test fails:
1. Copy the console output
2. Note which specific test failed
3. Check if the Vercel deployment is complete
4. Check browser console for errors

