# 🧠 نظام الذكاء الاصطناعي السلوكي المتقدم

## نظرة عامة

نظام ذكاء اصطناعي متكامل يوفر تحليل سلوكي، تقييم ذكي للمهام، توصيات شخصية، ونظام إشعارات مدعوم بالذكاء الاصطناعي الكامل (ChatGPT-5).

---

## 🎯 المميزات الرئيسية

### 1. **نظام تقييم المهام بالذكاء الاصطناعي (AI Task Weighting)**
- تقييم ذكي لكل مهمة (0-100 نقطة)
- تحليل التعقيد (بسيط، متوسط، معقد، معقد جداً)
- حساب الوقت المتوقع للإنجاز
- تحديد المهارات المطلوبة
- تحليل التبعيات

### 2. **قاعدة بيانات SQLite متقدمة**
- تخزين كامل لبيانات المهام من ClickUp
- سجل شامل لجميع الأحداث (20+ نوع)
- تحليل سلوكي للمستخدمين
- نظام توصيات ذكي
- Cache للتحليلات الذكية

### 3. **نظام سلوكي ذكي (Behavioral AI)**
- تحليل نمط عمل كل مستخدم
- توصيات صباحية مخصصة
- تحديد أوقات الإنتاجية
- اقتراح جدول عمل مثالي

### 4. **معالج أحداث شامل (20+ Webhook Events)**
- دعم جميع أحداث ClickUp
- إشعارات ذكية لكل حدث
- تخزين وتحليل كل التغييرات

---

## 📊 هندسة النظام

