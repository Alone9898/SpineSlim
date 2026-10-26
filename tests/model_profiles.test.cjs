const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const typescript = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../frontend/src/types.ts'), 'utf8');
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });

test('saved DeepSeek default URL migrates without changing custom providers', () => {
  const models = [
    { id: 'deepseek', provider: 'deepseek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'custom', provider: 'custom', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  ];
  const settings = moduleExports.hydrate({ models, active_model: 'deepseek' });

  assert.equal(settings.models[0].base_url, 'https://api.deepseek.com');
  assert.equal(settings.models[1].base_url, 'https://api.deepseek.com/v1');
  assert.equal(settings.active_model, 'deepseek');
});
