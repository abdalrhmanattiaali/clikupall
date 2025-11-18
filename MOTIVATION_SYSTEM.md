# نظام الإشعارات التحفيزية الذكي
# Intelligent Motivation System

## 🌟 Overview | نظرة عامة

نظام ذكي لإرسال رسائل تحفيزية للفريق 4 مرات يومياً، مدعوم بالذكاء الاصطناعي (ChatGPT/Claude/Gemini)، يحلل حالة المهام والفريق ويولد محتوى مخصص ومتنوع.

An intelligent system that sends motivational messages to the team 4 times daily, powered by AI (ChatGPT/Claude/Gemini), analyzes task status and team state, and generates personalized, diverse content.

---

## ⏰ Schedule | الجدول الزمني

### 1. صباحاً - Morning (08:00)
**الهدف:** طاقة وحماس للبداية
**النبرة:** متفائل ونشيط
**المحتوى:** اقتباسات ملهمة، قصص نجاح عن البدايات القوية

**Example:**
```
🌅 صباح الإنجاز

"النجاح لا يأتي من ما تفعله أحياناً، بل من ما تفعله دائماً" - روبرت كولير

عندما بدأت سارة بلاكلي Spanx بـ 5000 دولار فقط في شقتها، كانت البداية صعبة.
لكنها التزمت بالعمل كل صباح لمدة ساعتين قبل وظيفتها الرسمية. اليوم، Spanx تساوي مليار دولار.

💡 خطوة اليوم: ابدأ بأصعب مهمة في قائمتك خلال أول ساعة
```

---

### 2. منتصف اليوم - Midday (12:00)
**الهدف:** تركيز واستمرارية
**النبرة:** محفز وعملي
**المحتوى:** قصص المثابرة، نصائح للتركيز، تذكير بالإنجازات

**Example:**
```
⚡ استمر بقوة

حالة الفريق اليوم:
✅ 7 مهام مكتملة حتى الآن
📋 12 مهمة لا تزال مفتوحة
🎯 3 مهام عالية الأولوية

"الطريق إلى النجاح دائماً قيد الإنشاء" - ليلي توملين

عندما كاد فريق Spotify أن يستسلم بعد 6 أشهر من العمل على خوارزمية التوصيات،
قرروا مراجعة واحدة أخيرة. تلك المراجعة أنتجت "Discover Weekly" الذي يستخدمه
الآن 40 مليون شخص أسبوعياً.

✅ الآن: راجع تقدمك اليوم، واحتفل بكل إنجاز صغير
```

---

### 3. بعد الظهر - Afternoon (16:00)
**الهدف:** دفعة للإنجاز
**النبرة:** مشجع ومثابر
**المحتوى:** تحديات، تذكير بالمهام المتبقية، طاقة للإنهاء

**Example:**
```
🎯 الدفعة الأخيرة

التحديات المتبقية اليوم:
⚠️ 2 مهمة متأخرة تحتاج انتباه
🔥 4 مهام عالية الأولوية

"معظم الناس يستسلمون قبل النجاح بخطوة واحدة فقط" - نابليون هيل

توماس إديسون نجح في المحاولة 1001، وليس في المحاولة الأولى.
الفارق الوحيد؟ لم يتوقف.

🚀 التحدي: أنهِ مهمة واحدة كاملة قبل نهاية اليوم، مهما كانت صغيرة
```

---

### 4. مساءً - Evening (20:00)
**الهدف:** تأمل وإنجاز
**النبرة:** إيجابي وممتن
**المحتوى:** حكم عن الامتنان، تأمل في الإنجازات، تحضير للغد

**Example:**
```
🌙 يوم آخر، درس جديد

إنجازات اليوم:
✅ 9 مهام مكتملة
👏 نجم اليوم: محمد عطية (3 مهام)
📊 معدل الإنتاجية: مرتفع

"لا تقيس يومك بالحصاد الذي جمعته، بل بالبذور التي زرعتها"
- روبرت لويس ستيفنسون

كل اجتماع حضرته، كل سطر كتبته، كل مشكلة حللتها اليوم -
كلها بذور للنجاح القادم.

💭 تأمل: ما الشيء الواحد الذي تعلمته اليوم؟ كيف ستطبقه غداً؟
```

---

## 🧠 Intelligent Features | الميزات الذكية

### 1. Team Context Analysis | تحليل حالة الفريق
يحلل النظام تلقائياً:
- عدد المهام المفتوحة لكل عضو
- المهام المكتملة اليوم
- المهام المتأخرة
- المهام عالية الأولوية
- أفضل أداء في اليوم

