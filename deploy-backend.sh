#!/bin/bash

# Deal Desk Backend Deployment Script
# Supports Vercel, Railway, and Render deployment

echo "🚀 Deal Desk Backend Deployment Script"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "backend/package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Ask user which platform to deploy to
echo ""
echo "Choose deployment platform:"
echo "1) Vercel (Recommended)"
echo "2) Railway"
echo "3) Render"
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo "📦 Deploying to Vercel..."
        echo ""

        # Check if Vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm install -g vercel
        fi

        # Go to backend directory
        cd backend

        # Install dependencies
        echo "Installing dependencies..."
        npm install

        # Deploy to Vercel
        echo "Deploying to Vercel..."
        vercel --prod

        # Ask for API key setup
        echo ""
        echo "🔑 Don't forget to set your OpenAI API key:"
        echo "Run: vercel env add OPENAI_API_KEY"
        echo "Then enter your OpenAI API key when prompted"
        echo ""
        echo "📝 Update your frontend script.js with the Vercel URL:"
        echo "Change: this.apiEndpoint = 'http://localhost:3001/api/chat';"
        echo "To: this.apiEndpoint = 'https://your-app-name.vercel.app/api/chat';"
        ;;

    2)
        echo "🚂 Deploying to Railway..."
        echo ""

        # Check if Railway CLI is installed
        if ! command -v railway &> /dev/null; then
            echo "Installing Railway CLI..."
            npm install -g @railway/cli
        fi

        # Go to backend directory
        cd backend

        # Install dependencies
        echo "Installing dependencies..."
        npm install

        # Login to Railway (if not already logged in)
        echo "Logging in to Railway..."
        railway login

        # Deploy
        echo "Deploying to Railway..."
        railway deploy

        # Set environment variables
        echo ""
        echo "🔑 Setting up environment variables..."
        read -p "Enter your OpenAI API key: " api_key
        railway vars set OPENAI_API_KEY=$api_key

        echo ""
        echo "✅ Deployment complete!"
        echo "Get your Railway URL from the dashboard and update script.js"
        ;;

    3)
        echo "🎨 Deploying to Render..."
        echo ""
        echo "For Render deployment:"
        echo "1. Go to https://render.com"
        echo "2. Connect your GitHub repository"
        echo "3. Set build command: npm install"
        echo "4. Set start command: npm start"
        echo "5. Add environment variable: OPENAI_API_KEY"
        echo ""
        echo "Manual setup required for Render."
        ;;

    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment setup complete!"
echo "Remember to:"
echo "1. Set your OPENAI_API_KEY in the deployment platform"
echo "2. Update script.js with the production API URL"
echo "3. Test the chat functionality"
