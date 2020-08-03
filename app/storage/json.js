let path = require("path");
let fs = require("fs");

module.exports = class JSONStorage {
    #data = {};

    constructor() {
        this.type = "json";

        this.jsonPath = path.resolve(process.cwd(), process.env.JSON_STORAGE_PATH);
        if (!fs.existsSync(this.jsonPath)) fs.writeFileSync(this.jsonPath, "{}");
        let initData = fs.readFileSync(this.jsonPath, { encoding: "utf8" });
        try {
            let data = JSON.parse(initData);
            this.#data = data;
        } catch (_) {
            if (!fs.existsSync(this.jsonPath)) fs.writeFileSync(this.jsonPath, "{}");
            this.#data = {};
        }
    }

    async save() {
        if (!this.busy) {
            this.busy = true;
            await fs.promises.writeFile(this.jsonPath, JSON.stringify(this.#data, null, 2));
            this.busy = false;
        }
    }

    async reload() {
        if (!this.busy) {
            this.busy = true;
            let initData = await fs.promises.readFile(this.jsonPath);
            try {
                let data = JSON.parse(initData);
                this.#data = data;
            } catch (_) {
                if (!fs.existsSync(this.jsonPath)) fs.writeFileSync(this.jsonPath, "{}");
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
}