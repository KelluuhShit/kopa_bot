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
      setUserState(userId, { step: 'awaiting_phone_for_stk', data: { chatId } });
      bot.sendMessage(chatId, '⚠️ We need your phone number to process the payment. Please enter your M-Pesa registered phone number (e.g., 0712345678).');
      log(`User ${userId} prompted for phone number - State updated: ${JSON.stringify(getUserState(userId))}`);
      return;
    }

    try {
      const callbackUrl = "https://kopakash.up.railway.app/payhero-callback";
      const externalReference = `KOP-${userId}-${Date.now()}`;
      log(`Initiating STK Push for User ${userId} - Payload: ${JSON.stringify({
        amount: 1,
        phone_number: userData.phoneNumber,
        channel_id: 1874,
        provider: "m-pesa",
        external_reference: externalReference,
        customer_name: userData.fullName || "Unknown Customer",
        callback_url: callbackUrl
      })}`);

      const response = await axios.post(
        'https://backend.payhero.co.ke/api/v2/payments',
        {
          amount: 1,
          phone_number: userData.phoneNumber,
          channel_id: 1874,
          provider: "m-pesa",
          external_reference: externalReference,
          customer_name: userData.fullName || "Unknown Customer",
          callback_url: callbackUrl
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
        log(`STK Push success for User ${userId} - Phone: ${userData.phoneNumber}, Response: ${JSON.stringify(response.data)}`);

        // Start polling for transaction status
        const reference = response.data.reference; // From your logs, e.g., "f0b7-410a-..."
        if (reference) {
          await pollTransactionStatus(bot, chatId, userId, reference);
        } else {
          log(`No reference found in STK response for User ${userId}: ${JSON.stringify(response.data)}`);
          bot.sendMessage(chatId, '⚠️ Payment initiated, but status check failed. Please wait or contact support.');
        }
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
    const chatId = userState.data.chatId || userId;
    const status = paymentData.status;
    const transactionId = paymentData.transaction_id || paymentData.checkout_request_id || 'N/A';

    try {
      log(`Processing callback for User ${userId} - Status: ${status}, Transaction ID: ${transactionId}, Chat ID: ${chatId}`);

      if (status === 'success' || status === 'COMPLETED') {
        setUserState(userId, {
          ...userState,
          data: { ...userState.data, paymentConfirmed: true, transactionId }
        });
        bot.sendMessage(chatId, `🎉 Payment of KSH 120 confirmed! Transaction ID: ${transactionId}. Your application is now fully submitted and under review.`);
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

    setUserState(userId, { step: null, data: { ...state.data, phoneNumber: text, chatId } });
    bot.sendMessage(chatId, '✅ Phone number recorded. Initiating payment...');
    log(`User ${userId} phone number recorded - Phone: ${text}, Updated State: ${JSON.stringify(getUserState(userId))}`);
    await payheroHandlers.payStkPush(bot, { message: { chat: { id: chatId } }, from: { id: userId } });
  } else {
    log(`Unexpected phone input from User ${userId} - Not in awaiting_phone_for_stk state`);
  }
};

// Polling function to check transaction status
async function pollTransactionStatus(bot, chatId, userId, reference) {
  const maxAttempts = 12; // 60s / 5s = 12 attempts
  let attempts = 0;

  const checkStatus = async () => {
    try {
      const response = await axios.get(
        `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${reference}`,
        {
          headers: {
            'Authorization': basicAuthToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const statusData = response.data;
      log(`Transaction status check for User ${userId} - Reference: ${reference}, Response: ${JSON.stringify(statusData)}`);

      if (statusData.status === 'success' || statusData.status === 'COMPLETED') {
        const transactionId = statusData.transaction_id || statusData.checkout_request_id || reference;
        setUserState(userId, {
          ...getUserState(userId),
          data: { ...getUserState(userId).data, paymentConfirmed: true, transactionId }
        });
        bot.sendMessage(chatId, `🎉 Payment of KSH 120 confirmed! Transaction ID: ${transactionId}. Your application is now fully submitted and under review.`);
        log(`Payment confirmed via polling for User ${userId} - Transaction ID: ${transactionId}`);
        return true;
      } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
        bot.sendMessage(chatId, `⚠️ Payment failed. Transaction ID: ${reference}. Please retry or contact support.`);
        log(`Payment failed via polling for User ${userId} - Status: ${statusData.status}`);
        return true;
      }
      // If still pending/queued, continue polling
      return false;
    } catch (err) {
      log(`Polling error for User ${userId} - Reference: ${reference}, Error: ${err.message}`);
      return false;
    }
  };

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      attempts++;
      const done = await checkStatus();
      if (done || attempts >= maxAttempts) {
        clearInterval(interval);
        if (attempts >= maxAttempts) {
          bot.sendMessage(chatId, '⏳ Payment status still pending. Please check back later or contact support.');
          log(`Polling timeout for User ${userId} - Reference: ${reference}, Max attempts reached`);
        }
        resolve();
      }
    }, 5000); // Poll every 5 seconds
  });
}

module.exports = { payheroHandlers, handleStkPhoneInput };