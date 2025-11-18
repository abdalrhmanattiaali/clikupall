# ⚡ دليل البدء السريع - Quick Start Guide

## 🎯 الهدف
تشغيل المشروع في **أقل من 5 دقائق**!

---

## ✅ المتطلبات الأساسية

```bash
# تحقق من إصدار Node.js (يجب >= 18.0.0)
node --version

# إذا كان أقدم، قم بالتحديث:
# https://nodejs.org/
```

---

## 🚀 خطوات التشغيل

### 1️⃣ التثبيت (دقيقة واحدة)

```bash
# انتقل لمجلد المشروع
cd clikupall

# ثبت التبعيات
npm install
```

---

### 2️⃣ الإعدادات (دقيقتان)

```bash
# انسخ ملف البيئة
cp .env.example .env

# افتح للتعديل
nano .env  # أو استخدم محرر آخر
```

**عدّل `.env` بالمعلومات التالية:**

```env
# ClickUp (إلزامي)
CLICKUP_API_TOKEN=pk_62585187_YOUR_TOKEN_HERE
CLICKUP_TEAM_ID=9015343430

# اختر AI Provider (إلزامي)
AI_PROVIDER=openai

# OpenAI (إذا اخترت openai)
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
OPENAI_MODEL=gpt-4o

# أو Claude (إذا اخترت claude)
# ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE

# أو Gemini (إذا اخترت gemini)
# GEMINI_API_KEY=AIzaSyYOUR_KEY_HERE
```

**احصل على المفاتيح:**
- ClickUp: https://app.clickup.com/settings/apps
- OpenAI: https://platform.openai.com/api-keys
- Claude: https://console.anthropic.com/
- Gemini: https://makersuite.google.com/app/apikey

---

### 3️⃣ التشغيل (ثانية واحدة!)

```bash
npm start
```

**يجب أن ترى:**
```
🚀 ClickUp All - Starting Application...
────────────────────────────────────────
ℹ️ Environment Configuration:
ℹ️   NODE_ENV: development
ℹ️   PORT: 5014
ℹ️   AI Provider: openai
✅ Express middleware configured
✅ AI Service ready (openai)
✅ All services initialized
✅ Routes configured
✅ Event listeners configured
✅ Error handlers configured
✅ Server listening on port 5014
────────────────────────────────────────
✅ Application initialized successfully!
ℹ️ AI Provider: openai
ℹ️ Server running at: http://0.0.0.0:5014
────────────────────────────────────────
```

---

### 4️⃣ الاختبار (دقيقة واحدة)

في نافذة terminal جديدة:

```bash
# اختبر الـ health endpoint
curl http://localhost:5014/health

# يجب أن تحصل على:
# {"status":"ok","timestamp":1234567890,"uptime":12.34,"aiProvider":"openai"}
```

**في المتصفح:**
```
http://localhost:5014
```

يجب أن ترى صفحة ترحيبية!

---

## 📱 ربط WhatsApp (اختياري لكن مهم)

عند التشغيل الأول، سيظهر QR Code:

```
QR Code received, please scan:
████ ▄▄▄▄▄ █▀▄  ▀▄█ ▄▄▄▄▄ ████
████ █   █ █ ▀▀▄▄ █ █   █ ████
████ █▄▄▄█ █▄  ▄███ █▄▄▄█ ████
...
```

**خطوات:**
1. افتح WhatsApp على هاتفك
2. اذهب لـ: Settings → Linked Devices
3. امسح QR Code
4. انتظر حتى ترى: `✅ WhatsApp client ready`

---

## 🧪 اختبارات سريعة

### اختبار AI Service

```bash
# اختبار OpenAI
curl http://localhost:5014/test-ai-morning/AbdAlRahman

# يجب أن تحصل على رسالة AI صباحية
```

### اختبار ClickUp

```bash
# اختبار جلب مهمة
curl http://localhost:5014/test-clickup-task/TASK_ID
```

---

## 🎛️ تفعيل/تعطيل الميزات

في `.env`:

```env
# فعّل/عطّل الميزات
ENABLE_AI_NOTIFICATIONS=true
ENABLE_DAILY_REPORTS=true
ENABLE_WEEKLY_CHALLENGES=true
ENABLE_BADGES=true
ENABLE_COURSES=true
ENABLE_INSPIRATIONAL_CONTENT=true
```

---

## 📊 الخطوات التالية

✅ **بعد التشغيل الناجح:**

1. **راجع IMPLEMENTATION_GUIDE.md**
   - لإكمال الخدمات المتبقية

2. **راجع ARCHITECTURE.md**
   - لفهم البنية المعمارية

3. **راجع README.md**
   - للوثائق الكاملة

---

## ❓ حل المشاكل الشائعة

### المشكلة: `Error: Missing required environment variables`

**الحل:**
```bash
# تأكد من ملء .env
nano .env

# تحقق من الحقول الإلزامية:
# CLICKUP_API_TOKEN
# CLICKUP_TEAM_ID
# AI_PROVIDER
# [PROVIDER]_API_KEY (حسب اختيارك)
```

---

### المشكلة: `EADDRINUSE: address already in use`

**الحل:**
```bash
# غيّر المنفذ في .env
PORT=5015

# أو أوقف العملية القديمة
lsof -i :5014
kill -9 [PID]
```

---

### المشكلة: `AI Service initialization failed`

**الحل:**
```bash
# تحقق من:
# 1. AI_PROVIDER صحيح (openai أو claude أو gemini)
# 2. المفتاح المناسب موجود
# 3. المفتاح صالح وليس منتهي

# مثال صحيح:
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-ABC123...
```

---

### المشكلة: WhatsApp QR Code لا يظهر

**الحل:**
```bash
# احذف session القديم
rm -rf sessions/

# أعد التشغيل
npm start
```

---

## 🎉 النجاح!

إذا رأيت:
- ✅ Server running
- ✅ AI Service ready
- ✅ WhatsApp authenticated (اختياري)

**أنت جاهز للعمل! 🚀**

---

## 📞 المساعدة

**مشكلة تقنية؟**
- راجع IMPLEMENTATION_GUIDE.md
- راجع MIGRATION.md (إذا كنت تنتقل من نظام قديم)

**أسئلة عن البنية؟**
- راجع ARCHITECTURE.md

**أسئلة عامة؟**
- راجع README.md

---

**وقت البدء الفعلي: < 5 دقائق ⚡**

نتمنى لك تجربة رائعة! 🎊
