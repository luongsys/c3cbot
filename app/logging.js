let path = require("path");
let fs = require("fs");
let util = require("util");
let os = require("os");

const ANSI_CLEAR_LINE = "\x1B[2K";
const ANSI_CARTIDGE_RETURN = "\x1B[0G";

global.ensureExists(path.join(process.cwd(), ".data", "logs"));

if (global.getType(global.fileLogParams) !== "Object") {
    global.fileLogParams = {
        fileSplit: 0,
        date: 1,
        month: 1,
        year: 1970
    }
}

module.exports = class Logging {
    #prefix = "INTERNAL";
    #isPlugin = false;

    constructor(prefix = "INTERNAL", isPlugin) {
        this.#prefix = String(prefix);
        this.#isPlugin = Boolean(isPlugin);
    }

    log(...val) {
        // Get logging time
        let currentTime = new Date();
        // Format the current time. 
        let currentTimeHeader = currentTime.toISOString();

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
        let nonColorFormat = "";
        for (let value of val) {
            if (typeof value == "object") {
                colorFormat += " " + util.formatWithOptions({
                    colors: true
                }, "%O", value);
                nonColorFormat += " " + util.formatWithOptions({
                    colors: false
                }, "%O", value);
            } else {
                colorFormat += " " + util.formatWithOptions({
                    colors: true
                }, "%s", value);
                nonColorFormat += " " + util.formatWithOptions({
                    colors: false
                }, "%s", value);
            }
        }

        // Log to the console
        if (global.getType(console.original) !== "Object") {
            process.stdout.write(
                ANSI_CLEAR_LINE + 
                ANSI_CARTIDGE_RETURN +
                ANSI_COLOR_HEADER +
                `[${currentTimeHeader}] ` +
                this.#isPlugin ? "[PLUGIN] " : "" +
                `[${this.#prefix}]` +
                colorFormat +
                os.EOL
            );
        } else {
            console.original.log(
                ANSI_CLEAR_LINE +
                ANSI_CARTIDGE_RETURN +
                ANSI_COLOR_HEADER +
                `[${currentTimeHeader}]`,
                this.#isPlugin ? "[PLUGIN] " : "" +
                `[${this.#prefix}]` +
                colorFormat
            );
        }
        
        
        // Rewriting the REPL prompt (if any)
        if (global.replConsole) global.replConsole.prompt(false);

        // Log to a file
        global.ensureExists(path.join(process.cwd(), "logs")); // Ensure that ./logs directory exists.
        let searchFileSplit = false;
        if (global.fileLogParams.date !== currentTime.getUTCDate()) {
            global.fileLogParams.date = currentTime.getUTCDate();
            global.fileLogParams.fileSplit = 0;
            searchFileSplit = true;
        }
        if (global.fileLogParams.month !== currentTime.getUTCMonth() + 1) {
            global.fileLogParams.month = currentTime.getUTCMonth() + 1;
            global.fileLogParams.fileSplit = 0;
            searchFileSplit = true;
        }
        if (global.fileLogParams.year !== currentTime.getUTCFullYear()) {
            global.fileLogParams.year = currentTime.getUTCFullYear();
            global.fileLogParams.fileSplit = 0;
            searchFileSplit = true;
        }
        if (searchFileSplit) {
            for (; ;) {
                if (!fs.existsSync(path.join(
                    process.cwd(),
                    ".data",
                    "logs",
                    "logs-" +
                    String(global.fileLogParams.date).padStart(2, "0") +
                    "-" +
                    String(global.fileLogParams.month).padStart(2, "0") +
                    "-" +
                    String(global.fileLogParams.year).padStart(4, "0") +
                    "-" +
                    global.fileLogParams.fileSplit +
                    ".log"
                )) && !fs.existsSync(path.join(
                    process.cwd(),
                    ".data",
                    "logs",
                    "logs-" +
                    String(global.fileLogParams.date).padStart(2, "0") +
                    "-" +
                    String(global.fileLogParams.month).padStart(2, "0") +
                    "-" +
                    String(global.fileLogParams.year).padStart(4, "0") +
                    "-" +
                    global.fileLogParams.fileSplit +
                    ".log.gz"
                ))) break;
                global.fileLogParams.fileSplit++;
            }
        }
        fs.appendFileSync(
            path.join(
                process.cwd(),
                ".data",
                "logs",
                "logs-" +
                String(global.fileLogParams.date).padStart(2, "0") +
                "-" +
                String(global.fileLogParams.month).padStart(2, "0") +
                "-" +
                String(global.fileLogParams.year).padStart(4, "0") +
                "-" +
                global.fileLogParams.fileSplit +
                ".log"
            ),
            `[${currentTimeHeader}] ` +
            this.#isPlugin ? "[PLUGIN] " : "" +
            `[${this.#prefix}]` +
            nonColorFormat +
            os.EOL
        );

        // Future-proof. SSH logging.
        if (global.getType(global.sshTerminal) === "Object") {
            for (let ip in global.sshTerminal) {
                // Get the SSH terminal instance to log. 
                global.sshTerminal[ip].log.call(global.sshTerminal[ip], [this.#isPlugin, currentTimeHeader, this.#prefix, ...val]);
            }
        }
    }
};
