# 🚀 ClickUp All - Advanced Task Management System

نظام متقدم لإدارة المهام مع تكامل ClickUp و WhatsApp ومدعوم بالذكاء الاصطناعي

## ✨ الميزات الرئيسية

### 🤖 الذكاء الاصطناعي
- **دعم متعدد لمزودي AI:**
  - Claude (Anthropic)
  - ChatGPT (OpenAI) - GPT-5 (افتراضي)
  - Google Gemini
- **إشعارات ذكية:** توليد إشعارات سياقية تلقائياً
- **مدرب شخصي AI:** نصائح مخصصة بناءً على الأداء
- **محتوى تحفيزي:** اقتباسات وقصص ملهمة يومية

### 📊 التقارير والتحليلات
- تقارير يومية شخصية
- تقارير أسبوعية
- تقارير شهرية للفريق
- تحليل الإنتاجية
- لوحة تحكم تفاعلية

### 🎮 التحفيز والألعاب
- نظام الإنجازات والشارات
- تحديات أسبوعية
- ترشيحات كورسات مخصصة
- نظام النقاط والمكافآت

### 🔔 الإشعارات الذكية
- نظام قائمة انتظار للإشعارات
- دمج الإشعارات المتعددة
- إشعارات مباشرة للمهام الجديدة
- دعم الإيقاف المؤقت

### 🔗 التكاملات
- ClickUp API (المهام، التعليقات، الحالات)
- WhatsApp Web (إشعارات فورية)
- ERPNext Webhooks
- Dashboard API

## 📁 هيكل المشروع

```
clikupall/
├── src/
│   ├── config/              # الإعدادات
│   ├── core/                # الأنظمة الأساسية
│   ├── services/            # الخدمات
│   │   ├── ai/             # خدمات الذكاء الاصطناعي
│   │   ├── clickup/        # خدمات ClickUp
│   │   ├── whatsapp/       # خدمات WhatsApp
│   │   ├── notification/   # خدمات الإشعارات
│   │   └── ...
│   ├── controllers/         # المتحكمات
│   ├── routes/              # المسارات
│   ├── middleware/          # الوسطاء
│   ├── utils/               # الأدوات المساعدة
│   └── repositories/        # طبقة البيانات
├── data/                    # ملفات JSON
├── logs/                    # ملفات السجلات
├── public/                  # الملفات العامة
└── index.js                 # نقطة الدخول
```

## 🚀 التثبيت والإعداد

### المتطلبات
- Node.js >= 18.0.0
- npm أو yarn

### خطوات التثبيت

1. **استنساخ المشروع:**
```bash
git clone <repository-url>
cd clikupall
```

2. **تثبيت الحزم:**
```bash
npm install
```

3. **إعداد متغيرات البيئة:**
```bash
cp .env.example .env
```

4. **تعديل ملف `.env`:**
```env
# ClickUp
CLICKUP_API_TOKEN=your_token_here
CLICKUP_TEAM_ID=your_team_id

# AI Provider (claude | openai | gemini)
AI_PROVIDER=openai

# OpenAI (GPT-5)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5

# أو Claude
ANTHROPIC_API_KEY=your_claude_key

# أو Gemini
GEMINI_API_KEY=your_gemini_key
```

5. **تشغيل التطبيق:**
```bash
npm start
```

## 🎯 الاستخدام

### اختيار مزود الذكاء الاصطناعي

يمكنك التبديل بين مزودي AI عبر تغيير متغير `AI_PROVIDER` في `.env`:

```env
AI_PROVIDER=openai     # ChatGPT (GPT-5)
AI_PROVIDER=claude     # Claude (Anthropic)
AI_PROVIDER=gemini     # Google Gemini
```

### الميزات القابلة للتفعيل/التعطيل

```env
ENABLE_AI_NOTIFICATIONS=true
ENABLE_ENHANCED_MOTIVATION=true
ENABLE_DAILY_REPORTS=true
ENABLE_WEEKLY_CHALLENGES=true
ENABLE_BADGES=true
ENABLE_COURSES=true
ENABLE_INSPIRATIONAL_CONTENT=true
```

### API Endpoints

#### Webhooks
- `POST /task-created-webhook` - مهمة جديدة
- `POST /task-updated-webhook` - تحديث مهمة
- `POST /task-comment-webhook` - تعليق جديد
- `POST /sample-request-webhook` - طلب عينة

#### Dashboard
- `GET /dashboard` - لوحة التحكم
- `GET /api/dashboard-stats` - إحصائيات عامة
- `GET /api/leaderboard` - لوحة الصدارة
- `GET /api/badges/:userName` - شارات المستخدم
- `GET /api/challenges/current` - التحديات الحالية
- `GET /api/coach/:userName` - نصائح AI Coach

#### Testing
- `GET /test-ai-morning/:user` - اختبار رسالة صباحية
- `GET /test-ai-daily/:user` - اختبار تقرير يومي
- `GET /test-ai-weekly/:user` - اختبار تقرير أسبوعي
- `GET /test-inspiration` - اختبار محتوى تحفيزي

