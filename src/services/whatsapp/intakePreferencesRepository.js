import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PREF_FILE = path.join(DATA_DIR, 'whatsapp-intake-preferences.json');

async function ensureDataFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // no-op
  }

  try {
    await fs.access(PREF_FILE);
  } catch (err) {
    await fs.writeFile(PREF_FILE, JSON.stringify({}), 'utf8');
  }
}

async function loadPreferences() {
  await ensureDataFile();
  const raw = await fs.readFile(PREF_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

async function savePreferences(data) {
  await fs.writeFile(PREF_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function recordListChoice(memberId, listKey) {
  if (!memberId || !listKey) {
    return;
  }

  const data = await loadPreferences();
  const memberKey = memberId.toString();
  data[memberKey] = data[memberKey] || {};

  const existing = data[memberKey][listKey] || { count: 0, lastUsed: 0 };
  const updated = {
    count: existing.count + 1,
    lastUsed: Date.now()
  };

  data[memberKey][listKey] = updated;
  await savePreferences(data);
}

export async function getMemberPreferences(memberId) {
  if (!memberId) {
    return [];
  }

  const data = await loadPreferences();
  const memberKey = memberId.toString();
  const memberPrefs = data[memberKey] || {};

  return Object.entries(memberPrefs)
    .map(([listKey, stats]) => ({
      listKey,
      count: Number(stats?.count || 0),
      lastUsed: Number(stats?.lastUsed || 0)
    }))
    .filter(pref => pref.count > 0)
    .sort((a, b) => {
      if (b.count === a.count) {
        return b.lastUsed - a.lastUsed;
      }
      return b.count - a.count;
    });
}

export default {
  recordListChoice,
  getMemberPreferences
};
