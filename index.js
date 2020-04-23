// SalesQuest bot
const cron = require('node-cron')
// const { Pool } = require('pg')

// const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const TelegramBot = require('node-telegram-bot-api');
const isProduction = typeof process.env.PORT !== 'undefined'
let bot;
if (isProduction) {
  const options = {
    webHook : {
      port : process.env.PORT
    }
  }
  bot = new TelegramBot(process.env.BOT_ID, options);
  bot.setWebHook(process.env.SERVICE_URL + ':' + process.env.PORT + '/bot' + process.env.BOT_ID);
} else {
  bot = new TelegramBot(process.env.BOT_ID, {polling: true});
}

bot.onText(/\/send (.+)/, (msg, match) => {
  console.log()
  var textToSend = match[1]
  bot.sendMessage('@oculussales', match[1])
})

cron.schedule('*/10 * * * *', () => {

})