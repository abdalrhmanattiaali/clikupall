/**
 * Team Members Configuration
 * تعريف أعضاء الفريق وربطهم مع ClickUp IDs و WhatsApp
 */

export const TEAM = [
  {
    id: 62585187,
    name: 'Abd Al Rahman',
    email: 'abd.alrhmanattiaali@gmail.com',
    phone: '201122509222'
  },
  {
    id: 74558888,
    name: 'Abdallah',
    email: 'a.eisawe94@gmail.com',
    phone: '201553979737'
  },
  {
    id: 74558852,
    name: 'Mohamed Attia',
    email: 'm.eisawy89@icloud.com',
    phone: '201273016100'
  }
];

/**
 * Find team member by ID
 * @param {number} id - ClickUp user ID
 * @returns {Object|null} Team member object or null
 */
export const findMemberById = (id) => {
  return TEAM.find(member => member.id === id) || null;
};

/**
 * Find team member by email
 * @param {string} email - Member email
 * @returns {Object|null} Team member object or null
 */
export const findMemberByEmail = (email) => {
  return TEAM.find(member => member.email === email) || null;
};

/**
 * Find team member by name
 * @param {string} name - Member name
 * @returns {Object|null} Team member object or null
 */
export const findMemberByName = (name) => {
  return TEAM.find(member => member.name === name) || null;
};

/**
 * Get WhatsApp chat ID for a member
 * @param {Object} member - Team member object
 * @returns {string} WhatsApp chat ID
 */
export const getWhatsAppId = (member) => {
  return `${member.phone}@c.us`;
};

export default TEAM;
