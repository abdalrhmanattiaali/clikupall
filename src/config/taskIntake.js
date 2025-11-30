import { env } from './env.js';

const DEFAULT_TASK_LISTS = [
  {
    key: 'whatsapp_inbox',
    name: 'مهمات من الوتس',
    listId: '901515132265',
    description: 'Requests captured directly from the WhatsApp personal intake.',
    isDefault: true
  },
  {
    key: 'daily_general',
    name: 'مهمات عامه',
    listId: '901507943536',
    description: 'General day-to-day operational tasks that do not fit a specific stream.'
  },
  {
    key: 'daily_procurement',
    name: 'مهمات مشتريات',
    listId: '901507943581',
    description: 'Purchasing and sourcing goods or services required for operations.'
  },
  {
    key: 'daily_sources_research',
    name: 'مهمات بحث عن مصادر',
    listId: '901507943588',
    description: 'Researching suppliers and gathering product or material information.'
  },
  {
    key: 'daily_transport',
    name: 'مهمات نقل',
    listId: '901507943595',
    description: 'Transportation, logistics moves, and physical transfers.'
  },
  {
    key: 'daily_maintenance',
    name: 'مهمات صيانه',
    listId: '901508005661',
    description: 'Maintenance, repairs, and technical upkeep work.'
  },
  {
    key: 'orders_preparation',
    name: 'مهمات تحضير و تجهيز اوردرات',
    listId: '901507943558',
    description: 'Preparing and staging customer orders for delivery.'
  },
  {
    key: 'orders_delivery',
    name: 'توصيل اوردات',
    listId: '901507943569',
    description: 'Delivering customer orders and coordinating drivers or couriers.'
  },
  {
    key: 'orders_invoicing',
    name: 'انشاء الفواتير',
    listId: '901507943572',
    description: 'Creating, reviewing, and sending invoices related to orders.'
  },
  {
    key: 'orders_operational_preps',
    name: 'تحضيرات تشغيليه',
    listId: '901507977735',
    description: 'Operational readiness, staging, and internal prep for order execution.'
  },
  {
    key: 'orders_samples',
    name: 'تجهيز عينات',
    listId: '901515500888',
    description: 'Preparing, packaging, or shipping customer samples.'
  },
  {
    key: 'orders_shortages',
    name: 'نواقص',
    listId: '901516207227',
    description: 'Tracking shortages, backorders, and urgent replenishment actions.'
  },
  {
    key: 'clients_quotes',
    name: 'عروض اسعار',
    listId: '901507943578',
    description: 'Client quotations, proposals, and pricing follow ups.'
  },
  {
    key: 'clients_order_approvals',
    name: 'اعتماد طلبات',
    listId: '901507943636',
    description: 'Client request approvals and confirmation workflows.'
  },
  {
    key: 'clients_sample_approvals',
    name: 'إعتماد عينات',
    listId: '901508455234',
    description: 'Sample approvals, testing feedback, and confirmation tasks.'
  },
  {
    key: 'clients_followups',
    name: 'متابعة طلبات عامه للعملاء',
    listId: '901508614951',
    description: 'General customer follow ups and service updates.'
  },
  {
    key: 'finance_transfers',
    name: 'مهمات تحويل اموال',
    listId: '901507943616',
    description: 'Money transfers, bank instructions, and related approvals.'
  },
  {
    key: 'finance_receipts_review',
    name: 'مهمات مراجعة استقبال اموال',
    listId: '901507943620',
    description: 'Reviewing incoming payments and reconciling receipts.'
  },
  {
    key: 'finance_purchase_entry',
    name: 'مهمات ادخال مشتريات',
    listId: '901507943621',
    description: 'Entering purchase data, bills, and cost adjustments.'
  },
  {
    key: 'finance_tax_returns',
    name: 'مهمات اقرارت ضربية - شهرية',
    listId: '901507943630',
    description: 'Monthly tax filings, declarations, and supporting documents.'
  },
  {
    key: 'finance_check_collection',
    name: 'مهمات تحصيل شيكات',
    listId: '901507943744',
    description: 'Collecting checks and coordinating with clients or banks.'
  },
  {
    key: 'finance_check_deposit',
    name: 'مهمات ايداع شيكات',
    listId: '901507943746',
    description: 'Depositing checks and confirming bank receipts.'
  },
  {
    key: 'finance_customer_balance_audit',
    name: 'مهمات مراجعة ارصدة عملاء',
    listId: '901507951744',
    description: 'Reviewing customer balances and resolving discrepancies.'
  },
  {
    key: 'finance_receivables_followup',
    name: 'متابعة مستحقات',
    listId: '901514870885',
    description: 'Tracking outstanding receivables and collection plans.'
  },
  {
    key: 'finance_makasat_entry',
    name: 'ادخال مقصات',
    listId: '901514958365',
    description: 'Entering makasat / settlement adjustments into the ledger.'
  },
  {
    key: 'finance_discount_notices',
    name: 'اشعارات خصم',
    listId: '901515507384',
    description: 'Preparing and sharing discount or debit notices.'
  },
  {
    key: 'opportunities_shera_pharma',
    name: 'شركة شيرا فارما',
    listId: '901507943719',
    description: 'Business development work related to Shera Pharma.'
  },
  {
    key: 'opportunities_luna',
    name: 'شركة لونا',
    listId: '901507943722',
    description: 'New opportunities, follow ups, and briefs for LUNA.',
  },
  {
    key: 'opportunities_integrated_cosmetics',
    name: 'شركة المتكاملة لمستحضرات التجميل',
    listId: '901507943731',
    description: 'Prospecting and coordination for Integrated Cosmetics Co.'
  },
  {
    key: 'opportunities_hagar_alex',
    name: 'هاجر - اسكندرية',
    listId: '901507943740',
    description: 'Sales pipeline entries tied to Hagar (Alexandria).'
  },
  {
    key: 'opportunities_brand_company',
    name: 'شركة براند',
    listId: '901507951607',
    description: 'Opportunity tracking for Brand Company.'
  },
  {
    key: 'opportunities_new_files',
    name: 'ملفات جديده للتوافر',
    listId: '901508758949',
    description: 'Preparing and validating availability files for prospects.'
  },
  {
    key: 'opportunities_masr_pyramids',
    name: 'شركة مصر بيرامدز',
    listId: '901508758976',
    description: 'Sales and partnership actions for Masr Pyramids.'
  },
  {
    key: 'opportunities_milano_pharma',
    name: 'شركية ميلانو فارما',
    listId: '901509517193',
    description: 'Follow ups and deliverables for Milano Pharma.'
  },
  {
    key: 'opportunities_matcha_oil',
    name: 'عينه زيت ماتشا ecc',
    listId: '901515731720',
    description: 'Sample coordination and next steps for Matcha Oil ECC.'
  },
  {
    key: 'erp_updates',
    name: 'تحديثات النظام',
    listId: '901507945750',
    description: 'ERPNext updates, automation tweaks, and configuration work.'
  },
  {
    key: 'erp_inventory',
    name: 'مهمات إدخال مخزون و سحب مخزون',
    listId: '901507985370',
    description: 'Inventory entry, withdrawal, and ERP synchronization tasks.'
  },
  {
    key: 'fayoum_land',
    name: 'List (مهمات أرض الفيوم)',
    listId: '901507945762',
    description: 'Projects tied to the Fayoum land initiative.'
  },
  {
    key: 'q_biolab',
    name: 'List (Q BioLab LLC)',
    listId: '901507988624',
    description: 'Tasks for the Q BioLab LLC program or partnership.'
  }
];