```
┌─────────────────────────────────────────────────────────────┐
│                    ClickUp Webhooks                         │
│         (20+ Events: Create, Update, Assign, etc.)          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           Enhanced Webhook Controller                        │
│  • Routes events to handlers                                 │
│  • Fetches complete task data                               │
│  • Stores in database                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
┌──────────────────┐   ┌──────────────────┐
│  SQLite Database │   │ AI Task Weighting│
│  • Tasks         │   │ • Complexity     │
│  • Events        │   │ • Time Estimate  │
│  • User Behavior │   │ • Skills        │
│  • Recommendations│   │ • Dependencies   │
└──────────────────┘   └──────────────────┘
          │                     │
          └──────────┬──────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Behavioral AI Service                           │
│  • Analyze work patterns                                     │
│  • Generate morning recommendations                          │
│  • Suggest optimal task order                               │
│  • Personalized scheduling                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               WhatsApp Notifications                         │
│  • Task assignments with AI weight                           │
│  • Completion notifications with points                      │
│  • Morning recommendations                                   │
│  • Smart reminders                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ قاعدة البيانات

### الجداول الرئيسية:

#### 1. **tasks** - المهام الكاملة
```sql
- id, name, description
- status_name, priority_label
- assignee_ids, creator_id
- dates (created, updated, start, due, closed)
- checklist & subtask counts
- ai_weight, ai_complexity, ai_estimated_time
- ai_skills_required, ai_dependencies
- custom_fields, tags, url
```

#### 2. **task_events** - سجل الأحداث
```sql
- event_id, task_id
- trigger_type, trigger_category
- changed_by_id, changed_at
- field_name, prev_value, next_value
- raw_payload
- notification_sent
```

#### 3. **user_behavior** - السلوك والأنماط
```sql
- user_id, username
- most_productive_hour
- avg_tasks_per_day
- avg_completion_time_minutes
- on_time_completion_rate, overdue_rate
- ai_work_style (fast_starter, night_owl, etc.)
- ai_strengths, ai_improvement_areas
- ai_recommended_schedule
```

#### 4. **task_recommendations** - التوصيات
```sql
- user_id, task_id
- recommendation_type (quick_win, focus_task, etc.)
- score (relevance 0-1)
- reason (AI-generated)
- recommended_for_date, recommended_for_time_slot
- status (pending, accepted, completed)
```

#### 5. **ai_analysis_cache** - ذاكرة التخزين المؤقت
```sql
- cache_key, cache_type
- input_hash, result
- model_used, tokens_used
- expires_at
```

---

## 🎨 نظام تقييم المهام بالذكاء الاصطناعي

### كيف يعمل؟

عند استلام مهمة جديدة أو webhook، يتم:

1. **جمع البيانات الكاملة** من ClickUp API
2. **إرسال للذكاء الاصطناعي** مع معايير التقييم
3. **تحليل ذكي** لـ:
   - **التعقيد الفني** (0-30 نقطة)
   - **الوقت المتوقع** (0-25 نقطة)
   - **عدد المهارات** (0-20 نقطة)
   - **التأثير والأهمية** (0-15 نقطة)
   - **المتطلبات والتبعيات** (0-10 نقطة)
4. **تخزين النتيجة** في قاعدة البيانات مع cache
5. **استخدام الوزن** في:
   - حساب النقاط عند الإنجاز
   - التوصيات الصباحية
   - الإشعارات

### مثال على الاستجابة:

```json
{
  "weight": 65,
  "complexity": "complex",
  "estimated_time": 180,
  "skills_required": ["JavaScript", "React", "API Integration"],
  "dependencies": ["Backend API must be ready first"],
  "reasoning": "المهمة معقدة لأنها تتطلب دمج مع API خارجي وتتطلب 3 مهارات مختلفة",
  "breakdown": {
    "technical_complexity": 25,
    "time_estimate": 18,
    "skills_count": 12,
    "impact": 8,
    "dependencies": 2
  }
}
```

---

## 🌅 نظام التوصيات الصباحية

### التوقيت:
- **7:30 صباحاً** يومياً

### كيف يعمل؟

1. **جمع المهام المفتوحة** للمستخدم من قاعدة البيانات
2. **تحليل سلوك المستخدم**:
   - أكثر أوقات الإنتاجية
   - نمط العمل (Fast Starter, Night Owl, etc.)
   - معدل الإنجاز
3. **إرسال للذكاء الاصطناعي** مع:
   - المهام المتاحة
   - الأوزان AI لكل مهمة
   - سلوك المستخدم
   - الوقت الحالي
4. **استلام توصيات ذكية**:
   - 3-5 مهام مرتبة حسب الأفضلية
   - سبب كل توصية
   - توقيت التنفيذ (صباح، ظهيرة، مساء)
   - نصائح تحفيزية

### أنواع التوصيات:

- **⚡ Quick Win**: مهام سريعة لبناء الزخم (10-20 نقطة)
- **🎯 Focus Task**: مهام معقدة تحتاج تركيز (50-80 نقطة)
- **🌅 Morning Priority**: مهام أفضل في الصباح
- **🌤️ Afternoon Task**: مهام خفيفة لبعد الظهر
- **🔥 Urgent**: مهام عاجلة
- **⭐ Important**: مهام مهمة

### مثال على الرسالة:

```
🌅 صباح الخير أحمد!

📊 لديك 12 مهمة مفتوحة، 3 منها عاجلة. تبدو نشيطاً اليوم!

💡 أنت من نوع Fast Starter، لذا سنبدأ بمهمة سريعة!

📋 مهامك الموصى بها اليوم:

1. ⚡ Review API documentation
   ⏱️ 15 دقيقة
   💎 15 نقطة (بسيطة)
   💭 مهمة سريعة (15 دقيقة) ستعطيك زخم للبدء

2. 🎯 Implement user authentication
   ⏱️ 2-3 ساعات
   💎 65 نقطة (معقدة)
   💭 مهمة مهمة وتحتاج تركيز، وقت الصباح مثالي لها

3. 🌤️ Update documentation
   ⏱️ 45 دقيقة
   💎 20 نقطة (بسيطة)
   💭 مهمة خفيفة مناسبة لبعد الظهر

