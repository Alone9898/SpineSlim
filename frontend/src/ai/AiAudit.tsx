import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Check, CircleAlert, Download, FileSearch, FolderOpen, LoaderCircle, ShieldCheck, Sparkles, Square } from 'lucide-react';
import type { Language, ModelProfile, WorkerEvent } from '../types';
import AiChat from './AiChat';
import './ai.css';

const desktop = isTauri();
const FILE_LIMIT = 20;

const copy = {
  eyebrow: ['AI 资源体检 · 本地检测', 'AI ASSET AUDIT · LOCAL CHECKS'],
  title: ['检查游戏资源质量', 'Check game asset quality'],
  description: ['选择资源目录，本地检查重复文件、缺失依赖、尺寸与命名问题，每项都附带证据。', 'Pick an asset folder to check locally for duplicates, missing dependencies, size and naming issues. Each finding includes evidence.'],
  safety: ['体检在本机运行且不修改原文件；只有主动发送 AI 对话时才联系模型服务。', 'Audits run locally without changing files. The model service is contacted only when you send an AI message.'],
  preview: ['预览环境：请在桌面应用中运行真实体检。', 'Preview environment: run real audits in the desktop app.'],
  choose: ['选择目录', 'Choose folder'],
  start: ['开始体检', 'Start audit'],
  cancel: ['取消', 'Cancel'],
  noFolder: ['尚未选择资源目录', 'No asset folder selected'],
  idle: ['选择目录后即可开始', 'Choose a folder to begin'],
  scanning: ['正在遍历文件', 'Scanning files'],
  analyzing: ['正在执行检测规则', 'Running checks'],
  done: ['体检结束', 'Audit finished'],
  completed: ['体检完成', 'Audit complete'],
  partial: ['部分完成：有规则或文件未能检查，见下方说明。', 'Partly complete: some rules or files were not checked.'],
  cancelled: ['已取消，未生成结果。', 'Cancelled. No results were produced.'],
  failed: ['体检失败', 'Audit failed'],
  progress: ['进度', 'Progress'],
  filesScanned: ['已扫描文件', 'Files scanned'],
  ruleProgress: ['检测规则', 'Rules'],
  summary: ['结果概览', 'Summary'],
  totalFiles: ['文件总数', 'Files'],
  critical: ['严重', 'Critical'],
  warning: ['警告', 'Warning'],
  suggestion: ['建议', 'Suggestion'],
  unchecked: ['未检查', 'Unchecked'],
  findings: ['发现的问题', 'Findings'],
  search: ['搜索文件或问题', 'Search files or findings'],
  all: ['全部', 'All'],
  export: ['导出 JSON 报告', 'Export JSON report'],
  exportHtml: ['导出 HTML 报告', 'Export HTML report'],
  drop: ['也可把资源目录拖到此处', 'Or drop an asset folder here'],
  locate: ['打开所在目录', 'Open containing folder'],
  noMatches: ['没有匹配的问题。', 'No matching findings.'],
  noFindings: ['所检查的规则未发现问题。', 'No findings from the checks that ran.'],
  evidence: ['证据', 'Evidence'],
  tip: ['建议', 'Next step'],
  files: ['涉及文件', 'Files'],
  moreFiles: ['另有 {n} 个文件', '{n} more files'],
  coverage: ['规则覆盖', 'Rule coverage'],
  coverageHint: ['未覆盖的格式和规则不会显示为通过。', 'Formats and rules that did not run are never shown as passed.'],
  uncheckedFiles: ['未检查文件', 'Unchecked files'],
  duration: ['耗时', 'Duration'],
  invalid_paths: ['所选目录无效。', 'The selected folder is not valid.'],
  'A task is already running': ['已有任务正在运行，请等待完成。', 'Another task is running. Wait for it to finish.'],
  invalid_request: ['工作进程与界面版本不一致，请重新构建 worker（python scripts/build_worker.py）。', 'The worker does not match this app version. Rebuild it with python scripts/build_worker.py.'],
  error: ['体检出错，请重试。', 'The audit failed. Try again.'],
} as const;

