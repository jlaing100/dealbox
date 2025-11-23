#!/bin/bash

# Deal Desk Setup Script
# Quick setup for both frontend and backend

echo "🚀 Deal Desk Setup Script"
echo "=========================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "Please download and install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo "✅ NPM found: $(npm --version)"

# Setup backend
echo ""
echo "🔧 Setting up backend..."
cd backend

if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env 2>/dev/null || echo "# Add your OPENAI_API_KEY here" > .env
    echo "⚠️  Please edit backend/.env and add your OPENAI_API_KEY"
else
    echo "✅ .env file already exists"
fi

echo "📦 Installing backend dependencies..."
npm install

cd ..

# Setup frontend
echo ""
echo "🌐 Frontend setup complete!"
echo "Run: python3 -m http.server 8080"
echo "Then open: http://localhost:8080"

echo ""
echo "🔧 Backend setup complete!"
echo "To start backend: cd backend && npm start"

echo ""
echo "📚 Don't forget:"
echo "1. Get OpenAI API key from https://platform.openai.com/api-keys"
echo "2. Add it to backend/.env"
echo "3. Run ./deploy-backend.sh to deploy to cloud"

echo ""
echo "🎉 Setup complete!"
