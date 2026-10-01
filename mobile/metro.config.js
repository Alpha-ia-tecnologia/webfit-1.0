// Metro do app nativo WebFit.
// A lógica de negócio (tipos, metas, seringa, questionário) continua em ../src, compartilhada com o app web.
// Arquivos de ../src resolvem pacotes (ex.: zod) a partir de node_modules deste app, nunca do projeto web.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "..", "src");
const anchor = path.join(projectRoot, "package.json");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
// expo-sqlite (kv-store) carrega wa-sqlite.wasm quando roda no navegador.
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, "wasm"])];

const isBare = (name) =>
  !name.startsWith(".") && !name.startsWith("/") && !path.isAbsolute(name);
const isShared = (file) =>
  path.resolve(file).toLowerCase().startsWith(sharedRoot.toLowerCase());

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next =
    isShared(context.originModulePath) && isBare(moduleName)
      ? { ...context, originModulePath: anchor }
      : context;
  return upstream
    ? upstream(next, moduleName, platform)
    : next.resolveRequest(next, moduleName, platform);
};

module.exports = config;
