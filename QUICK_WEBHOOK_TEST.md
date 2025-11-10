# اختبار سريع للـ Webhooks | Quick Webhook Test

## خطوات الاختبار السريع | Quick Test Steps

### 1️⃣ شغل التطبيق | Start Application
```bash
npm start
```

انتظر حتى ترى:
```
✅ Application initialized successfully!
✅ WhatsApp client is ready
✅ Group chat found
```

---

### 2️⃣ اختبر الواتساب | Test WhatsApp

افتح متصفح أو استخدم curl:

**في المتصفح:**
```
http://localhost:5014/test/send-test-message
```

**أو في Terminal:**
```bash
curl http://localhost:5014/test/send-test-message
```

**يجب أن تصل رسالة في مجموعة الواتساب!** ✅

إذا وصلت الرسالة، معنى ذلك أن:
- ✅ السيرفر يعمل
- ✅ الواتساب متصل
- ✅ المجموعة مكتشفة

---

### 3️⃣ جهز الـ Webhooks للإنترنت | Prepare Webhooks for Internet

#### للتطوير المحلي (Local Development):

**الطريقة السهلة - استخدم السكريبت:**
```bash
./setup-ngrok.sh
```

**أو يدوياً:**
```bash
# ثبت ngrok
npm install -g ngrok

# شغل ngrok
ngrok http 5014
```

انسخ الـ URL الذي يظهر، مثل:
```
https://abc123.ngrok.io
```

#### للسيرفر الحقيقي (Production):
استخدم الـ IP أو Domain:
```
http://your-server-ip:5014
```

---

### 4️⃣ أنشئ Webhooks في ClickUp

1. اذهب إلى: https://app.clickup.com/settings/integrations/webhooks

2. اضغط **"Create Webhook"**

3. أنشئ 3 webhooks:

#### Webhook 1: Task Created
- **Name:** `Task Created`
- **Endpoint:** `https://your-ngrok-url.ngrok.io/webhooks/task-created`
- **Events:** ☑️ `taskCreated`

#### Webhook 2: Task Updated
- **Name:** `Task Updated`
- **Endpoint:** `https://your-ngrok-url.ngrok.io/webhooks/task-updated`
- **Events:** ☑️ `taskUpdated`

#### Webhook 3: Task Comment
- **Name:** `Task Comment`
- **Endpoint:** `https://your-ngrok-url.ngrok.io/webhooks/task-comment`
- **Events:** ☑️ `taskCommentPosted`

---

### 5️⃣ اختبر الإشعارات | Test Notifications

**الاختبار النهائي:**
1. اذهب إلى ClickUp
2. أنشئ مهمة جديدة
3. عين شخص للمهمة
4. يجب أن يصل إشعار في الواتساب! 🎉

---

## 🔍 فحص سريع | Quick Check

### تحقق من حالة كل شيء:

```bash
# 1. حالة التطبيق
curl http://localhost:5014/health

# 2. حالة الواتساب
curl http://localhost:5014/test/whatsapp-status

# 3. حالة الـ AI
curl http://localhost:5014/test/ai

# 4. إرسال رسالة تجريبية
curl http://localhost:5014/test/send-test-message
```

---

## ❌ المشاكل الشائعة | Common Issues

### المشكلة: الواتساب غير متصل
**الحل:**
```bash
# احذف session القديم
rm -rf .wwebjs_auth sessions

# أعد تشغيل التطبيق
npm start

# امسح QR code مرة أخرى
```

### المشكلة: المجموعة غير موجودة
**الحل:**
تحقق من أن اسم المجموعة في `.env` مطابق تماماً:
```env
WHATSAPP_GROUP_NAME=Click Up notification 📢
```

### المشكلة: ngrok URL تغير
**السبب:** ngrok المجاني يعطي URL جديد كل مرة

**الحل:**
1. احصل على الـ URL الجديد من ngrok
2. حدث Webhooks في ClickUp بالـ URL الجديد

**أو:** اشترك في ngrok مدفوع للحصول على subdomain ثابت

---

## 📊 مراقبة الـ Webhooks | Monitor Webhooks

### في ClickUp:
Settings → Integrations → Webhooks → اضغط على webhook → **Recent Deliveries**

سترى:
- ✅ Successful deliveries (أخضر)
- ❌ Failed deliveries (أحمر)
- ⏱️ Response times

### في التطبيق:
```bash
# شاهد الـ logs مباشرة
tail -f logs/app-*.log
```

---

## ✅ قائمة التحقق النهائية | Final Checklist

قبل أن تبدأ استخدام النظام:

- [ ] التطبيق يعمل (`npm start`)
- [ ] الواتساب متصل (✅ WhatsApp client is ready)
- [ ] المجموعة مكتشفة (✅ Group chat found)
- [ ] الرسالة التجريبية وصلت (`/test/send-test-message`)
- [ ] ngrok يعمل (للتطوير المحلي)
- [ ] 3 Webhooks تم إنشاؤها في ClickUp
- [ ] URLs صحيحة في ClickUp
- [ ] Webhooks نشطة (Status: Active)
- [ ] تم اختبار مهمة جديدة والإشعار وصل ✅

---

## 🎉 جاهز للعمل | Ready to Go!

إذا أكملت كل الخطوات السابقة:
- ✅ ستستقبل إشعار عند إنشاء مهمة جديدة
- ✅ ستستقبل إشعار عند تعيين شخص لمهمة
- ✅ ستستقبل إشعار عند اكتمال مهمة
- ✅ ستستقبل إشعار عند إضافة تعليق
- ✅ ستستقبل تقرير يومي في الساعة 8:30 صباحاً
- ✅ ستستقبل ملخص AI يومي في الساعة 11:35 مساءً
- ✅ ستستقبل رسالة صباحية من AI في الساعة 8:05 صباحاً

**كل شيء تلقائي! 🚀**

---

## 📞 تحتاج مساعدة؟ | Need Help?

راجع الملف الكامل: **WEBHOOK_SETUP.md**
