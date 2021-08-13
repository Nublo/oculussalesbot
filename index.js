// SalesQuest bot
const cron = require('node-cron')

const { Pool } = require('pg')
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})
let Parser = require('rss-parser');
let parser = new Parser();
let enableSend = true;

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
  // Disable webhook set to avoid mixing with another bot
  // bot.setWebHook(process.env.SERVICE_URL + ':' + process.env.PORT + '/bot' + process.env.BOT_ID);
} else {
  bot = new TelegramBot(process.env.BOT_ID, {polling: true});
}

bot.onText(/\/chatId/, (msg) => {
  bot.sendMessage(msg.chat.id, JSON.stringify(msg))
});

bot.onText(/\/swap/, (msg) => {
  if (msg.chat.id == process.env.CHAT_ID) {
    if (enableSend) {
      bot.sendMessage(msg.chat.id, "Bot now is stopped")
    } else {
      bot.sendMessage(msg.chat.id, "Bot now is running")
    }
    enableSend = !enableSend;
  } else {
    bot.sendMessage(msg.chat.id, "You don't have rights to manage bot")
  }
});

cron.schedule('0 * * * *', () => {
  if (enableSend) {
    updateFeed()
  } else {
    console.log("Bot has been stopped");
  }
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
    .catch(e => logErrorAndNotify("Error while getting lastId " + e.stack))
}

function sendUpdates(last_update_id) {
  parser.parseURL('https://www.reddit.com/r/OculusQuestStore/new.rss', function(err, feed) {
    if (err) {
      logErrorAndNotify("parse error - " + err)
      return
    }

    var index = feed.items.findIndex((item) => item.id == last_update_id)

    if (index == 0) {
      console.log("No updates for now")
    } else {
      if (index < 0) {
        console.log("Didn't find item with id - " + last_update_id);
        updateLastItemAndSendMessages(
          feed.items[0].id,
          feed.items
        );
      } else {
        updateLastItemAndSendMessages(
          feed.items[0].id,
          feed.items.slice(0, index)
        );
      }
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
    .catch(e => logErrorAndNotify("Update LastItem error - " + e.stack))
}

function sendItems(items) {
  let rotatedItems = items.rotate(items.length);
  let timeoutMs = 0;
  rotatedItems.forEach(item => {
    setTimeout(sendItem, timeoutMs, item);
    timeoutMs = timeoutMs + 3000;
  })
}

function sendItem(item) {
    var title = item.title
    var link = extractOculusLink(item.content)
    if (isProperPost(title, link)) {
      bot.sendMessage(
        process.env.CHANNEL_ID,
        prepareLink(title, link),
        {"parse_mode": "HTML"}
      )
      .then(message => {
        saveSale(item.id, title, link, message.message_id)
      })
    }
}

Array.prototype.rotate = function(n) {
    return this.slice(n, this.length).concat(this.slice(0, n));
}

function saveSale(item_id, title, link, message_id) {
  const query = {
    text: 'INSERT INTO sales (id, title, link, sale_end_date, message_id) VALUES ($1, $2, $3, $4, $5)',
    values: [item_id, title, link, null, message_id],
  }
  pool
    .query(query)
    .then(res => {
      // Do nothing here
    })
    .catch(e => logErrorAndNotify("saveSale:{" + item_id + "," + link + "," + message_id + "}, " + e.stack))
}

function extractOculusLink(link) {
  let regex = /\<a\s+(?:[^>]*?\s+)?href=(["'])(https:\/\/www.oculus.com.*?)\1/g
  var match = regex.exec(link);
  if (match != null) {
    return match[2]
  } else {
    return null
  }
}

function isProperPost(title, link) {
  if (link == null) {
    return false;
  }
  console.log("title - " + title)
  console.log("link - " + link)
  return title.toLowerCase().includes("[sale]")
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