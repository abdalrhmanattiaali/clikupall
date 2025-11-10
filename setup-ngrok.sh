#!/bin/bash

# ClickUp All - ngrok Setup Helper
# مساعد إعداد ngrok بسيط

echo "🚀 إعداد ngrok للـ ClickUp All Webhooks"
echo "========================================="
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok غير مثبت"
    echo ""
    echo "يمكنك تثبيته بإحدى الطرق التالية:"
    echo ""
    echo "1. باستخدام npm:"
    echo "   npm install -g ngrok"
    echo ""
    echo "2. باستخدام Homebrew (Mac):"
    echo "   brew install ngrok/ngrok/ngrok"
    echo ""
    echo "3. أو تحميله من:"
    echo "   https://ngrok.com/download"
    echo ""
    exit 1
fi

echo "✅ ngrok مثبت"
echo ""

# Check if application is running
PORT=5014
if ! nc -z localhost $PORT 2>/dev/null; then
    echo "⚠️  تحذير: التطبيق لا يعمل على المنفذ $PORT"
    echo ""
    echo "شغل التطبيق أولاً في terminal آخر:"
    echo "  npm start"
    echo ""
    read -p "اضغط Enter عندما يكون التطبيق جاهزاً..."
fi

echo "🌐 بدء ngrok..."
echo ""
echo "سيتم فتح tunnel على المنفذ $PORT"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ℹ️  بعد بدء ngrok:"
echo ""
echo "1. انسخ الـ URL الذي يبدأ بـ https://xxxxx.ngrok.io"
echo "2. اذهب إلى ClickUp → Settings → Integrations → Webhooks"
echo "3. أنشئ webhook جديد لكل endpoint:"
echo ""
echo "   📌 Task Created:"
echo "      https://xxxxx.ngrok.io/webhooks/task-created"
echo ""
echo "   📌 Task Updated:"
echo "      https://xxxxx.ngrok.io/webhooks/task-updated"
echo ""
echo "   📌 Task Comment:"
echo "      https://xxxxx.ngrok.io/webhooks/task-comment"
echo ""
echo "4. لإيقاف ngrok: اضغط Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⏳ جاري بدء ngrok..."
sleep 2

# Start ngrok
ngrok http $PORT
