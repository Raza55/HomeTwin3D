import { useState, useRef, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LightConfig, LightGroup } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

const TYPE_ICONS: Record<string, string> = {
  toggle: '\u{1F50C}',
  dimmeable: '\u{1F4A1}',
  warmCold: '\u{1F321}',
  rgb: '\u{1F308}',
  rgbw: '\u2728',
  nanoleafShapes: '\u2B22',
};

const SHAPE_ICONS: Record<string, string> = {
  sphere: '\u25CF',
  cube: '\u25A0',
  ellipsoid: '\u2B2D',
  nanoleafShapes: '\u2B22',
};

interface Props {
  lights: LightConfig[];
  lightGroups: LightGroup[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onMoveToGroup: (lightIdx: number, groupId: string | undefined) => void;
  onAddGroup: (name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

// Unique sortable ID for each light (index-based to guarantee uniqueness)
function lightSortId(idx: number) {
  return `light-${idx}`;
}
function idxFromSortId(id: string) {
  return parseInt(id.replace('light-', ''), 10);
}

/* ─── Sortable light item ─── */
function SortableLightItem({
  light,
  globalIdx,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  light: LightConfig;
  globalIdx: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const t = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lightSortId(globalIdx),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`light-item${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <div className="light-item-drag" {...attributes} {...listeners}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
          <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
          <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </div>
      <div className="light-item-icon">{TYPE_ICONS[light.type] || '\u{1F4A1}'}</div>
      <div className="light-item-info">
        <div className="light-item-name">{light.label || light.entityId}</div>
        <div className="light-item-meta">
          {light.entityId} &middot; {SHAPE_ICONS[light.shape || 'sphere']} {light.shape || 'sphere'} &middot; {light.type}
        </div>
      </div>
      <button
        className="light-item-dup"
        title={t('common.duplicate')}
        onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
      >
        ⧉
      </button>
      <button
        className="light-item-del"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        &times;
      </button>
    </div>
  );
}

/* ─── Static light item (for DragOverlay) ─── */
function LightItemOverlay({ light }: { light: LightConfig }) {
  return (
    <div className="light-item light-item-overlay">
      <div className="light-item-drag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
          <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
          <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </div>
      <div className="light-item-icon">{TYPE_ICONS[light.type] || '\u{1F4A1}'}</div>
      <div className="light-item-info">
        <div className="light-item-name">{light.label || light.entityId}</div>
        <div className="light-item-meta">
          {light.entityId} &middot; {SHAPE_ICONS[light.shape || 'sphere']} {light.shape || 'sphere'} &middot; {light.type}
        </div>
      </div>
    </div>
  );
}

/* ─── Group header ─── */
function GroupHeader({
  group,
  count,
  collapsed,
  onToggle,
  onRename,
  onDelete,
}: {
  group: LightGroup;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setName(group.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [group.name]);

  const commitEdit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== group.name) onRename(trimmed);
    setEditing(false);
  }, [name, group.name, onRename]);

  return (
    <div className="group-header" onClick={onToggle}>
      <svg
        className={`group-chevron${collapsed ? ' collapsed' : ''}`}
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      {editing ? (
        <input
          ref={inputRef}
          className="group-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <span className="group-name" onDoubleClick={startEdit}>{group.name}</span>
      )}
      <span className="group-count">{count}</span>
      <div className="group-actions">
        <button
          className="group-action-btn"
          title={t('list.rename')}
          onClick={startEdit}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
        </button>
        <button
          className="group-action-btn"
          title={t('list.deleteGroup')}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── Droppable group body ─── */
function DroppableGroupBody({
  groupId,
  children,
}: {
  groupId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-drop-${groupId}` });
  return (
    <div
      ref={setNodeRef}
      className={`group-body${isOver ? ' group-body-over' : ''}`}
    >
      {children}
    </div>
  );
}

/* ─── Main LightList ─── */
export default function LightList({
  lights,
  lightGroups,
  selectedIdx,
  onSelect,
  onDelete,
  onDuplicate,
  onReorder,
  onMoveToGroup,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
}: Props) {
  const t = useTranslation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const hasGroups = lightGroups.length > 0;

  // Build grouped indices: { groupId -> globalIndex[] }
  const { ungrouped, grouped } = useMemo(() => {
    const ungrouped: number[] = [];
    const grouped: Record<string, number[]> = {};
    for (const g of lightGroups) grouped[g.id] = [];
    lights.forEach((l, i) => {
      if (l.group && grouped[l.group]) {
        grouped[l.group].push(i);
      } else {
        ungrouped.push(i);
      }
    });
    return { ungrouped, grouped };
  }, [lights, lightGroups]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  }, []);

  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;

    const activeIdx = idxFromSortId(active.id as string);
    const overId = over.id as string;

    // Dropping over a group droppable container
    if (overId.startsWith('group-drop-')) {
      const targetGroupId = overId.replace('group-drop-', '');
      const resolvedGroup = targetGroupId === '__ungrouped__' ? undefined : targetGroupId;
      const currentGroup = lights[activeIdx].group;
      if (currentGroup !== resolvedGroup) {
        onMoveToGroup(activeIdx, resolvedGroup);
      }
      return;
    }

    // Dropping over another light item — check if it's in a different group
    if (overId.startsWith('light-')) {
      const overIdx = idxFromSortId(overId);
      const fromGroup = lights[activeIdx].group;
      const toGroup = lights[overIdx].group;
      if (fromGroup !== toGroup) {
        onMoveToGroup(activeIdx, toGroup);
      }
    }
  }, [lights, onMoveToGroup]);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const fromIdx = idxFromSortId(active.id as string);
    const overId = over.id as string;

    // If dropping on a group droppable container, group move already handled in onDragOver
    if (overId.startsWith('group-drop-')) return;

    const toIdx = idxFromSortId(overId);
    if (fromIdx === toIdx) return;

    onReorder(fromIdx, toIdx);
  }, [onReorder]);

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const activeDragIdx = activeId ? idxFromSortId(activeId) : null;

  if (lights.length === 0 && !hasGroups) {
    return (
      <div className="list-empty">
        {t('list.noLights')}<br />
        <span dangerouslySetInnerHTML={{ __html: t('list.clickAddLight') }} />
      </div>
    );
  }

  const renderItems = (indices: number[]) =>
    indices.map((i) => (
      <SortableLightItem
        key={lightSortId(i)}
        light={lights[i]}
        globalIdx={i}
        isSelected={selectedIdx === i}
        onSelect={() => onSelect(i)}
        onDelete={() => onDelete(i)}
        onDuplicate={() => onDuplicate(i)}
      />
    ));

  // Build per-group sortable ID lists
  const ungroupedSortIds = ungrouped.map((i) => lightSortId(i));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Ungrouped section */}
      {hasGroups && ungrouped.length > 0 && (
        <div className="group-section">
          <div
            className="group-header"
            onClick={() => toggleCollapse('__ungrouped__')}
          >
            <svg
              className={`group-chevron${collapsed['__ungrouped__'] ? ' collapsed' : ''}`}
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span className="group-name">{t('list.ungrouped')}</span>
            <span className="group-count">{ungrouped.length}</span>
          </div>
          {!collapsed['__ungrouped__'] && (
            <DroppableGroupBody groupId="__ungrouped__">
              <SortableContext items={ungroupedSortIds} strategy={verticalListSortingStrategy}>
                {ungrouped.length > 0 ? renderItems(ungrouped) : (
                  <div className="group-drop-placeholder">{t('list.dragLightsHere')}</div>
                )}
              </SortableContext>
            </DroppableGroupBody>
          )}
        </div>
      )}

      {/* If no groups, render flat */}
      {!hasGroups && (
        <SortableContext items={ungroupedSortIds} strategy={verticalListSortingStrategy}>
          {renderItems(ungrouped)}
        </SortableContext>
      )}

      {/* Named groups */}
      {lightGroups.map((g) => {
        const indices = grouped[g.id] || [];
        const groupSortIds = indices.map((i) => lightSortId(i));
        const isCollapsed = collapsed[g.id] ?? false;
        return (
          <div key={g.id} className="group-section">
            <GroupHeader
              group={g}
              count={indices.length}
              collapsed={isCollapsed}
              onToggle={() => toggleCollapse(g.id)}
              onRename={(name) => onRenameGroup(g.id, name)}
              onDelete={() => onDeleteGroup(g.id)}
            />
            {!isCollapsed && (
              <DroppableGroupBody groupId={g.id}>
                <SortableContext items={groupSortIds} strategy={verticalListSortingStrategy}>
                  {indices.length > 0 ? renderItems(indices) : (
                    <div className="group-drop-placeholder">{t('list.dragLightsHere')}</div>
                  )}
                </SortableContext>
              </DroppableGroupBody>
            )}
          </div>
        );
      })}

      {/* Add group button */}
      <button
        className="add-group-btn"
        onClick={() => onAddGroup(t('editor.newGroup'))}
      >
        {t('list.addGroup')}
      </button>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragIdx !== null && lights[activeDragIdx] ? (
          <LightItemOverlay light={lights[activeDragIdx]} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
