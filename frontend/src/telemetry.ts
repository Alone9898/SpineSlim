export enum TelemetryEvent {
  AppOpened = 'app_open',
  ModuleOpened = 'module_open',
  ProcessingStarted = 'process_start',
  ProcessingSucceeded = 'process_success',
  ProcessingErrored = 'process_error',
  ProcessingCancelled = 'process_cancel',
  FeatureUsed = 'feature_use',
  AppErrored = 'app_error',
}

export enum TelemetryModule {
  App = 'app',
  SpineViewer = 'spine_viewer',
  RiveViewer = 'rive_viewer',
  ModelViewer = 'model_viewer',
  AtlasPacker = 'atlas_packer',
  AssetProcessing = 'asset_processing',
  AudioProcessing = 'audio_processing',
  Settings = 'settings',
}

export enum TelemetryAction {
  Open = 'open',
  Spine = 'spine',
  Ui = 'ui',
  Video = 'video',
  AudioBatch = 'audio_batch',
  AudioMerge = 'audio_merge',
  AudioSprite = 'audio_sprite',
  ScanAssets = 'scan_assets',
  PreviewAudio = 'preview_audio',
  ExportAtlas = 'export_atlas',
  ExportGif = 'export_gif',
  ExportMp4 = 'export_mp4',
  ExportSession = 'export_session',
  CheckTools = 'check_tools',
  CheckUpdate = 'check_update',
  PackageStats = 'package_stats',
}

export enum DurationBucket {
  UnderTenSeconds = 'under_10s',
  TenSecondsToOneMinute = '10s_to_1m',
  OneToFiveMinutes = '1m_to_5m',
  OverFiveMinutes = 'over_5m',
}

export enum FileCountBucket {
  Unknown = 'unknown',
  One = '1',
  TwoToTen = '2_to_10',
  ElevenToHundred = '11_to_100',
  OverHundred = 'over_100',
}

export enum TelemetryErrorCode {
  Unexpected = 'unexpected',
  WorkerExit = 'worker_exit',
  StartFailed = 'start_failed',
  ScanFailed = 'scan_failed',
  ExportFailed = 'export_failed',
  CheckFailed = 'check_failed',
  Collision = 'collision',
  EmptyOutput = 'empty_output',
  EmptySource = 'empty_source',
  InvalidNumber = 'invalid_number',
  InvalidPaths = 'invalid_paths',
  InvalidRequest = 'invalid_request',
  InvalidSpine = 'invalid_spine',
  InvalidSpineVersion = 'invalid_spine_version',
  LinkedPath = 'linked_path',
  MissingTexture = 'missing_texture',
  MissingTool = 'missing_tool',
  NoSpineSkeletons = 'no_spine_skeletons',
  OverlappingPaths = 'overlapping_paths',
  RecoveryRequired = 'recovery_required',
  ToolFailed = 'tool_failed',
  ToolTimeout = 'tool_timeout',
  AudioFfmpeg = 'audio.ffmpeg',
  AudioFile = 'audio.file',
  AudioDuration = 'audio.duration',
  AudioLimit = 'audio.limit',
  AudioNames = 'audio.names',
  AudioOptions = 'audio.options',
}

export enum TelemetryStage {
  Checking = 'checking',
  Copying = 'copying',
  ConvertingSpine = 'convertingSpine',
  Upgrading = 'upgrading',
  Textures = 'textures',
  Packing = 'packing',
  Committing = 'committing',
  AudioProcessing = 'audio.processing',
  Unknown = 'unknown',
}

type Properties = {
  module: TelemetryModule;
  action: TelemetryAction;
  operation_id?: string;
  duration_bucket?: DurationBucket;
  file_count_bucket?: FileCountBucket;
  error_code?: TelemetryErrorCode;
  stage?: TelemetryStage;
};

type Operation = { module: TelemetryModule; action: TelemetryAction; startedAt: number;
  fileCount: FileCountBucket; errorCode: TelemetryErrorCode; stage: TelemetryStage };

const projectKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const host = import.meta.env.VITE_POSTHOG_HOST === 'https://eu.i.posthog.com'
  ? 'https://eu.i.posthog.com' : 'https://us.i.posthog.com';
const identityKey = 'spineslim.telemetry.id';
const operations = new Map<string, Operation>();
let enabled = false;
let version = '';

