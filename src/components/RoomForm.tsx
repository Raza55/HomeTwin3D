import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { LightPosition, RoomConfig, RoomVirtualWall, RoomZonePoint } from '../types';
import type { HAAreaRegistryEntry, HARoomEntity } from '../services/haAreaRegistry';
import { rankRoomEntities, type RoomEntityGroup } from '../utils/roomEntityPriority';
import { AccordionSection, FormPanel } from './FormPanel';
import { SliderNumberRow, VectorSliderFields } from './EditorSliderControls';
import { useTranslation } from '../contexts/LanguageContext';
import {
  clampRoomZoneOpacity,
  DEFAULT_ROOM_ZONE_OPACITY,
  defaultRoomZoneColor,
  ROOM_ZONE_COLOR_PALETTE,
  rectangleRoomZonePoints,
} from '../babylon/RoomZoneMeshFactory';
import { Minus } from 'lucide-react';

export interface RoomPreviewInfo {
  name: string;
  size: { width: number; height: number; depth: number };
  rotation: LightPosition;
  color: string;
  opacity: number;
  points: RoomZonePoint[];
  virtualWalls: RoomVirtualWall[];
}

export interface RoomFormHandle {
  updateSize: (size: { width: number; height: number; depth: number }) => void;
  updateRotation: (rotation: LightPosition) => void;
  updateScale: (scale: LightPosition) => void;
  updatePoint: (index: number, point: RoomZonePoint) => void;
  addPoint: () => number;
  removePoint: (index: number) => void;
  resetPoints: () => void;
  applyDetectedPolygon: (points: RoomZonePoint[]) => void;
  addVirtualWall: (wall: RoomVirtualWall) => number;
  setVirtualWalls: (walls: RoomVirtualWall[]) => void;
  updateVirtualWallEndpoint: (index: number, endpoint: 'start' | 'end', point: RoomZonePoint) => void;
  removeVirtualWall: (index: number) => void;
}

interface Props {
  open: boolean;
  room: RoomConfig | null;
  isNew: boolean;
  position: LightPosition;
  areas: HAAreaRegistryEntry[];
  entities: HARoomEntity[];
  placedEntityIds: ReadonlySet<string>;
  defaultZone: { width: number; height: number; depth: number };
  hasZone: boolean;
  overlappingRoomNames: string[];
  placingMode: boolean;
  virtualWallDrawing: boolean;
  onPositionChange: (position: LightPosition) => void;
  onPreviewChange: (info: RoomPreviewInfo) => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onToggleVirtualWallDrawing: () => void;
  onSave: (room: RoomConfig) => void;
  onClose: () => void;
}

const GROUPS: RoomEntityGroup[] = ['safety', 'controls', 'climate', 'media', 'status', 'other'];

function roundPoint(point: RoomZonePoint): RoomZonePoint {
  return {
    x: parseFloat(point.x.toFixed(3)),
    z: parseFloat(point.z.toFixed(3)),
  };
}

function roundVirtualWall(wall: RoomVirtualWall): RoomVirtualWall {
  return { start: roundPoint(wall.start), end: roundPoint(wall.end) };
}

function pointBounds(points: RoomZonePoint[]): { width: number; depth: number } {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    width: Math.max(0.1, Math.max(...xs) - Math.min(...xs)),
    depth: Math.max(0.1, Math.max(...zs) - Math.min(...zs)),
  };
}

