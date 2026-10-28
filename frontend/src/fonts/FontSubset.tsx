import { useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ChevronRight, CircleCheck, Download, Type } from 'lucide-react';
import type { Language } from '../types';
import commonCharacters from './common-3000.txt?raw';
import GlyphView from './GlyphView';
import MetaEditor from './MetaEditor';
import './fonts.css';

type Result = { output: string; input_size: number; output_size: number; kept: string[]; missing: string[] };
type Info = { family: string; style: string; glyphs: number; characters: number; bytes: number };
type Format = 'ttf' | 'woff';
type Tab = 'subset' | 'glyphs' | 'meta';
type Props = { language: Language };
// Preset character sets. Values are filled in later; an empty value keeps the card disabled.
const presets: { key: string; label: [string, string]; hint: [string, string]; chars: string }[] = [
  { key: 'common3000', label: ['常用 3000 字', 'Common 3000 characters'], hint: ['内置真实常用字表，含中英数字和符号', 'Built-in common Chinese characters, plus letters, digits and symbols'], chars: commonCharacters.trim() },
  { key: 'asciiDigits', label: ['数字 + 英文', 'Digits + English'], hint: ['0-9 及完整 ASCII 可打印字符', '0-9 and the full printable ASCII set'], chars: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz !@#$%^&*()-_=+[]{}|;:,.<>?/`~' },
  { key: 'punctuation', label: ['中文标点', 'Chinese punctuation'], hint: ['常用标点符号', 'Common punctuation marks'], chars: '，。！？；：“”‘’【】（）《》—…、·～｛｝' },
  { key: 'fullwidthDigits', label: ['全角数字', 'Full-width digits'], hint: ['全角阿拉伯数字', 'Full-width Arabic digits'], chars: '０１２３４５６７８９' },
];
const tabs: { key: Tab; label: [string, string] }[] = [
  { key: 'subset', label: ['字体裁剪', 'Subset'] }, { key: 'glyphs', label: ['字形查看', 'Glyphs'] }, { key: 'meta', label: ['元信息编辑', 'Metadata'] },
];
const words: Record<string, [string, string]> = {
  font: ['字体文件', 'Font file'], choose: ['选择字体', 'Choose font'], empty: ['未选择字体', 'No font selected'],
  formats: ['支持 TTF / OTF，输出保持原格式。', 'TTF and OTF are supported. The output keeps the original format.'],
  text: ['需要保留的文字', 'Text to keep'], presets: ['快速预设', 'Quick presets'],
  textHint: ['粘贴游戏中会用到的全部文字，空白字符会被忽略。字体中没有的字符会在结果中列出。', 'Paste all text the game will display. Whitespace is ignored. Characters missing from the font are listed in the result.'],
  run: ['开始裁剪', 'Subset font'], running: ['正在裁剪…', 'Subsetting…'],
  size: ['体积', 'Size'], kept: ['保留字符', 'Kept characters'], missing: ['字体中缺少的字符', 'Characters missing from the font'],
  none: ['无', 'None'], done: ['裁剪完成', 'Subset complete'], download: ['下载', 'Download'],
  originalSize: ['原始大小', 'Original size'], subsetSize: ['裁剪后', 'After subsetting'], countUnit: ['个', ''],
  desktop: ['请在桌面应用中使用字体裁剪。', 'Use font subsetting in the desktop app.'],
  glyphs: ['个字形', 'glyphs'], uniqueChars: ['个独立字符', 'unique characters'], clear: ['清空', 'Clear'],
  outputFormat: ['输出格式', 'Output format'], ttfLabel: ['TTF / OTF', 'TTF / OTF'], ttfHint: ['保留原始字体格式，兼容桌面端', 'Keeps the original font format for desktop use'],
  woffLabel: ['WOFF', 'WOFF'], woffHint: ['Web 字体封装，兼容浏览器', 'Web font wrapper for browsers'],
  reduction: ['体积缩减', 'Size reduction'], pickFontFirst: ['请先选择一个字体文件。', 'Choose a font file first.'],
  'font.file': ['请选择有效的 TTF 或 OTF 字体文件。', 'Choose a valid TTF or OTF font file.'],
  'font.text': ['请输入需要保留的文字。', 'Enter the text to keep.'],
  'font.empty': ['字体中找不到输入的任何字符，结果未生成。', 'The font has none of the entered characters. No file was written.'],
  'font.output': ['请选择输出目录。', 'Choose an output folder.'],
};

const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function FontSubset({ language }: Props) {
  const t = (key: string) => words[key]?.[language === 'en' ? 1 : 0] ?? key;
  const [tab, setTab] = useState<Tab>('subset');
  const [fontPath, setFontPath] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [format, setFormat] = useState<Format>('ttf');
  const locked = useRef(false);

  const choose = async () => {
    try {
      const picked = await open({ multiple: false, filters: [{ name: 'Font', extensions: ['ttf', 'otf'] }] });
      if (typeof picked !== 'string') return;
      setFontPath(picked); setResult(null); setInfo(null); setError('');
      setInfo(await invoke<Info>('font_info', { options: { path: picked } }));
    } catch (reason) { setError(t(String(reason))); }
  };
  const run = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setResult(null);
    try {
      setResult(await invoke<Result>('font_subset', { options: { path: fontPath, text, format } }));
    } catch (reason) { setError(t(String(reason))); }
    finally { locked.current = false; setBusy(false); }
  };
  // Presets merge into the existing text and drop duplicate characters.
  const applyPreset = (chars: string) => setText(previous => [...new Set([...previous, ...chars])].join(''));
  const fileName = fontPath.split(/[\\/]/).pop() ?? '';
  const canRun = Boolean(fontPath && text.trim()) && !busy;
  // Saves the staged subset to a location the user picks.
  const download = async () => {
    if (!result) return;
    try {
      const extension = format === 'woff' ? 'woff' : fontPath.split('.').pop()?.toLowerCase() ?? 'ttf';
      const target = await save({ defaultPath: result.output.split(/[\\/]/).pop(), filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
      if (target) await invoke('save_font_subset', { source: result.output, target });
    } catch (reason) { setError(String(reason)); }
  };
  const uniqueCount = new Set([...text].filter(char => !/\s/.test(char))).size;
  const reduction = result && result.input_size ? ((1 - result.output_size / result.input_size) * 100).toFixed(1) : '0';

  if (!isTauri()) return <section className="card">{t('desktop')}</section>;
  return <div className="font-page">
    <nav className="font-tabs">
      {tabs.map(item => <button key={item.key} className={tab === item.key ? 'selected' : ''} onClick={() => setTab(item.key)}>{item.label[language === 'en' ? 1 : 0]}</button>)}
    </nav>
    <section className="card font-source-bar">
      <Type size={32} />
      <div>
        <strong>{info?.family || fileName || t('empty')}</strong>
        <small>{info ? `${size(info.bytes)} · ${info.glyphs} ${t('glyphs')}${info.style ? ` · ${info.style}` : ''}` : t('formats')}</small>
      </div>
      <button className="button secondary" disabled={busy} onClick={() => void choose()}>{t('choose')}</button>
    </section>
    {tab === 'subset' && <div className="font-workspace">
      <section className="card font-main">
        <div className="font-presets">
          <span>{t('presets')}</span>
          <div className="font-preset-grid">
            {presets.map(preset => <button key={preset.key} className="font-preset" disabled={busy || !preset.chars} onClick={() => applyPreset(preset.chars)}>
              <ChevronRight size={16} />
              <span><strong>{preset.label[language === 'en' ? 1 : 0]}</strong><small>{preset.hint[language === 'en' ? 1 : 0]}</small></span>
            </button>)}
          </div>
        </div>
        <div className="font-text-head">
          <span>{t('text')}</span>
          <em>{uniqueCount} {t('uniqueChars')}</em>
          <button className="text-button" disabled={busy || !text} onClick={() => setText('')}>{t('clear')}</button>
        </div>
        <label className="field">
          <textarea rows={8} value={text} disabled={busy} onChange={event => setText(event.target.value)} />
        </label>
        <p className="hint">{t('textHint')}</p>
      </section>
      <div className="font-side">
        <section className="card">
          <h2>{t('outputFormat')}</h2>
          <div className="font-formats">
            {(['ttf', 'woff'] as const).map(value => <button key={value} className={`font-format${format === value ? ' selected' : ''}`} disabled={busy} onClick={() => setFormat(value)}>
              <strong>{value === 'ttf' ? t('ttfLabel') : t('woffLabel')}</strong>
              <small>{value === 'ttf' ? t('ttfHint') : t('woffHint')}</small>
            </button>)}
          </div>
          <button className="button primary full" disabled={!canRun} onClick={() => void run()}>{t(busy ? 'running' : 'run')}</button>
          {error && <div className="notice font-error" role="alert">{error}</div>}
        </section>
        {result && <section className="card">
          <h2><CircleCheck size={16} />{t('done')}</h2>
          <div className="font-size-compare">
            <div><span>{t('originalSize')}</span><strong>{size(result.input_size)}</strong></div>
            <div className="after"><span>{t('subsetSize')}</span><strong>{size(result.output_size)}</strong></div>
          </div>
          <dl className="font-stats">
            <dt>{t('reduction')}</dt><dd className="font-reduction">↓ {reduction}%</dd>
            <dt>{t('kept')}</dt><dd>{result.kept.length} {t('countUnit')}</dd>
          </dl>
          <button className="button secondary full" onClick={() => void download()}><Download size={15} />{t('download')} {(format === 'woff' ? 'woff' : fontPath.split('.').pop() ?? 'ttf').toUpperCase()}</button>
        </section>}
      </div>
    </div>}
    {tab === 'glyphs' && (fontPath ? <GlyphView language={language} fontPath={fontPath} /> : <section className="card hint">{t('pickFontFirst')}</section>)}
    {tab === 'meta' && (fontPath ? <MetaEditor language={language} fontPath={fontPath} /> : <section className="card hint">{t('pickFontFirst')}</section>)}
  </div>;
}
