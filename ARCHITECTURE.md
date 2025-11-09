# 🏗️ البنية المعمارية - System Architecture

## 📋 نظرة عامة

المشروع مبني على **Modular Layered Architecture** مع **Event-Driven Pattern** لضمان:
- فصل المسؤوليات (Separation of Concerns)
- قابلية التوسع (Scalability)
- سهولة الصيانة (Maintainability)
- قابلية الاختبار (Testability)

---

## 🎯 المبادئ المعمارية

### 1. Layered Architecture

```
┌─────────────────────────────────────┐
│         Presentation Layer          │  ← Routes & Controllers
├─────────────────────────────────────┤
│          Business Layer             │  ← Services & Logic
├─────────────────────────────────────┤
│          Data Access Layer          │  ← Repositories
├─────────────────────────────────────┤
│          Core/Infrastructure        │  ← Logger, EventBus, Config
└─────────────────────────────────────┘
```

### 2. Event-Driven Communication

```
Component A ─┐
             ├─→ Event Bus ─→ Event Listeners
Component B ─┘
```

### 3. Dependency Injection

جميع الـ services تُصدّر كـ **singletons** جاهزة للاستخدام:

```javascript
import aiService from './services/ai/index.js';
import whatsappService from './services/whatsapp/whatsappService.js';
```

---

## 📂 تفصيل الطبقات

### 1. Configuration Layer (`src/config/`)

**المسؤولية:** إدارة جميع الإعدادات والثوابت

**الملفات:**
- `env.js` - تحميل والتحقق من متغيرات البيئة
- `constants.js` - الثوابت (Achievements, Badges, etc.)
- `team.js` - بيانات الفريق

**الاستخدام:**
```javascript
import { env } from './config/env.js';
import { ACHIEVEMENT_MILESTONES } from './config/constants.js';
import { TEAM, findMemberById } from './config/team.js';
```

**مميزات:**
- ✅ Centralized configuration
- ✅ Environment validation على التشغيل
- ✅ Type-safe constants

---

### 2. Core Layer (`src/core/`)

**المسؤولية:** الأنظمة الأساسية المشتركة

#### Logger (`logger.js`)

نظام logging متقدم مع:
- مستويات متعددة (error, warn, info, debug)
- ألوان في Console
- كتابة تلقائية للملفات
- Timestamps

```javascript
import logger from './core/logger.js';

logger.info('Application started');
logger.error('Failed to connect', { error: err.message });
logger.success('Task completed');
logger.debug('Debug info', { data });
```

#### Event Bus (`eventBus.js`)

نظام أحداث مركزي:

```javascript
import eventBus, { EVENTS } from './core/eventBus.js';

// Emit event
eventBus.emitEvent(EVENTS.TASK_COMPLETED, taskData);

// Listen to event
eventBus.onEvent(EVENTS.TASK_COMPLETED, async (data) => {
  // Handle event
});
```

**فوائد:**
- فصل المكونات (Decoupling)
- سهولة إضافة features جديدة
- معالجة أخطاء مركزية

#### Error Handling (`errors.js`)

أنواع أخطاء مخصصة:

```javascript
import { ClickUpError, AIError, ValidationError } from './core/errors.js';

throw new ClickUpError('Failed to fetch task', { taskId });
throw new AIError('AI generation failed', 'openai', { error });
throw new ValidationError('Invalid input', { field: 'email' });
```

---

### 3. Services Layer (`src/services/`)

**المسؤولية:** منطق العمل (Business Logic)

#### AI Services (`services/ai/`)

**Factory Pattern** للتبديل بين مزودي AI:

```
┌──────────────────────────┐
│      AI Service          │
│      (Factory)           │
├──────────────────────────┤
│  - generateCompletion()  │
│  - chat()                │
│  - switchProvider()      │
└────────┬─────────────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼───┐
│Claude │ │OpenAI│ │Gemini│ │ New? │
└───────┘ └──────┘ └──────┘ └──────┘
```

**استخدام:**
```javascript
import aiService from './services/ai/index.js';

// يعمل مع أي مزود حسب .env
const response = await aiService.generateCompletion(
  systemPrompt,
  userMessage
);

// التبديل runtime
aiService.switchProvider('claude');
```

**إضافة مزود جديد:**
1. أنشئ `newProvider.js`
2. Implement `AIProviderInterface`
3. أضف في `index.js`

#### ClickUp Services (`services/clickup/`)

تفاعل كامل مع ClickUp API:

```javascript
import clickupService from './services/clickup/clickupService.js';

const task = await clickupService.getTask(taskId);
const tasks = await clickupService.getTasksForMember(userId);
const created = await clickupService.createTask(listId, taskData);
```