const rules = {
  R01: ['精确重复', 'Exact duplicates'],
  R04: ['缺失依赖', 'Missing dependencies'],
  R05: ['图片尺寸', 'Image size'],
  R06: ['透明边距', 'Transparent padding'],
  R07: ['文件体积', 'File size'],
  R08: ['命名规范', 'Naming'],
  R09: ['Spine 结构', 'Spine structure'],
  R10: ['BMFont 依赖', 'BMFont dependencies'],
  R11: ['GLTF 依赖', 'GLTF dependencies'],
  R13: ['文件格式', 'File signatures'],
} as const;

const codes: Record<string, { title: [string, string]; tip: [string, string] }> = {
  duplicate_files: { title: ['精确重复文件', 'Exact duplicate files'], tip: ['核对引用关系后，保留一份即可。', 'Check references, then keep one copy.'] },
  atlas_missing_page: { title: ['图集引用的纹理缺失', 'Atlas references a missing texture'], tip: ['恢复纹理，或重新导出图集。', 'Restore the texture or re-export the atlas.'] },
  image_oversized: { title: ['图片尺寸超过阈值', 'Image exceeds size threshold'], tip: ['确认显示尺寸是否需要该分辨率。', 'Check whether the display size needs this resolution.'] },
  transparent_padding: { title: ['透明边距过大', 'Large transparent padding'], tip: ['检查裁剪是否适用；Spine 图集坐标可能依赖原画布。', 'Check if trimming is appropriate; Spine atlas coordinates may depend on the canvas.'] },
  file_oversized: { title: ['文件体积超过阈值', 'File exceeds size threshold'], tip: ['检查压缩与格式选择。文件大小不等于运行性能。', 'Review compression and format. File size alone does not mean runtime cost.'] },
  name_case_collision: { title: ['文件名仅大小写不同', 'Names differ only by case'], tip: ['重命名，使其在大小写不敏感的系统中也唯一。', 'Rename so names stay unique on case-insensitive systems.'] },
  name_special_chars: { title: ['文件名含空格或特殊字符', 'File name has spaces or special characters'], tip: ['建议使用字母、数字、点、短横线或下划线。', 'Use letters, digits, dots, dashes or underscores.'] },
  spine_json_invalid: { title: ['Spine JSON 结构不完整', 'Spine JSON structure is incomplete'], tip: ['从 Spine 重新导出骨架。', 'Re-export the skeleton from Spine.'] },
  bmfont_missing_page: { title: ['BMFont 贴图缺失', 'BMFont page is missing'], tip: ['恢复贴图或重新导出字体。', 'Restore the texture or re-export the font.'] },
  gltf_missing_dependency: { title: ['GLTF 依赖缺失', 'GLTF dependency is missing'], tip: ['恢复模型引用的纹理或缓冲文件。', 'Restore the texture or buffer referenced by the model.'] },
  format_mismatch: { title: ['文件格式与扩展名不符', 'File signature does not match extension'], tip: ['核对实际格式后重新导出或重命名。', 'Check the format, then re-export or rename the file.'] },
};

type Severity = 'critical' | 'warning' | 'suggestion';
type Issue = { ruleId: string; code: string; severity: Severity; title: string; files: string[]; evidence: string[]; suggestion: string };
type RuleStatus = { ruleId: string; status: 'passed' | 'issues' | 'error'; coverage: string };
type Report = {
  rootName: string; totalFiles: number; totalSize: number; issues: Issue[]; rules: RuleStatus[];
  uncheckedFiles: { file: string; reason: string }[]; durationMs: number; status: 'completed' | 'partial';
};
type Phase = 'idle' | 'scanning' | 'analyzing' | 'done' | 'cancelled' | 'failed';

