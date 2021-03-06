import { IStateMatch, ChatState } from 'prague-botframework-browserbot';

// It's overkill for BrowserBot use ChatState, but it opens the door to reusing all/most of the code
// in a Bot Framework Connected web service where all other fields would be relevant.

// Add state to your bot here:

interface UserInConversationState {
    rootDialogInstance?: DialogInstance;
}

type BotData = ChatState<undefined, undefined, undefined, undefined, UserInConversationState>;

const botData: BotData = {
    bot: undefined,
    channel: undefined,
    userInChannel: undefined,
    conversation: undefined,
    userInConversation: {
    }
}

import { IChatMessageMatch } from 'prague-botframework-browserbot';

// This is our "base message type" which is used often enough that we made it really short

type B = IStateMatch<BotData> & IChatMessageMatch;

// General purpose rule stuff

import { IRouter, first, best, prependMatcher, router, run } from 'prague-botframework-browserbot';

// Regular Expressions

import { matchRegExp, re, IRegExpMatch } from 'prague-botframework-browserbot';

// LUIS

import { LuisModel } from 'prague-botframework-browserbot';

// WARNING: don't check your LUIS id/key in to your repo!

const luis = new LuisModel('id', 'key');

// Dialogs

import { RootDialogInstance, DialogInstance, LocalDialogInstances, Dialogs, IDialogRootMatch } from 'prague-botframework-browserbot'

// Here is where we create and store dialog instances and their data. In the real world this would be an external store e.g. Redis

const dialogDataStorage: {
    [name: string]: any[];
} = {};

const dialogs = new Dialogs<B>(
    {
        get: (match) => match.data.userInConversation.rootDialogInstance,
        set: (match, rootDialogInstance) => {
            match.data.userInConversation.rootDialogInstance = rootDialogInstance
        }
    }, {
        newInstance: (name, dialogData: any = {}) => {
            if (!dialogDataStorage[name])
                dialogDataStorage[name] = [];
            return {
                name,
                instance: (dialogDataStorage[name].push(dialogData) - 1).toString()
            };
        },
        deleteInstance: (dialogInstance) => {},
        getDialogData: (dialogInstance) => ({ ...
            dialogDataStorage[dialogInstance.name][dialogInstance.instance]
        }),
        setDialogData: (dialogInstance, dialogData?) => {
            dialogDataStorage[dialogInstance.name][dialogInstance.instance] = dialogData;
        },
    }, {
        matchLocalToRemote: (match: B) => ({
            activity: match.activity,
            text: match.text,
            message: match.message,
            address: match.address,
            data: match.data,
        }),
        matchRemoteToLocal: (match, tasks) => ({
            activity: match.activity,
            text: match.text,
            message: match.message,
            address: match.address,
            data: match.data,
            reply: (message: any) =>
                tasks.push({
                    method: 'reply',
                    args: {
                        message
                    }
                })
        } as any),
        executeTask: (match, task) => {},
    }
);

// Prompts/Dialogs

interface GameState {
    num: number,
    guesses: number
}

interface GameArgs {
    upperLimit: number;
    maxGuesses: number;
}

interface GameResponse {
    result: string;
}

const gameDialog = dialogs.add<GameArgs, GameResponse, GameState>(
    'game',
    m => {
        console.log("game activate");
        m.reply(`Guess a number between 0 and ${m.dialogArgs.upperLimit}. You have ${m.dialogArgs.maxGuesses} guesses.`);
        return {
            num: Math.floor(Math.random() * m.dialogArgs.upperLimit),
            guesses: m.dialogArgs.maxGuesses
        }
    },
    first(
        re(/replace/, m => {
            m.reply("replacing");
            return m.replaceThisDialog('Comment');
        }),
        re(/help/, m => m.reply("game help")),
        re(/cheat/, m => m.reply(`The answer is ${m.dialogData.num}`)),
        re(/\d+/, m => {
            const guess = parseInt(m.groups[0]);
            if (guess === m.dialogData.num) {
                m.reply("You're right!");
                return m.endThisDialog({ result: "win" });
            }

            if (guess < m.dialogData.num )
                m.reply("That is too low.");
            else
                m.reply("That is too high.");

            if (--m.dialogData.guesses === 0) {
                m.reply("You are out of guesses");
                return m.endThisDialog({ result: "lose" });
            }
            
            m.reply(`You have ${m.dialogData.guesses} left.`);
        }),
    ),
);

import express = require('express');
import bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

import { RemoteRequest } from 'prague-botframework-browserbot';

app.post('/dialogs', (req, res) => {
    const body = req.body as RemoteRequest;
    switch (body.method) {
        case 'activate':
            console.log("activating", body);
            dialogs.remoteActivate(body.name, body.message, body.args)
                .do(response => console.log("response from activating", response))
                .subscribe(response => res.send(response));
            return;

        case 'tryMatch':
            console.log("tryMatch")
            dialogs.remoteTryMatch(body.name, body.instance, body.message)
                .do(response => console.log("response from tryMatch", response))
                .subscribe(response => res.send(response));
            return;
        
        default:
            console.log(`no such method ${(body as any).method}`);
            return;
    }
})

app.get('/test', (req, res) => {
    res.send("working!");
})

app.listen(9000, () => {
    console.log('listening');
});