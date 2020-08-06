let AdmZip = require("adm-zip");
let fs = require("fs");
let semver = require("semver");
let Logger = require("./logging");
let { log } = new Logger("PluginHandler");

class LoadPluginError extends Error {
    constructor(str, obj) {
        super(str);
        Object.assign(this, obj);
    }
}

global.plugins = {
    loadedPlugins: [],
    pluginScope: {},
    zipHandler: {},
    tempLoadPass2: []
};

global.commandMapping = {
    cmdList: [],
    aliases: {},
    hook: {}
};

let sortPass2 = function sortPass2() {
    let wait = global.plugins.tempLoadPass2;
    let waitx = [];
    for (let p of wait) {
        for (let pl in p.depends) {
            let index = waitx.findIndex(v => v.name === pl);
            let depIndex = wait.findIndex(v => v.name === pl)
            if (!(index + 1)) {
                if (!(depIndex + 1)) {
                    if (global.plugins.loadedPlugins.findIndex(v => v.name === pl) + 1) continue;
                    break;
                }
                waitx.push(wait[depIndex]);
            }
        }
        waitx.push(p);
    }
    waitx = waitx.filter((v, i, a) => {
        return a.indexOf(v) == i;
    });
}

let loadPlugin = async function loadPlugin(file, loadAll) {
    if (fs.existsSync(file)) {
        let zip = null;
        try {
            zip = new AdmZip(file);
        } catch (_) {
            throw new LoadPluginError("Invalid format (not a ZIP-compatible file)", { errorCode: 1 });
        }
        let pluginInfo = zip.readAsText("plugins.json");
        let newRootDIR = "";
        if (global.getType(pluginInfo) !== "String") {
            let zipEntries = zip.getEntries();
            newRootDIR = zipEntries.reduce((a, v) => {
                let r = v.name.split("/")[0];
                if (r.length === 0) return 9;
                if (!a) return r;
                if (a === r) return r;
                return 9;
            });
            if (newRootDIR === 9) throw new LoadPluginError("plugins.json file not found", { errorCode: 2 });
            pluginInfo = zip.readAsText(`${newRootDIR}/plugins.json`);
            if (global.getType(pluginInfo) !== "String") 
                throw new LoadPluginError("plugins.json file not found", { errorCode: 2 });
        }
        let pInfo = null;
        try {
            pInfo = JSON.parse(pluginInfo);
        } catch (e) {
            throw new LoadPluginError("Malformed JSON data in plugins.json.", { errorCode: 3 });
        }

        // Check for plugin parameters
        if (global.getType(pInfo.name) !== "String")
            throw new LoadPluginError("Plugin name must be a string.", { errorCode: 6 });
        if (global.getType(pInfo.execFile) !== "String")
            throw new LoadPluginError("Executable file path must be a string.", { errorCode: 7 });
        if (global.getType(pInfo.scopeName) !== "String")
            throw new LoadPluginError("Plugin scope name must be a string.", { errorCode: 8 });
        if (global.getType(pInfo.version) !== "String")
            throw new LoadPluginError("Version must be a string that are parsable using SemVer.", { errorCode: 11 });
        let pVersion = semver.parse(pInfo.version);
        if (!pVersion)
            throw new LoadPluginError("Version must be a string that are parsable using SemVer.", { errorCode: 11 });
        let existingPluginIndex = global.plugins.loadedPlugins.findIndex(v => v.name === pInfo.name);
        if (existingPluginIndex + 1)
            throw new LoadPluginError("Plugin name conflicts with loaded plugins.", {
                errorCode: 9,
                existingPluginPath: global.plugins.loadedPlugins[existingPluginIndex].url
            });
        existingPluginIndex = global.plugins.loadedPlugins.findIndex(v => v.scopeName === pInfo.scopeName);
        if (existingPluginIndex + 1)
            throw new LoadPluginError("Plugin scope name conflicts with loaded plugins.", {
                errorCode: 10,
                existingPluginPath: global.plugins.loadedPlugins[existingPluginIndex].url
            });

        // Check for depends, if missing then add to pass 2
        if (global.getType(pInfo.depends) === "Object") {
            for (let dPlName in pInfo.depends) {
                let indexDPlName = global.plugins.loadedPlugins.findIndex(v => v.name === dPlName);
                let version = pInfo.depends[dPlName];
                if (indexDPlName + 1) {
                    let lVersion = global.plugins.loadedPlugins[indexDPlName];
                    // Plugin found, check the version next
                    if (!semver.satisfies(lVersion, String(version)))
                        throw new LoadPluginError(
                            `Expected version range ${String(version)} of "${dPlName}", instead got version ${lVersion}`,
                            {
                                errorCode: 5,
                                loadedVersion: lVersion,
                                requiredVersionRange: String(version),
                                pluginName: dPlName
                            }
                        );
                } else {
                    // Plugin isn't loaded or not found
                    if (loadAll) {
                        if (global.tempLoadPass2.findIndex(v => v.url !== file) === -1) {
                            global.tempLoadPass2.push({
                                url: file,
                                name: pInfo.name,
                                depends: pInfo.depends
                            });
                            sortPass2();
                        }
                        return { status: 1 };
                    } else {
                        throw new LoadPluginError(
                            `A required dependency for this plugin was not found. (${dPlName} [${version}])`,
                            {
                                errorCode: 4,
                                requiredVersionRange: String(version),
                                pluginName: dPlName
                            }
                        );
                    }
                }
            }
        }

        // Great, now execute the executable
        let resolvedExecPath = newRootDIR.length ? `${newRootDIR}/${pInfo.execFile}` : pInfo.execFile;
        let executable = zip.readAsText(resolvedExecPath);
        if (global.getType(executable) === "String") {
            try {
                let onLoad = global.requireFromString(executable, resolvedExecPath);
                if (
                    global.getType(onLoad) !== "Function" &&
                    global.getType(onLoad) !== "AsyncFunction"
                ) throw new LoadPluginError("module.exports of executable code is not a Function/AsyncFunction", {
                    errorCode: 14
                });

                // Add the fricking ZIP handler first
                global.plugins.zipHandler[pInfo.scopeName] = zip;

                let returnData = null;
                try {
                    returnData = await onLoad();
                    global.plugins.pluginScope[pInfo.scopeName] = returnData;
                } catch (ex) {
                    throw new LoadPluginError("Malformed JavaScript code in executable file.", {
                        errorCode: 13,
                        error: ex
                    });
                }

                if (
                    global.getType(returnData) === "Object" && 
                    global.getType(pInfo.defineCommand) === "Object"
                ) {
                    for (let cmd in pInfo.defineCommand) {
                        if (global.getType(pInfo.defineCommand[cmd].scope) !== "String") {
                            log(`${pInfo.name}: Command "${cmd}" is missing a parameter ("scope")`);
                            continue;
                        }
                        if (global.getType(pInfo.defineCommand[cmd].compatibly) !== "Array") {
                            log(`${pInfo.name}: Command "${cmd}" is missing a parameter ("compatibly")`);
                            continue;
                        }
                        if (
                            global.getType(global.plugins.pluginScope[pInfo.scopeName][pInfo.defineCommand[cmd].scope]) !== "Function" &&
                            global.getType(global.plugins.pluginScope[pInfo.scopeName][pInfo.defineCommand[cmd].scope]) !== "AsyncFunction"
                        ) {
                            log(`${pInfo.name}: Command "${cmd}" reference to non-existing function in scope ("${pInfo.defineCommand[cmd].scope}")`);
                            continue;
                        }
                        let conflictID = global.commandMapping.cmdList.findIndex(v => v === cmd);
                        let isConflict = Boolean(conflictID + 1);
                        let commandID = global.commandMapping.cmdList.push({
                            originalCMD: cmd,
                            namespacedCMD: `${pInfo.scopeName}:${cmd}`,
                            conflict: isConflict,
                            supportedPlatform: pInfo.defineCommand[cmd].compatibly,
                            scope: pInfo.scopeName,
                            exec: global.plugins.pluginScope[pInfo.scopeName][pInfo.defineCommand[cmd].scope]
                        });
                        if (!isConflict) {
                            global.commandMapping.aliases[cmd] = {
                                pointTo: commandID,
                                scope: pInfo.scopeName
                            };
                        }
                        global.commandMapping.aliases[`${pInfo.scopeName}:${cmd}`] = {
                            pointTo: commandID,
                            scope: pInfo.scopeName
                        };
                    }
                }
            } catch (ex) {
                throw new LoadPluginError("Malformed JavaScript code in executable file.", {
                    errorCode: 13,
                    error: ex
                })
            }
        } else throw new LoadPluginError(
            `Executable file not found (${resolvedExecPath})`,
            {
                errorCode: 12,
                resolvedExecPath
            }
        );
    } else {
        throw new LoadPluginError("File doesn't exist on that location.", { errorCode: 15 });
    }
}