**مميزات:**
- Auto-retry على الأخطاء
- Pagination handling
- Error wrapping

#### WhatsApp Services (`services/whatsapp/`)

إدارة WhatsApp Web:

```javascript
import whatsappService from './services/whatsapp/whatsappService.js';

await whatsappService.initialize();
await whatsappService.sendMessage(chatId, message);
await whatsappService.sendToGroup(message);
```

**مميزات:**
- QR Code handling
- Auto-reconnect
- Group chat management
- Event integration

#### Notification Services (`services/notification/`)

نظام إشعارات متقدم:

```
┌────────────────┐
│ Notification   │
│   Generator    │
└────┬───────────┘
     │
     ▼
┌────────────────┐
│  Queue Manager │  ← Batching & Throttling
└────┬───────────┘
     │
     ▼
┌────────────────┐
│   WhatsApp     │
│   Sender       │
└────────────────┘
```

**خصائص:**
- Batching (تجميع الإشعارات)
- Pause/Resume
- Smart grouping
- AI-powered messages

---

### 4. Repository Layer (`src/repositories/`)

**المسؤولية:** إدارة البيانات (JSON Files)

**Base Repository Pattern:**
```
┌──────────────────────────┐
│   BaseRepository         │
│   (Abstract)             │
├──────────────────────────┤
│  - read()                │
│  - write()               │
│  - update()              │
│  - caching               │
└────────┬─────────────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼────┐
│Produc-│ │Achiev│ │Chall-│ │ Badge │
│tivity │ │ement │ │enge  │ │       │
└───────┘ └──────┘ └──────┘ └───────┘
```

**استخدام:**
```javascript
import productivityRepo from './repositories/productivityRepository.js';

await productivityRepo.addEntry(data);
const stats = await productivityRepo.getUserStats(userId);
```

**مميزات:**
- Built-in caching
- Safe JSON parsing
- Auto-create files
- Transaction-like updates

---

### 5. Controllers Layer (`src/controllers/`)

**المسؤولية:** معالجة الطلبات HTTP

```javascript
// webhookController.js
export async function handleTaskCreated(req, res) {
  try {
    const body = parseWebhook(req.body);

    // Emit event instead of direct handling
    eventBus.emitEvent(EVENTS.TASK_CREATED, body);

    res.status(200).send('ok');
  } catch (error) {
    logger.error('Webhook failed', { error });
    res.status(500).json({ error: error.message });
  }
}
```

**مميزات:**
- Thin controllers
- Event emission
- Error handling
- Validation

---

### 6. Routes Layer (`src/routes/`)

**المسؤولية:** تعريف endpoints

```javascript
// webhooks.js
import express from 'express';
import * as controller from '../controllers/webhookController.js';

const router = express.Router();

router.post('/task-created', controller.handleTaskCreated);
router.post('/task-updated', controller.handleTaskUpdated);

export default router;
```

**في index.js:**
```javascript
import webhookRoutes from './routes/webhooks.js';
app.use('/webhooks', webhookRoutes);
```

---

### 7. Utilities Layer (`src/utils/`)

**المسؤولية:** دوال مساعدة قابلة لإعادة الاستخدام

**Modules:**
- `helpers.js` - دوال عامة (sleep, chunk, etc.)
- `formatters.js` - تنسيق الرسائل
- `validators.js` - التحقق من البيانات
- `urlShortener.js` - اختصار الروابط

---

## 🔄 Data Flow

### مثال: Task Completion

```
1. ClickUp Webhook
         │
         ▼
2. Webhook Controller
         │
         ▼
3. Event Bus (TASK_COMPLETED)
         │
    ┌────┴────┬────────────┬────────────┐
    ▼         ▼            ▼            ▼
4. Services Listen:
   • Notification    • Achievement  • Productivity  • Reports
   • Service         • Service      • Service       • Service
         │               │              │              │
         ▼               ▼              ▼              ▼
5. Data Storage:
   • Queue           • Update       • Add Entry    • Update Stats
   • Manager         • User Data    • to Repo      •
         │               │              │              │
         ▼               ▼              ▼              ▼
6. Final Actions:
   • Send WhatsApp   • Send Badge   • Calculate    • Generate
   • Notification    • Notification • Stats        • Report
```

---

## 🎨 Design Patterns المستخدمة

### 1. Singleton Pattern
جميع الـ services:
```javascript
class ClickUpService { }
export default new ClickUpService(); // Singleton
```

### 2. Factory Pattern
AI Service:
```javascript
class AIService {
  initializeProvider() {
    switch(this.providerName) {
      case 'claude': return new ClaudeProvider();
      case 'openai': return new OpenAIProvider();
      // ...
    }
  }
}
```

