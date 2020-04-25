// SalesQuest bot
const cron = require('node-cron')

const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
let Parser = require('rss-parser');
let parser = new Parser();

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

cron.schedule('0 * * * *', () => {
  updateFeed()
})

updateFeed()

function updateFeed() {
  const query = {
    text: 'SELECT * FROM last_update LIMIT 1'
  }
  pool
    .query(query)
    .then(res => {
      if (res.rows[0].update_id != null) {
        sendUpdates(res.rows[0].update_id)
      } else {
        logErrorAndNotify("Didn't find last_update_id in a table")
      }
    })
    .catch(e => logErrorAndNotify(e.stack))
}

function sendUpdates(last_update_id) {
  parser.parseURL('https://www.reddit.com/r/OculusQuestStore/.rss', function(err, feed) {
    if (err) {
      logErrorAndNotify(err)
      return
    }

    var index = feed.items.findIndex((item) => item.id == last_update_id)

    if (index > 0) {
      updateLastItemAndSendMessages(
        feed.items[0].id,
        feed.items.slice(0, index)
      )
    } else if (index == 0) {
      console.log("No updates for now")
    } else {
      logErrorAndNotify("Didn't find item with id - " + last_update_id)
    }
  })
}

function updateLastItemAndSendMessages(item_id, items) {
  const query = {
    text: 'INSERT INTO last_update (id, update_id) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET update_id = $2',
    values: [1, item_id],
  }
  pool
    .query(query)
    .then(res => {
      sendItems(items)
    })
    .catch(e => logErrorAndNotify(e.stack))
}

function sendItems(items) {
  for (var i = items.length-1; i >= 0; i--) {
    var title = items[i].title
    var link = extractOculusLink(items[i].content)
    if (link != null) {
      bot.sendMessage(
        process.env.CHANNEL_ID,
        prepareLink(title, link),
        {"parse_mode": "HTML"}
      )
    }
  }
}

function extractOculusLink(link) {
  let regex = /\<a\s+(?:[^>]*?\s+)?href=(["'])(https:\/\/www.oculus.com.*?)\1/g
  var match = regex.exec(link);
  if (match != null) {
    console.log("link - " - match[2])
    return match[2]
  } else {
    return null
  }
}

function prepareLink(title, link) {
  return "<a href=\"" + link + "\">" + title + "</a>"
}

function logErrorAndNotify(message) {
  console.log(message)
  if (process.env.CHAT_ID) {
    bot.sendMessage(process.env.CHAT_ID, message)
  }
}