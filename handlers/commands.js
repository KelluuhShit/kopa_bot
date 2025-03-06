const { log } = require('../utils/logger');

const commands = {
  start: (bot, msg) => {
    const chatId = msg.chat.id;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📌 Apply for a Loan', callback_data: 'request_loan' }],
          [{ text: 'ℹ️ Check Loan Requirements', callback_data: 'check_requirements' }],
          [{ text: '💰 Loan Repayment & Terms', callback_data: 'loan_terms' }],
        ]
      }
    };
    bot.sendMessage(chatId, `👋 **Welcome to KOPAKASH LOANS!**\n
We provide quick and easy soft loans to meet your financial needs. As a first-time applicant, you can access up to **KSh 20,000** instantly!\n
🔹 **Loan Amount:** Up to KSh 20,000 on your first application\n
🔹 **Interest Rate:** 20%\n
🔹 **Repayment Period:** Up to 3 months (in installments)\n
🔹 **Flexible Repayment:** Adjustable period of up to 4 months\n
How can we assist you today? Use the buttons below to get started!`, opts);
    log(`User ${msg.from.id} started KOPAKASH LOANS bot`);
  },
  help: (bot, msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Use the buttons below to get started or learn more:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📌 Apply for a Loan', callback_data: 'request_loan' }],
          [{ text: 'ℹ️ Check Loan Requirements', callback_data: 'check_requirements' }],
          [{ text: '💰 Loan Repayment & Terms', callback_data: 'loan_terms' }],
        ]
      }
    });
    log(`User ${msg.from.id} requested help`);
  },
};

module.exports = commands;