```javascript
{
  totalTasks: 25,
  openTasks: 12,
  completedToday: 7,
  overdueTasks: 2,
  highPriorityTasks: 4,
  membersWithTasks: 3,
  topPerformer: "محمد عطية",
  teamMood: "مشغول",      // هادئ، متوازن، مشغول، مشغول جداً
  workloadLevel: "مرتفع"  // خفيف، معتدل، مرتفع، شديد
}
```

### 2. Content Diversity | تنوع المحتوى
النظام يتجنب التكرار باستخدام:
- **4 أنواع محتوى:** اقتباسات (30%)، قصص نجاح (40%)، حكم (20%)، مختلط (10%)
- **تتبع السجل:** يحفظ آخر 50 رسالة لتجنب التكرار
- **توزيع ثقافي:** محتوى عربي (40%)، عالمي (40%)، محلي (20%)

### 3. Adaptive Tone | نبرة متكيفة
الرسائل تتكيف حسب:
- **الوقت:** صباح نشط، منتصف النهار عملي، مساء تأملي
- **حالة الفريق:** رسائل مختلفة للفرق المشغولة vs الهادئة
- **الإنجازات:** يحتفل بالإنجازات أو يحفز على المزيد

### 4. AI-Powered Generation | توليد بالذكاء الاصطناعي
- يستخدم **ChatGPT 4o** (أو Claude/Gemini)
- Prompts مخصصة لكل وقت
- Temperature = 0.8 للإبداع
- MaxTokens = 600 للرسائل المفصلة

---

## 🧪 Testing | الاختبار

### 1. Test Single Message Generation
اختبار توليد رسالة لوقت معين (بدون إرسال):

```bash
# Morning message
curl http://localhost:5014/test/motivation/morning

# Midday message
curl http://localhost:5014/test/motivation/midday

# Afternoon message
curl http://localhost:5014/test/motivation/afternoon

# Evening message
curl http://localhost:5014/test/motivation/evening
```

**Response:**
```json
{
  "success": true,
  "timeSlot": "morning",
  "message": "🌅 صباح الإنجاز\n\n...",
  "length": 387,
  "aiProvider": "openai"
}
```

---

### 2. Send Test Message to WhatsApp
إرسال رسالة تجريبية للمجموعة:

```bash
# Send morning motivation
curl -X POST http://localhost:5014/test/send-motivation/morning

# Send afternoon motivation
curl -X POST http://localhost:5014/test/send-motivation/afternoon
```

**Response:**
```json
{
  "success": true,
  "timeSlot": "morning",
  "message": "Motivational message sent to WhatsApp group!"
}
```

---

### 3. Check Team Context
عرض التحليل الحالي لحالة الفريق:

```bash
curl http://localhost:5014/test/motivation-context
```

**Response:**
```json
{
  "success": true,
  "context": {
    "totalTasks": 25,
    "openTasks": 12,
    "completedToday": 7,
    "overdueTasks": 2,
    "highPriorityTasks": 4,
    "topPerformer": "محمد عطية",
    "teamMood": "مشغول",
    "workloadLevel": "مرتفع"
  },
  "timestamp": "2025-01-10T15:30:00.000Z"
}
```

---

### 4. View Message History
عرض سجل الرسائل المرسلة:

```bash
curl http://localhost:5014/test/motivation-history
```

**Response:**
```json
{
  "success": true,
  "totalMessages": 12,
  "history": [
    {
      "timeSlot": "morning",
      "type": "قصة نجاح",
      "timestamp": "10/1/2025, 8:00:00 ص",
      "preview": "🌅 صباح الإنجاز\n\nعندما بدأت سارا..."
    }
  ]
}
```

---

### 5. Clear History (for testing)
مسح السجل للاختبار:

```bash
curl -X DELETE http://localhost:5014/test/motivation-history
```

---

## 📊 Content Variety Examples | أمثلة على التنوع

### Quotes (اقتباسات)
```
🌅 بداية قوية

"أنت لا تبني مشروعاً ناجحاً بالأفكار الكبيرة فقط، بل بالبدايات الصغيرة المستمرة"
- سارة بلاكلي، مؤسسة Spanx

💡 خطوة اليوم: ابدأ بأصعب مهمة في قائمتك خلال أول ساعة
```