### 3. Repository Pattern
Data access:
```javascript
class ProductivityRepository extends BaseRepository {
  async getUserStats(userId) { }
}
```

### 4. Observer Pattern
Event Bus:
```javascript
eventBus.emitEvent(event, data);
eventBus.onEvent(event, handler);
```

### 5. Strategy Pattern
AI Providers (different implementations, same interface):
```javascript
class AIProviderInterface {
  async generateCompletion() { }
}

class ClaudeProvider extends AIProviderInterface { }
class OpenAIProvider extends AIProviderInterface { }
```

---

## 🔐 Security Layers

### 1. Environment Variables
```javascript
// جميع المفاتيح في .env
// لا توجد مفاتيح في الكود
```

### 2. Input Validation
```javascript
import { validateTask } from './utils/validators.js';
validateTask(taskData); // throws ValidationError
```

### 3. Error Sanitization
```javascript
// لا نعيد stack traces للـ production
const message = env.NODE_ENV === 'development'
  ? error.stack
  : 'Internal Server Error';
```

### 4. Retry Logic
```javascript
// Auto-retry مع exponential backoff
await retry(asyncOperation, maxRetries, delay);
```

---

## 📈 Scalability Considerations

### Current
- JSON file storage
- Single process
- In-memory queue

### Future Improvements
1. **Database Migration:**
   - Repository pattern يسهل الانتقال
   - تغيير implementation فقط

2. **Message Queue:**
   - استبدال Event Bus بـ RabbitMQ/Redis
   - نفس الـ interface

3. **Microservices:**
   - كل service يمكن أن يصبح microservice
   - Event Bus يصبح Message Broker

4. **Horizontal Scaling:**
   - Stateless services
   - Shared data store
   - Load balancer

---

## 🧪 Testing Strategy

### Unit Tests
```javascript
// Test individual services
test('AI Service generates completion', async () => {
  const result = await aiService.generateCompletion(sys, user);
  expect(result).toBeDefined();
});
```

### Integration Tests
```javascript
// Test service interactions
test('Task completion triggers notifications', async () => {
  eventBus.emitEvent(EVENTS.TASK_COMPLETED, task);
  // Assert notification was queued
});
```

### E2E Tests
```javascript
// Test full workflows
test('Webhook creates task and sends notification', async () => {
  await request(app).post('/webhooks/task-created').send(data);
  // Assert task created and notification sent
});
```

---

## 📊 Monitoring & Observability

### Logging
```javascript
// Structured logging
logger.info('Operation completed', {
  userId,
  duration: Date.now() - start,
  result: 'success'
});
```

### Metrics
```javascript
// في المستقبل
metrics.increment('tasks.completed');
metrics.gauge('queue.size', queue.length);
```

### Tracing
```javascript
// في المستقبل
tracer.startSpan('task.process');
```

---

## 🚀 Performance Optimizations

### 1. Caching
```javascript
// في BaseRepository
if (useCache && this.cache) {
  return this.cache; // Fast path
}
```

### 2. Batching
```javascript
// Notification queue batching
setTimeout(processBatch, BATCH_DELAY);
```

### 3. Async/Await
```javascript
// كل العمليات async
const [task, comments, stats] = await Promise.all([
  getTask(),
  getComments(),
  getStats()
]);
```

### 4. Connection Pooling
```javascript
// Axios instances بـ defaults
this.api = axios.create({
  baseURL: this.baseUrl,
  timeout: 30000
});
```

---

## 📝 Code Quality

### ESLint Rules
- ES Modules only
- Async/await preferred
- No console.log (use logger)
- Proper error handling

### Code Style
- CamelCase for variables
- PascalCase for classes
- Descriptive names
- JSDoc comments

### Best Practices
- Single Responsibility Principle
- Don't Repeat Yourself (DRY)
- Keep It Simple, Stupid (KISS)
- You Aren't Gonna Need It (YAGNI)

---

## 🎓 Learning Resources

للفهم الأعمق:
- **Clean Architecture** - Robert C. Martin
- **Domain-Driven Design** - Eric Evans
- **Node.js Design Patterns** - Mario Casciaro
- **Express.js Guide** - Official Docs

---

هذه البنية تضمن:
✅ **قابلية الصيانة** - كود واضح ومنظم
✅ **قابلية التوسع** - سهولة إضافة features
✅ **قابلية الاختبار** - فصل المسؤوليات
✅ **الأداء** - caching & batching
✅ **الأمان** - validation & error handling

---

**Built with ❤️ using Modern Node.js Architecture**
