const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const typescript = require('typescript');

function loadTelemetry() {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/telemetry.ts'), 'utf8')
    .replaceAll('import.meta.env', 'testEnv');
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText;
  const events = [];
  const storage = new Map();
  const exports = {};
  const context = {
    exports,
    testEnv: { PROD: true, VITE_POSTHOG_KEY: 'test-key', VITE_POSTHOG_HOST: 'https://us.i.posthog.com' },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    crypto: { randomUUID: () => 'anonymous-id' },
    navigator: { languages: ['en-US'] },
    Intl,
    Date,
    fetch: (_url, options) => { events.push(JSON.parse(options.body)); return Promise.reject(new Error('offline')); },
  };
  vm.runInNewContext(compiled, context);
  return { telemetry: exports, events, storage };
}

test('analytics starts enabled even when a prior session saved it off', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/types.ts'), 'utf8');
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports });
  assert.equal(exports.defaults.anonymous_telemetry, true);
  assert.equal(exports.hydrate({}).anonymous_telemetry, true);
  assert.equal(exports.hydrate({ anonymous_telemetry: false }).anonymous_telemetry, true);
});

test('one start and one terminal event share an operation ID', () => {
  const { telemetry, events } = loadTelemetry();
  const { TelemetryModule: module, TelemetryAction: action } = telemetry;
  telemetry.configureTelemetry(true, 'test-version');
  telemetry.beginOperation('task-1', module.AudioProcessing, action.AudioBatch, 12);
  telemetry.beginOperation('task-1', module.AudioProcessing, action.AudioBatch, 12);
  telemetry.updateOperation('task-1', 'audio.processing', undefined, 'audio.file');
  telemetry.finishOperation('task-1', 'error');
  telemetry.finishOperation('task-1', 'success');
  assert.deepEqual(events.map(item => item.event), ['process_start', 'process_error']);
  assert.equal(events[0].properties.operation_id, events[1].properties.operation_id);
  assert.equal(events[1].properties.file_count_bucket, '11_to_100');
  assert.equal(events[1].properties.error_code, 'audio.file');
  assert.equal(events[1].properties.stage, 'audio.processing');
  assert.equal(events[0].distinct_id, events[1].distinct_id);
});

test('unknown worker errors are reduced to safe enums', () => {
  const { telemetry, events } = loadTelemetry();
  telemetry.configureTelemetry(true, 'test-version');
  telemetry.beginOperation('task-2', telemetry.TelemetryModule.AssetProcessing, telemetry.TelemetryAction.Spine);
  telemetry.updateOperation('task-2', 'C:/private/file.png', undefined, 'secret path and stack');
  telemetry.finishOperation('task-2', 'error');
  assert.equal(events[1].properties.error_code, 'unexpected');
  assert.equal(events[1].properties.stage, 'unknown');
  assert.doesNotMatch(JSON.stringify(events), /private|secret path/);
});

test('opt-out clears the ID and stops later events', () => {
  const { telemetry, events, storage } = loadTelemetry();
  telemetry.configureTelemetry(true, 'test-version');
  telemetry.beginOperation('task-3', telemetry.TelemetryModule.AssetProcessing, telemetry.TelemetryAction.Ui);
  telemetry.configureTelemetry(false, 'test-version');
  telemetry.finishOperation('task-3', 'success');
  telemetry.trackFeature(telemetry.TelemetryModule.Settings, telemetry.TelemetryAction.CheckTools);
  assert.equal(events.length, 1);
  assert.equal(storage.size, 0);
});

test('file counts are bucketed without sending exact counts', () => {
  const { telemetry, events } = loadTelemetry();
  telemetry.configureTelemetry(true, 'test-version');
  telemetry.beginOperation('task-4', telemetry.TelemetryModule.AtlasPacker, telemetry.TelemetryAction.ExportAtlas);
  telemetry.updateOperation('task-4', 'copying', 101);
  telemetry.finishOperation('task-4', 'success');
  assert.equal(events[0].properties.file_count_bucket, 'unknown');
  assert.equal(events[1].properties.file_count_bucket, 'over_100');
  assert.equal(events[1].properties.error_code, undefined);
});
