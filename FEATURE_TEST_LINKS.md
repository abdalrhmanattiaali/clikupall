# دليل روابط الاختبار المتكاملة | Integrated Feature Test Links

هذا الدليل يجمع كل نقاط الاختبار السريعة للتأكد من أن تدفق الإشعارات، التحفيز، والذكاء الاصطناعي يعملان بسلاسة بعد أي تعديل.

> 💡 **نصيحة:** شغّل التطبيق (`npm start`) وتأكد من اتصال واتساب قبل تنفيذ أي اختبار.

## 1. نقاط الويب هوك الأساسية | Core Webhook Endpoints

| السيناريو | Endpoint | الوصف |
|-----------|----------|--------|
| إنشاء مهمة | `POST /webhooks/clickup/task-created` | يستقبل مهام جديدة ويطلق إشعار التكليف المباشر ورسالة الفريق |
| إضافة مسؤول | `POST /webhooks/clickup/task-assigned` | يرسل رسالة ترحيب فورية للمسؤول الجديد ويحدث لوحة الفريق |
| تغيير الحالة | `POST /webhooks/clickup/status-changed` | يبث رسالة حالة في القروب ويولّد نصيحة AI حسب الحالة |
| إكمال المهمة | `POST /webhooks/clickup/task-completed` | يحسب نقاط التحفيز، يرسل رسالة إنجاز شخصية، ويحدّث لوحة الشرف |

> استخدم نفس الـ URL مع إضافة معرّف الـ webhook في النهاية إذا احتجت تتبعاً مخصصاً، مثل: `/webhooks/clickup/status-changed/my-team-bot`.

### أمثلة `curl` جاهزة | Ready-to-use curl Samples

#### 🆕 إنشاء مهمة (مع تعيين مسؤول)
```bash
curl -X POST http://localhost:5014/webhooks/clickup/task-created/demo \
  -H 'Content-Type: application/json' \
  -d '{
    "auto_id": "demo",
    "trigger_id": "task-created",
    "payload": {
      "id": "TASK_ID_HERE",
      "name": "متابعة أوردرات العملاء",
      "status": {"status": "TO DO", "type": "open"},
      "priority": {"priority": "high"},
      "assignees": [{"id": "123", "username": "Abd Al Rahman", "email": "abd@example.com"}],
      "date_created": "1700000000000",
      "date_updated": "1700000000500"
    }
  }'
```

#### 👥 تعيين مسؤول إضافي
```bash
curl -X POST http://localhost:5014/webhooks/clickup/task-assigned/demo \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "taskAssigneeUpdated",
    "task_id": "TASK_ID_HERE",
    "history_items": [{
      "field": "assignee",
      "after": {"assignee": {"id": "123", "username": "Abd Al Rahman", "email": "abd@example.com"}},
      "user": {"username": "Automation Bot"}
    }]
  }'
```

#### 🔄 تغيير الحالة (أي حالة إلى أخرى)
```bash
curl -X POST http://localhost:5014/webhooks/clickup/status-changed/demo \
  -H 'Content-Type: application/json' \
  -d '{
    "auto_id": "demo",
    "trigger_id": "status-shift",
    "payload": {
      "id": "TASK_ID_HERE",
      "name": "متابعة أوردرات العملاء",
      "status": {"status": "UPDATE REQUIRED", "type": "custom"},
      "assignees": [{"id": "123", "username": "Abd Al Rahman", "email": "abd@example.com"}],
      "date_created": "1700000000000",
      "date_updated": "1700000300000"
    },
    "history_items": [{
      "field": "status",
      "before": {"status": "IN PROGRESS", "status_type": "in progress"},
      "after": {"status": "UPDATE REQUIRED", "status_type": "custom"},
      "user": {"username": "Automation Bot"}
    }]
  }'
```

#### ✅ اكتمال المهمة (يشغّل التحفيز)
```bash
curl -X POST http://localhost:5014/webhooks/clickup/task-completed/demo \
  -H 'Content-Type: application/json' \
  -d '{
    "auto_id": "demo",
    "trigger_id": "task-completed",
    "payload": {
      "id": "TASK_ID_HERE",
      "name": "متابعة أوردرات العملاء",
      "status": {"status": "COMPLETE", "type": "done"},
      "assignees": [{"id": "123", "username": "Abd Al Rahman", "email": "abd@example.com"}],
      "date_created": "1700000000000",
      "date_updated": "1700000500000"
    }
  }'
```

