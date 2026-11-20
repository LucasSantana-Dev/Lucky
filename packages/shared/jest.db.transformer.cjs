// ts-jest compiles to CommonJS, where `import.meta` is a syntax error. The unit
// specs never hit it because they mock prismaClient; the database specs load
// the real client, so rewrite `import.meta.url` to its CommonJS equivalent
// before handing the source to ts-jest.
const { default: tsJest } = require('ts-jest')

const IMPORT_META_URL = /\bimport\.meta\.url\b/g
const CJS_FILE_URL = "require('node:url').pathToFileURL(__filename).href"

const rewrite = (source) => source.replace(IMPORT_META_URL, () => CJS_FILE_URL)

module.exports = {
  createTransformer(options) {
    const inner = tsJest.createTransformer(options)
    return {
      process: (source, path, transformOptions) =>
        inner.process(rewrite(source), path, transformOptions),
      getCacheKey: (source, path, transformOptions) =>
        inner.getCacheKey(rewrite(source), path, transformOptions),
    }
  },
}
