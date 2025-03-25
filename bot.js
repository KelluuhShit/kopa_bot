const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { telegramToken } = require('./config/config');
const commands = require('./handlers/commands');
const { handleMessage } = require('./handlers/messages');
const { loanHandlers, handleLoanInput } = require('./handlers/loan');
const { payheroHandlers, handleStkPhoneInput } = require('./handlers/payhero');
const { log } = require('./utils/logger');

const bot = new TelegramBot(telegramToken);
const app = express();

app.use(express.json());

// Webhook endpoint for Telegram updates
app.post('/telegram-webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.status(200).send('OK');
});

// Set webhook
const WEBHOOK_URL = 'https://t.me/KopakashLoans_bot'; // Replace with your Railway URL
bot.setWebHook(WEBHOOK_URL).then(() => {
  log(`Webhook set to ${WEBHOOK_URL}`);
}).catch(err => {
  log(`Failed to set webhook: ${err.message}`);
});

// Command handlers
bot.onText(/\/start/, (msg) => commands.start(bot, msg));
bot.onText(/\/help/, (msg) => commands.help(bot, msg));

// Message handler
bot.on('message', (msg) => {
  const state = require('./state/userState').getUserState(msg.from.id);
  if (state?.step === 'awaiting_phone_for_stk') {
    handleStkPhoneInput(bot, msg);
  } else if (state?.step === 'awaiting_amount' || state?.step === 'awaiting_reason') {
    handleLoanInput(bot, msg);
  } else {
    handleMessage(bot, msg);
  }
});

// Callback query handlers
bot.on('callback_query', (callbackQuery) => {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const msg = callbackQuery.message;

  switch (data) {
    case 'request_loan':
      loanHandlers.requestLoan(bot, callbackQuery);
      break;
    case 'confirm_loan':
      loanHandlers.confirmLoan(bot, callbackQuery);
      break;
    case 'restart_loan':
      loanHandlers.restartLoan(bot, callbackQuery);
      break;
    case 'pay_stk_push':
      payheroHandlers.payStkPush(bot, callbackQuery);
      break;
    case 'check_requirements':
      bot.sendMessage(chatId, `📋 **Loan Requirements – Kopakash**\n
✅ Be a Kenyan Citizen with a valid National ID\n
✅ Be 18 years or older\n
✅ Have an active M-Pesa account\n
✅ Have a registered phone number\n
✅ Have a stable income source`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📌 Apply Now', callback_data: 'request_loan' }]
          ]
        }
      });
      log(`User ${callbackQuery.from.id} checked requirements`);
      break;
    case 'loan_terms':
      bot.sendMessage(chatId, `📌 **Loan Repayment & Terms – Kopakash**\n
🔹 **Loan Duration & Repayment**\n
- All loans must be repaid within **30 days**.\n
- Early repayments are allowed without penalties.\n
\n
🔹 **Interest Rates & Fees**\n
- The loan attracts an interest rate of **10% per month**, in compliance with the Central Bank of Kenya (CBK) regulations.\n
- A processing fee of **KSH 120** applies and must be paid before loan disbursement.\n
\n
🔹 **Taxes & Government Deductions**\n
- In accordance with Kenyan tax laws, all applicable taxes (such as excise duty on loan fees) will be deducted.\n
- Loans are subject to excise duty at **20% on processing fees**, as per the Kenya Revenue Authority (KRA) regulations.\n
\n
🔹 **Penalties & Late Fees**\n
- Late payments will incur a penalty of **5% per week** after the due date.\n
- Failure to repay may result in negative credit listing (CRB reporting) and legal action.\n
\n
🔹 **Repayment Method**\n
- All repayments should be made via **M-Pesa Paybill**, using your **ID Number** as the account reference.\n
\n
⚠ **Important Notice:**\n
Failure to repay on time may affect your ability to access future loans and could result in legal recovery actions.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📌 Apply Now', callback_data: 'request_loan' }]
          ]
        }
      });
      log(`User ${callbackQuery.from.id} checked loan terms`);
      break;
    case 'start':
      commands.start(bot, { chat: { id: chatId }, from: callbackQuery.from });
      break;
    case 'help':
      commands.help(bot, { chat: { id: chatId }, from: callbackQuery.from });
      break;
    default:
      log(`Unhandled callback: ${data}`);
  }
  bot.answerCallbackQuery(callbackQuery.id);
});

// PayHero callback endpoint
app.post('/payhero-callback', async (req, res) => {
  const paymentData = req.body;
  log(`Received PayHero callback: ${JSON.stringify(paymentData)}`);
  await payheroHandlers.handlePayheroCallback(bot, paymentData);
  res.status(200).send('Callback received');
});

// Webhook error handling
bot.on('webhook_error', (error) => log(`Webhook error: ${error.message}`));

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Server running on port ${PORT} for Telegram and PayHero callbacks`);
});