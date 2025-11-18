import { env } from './env.js';

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
    lists.push({
      key: 'general',
      name: 'General Intake',
      listId: env.clickup.sampleListId,
      description: 'Fallback ClickUp list used when no mapping is provided.',
      isDefault: true
    });
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
