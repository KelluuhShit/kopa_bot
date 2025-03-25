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

    log(`Pay STK Push requested - User: ${userId}, Chat: ${chatId}, Current Data: ${JSON.stringify(userData)}`);

    if (!userData.phoneNumber) {
      setUserState(userId, { step: 'awaiting_phone_for_stk', data: { chatId } }); // Store chatId
      bot.sendMessage(chatId, '⚠️ We need your phone number to process the payment. Please enter your M-Pesa registered phone number (e.g., 0712345678).');
      log(`User ${userId} prompted for phone number - State updated: ${JSON.stringify(getUserState(userId))}`);
      return;
    }

    try {
      log(`Initiating STK Push for User ${userId} - Payload: ${JSON.stringify({
        amount: 1,
        phone_number: userData.phoneNumber,
        channel_id: 1874,
        provider: "m-pesa",
        external_reference: `KOP-${userId}-${Date.now()}`,
        customer_name: userData.fullName || "Unknown Customer",
        callback_url: "https://your-app-name.up.railway.app/payhero-callback" // Update this manually
      })}`);

      const response = await axios.post(
        'https://backend.payhero.co.ke/api/v2/payments',
        {
          amount: 1,
          phone_number: userData.phoneNumber,
          channel_id: 1874,
          provider: "m-pesa",
          external_reference: `KOP-${userId}-${Date.now()}`,
          customer_name: userData.fullName || "Unknown Customer",
          callback_url: "https://your-app-name.up.railway.app/payhero-callback" // Update this manually
        },
        {
          headers: {
            'Authorization': basicAuthToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === "QUEUED" || response.data.success) {
        bot.sendMessage(chatId, '✅ STK Push initiated! Check your phone and enter your M-Pesa PIN to pay KSH 1.');
        log(`STK Push success for User ${userId} - Phone: ${userData.phoneNumber}, Response: ${JSON.stringify(response.data)}`);
      } else {
        bot.sendMessage(chatId, '⚠️ Failed to initiate STK Push. Try again or contact support.');
        log(`STK Push failed for User ${userId} - Response: ${JSON.stringify(response.data)}`);
      }
    } catch (err) {
      const errorData = err.response?.data || {};
      if (errorData.error_message === "insufficient balance") {
        bot.sendMessage(chatId, '⚠️ Payment failed due to insufficient balance in our system. Please try again later or contact support.');
        log(`STK Push error for User ${userId} - Insufficient balance, Error: ${JSON.stringify(errorData)}`);
      } else {
        bot.sendMessage(chatId, '⚠️ Error initiating payment. Contact support.');
        log(`STK Push error for User ${userId} - Message: ${err.message}, Status: ${err.response?.status}, Data: ${JSON.stringify(errorData)}`);
      }
    }
  },

  handlePayheroCallback: async (bot, paymentData) => {
    log(`PayHero callback received - Raw Data: ${JSON.stringify(paymentData)}`);

    const userId = paymentData.external_reference?.split('-')[1] || paymentData.description?.split('User ')[1];
    if (!userId) {
      log(`Callback error - No userId found in external_reference or description: ${JSON.stringify(paymentData)}`);
      return;
    }

    const userState = getUserState(userId) || { data: {} };
    const chatId = userState.data.chatId || userId; // Use stored chatId or fallback to userId
    const status = paymentData.status;
    const transactionId = paymentData.transaction_id || paymentData.checkout_request_id || 'N/A';

    try {
      log(`Processing callback for User ${userId} - Status: ${status}, Transaction ID: ${transactionId}, Chat ID: ${chatId}`);

      if (status === 'success' || status === 'COMPLETED') {
        setUserState(userId, {
          ...userState,
          data: { ...userState.data, paymentConfirmed: true, transactionId }
        });
        bot.sendMessage(chatId, `🎉 Payment of KSH 1 confirmed! Transaction ID: ${transactionId}. Your application is now fully submitted and under review.`);
        log(`Payment confirmed for User ${userId} - Transaction ID: ${transactionId}, Updated State: ${JSON.stringify(getUserState(userId))}`);
      } else if (status === 'QUEUED') {
        bot.sendMessage(chatId, `⏳ Payment queued. Transaction ID: ${transactionId}. Please wait for confirmation.`);
        log(`Payment queued for User ${userId} - Transaction ID: ${transactionId}`);
      } else {
        bot.sendMessage(chatId, `⚠️ Payment failed. Transaction ID: ${transactionId}. Please retry or contact support.`);
        log(`Payment failed for User ${userId} - Status: ${status}, Transaction ID: ${transactionId}`);
      }
    } catch (err) {
      log(`Callback processing error for User ${userId} - Error: ${err.message}, Stack: ${err.stack}`);
      bot.sendMessage(chatId, `⚠️ Error processing payment callback. Transaction ID: ${transactionId}. Please contact support.`);
    }
  }
};

const handleStkPhoneInput = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim().replace(/\s/g, '');
  const state = getUserState(userId);

  log(`Phone input received - User: ${userId}, Chat: ${chatId}, Input: "${text}", Current State: ${JSON.stringify(state)}`);

  if (state?.step === 'awaiting_phone_for_stk') {
    if (!/^(0[17]\d{8}|254[17]\d{8}|\+254[17]\d{8})$/.test(text)) {
      bot.sendMessage(chatId, '⚠️ Please enter a valid Kenyan phone number (e.g., 0712345678, 0112345678, or +254712345678).');
      log(`Invalid phone number entered by User ${userId} - Input: "${text}"`);
      return;
    }

    setUserState(userId, { step: null, data: { ...state.data, phoneNumber: text, chatId } }); // Store chatId
    bot.sendMessage(chatId, '✅ Phone number recorded. Initiating payment...');
    log(`User ${userId} phone number recorded - Phone: ${text}, Updated State: ${JSON.stringify(getUserState(userId))}`);
    await payheroHandlers.payStkPush(bot, { message: { chat: { id: chatId } }, from: { id: userId } });
  } else {
    log(`Unexpected phone input from User ${userId} - Not in awaiting_phone_for_stk state`);
  }
};

module.exports = { payheroHandlers, handleStkPhoneInput };