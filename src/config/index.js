/**
 * Configuration Module Index
 * تجميع كل الإعدادات في مكان واحد
 */

export { env, default as envConfig } from './env.js';
export * from './constants.js';
export { TEAM, findMemberById, findMemberByEmail, findMemberByName, getWhatsAppId } from './team.js';

export default {
  env,
  TEAM
};
