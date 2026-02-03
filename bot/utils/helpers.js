/**
 * Shared utility functions for GVFL bot
 */

const { MessageFlags } = require('discord.js');

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
 * 1st=10, 2nd=6, 3rd=4, 4th=3, 5th=2, 6th=1, 7th+=0
 */
const POINTS_MAP = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

/**
 * Colors for embed based on placement
 */
const COLOR_MAP = {
  1: 0xFFD700, // Gold
  2: 0xC0C0C0, // Silver
  3: 0xCD7F32, // Bronze
  4: 0x5865F2, // Blue
  5: 0x57F287, // Green
  6: 0xFEE75C, // Yellow
};

/**
 * Medal emojis for placements
 */
const MEDAL_MAP = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣' };

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
  return safeReply(interaction, { content: message, flags: MessageFlags.Ephemeral });
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
