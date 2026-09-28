import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import type { LightPosition, SmartDeviceAction, SmartDeviceConfig, SmartDeviceGroup, SmartDeviceType } from '../types';
import { generateUUID } from '../utils/uuid';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { VectorSliderFields } from './EditorSliderControls';
import { useTranslation } from '../contexts/LanguageContext';

export interface SmartDevicePreviewInfo {
  group: SmartDeviceGroup;
  type: SmartDeviceType;
  rotation: LightPosition;
  scale: LightPosition;
}

export interface SmartDeviceFormHandle {
  updateRotation: (rotation: LightPosition) => void;
  updateScale: (scale: LightPosition) => void;
}

interface Props {
  open: boolean;
  editDevice: SmartDeviceConfig | null;
  position: LightPosition;
  onPositionChange: (position: LightPosition) => void;
  onSave: (config: SmartDeviceConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: SmartDevicePreviewInfo) => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

const ZERO = { x: 0, y: 0, z: 0 };
const ONE = { x: 1, y: 1, z: 1 };
const TYPE_GROUP: Record<SmartDeviceType, SmartDeviceGroup> = {
  coffeeMaker: 'kitchen', fan: 'climate', vacuum: 'cleaning', airPurifier: 'climate',
  humidifier: 'climate', speaker: 'entertainment', camera: 'security', generic: 'other',
};
const TYPE_ACTION: Record<SmartDeviceType, SmartDeviceAction> = {
  coffeeMaker: 'toggle', fan: 'toggle', vacuum: 'start', airPurifier: 'toggle',
  humidifier: 'toggle', speaker: 'toggle', camera: 'none', generic: 'toggle',
};
const TYPES: SmartDeviceType[] = ['coffeeMaker', 'fan', 'vacuum', 'airPurifier', 'humidifier', 'speaker', 'camera', 'generic'];
const GROUPS: SmartDeviceGroup[] = ['kitchen', 'climate', 'cleaning', 'security', 'entertainment', 'other'];
const ACTIONS: SmartDeviceAction[] = ['toggle', 'start', 'returnHome', 'press', 'none'];

const SmartDeviceForm = forwardRef<SmartDeviceFormHandle, Props>(function SmartDeviceForm({
  open, editDevice, position, onPositionChange, onSave, onClose, onEnterPlacingMode,
  onExitPlacingMode, onPreviewChange, placingMode, haEntities = [],
}, ref) {
  const t = useTranslation();
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<SmartDeviceGroup>('other');
  const [type, setType] = useState<SmartDeviceType>('generic');
  const [action, setAction] = useState<SmartDeviceAction>('toggle');
  const [rotation, setRotation] = useState<LightPosition>(ZERO);
  const [scale, setScale] = useState<LightPosition>(ONE);

  useImperativeHandle(ref, () => ({ updateRotation: setRotation, updateScale: setScale }));

  useEffect(() => {
    if (!open) return;
    setEntityId(editDevice?.entityId ?? '');
    setLabel(editDevice?.label ?? '');
    setGroup(editDevice?.group ?? 'other');
    setType(editDevice?.type ?? 'generic');
    setAction(editDevice?.action ?? 'toggle');
    setRotation(editDevice?.rotation ?? ZERO);
    setScale(editDevice?.scale ?? ONE);
  }, [editDevice, open]);

  useEffect(() => {
    if (open) onPreviewChange({ group, type, rotation, scale });
  }, [group, onPreviewChange, open, rotation, scale, type]);

  const handleSave = useCallback(() => {
    const id = entityId.trim();
    if (!id) { alert(t('common.requiredEntityId')); return; }
    onSave({
      id: editDevice?.id ?? generateUUID(), entityId: id,
      label: label.trim() || id.split('.')[1]?.replace(/_/g, ' ') || id,
      group, type, action, position, rotation, scale,
    });
  }, [action, editDevice, entityId, group, label, onSave, position, rotation, scale, t, type]);

  const footer = (
    <>
      <button className="btn btn-primary" onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}>
        {placingMode ? `\u2715 ${t('form.cancelPlacement')}` : `\u{1F4CD} ${t('form.clickModelToPlace')}`}
      </button>
      <button className="btn btn-success" onClick={handleSave}>&#10003; {t('form.saveSmartDevice')}</button>
      <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
    </>
  );

  return (
    <FormPanel open={open} title={editDevice ? t('form.editSmartDevice') : t('form.addSmartDevice')} onClose={onClose} footer={footer}>
      <AccordionSection title={t('form.identity')} defaultOpen>
        <div className="field-group">
          <label className="field-label">{t('form.entityId')}</label>
          <EntityPicker value={entityId} onChange={setEntityId} onSelect={(entity) => { if (!label && entity.friendly_name) setLabel(entity.friendly_name); }} placeholder="switch.coffee_machine" entities={haEntities} className="field-input" />
        </div>
        <div className="field-group"><label className="field-label">{t('form.label')}</label><input className="field-input" value={label} onChange={(event) => setLabel(event.target.value)} /></div>
      </AccordionSection>

      <AccordionSection title={t('smartDevices.classification')} defaultOpen>
        <div className="field-group"><label className="field-label">{t('smartDevices.group')}</label><select className="field-select" value={group} onChange={(event) => setGroup(event.target.value as SmartDeviceGroup)}>{GROUPS.map((value) => <option key={value} value={value}>{t(`smartDevices.group.${value}`)}</option>)}</select></div>
        <div className="field-group"><label className="field-label">{t('smartDevices.type')}</label><select className="field-select" value={type} onChange={(event) => { const value = event.target.value as SmartDeviceType; setType(value); setGroup(TYPE_GROUP[value]); setAction(TYPE_ACTION[value]); }}>{TYPES.map((value) => <option key={value} value={value}>{t(`smartDevices.type.${value}`)}</option>)}</select></div>
        <div className="field-group"><label className="field-label">{t('smartDevices.action')}</label><select className="field-select" value={action} onChange={(event) => setAction(event.target.value as SmartDeviceAction)}>{ACTIONS.map((value) => <option key={value} value={value}>{t(`smartDevices.action.${value}`)}</option>)}</select></div>
      </AccordionSection>

      <AccordionSection title={t('form.orientation')}><VectorSliderFields label={t('form.orientation')} value={rotation} onChange={setRotation} step={0.5} span={45} min={-180} max={180} hideLabel /></AccordionSection>
      <AccordionSection title={t('form.scale')}><VectorSliderFields label={t('form.scale')} value={scale} onChange={setScale} step={0.01} span={0.5} min={0.05} max={10} hideLabel /></AccordionSection>
      <AccordionSection title={t('form.position')} defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`} dangerouslySetInnerHTML={{ __html: t('form.placementHintModel') }} />
        <VectorSliderFields label={t('form.position')} value={position} onChange={onPositionChange} step={0.01} span={2} axisLabels={{ x: 'X', y: 'Z', z: 'Y' }} axisColors={{ x: '#f87171', y: '#4ade80', z: '#38bdf8' }} hideLabel />
      </AccordionSection>
    </FormPanel>
  );
});

export default SmartDeviceForm;
