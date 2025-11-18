#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';

import { fileURLToPath } from 'node:url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const results = [];
let hasFailure = false;

function record(name, passed, details) {
  results.push({ name, passed, details });
  if (!passed) {
    hasFailure = true;
  }
}

function ensure(condition, name, detailBuilder) {
  try {
    const passed = Boolean(condition);
    const details = typeof detailBuilder === 'function' ? detailBuilder() : detailBuilder;
    record(name, passed, details);
  } catch (error) {
    record(name, false, `Error: ${error.message}`);
  }
}

function formatDetails(details) {
  if (typeof details === 'string') {
    return details;
  }
  if (Array.isArray(details)) {
    return details.join('\n');
  }
  return JSON.stringify(details, null, 2);
}

function ensureEnvDefaults() {
  process.env.CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN || 'test-clickup-token';
  process.env.CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID || '123456';
  process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
}

async function run() {
  ensureEnvDefaults();

  const [
    { ALL_BADGES, BADGE_CATEGORIES },
    { SHIELD_LEVELS, getShieldBonus },
    pointsModule
  ] = await Promise.all([
    import('../src/config/badges.js'),
    import('../src/config/shields.js'),
    import('../src/services/gamification/pointsSystem.js')
  ]);

  const { BASE_POINTS, MULTIPLIERS, calculateTaskPoints } = pointsModule;

  ensure(
    ALL_BADGES.length >= 40,
    'Badge catalog contains 40+ entries',
    () => `Found ${ALL_BADGES.length} badges across all categories.`
  );

  ensure(
    Object.keys(BADGE_CATEGORIES).length === 6,
    'Six badge categories are defined',
    () => `Categories: ${Object.values(BADGE_CATEGORIES).join(', ')}`
  );

  const badgeCounts = Object.fromEntries(
    Object.entries(BADGE_CATEGORIES).map(([key, value]) => [
      value,
      ALL_BADGES.filter(badge => badge.category === value).length
    ])
  );

  ensure(
    Object.values(badgeCounts).every(count => count > 0),
    'Every badge category has at least one badge',
    () =>
      Object.entries(badgeCounts)
        .map(([category, count]) => `${category}: ${count}`)
        .join(', ')
  );

  ensure(
    SHIELD_LEVELS.length === 10,
    'Shield system exposes 10 levels',
    () => `Levels available: ${SHIELD_LEVELS.length}`
  );

  ensure(
    SHIELD_LEVELS[0]?.level === 1 && SHIELD_LEVELS.at(-1)?.level === 10,
    'Shield levels span from 1 to 10',
    () =>
      `First level: ${SHIELD_LEVELS[0]?.name || 'missing'}, Last level: ${SHIELD_LEVELS.at(-1)?.name || 'missing'}`
  );

  const crownBonus = getShieldBonus(10);
  ensure(
    Math.abs(crownBonus - 0.6) < 0.0001,
    'Imperial crown shield bonus matches 60%',
    () => `Bonus multiplier: ${(crownBonus * 100).toFixed(0)}%`
  );

  ensure(
    BASE_POINTS.TASK_NORMAL === 10 && BASE_POINTS.TASK_HIGH_PRIORITY === 20,
    'Base points table matches documentation defaults',
    () =>
      `Normal: ${BASE_POINTS.TASK_NORMAL}, High priority: ${BASE_POINTS.TASK_HIGH_PRIORITY}, Complex: ${BASE_POINTS.TASK_COMPLEX}`
  );

  ensure(
    MULTIPLIERS.WEEKEND === 1.5 && MULTIPLIERS.HIGH_PRIORITY === 2.0,
    'Core multipliers align with gamification guide',
    () =>
      `Weekend: ${MULTIPLIERS.WEEKEND}, High priority: ${MULTIPLIERS.HIGH_PRIORITY}, Overdue: ${MULTIPLIERS.OVERDUE_CLEARED}`
  );

  const sampleTask = {
    id: 'sample-task',
    name: 'Sample Task',
    priority: { id: 3, priority: 'high' },
    assignees: [{ id: 1 }],
    subtasks: [],
    due_date: null
  };

  const sampleStats = {
    shieldLevel: 5,
    currentStreak: 15,
    totalPoints: 1200
  };

  const sampleContext = {
    completionDate: new Date('2024-08-16T09:00:00Z'),
    wasOverdue: false,
    completedQuickly: true
  };

  const pointsResult = calculateTaskPoints(sampleTask, sampleStats, sampleContext);

  ensure(
    Number.isFinite(pointsResult.totalPoints) && pointsResult.totalPoints > 0,
    'Points engine calculates positive totals',
    () => `Calculated ${pointsResult.totalPoints} points for a representative task.`
  );

  let gamificationService;
  try {
    ({ default: gamificationService } = await import('../src/services/gamification/gamificationService.js'));
    record(
      'Gamification service module loads with fallback environment',
      true,
      'Module imported successfully with stubbed environment variables.'
    );
  } catch (error) {
    record(
      'Gamification service module loads with fallback environment',
      false,
      `Error: ${error.message}`
    );
  }

  if (gamificationService) {
    try {
      const stats = await gamificationService.getUserStats(TEAM_PLACEHOLDER_USER_ID);
      record(
        'Gamification service returns default stats for new users',
        Boolean(stats && typeof stats === 'object' && 'shieldLevel' in stats),
        `Sample stats: ${JSON.stringify({
          shieldLevel: stats.shieldLevel,
          totalTasks: stats.totalTasks,
          totalPoints: stats.totalPoints,
          currentStreak: stats.currentStreak
        })}`
      );
    } catch (error) {
      record(
        'Gamification service returns default stats for new users',
        false,
        `Error: ${error.message}`
      );
    }
  }

  console.log('\n📋 Gamification System Verification Summary');
  console.log('────────────────────────────────────────────');
  for (const { name, passed, details } of results) {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${name}`);
    if (details) {
      console.log(`   → ${formatDetails(details)}`);
    }
  }

  console.log('\nResults file:', path.relative(process.cwd(), path.join(__dirname, 'verifyGamification.js')));

  if (hasFailure) {
    console.log('\nOverall status: ❌ Issues detected');
    process.exitCode = 1;
  } else {
    console.log('\nOverall status: ✅ All checks passed');
  }
}

// Use a known member ID if available; fallback to 9999 for default data creation
const TEAM_PLACEHOLDER_USER_ID = 9999;

run();
