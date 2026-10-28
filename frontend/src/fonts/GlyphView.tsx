import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Search } from 'lucide-react';
import type { Language } from '../types';

type Glyph = { codepoint: number | null; name: string; advance: number };
type Glyphs = { glyphs: Glyph[]; total: number; glyph_count: number; truncated: boolean; units_per_em: number };
type Props = { language: Language; fontPath: string };
const words: Record<string, [string, string]> = {
  search: ['搜索字形名称、字符、Unicode…', 'Search glyph name, character, Unicode…'],
  loading: ['正在读取字形…', 'Loading glyphs…'], none: ['没有匹配的字形', 'No matching glyphs'],
  count: ['个字形', 'glyphs'], size: ['字形大小', 'Glyph size'],
  grid: ['网格视图', 'Grid view'], list: ['列表视图', 'List view'],
  prev: ['上一页', 'Previous'], next: ['下一页', 'Next'],
  page: ['第 {current} / {pages} 页 · 共 {total} 个', 'Page {current} of {pages} · {total} total'],
  truncated: ['字形过多，仅显示前一部分，请用搜索缩小范围。', 'Too many glyphs. Only the first part is shown; narrow the search.'],
  selected: ['选中', 'Selected'], codepoint: ['码位', 'Code point'], name: ['字形名', 'Glyph name'], advance: ['字宽', 'Advance width'], em: ['每 em 单位', 'Units per em'],
  unmapped: ['未映射', 'Unmapped'], listChar: ['字符', 'Character'],
};
const pageSize = 240;

export default function GlyphView({ language, fontPath }: Props) {
  const t = (key: string) => words[key]?.[language === 'en' ? 1 : 0] ?? key;
  const [data, setData] = useState<Glyphs | null>(null);
  const [family, setFamily] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [cellSize, setCellSize] = useState(32);
  const [listMode, setListMode] = useState(false);
  const [selected, setSelected] = useState<Glyph | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!fontPath) return;
    let face: FontFace | null = null;
    let cancelled = false;
    setData(null); setSelected(null); setError(''); setPage(0);
    const name = `spineslim-preview-${Date.now()}`;
    (async () => {
      try {
        const [glyphs, font] = await Promise.all([
          invoke<Glyphs>('font_glyphs', { options: { path: fontPath } }),
          invoke<{ data: string }>('font_data', { options: { path: fontPath } }),
        ]);
        const bytes = Uint8Array.from(atob(font.data), character => character.charCodeAt(0));
        face = new FontFace(name, bytes.buffer);
        await face.load();
        if (cancelled) return;
        document.fonts.add(face);
        setFamily(name); setData(glyphs);
      } catch (reason) { if (!cancelled) setError(String(reason)); }
    })();
    return () => {
      cancelled = true;
      if (face) document.fonts.delete(face);
    };
  }, [fontPath]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const text = query.trim();
    if (!text) return data.glyphs;
    const lower = text.toLowerCase();
    const hex = /^u\+?([0-9a-f]+)$/i.exec(text);
    return data.glyphs.filter(glyph => {
      if (hex) return glyph.codepoint === parseInt(hex[1], 16);
      if ([...text].length === 1) return glyph.codepoint === text.codePointAt(0);
      return glyph.name.toLowerCase().includes(lower);
    });
  }, [data, query]);

  if (error) return <section className="card notice font-error" role="alert">{error}</section>;
  if (!data) return <section className="card hint">{t('loading')}</section>;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  const codeHex = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  const label = (glyph: Glyph) => glyph.codepoint === null ? glyph.name : codeHex(glyph.codepoint);
  const cellWidth = Math.round(cellSize * 2.4);
  const fill = (text: string) => text.replace('{current}', String(current + 1)).replace('{pages}', String(pages)).replace('{total}', String(filtered.length));
  return <section className="card glyph-main">
    <div className="glyph-toolbar">
      <label className="glyph-search">
        <Search size={15} />
        <input type="search" value={query} placeholder={t('search')} onChange={event => { setQuery(event.target.value); setPage(0); }} />
      </label>
      <label className="glyph-size">
        <span>{t('size')}</span>
        <input type="range" min={16} max={64} value={cellSize} onChange={event => setCellSize(Number(event.target.value))} />
        <output>{cellSize}</output>
      </label>
      <div className="glyph-modes">
        <button className={!listMode ? 'selected' : ''} title={t('grid')} aria-label={t('grid')} onClick={() => setListMode(false)}><LayoutGrid size={15} /></button>
        <button className={listMode ? 'selected' : ''} title={t('list')} aria-label={t('list')} onClick={() => setListMode(true)}><List size={15} /></button>
      </div>
      <span className="glyph-count">{data.glyph_count} {t('count')}</span>
    </div>
    {data.truncated && <p className="hint">{t('truncated')}</p>}
    {!filtered.length && <p className="hint">{t('none')}</p>}
    {filtered.length > 0 && (listMode ? <div className="glyph-list">
      <div className="glyph-row glyph-row-head"><span>{t('listChar')}</span><span>{t('name')}</span><span>{t('codepoint')}</span><span>{t('advance')}</span></div>
      {visible.map(glyph => <button key={`${glyph.name}-${glyph.codepoint}`} className={`glyph-row${selected?.name === glyph.name ? ' selected' : ''}${glyph.codepoint === null ? ' unmapped' : ''}`} onClick={() => setSelected(glyph)}>
        <span className="glyph-row-char" style={{ fontFamily: `"${family}"` }}>{glyph.codepoint === null ? '' : String.fromCodePoint(glyph.codepoint)}</span>
        <span>{glyph.name}</span><span>{glyph.codepoint === null ? t('unmapped') : codeHex(glyph.codepoint)}</span><span>{glyph.advance}</span>
      </button>)}
    </div> : <div className="glyph-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cellWidth}px, 1fr))` }}>
      {visible.map(glyph => <button key={`${glyph.name}-${glyph.codepoint}`} className={`glyph-cell${selected?.name === glyph.name ? ' selected' : ''}${glyph.codepoint === null ? ' unmapped' : ''}`} title={glyph.name} onClick={() => setSelected(glyph)}>
        <span className="glyph-char" style={{ fontFamily: `"${family}"`, fontSize: cellSize }}>{glyph.codepoint === null ? '' : String.fromCodePoint(glyph.codepoint)}</span>
        <small>{label(glyph)}</small>
      </button>)}
    </div>)}
    <div className="glyph-footer">
      <button className="button secondary" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={15} />{t('prev')}</button>
      <span className="hint">{fill(t('page'))}</span>
      <button className="button secondary" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>{t('next')}<ChevronRight size={15} /></button>
    </div>
    {selected && <div className="glyph-selected">
      <span className="glyph-preview" style={{ fontFamily: `"${family}"` }}>{selected.codepoint === null ? '' : String.fromCodePoint(selected.codepoint)}</span>
      <dl>
        <dt>{t('name')}</dt><dd>{selected.name}</dd>
        <dt>{t('codepoint')}</dt><dd>{selected.codepoint === null ? t('unmapped') : codeHex(selected.codepoint)}</dd>
        <dt>{t('advance')}</dt><dd>{selected.advance} / {data.units_per_em}</dd>
      </dl>
    </div>}
  </section>;
}