#### 🚫 إلغاء المهمة (يجب أن يُعامل كتغيير حالة فقط)
```bash
curl -X POST http://localhost:5014/webhooks/clickup/status-changed/demo \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "taskStatusUpdated",
    "task_id": "TASK_ID_HERE",
    "history_items": [{
      "field": "status",
      "before": {"status": "IN PROGRESS", "status_type": "in progress"},
      "after": {"status": "CANCELLED", "status_type": "cancelled"},
      "user": {"username": "Team Lead"}
    }],
    "payload": {
      "id": "TASK_ID_HERE",
      "name": "مراجعة مستندات العميل",
      "status": {"status": "CANCELLED", "type": "cancelled"},
      "assignees": [{"id": "123", "username": "Abd Al Rahman", "email": "abd@example.com"}],
      "date_created": "1700000000000",
      "date_updated": "1700000600000"
    }
  }'
```

> ✳️ استبدل `TASK_ID_HERE` بمعرّف حقيقي من ClickUp كي يستطيع النظام تحميل البيانات التفصيلية إن لزم.

## 2. التحقق من الإشعارات | Notification Verification

| الاختبار | الرابط السريع |
|----------|----------------|
| إرسال رسالة تجريبية إلى القروب | `GET /test/send-test-message` |
| حالة طابور الإشعارات | `GET /test/notification-queue` |
| التحقق من اتصال واتساب | `GET /test/whatsapp` |

بعد تنفيذ كل webhook:
1. تأكد من وصول رسالة القروب بتفاصيل الحالة الجديدة ونصيحة الـ AI.
2. تأكد من وصول رسالة خاصة للمسؤول (عند التعيين أو الإكمال).
3. راقب السجل في الطرفية للتأكد من عدم وجود تحذيرات.

## 3. التحفيز والإنجازات | Gamification & Motivation

| ما الذي نتحقق منه؟ | Endpoint |
|--------------------|----------|
| رصيد النقاط والتحديات للمستخدم | `GET /test/user-stats/:userName` |
| الأوسمة والترقيات الأخيرة (بالمعرف العددي) | `GET /test/user-achievements/:userId` |
| ترتيب لوحة الشرف | `GET /test/leaderboard/:type?` *(الأنواع: points, tasks, streak)* |
| آخر رسالة تحفيزية مناسبة | `GET /test/motivation/:timeSlot` *(أوقات مثل: morning, afternoon, evening)* |

> استخدم اسم المستخدم كما يظهر في ملف `src/config/team.js`.

## 4. اختبارات الذكاء الاصطناعي | AI Content Checks

| الغرض | Endpoint |
|--------|----------|
| التأكد من مزود الـ AI الحالي والاستجابة | `GET /test/ai` |
| مراجعة سياق التحفيز والرسائل المقترحة | `GET /test/motivation-context` |
| مراقبة تحليل المهمة الآلي | `GET /test/clickup-task/:taskId` متبوعًا بـ `GET /test/user-stats/:userName` |

## 5. قائمة تحقق سريعة بعد كل تعديل | Post-change Quick Checklist

- [ ] رسالة تغيير الحالة تصل للقروب باللغة الصحيحة وتتضمن الحالة السابقة والجديدة.
- [ ] رسالة الإكمال تحتوي نقاط التحفيز والأوسمة الجديدة (إن وُجدت).
- [ ] لا تصل رسالة تكليف عند مجرد تغيير الحالة إلى «مكتمل».
- [ ] رسائل (إنشاء/تعيين/تعليق/تعليق) توضّح دائماً من نفّذ الحدث ومن هو المسؤول عن المهمة.
- [ ] تغيير الحالة إلى «cancelled» لا يمنح نقاطاً ويظهر في القروب كإلغاء فقط مع حفظ الحالة السابقة.
- [ ] لوحة التحفيز (النقاط/الأوسمة) تتحدّث بعد الإكمال.
- [ ] تقارير الفريق يمكن استعراضها بدون أخطاء (`GET /test/scheduler-jobs`).

احتفظ بهذا الملف مرجعاً سريعاً قبل أي إطلاق لتضمن أن كل المسارات الحرجة تعمل بنفس الكفاءة التي تتوقعها. بالتوفيق! 🚀
