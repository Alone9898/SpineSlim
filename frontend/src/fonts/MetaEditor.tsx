import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Download, Info } from 'lucide-react';
import type { Language } from '../types';

type Names = Record<string, string>;
type Metrics = {
  glyph_count: number; unicode_count: number; units_per_em: number; ascender: number; descender: number;
  x_height: number; cap_height: number; bytes: number; coverage: string[];
};
type Props = { language: Language; fontPath: string };
type Field = { key: string; label: [string, string] };

// Field groups shown as collapsible sections, matching the order of the metadata panel.
const groups: { title: [string, string]; fields: Field[] }[] = [
  { title: ['基本信息', 'Basic information'], fields: [
    { key: 'family', label: ['字体家族', 'Font family'] }, { key: 'subfamily', label: ['字重样式', 'Style'] },
    { key: 'full_name', label: ['完整名称', 'Full name'] }, { key: 'postscript_name', label: ['PostScript 名', 'PostScript name'] },
    { key: 'version', label: ['版本号', 'Version'] }, { key: 'unique_id', label: ['唯一标识', 'Unique identifier'] },
  ] },
  { title: ['版权与授权', 'Copyright and license'], fields: [
    { key: 'copyright', label: ['版权', 'Copyright'] }, { key: 'trademark', label: ['商标', 'Trademark'] }, { key: 'license', label: ['授权', 'License'] },
  ] },
  { title: ['制作方信息', 'Maker information'], fields: [
    { key: 'manufacturer', label: ['厂商', 'Manufacturer'] }, { key: 'designer', label: ['设计者', 'Designer'] }, { key: 'description', label: ['描述', 'Description'] },
  ] },
];
const coverageNames: Record<string, [string, string]> = {
  basic_latin: ['基本拉丁文', 'Basic Latin'], latin_1: ['拉丁文补充', 'Latin-1 Supplement'], latin_ext_a: ['拉丁文扩展-A', 'Latin Extended-A'],
  latin_ext_b: ['拉丁文扩展-B', 'Latin Extended-B'], greek: ['希腊文', 'Greek'], cyrillic: ['西里尔文', 'Cyrillic'], hebrew: ['希伯来文', 'Hebrew'],
  arabic: ['阿拉伯文', 'Arabic'], general_punctuation: ['通用标点', 'General Punctuation'], math_operators: ['数学运算符', 'Math Operators'],
  hiragana_katakana: ['平假名与片假名', 'Hiragana & Katakana'], cjk_unified: ['CJK 统一汉字', 'CJK Unified Ideographs'], hangul_syllables: ['韩文音节', 'Hangul Syllables'],
};
const words: Record<string, [string, string]> = {
  loading: ['正在读取元信息…', 'Loading metadata…'],
  hint: ['修改后导出为新文件，原字体不会被改动。留空的字段会从字体中删除。', 'Export writes a new file and leaves the original untouched. Blank fields are removed from the font.'],
  export: ['导出修改后的字体', 'Export edited font'], saving: ['正在导出…', 'Exporting…'], reset: ['恢复原值', 'Reset'],
  chars: ['字符', 'chars'], metrics: ['字体度量', 'Font metrics'], coverage: ['Unicode 覆盖', 'Unicode coverage'],
  glyphs: ['字形总数', 'Glyphs'], unicodes: ['Unicode 数', 'Unicode values'], upm: ['UPM', 'UPM'], ascender: ['上升高度', 'Ascender'],
  descender: ['下降高度', 'Descender'], xHeight: ['x 高度', 'x-height'], capHeight: ['大写高度', 'Cap height'], size: ['文件大小', 'File size'],
  saved: ['已导出', 'Exported'], none: ['无', 'None'],
  'font.output': ['无法生成输出文件。', 'Could not create the output file.'], 'font.file': ['请选择有效的 TTF 或 OTF 字体文件。', 'Choose a valid TTF or OTF font file.'],
  'font.size': ['字体文件过大，无法预览。', 'The font file is too large to preview.'],
};

const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function MetaEditor({ language, fontPath }: Props) {
  const t = (key: string) => words[key]?.[language === 'en' ? 1 : 0] ?? key;
  const label = (pair: [string, string]) => pair[language === 'en' ? 1 : 0];
  const [original, setOriginal] = useState<Names | null>(null);
  const [values, setValues] = useState<Names>({});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!fontPath) return;
    setOriginal(null); setMetrics(null); setError(''); setDone('');
    Promise.all([
      invoke<Names>('font_names', { options: { path: fontPath } }),
      invoke<Metrics>('font_metrics', { options: { path: fontPath } }),
    ])
      .then(([names, measured]) => { setOriginal(names); setValues(names); setMetrics(measured); })
      .catch(reason => setError(t(String(reason))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontPath]);

  const exportFont = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const result = await invoke<{ output: string }>('font_names_save', { options: { path: fontPath, fields: values } });
      const extension = fontPath.split('.').pop()?.toLowerCase() ?? 'ttf';
      const target = await save({ defaultPath: result.output.split(/[\\/]/).pop(), filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
      if (target) {
        await invoke('save_font_subset', { source: result.output, target });
        setDone(target);
      }
    } catch (reason) { setError(t(String(reason))); }
    finally { setBusy(false); }
  };

  if (error && !original) return <section className="card notice font-error" role="alert">{error}</section>;
  if (!original || !metrics) return <section className="card hint">{t('loading')}</section>;
  const measures: [string, number][] = [
    [t('glyphs'), metrics.glyph_count], [t('unicodes'), metrics.unicode_count], [t('upm'), metrics.units_per_em],
    [t('ascender'), metrics.ascender], [t('descender'), metrics.descender], [t('xHeight'), metrics.x_height],
    [t('capHeight'), metrics.cap_height],
  ];
  return <div className="meta-page">
    <div className="meta-left">
      <p className="hint">{t('hint')}</p>
      {groups.map(group => <details key={group.title[0]} className="card meta-group" open={group.title[0] === groups[0].title[0]}>
        <summary>{label(group.title)}</summary>
        <div className="meta-grid">
          {group.fields.map(field => <label className="field" key={field.key}>
            <span>{label(field.label)}<em>{(values[field.key] ?? '').length} {t('chars')}</em></span>
            <div className="meta-input">
              <input type="text" value={values[field.key] ?? ''} disabled={busy} onChange={event => setValues({ ...values, [field.key]: event.target.value })} />
              {values[field.key] !== original[field.key] && <button className="text-button" disabled={busy} onClick={() => setValues({ ...values, [field.key]: original[field.key] })}>{t('reset')}</button>}
            </div>
          </label>)}
        </div>
      </details>)}
    </div>
    <div className="meta-right">
      <section className="card">
        <h2><Info size={15} />{t('metrics')}</h2>
        <dl className="meta-metrics">
          {measures.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
          <div><dt>{t('size')}</dt><dd>{size(metrics.bytes)}</dd></div>
        </dl>
      </section>
      <section className="card">
        <h2>{t('coverage')}</h2>
        <div className="meta-tags">
          {metrics.coverage.length ? metrics.coverage.map(key => <span key={key}>{coverageNames[key] ? label(coverageNames[key]) : key}</span>) : <span>{t('none')}</span>}
        </div>
      </section>
      <button className="button primary full" disabled={busy} onClick={() => void exportFont()}><Download size={15} />{t(busy ? 'saving' : 'export')}</button>
      {done && <p className="hint">{t('saved')}: {done}</p>}
      {error && <div className="notice font-error" role="alert">{error}</div>}
    </div>
  </div>;
}
