const { getDefaultConfig } = require('expo/metro-config');

// The rules live in @blitz/core, a sibling package: Metro has to watch it too.
const config = getDefaultConfig(__dirname);
config.watchFolders = [require('path').resolve(__dirname, '../..')];
module.exports = config;
