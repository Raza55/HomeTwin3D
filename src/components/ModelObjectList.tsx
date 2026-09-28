import { useMemo, useRef, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import type { LightPosition, ModelObjectTransform } from '../types';
import { VectorSliderFields } from './EditorSliderControls';

export type ModelObjectEditMode = 'move' | 'rotate' | 'scale';

export interface ModelObjectListItem {
  id: string;
  label: string;
  kind?: 'model' | 'uploaded';
}

interface Props {
  objects: ModelObjectListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResetSelected: () => void;
  onUploadObject: (file: File) => void;
  onDeleteSelected?: () => void;
  selectedTransform?: ModelObjectTransform | null;
  onTransformChange?: (transform: Required<ModelObjectTransform>) => void;
}

const ZERO_VECTOR: LightPosition = { x: 0, y: 0, z: 0 };
const UNIT_VECTOR: LightPosition = { x: 1, y: 1, z: 1 };

function completeTransform(transform: ModelObjectTransform | null | undefined): Required<ModelObjectTransform> {
  return {
    position: transform?.position ?? ZERO_VECTOR,
    rotation: transform?.rotation ?? ZERO_VECTOR,
    scale: transform?.scale ?? UNIT_VECTOR,
  };
}

export default function ModelObjectList({
  objects,
  selectedId,
  onSelect,
  onResetSelected,
  onUploadObject,
  onDeleteSelected,
  selectedTransform,
  onTransformChange,
}: Props) {
  const t = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const selected = objects.find((obj) => obj.id === selectedId);
  const transform = selectedId ? completeTransform(selectedTransform) : null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((obj) =>
      obj.label.toLowerCase().includes(q) || obj.id.toLowerCase().includes(q),
    );
  }, [objects, query]);

  return (
    <>
      <div className="model-object-tools">
        <input
          className="field-input"
          type="search"
          placeholder={t('modelObjects.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="btn btn-ghost"
          disabled={!selectedId}
          onClick={onResetSelected}
        >
          {t('modelObjects.resetSelected')}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => uploadInputRef.current?.click()}
        >
          {t('modelObjects.uploadObject')}
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept=".glb,.gltf,.obj,.stl,.fbx"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadObject(file);
            e.target.value = '';
          }}
        />
        {selected?.kind === 'uploaded' && onDeleteSelected ? (
          <button
            className="btn btn-ghost"
            onClick={onDeleteSelected}
          >
            {t('modelObjects.deleteSelected')}
          </button>
        ) : null}
      </div>

      {transform && onTransformChange ? (
        <div className="model-object-tools" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <VectorSliderFields
            label={t('form.position')}
            value={transform.position}
            step={0.01}
            span={2}
            axisLabels={{ x: 'X', y: 'Z', z: 'Y' }}
            axisColors={{ x: '#f87171', y: '#4ade80', z: '#38bdf8' }}
            onChange={(position) => onTransformChange({ ...transform, position })}
          />
          <VectorSliderFields
            label={t('form.orientation')}
            value={transform.rotation}
            step={0.5}
            span={45}
            min={-180}
            max={180}
            onChange={(rotation) => onTransformChange({ ...transform, rotation })}
          />
          <VectorSliderFields
            label={t('form.visualScale')}
            value={transform.scale}
            min={0.001}
            max={20}
            step={0.01}
            span={0.5}
            onChange={(scale) => onTransformChange({ ...transform, scale })}
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="list-empty">{t('modelObjects.noneFound')}</div>
      ) : (
        filtered.map((obj) => (
          <button
            key={obj.id}
            className={`light-item model-object-item${selectedId === obj.id ? ' selected' : ''}`}
            onClick={() => onSelect(obj.id)}
            title={obj.id}
          >
            <span className="light-item-icon">M</span>
            <span className="light-item-info">
              <span className="light-item-name">{obj.label}</span>
              <span className="light-item-meta">
                {obj.kind === 'uploaded' ? t('modelObjects.uploaded') : obj.id}
              </span>
            </span>
          </button>
        ))
      )}
    </>
  );
}