const RoomForm = forwardRef<RoomFormHandle, Props>(function RoomForm({
  open, room, isNew, position, areas, entities, placedEntityIds, defaultZone, placingMode,
  hasZone, overlappingRoomNames, virtualWallDrawing, onPositionChange, onPreviewChange,
  onEnterPlacingMode, onExitPlacingMode, onToggleVirtualWallDrawing, onSave, onClose,
}, ref) {
  const t = useTranslation();
  const [name, setName] = useState('');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [width, setWidth] = useState(defaultZone.width);
  const [height, setHeight] = useState(defaultZone.height);
  const [depth, setDepth] = useState(defaultZone.depth);
  const [rotationY, setRotationY] = useState(0);
  const [color, setColor] = useState(() => defaultRoomZoneColor(room?.id ?? 'new-room'));
  const [opacity, setOpacity] = useState(DEFAULT_ROOM_ZONE_OPACITY);
  const [points, setPoints] = useState<RoomZonePoint[] | null>(null);
  const [virtualWalls, setVirtualWalls] = useState<RoomVirtualWall[]>([]);
  const [primaryEntityIds, setPrimaryEntityIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [selectionTouched, setSelectionTouched] = useState(false);

  const roomEntities = useMemo(
    () => rankRoomEntities(entities.filter((entity) => areaIds.includes(entity.area_id)), placedEntityIds),
    [areaIds, entities, placedEntityIds],
  );

  const effectivePoints = useMemo(
    () => points ?? rectangleRoomZonePoints(width, depth),
    [depth, points, width],
  );

  const applyPointDimensions = (nextPoints: RoomZonePoint[]) => {
    const bounds = pointBounds(nextPoints);
    setWidth(parseFloat(bounds.width.toFixed(3)));
    setDepth(parseFloat(bounds.depth.toFixed(3)));
  };

  const updatePoint = (index: number, point: RoomZonePoint) => {
    const base = points ?? rectangleRoomZonePoints(width, depth);
    if (!base[index]) return;
    const next = base.map((current, currentIndex) => currentIndex === index ? roundPoint(point) : current);
    setPoints(next);
    applyPointDimensions(next);
  };

  useImperativeHandle(ref, () => ({
    updateSize: (size) => {
      setWidth(parseFloat(Math.max(0.1, size.width).toFixed(3)));
      setHeight(parseFloat(Math.max(0.01, size.height).toFixed(3)));
      setDepth(parseFloat(Math.max(0.1, size.depth).toFixed(3)));
    },
    updateRotation: (rotation) => setRotationY(parseFloat(rotation.y.toFixed(1))),
    updateScale: (scale) => {
      const scaleX = Math.max(0.001, scale.x);
      const scaleY = Math.max(0.001, scale.y);
      const scaleZ = Math.max(0.001, scale.z);
      if (points) {
        const next = points.map((point) => roundPoint({ x: point.x * scaleX, z: point.z * scaleZ }));
        setPoints(next);
        applyPointDimensions(next);
      } else {
        setWidth((current) => parseFloat(Math.max(0.1, current * scaleX).toFixed(3)));
        setDepth((current) => parseFloat(Math.max(0.1, current * scaleZ).toFixed(3)));
      }
      setVirtualWalls((current) => current.map((wall) => roundVirtualWall({
        start: { x: wall.start.x * scaleX, z: wall.start.z * scaleZ },
        end: { x: wall.end.x * scaleX, z: wall.end.z * scaleZ },
      })));
      setHeight((current) => parseFloat(Math.max(0.01, current * scaleY).toFixed(3)));
    },
    updatePoint,
    addPoint: () => {
      const base = points ?? rectangleRoomZonePoints(width, depth);
      let edgeIndex = 0;
      let longestEdge = -1;
      for (let index = 0; index < base.length; index++) {
        const next = base[(index + 1) % base.length];
        const dx = next.x - base[index].x;
        const dz = next.z - base[index].z;
        const length = dx * dx + dz * dz;
        if (length > longestEdge) {
          longestEdge = length;
          edgeIndex = index;
        }
      }
      const nextIndex = (edgeIndex + 1) % base.length;
      const inserted = roundPoint({
        x: (base[edgeIndex].x + base[nextIndex].x) / 2,
        z: (base[edgeIndex].z + base[nextIndex].z) / 2,
      });
      const insertAt = edgeIndex + 1;
      const next = [...base.slice(0, insertAt), inserted, ...base.slice(insertAt)];
      setPoints(next);
      applyPointDimensions(next);
      return insertAt;
    },
    removePoint: (index) => {
      const base = points ?? rectangleRoomZonePoints(width, depth);
      if (base.length <= 3 || !base[index]) return;
      const next = base.filter((_, currentIndex) => currentIndex !== index);
      setPoints(next);
      applyPointDimensions(next);
    },
    resetPoints: () => setPoints(null),
    applyDetectedPolygon: (detectedPoints) => {
      const next = detectedPoints.map(roundPoint);
      setPoints(next);
      setRotationY(0);
      applyPointDimensions(next);
    },
    addVirtualWall: (wall) => {
      const index = virtualWalls.length;
      setVirtualWalls((current) => [...current, roundVirtualWall(wall)]);
      return index;
    },
    setVirtualWalls: (walls) => setVirtualWalls(walls.map(roundVirtualWall)),
    updateVirtualWallEndpoint: (index, endpoint, point) => {
      setVirtualWalls((current) => current.map((wall, currentIndex) => currentIndex === index
        ? { ...wall, [endpoint]: roundPoint(point) }
        : wall));
    },
    removeVirtualWall: (index) => {
      setVirtualWalls((current) => current.filter((_, currentIndex) => currentIndex !== index));
    },
  }));

  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? '');
    setAreaIds(room?.haAreaIds ?? []);
    setWidth(room?.zone.width ?? defaultZone.width);
    setHeight(room?.zone.height ?? defaultZone.height);
    setDepth(room?.zone.depth ?? defaultZone.depth);
    setRotationY(room?.zone.rotationY ?? 0);
    setColor(room?.zone.color ?? defaultRoomZoneColor(room?.id ?? 'new-room'));
    setOpacity(clampRoomZoneOpacity(room?.zone.opacity));
    setPoints(room?.zone.points?.length ? room.zone.points.map(roundPoint) : null);
    setVirtualWalls(room?.zone.virtualWalls?.map(roundVirtualWall) ?? []);
    setPrimaryEntityIds(room?.primaryEntityIds ?? []);
    setShowAll(false);
    setSelectionTouched(!isNew);
  }, [defaultZone.depth, defaultZone.height, defaultZone.width, isNew, open, room]);

  useEffect(() => {
    if (!open || selectionTouched || !areaIds.length) return;
    setPrimaryEntityIds(roomEntities.slice(0, 8).map((entity) => entity.entity_id));
  }, [areaIds.length, open, roomEntities, selectionTouched]);

  useEffect(() => {
    if (!open) return;
    onPreviewChange({
      name,
      size: { width, height, depth },
      rotation: { x: 0, y: rotationY, z: 0 },
      color,
      opacity,
      points: effectivePoints,
      virtualWalls,
    });
  }, [color, depth, effectivePoints, height, name, onPreviewChange, opacity, open, rotationY, virtualWalls, width]);

  const handleWidthChange = (nextWidth: number) => {
    const safeWidth = Math.max(0.1, nextWidth);
    const ratio = safeWidth / Math.max(0.1, width);
    if (points) {
      setPoints(points.map((point) => roundPoint({ x: point.x * ratio, z: point.z })));
    }
    setVirtualWalls((current) => current.map((wall) => roundVirtualWall({
      start: { x: wall.start.x * ratio, z: wall.start.z },
      end: { x: wall.end.x * ratio, z: wall.end.z },
    })));
    setWidth(safeWidth);
  };

  const handleDepthChange = (nextDepth: number) => {
    const safeDepth = Math.max(0.1, nextDepth);
    const ratio = safeDepth / Math.max(0.1, depth);
    if (points) {
      setPoints(points.map((point) => roundPoint({ x: point.x, z: point.z * ratio })));
    }
    setVirtualWalls((current) => current.map((wall) => roundVirtualWall({
      start: { x: wall.start.x, z: wall.start.z * ratio },
      end: { x: wall.end.x, z: wall.end.z * ratio },
    })));
    setDepth(safeDepth);
  };

  const toggleArea = (areaId: string) => {
    const adding = !areaIds.includes(areaId);
    if (adding && (!name.trim() || name === t('rooms.newName'))) {
      const area = areas.find((entry) => entry.area_id === areaId);
      if (area) setName(area.name);
    }
    setAreaIds((current) => current.includes(areaId) ? current.filter((id) => id !== areaId) : [...current, areaId]);
  };

  const toggleEntity = (entityId: string) => {
    setSelectionTouched(true);
    setPrimaryEntityIds((current) => current.includes(entityId)
      ? current.filter((id) => id !== entityId)
      : [...current, entityId]);
  };

  const handleSave = () => {
    if (!room) return;
    if (!name.trim()) { alert(t('rooms.nameRequired')); return; }
    if (!areaIds.length) { alert(t('rooms.areaRequired')); return; }
    if (!hasZone) { alert(t('rooms.traceRequired')); return; }
    if (overlappingRoomNames.length) {
      alert(t('rooms.overlapBlocked', { rooms: overlappingRoomNames.join(', ') }));
      return;
    }
    const rankedIds = roomEntities.map((entity) => entity.entity_id);
    const orderedPrimaryIds = rankedIds.filter((entityId) => primaryEntityIds.includes(entityId));
    onSave({
      ...room,
      name: name.trim(),
      haAreaIds: areaIds,
      anchor: position,
      zone: {
        width,
        height,
        depth,
        rotationY,
        color,
        opacity,
        points: points?.map(roundPoint),
        virtualWalls: virtualWalls.length ? virtualWalls.map(roundVirtualWall) : undefined,
      },
      primaryEntityIds: orderedPrimaryIds,
    });
  };

  const visibleEntities = showAll ? roomEntities : roomEntities.slice(0, 16);
  const footer = (
    <>
      {!hasZone && (
        <button
          className={`btn btn-ghost room-boundary-action${virtualWallDrawing ? ' active' : ''}`}
          onClick={onToggleVirtualWallDrawing}
          aria-pressed={virtualWallDrawing}
        >
          <Minus size={15} strokeWidth={2.2} aria-hidden="true" />
          {t(virtualWallDrawing ? 'rooms.cancelVirtualWall' : 'rooms.drawVirtualWall')}
        </button>
      )}
      <button className="btn btn-primary" onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}>
        {placingMode
          ? t('form.cancelPlacement')
          : hasZone ? t('rooms.traceAgain') : t('rooms.traceInModel')}
      </button>
      <button className="btn btn-success" onClick={handleSave} disabled={!hasZone || overlappingRoomNames.length > 0}>{t('common.save')}</button>
      <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
    </>
  );

  return (
    <FormPanel open={open} title={isNew ? t('rooms.add') : t('rooms.edit')} onClose={onClose} footer={footer}>
      <AccordionSection title={t('rooms.identity')} defaultOpen>
        <div className="field-group">
          <label className="field-label">{t('rooms.name')}</label>
          <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
      </AccordionSection>

      <AccordionSection title={t('rooms.haAreas')} defaultOpen>
        <div className="room-area-checklist">
          {areas.map((area) => (
            <label className="room-check-row" key={area.area_id}>
              <input type="checkbox" checked={areaIds.includes(area.area_id)} onChange={() => toggleArea(area.area_id)} />
              <span>{area.name}</span>
            </label>
          ))}
          {!areas.length && <div className="room-form-note">{t('rooms.noAreas')}</div>}
        </div>
      </AccordionSection>

      <AccordionSection title={t('rooms.zone')} defaultOpen>
        {!hasZone ? (
          <>
            <div className="room-zone-empty">
              <strong>{t('rooms.noZone')}</strong>
              <span>{t('rooms.noZoneHint')}</span>
            </div>
            {virtualWalls.length > 0 && (
              <div className="room-zone-summary">
                <span>{t('rooms.virtualWalls')}</span>
                <span>{t('rooms.virtualWallsCount', { count: virtualWalls.length })}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="room-zone-summary">
              <span>{points ? t('rooms.polygon') : t('rooms.rectangle')}</span>
              <span>{t('rooms.pointsCount', { count: effectivePoints.length })}</span>
            </div>
            <div className="room-form-note">{t('rooms.pointEditHint')}</div>
            {overlappingRoomNames.length > 0 && (
              <div className="room-overlap-warning" role="alert">
                {t('rooms.overlapWarning', { rooms: overlappingRoomNames.join(', ') })}
              </div>
            )}
            {virtualWalls.length > 0 && (
              <div className="room-zone-summary">
                <span>{t('rooms.virtualWalls')}</span>
                <span>{t('rooms.virtualWallsCount', { count: virtualWalls.length })}</span>
              </div>
            )}
            <SliderNumberRow label={t('form.width')} value={width} onChange={handleWidthChange} step={0.01} span={1.5} min={0.1} max={50} fallback={1} />
            <SliderNumberRow label={t('form.depth')} value={depth} onChange={handleDepthChange} step={0.01} span={1.5} min={0.1} max={50} fallback={1} />
            <SliderNumberRow label={t('rooms.rotation')} value={rotationY} onChange={setRotationY} step={0.5} span={45} min={-180} max={180} />
          </>
        )}
      </AccordionSection>

      <AccordionSection title={t('rooms.appearance')} defaultOpen>
        <div className="field-group">
          <label className="field-label">{t('rooms.floorColor')}</label>
          <div className="room-color-picker">
            {ROOM_ZONE_COLOR_PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`room-color-swatch${color.toLowerCase() === swatch ? ' active' : ''}`}
                style={{ backgroundColor: swatch }}
                onClick={() => setColor(swatch)}
                title={swatch}
                aria-label={`${t('rooms.floorColor')} ${swatch}`}
                aria-pressed={color.toLowerCase() === swatch}
              />
            ))}
            <input
              type="color"
              className="room-color-custom"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              title={t('rooms.customColor')}
              aria-label={t('rooms.customColor')}
            />
          </div>
        </div>
        <SliderNumberRow
          label={t('rooms.opacity')}
          value={Math.round(opacity * 100)}
          onChange={(value) => setOpacity(clampRoomZoneOpacity(value / 100))}
          step={1}
          span={20}
          min={4}
          max={55}
          fallback={14}
        />
        <div className="room-color-hint">
          <span className="room-color-conflict-dot" aria-hidden="true" />
          {t('rooms.conflictColorHint')}
        </div>
      </AccordionSection>

      {hasZone && (
        <AccordionSection title={t('form.position')} defaultOpen>
          <div className="placement-hint visible">{t('rooms.positionHint')}</div>
          <VectorSliderFields label={t('form.position')} value={position} onChange={onPositionChange} step={0.01} span={2} axisLabels={{ x: 'X', y: 'Z', z: 'Y' }} axisColors={{ x: '#f87171', y: '#4ade80', z: '#38bdf8' }} hideLabel />
        </AccordionSection>
      )}

      <AccordionSection title={t('rooms.primaryEntities')}>
        <div className="room-form-note">{t('rooms.priorityHint')}</div>
        {GROUPS.map((group) => {
          const grouped = visibleEntities.filter((entity) => entity.group === group);
          if (!grouped.length) return null;
          return (
            <div className="room-entity-group" key={group}>
              <div className="room-entity-group-title">{t(`rooms.group.${group}`)}</div>
              {grouped.map((entity) => (
                <label className="room-entity-row" key={entity.entity_id}>
                  <input type="checkbox" checked={primaryEntityIds.includes(entity.entity_id)} onChange={() => toggleEntity(entity.entity_id)} />
                  <span className="room-entity-copy">
                    <span className="room-entity-name">{entity.friendly_name || entity.entity_id}</span>
                    <span className="room-entity-meta">
                      {entity.entity_id}{placedEntityIds.has(entity.entity_id) ? ` · ${t('rooms.placed3d')}` : ''}
                    </span>
                  </span>
                  <span className={`room-entity-state ${entity.state === 'unavailable' ? 'unavailable' : ''}`}>{entity.state ?? '--'}</span>
                </label>
              ))}
            </div>
          );
        })}
        {!roomEntities.length && areaIds.length > 0 && <div className="room-form-note">{t('rooms.noEntities')}</div>}
        {roomEntities.length > 16 && (
          <button className="btn btn-ghost room-show-all" onClick={() => setShowAll((value) => !value)}>
            {showAll ? t('rooms.showRecommended') : t('rooms.showAll', { count: roomEntities.length })}
          </button>
        )}
      </AccordionSection>
    </FormPanel>
  );
});

export default RoomForm;
