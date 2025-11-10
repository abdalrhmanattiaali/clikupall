# 📋 سيناريوهات الإشعارات الكاملة

هذا الملف يوضح **جميع** السيناريوهات الممكنة لنظام الإشعارات وكيفية التعامل معها.

---

## 📊 ملخص سريع

| السيناريو | DM فوري | Batch للمجموعة | الوقت |
|-----------|---------|-----------------|-------|
| 📝 مهمة جديدة | ✅ للمكلف | ✅ بعد 60 ث | فوري + batch |
| ✅ إكمال مهمة | ✅ للمنجز | ✅ بعد 60 ث | فوري + batch |
| 👤 تكليف شخص | ✅ للمكلف | ✅ فوري | فوري |
| 🔄 تغيير حالة | ❌ | ✅ بعد 60 ث | batch فقط |
| 🔴 تغيير أولوية | ❌ | ✅ بعد 60 ث | batch فقط |
| ✏️ تغيير اسم | ❌ | ✅ بعد 60 ث | batch فقط |
| 🏷️ إضافة/إزالة tag | ❌ | ✅ بعد 60 ث | batch فقط |
| ⏰ تذكير موعد نهائي | ✅ للمكلف | ✅ فوري | فوري |
| ☑️ إكمال checklist | ❌ | ✅ بعد 60 ث | batch فقط |
| 🎉 إكمال كل checklists | ❌ | ✅ فوري | فوري |
| 💬 تعليق جديد | ❌ | ✅ بعد 60 ث | batch فقط |

---

## 🎯 السيناريوهات التفصيلية

---

### 1️⃣ **مهمة جديدة تم إنشاؤها**

#### 📥 **المدخلات:**
```javascript
{
  event: "task_created",
  task: {
    id: "86c6eyp8c",
    name: "Work Order: Shire Baby Oil 75 ml",
    ai_weight: 32,
    ai_complexity: "medium",
    ai_estimated_time: 45,
    priority_label: "عالية",
    due_date: "1699564800000",
    assignees: [
      { id: 123, name: "Ahmed", phone: "201234567890" },
      { id: 456, name: "Sara", phone: "201234567891" }
    ]
  }
}
```

#### 📤 **ما يحدث:**

1. **DM فوري للمكلفين (Ahmed & Sara):**
```
👋 مرحباً Ahmed!

🎯 تم إسناد مهمة جديدة لك:
📝 Work Order: Shire Baby Oil 75 ml

التفاصيل:
• الأولوية: عالية
• الوزن: 32 نقطة 💎
• التعقيد: متوسطة
• الوقت المتوقع: 45 دقيقة ⏱️
• الموعد النهائي: ⚠️ بعد 2 أيام فقط!

🔗 https://app.clickup.com/t/86c6eyp8c

💪 بالتوفيق!
```

