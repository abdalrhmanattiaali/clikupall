# WhatsApp Task Intake Guide

هذه الصفحة تشرح كيفية تحويل أي رسالة واتساب شخصية إلى مهمة منظمة داخل ClickUp بدون المرور على الواجهات التقليدية.

## 1. إعداد القوائم المستهدفة

حدد القوائم التي تريد استقبال المهام عليها عبر متغير البيئة `WHATSAPP_TASK_LISTS`:

```
WHATSAPP_TASK_LISTS=key|name|listId|description|default;key|name|listId|description
```

- **key**: اسم مختصر تستخدمه الـ AI لاختيار القائمة.
- **name**: الاسم الظاهر للقائمة داخل الرسالة التأكيدية.
- **listId**: معرّف ClickUp List (يمكن نسخه من عنوان المتصفح داخل ClickUp).
- **description**: وصف مختصر يساعد الـ AI على معرفة نوع الطلبات.
- **default**: أضف الكلمة `default` لإجبار هذه القائمة أن تكون الخيار الاحتياطي.

مثال:

```
WHATSAPP_TASK_LISTS=sales_quotes|Sales / Quotes|901515500888|Client pricing & quotations|default;operations|Operations Desk|901515500777|Follow ups & logistics
```

> إذا تُرك المتغير فارغاً سيبحث النظام أولاً عن `CLICKUP_SAMPLE_LIST_ID`، وإن لم يكن متاحاً فسيستخدم كتالوجاً كاملاً من قوائم ClickUp الحقيقية الموضحة أدناه.

### القوائم المجهزة افتراضياً

| المفتاح | اسم القائمة | الوصف | ClickUp List ID |
|---------|-------------|--------|-----------------|
| `whatsapp_inbox` | مهمات من الوتس | Requests captured directly from WhatsApp personal intake. | 901515132265 |
| `daily_general` | مهمات عامه | General day-to-day operational tasks. | 901507943536 |
| `daily_procurement` | مهمات مشتريات | Purchasing and sourcing goods or services. | 901507943581 |
| `daily_sources_research` | مهمات بحث عن مصادر | Researching suppliers and sourcing info. | 901507943588 |
| `daily_transport` | مهمات نقل | Transportation and logistics moves. | 901507943595 |
| `daily_maintenance` | مهمات صيانه | Maintenance, repairs, and technical upkeep. | 901508005661 |
| `orders_preparation` | مهمات تحضير و تجهيز اوردرات | Preparing and staging customer orders. | 901507943558 |
| `orders_delivery` | توصيل اوردات | Delivering customer orders. | 901507943569 |
| `orders_invoicing` | انشاء الفواتير | Creating and sending invoices. | 901507943572 |
| `orders_operational_preps` | تحضيرات تشغيليه | Operational readiness for orders. | 901507977735 |
| `orders_samples` | تجهيز عينات | Preparing and shipping samples. | 901515500888 |
| `orders_shortages` | نواقص | Tracking shortages and urgent replenishment. | 901516207227 |
| `clients_quotes` | عروض اسعار | Client quotations and proposals. | 901507943578 |
| `clients_order_approvals` | اعتماد طلبات | Client request approvals. | 901507943636 |
| `clients_sample_approvals` | إعتماد عينات | Sample approvals and reviews. | 901508455234 |
| `clients_followups` | متابعة طلبات عامه للعملاء | General customer follow ups. | 901508614951 |
| `finance_transfers` | مهمات تحويل اموال | Money transfers and related approvals. | 901507943616 |
| `finance_receipts_review` | مهمات مراجعة استقبال اموال | Reviewing incoming payments. | 901507943620 |
| `finance_purchase_entry` | مهمات ادخال مشتريات | Entering purchase data and bills. | 901507943621 |
| `finance_tax_returns` | مهمات اقرارت ضربية - شهرية | Monthly tax filings and declarations. | 901507943630 |
| `finance_check_collection` | مهمات تحصيل شيكات | Collecting checks. | 901507943744 |
| `finance_check_deposit` | مهمات ايداع شيكات | Depositing checks and confirming receipts. | 901507943746 |
| `finance_customer_balance_audit` | مهمات مراجعة ارصدة عملاء | Auditing customer balances. | 901507951744 |
| `finance_receivables_followup` | متابعة مستحقات | Tracking outstanding receivables. | 901514870885 |
| `finance_makasat_entry` | ادخال مقصات | Entering makasat / settlement adjustments. | 901514958365 |
| `finance_discount_notices` | اشعارات خصم | Preparing discount or debit notices. | 901515507384 |
| `opportunities_shera_pharma` | شركة شيرا فارما | Biz dev work for Shera Pharma. | 901507943719 |
| `opportunities_luna` | شركة لونا | Opportunities and briefs for LUNA. | 901507943722 |
| `opportunities_integrated_cosmetics` | شركة المتكاملة لمستحضرات التجميل | Prospecting for Integrated Cosmetics Co. | 901507943731 |
| `opportunities_hagar_alex` | هاجر - اسكندرية | Sales pipeline for Hagar (Alexandria). | 901507943740 |
| `opportunities_brand_company` | شركة براند | Opportunity tracking for Brand Company. | 901507951607 |
| `opportunities_new_files` | ملفات جديده للتوافر | Preparing availability files for prospects. | 901508758949 |
| `opportunities_masr_pyramids` | شركة مصر بيرامدز | Sales actions for Masr Pyramids. | 901508758976 |
| `opportunities_milano_pharma` | شركية ميلانو فارما | Follow ups for Milano Pharma. | 901509517193 |
| `opportunities_matcha_oil` | عينه زيت ماتشا ecc | Sample coordination for Matcha Oil ECC. | 901515731720 |
| `erp_updates` | تحديثات النظام | ERPNext updates and automation tweaks. | 901507945750 |
| `erp_inventory` | مهمات إدخال مخزون و سحب مخزون | Inventory entry/withdrawal tasks. | 901507985370 |
| `fayoum_land` | مهمات أرض الفيوم | Projects tied to Fayoum land. | 901507945762 |
| `q_biolab` | Q BioLab LLC | Tasks for Q BioLab program. | 901507988624 |

