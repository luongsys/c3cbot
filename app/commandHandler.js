let fs = require("fs");
let path = require("path");
let Logging = require("./logging");
let logger = new Logging("InterfaceHandler");

global.getType(global.interfaceList) !== "Array" ? global.interfaceList = [] : "";

let accountDataPath = path.join(process.cwd(), ".data", "accountData.json");
let accountData = [];
if (!fs.existsSync(accountDataPath)) {
    fs.writeFileSync(accountDataPath, "[]");
} else {
    let rawAccountData = fs.readFileSync(accountDataPath, { encoding: "utf8" });
    try {
        let parsedAccountData = JSON.parse(rawAccountData);
        if (global.getType(parsedAccountData) !== "Array") throw null;
        if (!parsedAccountData.every(v => global.getType(v) === "Object")) throw null;
        accountData = parsedAccountData;
    } catch (_) {
        fs.writeFileSync(accountDataPath, "[]");
    }
}

for (let iID in accountData) {
    try {
        let Resolver = require(path.join(process.cwd(), "app", "interface", String(accountData[iID].handler)));
        global.interfaceList.push(new Resolver(async function commandHandler(eventType, data) {
            switch (eventType) {
                case "interfaceUpdate":
                    if (data.ready) {
                        logger.log(`Interface ${data.id} logged in as ${data.rawClient.accountName} (${data.rawClient.accountID})`);
                    }
                    logger.log(`Interface ${data.id} is ${data.ready ? "now ready." : "no longer ready."}`);
                    for (let s of global.plugins.pluginScope) {
                        if (
                            global.getType(s.onInterfaceUpdate) === "Function" ||
                            global.getType(s.onInterfaceUpdate) === "AsyncFunction"
                        ) {
                            try {
                                s.onInterfaceUpdate({
                                    id: data.id,
                                    type: data.rawClient.type,
                                    ready: data.ready,
                                    interfaceList: global.interfaceList
                                });
                            } catch (_) {}
                        }
                    }
                    break;
                case "commandExec":
                    break;
                default:
                    logger.log(`Interface ${data.id} return an invalid event "${eventType}" (data: ${data.data}).`);
            }
        }, iID, accountData[iID].loginInfo));

        for (let s of global.plugins.pluginScope) {
            if (
                global.getType(s.onInterfaceUpdate) === "Function" ||
                global.getType(s.onInterfaceUpdate) === "AsyncFunction"
            ) {
                try {
                    s.onInterfaceUpdate({
                        id: iID,
                        type: global.interfaceList[iID].type,
                        ready: global.interfaceList[iID].ready,
                        interfaceList: global.interfaceList
                    });
                } catch (_) {}
            }
        }
    } catch (_) {
        logger.log(`Interface ${iID} point to non-existing handler "${accountData[iID].handler}".`);
        global.interfaceList.push(null);
    }
}
