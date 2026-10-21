export type Mode = 'spine' | 'ui' | 'video';
export type Format = 'original' | 'webp' | 'png' | 'jpg' | 'basis';
export type Language = 'zh' | 'en';
export type Settings = {
  schema_version: number; language: Language; source: string; target: string; mode: Mode;
  spine_format: Format; ui_format: Format; quality: number; crf: number;
  upgrade: boolean; spine_conversion_mode: 'off' | 'upgrade' | 'advanced'; spine_target_version: string;
  spine_output_format: 'original' | 'json' | 'skel'; force_bg: boolean; alpha: boolean; tools: Record<string, string>;
};
export type WorkerEvent = {
  protocol_version: number; task_id: string; sequence?: number; type: string;
  message_key: string; params: Record<string, string | number>;
};
export type Tool = { key: string; name: string; path: string; available: boolean; detail: string; url: string };
export const defaults: Settings = { schema_version: 1, language: 'zh', source: '', target: '', mode: 'spine',
  spine_format: 'original', ui_format: 'original', quality: 50, crf: 36,
  upgrade: true, spine_conversion_mode: 'upgrade', spine_target_version: '4.2.11', spine_output_format: 'original',
  force_bg: false, alpha: true, tools: {} };

export function hydrate(input: unknown): Settings {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const formats = ['original', 'webp', 'png', 'jpg', 'basis'];
  const format = (value: unknown): Format => value === 'imagemagick' ? 'webp' : formats.includes(String(value)) ? value as Format : 'original';
  const bounded = (value: unknown, maximum: number, fallback: number) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum ? value : fallback;
  const tools = data.tools ?? data.tool_paths;
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
    tools: tools && typeof tools === 'object' ? Object.fromEntries(Object.entries(tools).filter(([key, value]) => ['imagemagick', 'basis', 'texturepacker', 'spine_converter', 'ffmpeg'].includes(key) && typeof value === 'string')) : {},
  };
}
