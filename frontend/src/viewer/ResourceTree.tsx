import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Sparkles } from 'lucide-react';
import { family, type Asset } from './model';

type Row = { key: string; name: string; depth: number; asset?: Asset };
type Node = { folders: Map<string, Node>; assets: Asset[] };
export default function ResourceTree({ assets, selected, onSelect, problem, searching }: { assets: Asset[]; selected: Asset | null; onSelect(asset: Asset): void; problem(asset: Asset): string; searching: boolean }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [scroll, setScroll] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const root: Node = { folders: new Map(), assets: [] };
    for (const asset of assets) {
      const parts = asset.path.split('/'); parts.pop(); let node = root;
      for (const part of parts) { if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), assets: [] }); node = node.folders.get(part)!; }
      node.assets.push(asset);
    }
    const result: Row[] = [];
    const visit = (node: Node, path: string, depth: number) => {
      for (const [name, child] of node.folders) {
        const key = path + name + '/'; result.push({ key, name, depth });
        if (searching || !closed.has(key)) visit(child, key, depth + 1);
      }
      node.assets.forEach(asset => result.push({ key: String(asset.id), name: asset.path.split('/').pop()!, depth, asset }));
    };
    visit(root, '', 0); return result;
  }, [assets, closed, searching]);
  const start = Math.max(0, Math.min(Math.floor(scroll / 48) - 5, rows.length - 25));
  const count = Math.max(25, Math.ceil((host.current?.clientHeight ?? 800) / 48) + 10);
  return <div className="viewer-resource-list" ref={host} role="tree" onScroll={event => setScroll(event.currentTarget.scrollTop)}>
    <div style={{ height: rows.length * 48, position: 'relative' }}>{rows.slice(start, start + count).map((row, offset) => <button key={row.key} role="treeitem" aria-level={row.depth + 1} aria-expanded={row.asset ? undefined : searching || !closed.has(row.key)} aria-selected={row.asset ? selected?.id === row.asset.id : undefined} data-asset={row.asset?.id} title={row.asset?.path ?? row.key} className={row.asset && selected?.id === row.asset.id ? 'selected' : ''} style={{ position: 'absolute', top: (start + offset) * 48, height: 46, paddingLeft: Math.min(row.depth, 6) * 12 + 9, width: '100%' }} onClick={() => {
      if (row.asset) onSelect(row.asset);
      else setClosed(previous => { const next = new Set(previous); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; });
    }}><span className="viewer-resource-name">{row.asset ? <Sparkles size={13} /> : <>{closed.has(row.key) && !searching ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<Folder size={13} /></>}<span className="viewer-filename">{row.name}</span>{row.asset && <small className={problem(row.asset) ? 'problem' : ''}>{family(row.asset.version) || '?'}</small>}</span>{row.asset && <span className="viewer-resource-path">{row.asset.path}</span>}</button>)}</div>
  </div>;
}
