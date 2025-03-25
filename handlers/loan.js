const { log } = require('../utils/logger');
const { setUserState, getUserState, clearUserState, markApplicationCompleted, hasApplied } = require('../state/userState');
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');

const loanHandlers = {
  requestLoan: (bot, callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;

    if (hasApplied(userId)) {
      bot.sendMessage(chatId, '⚠️ You have already submitted a loan application. Multiple applications are not allowed. Contact support at https://kopakash-loan.vercel.app/ for assistance.');
      log(`User ${userId} attempted to re-apply but was blocked`);
      return;
    }

    setUserState(userId, { step: 'awaiting_full_name', data: {} });
    bot.sendMessage(chatId, '📋 Please enter your Full Name (as per your National ID).');
    log(`User ${userId} started loan application - State: ${JSON.stringify(getUserState(userId))}`);
  },

  handleUserResponse: (bot, msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const state = getUserState(userId);

    log(`Handling response for ${userId} - State: ${JSON.stringify(state)}`);

    if (!state || !state.step || !text) {
      return bot.sendMessage(chatId, '⚠️ Please start a loan application using the "Apply for a Loan" button.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📌 Apply for a Loan', callback_data: 'request_loan' }]
          ]
        }
      });
    }

    switch (state.step) {
      case 'awaiting_full_name':
        if (text.trim().split(' ').length < 2) {
          bot.sendMessage(chatId, '⚠️ Please provide your full name (e.g., John Doe).');
          break;
        }
        setUserState(userId, { step: 'awaiting_id_number', data: { fullName: text } });
        bot.sendMessage(chatId, '✅ Full Name recorded. Now, please enter your National ID Number.');
        break;

      case 'awaiting_id_number':
        const idNumber = text.trim();
        if (!/^\d{7,9}$/.test(idNumber)) {
          bot.sendMessage(chatId, '⚠️ Please enter a valid Kenyan National ID Number (7-9 digits).');
          break;
        }
        setUserState(userId, { step: 'awaiting_phone', data: { ...state.data, idNumber } });
        bot.sendMessage(chatId, '✅ ID Number recorded. Now, enter your Phone Number (registered with M-Pesa).');
        break;

      case 'awaiting_phone':
        const phoneNumber = text.trim().replace(/\s/g, '');
        if (!/^(0[17]\d{8}|254[17]\d{8}|\+254[17]\d{8})$/.test(phoneNumber)) {
          bot.sendMessage(chatId, '⚠️ Please enter a valid Kenyan phone number (e.g., 0712345678, 0112345678, or +254712345678).');
          break;
        }
        setUserState(userId, { step: 'awaiting_amount', data: { ...state.data, phoneNumber } });
        bot.sendMessage(chatId, '✅ Phone Number recorded. How much would you like to borrow? (Enter an amount in KSH, e.g., 5000)');
        break;

      case 'awaiting_amount':
        const loanAmount = parseFloat(text);
        if (isNaN(loanAmount) || loanAmount < 5000 || loanAmount > 60000) {
          bot.sendMessage(chatId, '⚠️ Please enter a valid loan amount between KSH 5000 and KSH 60,000.');
          break;
        }
        setUserState(userId, { step: 'awaiting_reason', data: { ...state.data, loanAmount } });
        bot.sendMessage(chatId, '✅ Loan Amount recorded. What is the reason for this loan? (e.g., Business, Emergency, School Fees)');
        break;

      case 'awaiting_reason':
        if (text.trim().length < 3) {
          bot.sendMessage(chatId, '⚠️ Please provide a valid reason for the loan (at least 3 characters).');
          break;
        }
        setUserState(userId, { step: 'confirming_details', data: { ...state.data, reason: text } });

        const userData = getUserState(userId).data;
        const confirmationMessage = `📌 Please confirm your loan application details:\n
        🔹 **Full Name:** ${userData.fullName}
        🔹 **National ID:** ${userData.idNumber}
        🔹 **Phone Number:** ${userData.phoneNumber}
        🔹 **Loan Amount:** KSH ${userData.loanAmount.toLocaleString()}
        🔹 **Reason:** ${userData.reason}
        \nDo you confirm this application?`;

        bot.sendMessage(chatId, confirmationMessage, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, Confirm', callback_data: 'confirm_loan' }],
              [{ text: '❌ No, Restart', callback_data: 'restart_loan' }]
            ]
          }
        });
        break;

      default:
        bot.sendMessage(chatId, '⚠️ Something went wrong. Please start again.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📌 Apply for a Loan', callback_data: 'request_loan' }]
            ]
          }
        });
        log(`Unexpected state for ${userId}: ${JSON.stringify(state)}`);
    }
  },

  confirmLoan: async (bot, callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const userData = getUserState(userId)?.data || {};

    if (!userData || !userData.loanAmount) {
      bot.sendMessage(chatId, '⚠️ No loan application found. Please start again.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📌 Apply for a Loan', callback_data: 'request_loan' }]
          ]
        }
      });
      return;
    }

    try {
      // Generate and send PDF immediately after confirmation
      const tempDir = path.join(__dirname, '../temp');
      await fs.mkdir(tempDir, { recursive: true });

      const pdfPath = path.join(tempDir, `loan_application_${userId}.pdf`);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const writeStream = require('fs').createWriteStream(pdfPath);
      doc.pipe(writeStream);

      doc.fontSize(20).text('KOPAKASH LOANS', { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(16).text('Loan Application Confirmation', { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`, { align: 'left' });
      doc.moveDown(1);

      doc.text('Dear Customer,', { align: 'left' });
      doc.moveDown(0.5);
      doc.text('Thank you for applying for a loan with KOPAKASH LOANS. Below are your application details:');
      doc.moveDown(1);

      doc.text(`Full Name: ${userData.fullName}`);
      doc.moveDown(0.5);
      doc.text(`National ID: ${userData.idNumber}`);
      doc.moveDown(0.5);
      doc.text(`Phone Number: ${userData.phoneNumber}`);
      doc.moveDown(0.5);
      doc.text(`Loan Amount: KSH ${userData.loanAmount.toLocaleString()}`);
      doc.moveDown(0.5);
      doc.text(`Reason: ${userData.reason}`);
      doc.moveDown(1);

      doc.text('We will review your application and notify you soon via your provided phone number.');
      doc.moveDown(1);
      doc.fillColor('red').text('Pending payment of KSH 120 processing fee');
      doc.fillColor('black');
      doc.moveDown(1);
      doc.text('Best regards,', { align: 'left' });
      doc.text('KOPAKASH LOANS Team');

      doc.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      await bot.sendDocument(chatId, pdfPath, {
        caption: `🎉 Your loan request for **KSH ${userData.loanAmount.toLocaleString()}** (${userData.reason}) has been submitted. See attached PDF for details.`
      });
      log(`User ${userId} loan application confirmed - PDF sent`);

      // Prompt payment after PDF
      await bot.sendMessage(chatId, `📌 Your application is submitted! Please pay a KSH 120 processing fee to complete verification.\n
~ KOPAKASH LTD`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Pay Now via STK Push', callback_data: 'pay_stk_push' }]
          ]
        }
      });
      log(`User ${userId} prompted to pay KSH 120 fee after PDF`);

      // Mark application completed only after payment
      if (userData.paymentConfirmed) {
        markApplicationCompleted(userId);
        await bot.sendMessage(chatId, '✅ Payment confirmed! Your loan application is now being processed.');
        log(`User ${userId} payment confirmed - Application fully processed`);
        clearUserState(userId);
      }

      await fs.unlink(pdfPath);
    } catch (err) {
      bot.sendMessage(chatId, '⚠️ Error generating confirmation PDF. Your application was submitted, but please contact support if you need the document.');
      log(`Error in confirmLoan for ${userId}: ${err.message}, Stack: ${err.stack}`);
    }
  },

  restartLoan: (bot, callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;

    clearUserState(userId);
    bot.sendMessage(chatId, '🔄 Loan application restarted. Use the button to apply again.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📌 Apply for a Loan', callback_data: 'request_loan' }]
        ]
      }
    });
    log(`User ${userId} restarted loan application`);
  },
};

module.exports = loanHandlers;