### Success Stories (قصص نجاح)
```
⚡ لا تستسلم أبداً

في عام 2007، رفضت 300 شركة استثمار فكرة Airbnb.
قال الجميع "من سيستأجر سريراً في بيت غريب؟"

لكن المؤسسين واصلوا. باعوا علب حبوب بـ 30,000 دولار لتمويل الشركة.
اليوم، Airbnb تساوي 75 مليار دولار.

✅ الآن: لا تدع الرفض يوقفك. راجع مهمتك الصعبة مرة أخرى
```

### Proverbs (حكم وأمثال)
```
🎯 الإتقان طريق النجاح

"من جدّ وجد، ومن زرع حصد" - مثل عربي

في اليابان، يقضي صانع السوشي 10 سنوات في تعلم طبخ الأرز فقط
قبل أن ينتقل لإعداد السمك. الإتقان يحتاج صبراً.

🚀 التحدي: اختر مهمة واحدة وأتقنها اليوم بدلاً من التنقل بين عشر مهام
```

---

## 🔧 Configuration | الإعدادات

### Enable/Disable System
في `.env`:
```env
# Enable daily reports (required for motivation system)
ENABLE_DAILY_REPORTS=true

# Enable AI notifications
ENABLE_AI_NOTIFICATIONS=true

# AI Provider (for generating messages)
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

### Customize Schedule
في `src/services/scheduler/schedulerService.js`:
```javascript
// Change times here (cron format)
this.scheduleJob(
  '0 8 * * *',   // 08:00 - Morning
  'Morning Motivation',
  () => motivationService.sendMotivationalMessage('morning')
);
```

### Adjust Content Weights
في `src/services/motivation/motivationService.js`:
```javascript
const weights = {
  [this.contentTypes.STORY]: 40,    // 40% قصص نجاح
  [this.contentTypes.QUOTE]: 30,    // 30% اقتباسات
  [this.contentTypes.PROVERB]: 20,  // 20% حكم وأمثال
  [this.contentTypes.MIXED]: 10     // 10% محتوى مختلط
};
```

---

## 📈 Analytics | التحليلات

### Track Engagement
النظام يحفظ:
- عدد الرسائل المرسلة
- نوع المحتوى لكل رسالة
- الوقت والتاريخ
- معاينة المحتوى

### Future Enhancements
يمكن إضافة:
- تتبع ردود الأفعال على الرسائل
- تحليل أي أنواع المحتوى الأكثر تفاعلاً
- A/B testing لأنواع مختلفة
- تخصيص لكل عضو في الفريق

---

## 🎯 Best Practices | أفضل الممارسات

### 1. Keep AI API Keys Secure
```bash
# Never commit .env
echo ".env" >> .gitignore
```

### 2. Monitor Costs
ChatGPT API has costs:
- GPT-4o: راجع أحدث تسعير من OpenAI (أغلى من الإصدارات المصغرة)
- 4 messages/day × 30 days = 120 messages/month
- ~$0.60/month (very affordable!)

### 3. Review Messages
First week:
- Check generated messages daily
- Adjust prompts if needed
- Fine-tune for your team culture

### 4. Gather Feedback
Ask team:
- Are messages helpful?
- Too frequent or too rare?
- Prefer certain types?

---

## 🚀 Quick Start

### 1. Enable the System
```bash
# في .env
ENABLE_DAILY_REPORTS=true
ENABLE_AI_NOTIFICATIONS=true
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-your-key-here
```

### 2. Restart Application
```bash
npm start
```

### 3. Test Immediately
```bash
# Generate and send morning message
curl -X POST http://localhost:5014/test/send-motivation/morning
```

### 4. Check WhatsApp
رسالة تحفيزية يجب أن تصل للمجموعة! 🎉

---

## 📞 Troubleshooting | حل المشاكل

### Problem: No Messages Sent
**Check:**
1. `ENABLE_DAILY_REPORTS=true` في `.env`
2. AI API key صحيح
3. WhatsApp متصل
4. Logs: `tail -f logs/app-*.log`

### Problem: Messages Too Generic
**Solution:**
- تأكد من أن ClickUp API يعمل
- النظام يحتاج بيانات المهام لتخصيص الرسائل
- راجع `motivation-context` endpoint

### Problem: Same Content Repeating
**Solution:**
```bash
# Clear history and retry
curl -X DELETE http://localhost:5014/test/motivation-history
```

---

## 📚 Related Files

- `src/services/motivation/motivationService.js` - Main service
- `src/services/scheduler/schedulerService.js` - Scheduling logic
- `src/routes/test.js` - Test endpoints
- `.env` - Configuration

---

**Enjoy intelligent, personalized team motivation! 🌟**
**استمتع بالتحفيز الذكي والمخصص للفريق! 🌟**
