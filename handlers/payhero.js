const { log } = require('../utils/logger');
const axios = require('axios');
const { getUserState, setUserState } = require('../state/userState');

require('dotenv').config();

const apiUsername = process.env.PAYHERO_API_USERNAME || 'zQA8OJbEwvr68AKJnhSA';
const apiPassword = process.env.PAYHERO_API_PASSWORD || 'MQ7GAlKvhPKpB27fiKp35ZRvJWj92637ThSg1C0P';

const credentials = `${apiUsername}:${apiPassword}`;
const encodedCredentials = Buffer.from(credentials).toString('base64');
const basicAuthToken = `Basic ${encodedCredentials}`;

const payheroHandlers = {
  payStkPush: async (bot, callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const userData = getUserState(userId)?.data || {};

    if (!userData.phoneNumber) {
      setUserState(userId, { step: 'awaiting_phone_for_stk', data: {} });
      bot.sendMessage(chatId, '⚠️ We need your phone number to process the payment. Please enter your M-Pesa registered phone number (e.g., 0712345678).');
      log(`User ${userId} prompted for phone number for STK Push`);
      return;
    }

    try {
      const response = await axios.post(
        'https://backend.payhero.co.ke/api/v2/payments',
        {
          amount: 120, // Numeric per sample
          phone_number: userData.phoneNumber, // Exact field name
          channel_id: 1874, // From sample; confirm with PayHero if specific to your account
          provider: "m-pesa", // Exact value
          external_reference: `KOP-${userId}-${Date.now()}`, // Unique ref like INV-009
          customer_name: userData.fullName || "Unknown Customer", // Use fullName if available
          callback_url: "https://t.me/KopakashLoans_bot" // Replace with your Railway URL
        },
        {
          headers: {
            'Authorization': basicAuthToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === "QUEUED" || response.data.success) {
        bot.sendMessage(chatId, '✅ STK Push initiated! Check your phone and enter your M-Pesa PIN to pay KSH 120.');
        log(`STK Push initiated for ${userId} - Phone: ${userData.phoneNumber} - Response: ${JSON.stringify(response.data)}`);
      } else {
        bot.sendMessage(chatId, '⚠️ Failed to initiate STK Push. Try again or contact support.');
        log(`STK Push failed for ${userId}: ${JSON.stringify(response.data)}`);
      }
    } catch (err) {
      bot.sendMessage(chatId, '⚠️ Error initiating payment. Contact support.');
      log(`STK Push error for ${userId}: ${err.message} - Status: ${err.response?.status} - Data: ${JSON.stringify(err.response?.data)}`);
    }
  },

  handlePayheroCallback: async (bot, paymentData) => {
    const userId = paymentData.external_reference?.split('-')[1] || paymentData.description?.split('User ')[1];
    const chatId = userId; // Adjust if needed
    const status = paymentData.status;
    const transactionId = paymentData.transaction_id || paymentData.checkout_request_id || 'N/A';

    try {
      if (status === 'success' || status === 'QUEUED' || status === 'COMPLETED') {
        bot.sendMessage(chatId, `🎉 Payment of KSH 120 confirmed! Transaction ID: ${transactionId}. Your loan application is now being processed.`);
        log(`Payment confirmed for ${userId} - Transaction ID: ${transactionId}`);
      } else {
        bot.sendMessage(chatId, `⚠️ Payment failed. Please try again or contact support. Transaction ID: ${transactionId}`);
        log(`Payment failed for ${userId} - Status: ${status}`);
      }
    } catch (err) {
      log(`Error processing PayHero callback for ${userId}: ${err.message}`);
    }
  }
};

const handleStkPhoneInput = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim().replace(/\s/g, '');
  const state = getUserState(userId);

  if (state?.step === 'awaiting_phone_for_stk') {
    if (!/^(0[17]\d{8}|254[17]\d{8}|\+254[17]\d{8})$/.test(text)) {
      bot.sendMessage(chatId, '⚠️ Please enter a valid Kenyan phone number (e.g., 0712345678, 0112345678, or +254712345678).');
      return;
    }

    setUserState(userId, { step: null, data: { phoneNumber: text } });
    bot.sendMessage(chatId, '✅ Phone number recorded. Initiating payment...');
    log(`User ${userId} provided phone number: ${text}`);
    await payheroHandlers.payStkPush(bot, { message: { chat: { id: chatId } }, from: { id: userId } });
  }
};

module.exports = { payheroHandlers, handleStkPhoneInput };