✨ ابدأ بالمهمة السريعة لتكتسب زخم، ثم انتقل للمهمة المعقدة! 💪
```

---

## 📡 معالج الأحداث الشامل (20+ Events)

### فئات الأحداث:

#### 1. **إدارة المهام (Task Management)**
- ✅ `task_created` - مهمة جديدة
- 📝 `task_updated` - تحديث عام
- 🗑️ `task_deleted` - حذف مهمة
- 👤 `assignee_add` - إضافة مكلف
- 👥 `assignee_rem` - إزالة مكلف
- 🔄 `status_updated` - تغيير الحالة
- ⭐ `priority_updated` - تغيير الأولوية
- ✏️ `name_updated` - تغيير الاسم
- 🏷️ `tag_added` / `tag_removed` - إضافة/إزالة وسم
- 📊 `custom_field_updated` - تحديث حقل مخصص
- 🔗 `task_linked` / `task_unlinked` - ربط/فك ربط
- 🔄 `task_type_changed` - تغيير نوع المهمة

#### 2. **التواريخ والوقت (Dates & Time)**
- 📅 `dueDate_updated` - تغيير الموعد النهائي
- 📆 `startDate_updated` - تغيير تاريخ البدء
- ⏰ `taskDueDateUpdated` - تذكير بالموعد النهائي
- 🚀 `taskStartDateUpdated` - تذكير ببدء المهمة
- ⏱️ `taskTimeTracked` - تسجيل وقت

#### 3. **القوائم والمهام الفرعية (Checklists & Subtasks)**
- ☑️ `checklistItem_resolved` - إتمام عنصر قائمة
- 🎉 `all_checklists_resolved` - إتمام جميع القوائم
- 📌 `subtask_created` - إضافة مهمة فرعية
- 🎊 `all_subtasks_resolved` - إتمام جميع المهام الفرعية

#### 4. **التعليقات (Comments)**
- 💬 `taskCommentPosted` - تعليق جديد
- ✏️ `taskCommentUpdated` - تحديث تعليق

### مثال على الإشعار (مهمة جديدة):

```
📝 *مهمة جديدة*

*الاسم:* تطوير صفحة تسجيل الدخول
*الأولوية:* عالية
*الوزن AI:* 65 نقطة (معقدة)
*الوقت المتوقع:* 180 دقيقة
*المكلفون:* أحمد, محمد
*الموعد النهائي:* 15 نوفمبر 2025

🔗 https://app.clickup.com/t/abc123
```

### مثال على الإشعار (إتمام مهمة):

```
✅ *مهمة مكتملة!*

*المهمة:* تطوير صفحة تسجيل الدخول
*أكملها:* أحمد
*الوزن:* 65 نقطة 💎 (معقدة)
*النقاط المكتسبة:* 97 نقطة 🎯
*أوسمة جديدة:* 2 🏆
*ترقية درع:* 🥈 الفضة 🛡️

🎉 رائع! استمر في الإنجاز!
```

---

## 🧪 نقاط الاختبار (Test Endpoints)

### قاعدة البيانات:

```bash
# إحصائيات قاعدة البيانات
GET /test/db-stats

# جلب مهمة من ClickUp وتخزينها
POST /test/sync-task/:taskId

# عرض مهمة من قاعدة البيانات
GET /test/task/:taskId

# عرض جميع مهام مستخدم
GET /test/user-tasks/:userId?status=open&priority=high

# سجل أحداث مهمة
GET /test/task-events/:taskId?limit=50

# مزامنة جميع المهام (تحذير: قد يستغرق وقت!)
POST /test/sync-all-tasks
```

### تقييم المهام:

```bash
# تحليل مهمة بالذكاء الاصطناعي
POST /test/analyze-task/:taskId
# يرجع: weight, complexity, estimated_time, skills, dependencies
```

### السلوك والتوصيات:

```bash
# تحليل سلوك مستخدم
POST /test/analyze-behavior/:userId

# عرض سلوك محفوظ
GET /test/user-behavior/:userId

# توصيات صباحية لمستخدم
POST /test/morning-recommendations/:userId

