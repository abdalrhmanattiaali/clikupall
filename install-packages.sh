#!/bin/bash
# Script to install npm packages with multiple fallback methods

echo "🔧 Attempting to install npm packages..."
echo "========================================"

# Method 1: Try standard npm install
echo ""
echo "Method 1: Standard npm install..."
npm install 2>&1 | tail -5
if [ $? -eq 0 ]; then
    echo "✅ Success with standard npm install!"
    exit 0
fi

# Method 2: Clear proxy and retry
echo ""
echo "Method 2: Clearing proxy and retrying..."
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy no_proxy NO_PROXY
npm install 2>&1 | tail -5
if [ $? -eq 0 ]; then
    echo "✅ Success after clearing proxy!"
    exit 0
fi

# Method 3: Try with npmmirror (Chinese mirror)
echo ""
echo "Method 3: Using npmmirror registry..."
npm config set registry https://registry.npmmirror.com
npm install 2>&1 | tail -5
if [ $? -eq 0 ]; then
    echo "✅ Success with npmmirror!"
    exit 0
fi

# Method 4: Try with yarn
echo ""
echo "Method 4: Trying with yarn..."
if command -v yarn &> /dev/null; then
    yarn config set registry https://registry.npmmirror.com
    yarn install 2>&1 | tail -5
    if [ $? -eq 0 ]; then
        echo "✅ Success with yarn!"
        exit 0
    fi
fi

# Method 5: Try with taobao registry
echo ""
echo "Method 5: Using taobao registry..."
npm config set registry https://registry.npm.taobao.org
npm install 2>&1 | tail -5
if [ $? -eq 0 ]; then
    echo "✅ Success with taobao registry!"
    exit 0
fi

# All methods failed
echo ""
echo "❌ All installation methods failed!"
echo ""
echo "📋 Possible solutions:"
echo "1. Check if you have internet connectivity"
echo "2. Check firewall/proxy settings with your server admin"
echo "3. Try manually: npm config set registry https://registry.npmmirror.com && npm install"
echo "4. Copy node_modules from another machine with same Node version"
echo ""
echo "Required packages:"
echo "  - express, axios, dotenv, node-cron"
echo "  - whatsapp-web.js, qrcode-terminal"
echo "  - @anthropic-ai/sdk (or openai/google ai)"
echo "  - better-sqlite3 (optional - file storage available as fallback)"
echo ""

# Reset registry to default
npm config set registry https://registry.npmjs.org

exit 1
