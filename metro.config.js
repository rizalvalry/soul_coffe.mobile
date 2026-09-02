// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

/**
 * Drop the unused MaterialSymbols font family from the bundle (963 KB in res/raw).
 * See stubs/material-symbols-font.js for the full rationale and the invariant that
 * makes this safe. Scoped to this one package so nothing else can match by accident.
 */
const MATERIAL_SYMBOLS_FONT = /^@expo-google-fonts\/material-symbols(\/.*)?$/;
const FONT_STUB = path.resolve(__dirname, 'stubs/material-symbols-font.js');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (MATERIAL_SYMBOLS_FONT.test(moduleName)) {
    return { type: 'sourceFile', filePath: FONT_STUB };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