# إرسال توصيات لجميع الفريق
POST /test/send-recommendations
```

---

## ⚙️ إعداد الـ Webhooks

### 1. Endpoint الموحد:

```
POST https://your-domain.com/webhooks/clickup
```

### 2. الأحداث المدعومة (20+):

في لوحة تحكم ClickUp → Webhooks، أضف الأحداث التالية:

**Task Management:**
- Task Created
- Task Updated
- Task Deleted
- Assignee Added
- Assignee Removed
- Status Changed
- Priority Changed
- Task Name Changed
- Tag Added / Removed
- Custom Field Changed
- Task Linked / Unlinked
- Task Type Changed

**Dates & Time:**
- Due Date Changed
- Start Date Changed
- Due Date Arrives
- Start Date Arrives
- Time Tracked

**Checklists & Subtasks:**
- Checklist Item Resolved
- All Checklists Resolved
- Subtask Created
- All Subtasks Resolved

**Comments:**
- Comment Posted
- Comment Updated

### 3. مثال على الـ Payload:

```json
{
  "event": "taskUpdated",
  "task_id": "abc123",
  "history_items": [{
    "field": "status",
    "before": {"status": "To Do"},
    "after": {"status": "In Progress"},
    "user": {
      "id": 123,
      "username": "ahmed@example.com"
    },
    "date": "1699900000000"
  }],
  "webhook_id": "wh_7b2e..."
}
```

---

## 🔄 سير العمل (Workflow)

### عند استلام Webhook:

```
1. استلام Webhook من ClickUp
   ↓
2. تحديد نوع الحدث
   ↓
3. جلب البيانات الكاملة من ClickUp API
   ↓
4. تخزين في قاعدة البيانات SQLite
   ↓
5. تقييم المهمة بالذكاء الاصطناعي (إذا لم يتم من قبل)
   ↓
6. تخزين وزن AI في قاعدة البيانات
   ↓
7. معالجة الحدث (gamification, notifications, etc.)
   ↓
8. إرسال إشعار WhatsApp مع وزن AI
   ↓
9. تسجيل الحدث في قاعدة البيانات
```

### توصيات الصباح (7:30 صباحاً):

```
1. جلب مهام كل مستخدم من قاعدة البيانات
   ↓
2. تحليل سلوك المستخدم (إذا متاح)
   ↓
3. إرسال للذكاء الاصطناعي:
   - المهام المفتوحة
   - الأوزان AI
   - نمط العمل
   - الوقت الحالي
   ↓
4. استلام توصيات ذكية (3-5 مهام)
   ↓
5. تنسيق الرسالة
   ↓
6. إرسال لكل مستخدم على WhatsApp
```

---

## 📈 إحصائيات مثيرة للاهتمام

### الأوزان الشائعة:
- **10-20 نقطة**: مهام بسيطة سريعة (30% من المهام)
- **20-40 نقطة**: مهام متوسطة (45% من المهام)
- **40-70 نقطة**: مهام معقدة (20% من المهام)
- **70-100 نقطة**: مهام معقدة جداً (5% من المهام)

### أنماط العمل الشائعة:
- **Fast Starter** 🚀: يبدأ بمهام سريعة
- **Deep Thinker** 🧠: يفضل مهام معقدة
- **Steady Worker** ⚖️: وتيرة ثابتة
- **Night Owl** 🦉: أكثر إنتاجية ليلاً
- **Early Bird** 🌅: أكثر إنتاجية صباحاً
- **Sprint Worker** ⚡: يعمل بكثافة في فترات قصيرة

---

## 🎯 أمثلة على الاستخدام

### 1. إعداد مهمة جديدة مع تقييم AI:

```bash
# في ClickUp: إنشاء مهمة جديدة
# 👇 سيحدث تلقائياً:

1. Webhook يصل لـ /webhooks/clickup
2. النظام يجلب البيانات الكاملة
3. AI يقيّم المهمة: 65 نقطة (معقدة)
4. تخزين في قاعدة البيانات
5. إشعار WhatsApp:
   "📝 مهمة جديدة: تطوير API
    💎 الوزن: 65 نقطة (معقدة)
    ⏱️ الوقت المتوقع: 3 ساعات"
```

### 2. الحصول على توصيات صباحية:

```bash
# يحدث تلقائياً كل يوم 7:30 صباحاً
# أو يمكن اختباره:

curl -X POST http://localhost:5014/test/morning-recommendations/62585187

# النتيجة:
{
  "greeting": "🌅 صباح الخير أحمد!",
  "analysis": "لديك 8 مهام مفتوحة، 2 منها عاجلة",
  "work_style_note": "أنت من نوع Fast Starter",
  "tasks": [
    {
      "task_name": "Review documentation",
      "type": "quick_win",
      "ai_weight": 15,
      "estimated_time": "20 دقيقة",
      "reason": "مهمة سريعة لبناء الزخم"
    },
    ...
  ],
  "motivation": "ابدأ بالمهمة السريعة! 💪"
}
```

### 3. تحليل سلوك مستخدم:

```bash
curl -X POST http://localhost:5014/test/analyze-behavior/62585187

