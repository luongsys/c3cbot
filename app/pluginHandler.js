let AdmZip = require("adm-zip");
let fs = require("fs");
let semver = require("semver");

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
        let pluginInfo = zip.getEntry("plugins.json");
        let newRootDIR = "";
        if (!pluginInfo) {
            let zipEntries = zip.getEntries();
            newRootDIR = zipEntries.reduce((a, v) => {
                let r = v.split("/")[0];
                if (!a) return r;
                if (a === r) return r;
                return 9;
            });
            if (newRootDIR === 9) throw new LoadPluginError("plugins.json file not found", { errorCode: 2 });
            pluginInfo = zip.getEntry(`${newRootDIR}/plugins.json`);
            if (!pluginInfo) throw new LoadPluginError("plugins.json file not found", { errorCode: 2 });
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
    } else {
        throw "No such file or directory."
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
        for (let cmd in global.cmdList) {
            if (global.cmdList[cmd].scope === scopeName) {
                delete global.cmdList[cmd];
            }
        }
        for (let pl of global.plugins.loadedPlugins) {
            if (pl.dep.indexOf(name) + 1) await unloadPlugin(pl.name);
        }
    } else {
        throw "There's no plugin with that name.";
    }
}

module.exports = {
    loadPlugin,
    unloadPlugin,
    LoadPluginError
}