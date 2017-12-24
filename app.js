/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var co = require('co')
var request = require('request');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
 * Bot Storage: This is a great spot to register the private state storage for your bot. 
 * We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
 * For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
 * ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
bot.set('storage', tableStorage);

bot.dialog('/', function(session) {
    function isJapanese(text) {
        return new Promise(function(resolve, reject) {
            var isJapanese = false;
            for (var i = 0; i < text.length; i++) {
                if (text.charCodeAt(i) >= 256) {
                    isJapanese = true;
                    break;
                }
            }
            resolve(isJapanese);
        });
    }

    function getCognitiveApiToken(key) {
        return new Promise(function(resolve, reject) {
            var options = {
                url: "https://api.cognitive.microsoft.com/sts/v1.0/issueToken",
                method: 'POST',
                headers: {
                    'Content-Type': 'application/jwt',
                    'Ocp-Apim-Subscription-Key': key
                },
                json: true
            };
            request(options, function(error, response, body) {
                if (error) {
                    reject(error);
                } else {
                    resolve(body);
                }
            });
        });
    }

    function translateText(lang, text, token) {
        return new Promise(function(resolve, reject) {
            var options = {
                url: "https://api.microsofttranslator.com/V2/Http.svc/Translate",
                qs: {
                    'to': lang,
                    'text': text
                },
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                json: true
            };
            request(options, function(error, response, body) {
                if (error) {
                    reject(error);
                } else {
                    // Translator Text Apiからのレスポンスはstringタグで囲まれているのでタグを除去する
                    text = body.replace(/<(.+?)>|<\/string>/g, '');
                    resolve(text);
                }
            });
        });
    }

    co(function*() {
        var text = session.message.text;
        var api_key = "************************"; // Translator Text Api Key
        if (yield isJapanese(text)) {
            var to_lang = "en";
        } else {
            var to_lang = "ja";
        }
        try {
            var token = yield getCognitiveApiToken(api_key);
            var result = yield translateText(to_lang, text, token);
            session.send(result);
        } catch (error) {
            context.log(error);
        }
    });
});