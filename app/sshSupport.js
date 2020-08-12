let fs = require("fs");
let path = require("path");
let ssh2 = require("ssh2");
let crypto = require("crypto");
let repl = require("repl");
let util = require("util");
let Logging = require("./logging");
let { log } = new Logging("SSH");

const ANSI_CLEAR_LINE = "\x1B[2K";
const ANSI_CLEAR_SCREEN = "\x1B[2J\x1B[3J";
const ANSI_CURSOR_TOPLEFT = "\x1B[;H";
const ANSI_CARTIDGE_RETURN = "\x1B[0G";

global.sshTerminal = {};

class SSHInterface {
    shell = null;
    buffer = "";
    cols = 0;
    rows = 0;

    constructor(info, session) {
        this.info = info;
        this.session = session;
        session.once("shell", accept => {
            let shell = accept();
            log(`${info.ip}:${info.port} opened console.`);
            this.shell = shell;

            // Get ANSI color header based on config
            let redColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(0, 2), 16);
            let greenColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(2, 2), 16);
            let blueColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(4, 2), 16);
            if (
                isNaN(redColorValue) ||
                isNaN(greenColorValue) ||
                isNaN(blueColorValue)
            ) {
                redColorValue = 0;
                greenColorValue = 255;
                blueColorValue = 0;
            }
            let ANSI_COLOR_HEADER = `\x1B[38;2;${redColorValue};${greenColorValue};${blueColorValue}m`;

            this.replConsole = repl.start({
                prompt: `${ANSI_COLOR_HEADER}${info.ip}:${info.port}@c3c:js# `,
                terminal: true,
                useColors: true,
                breakEvalOnSigint: true,
                preview: true,
                useGlobal: true,
                completer: function completer(line) {
                    let cList = Object.keys(global);
                    let hits = cList.filter(c => c.startsWith(line));
                    return [hits.length ? hits : cList, hits.length === 1 ? hits[0] : line];
                },
                input: shell.stdin,
                output: shell.stdout
            });

            // Now listen for commands
            let ocr = this.replConsole.eval.clone();
            this.replConsole.eval = function evaluate(cmd, context, filename, callback) {
                ocr.call(global.replConsole, cmd, context, filename, function c(err, value) {
                    if (!err || !(err instanceof repl.Recoverable)) {
                        let e = cmd.replace(/(\r\n|\n|\r)$/, "");
                        log(`${info.ip}:${info.port} issued a command:`, (e.split(/\r|\n|\r\n/g).length > 1 ? "\r\n" + e : e));
                        if (err) {
                            log(`${info.ip}:${info.port} << JavaScript execution failed:`, err);
                            callback(err);
                        } else {
                            log(`${info.ip}:${info.port} << JavaScript execution:`, value);
                        }
                    } else {
                        return callback(err, null);
                    }
                });
            }
        });

        session.once("pty", (accept, reject, screen) => {
            log(`${info.ip}:${info.port} created a terminal (size: ${screen.cols}x${screen.rows})`);
            this.cols = screen.cols;
            this.rows = screen.rows;
            accept();
        });

        session.once("window-change", (accept, reject, screen) => {
            log(`${info.ip}:${info.port} changed terminal size: ${this.cols}x${this.rows} => ${screen.cols}x${screen.rows})`);
            this.cols = screen.cols;
            this.rows = screen.rows;
            if (this.shell) {
                this.shell.stdout.write(
                    ANSI_CLEAR_SCREEN +
                    ANSI_CURSOR_TOPLEFT +
                    this.buffer
                );
            }
            if (this.replConsole) {
                this.replConsole.prompt(true);
            }
            accept();
        });
    }

    log(isPlugin, currentTimeHeader, prefix, ...val) {
        // Get ANSI color header based on config
        let redColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(0, 2), 16);
        let greenColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(2, 2), 16);
        let blueColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(4, 2), 16);
        if (
            isNaN(redColorValue) ||
            isNaN(greenColorValue) ||
            isNaN(blueColorValue)
        ) {
            redColorValue = 0;
            greenColorValue = 255;
            blueColorValue = 0;
        }
        let ANSI_COLOR_HEADER = `\x1B[38;2;${redColorValue};${greenColorValue};${blueColorValue}m`;

        // Format values to string
        let colorFormat = "";
        for (let value of val) {
            if (typeof value == "object") {
                colorFormat += " " + util.formatWithOptions({
                    colors: true
                }, "%O", value);
            } else {
                colorFormat += " " + util.formatWithOptions({
                    colors: true
                }, "%s", value);
            }
        }

        let d = (
            ANSI_CLEAR_LINE +
                ANSI_CARTIDGE_RETURN +
                ANSI_COLOR_HEADER +
                `[${currentTimeHeader}] ` +
                isPlugin ? "[PLUGIN] " : "" +
                `[${prefix}]` +
                colorFormat +
                "\r\n"
        );

        this.buffer += d;
        // Limit the buffer to 3000 character.
        this.buffer = this.buffer.slice(-3000);
        if (this.shell) this.shell.stdout.write(d);
        if (this.replConsole) this.replConsole.prompt(true);
    }
}

