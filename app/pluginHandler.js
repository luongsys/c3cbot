global.plugins = {
    loadedPlugins: [],
    pluginScope: {},
    zipHandler: {}
};

let AdmZip = require("adm-zip");

let loadPlugin = async function loadPlugin(file) {
    
}

let unloadPlugin = async function unloadPlugin(name) {
    let index = global.plugins.loadedPlugins.findIndex(v => v.name === name);
    if (index + 1) {
        let scopeName = global.plugins.loadedPlugins[index].scopeName;
        let scope = global.plugins.pluginScope[scopeName];
        if (global.getType(scope.onUnload) === "Function") {
            try {
                scope.onUnload();
            } catch (_) {}
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
    unloadPlugin
}