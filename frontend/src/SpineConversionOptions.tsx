import type { Settings } from './types';
import { translate } from './i18n';

const versions = ['3.8.99', '4.0.64', '4.1.24', '4.2.11'];

export default function SpineConversionOptions({ settings, patch }: {
  settings: Settings;
  patch: (value: Partial<Settings>) => void;
}) {
  const t = (key: string) => translate(settings.language, key);
  const advanced = settings.spine_conversion_mode === 'advanced';
  return <div className="spine-conversion-options">
    <label className="field"><span>{t('spineConversion')}</span><select value={settings.spine_conversion_mode} onChange={event => patch({ spine_conversion_mode: event.target.value as Settings['spine_conversion_mode'] })}>
      <option value="upgrade">{t('conversionUpgrade')}</option>
      <option value="off">{t('conversionOff')}</option>
      <option value="advanced">{t('conversionAdvanced')}</option>
    </select></label>
    {settings.spine_conversion_mode === 'upgrade' && <p className="hint">{t('upgradeHint')}</p>}
    {advanced && <><div className="option-row"><label className="field"><span>{t('spineTargetVersion')}</span><input list="spine-target-versions" value={settings.spine_target_version} onChange={event => patch({ spine_target_version: event.target.value })} placeholder="4.2.11" /><datalist id="spine-target-versions">{versions.map(version => <option key={version} value={version} />)}</datalist></label><label className="field"><span>{t('spineOutputFormat')}</span><select value={settings.spine_output_format} onChange={event => patch({ spine_output_format: event.target.value as Settings['spine_output_format'] })}><option value="original">{t('skeletonOriginal')}</option><option value="json">{t('skeletonJson')}</option><option value="skel">{t('skeletonSkel')}</option></select></label></div><p className="hint">{t('conversionWarning')}</p></>}
  </div>;
}