# النتيجة:
{
  "work_style": "fast_starter",
  "most_productive_hour": 9,
  "avg_tasks_per_day": 5.2,
  "on_time_completion_rate": 0.85,
  "strengths": [
    "سريع في إنجاز المهام البسيطة",
    "منظم",
    "ملتزم بالمواعيد"
  ],
  "improvement_areas": [
    "يمكن تحسين التعامل مع المهام المعقدة"
  ],
  "recommended_schedule": {
    "morning": "مهام معقدة (2 ساعة تركيز)",
    "midday": "مهام متوسطة + استراحة",
    "afternoon": "مهام سريعة + متابعة"
  }
}
```

---

## 💡 نصائح لتحقيق أقصى استفادة

### 1. **استخدم التوصيات الصباحية**
- افتح WhatsApp كل صباح 7:30
- اتبع ترتيب المهام المقترح
- ابدأ بـ Quick Wins لبناء الزخم

### 2. **راقب وزن AI للمهام**
- المهام ذات الوزن العالي = نقاط أكثر
- خطط لإنجازها في أوقات التركيز
- قسّم المهام المعقدة جداً (80+) إلى أجزاء

### 3. **حلل سلوكك دورياً**
- شاهد نمط عملك
- اكتشف أوقات إنتاجيتك
- اضبط جدولك وفقاً للتوصيات

### 4. **استفد من الإشعارات الذكية**
- كل حدث له إشعار مخصص
- الإشعارات تحتوي على وزن AI
- تابع تقدمك في الوقت الفعلي

---

## 🔧 استكشاف الأخطاء

### المشكلة: قاعدة البيانات لا تعمل

```bash
# تحقق من وجود المجلد
ls -la data/

# إنشاء المجلد إذا لم يكن موجود
mkdir -p data

# اختبار قاعدة البيانات
curl http://localhost:5014/test/db-stats
```

### المشكلة: AI لا يقيّم المهام

```bash
# تحقق من API Key
echo $OPENAI_API_KEY
# أو
echo $ANTHROPIC_API_KEY

# اختبر AI مباشرة
curl http://localhost:5014/test/ai

# اختبر تقييم مهمة
curl -X POST http://localhost:5014/test/analyze-task/YOUR_TASK_ID
```

### المشكلة: التوصيات لا تصل

```bash
# اختبر التوصيات يدوياً
curl -X POST http://localhost:5014/test/morning-recommendations/USER_ID

# تحقق من WhatsApp
curl http://localhost:5014/test/send-test-message
```

---

## 📚 الملفات الجديدة

```
src/
├── database/
│   ├── index.js         # Database service (SQLite)
│   └── schema.js        # Database schema definitions
│
├── services/
│   ├── clickup/
│   │   └── enhancedClickupService.js  # Enhanced ClickUp API
│   │
│   └── ai/
│       ├── taskWeightingService.js    # AI task evaluation
│       └── behavioralService.js       # Behavioral analysis & recommendations
│
├── controllers/
│   └── enhancedWebhookController.js   # 20+ event handlers
│
└── routes/
    ├── webhooks.js      # Updated with universal endpoint
    └── test.js          # New test endpoints added

data/
└── clickup.db           # SQLite database (auto-created)
```

---

## 🚀 الخلاصة

نظام ذكاء اصطناعي متكامل يوفر:

✅ تقييم ذكي لكل مهمة (AI Weight)
✅ قاعدة بيانات شاملة لجميع المهام والأحداث
✅ تحليل سلوكي لكل مستخدم
✅ توصيات صباحية مخصصة
✅ معالجة 20+ نوع من الأحداث
✅ إشعارات ذكية مدعومة بالذكاء الاصطناعي
✅ نظام cache ذكي للتحليلات
✅ واجهة اختبار شاملة

**النظام الآن جاهز للعمل! 🎉**

---

📧 للدعم والاستفسارات: راجع التوثيق الكامل أو اختبر الـ Endpoints

Made with ❤️ and 🤖 AI