const severityOrder: Severity[] = ['critical', 'warning', 'suggestion'];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function htmlReport(report: Report, language: Language) {
  const english = language === 'en';
  const title = english ? 'SpineSlim asset audit' : 'SpineSlim 资源体检报告';
  const label = (chinese: string, englishText: string) => english ? englishText : chinese;
  const issueRows = report.issues.map(issue => {
    const known = codes[issue.code];
    const name = known ? known.title[english ? 1 : 0] : issue.title;
    return `<article><h2>${escapeHtml(name)} <small>${escapeHtml(issue.ruleId)} · ${escapeHtml(issue.severity)}</small></h2><p>${label('涉及文件', 'Files')}: ${issue.files.map(escapeHtml).join(', ')}</p><p>${label('证据', 'Evidence')}: ${issue.evidence.map(escapeHtml).join('; ')}</p><p>${label('建议', 'Next step')}: ${escapeHtml(known ? known.tip[english ? 1 : 0] : issue.suggestion)}</p></article>`;
  }).join('');
  const unchecked = report.uncheckedFiles.map(item => `<li>${escapeHtml(item.file)} · ${escapeHtml(item.reason)}</li>`).join('');
  const coverage = report.rules.map(item => `<li>${escapeHtml(item.ruleId)} · ${escapeHtml(item.coverage)} · ${escapeHtml(item.status)}</li>`).join('');
  return `<!doctype html><html lang="${english ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:14px/1.6 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#26344d;background:#fafbfd}header,article,section{background:white;border:1px solid #e1e7f0;border-radius:10px;padding:18px;margin:16px 0}small{color:#78869a;font-weight:normal}li{overflow-wrap:anywhere}p{overflow-wrap:anywhere}h1{margin:0 0 8px}h2{font-size:17px;margin:0 0 8px}</style></head><body><header><h1>${title}</h1><p>${escapeHtml(report.rootName)} · ${report.totalFiles} ${label('个文件', 'files')} · ${formatBytes(report.totalSize)} · ${escapeHtml(report.status)}</p><small>${label('本地检测结果；未检查的资源不代表安全。', 'Local checks only; unchecked assets are not verified.')}</small></header><section><h2>${label('发现的问题', 'Findings')}</h2>${issueRows || `<p>${label('所执行的规则未发现问题。', 'No findings from checks that ran.')}</p>`}</section><section><h2>${label('未检查文件', 'Unchecked files')}</h2><ul>${unchecked}</ul><h2>${label('规则覆盖', 'Rule coverage')}</h2><ul>${coverage}</ul></section></body></html>`;
}

