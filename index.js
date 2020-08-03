let fs = require("fs");
let path = require("path");

global = {
    ...require("./app/classModifier"),
    ...global
};

if (!fs.existsSync(path.join(__dirname, ".env"))) {
    fs.copyFileSync(path.join(__dirname, ".env.example"), path.join(__dirname, ".env"), 0o660);
}
let customEnv = require('custom-env');
customEnv.env();

global.ensureExists(path.join(__dirname, ".data"));

let centralData = new (require("./app/storage/" + process.env.CENTRAL_STORAGE_TYPE))(__dirname);
