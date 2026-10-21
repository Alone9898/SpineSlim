import { useEffect, useState } from 'react';
import { ArrowRight, Check, CircleAlert, FileSearch, FolderSearch, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import type { Language } from '../types';
import './ai.css';

const copy = {
  eyebrow: ['AI 资源体检 · 交互预览', 'AI ASSET AUDIT · INTERACTIVE PREVIEW'],
  title: ['一键体检，让资源更安心', 'One click to inspect your assets'],
  description: ['未来将自动梳理资源结构、识别重复与异常，并给出可执行的清理建议。', 'A future scan will inspect asset structure, find duplicates and issues, and suggest safe cleanup actions.'],
  preview: ['功能预览 · 暂未接入真实项目扫描', 'Preview only · real project scanning is not connected'],
  safety: ['文件始终留在本地；当前演示不会读取、修改或上传素材。', 'Files stay on your device. This preview does not read, change or upload assets.'],
  start: ['体验扫描动效', 'Preview scan animation'],
  again: ['重新体验', 'Replay preview'],
  reset: ['停止演示', 'Stop preview'],
  ready: ['准备就绪', 'Ready to preview'],
  done: ['演示完成', 'Preview complete'],
  progress: ['演示进度', 'Preview progress'],
  logs: ['分析日志', 'Analysis log'],
  logsHint: ['下列内容为流程示例，不代表对本机文件的检查结果。', 'The following entries demonstrate the flow; they are not findings from local files.'],
  risk: ['风险项目', 'Potential risks'],
  riskHint: ['示例风险 · 后续接入真实扫描后才会生成项目报告', 'Sample risks · a real project report will require the future scan engine'],
  pending: ['等待开始演示', 'Waiting for preview'],
  sample: ['示例', 'SAMPLE'],
  step1: ['建立资源清单', 'Build asset inventory'],
  step2: ['检查重复与未引用资源', 'Check duplicates and unused assets'],
  step3: ['评估格式与体积', 'Review formats and sizes'],
  step4: ['整理风险与建议', 'Prepare risks and recommendations'],
  log1: ['正在准备资源体检流程…', 'Preparing the asset audit flow…'],
  log2: ['检查资源引用与重复项的分析阶段', 'Demonstrating reference and duplicate analysis'],
  log3: ['检查纹理、音频与动画的优化机会', 'Demonstrating texture, audio and animation checks'],
  log4: ['生成示例风险与处理建议', 'Preparing sample risks and recommendations'],
  log5: ['演示结束；未读取、修改或上传任何项目文件', 'Preview complete; no project files were read, changed or uploaded'],
  risk1: ['疑似重复资源', 'Possible duplicate assets'],
  risk1Detail: ['建议先核对引用关系，再决定是否合并或删除。', 'Check references before merging or deleting assets.'],
  risk2: ['贴图体积偏大', 'Oversized textures'],
  risk2Detail: ['可比较压缩前后画质，并按平台选择输出格式。', 'Compare image quality and choose an output format for each platform.'],
  risk3: ['未使用资源待确认', 'Unused assets to review'],
  risk3Detail: ['需要结合项目引用信息验证，不自动删除。', 'Verify against project references; never delete automatically.'],
} as const;

type CopyKey = keyof typeof copy;

export default function AiAudit({ language }: { language: Language }) {
  const t = (key: CopyKey) => copy[key][language === 'en' ? 1 : 0];
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const steps = [
    { at: 0, key: 'step1', log: 'log1' },
    { at: 25, key: 'step2', log: 'log2' },
    { at: 52, key: 'step3', log: 'log3' },
    { at: 78, key: 'step4', log: 'log4' },
  ] as const;
  const activeStep = progress >= 78 ? 3 : progress >= 52 ? 2 : progress >= 25 ? 1 : 0;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setProgress(previous => {
        const next = Math.min(100, previous + 2);
        if (next === 100) {
          window.clearInterval(timer);
          setRunning(false);
          setCompleted(true);
        }
        return next;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [running]);

  const start = () => {
    if (running) return;
    setProgress(0);
    setCompleted(false);
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setProgress(0);
    setCompleted(false);
  };

  return <section className="ai-audit">
    <div className="ai-hero">
      <div className="ai-hero-copy">
        <span className="ai-kicker"><Sparkles size={14} />{t('eyebrow')}</span>
        <h2>{t('title')}</h2>
        <p>{t('description')}</p>
        <span className="ai-preview-note"><CircleAlert size={15} />{t('preview')}</span>
        <span className="ai-safety-note"><ShieldCheck size={15} />{t('safety')}</span>
      </div>
      <div className="ai-visual">
        <button className={`ai-orb${running ? ' is-running' : ''}`} type="button" onClick={start} disabled={running}
          aria-label={t(completed ? 'again' : 'start')} title={t(completed ? 'again' : 'start')}>
          <span className="ai-orb-halo" />
          <span className="ai-orb-outer" />
          <span className="ai-orb-middle" />
          <span className="ai-orb-core"><Sparkles size={30} strokeWidth={1.8} /></span>
        </button>
        <span className="ai-orb-caption">{running ? t(steps[activeStep].key) : completed ? t('done') : t('ready')}</span>
      </div>
      <div className="ai-hero-actions">
        <button type="button" className="ai-start" onClick={start} disabled={running}>
          {completed ? t('again') : t('start')}<ArrowRight size={18} />
        </button>
        {running && <button type="button" className="ai-stop" onClick={stop}><RotateCcw size={15} />{t('reset')}</button>}
      </div>
    </div>

    <div className="ai-progress-card" aria-live="polite">
      <div className="ai-progress-heading"><span>{t('progress')}</span><strong>{progress}%</strong></div>
      <div className="ai-progress-track" role="progressbar" aria-label={t('progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="ai-steps">
        {steps.map((step, index) => <div key={step.key} className={`ai-step${progress >= step.at && (running || completed) ? ' is-active' : ''}`}>
          <span className="ai-step-icon">{progress >= steps[index + 1]?.at || completed ? <Check size={13} /> : index + 1}</span>
          <span>{t(step.key)}</span>
        </div>)}
      </div>
    </div>

    <div className="ai-details">
      <section className="card ai-log-card">
        <div className="ai-panel-heading"><span className="ai-panel-icon"><FolderSearch size={19} /></span><div><h3>{t('logs')}</h3><p>{t('logsHint')}</p></div></div>
        <div className="ai-log-list" role="log">
          {!running && !completed ? <p className="ai-empty">{t('pending')}</p> : <>
            {steps.filter(step => progress >= step.at).map((step, index) => <div className="ai-log-line" key={step.log}>
              <span>{String(index + 1).padStart(2, '0')}</span><span className="ai-log-dot" /><p>{t(step.log)}</p>
            </div>)}
            {completed && <div className="ai-log-line"><span>05</span><span className="ai-log-dot complete" /><p>{t('log5')}</p></div>}
          </>}
        </div>
      </section>
      <section className="card ai-risk-card">
        <div className="ai-panel-heading"><span className="ai-panel-icon amber"><ShieldCheck size={19} /></span><div><h3>{t('risk')}</h3><p>{t('riskHint')}</p></div></div>
        {completed ? <div className="ai-risk-list">
          {(['risk1', 'risk2', 'risk3'] as const).map((key, index) => <div className="ai-risk-item" key={key}>
            <span className="ai-risk-symbol">{index === 0 ? <FileSearch size={16} /> : <CircleAlert size={16} />}</span>
            <div><strong>{t(key)}</strong><p>{t((`${key}Detail`) as CopyKey)}</p></div>
            <span className="ai-sample">{t('sample')}</span>
          </div>)}
        </div> : <div className="ai-risk-empty"><ShieldCheck size={27} /><p>{t('pending')}</p></div>}
      </section>
    </div>
  </section>;
}
