let Discord = require("discord.js");
let Logger = require("../logging");

module.exports = class DiscordInterface {
    #log = () => { };
    #commandHandler = () => { };
    ready = false;
    type = "Discord";
    accountID = "0";
    accountName = "null#0000";
    idHeader = "DC";
    destroyed = false;
    lastError = null;
    lastErrorTimestamp = 0;

    constructor(commandHandler, id, loginInfo) {
        let { log } = new Logger(`Discord | ${Number(id)}`);
        this.#log = log;
        this.#commandHandler = commandHandler;
        this.id = Number(id);
        this.client = new Discord.Client();
        this.client.login(loginInfo.token);

        this.client.on("ready", () => {
            this.ready = true;
            this.#log(`Logged in as ${this.client.user.tag}${this.client.user.verified ? " (Verified)" : ""}`);
            this.accountID = this.client.user.id;
            this.accountName = this.client.user.tag;

            commandHandler("interfaceUpdate", { id, ready: true, rawClient: this });
        });

        this.client.on("message", msg => {
            commandHandler("commandExec", {
                id,
                rawClient: this, 
                rawMessage: msg,
                data: {
                    body: msg.content,
                    mentions: msg.mentions,
                    attachments: msg.attachments,
                    author: msg.author.id,
                    messageID: msg.id,
                    isBot: msg.author.bot,
                    noResolve: msg.author.bot || msg.system
                }
            });
        });

        this.client.on("error", e => {
            this.lastError = e;
            this.lastErrorTimestamp = Date.now();
            this.#log("Error:", e);
            this.ready = false;

            commandHandler("interfaceUpdate", { id, ready: false, rawClient: this });
        });
    }

    destroy() {
        this.client.removeAllListeners();
        this.client.destroy();
        this.ready = false;
        this.#commandHandler("interfaceUpdate", { id: this.id, ready: false, rawClient: this });
    }
}