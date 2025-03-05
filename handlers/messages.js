const { log } = require('../utils/logger');
const loanHandlers = require('./loan');

const handleMessage = (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  if (!text || text.startsWith('/')) return;

  loanHandlers.handleUserResponse(bot, msg);
  log(`Message from ${userId}: ${text}`);
};

module.exports = { handleMessage };