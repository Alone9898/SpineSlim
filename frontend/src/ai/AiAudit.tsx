import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Check, CircleAlert, FileSearch, FolderOpen, LoaderCircle, ShieldCheck, Sparkles, Square } from 'lucide-react';
import type { Language, WorkerEvent } from '../types';
import './ai.css';

const desktop = isTauri();
const FILE_LIMIT = 20;

const copy = {
  eyebrow: ['AI 资源体检 · 本地检测', 'AI ASSET AUDIT · LOCAL CHECKS'],
  title: ['检查游戏资源质量', 'Check game asset quality'],
  description: ['选择资源目录，本地检查重复文件、缺失依赖、尺寸与命名问题，每项都附带证据。', 'Pick an asset folder to check locally for duplicates, missing dependencies, size and naming issues. Each finding includes evidence.'],
  safety: ['全程在本机运行，不联网、不上传，也不会修改原文件。', 'Runs entirely on this device. Nothing is uploaded, and original files are never modified.'],
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
  R07: ['文件体积', 'File size'],
  R08: ['命名规范', 'Naming'],
  R09: ['Spine 结构', 'Spine structure'],
} as const;

const codes: Record<string, { title: [string, string]; tip: [string, string] }> = {
  duplicate_files: { title: ['精确重复文件', 'Exact duplicate files'], tip: ['核对引用关系后，保留一份即可。', 'Check references, then keep one copy.'] },
  atlas_missing_page: { title: ['图集引用的纹理缺失', 'Atlas references a missing texture'], tip: ['恢复纹理，或重新导出图集。', 'Restore the texture or re-export the atlas.'] },
  image_oversized: { title: ['图片尺寸超过阈值', 'Image exceeds size threshold'], tip: ['确认显示尺寸是否需要该分辨率。', 'Check whether the display size needs this resolution.'] },
  file_oversized: { title: ['文件体积超过阈值', 'File exceeds size threshold'], tip: ['检查压缩与格式选择。文件大小不等于运行性能。', 'Review compression and format. File size alone does not mean runtime cost.'] },
  name_case_collision: { title: ['文件名仅大小写不同', 'Names differ only by case'], tip: ['重命名，使其在大小写不敏感的系统中也唯一。', 'Rename so names stay unique on case-insensitive systems.'] },
  name_special_chars: { title: ['文件名含空格或特殊字符', 'File name has spaces or special characters'], tip: ['建议使用字母、数字、点、短横线或下划线。', 'Use letters, digits, dots, dashes or underscores.'] },
  spine_json_invalid: { title: ['Spine JSON 结构不完整', 'Spine JSON structure is incomplete'], tip: ['从 Spine 重新导出骨架。', 'Re-export the skeleton from Spine.'] },
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

export default function AiAudit({ language }: { language: Language }) {
  const index = language === 'en' ? 1 : 0;
  const t = (key: keyof typeof copy) => copy[key][index];
  const [source, setSource] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [processed, setProcessed] = useState(0);
  const [rule, setRule] = useState<{ index: number; total: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [errorKey, setErrorKey] = useState('');
  const taskRef = useRef('');
  const busy = phase === 'scanning' || phase === 'analyzing';

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

  const chooseFolder = async () => {
    if (!desktop || busy) return;
    const selection = await open({ directory: true, multiple: false, title: t('choose') });
    if (typeof selection === 'string') setSource(selection);
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

  const issuesBySeverity = (severity: Severity) => report?.issues.filter(issue => issue.severity === severity).length ?? 0;
  const statusLine = phase === 'done' && report ? t(report.status === 'partial' ? 'partial' : 'completed')
    : phase === 'done' ? t('done')
      : phase === 'cancelled' ? t('cancelled')
        : phase === 'failed' ? t('failed')
          : phase === 'scanning' ? t('scanning')
            : phase === 'analyzing' ? t('analyzing') : t('idle');
  const percent = rule && rule.total > 0 ? Math.round((rule.index / rule.total) * 100) : phase === 'done' ? 100 : 0;
  const errorText = errorKey ? (copy[errorKey as keyof typeof copy]?.[index] ?? t('error')) : '';

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

    {report && <>
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
        <div className="ai-panel-heading"><span className="ai-panel-icon amber"><FileSearch size={19} /></span><div><h3>{t('findings')}</h3></div></div>
        {report.issues.length === 0 && <p className="ai-empty">{t('noFindings')}</p>}
        {severityOrder.flatMap(severity => report.issues.filter(issue => issue.severity === severity)).map((issue, position) => {
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
              <ul>{shownFiles.map(file => <li key={file}>{file}</li>)}
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
    </>}
  </section>;
}
