/**
 * Shared utility functions for GVFL bot
 */

/**
 * Convert placement number to ordinal string
 * @param {number} n - Placement number (1, 2, or 3)
 * @returns {string} Ordinal string (1st, 2nd, 3rd)
 */
function ordinal(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

/**
 * Points awarded for each placement
 */
const POINTS_MAP = { 1: 3, 2: 2, 3: 1 };

/**
 * Colors for embed based on placement
 */
const COLOR_MAP = {
  1: 0xFFD700, // Gold
  2: 0xC0C0C0, // Silver
  3: 0xCD7F32, // Bronze
};

/**
 * Medal emojis for placements
 */
const MEDAL_MAP = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Safe reply helper - handles already replied interactions
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 * @param {object} options - Reply options
 */
async function safeReply(interaction, options) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(options);
    }
    return await interaction.reply(options);
  } catch (err) {
    console.error('[safeReply] Failed:', err.message);
  }
}

/**
 * Safe error reply helper
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 * @param {string} message - Error message
 */
async function safeErrorReply(interaction, message) {
  return safeReply(interaction, { content: message, ephemeral: true });
}

module.exports = {
  ordinal,
  POINTS_MAP,
  COLOR_MAP,
  MEDAL_MAP,
  sleep,
  safeReply,
  safeErrorReply,
};
