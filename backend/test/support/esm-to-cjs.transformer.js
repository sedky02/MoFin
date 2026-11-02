/**
 * Jest transform for ESM-only packages in node_modules (jose 6), so the
 * CommonJS test runtime can load them. The built app doesn't need this: Node
 * (>= 20.19 / 22.12) loads ESM through require() natively, but Jest's module
 * loader doesn't.
 *
 * Not ts-jest: it caches one compiler per Jest project, so a second ts-jest
 * entry with its own options (allowJs, ES2022) is silently ignored. ES2022 is
 * needed to keep jose's class fields native; lower targets move them into the
 * constructor before `super()` and break its error classes.
 */
const { createHash } = require('crypto');
const ts = require('typescript');

const compilerOptions = {
  allowJs: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
};

module.exports = {
  process(sourceText, sourcePath) {
    const { outputText } = ts.transpileModule(sourceText, {
      compilerOptions,
      fileName: sourcePath,
    });
    return { code: outputText };
  },
  getCacheKey(sourceText, sourcePath) {
    return createHash('sha256')
      .update(ts.version)
      .update(JSON.stringify(compilerOptions))
      .update(sourcePath)
      .update(sourceText)
      .digest('hex');
  },
};
