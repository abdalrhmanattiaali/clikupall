# إعداد ClickUp Webhooks - خطوة بخطوة
# ClickUp Webhooks Setup Guide

## 📋 نظرة عامة | Overview

التطبيق الآن يعمل، لكن لاستقبال الإشعارات عند إنشاء أو تحديث المهام، تحتاج لتكوين Webhooks في ClickUp.

The application is running, but to receive notifications when tasks are created or updated, you need to configure Webhooks in ClickUp.

---

## 🌐 الخطوة 1: تحديد عنوان URL للسيرفر
## Step 1: Determine Your Server URL

### إذا كان السيرفر محلي (Local Development):
إذا كنت تختبر على جهازك المحلي، تحتاج لـ **ngrok** أو **localtunnel** لجعل السيرفر متاح من الإنترنت:

```bash
# تثبيت ngrok
npm install -g ngrok

# تشغيل ngrok
ngrok http 5014
```

سيعطيك ngrok عنوان URL مثل:
```
https://abc123.ngrok.io
```

### إذا كان السيرفر على خادم حقيقي (Production):
استخدم عنوان IP أو Domain الخاص بالسيرفر:
```
http://your-server-ip:5014
أو
https://yourdomain.com
```

---

## 🔧 الخطوة 2: إنشاء Webhooks في ClickUp
## Step 2: Create Webhooks in ClickUp

### 1. افتح ClickUp Settings
1. اذهب إلى: https://app.clickup.com/
2. اضغط على **Settings** (الإعدادات) في الزاوية اليسرى السفلى
3. اختر **Integrations** → **Webhooks**

### 2. أنشئ Webhook جديد (Create New Webhook)

اضغط على **"Create Webhook"**

### 3. كون 3 Webhooks منفصلة:

#### ✅ Webhook #1: Task Created (مهمة جديدة)

**Name:** `Task Created Notification`

**Endpoint URL:**
```
https://your-ngrok-url.ngrok.io/webhooks/task-created
```
أو
```
http://your-server-ip:5014/webhooks/task-created
```

**Workspace:** اختر الـ Workspace الخاص بك

**Events to trigger:**
- ☑️ **taskCreated**

**Filters (Optional):**
- Space: اختر Space معين أو اترك "All Spaces"
- List: اختر List معين أو اترك "All Lists"

اضغط **Create Webhook**

---

#### ✅ Webhook #2: Task Updated (تحديث مهمة)

**Name:** `Task Updated Notification`

**Endpoint URL:**
```
https://your-ngrok-url.ngrok.io/webhooks/task-updated
```

**Workspace:** نفس الـ Workspace

**Events to trigger:**
- ☑️ **taskUpdated**

اضغط **Create Webhook**

---

#### ✅ Webhook #3: Task Comment (تعليق على مهمة)

**Name:** `Task Comment Notification`

**Endpoint URL:**
```
https://your-ngrok-url.ngrok.io/webhooks/task-comment
```

**Workspace:** نفس الـ Workspace

**Events to trigger:**
- ☑️ **taskCommentPosted**

اضغط **Create Webhook**

---

## 🧪 الخطوة 3: اختبار الـ Webhooks
## Step 3: Test the Webhooks

### 1. راقب الـ Logs في التطبيق
شغل التطبيق وشاهد الـ logs:
```bash
npm start
```

### 2. أنشئ مهمة جديدة في ClickUp
اذهب إلى ClickUp وأنشئ مهمة جديدة في أي List.

### 3. تحقق من الإشعار
يجب أن ترى في الـ console:
```
📥 Webhook received: Task Created
✅ Task created notification sent
```

ويجب أن تستقبل رسالة في **مجموعة الواتساب**:
```
🎉 مهمة جديدة تم إنشاؤها!

📋 اسم المهمة: [اسم المهمة]
👤 تم التعيين إلى: @المستخدم
📅 تاريخ الاستحقاق: [التاريخ]
🔗 الرابط: [رابط المهمة]
```

---

## 🔍 الخطوة 4: التحقق من أن الـ Webhooks تعمل
## Step 4: Verify Webhooks are Working

### استخدم نقاط الاختبار (Test Endpoints):

```bash
# 1. تحقق من صحة السيرفر
curl http://localhost:5014/health

# 2. تحقق من حالة الواتساب
curl http://localhost:5014/test/whatsapp-status

# 3. جرب إرسال رسالة تجريبية للمجموعة
curl http://localhost:5014/test/send-test-message
```

---

## 📊 مراقبة الـ Webhooks
## Monitor Webhooks

