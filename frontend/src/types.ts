export type Mode = 'spine' | 'ui' | 'video';
export type Format = 'original' | 'webp' | 'png' | 'jpg' | 'basis';
export type Language = 'zh' | 'en';
export type Settings = {
  schema_version: number; language: Language; source: string; target: string; mode: Mode;
  spine_format: Format; ui_format: Format; quality: number; crf: number;
  upgrade: boolean; spine_conversion_mode: 'off' | 'upgrade' | 'advanced'; spine_target_version: string;
  spine_output_format: 'original' | 'json' | 'skel'; force_bg: boolean; alpha: boolean;
  anonymous_telemetry: boolean; tools: Record<string, string>;
  models: ModelProfile[]; active_model: string;
};
// Profiles are saved in settings.json; API keys are kept only in the OS credential store, keyed by profile id.
export type ModelProfile = { id: string; name: string; provider: string; base_url: string; protocol: string; model: string };
export type ModelPreset = { provider_id: string; name: string; base_url: string; protocol: string; model_hint: string };
export type WorkerEvent = {
  protocol_version: number; task_id: string; sequence?: number; type: string;
  message_key: string; params: Record<string, string | number>;
};
export type Tool = { key: string; name: string; path: string; available: boolean; detail: string; url: string };

const protocols = ['openai_compatible', 'anthropic', 'gemini'];
const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const text = (value: unknown) => typeof value === 'string' ? value : '';

export function newProfileId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createProfile(provider = 'deepseek', protocol = 'openai_compatible'): ModelProfile {
  return { id: newProfileId(), name: '', provider, base_url: '', protocol, model: '' };
}

export const defaults: Settings = { schema_version: 1, language: 'zh', source: '', target: '', mode: 'spine',
  spine_format: 'original', ui_format: 'original', quality: 50, crf: 36,
  upgrade: true, spine_conversion_mode: 'upgrade', spine_target_version: '4.2.11', spine_output_format: 'original',
  force_bg: false, alpha: true, anonymous_telemetry: true, tools: {},
  models: [{ id: 'default', name: '', provider: 'deepseek', base_url: '', protocol: 'openai_compatible', model: '' }],
  active_model: 'default' };

function hydrateProfile(input: unknown): ModelProfile {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const provider = text(data.provider) || 'deepseek';
  const savedBaseUrl = text(data.base_url);
  return {
    id: idPattern.test(text(data.id)) ? text(data.id) : newProfileId(),
    name: text(data.name),
    provider,
    base_url: provider === 'deepseek' && /^https:\/\/api\.deepseek\.com\/v1\/?$/.test(savedBaseUrl)
      ? 'https://api.deepseek.com' : savedBaseUrl,
    protocol: protocols.includes(String(data.protocol)) ? String(data.protocol) : 'openai_compatible',
    model: text(data.model),
  };
}

function hydrateModels(data: Record<string, unknown>): ModelProfile[] {
  // Older settings stored one `model` object; it becomes the first profile.
  const legacy = data.model && typeof data.model === 'object' ? [{ ...(data.model as object), id: 'default' }] : [];
  const source = Array.isArray(data.models) ? data.models : legacy;
  const seen = new Set<string>();
  const profiles = source.map(hydrateProfile).filter(profile => {
    if (seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  });
  return profiles.length ? profiles : [hydrateProfile({})];
}

export function hydrate(input: unknown): Settings {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const formats = ['original', 'webp', 'png', 'jpg', 'basis'];
  const format = (value: unknown): Format => value === 'imagemagick' ? 'webp' : formats.includes(String(value)) ? value as Format : 'original';
  const bounded = (value: unknown, maximum: number, fallback: number) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum ? value : fallback;
  const tools = data.tools ?? data.tool_paths;
  const models = hydrateModels(data);
  return { ...defaults, language: data.language === 'en' ? 'en' : 'zh',
    source: typeof data.source === 'string' ? data.source : '', target: typeof data.target === 'string' ? data.target : '',
    mode: ['spine', 'ui', 'video'].includes(String(data.mode ?? data.res_type)) ? (data.mode ?? data.res_type) as Mode : 'spine',
    spine_format: format(data.spine_format ?? data.spine_texture_format), ui_format: format(data.ui_format ?? data.ui_texture_format),
    quality: bounded(data.quality ?? data.webp_quality, 100, 50), crf: bounded(data.crf ?? data.video_crf, 63, 36),
    upgrade: data.upgrade !== false,
    spine_conversion_mode: ['off', 'upgrade', 'advanced'].includes(String(data.spine_conversion_mode))
      ? data.spine_conversion_mode as Settings['spine_conversion_mode'] : 'upgrade',
    spine_target_version: typeof data.spine_target_version === 'string' ? data.spine_target_version : '4.2.11',
    spine_output_format: ['original', 'json', 'skel'].includes(String(data.spine_output_format))
      ? data.spine_output_format as Settings['spine_output_format'] : 'original',
    force_bg: data.force_bg === true, alpha: (data.alpha ?? data.video_transparency) !== false,
    anonymous_telemetry: true,
    models,
    active_model: models.some(profile => profile.id === data.active_model) ? String(data.active_model) : models[0].id,
    tools: tools && typeof tools === 'object' ? Object.fromEntries(Object.entries(tools).filter(([key, value]) => ['imagemagick', 'basis', 'texturepacker', 'spine_converter', 'ffmpeg'].includes(key) && typeof value === 'string')) : {},
  };
}
