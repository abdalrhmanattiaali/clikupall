# 🚀 دليل التثبيت والتشغيل

## ⚠️ المشكلة الحالية: npm packages غير مثبتة

التطبيق يواجه خطأ 403 عند محاولة تثبيت الحزم من npm registry.

---

## 🔧 الحلول السريعة

### الحل 1: استخدام السكريبت التلقائي (موصى به)

```bash
./install-packages.sh
```

هذا السكريبت سيجرب 5 طرق مختلفة لتثبيت الحزم تلقائياً.

---

### الحل 2: التثبيت اليدوي

#### خطوة 1: إلغاء proxy (إذا كان موجوداً)

```bash
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
unset NO_PROXY no_proxy
```

#### خطوة 2: محاولة التثبيت

```bash
npm install
```

#### خطوة 3: إذا فشل، جرب mirror بديل

```bash
# جرب npmmirror (صيني)
npm config set registry https://registry.npmmirror.com
npm install

# أو جرب taobao
npm config set registry https://registry.npm.taobao.org
npm install

# أو جرب yarn
yarn config set registry https://registry.npmmirror.com
yarn install
```

---

### الحل 3: نسخ node_modules من جهاز آخر

إذا كان لديك جهاز آخر بنفس إصدار Node.js:

```bash
# على الجهاز الآخر
npm install
tar -czf node_modules.tar.gz node_modules

# على هذا السيرفر
scp other-machine:~/node_modules.tar.gz .
tar -xzf node_modules.tar.gz
```

---

### الحل 4: الاتصال بمسؤول السيرفر

المشكلة قد تكون من:
- Firewall يمنع الوصول لـ npm registry
- Proxy غير مُعد بشكل صحيح
- Restrictions على مستوى الشبكة

اطلب من مسؤول السيرفر:
1. فتح الوصول لـ `registry.npmjs.org`
2. أو تعطيل proxy مؤقتاً
3. أو تهيئة proxy settings بشكل صحيح

---

## 📦 الحزم المطلوبة

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "axios": "^1.7.0",
    "dotenv": "^16.4.0",
    "node-cron": "^3.0.3",
    "whatsapp-web.js": "^1.25.0",
    "qrcode-terminal": "^0.12.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "better-sqlite3": "^11.0.0"
  }
}
```

**ملاحظة:** `better-sqlite3` اختياري - النظام سيستخدم file-based storage تلقائياً إذا لم يكن متاحاً.

---

## ✅ بعد التثبيت الناجح

### 1. تهيئة ملف `.env`

```bash
cp .env.example .env
nano .env
```

اضبط المتغيرات التالية:

```env
# ClickUp API
CLICKUP_API_KEY=your_clickup_api_key_here
CLICKUP_TEAM_ID=your_team_id_here

# AI Provider (اختر واحد)
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_key_here

# أو
AI_PROVIDER=claude
ANTHROPIC_API_KEY=your_anthropic_key_here

# أو
AI_PROVIDER=gemini
GOOGLE_API_KEY=your_google_key_here

# Server
PORT=5014
NODE_ENV=production
TZ=Africa/Cairo
```

### 2. تشغيل التطبيق

```bash
npm start
```

### 3. مسح QR Code لـ WhatsApp

سيظهر QR code في الـ terminal، امسحه من تطبيق WhatsApp على هاتفك.

### 4. إعداد Webhooks في ClickUp

استخدم endpoint واحد لجميع الأحداث:

```
POST https://your-domain.com/webhooks/clickup
```

حدد جميع الأحداث المطلوبة (20+):
- Task Management
- Dates & Time
- Checklists & Subtasks
- Comments

---

## 🧪 اختبار النظام

بعد التشغيل، اختبر:

```bash
# 1. اختبر API
curl http://localhost:5014/test/ai

# 2. اختبر WhatsApp
curl http://localhost:5014/test/send-test-message

# 3. اختبر قاعدة البيانات
curl http://localhost:5014/test/db-stats

# 4. اختبر AI task weighting
curl -X POST http://localhost:5014/test/analyze-task/YOUR_TASK_ID

# 5. اختبر التوصيات الصباحية
curl -X POST http://localhost:5014/test/morning-recommendations/USER_ID
```

---

## 🐛 استكشاف الأخطاء

### خطأ: Cannot find package 'express'

```bash
# لم يتم تثبيت الحزم - راجع الحلول أعلاه
npm install
```

### خطأ: WhatsApp authentication failed

```bash
# احذف session القديمة
rm -rf .wwebjs_auth .wwebjs_cache
# أعد تشغيل التطبيق
npm start
```

### خطأ: AI Service initialization failed

```bash
# تحقق من API keys
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# تحقق من .env
cat .env | grep API_KEY
```

---

## 📚 التوثيق الكامل

- `AI_BEHAVIORAL_SYSTEM.md` - نظام الذكاء الاصطناعي السلوكي
- `GAMIFICATION_SYSTEM.md` - نظام التلعيب والأوسمة
- `MOTIVATION_SYSTEM.md` - نظام التحفيز
- `WEBHOOK_SETUP.md` - إعداد Webhooks

---

## 🆘 الدعم

إذا استمرت المشاكل:

1. تحقق من logs: `npm start 2>&1 | tee app.log`
2. راجع التوثيق الكامل
3. تحقق من requirements:
   - Node.js >= 18.0.0
   - npm >= 8.0.0
   - اتصال إنترنت مستقر

---

**بالتوفيق! 🚀**