> يمكن تخصيص الوصف أو مفتاح كل قائمة عبر `WHATSAPP_TASK_LISTS`. ما لم تُحدِّد شيئاً سيستخدم النظام الجدول أعلاه تلقائياً.

## 2. تدفق المحادثة

1. **أرسل الطلب** – مثال: `عمل عرض سعر لونا العاجل غداً`.
2. البوت يرسل تأكيد الاستلام ثم يجهز قالباً إنجليزياً مع قائمة مقترحة.
3. **يُسأل عن المرفقات** – رد بـ "نعم" وأرسل الملفات، أو "لا" للمتابعة.
4. **استعرض الملخص النهائي** – يظهر العنوان، القائمة، الأولوية، التلميحات.
5. أرسل كلمة **"تم"** لإنشاء المهمة أو **"إلغاء"** للتراجع.

## 3. الأوامر السريعة

| الأمر | المعنى |
|-------|---------|
| `تم` | إنشاء المهمة أو إنهاء مرحلة إضافة المرفقات |
| `إلغاء` / `cancel` | حذف الطلب الحالي |
| `جديد` / `reset` | البدء من الصفر فوراً |
| `نعم` | الدخول في وضع استقبال المرفقات |
| `لا` | تخطي المرفقات والمتابعة للتأكيد |

## 4. المرفقات

- أثناء مرحلة "إضافة المرفقات" يمكن إرسال أي عدد من الصور أو الملفات.
- يتم تحميل الملفات مباشرة على ClickUp بعد إنشاء المهمة.
- اسم الملف يُستخدم كما هو من واتساب أو يتم توليد اسم تلقائي.

## 5. التحقق السريع

1. شغّل التطبيق وتأكد من رسالة `✅ WhatsApp client is ready` في الطرفية.
2. أرسل رسالة من رقم أحد أعضاء الفريق (المذكور في `src/config/team.js`).
3. راقب الطرفية للتأكد من ظهور `AI task blueprint generated`.
4. بعد الرد بـ "تم" تحقق من ظهور المهمة داخل القائمة الصحيحة في ClickUp.
5. لو حصل خطأ ستستلم رسالة تفسيرية على واتساب بالإضافة إلى سجل في الطرفية.

باتباع هذه الخطوات يمكنك إضافة مهام خلال ثواني مع وصف إنجليزي مرتب دون مغادرة واتساب. 📨
