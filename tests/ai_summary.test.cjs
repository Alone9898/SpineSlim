const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const typescript = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../frontend/src/ai/summary.ts'), 'utf8');
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const moduleValue = { exports: {} };
vm.runInNewContext(compiled, { module: moduleValue, exports: moduleValue.exports });
const { buildAuditSummary } = moduleValue.exports;

test('default AI summary excludes paths, names and evidence', () => {
  const report = {
    rootName: 'private-project', totalFiles: 2, totalSize: 500, status: 'partial',
    uncheckedFiles: [{ file: 'secret.sk el', reason: 'unreadable' }], rules: [{ ruleId: 'R04', status: 'issues' }],
    issues: [{ ruleId: 'R04', code: 'atlas_missing_page', severity: 'critical', files: ['private/path/hero.atlas'], evidence: ['missing page: tubiao.png', 'C:\\Users\\private\\secret.png'] }],
  };
  const summary = buildAuditSummary(report, false);
  assert.match(summary, /atlas_missing_page/);
  assert.equal(JSON.parse(summary).findings[0].issueCount, 1);
  assert.ok(!('count' in JSON.parse(summary).findings[0]));
  for (const privateValue of ['private-project', 'secret.sk el', 'private/path', 'tubiao.png', 'secret.png']) {
    assert.ok(!summary.includes(privateValue));
  }
  const detailed = buildAuditSummary(report, true);
  assert.match(detailed, /private\/path\/hero.atlas/);
  assert.match(detailed, /missing page: tubiao.png/);
  assert.ok(!detailed.includes('secret.png'));
});