let unloadPlugin = async function unloadPlugin(name) {
    let index = global.plugins.loadedPlugins.findIndex(v => v.name === name);
    if (index + 1) {
        let scopeName = global.plugins.loadedPlugins[index].scopeName;
        let scope = global.plugins.pluginScope[scopeName];
        if (global.getType(scope.onUnload) === "Function") {
            try {
                scope.onUnload();
            } catch (_) { }
        }
        for (let id in global.commandMapping.cmdList) {
            if (global.commandMapping.cmdList[id].scope === scopeName) {
                delete global.commandMapping.cmdList[id];
            }
        }
        for (let alias in global.commandMapping.aliases) {
            let cID = global.commandMapping.aliases[alias].pointTo;
            if (global.getType(global.commandMapping.cmdList[cID]) !== "Object") {
                log(`Alias "${alias}" no longer point to a valid command ID (${cID}). Deleting...`);
                delete global.commandMapping.aliases[alias];
            }
        }
        for (let pl of global.plugins.loadedPlugins) {
            if (pl.dep.indexOf(name) + 1) await unloadPlugin(pl.name);
        }
        delete global.plugins.pluginScope[scopeName];
        delete global.plugins.loadedPlugins[index];
        log("Unloaded plugin:", name);
    } else {
        throw new LoadPluginError("There's no plugin with that name.", { errorCode: 15 });
    }
}

module.exports = {
    loadPlugin,
    unloadPlugin,
    LoadPluginError
}