function parseListConfig() {
  const raw = process.env.WHATSAPP_TASK_LISTS;
  const lists = [];

  if (raw) {
    const entries = raw.split(';').map(entry => entry.trim()).filter(Boolean);
    for (const entry of entries) {
      const [key, name, listId, description, flag] = entry
        .split('|')
        .map(part => part?.trim())
        .concat(Array(5).fill(''))
        .slice(0, 5);

      if (!key || !listId) {
        continue;
      }

      lists.push({
        key,
        name: name || key,
        listId,
        description: description || 'General intake bucket',
        isDefault: (flag || '').toLowerCase() === 'default'
      });
    }
  }

  if (lists.length === 0) {
    const defaults = DEFAULT_TASK_LISTS.map(list => ({ ...list }));

    if (defaults.length === 0 && env.clickup.sampleListId) {
      defaults.push({
        key: 'general',
        name: 'General Intake',
        listId: env.clickup.sampleListId,
        description: 'Fallback ClickUp list used when no mapping is provided.',
        isDefault: true
      });
    }

    if (!defaults.some(list => list.isDefault) && defaults.length > 0) {
      defaults[0].isDefault = true;
    }

    return defaults;
  }

  if (!lists.some(list => list.isDefault)) {
    lists[0].isDefault = true;
  }

  return lists;
}

export const TASK_INTAKE_LISTS = parseListConfig();

export function getDefaultIntakeList() {
  return TASK_INTAKE_LISTS.find(list => list.isDefault) || TASK_INTAKE_LISTS[0];
}

export function findIntakeListByKey(key) {
  if (!key) {
    return null;
  }

  const normalized = key.trim().toLowerCase();
  return TASK_INTAKE_LISTS.find(list => list.key.toLowerCase() === normalized) || null;
}

export function describeIntakeListsForPrompt() {
  return TASK_INTAKE_LISTS
    .map(list => `- ${list.name} (key: ${list.key}) → ${list.description}`)
    .join('\n');
}
