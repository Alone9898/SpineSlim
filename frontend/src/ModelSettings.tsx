import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { translate } from './i18n';
import { createProfile } from './types';
import type { Language, ModelPreset, ModelProfile, Settings } from './types';

const CUSTOM = 'custom';
const protocolKeys = ['protocolOpenAI', 'protocolAnthropic', 'protocolGemini'];
const protocolValues = ['openai_compatible', 'anthropic', 'gemini'];

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'ok' } | { state: 'error'; key: string };
type KeyStatus = { saved: boolean; hint: string };

export default function ModelSettings({ language, settings, patch, busy, desktop }: {
  language: Language; settings: Settings; patch: (value: Partial<Settings>) => void; busy: boolean; desktop: boolean;
}) {
  const t = (key: string) => translate(language, key);
  const profiles = settings.models;
  const [selectedId, setSelectedId] = useState(settings.active_model);
  const selected = profiles.find(profile => profile.id === selectedId) ?? profiles[0];
  const [providers, setProviders] = useState<ModelPreset[]>([]);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ saved: false, hint: '' });
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [listState, setListState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [listError, setListError] = useState('');
  const preset = providers.find(item => item.provider_id === selected.provider);
  const isCustom = selected.provider === CUSTOM;
  const presetName = (profile: ModelProfile) => profile.name || providers.find(item => item.provider_id === profile.provider)?.name || profile.provider;

  useEffect(() => {
    if (!desktop) return;
    invoke<{ providers: ModelPreset[] }>('model_query', { action: 'providers', options: {} })
      .then(result => setProviders(result.providers))
      .catch(() => setProviders([]));
  }, [desktop]);

  useEffect(() => {
    // Fill an empty profile with its preset defaults; user edits are never overwritten.
    if (selected.provider === CUSTOM || selected.base_url || selected.model || !providers.length) return;
    update(presetFields(selected.provider, selected));
  }, [selected.id, providers]);

  useEffect(() => {
    setKeyDraft('');
    setKeyError('');
    setCheck({ state: 'idle' });
    setModels([]);
    setListState('idle');
    if (!desktop) return;
    invoke<KeyStatus>('model_key_status', { profileId: selected.id })
      .then(setKeyStatus)
      .catch(reason => { setKeyStatus({ saved: false, hint: '' }); setKeyError(String(reason)); });
  }, [selected.id, desktop]);

  const writeProfiles = (next: ModelProfile[], active = settings.active_model) => {
    patch({ models: next, active_model: next.some(profile => profile.id === active) ? active : next[0].id });
  };
  const update = (value: Partial<ModelProfile>) => {
    setCheck({ state: 'idle' });
    writeProfiles(profiles.map(profile => profile.id === selected.id ? { ...profile, ...value } : profile));
  };
  const selectProvider = (provider: string) => {
    update(presetFields(provider, selected));
  };
  const presetFields = (provider: string, fallback: ModelProfile) => {
    const next = providers.find(item => item.provider_id === provider);
    return next
      ? { provider, base_url: next.base_url, model: next.model_hint, protocol: next.protocol }
      : { provider, base_url: '', model: '', protocol: fallback.protocol };
  };
  const addProfile = () => {
    const blank = createProfile();
    const profile = { ...blank, ...presetFields(blank.provider, blank) };
    writeProfiles([...profiles, profile]);
    setSelectedId(profile.id);
  };
  const removeProfile = async () => {
    if (keyStatus.saved) {
      try { await invoke('delete_model_key', { profileId: selected.id }); } catch (reason) { setKeyError(String(reason)); return; }
    }
    const remaining = profiles.filter(profile => profile.id !== selected.id);
    const next = remaining.length ? remaining : [createProfile()];
    writeProfiles(next, settings.active_model === selected.id ? next[0].id : settings.active_model);
    setSelectedId(next[0].id);
  };
  const fetchModels = async () => {
    setListState('loading');
    setListError('');
    try {
      const result = await invoke<{ models: string[] }>('fetch_model_list', {
        profileId: selected.id,
        baseUrl: selected.base_url || preset?.base_url || '',
        protocol: selected.protocol,
      });
      setModels(result.models);
      setListState('idle');
    } catch (reason) {
      setModels([]);
      setListError(String(reason));
      setListState('error');
    }
  };
  const validate = async () => {
    setCheck({ state: 'checking' });
    try {
      await invoke('model_query', { action: 'validate', options: { ...selected } });
      setCheck({ state: 'ok' });
    } catch (reason) {
      setCheck({ state: 'error', key: String(reason) });
    }
  };
  const saveKey = async () => {
    setKeyBusy(true);
    setKeyError('');
    try {
      await invoke('save_model_key', { profileId: selected.id, key: keyDraft });
      setKeyDraft('');
      setKeyStatus(await invoke<KeyStatus>('model_key_status', { profileId: selected.id }));
    } catch (reason) {
      setKeyError(String(reason));
    } finally {
      setKeyBusy(false);
    }
  };
  const clearKey = async () => {
    setKeyBusy(true);
    setKeyError('');
    try {
      await invoke('delete_model_key', { profileId: selected.id });
      setKeyStatus({ saved: false, hint: '' });
    } catch (reason) {
      setKeyError(String(reason));
    } finally {
      setKeyBusy(false);
    }
  };

  return (
    <section className="card model-settings">
      <fieldset className="mf-form" disabled={busy}>
        <div className="mf-list-heading">
          <span>{t('modelList')}</span>
          <button type="button" className="mf-link" onClick={addProfile}><Plus size={13} />{t('addModel')}</button>
        </div>
        <div className="mf-profiles" role="radiogroup" aria-label={t('modelList')}>
          {profiles.map(profile => <button type="button" key={profile.id} role="radio" aria-checked={profile.id === selected.id}
            className={`mf-profile${profile.id === selected.id ? ' is-selected' : ''}`} onClick={() => setSelectedId(profile.id)}>
            <span>{presetName(profile)}</span>
            {profile.id === settings.active_model && <b><Check size={11} />{t('activeModel')}</b>}
          </button>)}
        </div>

        <div className="mf-grid">
          <label className="field"><span>{t('profileName')}</span>
            <input value={selected.name} placeholder={preset?.name ?? ''} onChange={event => update({ name: event.target.value })} />
          </label>
          <label className="field"><span>{t('modelProvider')}</span>
            <select value={selected.provider} onChange={event => selectProvider(event.target.value)}>
              {providers.map(item => <option key={item.provider_id} value={item.provider_id}>{item.name}</option>)}
              <option value={CUSTOM}>{t('customProvider')}</option>
            </select>
          </label>
        </div>

        <div className="mf-grid">
          <label className="field"><span>{t('modelProtocol')}</span>
            <select value={selected.protocol} onChange={event => update({ protocol: event.target.value })} disabled={!isCustom && !!preset}>
              {protocolValues.map((value, index) => <option key={value} value={value}>{t(protocolKeys[index])}</option>)}
            </select>
          </label>
          <label className="field"><span className="mf-label-row">{t('modelName')}
              <button type="button" className="mf-link" disabled={!desktop || listState === 'loading' || !keyStatus.saved} title={keyStatus.saved ? '' : t('fetchNeedsKey')} onClick={() => void fetchModels()}>
                {listState === 'loading' && <LoaderCircle className="spin" size={13} />}{t('fetchModels')}
              </button></span>
            <input value={selected.model} list="mf-model-options" placeholder={preset?.model_hint ?? ''} onChange={event => update({ model: event.target.value })} />
            <datalist id="mf-model-options">{models.map(name => <option key={name} value={name} />)}</datalist>
            {listState === 'error' && <span className="mf-error" role="alert">{t(listError)}</span>}
          </label>
        </div>

        <div className="field">
          <div className="mf-label-row">
            <span>{t('apiKey')}</span>
            <span className="mf-key-state">{keyStatus.saved ? `${t('keySaved')} ····${keyStatus.hint}` : t('keyNotSaved')}</span>
          </div>
          <div className="mf-key-row">
            <input type="password" autoComplete="off" value={keyDraft} disabled={!desktop || keyBusy}
              placeholder={keyStatus.saved ? t('keyReplace') : t('keyPlaceholder')} onChange={event => setKeyDraft(event.target.value)} />
            <button type="button" className="mf-small primary" disabled={!desktop || keyBusy || !keyDraft.trim()} onClick={() => void saveKey()}>
              {keyBusy && <LoaderCircle className="spin" size={13} />}{t('saveKey')}
            </button>
            {keyStatus.saved && <button type="button" className="mf-small" disabled={!desktop || keyBusy} onClick={() => void clearKey()}>{t('clearKey')}</button>}
          </div>
          {keyError && <p className="mf-error" role="alert">{t(keyError)}</p>}
        </div>

        <div className="field">
          <div className="mf-label-row">
            <span>{t('modelBaseUrl')}</span>
            <button type="button" className="mf-link" disabled={!desktop || check.state === 'checking'} onClick={() => void validate()}>
              {check.state === 'checking' && <LoaderCircle className="spin" size={13} />}{t('validateModel')}
            </button>
          </div>
          <input value={selected.base_url} placeholder={preset?.base_url ?? 'https://'} onChange={event => update({ base_url: event.target.value })} />
        </div>
        <p className="mf-hint">{t('baseUrlHint')}</p>

        <div className="mf-actions">
          <button type="button" className="mf-small" disabled={selected.id === settings.active_model} onClick={() => writeProfiles(profiles, selected.id)}>{t('setActive')}</button>
          <button type="button" className="mf-small danger" onClick={() => void removeProfile()}><Trash2 size={13} />{t('deleteModel')}</button>
        </div>
      </fieldset>
      {check.state === 'ok' && <p className="hint" role="status">{t('modelValid')}</p>}
      {check.state === 'error' && <p className="hint" role="alert">{t(check.key)}</p>}
    </section>
  );
}
