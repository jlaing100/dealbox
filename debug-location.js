// Debug location detection
const message = "Need financing for a $750,000 property in Los Angeles, California with 25% down payment";

console.log('Testing message:', message);

// Test the specific pattern that should match
const pattern = /property\s+(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/i;
const match = message.match(pattern);

console.log('Pattern:', pattern);
console.log('Match result:', match);

if (match) {
    console.log('City:', match[1]);
    console.log('State:', match[2]);
} else {
    console.log('No match found');
}

// Test all patterns
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

console.log('\nTesting all patterns:');
locationPatterns.forEach((pat, index) => {
    const m = message.match(pat);
    if (m) {
        console.log(`Pattern ${index} matched:`, m[1], m[2]);
    }
});
