let fs = require("fs");
let path = require("path");

/**
 * Get the type of a value
 *
 * @param   {any}     val  A value
 *
 * @return  {string}       The type of that value (String/Number/BigInt/Array/Object/...)
 */
let getType = function getType(val) {
    return Object.prototype.toString.call(val).slice(8, -1);
}

/**
 * Make sure that the path exists.
 *
 * @param   {string}  path  The path
 * @param   {number}  mask  Mask
 *
 * @return  {object}        Return an object when the path already exists. (as error)
 */
let ensureExists = function ensureExists(path, mask) {
    if (typeof mask != "number") {
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

/**
 * Find every file in a directory
 *
 * @param   {string}    startPath        A path specify where to start.
 * @param   {RegExp}    filter           Regex to filter results.
 * @param   {boolean}   arrayOutput      Options: Output array or send to callback?
 * @param   {boolean}   recursive        Options: Recursive or not?
 * @param   {function}  [callback]       Callback function.
 *
 * @return  {(Array<String>|undefined)}  An array contains path of every files match regex.
 */
let findFromDir = function findFromDir(startPath, filter, arrayOutput, recursive, callback) {
    var nocallback = false;
    if (!callback) {
        callback = function () { };
        nocallback = true;
    }
    if (!fs.existsSync(startPath)) {
        throw "No such directory: " + startPath;
    }
    var files = fs.readdirSync(startPath);
    var arrayFile = [];
    for (var i = 0; i < files.length; i++) {
        var filename = path.join(startPath, files[i]);
        var stat = fs.lstatSync(filename);
        if (stat.isDirectory() && recursive) {
            var arrdata = findFromDir(filename, filter, true, true);
            if (!nocallback && !arrayOutput) {
                for (var n in arrdata) {
                    callback(path.join(filename, arrdata[n]));
                }
            } else {
                arrayFile = arrayFile.concat(arrdata);
            }
        } else {
            if (!arrayOutput && !nocallback) {
                if (filter.test(filename)) callback(filename);
            } else {
                if (filter.test(filename)) arrayFile[arrayFile.length] = filename;
            }
        }
    }
    if (arrayOutput && !nocallback) {
        callback(arrayFile);
    } else if (arrayOutput) {
        return arrayFile;
    }
}

// Adding clone function in Function prototype
Function.prototype.clone = function () {
    var that = this;
    var temp = function clonedFunction(...args) {
        return that.apply(this, args);
    }
    for (var key in this) {
        if (Object.prototype.hasOwnProperty.call(this, key)) {
            temp[key] = this[key];
        }
    }
    return temp;
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

module.exports = { getType, ensureExists, findFromDir };
