/**
 * Get the type of a value
 *
 * @param   {any}     val  A value
 *
 * @return  {string}       The type of that value (String/Number/BigInt/Array/Object/...)
 */
let getType = function getType(val) {
    return Object.prototype.toString.call(arg).slice(8, -1);
}

let ensureExists = function ensureExists(path, mask) {
    if (typeof mask != 'number') {
        mask = 0o777;
    }
    try {
        fs.mkdirSync(path, {
            mode: mask,
            recursive: true
        });
        return;
    } catch (ex) {
        return {
            err: ex
        };
    }
}

// Adding BigInt support in JSON (de)serialization
BigInt.prototype.toJSON = function () {
    return this.toString() + "n";
}
let ogStringify = JSON.stringify.clone();
JSON.stringify = function stringifyWithBigInt(obj, reviver, spaces) {
    function r(key, value) {
        if (global.getType(value) == "BigInt") {
            value = value.toString() + "n";
        }
        if (global.getType(reviver) == "Function") {
            value = reviver(key, value);
        }
        return value;
    }
    return ogStringify(obj, r, spaces);
}
let ogParse = JSON.parse.clone();
JSON.parse = function parseWithBigInt(jsonString, reviver) {
    function r(key, value) {
        if (global.getType(value) == "String" && (/^\d+n$/).test(value)) {
            value = BigInt(value.slice(0, -1));
        }
        if (global.getType(reviver) == "Function") {
            value = reviver(key, value);
        }
        return value;
    }
    return ogParse(jsonString, r);
}

module.exports = { getType, ensureExists };