### في ClickUp:
1. اذهب إلى **Settings** → **Integrations** → **Webhooks**
2. ستجد قائمة بجميع الـ Webhooks
3. اضغط على أي Webhook لترى:
   - ✅ **Recent Deliveries** (آخر الإرسالات)
   - ⏱️ **Response Times** (أوقات الاستجابة)
   - ❌ **Failed Deliveries** (الإرسالات الفاشلة)

### في التطبيق:
راقب ملف الـ logs:
```bash
tail -f logs/app-YYYY-MM-DD.log
```

---

## ❌ استكشاف الأخطاء
## Troubleshooting

### المشكلة: لا تصل الإشعارات

**الأسباب المحتملة:**

#### 1. الـ Webhook URL غير صحيح
تأكد من أن URL صحيح:
```bash
# اختبر الـ endpoint يدوياً
curl -X POST http://your-server:5014/webhooks/task-created \
  -H "Content-Type: application/json" \
  -d '{"event": "test"}'
```

يجب أن ترى:
```
Webhook received
```

#### 2. السيرفر غير متاح من الإنترنت
إذا كنت تستخدم سيرفر محلي:
- تأكد من أن **ngrok** يعمل
- تحقق من أن URL في ClickUp هو URL الـ ngrok

#### 3. الواتساب غير متصل
تحقق من حالة الواتساب:
```bash
curl http://localhost:5014/test/whatsapp-status
```

يجب أن ترى:
```json
{
  "isReady": true,
  "hasGroup": true
}
```

#### 4. المجموعة غير موجودة
تأكد من أن اسم المجموعة في `.env` مطابق للاسم الحقيقي:
```env
WHATSAPP_GROUP_NAME=Click Up notification 📢
```

#### 5. الـ Webhooks معطلة في ClickUp
تحقق من أن Status = **Active** (نشط) في إعدادات ClickUp.

---

## 🎯 نقاط النهاية المتاحة (Available Endpoints)
## Available Webhook Endpoints

| Endpoint | Purpose | متى يتم الاستدعاء |
|----------|---------|-------------------|
| `POST /webhooks/task-created` | إشعار مهمة جديدة | عند إنشاء مهمة |
| `POST /webhooks/task-updated` | إشعار تحديث مهمة | عند تحديث مهمة |
| `POST /webhooks/task-comment` | إشعار تعليق جديد | عند إضافة تعليق |
| `POST /webhooks/sample-request` | طلب عينة من ERPNext | عند طلب عينة |

---

## 📝 ملاحظات مهمة
## Important Notes

1. **ngrok للتطوير فقط:**
   - ngrok مجاني لكن الـ URL يتغير كل مرة تعيد تشغيله
   - للإنتاج، استخدم سيرفر حقيقي مع Domain ثابت

2. **الأمان (Security):**
   - للإنتاج، استخدم HTTPS فقط
   - أضف Webhook Secret للتحقق من الطلبات
   - استخدم firewall لحماية السيرفر

3. **معدل الطلبات (Rate Limits):**
   - ClickUp لديه حد للـ webhooks (حوالي 100 webhook/دقيقة)
   - التطبيق لديه نظام batching للإشعارات (60 ثانية)

4. **إعادة المحاولة (Retries):**
   - إذا فشل الـ webhook، ClickUp سيعيد المحاولة 3 مرات
   - تحقق من logs للتأكد من استقبال الطلبات

---

## ✅ قائمة التحقق النهائية
## Final Checklist

- [ ] التطبيق يعمل (`npm start`)
- [ ] الواتساب متصل (QR code scanned)
- [ ] المجموعة موجودة ومكتشفة
- [ ] ngrok يعمل (للتطوير المحلي)
- [ ] تم إنشاء 3 webhooks في ClickUp
- [ ] URLs صحيحة في ClickUp
- [ ] Webhooks نشطة (Active) في ClickUp
- [ ] تم اختبار المهمة والإشعار وصل

---

## 🆘 تحتاج مساعدة؟
## Need Help?

إذا لم تعمل الـ webhooks بعد كل هذه الخطوات:

1. شارك logs من التطبيق
2. شارك screenshot من إعدادات Webhook في ClickUp
3. تحقق من Recent Deliveries في ClickUp Webhook

---

## 📚 روابط مفيدة
## Useful Links

- [ClickUp Webhooks Documentation](https://clickup.com/api/developer-portal/webhooks/)
- [ngrok Documentation](https://ngrok.com/docs)
- [Test your webhooks locally](https://webhook.site/)

---

**بعد اتباع هذه الخطوات، يجب أن تستقبل الإشعارات في الواتساب! 🎉**

**After following these steps, you should receive notifications in WhatsApp! 🎉**
