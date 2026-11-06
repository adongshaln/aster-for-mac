const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (id, ...args) {
  if (id.startsWith('@/')) id = path.join(root, 'src', id.slice(2))
  else if (id.startsWith('@shared/')) id = path.join(root, 'shared', id.slice(8))
  return originalResolve.call(this, id, ...args)
}
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    })
    module._compile(result.outputText, filename)
  }
}

module.exports = { root }