2. **إضافة للـ batch queue (60 ثانية)**
3. **بعد 60 ثانية → رسالة منظمة للمجموعة** (شوف سيناريو #11)

#### 🔔 **التوقيت:**
- DM: **فوري** (في نفس اللحظة)
- المجموعة: **بعد 60 ثانية** (مع باقي التحديثات)

---

### 2️⃣ **مهمة تم إكمالها**

#### 📥 **المدخلات:**
```javascript
{
  event: "task_completed",
  task: {
    id: "86c6eyp8c",
    name: "Work Order: Shire Baby Oil 75 ml",
    ai_weight: 32,
    ai_complexity: "medium",
    assignees: [{ id: 123, name: "Ahmed", phone: "201234567890" }]
  },
  userName: "Ahmed",
  gamificationResult: {
    pointsEarned: 32,
    newBadges: [
      { name: "Speed Demon", emoji: "⚡" }
    ],
    shieldUpgrade: {
      from: { name: "Bronze Shield" },
      to: { name: "Silver Shield" }
    }
  }
}
```

#### 📤 **ما يحدث:**

1. **DM فوري للمنجز (Ahmed):**
```
🎉 أحسنت Ahmed!

✅ لقد أكملت: Work Order: Shire Baby Oil 75 ml

المكافآت:
• 32 نقطة 🎯
• 1 وسام جديد! 🏆
  - Speed Demon ⚡
• ترقية درع: Silver Shield 🛡️

💡 نصيحة: حاول إكمال المهام الأصعب في بداية اليوم
عندما يكون تركيزك أعلى!

🔥 استمر في الإنجاز!
```

2. **إضافة للـ batch queue**
3. **بعد 60 ثانية → رسالة للمجموعة** (شوف سيناريو #11)

#### 🔔 **التوقيت:**
- DM: **فوري**
- المجموعة: **بعد 60 ثانية**

#### 💡 **النصائح العشوائية (واحدة تظهر):**
1. حاول إكمال المهام الأصعب في بداية اليوم عندما يكون تركيزك أعلى
2. قسّم المهام الكبيرة إلى مهام فرعية أصغر لتحقيق تقدم مستمر
3. خصص 25 دقيقة من التركيز الكامل (Pomodoro) ثم استرح 5 دقائق
4. راجع مهامك المكتملة أسبوعياً لتقييم تقدمك
5. تواصل مع الفريق عند مواجهة عقبات - التعاون يسرّع الإنجاز
6. ضع أهدافاً يومية صغيرة وقابلة للتحقيق

---

### 3️⃣ **تكليف شخص جديد بمهمة موجودة**

#### 📥 **المدخلات:**
```javascript
{
  event: "assignee_add",
  task: {
    id: "86c6eyp8c",
    name: "Fix login bug",
    ai_weight: 15
  },
  assignee: {
    id: 123,
    name: "Ahmed",
    phone: "201234567890"
  },
  assignedBy: "Mohamed"
}
```

#### 📤 **ما يحدث:**

1. **رسالة فورية للمجموعة:**
```
📢 تم تكليف Ahmed بمهمة "Fix login bug" (15 نقطة)
```

2. **DM فوري للمكلف (Ahmed):**
```
👋 مرحباً Ahmed!

🎯 تم إسناد مهمة جديدة لك:
📝 Fix login bug

التفاصيل:
• الأولوية: عادية
• الوزن: 15 نقطة 💎
• التعقيد: متوسطة
• كلّف بواسطة: Mohamed

🔗 https://app.clickup.com/t/86c6eyp8c

💪 بالتوفيق!
```

#### 🔔 **التوقيت:**
- **فوري** (المجموعة والـ DM معاً)

---

### 4️⃣ **تغيير حالة المهمة**

#### 📥 **المدخلات:**
```javascript
{
  event: "status_updated",
  task: {
    id: "86c6eyp8c",
    name: "Database migration"
  },
  beforeStatus: "to do",
  afterStatus: "in progress",
  userName: "Ahmed"
}
```

#### 📤 **ما يحدث:**

1. **إضافة للـ batch queue فقط** (لا DM)
2. **بعد 60 ثانية → رسالة للمجموعة** (شوف سيناريو #11)

**مثال في الـ batch:**
```
🔄 تغييرات الحالة (3):
  1. Database migration
     to do → in progress
  2. Testing phase
     in progress → review
  3. Deploy to production
     review → done
```

#### 🔔 **التوقيت:**
- **batch فقط** (بعد 60 ثانية)

---

### 5️⃣ **تغيير أولوية المهمة**

#### 📥 **المدخلات:**
```javascript
{
  event: "priority_updated",
  task: {
    name: "Fix critical security issue"
  },
  beforePriority: "عادية",
  afterPriority: "عاجلة",
  userName: "Mohamed"
}
```

#### 📤 **ما يحدث:**

1. **إضافة للـ batch queue**
2. **بعد 60 ثانية → في الملخص**

#### 🔔 **التوقيت:**
- **batch فقط**

---

### 6️⃣ **تغيير اسم المهمة**

#### 📥 **المدخلات:**
```javascript
{
  event: "name_updated",
  task: {
    name: "Fix login issue (updated)"
  },
  beforeName: "Fix login bug",
  userName: "Sara"
}
```

#### 📤 **ما يحدث:**

1. **إضافة للـ batch queue**

#### 🔔 **التوقيت:**
- **batch فقط**

---

### 7️⃣ **إضافة/إزالة Tag**

#### 📥 **المدخلات:**
```javascript
{
  event: "tag_added",
  task: { name: "API endpoint" },
  tag: "backend",
  userName: "Ahmed"
}
```

#### 📤 **ما يحدث:**

1. **إضافة للـ batch queue**

#### 🔔 **التوقيت:**
- **batch فقط**

---

### 8️⃣ **تذكير بموعد نهائي**

#### 📥 **المدخلات:**
```javascript
{
  event: "taskDueDateUpdated",
  task: {
    id: "86c6eyp8c",
    name: "Submit quarterly report",
    ai_weight: 25,
    status_name: "in progress",
    assignees: [
      { id: 123, name: "Ahmed", phone: "201234567890" }
    ]
  }
}
```

#### 📤 **ما يحدث:**

1. **رسالة فورية للمجموعة:**
```
⏰ تذكير: الموعد النهائي اليوم!

المهمة: Submit quarterly report
الوزن: 25 نقطة 💎
الحالة: in progress
المكلفون: Ahmed

🔗 https://app.clickup.com/t/86c6eyp8c

⚡ أنجزها اليوم!
```

2. **DM فوري لكل المكلفين:**
```
⏰ تذكير: الموعد النهائي اليوم!

المهمة: Submit quarterly report
الوزن: 25 نقطة 💎
الحالة: in progress

🔗 https://app.clickup.com/t/86c6eyp8c

⚡ أنجزها اليوم!
```

#### 🔔 **التوقيت:**
- **فوري** (المجموعة والـ DM)

---

### 9️⃣ **إكمال عنصر من Checklist**

#### 📥 **المدخلات:**
```javascript
{
  event: "checklistItem_resolved",
  task: {
    name: "Project setup",
    checklist_resolved: 3,
    checklist_total: 10
  },
  userName: "Sara"
}
```

#### 📤 **ما يحدث:**

1. **إضافة للـ batch queue**

**مثال في الـ batch:**
```
☑️ تقدم في Checklists:
  • Project setup: 3/10 (30%)
```

#### 🔔 **التوقيت:**
- **batch فقط**

---

### 🔟 **إكمال جميع Checklists**

#### 📥 **المدخلات:**
```javascript
{
  event: "all_checklists_resolved",
  task: {
    name: "Project setup",
    checklist_resolved: 10,
    checklist_total: 10
  },
  userName: "Sara"
}
```

#### 📤 **ما يحدث:**

1. **رسالة فورية للمجموعة:**
```
🎉 تم إكمال جميع عناصر القائمة!

المهمة: Project setup
العناصر: 10/10
بواسطة: Sara

رائع! الآن يمكنك إغلاق المهمة! ✨
```

#### 🔔 **التوقيت:**
- **فوري للمجموعة**

---

### 1️⃣1️⃣ **رسالة Batch للمجموعة (كل 60 ثانية)**

#### 📥 **بعد تجميع أحداث لمدة 60 ثانية:**

```javascript
قائمة الأحداث المتجمعة:
- 3 مهام مكتملة
- 2 مهام جديدة
- 5 تغييرات حالة
- 1 تكليف
```

#### 📤 **الرسالة المرسلة:**

```
📊 التحديثات (11)
━━━━━━━━━━━━━━━━━━━

🎉 مهام مكتملة (3):
  1. Work Order: Shire Baby Oil 75 ml
     👤 Ahmed | 🎯 32 نقطة
  2. Fix login bug
     👤 Sara | 🎯 15 نقطة
  3. Design homepage
     👤 Mohamed | 🎯 20 نقطة

📝 مهام جديدة (2):
  1. Create API endpoint
     👥 Ahmed, Sara
  2. Update documentation
     👥 Mohamed

🔄 تغييرات الحالة (5):
  1. Database migration
     to do → in progress
  2. Testing phase
     in progress → review
  3. Deploy to production
     review → done
     ... و 2 أخرى

👤 تكليفات جديدة (1):
  1. Fix authentication

━━━━━━━━━━━━━━━━━━━
⏱️ آخر 60 ثانية
```

#### 🔔 **التوقيت:**
- **كل 60 ثانية** (أو حسب `env.notifications.batchDelay`)

---

### 1️⃣2️⃣ **تعليق جديد على مهمة**

#### 📥 **المدخلات:**
```javascript
{
  event: "taskCommentPosted",
  task: { name: "Fix login bug" },
  commentText: "تم حل المشكلة، جاري الاختبار",
  userName: "Ahmed"
}
```

#### 📤 **ما يحدث:**

1. **إضافة للـ batch queue**

**مثال في الـ batch:**
```
💬 تعليقات جديدة (2):
  1. على Fix login bug
  2. على Database migration
```

#### 🔔 **التوقيت:**
- **batch فقط**

---

### 1️⃣3️⃣ **إلغاء تكليف شخص**

#### 📥 **المدخلات:**
```javascript
{
  event: "assignee_rem",
  task: { name: "Fix login bug" },
  assigneeName: "Sara",
  unassignedBy: "Mohamed"
}
```

#### 📤 **ما يحدث:**

1. **إضافة للـ batch queue**

#### 🔔 **التوقيت:**
- **batch فقط**

---

### 1️⃣4️⃣ **بدء موعد المهمة**

#### 📥 **المدخلات:**
```javascript
{
  event: "taskStartDateUpdated",
  task: {
    name: "Sprint planning",
    ai_weight: 10
  }
}
```

#### 📤 **ما يحدث:**

1. **رسالة فورية للمجموعة:**
```
🚀 حان وقت البدء!

المهمة: Sprint planning
الوزن: 10 نقطة 💎

🔗 https://app.clickup.com/t/...

ابدأ الآن! 💪
```

#### 🔔 **التوقيت:**
- **فوري**

---

## ⚙️ الإعدادات

### تغيير وقت الـ Batching:

في ملف `.env`:
```env
NOTIFICATION_BATCH_DELAY=60000  # 60 ثانية (بالميللي ثانية)
```

**أمثلة:**
- 30 ثانية: `30000`
- دقيقة واحدة: `60000`
- دقيقتين: `120000`
- 5 دقائق: `300000`

---

## 🎯 قواعد مهمة

### **متى يرسل DM فوري:**
✅ مهمة جديدة → للمكلف
✅ إكمال مهمة → للمنجز (مع أوسمة ونصائح)
✅ تكليف جديد → للمكلف
✅ تذكير موعد نهائي → للمكلف

### **متى يرسل للـ Batch:**
⏳ كل التحديثات الأخرى
⏳ تغيير حالة
⏳ تغيير أولوية
⏳ تغيير اسم
⏳ إضافة/إزالة tags
⏳ تعليقات
⏳ checklist items

### **متى يرسل فوري للمجموعة فقط:**
🎉 إكمال جميع checklists
🎊 إكمال جميع subtasks
📢 تكليف شخص
⏰ تذكير موعد نهائي
🚀 بدء موعد مهمة

---

## 🔄 التدفق الكامل

```
┌─────────────────────┐
│  Webhook من ClickUp │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │ تحديد النوع  │
    └──────┬───────┘
           │
     ┌─────┴─────┐
     │           │
    مهمة       تغيير
    جديدة      حالة
     │           │
     ▼           ▼
┌─────────┐  ┌─────────┐
│ DM فوري │  │  Batch  │
│للمكلف   │  │Queue    │
└─────────┘  └────┬────┘
     │            │
     │            │ (انتظار 60 ث)
     │            │
     ▼            ▼
للمستخدم    للمجموعة
المعني       (ملخص منظم)
```

---

## 📝 ملاحظات نهائية

1. **جميع الرسائل بالعربي** مع إيموجي مناسبة
2. **الـ DM يحتوي على تفاصيل أكثر** من رسالة المجموعة
3. **رسائل الإنجاز تحتوي على نصائح عشوائية** (6 أنواع)
4. **الـ batch يجمع كل شيء** ويرسل ملخص منظم
5. **الإشعارات المهمة فورية** (تكليف، إكمال، تذكير)
6. **الإشعارات العادية batched** (تغيير اسم، حالة، إلخ)

---

## 🚀 للتجربة

1. شغل التطبيق: `npm start`
2. انتظر: `WhatsApp ready - notification service activated`
3. جرب السيناريوهات المختلفة في ClickUp
4. راقب الـ logs والإشعارات

---

**تم التحديث:** {{ new Date().toLocaleDateString('ar-EG') }}