export function configureTelemetry(consent: boolean, appVersion: string): void {
  enabled = consent && Boolean(projectKey) && import.meta.env.PROD;
  version = appVersion;
  if (!consent) {
    operations.clear();
    try { localStorage.removeItem(identityKey); } catch {}
  }
}

export function durationBucket(milliseconds: number): DurationBucket {
  if (milliseconds < 10_000) return DurationBucket.UnderTenSeconds;
  if (milliseconds < 60_000) return DurationBucket.TenSecondsToOneMinute;
  if (milliseconds < 300_000) return DurationBucket.OneToFiveMinutes;
  return DurationBucket.OverFiveMinutes;
}

export function fileCountBucket(count: number): FileCountBucket {
  if (!Number.isInteger(count) || count < 1) return FileCountBucket.Unknown;
  if (count === 1) return FileCountBucket.One;
  if (count <= 10) return FileCountBucket.TwoToTen;
  if (count <= 100) return FileCountBucket.ElevenToHundred;
  return FileCountBucket.OverHundred;
}

export function safeErrorCode(value: string): TelemetryErrorCode {
  return Object.values(TelemetryErrorCode).includes(value as TelemetryErrorCode)
    ? value as TelemetryErrorCode : TelemetryErrorCode.Unexpected;
}

export function safeStage(value: string): TelemetryStage {
  return Object.values(TelemetryStage).includes(value as TelemetryStage)
    ? value as TelemetryStage : TelemetryStage.Unknown;
}

export function beginOperation(id: string, module: TelemetryModule, action: TelemetryAction, fileCount = 0): void {
  if (!enabled || operations.has(id)) return;
  const bucket = fileCountBucket(fileCount);
  operations.set(id, { module, action, startedAt: Date.now(), fileCount: bucket,
    errorCode: TelemetryErrorCode.Unexpected, stage: TelemetryStage.Checking });
  track(TelemetryEvent.ProcessingStarted, { module, action, operation_id: id, file_count_bucket: bucket });
}

export function updateOperation(id: string, stage?: string, fileCount?: number, errorCode?: string): void {
  const operation = operations.get(id);
  if (!operation) return;
  if (stage) operation.stage = safeStage(stage);
  if (fileCount !== undefined && fileCount > 0) operation.fileCount = fileCountBucket(fileCount);
  if (errorCode) operation.errorCode = safeErrorCode(errorCode);
}

export function finishOperation(id: string, result: 'success' | 'error' | 'cancel'): void {
  const operation = operations.get(id);
  if (!operation) return;
  operations.delete(id);
  const event = result === 'success' ? TelemetryEvent.ProcessingSucceeded
    : result === 'cancel' ? TelemetryEvent.ProcessingCancelled : TelemetryEvent.ProcessingErrored;
  track(event, { module: operation.module, action: operation.action, operation_id: id,
    duration_bucket: durationBucket(Date.now() - operation.startedAt), file_count_bucket: operation.fileCount,
    ...(result === 'error' ? { error_code: operation.errorCode, stage: operation.stage } : {}) });
}

export function trackFeature(module: TelemetryModule, action: TelemetryAction, fileCount = 0): void {
  track(TelemetryEvent.FeatureUsed, { module, action, file_count_bucket: fileCountBucket(fileCount) });
}

export function trackAppError(module: TelemetryModule, action: TelemetryAction, errorCode: TelemetryErrorCode): void {
  track(TelemetryEvent.AppErrored, { module, action, error_code: errorCode, stage: TelemetryStage.Unknown });
}

function localeRegion(): string {
  for (const locale of [...navigator.languages, Intl.DateTimeFormat().resolvedOptions().locale]) {
    try {
      const region = new Intl.Locale(locale).region;
      if (region && /^(?:[A-Z]{2}|\d{3})$/.test(region)) return region;
    } catch {
      continue;
    }
  }
  return 'unknown';
}

export function track(event: TelemetryEvent, properties: Properties): void {
  if (!enabled || !projectKey) return;
  try {
    let distinctId = localStorage.getItem(identityKey);
    if (!distinctId) {
      distinctId = crypto.randomUUID();
      localStorage.setItem(identityKey, distinctId);
    }
    void fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: projectKey, event, distinct_id: distinctId,
        properties: { ...properties, app_version: version, platform: 'windows_desktop', region: localeRegion(),
          $lib: 'spineslim', $geoip_disable: true, $process_person_profile: false } }),
    }).catch(() => {});
  } catch {
    return;
  }
}