export default function AiAudit({ language, active, profile, onOpenSettings }: { language: Language; active: boolean; profile: ModelProfile | undefined; onOpenSettings: () => void }) {
  const index = language === 'en' ? 1 : 0;
  const t = (key: keyof typeof copy) => copy[key][index];
  const [source, setSource] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [processed, setProcessed] = useState(0);
  const [rule, setRule] = useState<{ index: number; total: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [errorKey, setErrorKey] = useState('');
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [searchText, setSearchText] = useState('');
  const taskRef = useRef('');
  const activeRef = useRef(active);
  const busyRef = useRef(false);
  const busy = phase === 'scanning' || phase === 'analyzing';
  activeRef.current = active;
  busyRef.current = busy;

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    listen<WorkerEvent>('worker-event', ({ payload }) => {
      if (payload.task_id !== taskRef.current) return;
      if (payload.type === 'started') {
        setPhase('scanning');
      } else if (payload.type === 'progress' && payload.message_key === 'audit_scanning') {
        setProcessed(Number(payload.params.processed));
      } else if (payload.type === 'progress' && payload.message_key === 'audit_rule') {
        setPhase('analyzing');
        setRule({ index: Number(payload.params.index), total: Number(payload.params.total) });
      } else if (payload.type === 'result' && payload.message_key === 'audit') {
        setReport(payload.params.report as unknown as Report);
      } else if (payload.type === 'error') {
        setErrorKey(payload.message_key);
      } else if (payload.type === 'finished') {
        const status = String(payload.params.status);
        setPhase(status === 'success' ? 'done' : status === 'cancelled' ? 'cancelled' : 'failed');
        taskRef.current = '';
      }
    }).then(off => { if (disposed) off(); else dispose = off; });
    return () => { disposed = true; dispose?.(); };
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const subscription = getCurrentWindow().onDragDropEvent(event => {
      if (activeRef.current && !busyRef.current && event.payload.type === 'drop' && event.payload.paths.length === 1) {
        setSource(event.payload.paths[0]);
        setReport(null);
        setPhase('idle');
      }
    });
    return () => { subscription.then(unlisten => unlisten()); };
  }, []);

  const chooseFolder = async () => {
    if (!desktop || busy) return;
    const selection = await open({ directory: true, multiple: false, title: t('choose') });
    if (typeof selection === 'string') { setSource(selection); setReport(null); setPhase('idle'); }
  };
  const start = async () => {
    if (!desktop || !source || busy) return;
    const id = `audit-${Date.now()}`;
    taskRef.current = id;
    setReport(null);
    setErrorKey('');
    setProcessed(0);
    setRule(null);
    setPhase('scanning');
    try {
      await invoke('start_task', { taskId: id, action: 'audit', options: { source } });
    } catch (reason) {
      taskRef.current = '';
      setErrorKey(String(reason));
      setPhase('failed');
    }
  };
  const cancel = () => { void invoke('cancel_task').catch(reason => setErrorKey(String(reason))); };
  const exportReport = async (format: 'json' | 'html') => {
    if (!report) return;
    try {
      const target = await save({ defaultPath: `SpineSlim-audit-${report.rootName}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (target) await invoke('save_audit_report', { target, content: format === 'json' ? JSON.stringify(report, null, 2) : htmlReport(report, language) });
    } catch (reason) { setErrorKey(String(reason)); }
  };
  const locate = async (relative: string) => {
    const folder = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '';
    const path = [source, folder.replaceAll('/', '\\')].filter(Boolean).join('\\');
    try { await invoke('open_output', { path }); } catch (reason) { setErrorKey(String(reason)); }
  };

  const issuesBySeverity = (severity: Severity) => report?.issues.filter(issue => issue.severity === severity).length ?? 0;
  const statusLine = phase === 'done' && report ? t(report.status === 'partial' ? 'partial' : 'completed')
    : phase === 'done' ? t('done')
      : phase === 'cancelled' ? t('cancelled')
        : phase === 'failed' ? t('failed')
          : phase === 'scanning' ? t('scanning')
            : phase === 'analyzing' ? t('analyzing') : t('idle');
  const percent = rule && rule.total > 0 ? Math.round((rule.index / rule.total) * 100) : phase === 'done' ? 100 : 0;
  const errorText = errorKey ? (copy[errorKey as keyof typeof copy]?.[index] ?? t('error')) : '';
  const visibleIssues = severityOrder.flatMap(severity => report?.issues.filter(issue => issue.severity === severity) ?? [])
    .filter(issue => filter === 'all' || issue.severity === filter)
    .filter(issue => !searchText || [issue.code, issue.title, ...issue.files, ...issue.evidence].some(value => value.toLowerCase().includes(searchText.toLowerCase())));

  return <section className="ai-audit">
    <div className="ai-hero">
      <div className="ai-hero-copy">
        <span className="ai-kicker"><Sparkles size={14} />{t('eyebrow')}</span>
        <h2>{t('title')}</h2>
        <p>{t('description')}</p>
        {!desktop && <span className="ai-preview-note"><CircleAlert size={15} />{t('preview')}</span>}
        <span className="ai-safety-note"><ShieldCheck size={15} />{t('safety')}</span>
      </div>
      <div className="ai-picker">
        <div className="ai-picker-path" title={source}><FolderOpen size={17} /><span>{source || t('noFolder')}</span></div>
        <small className="ai-drop-hint">{t('drop')}</small>
        <div className="ai-picker-actions">
          <button type="button" className="ai-button secondary" onClick={() => void chooseFolder()} disabled={!desktop || busy}>{t('choose')}</button>
          {busy
            ? <button type="button" className="ai-button danger" onClick={cancel}><Square size={14} />{t('cancel')}</button>
            : <button type="button" className="ai-button primary" onClick={() => void start()} disabled={!desktop || !source}>{t('start')}</button>}
        </div>
      </div>
    </div>

    <div className="ai-progress-card" aria-live="polite">
      <div className="ai-progress-heading">
        <span>{statusLine}{busy && <LoaderCircle className="spin" size={14} />}</span>
        <strong>{phase === 'scanning' ? processed : `${percent}%`}</strong>
      </div>
      <div className="ai-progress-track" role="progressbar" aria-label={t('progress')} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={phase === 'analyzing' || phase === 'done' ? percent : undefined}>
        <span className={phase === 'scanning' ? 'indeterminate' : ''} style={phase === 'scanning' ? undefined : { width: `${percent}%` }} />
      </div>
      {phase === 'scanning' && <p className="ai-progress-note">{t('filesScanned')}: {processed}</p>}
      {rule && phase === 'analyzing' && <p className="ai-progress-note">{t('ruleProgress')}: {rule.index} / {rule.total}</p>}
      {errorText && <p className="ai-error" role="alert">{errorText}</p>}
    </div>

    {report && <div className="ai-results-layout">
      <div className="ai-results-main">
      <section className="card ai-summary">
        <div className="ai-stats">
          <div><strong>{report.totalFiles}</strong><span>{t('totalFiles')}</span></div>
          <div className="critical"><strong>{issuesBySeverity('critical')}</strong><span>{t('critical')}</span></div>
          <div className="warning"><strong>{issuesBySeverity('warning')}</strong><span>{t('warning')}</span></div>
          <div className="suggestion"><strong>{issuesBySeverity('suggestion')}</strong><span>{t('suggestion')}</span></div>
          <div><strong>{report.uncheckedFiles.length}</strong><span>{t('unchecked')}</span></div>
        </div>
        <p className="ai-meta">{report.rootName} · {formatBytes(report.totalSize)} · {t('duration')} {(report.durationMs / 1000).toFixed(1)}s</p>
        {report.status === 'partial' && <p className="ai-error">{t('partial')}</p>}
      </section>

      <section className="card ai-findings">
        <div className="ai-panel-heading"><span className="ai-panel-icon amber"><FileSearch size={19} /></span><div><h3>{t('findings')}</h3></div><div className="ai-export-actions"><button type="button" className="ai-button secondary ai-export" onClick={() => void exportReport('json')}><Download size={14} />{t('export')}</button><button type="button" className="ai-button secondary ai-export" onClick={() => void exportReport('html')}><Download size={14} />{t('exportHtml')}</button></div></div>
        <div className="ai-filters"><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder={t('search')} aria-label={t('search')} /><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} aria-label={t('findings')}><option value="all">{t('all')}</option>{severityOrder.map(severity => <option key={severity} value={severity}>{t(severity)}</option>)}</select></div>
        {report.issues.length === 0 && <p className="ai-empty">{t('noFindings')}</p>}
        {report.issues.length > 0 && visibleIssues.length === 0 && <p className="ai-empty">{t('noMatches')}</p>}
        {visibleIssues.map((issue, position) => {
          const copyFor = codes[issue.code];
          const shownFiles = issue.files.slice(0, FILE_LIMIT);
          return <article className={`ai-issue ${issue.severity}`} key={`${issue.code}-${position}`}>
            <header>
              <span className={`ai-badge ${issue.severity}`}>{t(issue.severity)}</span>
              <strong>{copyFor ? copyFor.title[index] : issue.title}</strong>
              <span className="ai-rule-id">{issue.ruleId}</span>
            </header>
            <div className="ai-issue-body">
              <p className="ai-label">{t('files')}</p>
              <ul>{shownFiles.map(file => <li key={file}>{file}<button type="button" className="ai-locate" onClick={() => void locate(file)}>{t('locate')}</button></li>)}
                {issue.files.length > FILE_LIMIT && <li className="ai-more">{t('moreFiles').replace('{n}', String(issue.files.length - FILE_LIMIT))}</li>}</ul>
              <p className="ai-label">{t('evidence')}</p>
              <ul className="ai-evidence">{issue.evidence.map(line => <li key={line}>{line}</li>)}</ul>
              {copyFor && <><p className="ai-label">{t('tip')}</p><p>{copyFor.tip[index]}</p></>}
            </div>
          </article>;
        })}
      </section>

      <section className="card ai-coverage">
        <div className="ai-panel-heading"><span className="ai-panel-icon"><ShieldCheck size={19} /></span><div><h3>{t('coverage')}</h3><p>{t('coverageHint')}</p></div></div>
        <div className="ai-rule-list">
          {report.rules.map(item => {
            const name = rules[item.ruleId as keyof typeof rules];
            return <div className={`ai-rule-chip ${item.status}`} key={item.ruleId}>
              <strong>{item.ruleId}</strong><span>{name ? name[index] : item.coverage}</span>
              {item.status === 'passed' && <Check size={13} />}
            </div>;
          })}
        </div>
        {report.uncheckedFiles.length > 0 && <>
          <p className="ai-label">{t('uncheckedFiles')}</p>
          <ul className="ai-evidence">{report.uncheckedFiles.slice(0, FILE_LIMIT).map(item => <li key={item.file}>{item.file} · {item.reason}</li>)}</ul>
        </>}
      </section>
      </div>
      <aside className="ai-results-aside">
        <AiChat language={language} active={active} report={report} profile={profile} onOpenSettings={onOpenSettings} />
      </aside>
    </div>}
  </section>;
}
