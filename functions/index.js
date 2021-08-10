const functions = require("firebase-functions");
const { Telegraf } = require('telegraf')

const bot = new Telegraf(functions.config().config.bot_id)
const admin = require('firebase-admin');
admin.initializeApp();

let Parser = require('rss-parser');
let parser = new Parser();

bot.command('status', async (ctx) => {
  let isEnabled = await isBotEnabled();
  if (isEnabled) {
    ctx.reply("Bot now is running");
  } else {
    ctx.reply("Bot now is stopped");
  }
})

bot.command('swap', async (ctx) => {
  let isEnabled = await isBotEnabled();
  if (ctx.message.chat.id == functions.config().config.chat_id) {
    if (isEnabled) {
      ctx.reply("Bot now is running. Trying to stop")
    } else {
      ctx.reply("Bot now is stopped. Trying to start")
    }
    const data = {
      isEnabled: !isEnabled
    };
    const updateResult = await admin.firestore().collection('config').doc('enableSend').set(data);
  } else {
    ctx.reply("You don't have rights to manage bot")
  }
})

exports.echoBot = functions.https.onRequest(async (request, response) => {
  functions.logger.log('Incoming message', request.body)
  try {
    await bot.handleUpdate(request.body)
  } finally {
    response.status(200).end()
  }
})

exports.cronJob = functions.pubsub.schedule('0 * * * *').onRun(async (context) => {
  let isEnabled = await isBotEnabled();
  if (!isEnabled) {
  	console.log("Bot has been stopped");
  	return null;
  }

  const fetchData = await admin.firestore()
  									.collection('last_update')
  									.orderBy('date', 'desc')
  									.limit(1)
  									.get();
  const last_update_id = fetchData.docs[0].data().last_update_id;
  sendUpdates(last_update_id);
  return null;
});

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
          feed.items,
          last_update_id
        );
      } else {
        updateLastItemAndSendMessages(
          feed.items[0].id,
          feed.items.slice(0, index),
          last_update_id
        );
      }
    }
  })
}

async function updateLastItemAndSendMessages(item_id, items, last_update_id) {
  let date = new Date();
  const data = {
  	last_update_id: item_id,
  	date: date
  }
  const writeResult = await admin.firestore().collection('last_update').doc(item_id).add(data);

  const clearResult = await admin.firestore().collection('last_update').doc(last_update_id).delete();
  sendItems(items);
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
      bot.telegram.sendMessage(
        functions.config().config.channel_id,
        prepareLink(title, link),
        {"parse_mode": "HTML"}
      )
      .then(message => {
        saveSale(item.id, title, link, message.message_id)
      })
    }
}

async function saveSale(item_id, title, link, message_id) {
  const data = {
  	id: item_id,
  	title: title,
  	link: link,
  	sale_end_date: null,
  	message_id: message_id
  }
  const writeResult = await admin.firestore().collection('sales').add(data);
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
  console.log(message);
  let chatId = functions.config().config.chat_id;
  if (chatId) {
    bot.telegram.sendMessage(chatId, message);
  }
}

async function isBotEnabled() {
  const enableSendDoc = await admin.firestore()
                    .collection('config')
                    .doc('enableSend')
                    .get();
  return enableSendDoc.data().isEnabled;
}

Array.prototype.rotate = function(n) {
  return this.slice(n, this.length).concat(this.slice(0, n));
}