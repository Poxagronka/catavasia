// esbuild inject (esbuild.js): import.meta.url for ESM code in the CJS bundles.
export const importMetaUrl = require('url').pathToFileURL(__filename).href;
