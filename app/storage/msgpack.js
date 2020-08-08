let msgpack = require("msgpack5")();
let path = require("path");
let fs = require("fs");

// Adding BigInt (object) support in MessagePack
msgpack = msgpack.registerEncoder(
    bigInt => global.getType(bigInt) === "BigInt",
    // Encoder...
    bint => {
        console.log(bint);
        let negativeNumber = bint < 0n; // Check if that BigInt is negative
        let wBInt = bint;
        if (negativeNumber) wBInt *= -1n; // And then turn that BigInt to positive...
        wBInt = (wBInt << 1n) | (negativeNumber ? 1n : 0n); // Adding negative flag to last bit...
        let hexString = wBInt.toString(16); // Converting it to hex...
        hexString = "7f" + hexString.padStart(hexString.length + (hexString.length % 2), "0"); // Padding
        // Now convert the string to a buffer. 
        return Buffer.from(hexString, "hex");
    }
);
msgpack = msgpack.registerDecoder(
    127,
    // Decoder...
    buf => {
        console.log(buf);
        let hexString = buf.toString("hex"); // Reconstructing the hexString
        let wBInt = BigInt(`0x${hexString}`); // And the BigInt object itself... 
        let negativeNumber = wBInt & 1n; // Check if negative or not. 
        wBInt = wBInt >> 1n; // And then discarding the negative bit. 
        return wBInt *= negativeNumber ? -1n : 1n; // And the BigInt object itself...
    }
);
let oEncode = msgpack.encode.clone();
msgpack.encode = function encode(obj) {
    let compatibleObject = JSON.parse(JSON.stringify(obj), (key, value) => {
        if (typeof value === "bigint") {
            return Object(value);
        }
        return value;
    });
    return oEncode(compatibleObject);
}

module.exports = class MessagePackStorage {
    #data = {};

    constructor() {
        this.type = "msgpack";

        this.dataPath = path.resolve(process.cwd(), process.env.MSGPACK_STORAGE_PATH);
        if (!fs.existsSync(this.dataPath)) fs.writeFileSync(this.dataPath, "\x80");
        let initData = fs.readFileSync(this.dataPath);
        try {
            let data = msgpack.decode(initData);
            this.#data = data;
        } catch (_) {
            if (!fs.existsSync(this.dataPath)) fs.writeFileSync(this.dataPath, "\x80");
            this.#data = {};
        }
    }

    async save() {
        if (!this.busy) {
            this.busy = true;
            await fs.promises.writeFile(this.dataPath, msgpack.encode(this.#data));
            this.busy = false;
        }
    }

    async reload() {
        if (!this.busy) {
            this.busy = true;
            let initData = await fs.promises.readFile(this.dataPath);
            try {
                let data = msgpack.decode(initData);
                this.#data = data;
            } catch (_) {
                if (!fs.existsSync(this.dataPath)) fs.writeFileSync(this.dataPath, "\x80");
                this.#data = {};
            }
            this.busy = false;
        }
    }

    async get(table = "default", key) {
        if (global.getType(this.#data[table]) !== "Object") {
            this.#data[table] = {};
            await this.save();
        }

        return this.#data[table][key];
    }

    async set(table = "default", key, value) {
        if (global.getType(this.#data[table]) !== "Object") {
            this.#data[table] = {};
        }

        this.#data[table][key] = value;
        await this.save();
    }

    async remove(table = "default", key) {
        if (global.getType(this.#data[table]) !== "Object") {
            this.#data[table] = {};
        }

        let status = delete this.#data[table][key];
        await this.save();
        return status;
    }

    async removeTable(table = "default") {
        await this.reload();
        if (global.getType(this.#data[table]) !== "Object") {
            return true;
        }

        let status = delete this.#data[table];
        await this.save();
        return status;
    }

    async getTable(table = "default") {
        await this.reload();
        if (global.getType(this.#data[table]) !== "Object") {
            this.#data[table] = {};
            await this.save();
        }

        return this.#data[table];
    }
}