import type { SmartDeviceConfig, SmartDeviceGroup, SmartDeviceType } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
  devices: SmartDeviceConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

const GROUPS: SmartDeviceGroup[] = ['kitchen', 'climate', 'cleaning', 'security', 'entertainment', 'other'];
const TYPE_ICONS: Record<SmartDeviceType, string> = {
  coffeeMaker: '\u2615',
  fan: '\u224B',
  vacuum: '\u25C9',
  airPurifier: '\u25A5',
  humidifier: '\u224B',
  speaker: '\u266B',
  camera: '\u25C9',
  generic: '\u25A3',
};

export default function SmartDeviceList({ devices, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  const t = useTranslation();
  if (!devices.length) {
    return (
      <div className="list-empty">
        {t('list.noSmartDevices')}<br />
        <span dangerouslySetInnerHTML={{ __html: t('list.clickAddSmartDevice') }} />
      </div>
    );
  }

  return (
    <>
      {GROUPS.map((group) => {
        const entries = devices.map((device, index) => ({ device, index })).filter(({ device }) => device.group === group);
        if (!entries.length) return null;
        return (
          <div className="smart-device-group" key={group}>
            <div className="smart-device-group-title">{t(`smartDevices.group.${group}`)} ({entries.length})</div>
            {entries.map(({ device, index }) => (
              <div
                key={device.id}
                className={`light-item${selectedIdx === index ? ' selected' : ''}`}
                onClick={() => onSelect(index)}
              >
                <div className="light-item-icon">{TYPE_ICONS[device.type]}</div>
                <div className="light-item-info">
                  <div className="light-item-name">{device.label || device.entityId}</div>
                  <div className="light-item-meta">{device.entityId} &middot; {t(`smartDevices.type.${device.type}`)}</div>
                </div>
                <button className="light-item-dup" title={t('common.duplicate')} onClick={(event) => { event.stopPropagation(); onDuplicate(index); }}>&#x29C9;</button>
                <button className="light-item-del" title={t('common.delete')} onClick={(event) => { event.stopPropagation(); onDelete(index); }}>&times;</button>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