## 📚 التوثيق والتحقق

- [`GAMIFICATION_SYSTEM.md`](./GAMIFICATION_SYSTEM.md): دليل شامل لجميع عناصر نظام التلعيب (الأوسمة، الدروع، النقاط، السلاسل، ولوحات المتصدرين) مع شرح تفصيلي لكيفية عمل كل جزء.
- [`FEATURE_TEST_LINKS.md`](./FEATURE_TEST_LINKS.md): سيناريوهات جاهزة وروابط مباشرة لاختبار الإشعارات، نظام التحفيز، تقارير AI، ولوحات المتصدرين.
- للتحقق من توافق الكود مع المستندات يمكنك تشغيل:

```bash
npm run verify:gamification
```

سيقوم الفحص بالتأكد من وجود جميع الأوسمة، مستويات الدروع العشرة، جداول المضاعفات، ومحرك النقاط الموصوف في المستندات، بالإضافة إلى ضمان جاهزية الخدمة لإرجاع بيانات افتراضية صحيحة.

## 📅 الجدولة التلقائية

### المهام اليومية:
- **8:05 صباحاً** - رسائل صباحية AI
- **8:30 صباحاً** - تقارير المهام اليومية
- **9:15 صباحاً** - محتوى تحفيزي

### المهام المسائية:
- **11:35 مساءً** - تقارير AI اليومية
- **11:45 مساءً** - تقارير المهام
- **11:50 مساءً** - ملخص الفريق AI
- **11:55 مساءً** - إحصائيات المجموعة
- **11:58 مساءً** - رسالة تصبح على خير

### المهام الأسبوعية:
- **الجمعة 9:00 صباحاً** - تقارير أسبوعية AI

## 🏗️ البنية المعمارية

### Event-Driven Architecture
يستخدم النظام معمارية قائمة على الأحداث (Event Bus) للتواصل بين المكونات:

```javascript
import eventBus, { EVENTS } from './core/eventBus.js';

// إطلاق حدث
eventBus.emitEvent(EVENTS.TASK_COMPLETED, taskData);

// الاستماع لحدث
eventBus.onEvent(EVENTS.TASK_COMPLETED, async (data) => {
  // معالجة الحدث
});
```

### Repository Pattern
طبقة تجريد للبيانات (JSON Files):

```javascript
import productivityRepo from './repositories/productivityRepository.js';

// إضافة إدخال
await productivityRepo.addEntry({
  userId: 'user123',
  taskId: 'task456',
  type: 'task_completed'
});

// استرجاع بيانات
const stats = await productivityRepo.getUserStats('user123');
```

### Service Layer
خدمات مستقلة وقابلة لإعادة الاستخدام:

```javascript
import aiService from './services/ai/index.js';

// استخدام AI
const response = await aiService.generateCompletion(
  systemPrompt,
  userMessage
);

// التبديل بين المزودين
aiService.switchProvider('claude');
```

## 🔧 التطوير

### إضافة مزود AI جديد

1. إنشاء ملف في `src/services/ai/`:
```javascript
// newProvider.js
import { AIProviderInterface } from './index.js';

class NewProvider extends AIProviderInterface {
  async generateCompletion(systemPrompt, userMessage, options) {
    // التنفيذ
  }

  isAvailable() {
    // التحقق
  }
}

export default NewProvider;
```

2. إضافة في `src/services/ai/index.js`:
```javascript
import NewProvider from './newProvider.js';

// في initializeProvider()
case 'new':
  this.provider = new NewProvider();
  break;
```

### إضافة feature جديد

1. إنشاء service في `src/services/`
2. إضافة repository في `src/repositories/` (إذا لزم)
3. إضافة controller في `src/controllers/`
4. إضافة routes في `src/routes/`
5. تسجيل في `index.js`

## 📝 Logging

النظام يدعم logging متقدم:

```javascript
import logger from './core/logger.js';

logger.info('معلومة');
logger.error('خطأ', { details });
logger.debug('تصحيح');
logger.success('نجاح');
```

الـ logs تُحفظ تلقائياً في `logs/app-YYYY-MM-DD.log`

## 🔐 الأمان

- جميع API Keys في `.env`
- التحقق من البيانات المدخلة
- معالجة أخطاء آمنة
- تنظيف النصوص من HTML/Scripts

## 🤝 المساهمة

نرحب بالمساهمات! يرجى:
1. Fork المشروع
2. إنشاء branch جديد
3. Commit التغييرات
4. Push للـ branch
5. فتح Pull Request

## 📄 الترخيص

ISC License

## 🙏 الشكر

- [ClickUp](https://clickup.com) - نظام إدارة المهام
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - تكامل WhatsApp
- [Anthropic Claude](https://www.anthropic.com) - Claude AI
- [OpenAI](https://openai.com) - ChatGPT
- [Google](https://ai.google.dev) - Gemini AI

---

Made with ❤️ by ClickUp All Team
