import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { LoaderCircle, MessageCircle, Send, Settings2, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Language, ModelProfile } from '../types';
import { buildAuditSummary, type AuditSummary } from './summary';

type Message = { role: 'user' | 'assistant'; content: string };

const copy = {
  title: ['AI 对话分析', 'AI audit chat'],
  description: ['基于当前体检结果提问，获取风险解释和优化建议。', 'Ask about this audit for risk explanations and optimization ideas.'],
  model: ['当前模型', 'Selected model'],
  setup: ['请先在设置中选择模型并保存 API Key。', 'Choose a model and save an API key in Settings first.'],
  settings: ['打开设置', 'Open settings'],
  privacy: ['只有点击发送后，问题、对话历史和下方摘要才会发给所选模型服务。可能产生模型费用；原始文件不会上传。', 'Only Send transmits your question, chat history and the summary below to the selected model service. Provider charges may apply. Original files are never uploaded.'],
  includeNames: ['附带相对文件名与问题证据（可选）', 'Include relative file names and evidence (optional)'],
  shared: ['即将发送的体检摘要', 'Audit summary to be sent'],
  placeholder: ['例如：哪些问题应该先修复？', 'For example: Which issues should I fix first?'],
  send: ['发送', 'Send'],
  noKey: ['未保存 API Key，请到设置中配置。', 'No API key is saved. Configure one in Settings.'],
  no_api_key: ['API Key 已不可用，请到设置中重新保存。', 'The API key is no longer available. Save it again in Settings.'],
  noModel: ['请先设置模型名称和 HTTPS 地址。', 'Set a model name and HTTPS endpoint first.'],
  invalid_base_url: ['接口地址无效，请到设置中检查。', 'The endpoint is invalid. Check it in Settings.'],
  invalid_model: ['模型名称无效，请到设置中检查。', 'The model name is invalid. Check it in Settings.'],
  invalid_protocol: ['模型协议无效，请到设置中检查。', 'The model protocol is invalid. Check it in Settings.'],
  ai_unauthorized: ['模型密钥无效或没有权限。', 'The model key is invalid or unauthorized.'],
  ai_rate_limited: ['模型服务限流，请稍后重试。', 'The model service is rate limiting requests. Try again later.'],
  ai_http_error: ['模型服务返回错误，请检查模型名称与接口地址。', 'The model service returned an error. Check the model and endpoint.'],
  ai_network: ['无法连接模型服务，请检查网络和接口地址。', 'Could not connect to the model service. Check the network and endpoint.'],
  ai_network_timeout: ['模型服务响应超时，请稍后重试。', 'The model service timed out. Try again later.'],
  ai_network_tls: ['模型服务的安全连接失败，请检查系统时间和证书。', 'The secure connection failed. Check the system time and certificates.'],
  ai_network_dns: ['无法解析模型服务地址，请检查 DNS 或代理设置。', 'Could not resolve the model service. Check DNS or proxy settings.'],
  ai_network_proxy: ['代理连接失败，请检查系统或环境变量中的代理设置。', 'The proxy connection failed. Check system or environment proxy settings.'],
  ai_network_connect: ['无法建立模型服务连接，请检查网络、代理或防火墙。', 'Could not connect to the model service. Check the network, proxy or firewall.'],
  ai_bad_response: ['模型返回内容无法解析。', 'The model response could not be parsed.'],
  error: ['发送失败，请检查模型设置。', 'The request failed. Check model settings.'],
} as const;

export default function AiChat({ language, active, report, profile, onOpenSettings }: {
  language: Language; active: boolean; report: AuditSummary; profile: ModelProfile | undefined; onOpenSettings: () => void;
}) {
  const index = language === 'en' ? 1 : 0;
  const t = (key: keyof typeof copy) => copy[key][index];
  const [includeNames, setIncludeNames] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const sendingRef = useRef(false);
  const summary = buildAuditSummary(report, includeNames);
  const modelReady = Boolean(profile?.model.trim() && profile.base_url.startsWith('https://'));

  useEffect(() => {
    setMessages([]);
    setQuestion('');
  }, [profile?.id, report]);

  useEffect(() => {
    let alive = true;
    if (active && profile && isTauri()) {
      setKeySaved(false);
      invoke<{ saved: boolean }>('model_key_status', { profileId: profile.id })
        .then(result => { if (alive) setKeySaved(result.saved); })
        .catch(() => { if (alive) setKeySaved(false); });
    }
    return () => { alive = false; };
  }, [active, profile?.id, report]);

  const send = async () => {
    const content = question.trim();
    if (!profile || !modelReady || !keySaved || !content || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    const turns = [...messages, { role: 'user' as const, content }].slice(-8).map(message => ({ ...message, content: message.content.slice(0, 6000) }));
    setQuestion('');
    setMessages(turns);
    try {
      const result = await invoke<{ reply: string }>('audit_chat', {
        profileId: profile.id, baseUrl: profile.base_url, protocol: profile.protocol,
        model: profile.model, summary, messages: turns,
      });
      setMessages(previous => [...previous, { role: 'assistant', content: result.reply }]);
    } catch (reason) {
      setMessages(previous => previous.slice(0, -1));
      setQuestion(content);
      const key = String(reason) as keyof typeof copy;
      setError(copy[key]?.[index] ?? t('error'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return <section className="card ai-chat">
    <div className="ai-panel-heading"><span className="ai-panel-icon"><MessageCircle size={19} /></span><div><h3>{t('title')}</h3><p>{t('description')}</p></div></div>
    <p className="ai-chat-model">{t('model')}: <strong>{profile?.name ? `${profile.name} (${profile.model || '—'})` : profile?.model || '—'}</strong>{profile?.base_url && <span> · {profile.base_url}</span>}</p>
    <p className="ai-chat-privacy"><ShieldCheck size={15} />{t('privacy')}</p>
    {!modelReady || !keySaved ? <div className="ai-chat-setup"><span>{!modelReady ? t('noModel') : t('noKey')}</span><button type="button" className="ai-button secondary" onClick={onOpenSettings}><Settings2 size={14} />{t('settings')}</button></div> : null}
    <label className="ai-chat-toggle"><input type="checkbox" checked={includeNames} onChange={event => { setIncludeNames(event.target.checked); setMessages([]); }} disabled={sending} />{t('includeNames')}</label>
    <details className="ai-chat-preview"><summary>{t('shared')}</summary><pre>{summary}</pre></details>
    <div className="ai-chat-messages" role="log" aria-live="polite">{messages.map((message, position) => <div className={`ai-chat-message ${message.role}`} key={position}><span>{message.role === 'user' ? (language === 'en' ? 'You' : '你') : 'AI'}</span><div className="ai-chat-content">{message.role === 'assistant' ? <ReactMarkdown disallowedElements={['img']}>{message.content}</ReactMarkdown> : <p>{message.content}</p>}</div></div>)}</div>
    <div className="ai-chat-compose"><textarea value={question} maxLength={2000} onChange={event => setQuestion(event.target.value)} placeholder={t('placeholder')} disabled={sending || !modelReady || !keySaved} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button type="button" className="ai-button primary" disabled={sending || !question.trim() || !modelReady || !keySaved} onClick={() => void send()}>{sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{t('send')}</button></div>
    {error && <p className="ai-error" role="alert">{error}</p>}
  </section>;
}
