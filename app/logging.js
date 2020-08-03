let path = require("path");
let fs = require("fs");
let util = require("util");

module.exports = class Logging {
    #prefix = "INTERNAL";
    #fileLogParams = {
        fileSplit: 0,
        date: 1,
        month: 1,
        year: 1970
    };

    constructor(prefix = "INTERNAL") {
        this.#prefix = String(prefix);
    }

    log(...val) {
        // Get logging time
        let currentTime = new Date();
        // Format the current time. 
        let currentTimeHeader = currentTime.toISOString();

        // Get ANSI color header based on config
        let redColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(0, 2));
        let greenColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(2, 2));
        let blueColorValue = parseInt(process.env.CONSOLE_LOG_COLOR.substr(4, 2));
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
        process.stdout.write(
            ANSI_COLOR_HEADER +
            `[${currentTimeHeader}] ` +
            `[${this.#prefix}]` +
            colorFormat
        );

        // Log to a file
        global.ensureExists(path.join(process.cwd(), "logs")); // Ensure that ./logs directory exists.
        let searchFileSplit = false;
        if (this.#fileLogParams.date !== currentTime.getUTCDate()) {
            this.#fileLogParams.date = currentTime.getUTCDate();
            this.#fileLogParams.fileSplit = 0;
            searchFileSplit = true;
        }
        if (this.#fileLogParams.month !== currentTime.getUTCMonth() + 1) {
            this.#fileLogParams.month = currentTime.getUTCMonth() + 1;
            this.#fileLogParams.fileSplit = 0;
            searchFileSplit = true;
        }
        if (this.#fileLogParams.year !== currentTime.getUTCFullYear()) {
            this.#fileLogParams.year = currentTime.getUTCFullYear();
            this.#fileLogParams.fileSplit = 0;
            searchFileSplit = true;
        }
        if (searchFileSplit) {
            for (; ;) {
                if (!fs.existsSync(path.join(
                    process.cwd(),
                    "logs-" +
                    this.#fileLogParams.date +
                    "-" +
                    this.#fileLogParams.month +
                    "-" +
                    this.#fileLogParams.year +
                    "-" +
                    this.#fileLogParams.fileSplit +
                    ".log"
                )) && !fs.existsSync(path.join(
                    process.cwd(),
                    "logs-" +
                    this.#fileLogParams.date +
                    "-" +
                    this.#fileLogParams.month +
                    "-" +
                    this.#fileLogParams.year +
                    "-" +
                    this.#fileLogParams.fileSplit +
                    ".log.gz"
                ))) break;
                this.#fileLogParams.fileSplit++;
            }
        }
        fs.appendFileSync(
            path.join(
                process.cwd(),
                "logs-" +
                this.#fileLogParams.date +
                "-" +
                this.#fileLogParams.month +
                "-" +
                this.#fileLogParams.year +
                "-" +
                this.#fileLogParams.fileSplit +
                ".log"
            ),
            `[${currentTimeHeader}] ` +
            `[${this.#prefix}]` +
            nonColorFormat
        );

        // Future-proof. SSH logging.
        if (global.getType(global.sshTerminal) === "Object") {
            for (let ip in global.sshTerminal) {
                // Get the SSH terminal instance to log. 
                global.sshTerminal[ip].log.call(global.sshTerminal[ip], [currentTimeHeader, this.#prefix, ...val]);
            }
        }
    }
};