let hostKey = {};
let hostKeyLoadedFromFile = false;
let hostKeyLocation = path.join(process.cwd(), process.env.SSH_HOSTKEY_PATH);
if (fs.existsSync(hostKeyLocation)) {
    try {
        let data = fs.readFileSync(hostKeyLocation, { encoding: "utf8" });
        hostKey = JSON.parse(data);
        hostKeyLoadedFromFile = true;
    } catch (_) {
        log("Invalid hostkey file specified (not a valid JSON file)");
    }
}
if (!hostKeyLoadedFromFile) {
    log("Generating a new hostkey...");
    hostKey = crypto.generateKeyPairSync("rsa", {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: "spki",
            format: "pem"
        },
        privateKeyEncoding: {
            type: "pkcs1",
            format: "pem"
        }
    });
    fs.writeFileSync(hostKeyLocation, JSON.stringify(hostKey));
}

let server = new ssh2.Server({
    hostKeys: [hostKey.privateKey]
});
global.ssh2Server = server;

server.on("listening", () => {
    let a = server.address();
    log(`Started listening for SSH connection on ${a.address}:${a.port}`);
});

server.on("error", e => {
    log("SSH2 server encountered an error!", e);
});

server.on("connection", (client, info) => {
    log(`${info.ip}:${info.port} connected to SSH interface (client ${info.header.versions.software}).`);
    client
        .on("authentication", auth => {
            if (auth.username !== process.env.SSH_USERNAME) {
                log(`${info.ip}:${info.port} failed to authenticate (wrong username).`);
                auth.reject(["password"]);
            }

            switch (auth.method) {
                case "password":
                    if (auth.password === process.env.SSH_PASSWORD) {
                        log(`${info.ip}:${info.port} logged in.`);
                        return auth.accept();
                    }
                    return auth.reject(["password"]);
                case "none":
                    return auth.reject(["password"]);
                default:
                    log(`${info.ip}:${info.port} failed to authenticate (unsupported method).`);
                    return auth.reject(["password"]);
            }
        })
        .once("ready", () => {
            client.once("session", accept => {
                let session = accept();
                global.sshTerminal[`${info.ip}:${info.port}`] = new SSHInterface(info, session);
            })
        })
        .on("error", e => {
            log(`Error detected on connection to ${info.ip}:${info.port}:`, e);
            client.end();
            client.removeAllListeners();
            if (global.sshTerminal[`${info.ip}:${info.port}`]) {
                global.sshTerminal[`${info.ip}:${info.port}`].session.removeAllListeners();
                delete global.sshTerminal[`${info.ip}:${info.port}`];
            }
        })
        .on("close", () => {
            try {
                client.removeAllListeners();
                if (global.sshTerminal[`${info.ip}:${info.port}`]) {
                    try {
                        global.sshTerminal[`${info.ip}:${info.port}`].session.removeAllListeners();
                    } catch (_) { }
                    delete global.sshTerminal[`${info.ip}:${info.port}`];
                }
            } catch (_) { }
        });
});
