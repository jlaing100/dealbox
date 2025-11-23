# Google Gemini Flash API Setup Guide

## ✅ Code Changes Complete!

Your application has been updated to use Google Gemini Flash API instead of the local LLM.

---

## 🔑 Step 1: Get Your Free Google Gemini API Key

1. **Go to Google AI Studio:**
   - Visit: https://makersuite.google.com/app/apikey
   - Or: https://aistudio.google.com/app/apikey

2. **Sign in with your Google Account:**
   - Use any Google account (Gmail, Workspace, etc.)

3. **Create an API Key:**
   - Click "Create API Key" button
   - Select "Create API key in new project" (or use existing project)
   - Copy your API key (it looks like: `AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

4. **Important Notes:**
   - ✅ **FREE TIER**: 15 requests per minute, 1,500 requests per day
   - ✅ No credit card required for free tier
   - ✅ Cost: $0.075 per 1M input tokens, $0.30 per 1M output tokens (if you upgrade)

---

## 🚀 Step 2: Configure Your Application

### Option A: Using Browser Console (Recommended for Testing)

1. **Open your application** in a web browser
2. **Open Developer Console:**
   - Chrome/Edge: Press `F12` or `Cmd+Option+J` (Mac) / `Ctrl+Shift+J` (Windows)
   - Safari: Enable Developer Menu in Preferences, then `Cmd+Option+C`
   - Firefox: Press `F12` or `Cmd+Shift+K` (Mac) / `Ctrl+Shift+K` (Windows)

3. **Paste this command** (replace with your actual API key):
   ```javascript
   localStorage.setItem('GEMINI_API_KEY', 'YOUR_API_KEY_HERE')
   ```

4. **Reload the page** (press F5 or Cmd+R)

5. **Check the console** - you should see:
   ```
   ✅ Google Gemini Flash API connected successfully!
   ```

### Option B: Add API Key Input to Your UI (For Production)

If you want users to enter their own API key, add this HTML to your `index.html`:

```html
<!-- Add this inside your form or settings area -->
<div class="api-key-input">
    <label for="gemini-api-key">Google Gemini API Key:</label>
    <input type="password" id="gemini-api-key" placeholder="Enter your API key">
    <button onclick="saveApiKey()">Save Key</button>
</div>
```

And add this JavaScript to your `script.js`:

```javascript
function saveApiKey() {
    const apiKeyInput = document.getElementById('gemini-api-key');
    const apiKey = apiKeyInput.value.trim();
    
    if (apiKey) {
        localStorage.setItem('GEMINI_API_KEY', apiKey);
        alert('API key saved! Refreshing page...');
        location.reload();
    } else {
        alert('Please enter a valid API key');
    }
}
```

---

## 🧪 Step 3: Test Your Setup

1. **Open your application** (open `index.html` in your browser)

2. **Fill out the investor form** with test data:
   - Property Value: $500,000
   - Property Type: Single Family
   - Credit Score: 700
   - Down Payment: 20%
   - etc.

3. **Click "Find Matching Lenders"**

4. **Check the results:**
   - If successful: You'll see AI-powered lender matches
   - If error: Check the browser console (F12) for error messages

---

## 🔍 Troubleshooting

### Error: "Gemini API key not found"
**Solution:** Make sure you set the API key in localStorage (see Step 2)

### Error: "Invalid Gemini API key"
**Solutions:**
- Double-check that you copied the entire API key
- Make sure there are no extra spaces
- Verify the key is active at: https://makersuite.google.com/app/apikey

### Error: "Resource has been exhausted"
**Solution:** You've hit the free tier rate limit (15 requests/minute). Wait a minute and try again.

### Error: "CORS error" or "Failed to fetch"
**Solution:** 
- Make sure you're running the app through a local server (not just opening the HTML file)
- Try using: `python3 -m http.server 8000` or `npx serve`

### The app falls back to rule-based matching
**Why:** The Gemini API isn't available (no API key or connection issue)
**Solution:** Check console messages for specific errors

---

## 💰 Cost Estimate

With Google Gemini Flash API:

- **Your typical query:** ~10,000 input tokens + 500 output tokens
- **Cost per query:** ~$0.001 (one tenth of a cent)
- **With free tier:** 1,500 queries per day = FREE
- **If you upgrade:** 10,000 queries = ~$10/month

---

## 🎯 What Changed in Your Code

1. **Replaced** `LocalLLMService` with `GeminiService`
2. **API calls** now go to Google's servers instead of localhost
3. **Fallback behavior** remains the same - uses rule-based matching if API fails
4. **No changes** to your UI or user experience

---

## 📚 Additional Resources

- **Google AI Studio:** https://aistudio.google.com/
- **Gemini API Documentation:** https://ai.google.dev/docs
- **API Pricing:** https://ai.google.dev/pricing
- **Rate Limits:** https://ai.google.dev/docs/rate_limits

---

## 🔒 Security Best Practices

**For Development:**
- ✅ Using localStorage is fine for testing

**For Production:**
- ❌ Don't expose API keys in client-side code
- ✅ Create a backend server to handle API calls
- ✅ Use environment variables for API keys
- ✅ Implement rate limiting on your backend

---

## ✨ You're All Set!

Your application is now powered by Google's Gemini Flash API - one of the most cost-effective AI APIs available.

**Next Steps:**
1. Get your API key from Google AI Studio
2. Set it in localStorage using the browser console
3. Reload your app and test it out!

If you have any issues, check the troubleshooting section above or check your browser's developer console for error messages.


