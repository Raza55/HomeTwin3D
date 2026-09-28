import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, Box, BrickWall, Crosshair, Eraser, House, Image as ImageIcon, ImageOff, LampCeiling, MapPin, Minus, Monitor, Move3d, PanelTopClose, Plus, Rotate3d, Scale3d, Scissors, Square, Trash2, Cpu } from 'lucide-react';
import { generateUUID } from '../../utils/uuid';
import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  PositionGizmo,
  UtilityLayerRenderer,
  Color4,
  Animation,
  CubicEase,
  EasingFunction,
  GizmoAnchorPoint,
  Tools,
  RotationGizmo,
  ScaleGizmo,
  Space,
  Mesh,
  Matrix,
  type AbstractMesh,
  type LinesMesh,
  type Observer,
  type Scene,
  type TransformNode,
} from '@babylonjs/core';
import { applyCameraControlSensitivity, createScene, type SceneContext } from '../../babylon/SceneManager';
import { applyModelObjectTransform, getOriginalModelObjectTransform, loadModel, readModelObjectTransform, setTexturesEnabled } from '../../babylon/ModelLoader';
import {
  disposeImportedObject,
  getImportedObjectFormat,
  isSupportedImportedObjectFormat,
  loadImportedObject,
  type ImportedObjectLoadResult,
} from '../../babylon/ImportedObjectLoader';
import { createEdgeOutline, type EdgeOutlineControls } from '../../babylon/EdgeOutline';
import { removeLightMesh, rebuildAllMeshes, type MeshMap } from '../../babylon/LightMeshFactory';
import {
  createDisplayMesh,
  removeDisplayMesh,
  rebuildAllDisplayMeshes,
  updateDisplayTexture,
  buildMockupStates,
  type DisplayMeshMap,
} from '../../babylon/DisplayMeshFactory';
import {
  createBlindMesh,
  removeBlindMesh,
  rebuildAllBlindMeshes,
  updateBlindPosition,
  type BlindMeshMap,
} from '../../babylon/BlindMeshFactory';
import { deleteModelObjectAsset, getConfig, getModelBlob, getModelObjectBlob, updateConfig, uploadModelObject } from '../../services/configApi';
import { getSetting, updateSettings } from '../../services/settingsStore';
import { getEntityCache, setEntityCache } from '../../services/entityCache';
import type { HAEntityOption } from '../../components/EntityPicker';
import LightList from '../../components/LightList';
import BlenderLightSettings from '../../components/BlenderLightSettings';
import LightForm, { type PreviewInfo, type LightFormHandle } from '../../components/LightForm';
import DisplayList from '../../components/DisplayList';
import DisplayForm, { type DisplayFormHandle, type DisplayPreviewInfo } from '../../components/DisplayForm';
import BlindList from '../../components/BlindList';
import BlindForm, { type BlindFormHandle, type BlindPreviewInfo } from '../../components/BlindForm';
import ShadowWallList from '../../components/ShadowWallList';
import ShadowWallForm, { type ShadowWallFormHandle, type WallPreviewInfo } from '../../components/ShadowWallForm';
import SmartDeviceList from '../../components/SmartDeviceList';
import SmartDeviceForm, { type SmartDeviceFormHandle, type SmartDevicePreviewInfo } from '../../components/SmartDeviceForm';
import RoomList from '../../components/RoomList';
import RoomForm, { type RoomFormHandle, type RoomPreviewInfo } from '../../components/RoomForm';
import RoomSplitAssignmentDialog, { type RoomSplitTargetOption } from '../../components/RoomSplitAssignmentDialog';
import { arrayMove } from '@dnd-kit/sortable';
import TubeList from '../../components/TubeList';
import TubeForm, { type TubePreviewInfo } from '../../components/TubeForm';
import ModelObjectList, { type ModelObjectEditMode, type ModelObjectListItem } from '../../components/ModelObjectList';
import { createTubeMeshes, removeTubeMeshes, disposeAllTubes, renderMockupLabels, type TubeMap } from '../../babylon/TubeMeshFactory';
import { createSmartDeviceMesh, rebuildAllSmartDeviceMeshes, removeSmartDeviceMesh, type SmartDeviceMeshMap } from '../../babylon/SmartDeviceMeshFactory';
import {
  createRoomZoneLabel,
  createRoomZoneSurface,
  clampRoomZoneOpacity,
  DEFAULT_ROOM_ZONE_OPACITY,
  defaultRoomZoneColor,
  disposeAllRoomZones,
  findOverlappingRoomIds,
  findOverlappingRooms,
  getRoomZoneWorldPoints,
  rebuildAllRoomZones,
  rectangleRoomZonePoints,
  resolveRoomZoneColor,
  ROOM_FLOOR_TOLERANCE,
  roomZoneColor3,
  roomZoneOutlinePoints,
  roomZonesOverlap,
  setRoomZoneLabelVisibility,
  updateRoomZoneSurface,
  type RoomZoneMeshMap,
} from '../../babylon/RoomZoneMeshFactory';
import { traceRoomPolygon } from '../../babylon/RoomPolygonTracer';
import { createSceneScaleRoot, getModelScale, worldToConfigPosition } from '../../babylon/SceneScale';
import { sceneRelativeDefaults, type SceneRelativeDefaults } from '../../utils/editorControls';
import {
  keepAvailableDetectedRoomPart,
  roomZonePointArea,
  roomZonePointBounds,
  splitRoomZoneByLine,
} from '../../utils/roomZoneBoolean';
import { rankRoomEntities } from '../../utils/roomEntityPriority';
import { useTranslation } from '../../contexts/LanguageContext';
import GuidedTour from '../../components/GuidedTour/GuidedTour';
import { editorTourSteps } from '../../components/GuidedTour/tourSteps';
import { discoverHAAreas, type HAAreaRegistryEntry, type HARoomEntity } from '../../services/haAreaRegistry';
import type { LightConfig, LightGroup, DisplayConfig, BlindConfig, ShadowWallConfig, SmartDeviceConfig, TubeConfig, LightPosition, ImportedModelObjectConfig, ModelObjectOverride, ModelObjectTransform, RoomConfig, RoomVirtualWall, RoomZonePoint } from '../../types';
import './ConfigEditor.css';

type ActiveGizmo = PositionGizmo | RotationGizmo | ScaleGizmo;
type EditorTransformMode = ModelObjectEditMode;
type RoomVirtualWallEndpoint = { wallIndex: number; endpoint: 'start' | 'end' };

const TRANSFORM_MODES: EditorTransformMode[] = ['move', 'rotate', 'scale'];
const DEFAULT_EDITOR_SIZES = sceneRelativeDefaults(10);
const NANOLEAF_PANEL_COORDS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
  [2, -1],
  [-2, 1],
  [1, 1],
];

function roundValue(value: number, decimals = 3): number {
  return parseFloat(value.toFixed(decimals));
}

function worldPointToRoomLocal(
  point: Vector3,
  anchor: LightPosition,
  rotationY: number,
  modelScale: number,
): RoomZonePoint {
  const configPoint = worldToConfigPosition(point, modelScale);
  const local = Vector3.TransformCoordinates(
    new Vector3(configPoint.x - anchor.x, 0, configPoint.z - anchor.z),
    Matrix.RotationY(Tools.ToRadians(-rotationY)),
  );
  return { x: roundValue(local.x), z: roundValue(local.z) };
}

function roomVirtualWallsToWorld(
  walls: RoomVirtualWall[],
  anchor: LightPosition,
  rotationY: number,
  modelScale: number,
): RoomVirtualWall[] {
  const rotation = Matrix.RotationY(Tools.ToRadians(rotationY));
  const convert = (point: RoomZonePoint): RoomZonePoint => {
    const rotated = Vector3.TransformCoordinates(new Vector3(point.x, 0, point.z), rotation);
    return {
      x: (anchor.x + rotated.x) * modelScale,
      z: (anchor.z + rotated.z) * modelScale,
    };
  };
  return walls.map((wall) => ({ start: convert(wall.start), end: convert(wall.end) }));
}

function roomBoundaryWallsToWorld(room: RoomConfig, modelScale: number): RoomVirtualWall[] {
  const points = getRoomZoneWorldPoints(room);
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      start: { x: point.x * modelScale, z: point.z * modelScale },
      end: { x: next.x * modelScale, z: next.z * modelScale },
    };
  });
}

function roomPreviewToConfig(
  id: string,
  position: LightPosition,
  info: RoomPreviewInfo,
): RoomConfig {
  return {
    id,
    name: info.name,
    haAreaIds: [],
    anchor: { ...position },
    zone: {
      width: info.size.width,
      height: info.size.height,
      depth: info.size.depth,
      rotationY: info.rotation.y,
      color: info.color,
      opacity: info.opacity,
      points: info.points.map((point) => ({ ...point })),
      virtualWalls: info.virtualWalls.map((wall) => ({
        start: { ...wall.start },
        end: { ...wall.end },
      })),
    },
    primaryEntityIds: [],
  };
}

function createNanoleafPreviewMesh(scene: Scene, name: string, size: Record<string, number>): Mesh {
  const targetWidth = size.width ?? 1.15;
  const targetHeight = size.height ?? 0.78;
  const targetDepth = size.depth ?? 0.035;
  const rawRadius = 0.5;
  const rawDx = rawRadius * 1.58;
  const rawDy = rawRadius * 1.36;
  const rawPositions = NANOLEAF_PANEL_COORDS.map(([q, r]) => ({
    x: q * rawDx,
    y: (r + q * 0.5) * rawDy,
  }));
  const minX = Math.min(...rawPositions.map((p) => p.x - rawRadius));
  const maxX = Math.max(...rawPositions.map((p) => p.x + rawRadius));
  const minY = Math.min(...rawPositions.map((p) => p.y - rawRadius));
  const maxY = Math.max(...rawPositions.map((p) => p.y + rawRadius));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const panelScale = Math.min(
    targetWidth / Math.max(0.001, maxX - minX),
    targetHeight / Math.max(0.001, maxY - minY),
  );

  const panels = rawPositions.map((p, index) => {
    const panel = MeshBuilder.CreateCylinder(`${name}_panel_${index}`, {
      height: targetDepth,
      diameter: rawRadius * panelScale * 1.88,
      tessellation: 6,
    }, scene);
    panel.rotation.x = Math.PI / 2;
    panel.position.set((p.x - centerX) * panelScale, (p.y - centerY) * panelScale, 0);
    panel.bakeCurrentTransformIntoVertices();
    return panel;
  });

  return Mesh.MergeMeshes(panels, true, true, undefined, false, true)
    ?? MeshBuilder.CreateBox(name, { width: targetWidth, height: targetHeight, depth: targetDepth }, scene);
}

function rotationFromMesh(mesh: AbstractMesh): LightPosition {
  const rotation = mesh.rotationQuaternion?.toEulerAngles() ?? mesh.rotation;
  return {
    x: roundValue(Tools.ToDegrees(rotation.x), 1),
    y: roundValue(Tools.ToDegrees(rotation.y), 1),
    z: roundValue(Tools.ToDegrees(rotation.z), 1),
  };
}

function scaleFromMesh(mesh: AbstractMesh, shape?: string, size?: Record<string, number>): LightPosition {
  const base = shape === 'ellipsoid'
    ? {
        x: Math.max(0.001, size?.width ?? size?.diameter ?? 1),
        y: Math.max(0.001, size?.height ?? size?.diameter ?? 1),
        z: Math.max(0.001, size?.depth ?? size?.diameter ?? 1),
      }
    : { x: 1, y: 1, z: 1 };
  return {
    x: roundValue(Math.max(0.001, mesh.scaling.x / base.x), 3),
    y: roundValue(Math.max(0.001, mesh.scaling.y / base.y), 3),
    z: roundValue(Math.max(0.001, mesh.scaling.z / base.z), 3),
  };
}

function meshLocalSize(mesh: AbstractMesh): { width: number; height: number; depth: number } {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo({});
  const bounds = mesh.getBoundingInfo().boundingBox;
  return {
    width: Math.max(0.001, bounds.maximum.x - bounds.minimum.x),
    height: Math.max(0.001, bounds.maximum.y - bounds.minimum.y),
    depth: Math.max(0.001, bounds.maximum.z - bounds.minimum.z),
  };
}

function displayNormalFromPlane(plane: AbstractMesh): LightPosition {
  const normal = plane.getDirection(Vector3.Forward()).normalize();
  return {
    x: roundValue(normal.x, 4),
    y: roundValue(normal.y, 4),
    z: roundValue(normal.z, 4),
  };
}

function createGizmoForMode(mode: EditorTransformMode, utilLayer: UtilityLayerRenderer): ActiveGizmo {
  if (mode === 'rotate') {
    const gizmo = new RotationGizmo(utilLayer, undefined, true);
    gizmo.scaleRatio = 1.15;
    gizmo.sensitivity = 0.85;
    // Babylon refuses rotation on non-uniformly scaled meshes when the gizmo
    // tries to mirror the mesh orientation. Ellipsoids and scaled objects need
    // the ring to stay world-oriented so the rotation still applies.
    gizmo.updateGizmoRotationToMatchAttachedMesh = false;
    return gizmo;
  }
  if (mode === 'scale') {
    const gizmo = new ScaleGizmo(utilLayer);
    gizmo.scaleRatio = 1.1;
    gizmo.sensitivity = 0.75;
    return gizmo;
  }
  const gizmo = new PositionGizmo(utilLayer);
  gizmo.scaleRatio = 1.2;
  return gizmo;
}

function setUtilityMeshAlpha(utilLayer: UtilityLayerRenderer, alpha = 0.5): void {
  for (const mesh of utilLayer.utilityLayerScene.meshes) {
    if (mesh.material) {
      (mesh.material as StandardMaterial).alpha = alpha;
    }
  }
}

export default function ConfigEditor() {
  const t = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showGuidedTour, setShowGuidedTour] = useState(() => searchParams.get('guided') === 'true');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneCtxRef = useRef<SceneContext | null>(null);
  const homingRef = useRef(false);
  const homeTargetRef = useRef<Vector3 | null>(null);
  const modelSizeRef = useRef<{ x: number; z: number } | null>(null);
  const modelDiagonalRef = useRef(1);
  const [editorDefaultSizes, setEditorDefaultSizes] = useState<SceneRelativeDefaults>(DEFAULT_EDITOR_SIZES);
  const modelMeshesRef = useRef<AbstractMesh[]>([]);
  const edgeOutlineRef = useRef<EdgeOutlineControls | null>(null);
  const meshMapRef = useRef<MeshMap>({});
  const entityScaleRootRef = useRef<TransformNode | null>(null);
  const modelScaleRef = useRef(1);
  const modelObjectMeshesRef = useRef<Record<string, AbstractMesh>>({});
  const importedObjectResultsRef = useRef<Record<string, ImportedObjectLoadResult>>({});
  const modelObjectGizmoRef = useRef<ActiveGizmo | null>(null);
  const selectedModelObjectMeshRef = useRef<AbstractMesh | null>(null);
  const previewMeshRef = useRef<Mesh | null>(null);
  const extraPreviewMeshesRef = useRef<Mesh[]>([]);
  const hitboxPreviewRef = useRef<Mesh | null>(null);
  const previewObsRef = useRef<Observer<Scene> | null>(null);
  const gizmoRef = useRef<ActiveGizmo | null>(null);
  const utilLayerRef = useRef<UtilityLayerRenderer | null>(null);
  const draggingGizmoRef = useRef(false);
  const posUndoStackRef = useRef<LightPosition[]>([]);
  const gizmoTargetRef = useRef<'main' | { type: 'part'; index: number } | { type: 'hitbox' }>('main');
  const skipPreviewRebuildRef = useRef(false);
  const lightFormRef = useRef<LightFormHandle>(null);
  const displayFormRef = useRef<DisplayFormHandle>(null);
  const blindFormRef = useRef<BlindFormHandle>(null);
  const wallFormRef = useRef<ShadowWallFormHandle>(null);
  const smartDeviceFormRef = useRef<SmartDeviceFormHandle>(null);
  const roomFormRef = useRef<RoomFormHandle>(null);
  const roomPreviewRootRef = useRef<Mesh | null>(null);
  const roomPreviewSurfaceRef = useRef<Mesh | null>(null);
  const roomPreviewOutlineRef = useRef<LinesMesh | null>(null);
  const roomPreviewPointHandlesRef = useRef<Mesh[]>([]);
  const roomPreviewVirtualWallMeshesRef = useRef<Mesh[]>([]);
  const roomPreviewVirtualWallHandlesRef = useRef<Mesh[]>([]);
  const roomVirtualWallDraftLineRef = useRef<LinesMesh | null>(null);
  const roomVirtualWallDraftHandlesRef = useRef<Mesh[]>([]);
  const roomSplitDraftLineRef = useRef<LinesMesh | null>(null);
  const roomSplitDraftHandlesRef = useRef<Mesh[]>([]);
  const tubeAnchorRef = useRef<Mesh | null>(null);

  const [haEntities, setHaEntities] = useState<HAEntityOption[]>(() => getEntityCache());
  const [haAreas, setHaAreas] = useState<HAAreaRegistryEntry[]>([]);
  const [haRoomEntities, setHaRoomEntities] = useState<HARoomEntity[]>([]);
  const [haAreaSyncStatus, setHaAreaSyncStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lights, setLights] = useState<LightConfig[]>([]);
  const [lightGroups, setLightGroups] = useState<LightGroup[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [placingMode, setPlacingMode] = useState(false);
  const [position, setPosition] = useState<LightPosition>({ x: 0, y: 2.5, z: 0 });
  const [coordText, setCoordText] = useState(() => t('editor.coordEmpty'));
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [showTextures, setShowTextures] = useState(() => getSetting('render').showTextures);

  // Editor mode: placed entities, light blockers, tubes, or imported model objects
  const [editorMode, setEditorMode] = useState<'lights' | 'blinds' | 'displays' | 'walls' | 'smartDevices' | 'tubes' | 'rooms' | 'modelObjects'>('lights');
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;
  const [modelObjects, setModelObjects] = useState<ModelObjectListItem[]>([]);
  const baseModelObjectsRef = useRef<ModelObjectListItem[]>([]);
  const [selectedModelObjectId, setSelectedModelObjectId] = useState<string | null>(null);
  const [selectedModelObjectTransform, setSelectedModelObjectTransform] = useState<ModelObjectTransform | null>(null);
  const [transformMode, setTransformMode] = useState<EditorTransformMode>('move');
  const transformModeRef = useRef<EditorTransformMode>(transformMode);
  transformModeRef.current = transformMode;
  const modelObjectOverridesRef = useRef<ModelObjectOverride[]>([]);
  const importedModelObjectsRef = useRef<ImportedModelObjectConfig[]>([]);
  const modelObjectPersistTimerRef = useRef<number | null>(null);

  // Display state
  const displayMeshMapRef = useRef<DisplayMeshMap>({});
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [displayEditIdx, setDisplayEditIdx] = useState<number | null>(null);
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false);
  const [displayNormal, setDisplayNormal] = useState<LightPosition>({ x: 0, y: 0, z: 1 });
  const displaysRef = useRef(displays);
  displaysRef.current = displays;
  const displayPanelOpenRef = useRef(displayPanelOpen);
  displayPanelOpenRef.current = displayPanelOpen;
  const displayPreviewIdRef = useRef<string | null>(null);
  const displayNormalRef = useRef(displayNormal);
  displayNormalRef.current = displayNormal;
  const displayPreviewInfoRef = useRef<DisplayPreviewInfo | null>(null);
  const displayOutlineRef = useRef<LinesMesh | null>(null);

  // Blind state
  const blindMeshMapRef = useRef<BlindMeshMap>({});
  const [blinds, setBlinds] = useState<BlindConfig[]>([]);
  const [blindEditIdx, setBlindEditIdx] = useState<number | null>(null);
  const [blindPanelOpen, setBlindPanelOpen] = useState(false);
  const blindPanelOpenRef = useRef(blindPanelOpen);
  blindPanelOpenRef.current = blindPanelOpen;
  const blindsRef = useRef(blinds);
  blindsRef.current = blinds;
  const blindPreviewInfoRef = useRef<BlindPreviewInfo>({ size: editorDefaultSizes.blind, rotationY: 0, slats: 10 });
  const blindPreviewIdRef = useRef<string | null>(null);

  // Shadow wall state
  const [shadowWalls, setShadowWalls] = useState<ShadowWallConfig[]>([]);
  const [wallEditIdx, setWallEditIdx] = useState<number | null>(null);
  const [wallPanelOpen, setWallPanelOpen] = useState(false);
  const wallPanelOpenRef = useRef(wallPanelOpen);
  wallPanelOpenRef.current = wallPanelOpen;
  const shadowWallsRef = useRef(shadowWalls);
  shadowWallsRef.current = shadowWalls;
  // Pink wireframe meshes shown in the editor when walls tab is active
  const wallEditorMeshesRef = useRef<Mesh[]>([]);
  const wallEditorMatRef = useRef<StandardMaterial | null>(null);
  const wallPreviewInfoRef = useRef<WallPreviewInfo>({ size: editorDefaultSizes.wall });

  // Smart-device state
  const smartDeviceMeshMapRef = useRef<SmartDeviceMeshMap>({});
  const [smartDevices, setSmartDevices] = useState<SmartDeviceConfig[]>([]);
  const smartDevicesRef = useRef(smartDevices);
  smartDevicesRef.current = smartDevices;
  const [smartDeviceEditIdx, setSmartDeviceEditIdx] = useState<number | null>(null);
  const [smartDevicePanelOpen, setSmartDevicePanelOpen] = useState(false);
  const smartDevicePanelOpenRef = useRef(smartDevicePanelOpen);
  smartDevicePanelOpenRef.current = smartDevicePanelOpen;
  const smartDevicePreviewInfoRef = useRef<SmartDevicePreviewInfo>({ group: 'other', type: 'generic', rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
  const smartDevicePreviewIdRef = useRef<string | null>(null);
  const handleCloseSmartDevicePanelRef = useRef<() => void>(() => {});
  const smartDevicePreviewChangeRef = useRef<(info: SmartDevicePreviewInfo) => void>(() => {});

  // Tube state
  const tubeMeshMapRef = useRef<TubeMap>({});
  const [tubes, setTubes] = useState<TubeConfig[]>([]);
  const [tubeEditIdx, setTubeEditIdx] = useState<number | null>(null);
  const [tubePanelOpen, setTubePanelOpen] = useState(false);
  const tubePanelOpenRef = useRef(tubePanelOpen);
  tubePanelOpenRef.current = tubePanelOpen;
  const tubesRef = useRef(tubes);
  tubesRef.current = tubes;
  const tubePreviewInfoRef = useRef<TubePreviewInfo | null>(null);

  // Room state
  const roomZoneMeshMapRef = useRef<RoomZoneMeshMap>({});
  const [rooms, setRooms] = useState<RoomConfig[]>([]);
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const [roomEditIdx, setRoomEditIdx] = useState<number | null>(null);
  const roomEditIdxRef = useRef(roomEditIdx);
  roomEditIdxRef.current = roomEditIdx;
  const [roomPanelOpen, setRoomPanelOpen] = useState(false);
  const roomPanelOpenRef = useRef(roomPanelOpen);
  roomPanelOpenRef.current = roomPanelOpen;
  const [roomDraft, setRoomDraft] = useState<RoomConfig | null>(null);
  const roomDraftRef = useRef(roomDraft);
  roomDraftRef.current = roomDraft;
  const [roomZoneReady, setRoomZoneReady] = useState(false);
  const roomZoneReadyRef = useRef(roomZoneReady);
  roomZoneReadyRef.current = roomZoneReady;
  const [roomSelectedPoint, setRoomSelectedPoint] = useState<number | null>(null);
  const [roomSelectedVirtualWall, setRoomSelectedVirtualWall] = useState<number | null>(null);
  const [roomSelectedVirtualWallEndpoint, setRoomSelectedVirtualWallEndpoint] = useState<RoomVirtualWallEndpoint | null>(null);
  const [roomVirtualWallDrawing, setRoomVirtualWallDrawing] = useState(false);
  const [roomVirtualWallStartSet, setRoomVirtualWallStartSet] = useState(false);
  const [roomSplitDrawing, setRoomSplitDrawing] = useState(false);
  const [roomSplitStartSet, setRoomSplitStartSet] = useState(false);
  const [roomSplitPieces, setRoomSplitPieces] = useState<RoomZonePoint[][]>([]);
  const [roomSplitAssignments, setRoomSplitAssignments] = useState<string[]>([]);
  const [roomSplitError, setRoomSplitError] = useState<string | null>(null);
  const [roomPointCount, setRoomPointCount] = useState(4);
  const [roomGizmoActive, setRoomGizmoActive] = useState(false);
  const [roomOverlapNames, setRoomOverlapNames] = useState<string[]>([]);
  const roomOverlapNamesRef = useRef<string[]>(roomOverlapNames);
  roomOverlapNamesRef.current = roomOverlapNames;
  const roomGizmoActiveRef = useRef(roomGizmoActive);
  roomGizmoActiveRef.current = roomGizmoActive;
  const roomSelectedPointRef = useRef<number | null>(roomSelectedPoint);
  roomSelectedPointRef.current = roomSelectedPoint;
  const roomSelectedVirtualWallRef = useRef<number | null>(roomSelectedVirtualWall);
  roomSelectedVirtualWallRef.current = roomSelectedVirtualWall;
  const roomSelectedVirtualWallEndpointRef = useRef<RoomVirtualWallEndpoint | null>(roomSelectedVirtualWallEndpoint);
  roomSelectedVirtualWallEndpointRef.current = roomSelectedVirtualWallEndpoint;
  const roomVirtualWallDrawingRef = useRef(roomVirtualWallDrawing);
  roomVirtualWallDrawingRef.current = roomVirtualWallDrawing;
  const roomSplitDrawingRef = useRef(roomSplitDrawing);
  roomSplitDrawingRef.current = roomSplitDrawing;
  const roomSplitPiecesRef = useRef(roomSplitPieces);
  roomSplitPiecesRef.current = roomSplitPieces;
  const roomVirtualWallDraftStartRef = useRef<RoomZonePoint | null>(null);
  const roomVirtualWallDraftEndRef = useRef<RoomZonePoint | null>(null);
  const roomSplitDraftStartRef = useRef<RoomZonePoint | null>(null);
  const roomSplitDraftEndRef = useRef<RoomZonePoint | null>(null);
  const roomPreviewInfoRef = useRef<RoomPreviewInfo>({
    name: '',
    size: { width: editorDefaultSizes.wall.width, height: 0.025, depth: editorDefaultSizes.wall.depth },
    rotation: { x: 0, y: 0, z: 0 },
    color: defaultRoomZoneColor('__room-preview__'),
    opacity: DEFAULT_ROOM_ZONE_OPACITY,
    points: rectangleRoomZonePoints(editorDefaultSizes.wall.width, editorDefaultSizes.wall.depth),
    virtualWalls: [],
  });
  const handleCloseRoomPanelRef = useRef<() => void>(() => {});
  const handleCancelRoomVirtualWallDrawingRef = useRef<() => void>(() => {});
  const handleCancelRoomSplitRef = useRef<() => void>(() => {});

  const overlappingRoomIds = useMemo(() => findOverlappingRoomIds(rooms), [rooms]);

  const placedEntityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const light of lights) {
      ids.add(light.entityId);
      if (light.modeEntityId) ids.add(light.modeEntityId);
      if (light.doubleTapEntityId) ids.add(light.doubleTapEntityId);
    }
    for (const blind of blinds) ids.add(blind.entityId);
    for (const display of displays) for (const source of display.sources) ids.add(source.entityId);
    for (const device of smartDevices) ids.add(device.entityId);
    for (const tube of tubes) for (const line of tube.lines) ids.add(line.sensorId);
    return ids;
  }, [blinds, displays, lights, smartDevices, tubes]);

  const roomSplitSourceRoom = roomEditIdx !== null ? rooms[roomEditIdx] ?? null : roomDraft;
  const roomSplitSourceTargetKey = roomSplitSourceRoom
    ? roomEditIdx !== null
      ? `room:${roomSplitSourceRoom.id}`
      : `draft:${roomSplitSourceRoom.id}`
    : null;
  const roomSplitTargetOptions = useMemo<RoomSplitTargetOption[]>(() => {
    const currentRoomId = roomEditIdx !== null ? rooms[roomEditIdx]?.id : null;
    const options: RoomSplitTargetOption[] = rooms.map((room) => ({
      value: `room:${room.id}`,
      label: room.id === currentRoomId
        ? `${room.name} (${t('rooms.splitCurrentTarget')})`
        : `${room.name} (${t('rooms.splitReplaceTarget')})`,
      group: 'existing',
    }));
    if (roomEditIdx === null && roomDraft) {
      options.unshift({
        value: `draft:${roomDraft.id}`,
        label: `${roomDraft.name || t('rooms.newName')} (${t('rooms.splitCurrentTarget')})`,
        group: 'existing',
      });
    }

    const linkedAreaIds = new Set(rooms.flatMap((room) => room.haAreaIds));
    for (const areaId of roomDraft?.haAreaIds ?? []) linkedAreaIds.add(areaId);
    for (const area of haAreas) {
      if (linkedAreaIds.has(area.area_id)) continue;
      options.push({
        value: `area:${area.area_id}`,
        label: area.name,
        group: 'available',
      });
    }
    return options;
  }, [haAreas, roomDraft, roomEditIdx, rooms, t]);

  // Current preview shape/size from LightForm
  const previewInfoRef = useRef<PreviewInfo>({ shape: 'sphere', size: { diameter: editorDefaultSizes.light.diameter } });

  // Refs for current values accessible in Babylon callbacks
  const lightsRef = useRef(lights);
  lightsRef.current = lights;
  const placingModeRef = useRef(placingMode);
  placingModeRef.current = placingMode;
  const positionRef = useRef(position);
  positionRef.current = position;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const pendingGizmoPositionRef = useRef<LightPosition | null>(null);
  const gizmoPositionFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!panelOpenRef.current) {
      previewInfoRef.current = { shape: 'sphere', size: { diameter: editorDefaultSizes.light.diameter } };
    }
    if (!blindPanelOpenRef.current) {
      blindPreviewInfoRef.current = { size: editorDefaultSizes.blind, rotationY: 0, slats: 10 };
    }
    if (!wallPanelOpenRef.current) {
      wallPreviewInfoRef.current = { size: editorDefaultSizes.wall };
    }
    if (!roomPanelOpenRef.current) {
      roomPreviewInfoRef.current = {
        name: '',
        size: { width: editorDefaultSizes.wall.width, height: 0.025, depth: editorDefaultSizes.wall.depth },
        rotation: { x: 0, y: 0, z: 0 },
        color: defaultRoomZoneColor('__room-preview__'),
        opacity: DEFAULT_ROOM_ZONE_OPACITY,
        points: rectangleRoomZonePoints(editorDefaultSizes.wall.width, editorDefaultSizes.wall.depth),
        virtualWalls: [],
      };
    }
  }, [editorDefaultSizes]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const handleSyncHAAreas = useCallback(async (silent = false) => {
    const { mode, haSettings } = getSetting('connection');
    if (mode !== 'live' || !haSettings.url || !haSettings.token) {
      setHaAreaSyncStatus('error');
      if (!silent) showToast(t('rooms.connectionRequired'));
      return;
    }
    setHaAreaSyncStatus('loading');
    try {
      const discovery = await discoverHAAreas({
        url: haSettings.url,
        port: haSettings.port,
        token: haSettings.token,
      });
      setHaAreas(discovery.areas);
      setHaRoomEntities(discovery.entities);
      setHaEntities(discovery.entityOptions);
      setEntityCache(discovery.entityOptions);
      setHaAreaSyncStatus('ready');
      if (!silent) showToast(t('rooms.synced', { areas: discovery.areas.length, entities: discovery.entities.length }));
    } catch (error) {
      console.warn('[Editor] Home Assistant area sync failed:', error);
      setHaAreaSyncStatus('error');
      if (!silent) showToast(t('rooms.syncFailed'));
    }
  }, [showToast, t]);

  useEffect(() => {
    void handleSyncHAAreas(true);
  }, [handleSyncHAAreas]);

  const handleEditorTexturesChange = useCallback((enabled: boolean) => {
    setShowTextures(enabled);
    updateSettings('render', { showTextures: enabled });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    setTexturesEnabled(scene, modelMeshesRef.current, enabled, getSetting('render').edgeWidth, false);
    edgeOutlineRef.current?.setEnabled(!enabled);
  }, []);

  const scheduleGizmoPosition = useCallback((newPos: LightPosition) => {
    positionRef.current = newPos;
    pendingGizmoPositionRef.current = newPos;
    if (gizmoPositionFrameRef.current !== null) return;
    gizmoPositionFrameRef.current = window.requestAnimationFrame(() => {
      gizmoPositionFrameRef.current = null;
      const pending = pendingGizmoPositionRef.current;
      if (!pending) return;
      pendingGizmoPositionRef.current = null;
      setPosition(pending);
    });
  }, []);

  const flushGizmoPosition = useCallback(() => {
    if (gizmoPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(gizmoPositionFrameRef.current);
      gizmoPositionFrameRef.current = null;
    }
    const pending = pendingGizmoPositionRef.current ?? positionRef.current;
    pendingGizmoPositionRef.current = null;
    setPosition({ ...pending });
  }, []);

  const syncModelObjectList = useCallback((importedObjects: ImportedModelObjectConfig[]) => {
    setModelObjects([
      ...baseModelObjectsRef.current,
      ...importedObjects.map((object) => ({
        id: object.id,
        label: object.label,
        kind: 'uploaded' as const,
      })),
    ]);
  }, []);

  const disposeImportedObjects = useCallback(() => {
    for (const result of Object.values(importedObjectResultsRef.current)) {
      disposeImportedObject(result);
    }
    for (const object of importedModelObjectsRef.current) {
      delete modelObjectMeshesRef.current[object.id];
    }
    importedObjectResultsRef.current = {};
  }, []);

  const loadImportedObjectsIntoScene = useCallback(
    async (objects: ImportedModelObjectConfig[], scene: Scene) => {
      disposeImportedObjects();
      importedModelObjectsRef.current = objects;
      syncModelObjectList(objects);

      for (const object of objects) {
        const blob = await getModelObjectBlob(object.id);
        if (!blob) continue;
        try {
          const loaded = await loadImportedObject(scene, blob, object, {
            parent: entityScaleRootRef.current ?? undefined,
            editor: true,
          });
          importedObjectResultsRef.current[object.id] = loaded;
          modelObjectMeshesRef.current[object.id] = loaded.root;
        } catch (error) {
          console.warn('[Editor] Failed to load imported object:', object.fileName, error);
        }
      }
    },
    [disposeImportedObjects, syncModelObjectList],
  );

  const detachModelObjectGizmo = useCallback(() => {
    if (modelObjectGizmoRef.current) {
      modelObjectGizmoRef.current.dispose();
      modelObjectGizmoRef.current = null;
    }
    if (selectedModelObjectMeshRef.current) {
      selectedModelObjectMeshRef.current.showBoundingBox = false;
      selectedModelObjectMeshRef.current = null;
    }
  }, []);

  const persistModelObjectOverride = useCallback((mesh: AbstractMesh, showSavedToast = true) => {
    const id = mesh.metadata?.modelObjectId as string | undefined;
    if (!id) return;

    const label = mesh.metadata?.modelObjectLabel as string | undefined;
    const transform = readModelObjectTransform(mesh);
    const cfg = getConfig();
    const importedObjectId = mesh.metadata?.importedObjectId as string | undefined;

    if (importedObjectId) {
      const updatedObjects = (cfg.model?.importedObjects ?? []).map((object) =>
        object.id === importedObjectId ? { ...object, ...transform } : object,
      );
      importedModelObjectsRef.current = updatedObjects;
      updateConfig({
        model: {
          ...cfg.model,
          scale: getModelScale(cfg.model),
          objectOverrides: cfg.model?.objectOverrides ?? [],
          importedObjects: updatedObjects,
        },
      });
      if (showSavedToast) showToast(t('editor.modelObjectSaved'));
      return;
    }

    const override: ModelObjectOverride = { id, label, ...transform };
    const updatedOverrides = [
      ...(cfg.model?.objectOverrides ?? []).filter((item) => item.id !== id),
      override,
    ];

    modelObjectOverridesRef.current = updatedOverrides;
    updateConfig({
      model: {
        ...cfg.model,
        scale: getModelScale(cfg.model),
        objectOverrides: updatedOverrides,
        importedObjects: cfg.model?.importedObjects ?? [],
      },
    });
    if (showSavedToast) showToast(t('editor.modelObjectSaved'));
  }, [showToast, t]);

  const centerModelObjectPivot = useCallback((mesh: AbstractMesh) => {
    try {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo({});
      const bounds = mesh.getBoundingInfo().boundingBox;
      const center = Vector3.Lerp(bounds.minimum, bounds.maximum, 0.5);
      mesh.setPivotPoint(center, Space.LOCAL);
    } catch {
      // Imported helper nodes can have incomplete bounds; leave their pivot untouched.
    }
  }, []);

  const attachModelObjectGizmo = useCallback((mesh: AbstractMesh, mode: EditorTransformMode) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    centerModelObjectPivot(mesh);

    if (modelObjectGizmoRef.current) {
      modelObjectGizmoRef.current.dispose();
      modelObjectGizmoRef.current = null;
    }
    if (!utilLayerRef.current) {
      utilLayerRef.current = new UtilityLayerRenderer(scene);
    }

    const gizmo = createGizmoForMode(mode, utilLayerRef.current);
    gizmo.anchorPoint = GizmoAnchorPoint.Pivot;
    gizmo.attachedMesh = mesh;
    gizmo.onDragEndObservable.add(() => {
      setSelectedModelObjectTransform(readModelObjectTransform(mesh));
      persistModelObjectOverride(mesh);
    });

    setUtilityMeshAlpha(utilLayerRef.current, 0.55);
    modelObjectGizmoRef.current = gizmo;
  }, [centerModelObjectPivot, persistModelObjectOverride]);

  const handleSelectModelObject = useCallback((id: string) => {
    setEditorMode('modelObjects');
    setSelectedModelObjectId(id);
  }, []);

  const handleSelectModelObjectRef = useRef(handleSelectModelObject);
  handleSelectModelObjectRef.current = handleSelectModelObject;

  const handleResetSelectedModelObject = useCallback(() => {
    if (!selectedModelObjectId) return;
    const mesh = modelObjectMeshesRef.current[selectedModelObjectId];
    if (!mesh) return;
    const importedObject = importedModelObjectsRef.current.find((object) => object.id === selectedModelObjectId);
    if (importedObject) {
      const resetTransform = {
        position: importedObject.position,
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };
      applyModelObjectTransform(mesh, resetTransform);
      const cfg = getConfig();
      const updatedObjects = (cfg.model?.importedObjects ?? []).map((object) =>
        object.id === selectedModelObjectId ? { ...object, ...readModelObjectTransform(mesh) } : object,
      );
      importedModelObjectsRef.current = updatedObjects;
      updateConfig({
        model: {
          ...cfg.model,
          scale: getModelScale(cfg.model),
          objectOverrides: cfg.model?.objectOverrides ?? [],
          importedObjects: updatedObjects,
        },
      });
      syncModelObjectList(updatedObjects);
      setSelectedModelObjectTransform(readModelObjectTransform(mesh));
      attachModelObjectGizmo(mesh, transformModeRef.current);
      showToast(t('editor.modelObjectReset'));
      return;
    }

    const original = getOriginalModelObjectTransform(mesh);
    if (!original) return;

    applyModelObjectTransform(mesh, original);
    const cfg = getConfig();
    const updatedOverrides = (cfg.model?.objectOverrides ?? []).filter((item) => item.id !== selectedModelObjectId);
    modelObjectOverridesRef.current = updatedOverrides;
    updateConfig({
      model: {
        ...cfg.model,
        scale: getModelScale(cfg.model),
        objectOverrides: updatedOverrides,
        importedObjects: cfg.model?.importedObjects ?? [],
      },
    });
    setSelectedModelObjectTransform(readModelObjectTransform(mesh));
    attachModelObjectGizmo(mesh, transformModeRef.current);
    showToast(t('editor.modelObjectReset'));
  }, [attachModelObjectGizmo, selectedModelObjectId, showToast, syncModelObjectList, t]);

  const handleUploadModelObject = useCallback(async (file: File) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    const format = getImportedObjectFormat(file.name);
    if (!isSupportedImportedObjectFormat(format)) {
      showToast(t('modelObjects.unsupportedFormat', { format: format || '?' }));
      return;
    }

    const id = generateUUID();
    const label = file.name.replace(/\.[^.]+$/, '') || t('modelObjects.uploadedObject');
    const defaultPosition = homeTargetRef.current
      ? worldToConfigPosition(homeTargetRef.current, modelScaleRef.current)
      : { x: 0, y: 0, z: 0 };
    const object: ImportedModelObjectConfig = {
      id,
      label,
      fileName: file.name,
      format,
      position: defaultPosition,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };

    try {
      await uploadModelObject(id, file);
      const loaded = await loadImportedObject(scene, file, object, {
        parent: entityScaleRootRef.current ?? undefined,
        editor: true,
      });
      importedObjectResultsRef.current[id] = loaded;
      modelObjectMeshesRef.current[id] = loaded.root;

      const cfg = getConfig();
      const updatedObjects = [...(cfg.model?.importedObjects ?? []), object];
      importedModelObjectsRef.current = updatedObjects;
      updateConfig({
        model: {
          ...cfg.model,
          scale: getModelScale(cfg.model),
          objectOverrides: cfg.model?.objectOverrides ?? [],
          importedObjects: updatedObjects,
        },
      });
      syncModelObjectList(updatedObjects);
      setEditorMode('modelObjects');
      setSelectedModelObjectId(id);
      showToast(t('modelObjects.uploadedToast'));
    } catch (error) {
      console.error('[Editor] Failed to import model object:', error);
      await deleteModelObjectAsset(id).catch(() => {});
      showToast(t('modelObjects.uploadFailed'));
    }
  }, [showToast, syncModelObjectList, t]);

  const handleDeleteSelectedModelObject = useCallback(async () => {
    if (!selectedModelObjectId) return;
    const selected = importedModelObjectsRef.current.find((object) => object.id === selectedModelObjectId);
    if (!selected) return;

    const result = importedObjectResultsRef.current[selected.id];
    if (result) {
      disposeImportedObject(result);
      delete importedObjectResultsRef.current[selected.id];
    }
    delete modelObjectMeshesRef.current[selected.id];
    await deleteModelObjectAsset(selected.id).catch(() => {});

    const cfg = getConfig();
    const updatedObjects = (cfg.model?.importedObjects ?? []).filter((object) => object.id !== selected.id);
    importedModelObjectsRef.current = updatedObjects;
    updateConfig({
      model: {
        ...cfg.model,
        scale: getModelScale(cfg.model),
        objectOverrides: cfg.model?.objectOverrides ?? [],
        importedObjects: updatedObjects,
      },
    });
    syncModelObjectList(updatedObjects);
    setSelectedModelObjectId(null);
    setSelectedModelObjectTransform(null);
    showToast(t('modelObjects.deletedToast'));
  }, [selectedModelObjectId, showToast, syncModelObjectList, t]);

  const handleModelObjectTransformChange = useCallback((transform: Required<ModelObjectTransform>) => {
    if (!selectedModelObjectId) return;
    const mesh = modelObjectMeshesRef.current[selectedModelObjectId];
    if (!mesh) return;

    const nextTransform: Required<ModelObjectTransform> = {
      position: transform.position,
      rotation: transform.rotation,
      scale: {
        x: Math.max(0.001, transform.scale.x),
        y: Math.max(0.001, transform.scale.y),
        z: Math.max(0.001, transform.scale.z),
      },
    };

    applyModelObjectTransform(mesh, nextTransform);
    setSelectedModelObjectTransform(readModelObjectTransform(mesh));

    if (modelObjectPersistTimerRef.current !== null) {
      window.clearTimeout(modelObjectPersistTimerRef.current);
    }
    modelObjectPersistTimerRef.current = window.setTimeout(() => {
      persistModelObjectOverride(mesh, false);
      modelObjectPersistTimerRef.current = null;
    }, 250);
  }, [persistModelObjectOverride, selectedModelObjectId]);

  useEffect(() => () => {
    if (modelObjectPersistTimerRef.current !== null) {
      window.clearTimeout(modelObjectPersistTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (editorMode !== 'modelObjects') {
      detachModelObjectGizmo();
      setSelectedModelObjectTransform(null);
      return;
    }

    const mesh = selectedModelObjectId ? modelObjectMeshesRef.current[selectedModelObjectId] : null;
    if (!mesh) {
      detachModelObjectGizmo();
      setSelectedModelObjectTransform(null);
      return;
    }

    if (selectedModelObjectMeshRef.current && selectedModelObjectMeshRef.current !== mesh) {
      selectedModelObjectMeshRef.current.showBoundingBox = false;
    }
    selectedModelObjectMeshRef.current = mesh;
    mesh.showBoundingBox = true;
    setSelectedModelObjectTransform(readModelObjectTransform(mesh));
    attachModelObjectGizmo(mesh, transformMode);
  }, [attachModelObjectGizmo, detachModelObjectGizmo, editorMode, selectedModelObjectId, transformMode]);


  // Tour event: switch back to lights tab
  useEffect(() => {
    const handler = () => setEditorMode('lights');
    document.addEventListener('tour:switch-to-lights', handler);
    return () => document.removeEventListener('tour:switch-to-lights', handler);
  }, []);

  // Preview mesh management
  const clearPreview = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (previewObsRef.current && scene) {
      scene.onBeforeRenderObservable.remove(previewObsRef.current);
      previewObsRef.current = null;
    }
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    if (roomPreviewRootRef.current) {
      roomPreviewRootRef.current.dispose(false, true);
      roomPreviewRootRef.current = null;
      roomPreviewSurfaceRef.current = null;
      roomPreviewOutlineRef.current = null;
      roomPreviewPointHandlesRef.current = [];
      roomPreviewVirtualWallMeshesRef.current = [];
      roomPreviewVirtualWallHandlesRef.current = [];
      roomVirtualWallDraftLineRef.current = null;
      roomVirtualWallDraftHandlesRef.current = [];
    }
    if (previewMeshRef.current) {
      previewMeshRef.current.material?.dispose();
      previewMeshRef.current.dispose();
      previewMeshRef.current = null;
    }
    for (const m of extraPreviewMeshesRef.current) m.dispose();
    extraPreviewMeshesRef.current = [];
    if (hitboxPreviewRef.current) {
      hitboxPreviewRef.current.material?.dispose();
      hitboxPreviewRef.current.dispose();
      hitboxPreviewRef.current = null;
    }
    if (tubeAnchorRef.current) {
      tubeAnchorRef.current.material?.dispose();
      tubeAnchorRef.current.dispose();
      tubeAnchorRef.current = null;
    }
    // Hide any previously shown hitbox mesh
    for (const entry of Object.values(meshMapRef.current)) {
      if (entry.hitboxMesh) entry.hitboxMesh.visibility = 0;
    }
  }, []);

  // Display edit outline — purple wireframe rectangle around the display plane
  const clearDisplayOutline = useCallback(() => {
    if (displayOutlineRef.current) {
      displayOutlineRef.current.dispose();
      displayOutlineRef.current = null;
    }
  }, []);

  const showDisplayOutline = useCallback((plane: Mesh) => {
    clearDisplayOutline();
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    // Get the plane's local bounding extents
    const bounds = plane.getBoundingInfo().boundingBox;
    const min = bounds.minimum;
    const max = bounds.maximum;

    // Build a rectangle in local space (4 corners + close)
    const corners = [
      new Vector3(min.x, min.y, 0),
      new Vector3(max.x, min.y, 0),
      new Vector3(max.x, max.y, 0),
      new Vector3(min.x, max.y, 0),
      new Vector3(min.x, min.y, 0),
    ];

    const purple = new Color4(1, 0.2, 0.8, 1);
    const outline = MeshBuilder.CreateLines('display-outline', {
      points: corners,
      colors: corners.map(() => purple),
    }, scene);
    outline.parent = plane;
    outline.isPickable = false;
    displayOutlineRef.current = outline;
  }, [clearDisplayOutline]);

  // Build pink wireframe meshes for all shadow walls (editor only)
  const rebuildWallEditorMeshes = useCallback((walls: ShadowWallConfig[]) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    // Dispose old
    for (const m of wallEditorMeshesRef.current) m.dispose();
    wallEditorMeshesRef.current = [];
    wallEditorMatRef.current?.dispose();
    wallEditorMatRef.current = null;

    const mat = new StandardMaterial('wall_editor_mat', scene);
    mat.emissiveColor = new Color3(1, 0.2, 0.8);
    mat.alpha = 0.3;
    mat.wireframe = true;
    mat.disableLighting = true;
    wallEditorMatRef.current = mat;

    for (const w of walls) {
      const mesh = MeshBuilder.CreateBox(`wall_editor_${w.id}`, {
        width: w.size.width,
        height: w.size.height,
        depth: w.size.depth,
      }, scene);
      mesh.position = new Vector3(w.position.x, w.position.y, w.position.z);
      if (w.rotation) {
        mesh.rotation.set(
          Tools.ToRadians(w.rotation.x),
          Tools.ToRadians(w.rotation.y),
          Tools.ToRadians(w.rotation.z),
        );
      }
      if (entityScaleRootRef.current) mesh.parent = entityScaleRootRef.current;
      mesh.material = mat;
      mesh.isPickable = false;
      wallEditorMeshesRef.current.push(mesh);
    }
  }, []);

  const disposeWallEditorMeshes = useCallback(() => {
    for (const m of wallEditorMeshesRef.current) m.dispose();
    wallEditorMeshesRef.current = [];
    wallEditorMatRef.current?.dispose();
    wallEditorMatRef.current = null;
  }, []);

  const updatePreviewMesh = useCallback(
    (
      pos: LightPosition,
      shapeType: string,
      sizeOverrides: Record<string, number>,
      rotation?: LightPosition,
      scale?: LightPosition,
      hitboxInfo?: { shape: string; size: Record<string, number>; position: LightPosition; rotation?: LightPosition; scale?: LightPosition },
      partsInfo?: Array<{ shape: string; size: Record<string, number>; position: LightPosition; rotation?: LightPosition; scale?: LightPosition }>,
    ) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      clearPreview();

      const mat = new StandardMaterial('preview-mat', scene);
      mat.emissiveColor = new Color3(0.2, 0.7, 1.0);
      mat.alpha = 0.7;
      mat.disableLighting = true;

      const applyPreviewTransform = (m: Mesh, r?: LightPosition, s?: LightPosition) => {
        if (r) {
          m.rotation.set(
            (r.x * Math.PI) / 180,
            (r.y * Math.PI) / 180,
            (r.z * Math.PI) / 180,
          );
        }
        if (s) {
          m.scaling.multiplyInPlace(new Vector3(
            Math.max(0.001, s.x),
            Math.max(0.001, s.y),
            Math.max(0.001, s.z),
          ));
        }
      };

      const createPreviewShape = (name: string, sh: string, sz: Record<string, number>, p: LightPosition, r?: LightPosition, s?: LightPosition): Mesh => {
        let m: Mesh;
        if (sh === 'nanoleafShapes') {
          m = createNanoleafPreviewMesh(scene, name, sz);
        } else if (sh === 'cube') {
          m = MeshBuilder.CreateBox(name, {
            width: sz.width ?? 0.3,
            height: sz.height ?? 0.3,
            depth: sz.depth ?? 0.3,
          }, scene);
        } else if (sh === 'ellipsoid') {
          m = MeshBuilder.CreateSphere(name, { diameter: 1 }, scene);
          m.scaling = new Vector3(
            sz.width ?? sz.diameter ?? 0.3,
            sz.height ?? sz.diameter ?? 0.3,
            sz.depth ?? sz.diameter ?? 0.3,
          );
        } else {
          m = MeshBuilder.CreateSphere(name, {
            diameter: sz.diameter ?? 0.25,
          }, scene);
        }
        m.position = new Vector3(p.x, p.y, p.z);
        applyPreviewTransform(m, r, s);
        if (entityScaleRootRef.current) m.parent = entityScaleRootRef.current;
        m.isPickable = true;
        m.material = mat;
        return m;
      };

      let mesh: Mesh;
      if (partsInfo && partsInfo.length > 0) {
        // Multi-part preview
        mesh = createPreviewShape('preview_0', partsInfo[0].shape, partsInfo[0].size, partsInfo[0].position, partsInfo[0].rotation, partsInfo[0].scale);
        mesh.metadata = { previewTarget: 'part', partIndex: 0 };
        for (let i = 1; i < partsInfo.length; i++) {
          const extra = createPreviewShape(`preview_${i}`, partsInfo[i].shape, partsInfo[i].size, partsInfo[i].position, partsInfo[i].rotation, partsInfo[i].scale);
          extra.metadata = { previewTarget: 'part', partIndex: i };
          extraPreviewMeshesRef.current.push(extra);
        }
      } else {
        mesh = createPreviewShape('preview', shapeType, sizeOverrides, pos, rotation, scale);
        mesh.metadata = { previewTarget: 'main' };
      }

      // Create hitbox preview if custom hitbox is enabled
      if (hitboxInfo) {
        let hbMesh: Mesh;
        if (hitboxInfo.shape === 'nanoleafShapes') {
          hbMesh = createNanoleafPreviewMesh(scene, 'hitbox-preview', hitboxInfo.size);
        } else if (hitboxInfo.shape === 'cube') {
          hbMesh = MeshBuilder.CreateBox('hitbox-preview', {
            width: hitboxInfo.size.width ?? 0.5,
            height: hitboxInfo.size.height ?? 0.5,
            depth: hitboxInfo.size.depth ?? 0.5,
          }, scene);
        } else if (hitboxInfo.shape === 'ellipsoid') {
          hbMesh = MeshBuilder.CreateSphere('hitbox-preview', { diameter: 1 }, scene);
          hbMesh.scaling = new Vector3(
            hitboxInfo.size.width ?? hitboxInfo.size.diameter ?? 0.5,
            hitboxInfo.size.height ?? hitboxInfo.size.diameter ?? 0.5,
            hitboxInfo.size.depth ?? hitboxInfo.size.diameter ?? 0.5,
          );
        } else {
          hbMesh = MeshBuilder.CreateSphere('hitbox-preview', {
            diameter: hitboxInfo.size.diameter ?? 0.5,
          }, scene);
        }
        const hbPos = hitboxInfo.position;
        hbMesh.position = new Vector3(hbPos.x, hbPos.y, hbPos.z);
        applyPreviewTransform(hbMesh, hitboxInfo.rotation, hitboxInfo.scale);
        if (entityScaleRootRef.current) hbMesh.parent = entityScaleRootRef.current;
        hbMesh.isPickable = true;
        hbMesh.metadata = { previewTarget: 'hitbox' };
        const hbMat = new StandardMaterial('hitbox-preview-mat', scene);
        hbMat.emissiveColor = new Color3(1, 0.2, 0.8); // magenta
        hbMat.alpha = 0.3;
        hbMat.wireframe = true;
        hbMat.disableLighting = true;
        hbMesh.material = hbMat;
        hitboxPreviewRef.current = hbMesh;
      }

      // Pulse animation
      let t = 0;
      previewObsRef.current = scene.onBeforeRenderObservable.add(() => {
        t += 0.05;
        mat.alpha = 0.5 + 0.25 * Math.sin(t);
      });

      previewMeshRef.current = mesh;
      gizmoTargetRef.current = partsInfo?.length ? { type: 'part', index: 0 } : 'main';

      // Attach the active transform gizmo.
      if (!utilLayerRef.current) {
        utilLayerRef.current = new UtilityLayerRenderer(scene);
      }
      const activeMode = transformModeRef.current;
      const gizmo = createGizmoForMode(activeMode, utilLayerRef.current);
      gizmo.anchorPoint = GizmoAnchorPoint.Pivot;
      gizmo.attachedMesh = mesh;

      const onDragStart = () => {
        draggingGizmoRef.current = true;
        if (activeMode === 'move') {
          posUndoStackRef.current.push({ ...positionRef.current });
        }
      };
      const onDrag = () => {
        if (activeMode !== 'move') return;
        const target = gizmoTargetRef.current;
        // Only sync main light position to React state during drag
        if (target === 'main') {
          const p = mesh.position;
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          scheduleGizmoPosition(newPos);
        }
        // For part/hitbox targets, the mesh moves via gizmo — no state update during drag
      };
      const onDragEnd = () => {
        draggingGizmoRef.current = false;
        document.dispatchEvent(new Event('tour:gizmo-used'));
        const attached = gizmo.attachedMesh;
        if (!attached) return;

        if (roomPanelOpenRef.current) {
          if (activeMode === 'rotate') {
            roomFormRef.current?.updateRotation(rotationFromMesh(attached));
          } else if (activeMode === 'scale') {
            const currentSize = roomPreviewInfoRef.current.size;
            roomFormRef.current?.updateSize({
              width: currentSize.width * Math.max(0.001, attached.scaling.x),
              height: currentSize.height * Math.max(0.001, attached.scaling.y),
              depth: currentSize.depth * Math.max(0.001, attached.scaling.z),
            });
          } else {
            flushGizmoPosition();
          }
          return;
        }

        if (wallPanelOpenRef.current) {
          if (activeMode === 'rotate') {
            wallFormRef.current?.updateRotation(rotationFromMesh(attached));
          } else if (activeMode === 'scale') {
            const currentSize = wallPreviewInfoRef.current.size;
            wallFormRef.current?.updateSize({
              width: currentSize.width * Math.max(0.001, attached.scaling.x),
              height: currentSize.height * Math.max(0.001, attached.scaling.y),
              depth: currentSize.depth * Math.max(0.001, attached.scaling.z),
            });
          } else {
            flushGizmoPosition();
          }
          return;
        }

        const target = gizmoTargetRef.current;
        if (activeMode === 'rotate') {
          const nextRotation = rotationFromMesh(attached);
          if (target === 'main') {
            lightFormRef.current?.updateVisualRotation(nextRotation);
          } else if (typeof target === 'object' && target.type === 'part') {
            lightFormRef.current?.updatePartRotation(target.index, nextRotation);
          } else if (typeof target === 'object' && target.type === 'hitbox') {
            lightFormRef.current?.updateHitboxRotation(nextRotation);
          }
          return;
        }
        if (activeMode === 'scale') {
          const info = previewInfoRef.current;
          if (target === 'main') {
            lightFormRef.current?.updateVisualScale(scaleFromMesh(attached, info.shape, info.size));
          } else if (typeof target === 'object' && target.type === 'part') {
            const part = info.parts?.[target.index];
            lightFormRef.current?.updatePartScale(target.index, scaleFromMesh(attached, part?.shape, part?.size));
          } else if (typeof target === 'object' && target.type === 'hitbox') {
            const hitbox = info.hitbox;
            lightFormRef.current?.updateHitboxScale(scaleFromMesh(attached, hitbox?.shape, hitbox?.size));
          }
          return;
        }
        if (target === 'main') {
          flushGizmoPosition();
          return;
        }
        if (attached) {
          const p = attached.position;
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          skipPreviewRebuildRef.current = true;
          if (typeof target === 'object' && target.type === 'part') {
            lightFormRef.current?.updatePartPosition(target.index, newPos);
          } else if (typeof target === 'object' && target.type === 'hitbox') {
            lightFormRef.current?.updateHitboxPosition(newPos);
          }
        }
      };
      gizmo.onDragStartObservable.add(onDragStart);
      gizmo.onDragObservable.add(onDrag);
      gizmo.onDragEndObservable.add(onDragEnd);
      // Make gizmo arrows semi-transparent
      setUtilityMeshAlpha(utilLayerRef.current, 0.5);

      gizmoRef.current = gizmo;
    },
    [clearPreview, flushGizmoPosition, scheduleGizmoPosition],
  );

  const evaluateRoomOverlaps = useCallback((pos: LightPosition, info: RoomPreviewInfo): string[] => {
    if (!roomZoneReadyRef.current) {
      if (roomOverlapNamesRef.current.length) {
        roomOverlapNamesRef.current = [];
        setRoomOverlapNames([]);
      }
      return [];
    }
    const editedRoom = roomEditIdxRef.current === null
      ? null
      : roomsRef.current[roomEditIdxRef.current] ?? null;
    const previewRoom = roomPreviewToConfig(editedRoom?.id ?? '__room-preview__', pos, info);
    const names = findOverlappingRooms(previewRoom, roomsRef.current).map((room) => room.name);
    const unchanged = names.length === roomOverlapNamesRef.current.length
      && names.every((name, index) => name === roomOverlapNamesRef.current[index]);
    if (!unchanged) {
      roomOverlapNamesRef.current = names;
      setRoomOverlapNames(names);
    }
    return names;
  }, []);

  const updateRoomPreview = useCallback((pos: LightPosition, info: RoomPreviewInfo) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    clearPreview();

    const zoneVisible = roomZoneReadyRef.current;
    const points = info.points.length >= 3
      ? info.points.map((point) => ({ ...point }))
      : rectangleRoomZonePoints(info.size.width, info.size.depth);
    const height = Math.max(0.01, info.size.height);
    const hasOverlap = evaluateRoomOverlaps(pos, info).length > 0;
    const configuredColor = roomZoneColor3(info.color);
    const configuredOpacity = clampRoomZoneOpacity(info.opacity);
    const previewOpacity = roomGizmoActiveRef.current
      ? Math.min(0.55, configuredOpacity + 0.08)
      : configuredOpacity;
    const handleSize = Math.min(
      0.11,
      Math.max(0.022, Math.min(info.size.width, info.size.depth) * 0.055),
    );

    const root = MeshBuilder.CreateCylinder('room-preview-centre', {
      diameter: handleSize * 1.5,
      height: Math.max(0.025, handleSize * 0.22),
      tessellation: 24,
    }, scene);
    root.position.set(pos.x, pos.y, pos.z);
    root.rotation.y = Tools.ToRadians(info.rotation.y);
    root.metadata = { previewTarget: 'roomCentre', roomEditorTarget: 'centre' };
    root.isPickable = zoneVisible;
    root.isVisible = zoneVisible;
    if (entityScaleRootRef.current) root.parent = entityScaleRootRef.current;
    const centreMaterial = new StandardMaterial('room-preview-centre-material', scene);
    centreMaterial.diffuseColor = new Color3(1, 0.72, 0.18);
    centreMaterial.emissiveColor = new Color3(0.48, 0.24, 0.03);
    centreMaterial.alpha = roomGizmoActiveRef.current
      && roomSelectedPointRef.current === null
      && roomSelectedVirtualWallEndpointRef.current === null
      ? 1
      : 0.72;
    centreMaterial.disableLighting = true;
    centreMaterial.disableDepthWrite = true;
    root.material = centreMaterial;
    root.renderingGroupId = 2;

    const surface = createRoomZoneSurface(scene, 'room-preview-surface', points, height, true);
    surface.parent = root;
    surface.metadata = { previewTarget: 'roomZone' };
    surface.isPickable = zoneVisible;
    surface.isVisible = zoneVisible;
    const surfaceMaterial = new StandardMaterial('room-preview-surface-material', scene);
    surfaceMaterial.diffuseColor = hasOverlap ? new Color3(0.82, 0.12, 0.18) : configuredColor;
    surfaceMaterial.emissiveColor = hasOverlap ? new Color3(0.48, 0.03, 0.06) : configuredColor.scale(0.45);
    surfaceMaterial.alpha = hasOverlap ? 0.34 : previewOpacity;
    surfaceMaterial.disableLighting = true;
    surfaceMaterial.backFaceCulling = false;
    surface.material = surfaceMaterial;

    const outline = MeshBuilder.CreateLines('room-preview-outline', {
      points: roomZoneOutlinePoints(points, height),
      updatable: true,
    }, scene);
    outline.parent = root;
    outline.color = hasOverlap
      ? new Color3(1, 0.24, 0.3)
      : Color3.Lerp(configuredColor, Color3.White(), 0.3);
    outline.alpha = 1;
    outline.isPickable = false;
    outline.isVisible = zoneVisible;
    outline.metadata = { previewTarget: 'roomOutline' };

    const applyOverlapStyle = (overlapping: boolean) => {
      surfaceMaterial.diffuseColor = overlapping ? new Color3(0.82, 0.12, 0.18) : configuredColor;
      surfaceMaterial.emissiveColor = overlapping ? new Color3(0.48, 0.03, 0.06) : configuredColor.scale(0.45);
      surfaceMaterial.alpha = overlapping ? 0.34 : previewOpacity;
      outline.color = overlapping
        ? new Color3(1, 0.24, 0.3)
        : Color3.Lerp(configuredColor, Color3.White(), 0.3);
    };

    const splitPieceColors = [
      { diffuse: new Color3(0.04, 0.65, 0.72), emissive: new Color3(0.02, 0.34, 0.4) },
      { diffuse: new Color3(0.95, 0.52, 0.12), emissive: new Color3(0.48, 0.2, 0.02) },
      { diffuse: new Color3(0.45, 0.72, 0.18), emissive: new Color3(0.2, 0.36, 0.04) },
    ];
    roomSplitPiecesRef.current.forEach((piece, pieceIndex) => {
      const pieceMesh = createRoomZoneSurface(
        scene,
        `room-preview-split-piece-${pieceIndex}`,
        piece,
        height + 0.008,
      );
      pieceMesh.parent = root;
      pieceMesh.metadata = {
        previewTarget: 'roomSplitPiece',
        roomEditorTarget: 'splitPiece',
        roomSplitPieceIndex: pieceIndex,
      };
      pieceMesh.isPickable = true;
      pieceMesh.renderingGroupId = 2;
      const color = splitPieceColors[pieceIndex % splitPieceColors.length];
      const material = new StandardMaterial(`room-preview-split-piece-material-${pieceIndex}`, scene);
      material.diffuseColor = color.diffuse;
      material.emissiveColor = color.emissive;
      material.alpha = 0.46;
      material.disableLighting = true;
      material.disableDepthWrite = true;
      material.backFaceCulling = false;
      pieceMesh.material = material;
    });

    const selectedVirtualWallEndpoint = roomSelectedVirtualWallEndpointRef.current
      && roomSelectedVirtualWallEndpointRef.current.wallIndex < info.virtualWalls.length
      ? roomSelectedVirtualWallEndpointRef.current
      : null;
    const selectedVirtualWall = roomSelectedVirtualWallRef.current !== null
      && roomSelectedVirtualWallRef.current < info.virtualWalls.length
      ? roomSelectedVirtualWallRef.current
      : selectedVirtualWallEndpoint?.wallIndex ?? null;
    if (selectedVirtualWallEndpoint !== roomSelectedVirtualWallEndpointRef.current) {
      roomSelectedVirtualWallEndpointRef.current = selectedVirtualWallEndpoint;
      setRoomSelectedVirtualWallEndpoint(selectedVirtualWallEndpoint);
    }
    if (selectedVirtualWall !== roomSelectedVirtualWallRef.current) {
      roomSelectedVirtualWallRef.current = selectedVirtualWall;
      setRoomSelectedVirtualWall(selectedVirtualWall);
    }

    const virtualWallHeight = height + handleSize * 0.4;
    const virtualWallMeshes: Mesh[] = [];
    const virtualWallHandles: Mesh[] = [];
    info.virtualWalls.forEach((wall, wallIndex) => {
      const isSelected = wallIndex === selectedVirtualWall;
      const path = [
        new Vector3(wall.start.x, virtualWallHeight, wall.start.z),
        new Vector3(wall.end.x, virtualWallHeight, wall.end.z),
      ];
      const wallMesh = MeshBuilder.CreateTube(`room-preview-virtual-wall-${wallIndex}`, {
        path,
        radius: Math.max(0.004, handleSize * 0.1),
        tessellation: 8,
        cap: Mesh.CAP_ALL,
      }, scene);
      wallMesh.parent = root;
      wallMesh.metadata = {
        previewTarget: 'roomVirtualWall',
        roomEditorTarget: 'virtualWall',
        roomVirtualWallIndex: wallIndex,
      };
      wallMesh.isPickable = true;
      const wallMaterial = new StandardMaterial(`room-preview-virtual-wall-material-${wallIndex}`, scene);
      wallMaterial.diffuseColor = isSelected ? new Color3(1, 0.72, 0.18) : new Color3(0.96, 0.42, 0.16);
      wallMaterial.emissiveColor = isSelected ? new Color3(0.55, 0.3, 0.02) : new Color3(0.45, 0.12, 0.02);
      wallMaterial.alpha = isSelected ? 1 : 0.88;
      wallMaterial.disableLighting = true;
      wallMaterial.disableDepthWrite = true;
      wallMesh.material = wallMaterial;
      wallMesh.renderingGroupId = 2;
      virtualWallMeshes.push(wallMesh);

      (['start', 'end'] as const).forEach((endpoint) => {
        const point = wall[endpoint];
        const endpointSelected = selectedVirtualWallEndpoint?.wallIndex === wallIndex
          && selectedVirtualWallEndpoint.endpoint === endpoint;
        const endpointHandle = MeshBuilder.CreateSphere(
          `room-preview-virtual-wall-${wallIndex}-${endpoint}`,
          { diameter: handleSize * 0.82, segments: 12 },
          scene,
        );
        endpointHandle.parent = root;
        endpointHandle.position.set(point.x, virtualWallHeight, point.z);
        endpointHandle.metadata = {
          previewTarget: 'roomVirtualWallEndpoint',
          roomEditorTarget: 'virtualWallEndpoint',
          roomVirtualWallIndex: wallIndex,
          roomVirtualWallEndpoint: endpoint,
        };
        endpointHandle.isPickable = true;
        const endpointMaterial = new StandardMaterial(
          `room-preview-virtual-wall-${wallIndex}-${endpoint}-material`,
          scene,
        );
        endpointMaterial.diffuseColor = endpointSelected
          ? new Color3(1, 0.84, 0.3)
          : new Color3(0.98, 0.5, 0.18);
        endpointMaterial.emissiveColor = endpointSelected
          ? new Color3(0.6, 0.38, 0.04)
          : new Color3(0.45, 0.14, 0.02);
        endpointMaterial.alpha = endpointSelected ? 1 : 0.9;
        endpointMaterial.disableLighting = true;
        endpointMaterial.disableDepthWrite = true;
        endpointHandle.material = endpointMaterial;
        endpointHandle.renderingGroupId = 2;
        virtualWallHandles.push(endpointHandle);
      });
    });

    const previewLabel = createRoomZoneLabel(
      scene,
      'preview',
      info.name,
      points,
      new Vector3(0, height, 0),
      root,
      true,
    );
    previewLabel.label.isVisible = zoneVisible;

    const selectedPoint = roomSelectedPointRef.current !== null
      && roomSelectedPointRef.current < points.length
      ? roomSelectedPointRef.current
      : null;
    if (selectedPoint !== roomSelectedPointRef.current) {
      roomSelectedPointRef.current = selectedPoint;
      setRoomSelectedPoint(selectedPoint);
    }
    const handles = points.map((point, index) => {
      const handle = MeshBuilder.CreateSphere(`room-preview-point-${index}`, {
        diameter: handleSize,
        segments: 12,
      }, scene);
      handle.parent = root;
      handle.position.set(point.x, height + handleSize * 0.55, point.z);
      handle.metadata = { previewTarget: 'roomPoint', roomEditorTarget: 'point', roomPointIndex: index };
      handle.isPickable = zoneVisible;
      handle.isVisible = zoneVisible;
      const material = new StandardMaterial(`room-preview-point-material-${index}`, scene);
      const isSelected = roomGizmoActiveRef.current && index === selectedPoint;
      material.diffuseColor = isSelected ? new Color3(0.98, 0.76, 0.18) : new Color3(0.18, 0.72, 0.96);
      material.emissiveColor = isSelected ? new Color3(0.55, 0.3, 0.02) : new Color3(0.04, 0.3, 0.5);
      material.alpha = isSelected ? 1 : 0.82;
      material.disableLighting = true;
      material.disableDepthWrite = true;
      handle.material = material;
      handle.renderingGroupId = 2;
      return handle;
    });

    roomPreviewRootRef.current = root;
    roomPreviewSurfaceRef.current = surface;
    roomPreviewOutlineRef.current = outline;
    roomPreviewPointHandlesRef.current = handles;
    roomPreviewVirtualWallMeshesRef.current = virtualWallMeshes;
    roomPreviewVirtualWallHandlesRef.current = virtualWallHandles;

    if (!roomGizmoActiveRef.current) return;

    if (!utilLayerRef.current) utilLayerRef.current = new UtilityLayerRenderer(scene);
    const activeMode = transformModeRef.current;
    const wallEndpointTarget = activeMode === 'move' && selectedVirtualWallEndpoint
      ? virtualWallHandles[selectedVirtualWallEndpoint.wallIndex * 2 + (selectedVirtualWallEndpoint.endpoint === 'end' ? 1 : 0)]
      : null;
    const pointTarget = activeMode === 'move' && !wallEndpointTarget && selectedPoint !== null
      ? handles[selectedPoint]
      : null;
    const attached = wallEndpointTarget ?? pointTarget ?? root;
    const gizmo = createGizmoForMode(activeMode, utilLayerRef.current);
    gizmo.scaleRatio *= activeMode === 'move' ? 0.62 : 0.78;
    gizmo.anchorPoint = GizmoAnchorPoint.Pivot;
    gizmo.attachedMesh = attached;
    if (gizmo instanceof PositionGizmo && (pointTarget || wallEndpointTarget)) {
      gizmo.yGizmo.isEnabled = false;
      gizmo.updateGizmoRotationToMatchAttachedMesh = false;
    }

    const updateDraggedPoint = () => {
      if (selectedPoint === null || !pointTarget) return;
      const point: RoomZonePoint = {
        x: roundValue(pointTarget.position.x),
        z: roundValue(pointTarget.position.z),
      };
      pointTarget.position.y = height + handleSize * 0.55;
      const nextPoints = roomPreviewInfoRef.current.points.map((current, index) =>
        index === selectedPoint ? point : current);
      roomPreviewInfoRef.current = { ...roomPreviewInfoRef.current, points: nextPoints };
      updateRoomZoneSurface(surface, nextPoints, height);
      MeshBuilder.CreateLines(outline.name, {
        points: roomZoneOutlinePoints(nextPoints, height),
        instance: outline,
      }, scene);
      applyOverlapStyle(evaluateRoomOverlaps(positionRef.current, roomPreviewInfoRef.current).length > 0);
    };

    const updateDraggedVirtualWallEndpoint = () => {
      if (!selectedVirtualWallEndpoint || !wallEndpointTarget) return;
      const endpointPoint: RoomZonePoint = {
        x: roundValue(wallEndpointTarget.position.x),
        z: roundValue(wallEndpointTarget.position.z),
      };
      wallEndpointTarget.position.y = virtualWallHeight;
      const nextWalls = roomPreviewInfoRef.current.virtualWalls.map((wall, index) => index === selectedVirtualWallEndpoint.wallIndex
        ? { ...wall, [selectedVirtualWallEndpoint.endpoint]: endpointPoint }
        : wall);
      roomPreviewInfoRef.current = { ...roomPreviewInfoRef.current, virtualWalls: nextWalls };
      const changedWall = nextWalls[selectedVirtualWallEndpoint.wallIndex];
      const changedMesh = virtualWallMeshes[selectedVirtualWallEndpoint.wallIndex];
      if (changedWall && changedMesh) {
        MeshBuilder.CreateTube(changedMesh.name, {
          path: [
            new Vector3(changedWall.start.x, virtualWallHeight, changedWall.start.z),
            new Vector3(changedWall.end.x, virtualWallHeight, changedWall.end.z),
          ],
          instance: changedMesh,
        }, scene);
      }
    };

    gizmo.onDragStartObservable.add(() => {
      draggingGizmoRef.current = true;
      if (activeMode === 'move' && selectedPoint === null) {
        posUndoStackRef.current.push({ ...positionRef.current });
      }
    });
    gizmo.onDragObservable.add(() => {
      if (attached === root) {
        const transformedInfo: RoomPreviewInfo = activeMode === 'scale'
          ? {
            ...roomPreviewInfoRef.current,
            points: roomPreviewInfoRef.current.points.map((point) => ({
              x: point.x * Math.max(0.001, root.scaling.x),
              z: point.z * Math.max(0.001, root.scaling.z),
            })),
          }
          : activeMode === 'rotate'
            ? { ...roomPreviewInfoRef.current, rotation: rotationFromMesh(root) }
            : roomPreviewInfoRef.current;
        const previewPosition = activeMode === 'move'
          ? { x: root.position.x, y: root.position.y, z: root.position.z }
          : positionRef.current;
        applyOverlapStyle(evaluateRoomOverlaps(previewPosition, transformedInfo).length > 0);
      }
      if (activeMode !== 'move') return;
      if (selectedVirtualWallEndpoint !== null) {
        updateDraggedVirtualWallEndpoint();
        return;
      }
      if (selectedPoint !== null) {
        updateDraggedPoint();
        return;
      }
      scheduleGizmoPosition({
        x: roundValue(root.position.x),
        y: roundValue(root.position.y),
        z: roundValue(root.position.z),
      });
    });
    gizmo.onDragEndObservable.add(() => {
      draggingGizmoRef.current = false;
      document.dispatchEvent(new Event('tour:gizmo-used'));
      if (activeMode === 'rotate') {
        roomFormRef.current?.updateRotation(rotationFromMesh(root));
      } else if (activeMode === 'scale') {
        roomFormRef.current?.updateScale({
          x: Math.max(0.001, root.scaling.x),
          y: Math.max(0.001, root.scaling.y),
          z: Math.max(0.001, root.scaling.z),
        });
      } else if (selectedVirtualWallEndpoint && wallEndpointTarget) {
        updateDraggedVirtualWallEndpoint();
        roomFormRef.current?.updateVirtualWallEndpoint(
          selectedVirtualWallEndpoint.wallIndex,
          selectedVirtualWallEndpoint.endpoint,
          {
            x: roundValue(wallEndpointTarget.position.x),
            z: roundValue(wallEndpointTarget.position.z),
          },
        );
      } else if (selectedPoint !== null && pointTarget) {
        updateDraggedPoint();
        roomFormRef.current?.updatePoint(selectedPoint, {
          x: roundValue(pointTarget.position.x),
          z: roundValue(pointTarget.position.z),
        });
      } else {
        flushGizmoPosition();
      }
    });
    setUtilityMeshAlpha(utilLayerRef.current, 0.55);
    gizmoRef.current = gizmo;
  }, [clearPreview, evaluateRoomOverlaps, flushGizmoPosition, scheduleGizmoPosition]);

  const clearRoomVirtualWallDraft = useCallback(() => {
    roomVirtualWallDraftLineRef.current?.dispose();
    roomVirtualWallDraftLineRef.current = null;
    for (const handle of roomVirtualWallDraftHandlesRef.current) handle.dispose(false, true);
    roomVirtualWallDraftHandlesRef.current = [];
  }, []);

  const updateRoomVirtualWallDraft = useCallback((start: RoomZonePoint, end: RoomZonePoint) => {
    const scene = sceneCtxRef.current?.scene;
    const root = roomPreviewRootRef.current;
    if (!scene || !root) return;
    const height = Math.max(0.012, roomPreviewInfoRef.current.size.height) + 0.014;
    const path = [new Vector3(start.x, height, start.z), new Vector3(end.x, height, end.z)];
    if (roomVirtualWallDraftLineRef.current) {
      MeshBuilder.CreateLines(roomVirtualWallDraftLineRef.current.name, {
        points: path,
        instance: roomVirtualWallDraftLineRef.current,
      }, scene);
    } else {
      const line = MeshBuilder.CreateLines('room-virtual-wall-draft', { points: path }, scene);
      line.parent = root;
      line.color = new Color3(1, 0.62, 0.18);
      line.alpha = 1;
      line.isPickable = false;
      line.renderingGroupId = 2;
      roomVirtualWallDraftLineRef.current = line;
      roomVirtualWallDraftHandlesRef.current = (['start', 'end'] as const).map((endpoint) => {
        const handle = MeshBuilder.CreateSphere(`room-virtual-wall-draft-${endpoint}`, {
          diameter: 0.045,
          segments: 10,
        }, scene);
        handle.parent = root;
        handle.isPickable = false;
        const material = new StandardMaterial(`room-virtual-wall-draft-${endpoint}-material`, scene);
        material.diffuseColor = new Color3(1, 0.62, 0.18);
        material.emissiveColor = new Color3(0.5, 0.2, 0.02);
        material.disableLighting = true;
        material.disableDepthWrite = true;
        handle.material = material;
        handle.renderingGroupId = 2;
        return handle;
      });
    }
    roomVirtualWallDraftHandlesRef.current[0]?.position.set(start.x, height, start.z);
    roomVirtualWallDraftHandlesRef.current[1]?.position.set(end.x, height, end.z);
  }, []);

  const clearRoomSplitDraft = useCallback(() => {
    roomSplitDraftLineRef.current?.dispose();
    roomSplitDraftLineRef.current = null;
    for (const handle of roomSplitDraftHandlesRef.current) handle.dispose(false, true);
    roomSplitDraftHandlesRef.current = [];
  }, []);

  const updateRoomSplitDraft = useCallback((start: RoomZonePoint, end: RoomZonePoint) => {
    const scene = sceneCtxRef.current?.scene;
    const root = roomPreviewRootRef.current;
    if (!scene || !root) return;
    const height = Math.max(0.012, roomPreviewInfoRef.current.size.height) + 0.022;
    const path = [new Vector3(start.x, height, start.z), new Vector3(end.x, height, end.z)];
    if (roomSplitDraftLineRef.current) {
      MeshBuilder.CreateLines(roomSplitDraftLineRef.current.name, {
        points: path,
        instance: roomSplitDraftLineRef.current,
      }, scene);
    } else {
      const line = MeshBuilder.CreateLines('room-split-draft', { points: path }, scene);
      line.parent = root;
      line.color = new Color3(0.72, 0.36, 1);
      line.alpha = 1;
      line.isPickable = false;
      line.renderingGroupId = 2;
      roomSplitDraftLineRef.current = line;
      roomSplitDraftHandlesRef.current = (['start', 'end'] as const).map((endpoint) => {
        const handle = MeshBuilder.CreateSphere(`room-split-draft-${endpoint}`, {
          diameter: 0.048,
          segments: 10,
        }, scene);
        handle.parent = root;
        handle.isPickable = false;
        const material = new StandardMaterial(`room-split-draft-${endpoint}-material`, scene);
        material.diffuseColor = new Color3(0.72, 0.36, 1);
        material.emissiveColor = new Color3(0.34, 0.08, 0.55);
        material.disableLighting = true;
        material.disableDepthWrite = true;
        handle.material = material;
        handle.renderingGroupId = 2;
        return handle;
      });
    }
    roomSplitDraftHandlesRef.current[0]?.position.set(start.x, height, start.z);
    roomSplitDraftHandlesRef.current[1]?.position.set(end.x, height, end.z);
  }, []);

  // Placing mode
  const enterPlacingMode = useCallback(() => {
    if (roomPanelOpenRef.current) {
      handleCancelRoomVirtualWallDrawingRef.current();
      handleCancelRoomSplitRef.current();
    }
    setPlacingMode(true);
    const ctx = sceneCtxRef.current;
    if (ctx) {
      ctx.camera.inputs.removeByType('ArcRotateCameraPointersInput');
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
  }, []);

  const exitPlacingMode = useCallback(() => {
    setPlacingMode(false);
    const ctx = sceneCtxRef.current;
    if (ctx && canvasRef.current) {
      ctx.camera.inputs.addPointers();
      applyCameraControlSensitivity(ctx.camera);
      ctx.camera.attachControl(canvasRef.current, true);
      canvasRef.current.style.cursor = 'default';
    }
  }, []);

  const computeIdealRadius = useCallback(() => {
    const canvas = canvasRef.current;
    const ms = modelSizeRef.current;
    const camera = sceneCtxRef.current?.camera;
    if (!canvas || !ms || !camera) return modelDiagonalRef.current * 1.6;
    const fov = camera.fov;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const radiusForHeight = (ms.z / 2) / (Math.tan(fov / 2) * 0.75);
    const radiusForWidth = (ms.x / 2) / (Math.tan(fov / 2) * aspect * 0.75);
    return Math.max(radiusForHeight, radiusForWidth);
  }, []);

  const cancelRoomVirtualWallDrawing = useCallback(() => {
    roomVirtualWallDrawingRef.current = false;
    roomVirtualWallDraftStartRef.current = null;
    roomVirtualWallDraftEndRef.current = null;
    setRoomVirtualWallDrawing(false);
    setRoomVirtualWallStartSet(false);
    clearRoomVirtualWallDraft();
    const ctx = sceneCtxRef.current;
    if (ctx && canvasRef.current) {
      ctx.camera.inputs.addPointers();
      applyCameraControlSensitivity(ctx.camera);
      ctx.camera.attachControl(canvasRef.current, true);
      canvasRef.current.style.cursor = 'default';
    }
  }, [clearRoomVirtualWallDraft]);
  handleCancelRoomVirtualWallDrawingRef.current = cancelRoomVirtualWallDrawing;

  const cancelRoomSplit = useCallback(() => {
    if (canvasRef.current?.dataset.roomSplitDrawing === 'true') {
      delete canvasRef.current.dataset.roomSplitDrawing;
    }
    roomSplitDrawingRef.current = false;
    roomSplitDraftStartRef.current = null;
    roomSplitDraftEndRef.current = null;
    roomSplitPiecesRef.current = [];
    setRoomSplitDrawing(false);
    setRoomSplitStartSet(false);
    setRoomSplitPieces([]);
    setRoomSplitAssignments([]);
    setRoomSplitError(null);
    clearRoomSplitDraft();
    const ctx = sceneCtxRef.current;
    if (ctx && canvasRef.current) {
      ctx.camera.inputs.addPointers();
      applyCameraControlSensitivity(ctx.camera);
      ctx.camera.attachControl(canvasRef.current, true);
      canvasRef.current.style.cursor = 'default';
    }
    if (roomPanelOpenRef.current && roomZoneReadyRef.current) {
      updateRoomPreview(positionRef.current, roomPreviewInfoRef.current);
    }
  }, [clearRoomSplitDraft, updateRoomPreview]);
  handleCancelRoomSplitRef.current = cancelRoomSplit;

  const recenterView = useCallback(() => {
    const ctx = sceneCtxRef.current;
    const homeTarget = homeTargetRef.current;
    if (!ctx || !homeTarget || homingRef.current) return;
    const { camera, scene } = ctx;
    homingRef.current = true;
    camera.detachControl();

    const fps = 60;
    const frames = 45;
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    const makeAnim = (prop: string, from: number, to: number) => {
      const a = new Animation(`home_${prop}`, prop, fps, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([{ frame: 0, value: from }, { frame: frames, value: to }]);
      a.setEasingFunction(ease);
      return a;
    };

    const targetRadius = computeIdealRadius();
    const targetAlpha = Tools.ToRadians(270);
    const targetBeta = Tools.ToRadians(0.5);
    const targetPos = homeTarget.clone();

    const EPS = 0.002;
    if (
      Math.abs(camera.radius - targetRadius) < EPS &&
      Math.abs(camera.alpha - targetAlpha) < EPS &&
      Math.abs(camera.beta - targetBeta) < EPS &&
      Vector3.Distance(camera.target, targetPos) < EPS
    ) {
      homingRef.current = false;
      camera.attachControl(true);
      return;
    }

    const targetAnim = new Animation('home_target', 'target', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    targetAnim.setKeys([{ frame: 0, value: camera.target.clone() }, { frame: frames, value: targetPos }]);
    targetAnim.setEasingFunction(ease);

    camera.animations = [
      makeAnim('radius', camera.radius, targetRadius),
      makeAnim('alpha', camera.alpha, targetAlpha),
      makeAnim('beta', camera.beta, targetBeta),
      targetAnim,
    ];

    scene.beginAnimation(camera, 0, frames, false, 1, () => {
      camera.attachControl(true);
      homingRef.current = false;
    });
  }, [computeIdealRadius]);

  // Initialize scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const ctx = createScene(canvas);
    sceneCtxRef.current = ctx;

    async function init() {
      // Load config
      try {
        const config = await getConfig();
        if (disposed) return;
        setLights(config.lights || []);
        lightsRef.current = config.lights || [];
        setLightGroups(config.lightGroups || []);
        setBlinds(config.blinds || []);
        blindsRef.current = config.blinds || [];
        setDisplays(config.displays || []);
        displaysRef.current = config.displays || [];
        setShadowWalls(config.shadowWalls || []);
        shadowWallsRef.current = config.shadowWalls || [];
        setSmartDevices(config.smartDevices || []);
        smartDevicesRef.current = config.smartDevices || [];
        setTubes(config.tubes || []);
        tubesRef.current = config.tubes || [];
        setRooms(config.rooms || []);
        roomsRef.current = config.rooms || [];
        modelScaleRef.current = getModelScale(config.model);
        modelObjectOverridesRef.current = config.model?.objectOverrides ?? [];
        importedModelObjectsRef.current = config.model?.importedObjects ?? [];
        entityScaleRootRef.current = createSceneScaleRoot(ctx.scene, modelScaleRef.current);

        // Load model from IndexedDB
        const modelBlob = await getModelBlob();
        if (!modelBlob) {
          navigate('/onboarding');
          return;
        }
        const renderSettingsAtLoad = getSetting('render');
        setShowTextures(renderSettingsAtLoad.showTextures);
        const result = await loadModel(ctx.scene, modelBlob, undefined, {
          showTextures: renderSettingsAtLoad.showTextures,
          sketchColor: renderSettingsAtLoad.sketchColor,
          sketchSpecular: renderSettingsAtLoad.sketchSpecular,
          edgeRendering: false,
          modelScale: modelScaleRef.current,
          objectOverrides: modelObjectOverridesRef.current,
        });
        if (disposed) return;

        const modelMeshes = result.meshes.filter((m) => m.getTotalVertices?.() > 0);
        modelMeshesRef.current = modelMeshes;
        modelObjectMeshesRef.current = Object.fromEntries(
          result.editableObjects.map((obj) => [obj.id, obj.mesh]),
        );
        baseModelObjectsRef.current = result.editableObjects.map(({ id, label }) => ({
          id,
          label,
          kind: 'model',
        }));
        syncModelObjectList(importedModelObjectsRef.current);
        edgeOutlineRef.current = createEdgeOutline(ctx.scene, ctx.camera, {
          meshes: modelMeshes,
          enabled: !renderSettingsAtLoad.showTextures,
        });

        const target = result.center.clone();
        target.y = 0;
        homeTargetRef.current = target.clone();
        ctx.camera.target = target;
        ctx.camera.alpha = Tools.ToRadians(270);
        ctx.camera.beta = Tools.ToRadians(0.5);
        ctx.camera.lowerRadiusLimit = result.diagonal * 0.27;
        ctx.camera.upperRadiusLimit = result.diagonal * 3;

        modelSizeRef.current = { x: result.size.x, z: result.size.z };
        modelDiagonalRef.current = result.diagonal;
        setEditorDefaultSizes(sceneRelativeDefaults(result.diagonal));
        ctx.camera.radius = computeIdealRadius();

        // Build light meshes
        rebuildAllMeshes(ctx.scene, meshMapRef.current, config.lights || [], {
          parent: entityScaleRootRef.current ?? undefined,
          sceneScale: modelScaleRef.current,
        });

        // Build blind meshes
        rebuildAllBlindMeshes(ctx.scene, blindMeshMapRef.current, config.blinds || [], entityScaleRootRef.current ?? undefined);

        rebuildAllSmartDeviceMeshes(ctx.scene, smartDeviceMeshMapRef.current, config.smartDevices || [], entityScaleRootRef.current ?? undefined);

        // Build display meshes (editor-only preview — no live HA data, show placeholder)
        rebuildAllDisplayMeshes(ctx.scene, displayMeshMapRef.current, config.displays || [], entityScaleRootRef.current ?? undefined);
        for (const entry of Object.values(displayMeshMapRef.current)) {
          entry.plane.isPickable = true;
          updateDisplayTexture(entry, buildMockupStates(displaysRef.current));
        }

        // Build tube meshes (editor preview — no live data, show mockup values)
        for (const tc of (config.tubes || [])) {
          tubeMeshMapRef.current[tc.id] = createTubeMeshes(ctx.scene, tc, null, entityScaleRootRef.current ?? undefined);
        }
        renderMockupLabels(tubeMeshMapRef.current);
        await loadImportedObjectsIntoScene(importedModelObjectsRef.current, ctx.scene);
      } catch (e) {
        if (!disposed) console.warn('[Editor] Init error:', e);
      }
    }

    // Pointer move — coordinate readout
    let hoveredRoomId: string | null = null;
    let pointerDownPos: { x: number; y: number } | null = null;
    const DRAG_THRESHOLD = 6; // pixels — beyond this it's a rotation, not a click
    const pickRoomSplitPoint = (offsetX: number, offsetY: number): Vector3 | null => {
      const modelPick = ctx.scene.pick(
        offsetX,
        offsetY,
        (mesh) => modelMeshesRef.current.includes(mesh),
      );
      if (modelPick?.hit && modelPick.pickedPoint) return modelPick.pickedPoint;
      const zonePick = ctx.scene.pick(
        offsetX,
        offsetY,
        (mesh) => mesh.metadata?.previewTarget === 'roomZone',
      );
      return zonePick?.hit && zonePick.pickedPoint ? zonePick.pickedPoint : null;
    };

    const handleRoomSplitPointerMove = (event: PointerEvent) => {
      if (canvas.dataset.roomSplitDrawing !== 'true' || !roomSplitDraftStartRef.current) return;
      const splitPoint = pickRoomSplitPoint(event.offsetX, event.offsetY);
      if (!splitPoint) return;
      const localEnd = worldPointToRoomLocal(
        splitPoint,
        positionRef.current,
        roomPreviewInfoRef.current.rotation.y,
        modelScaleRef.current,
      );
      roomSplitDraftEndRef.current = localEnd;
      updateRoomSplitDraft(roomSplitDraftStartRef.current, localEnd);
    };

    const handleRoomSplitPointerDown = (event: PointerEvent) => {
      if (canvas.dataset.roomSplitDrawing !== 'true') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pointerDownPos = null;
      const splitPoint = pickRoomSplitPoint(event.offsetX, event.offsetY);
      if (!splitPoint) return;
      const localPoint = worldPointToRoomLocal(
        splitPoint,
        positionRef.current,
        roomPreviewInfoRef.current.rotation.y,
        modelScaleRef.current,
      );
      const start = roomSplitDraftStartRef.current;
      if (!start) {
        roomSplitDraftStartRef.current = localPoint;
        roomSplitDraftEndRef.current = localPoint;
        setRoomSplitStartSet(true);
        updateRoomSplitDraft(localPoint, localPoint);
        showToast(t('rooms.splitEnd'));
        return;
      }

      const pieces = splitRoomZoneByLine(roomPreviewInfoRef.current.points, start, localPoint);
      if (pieces.length < 2) {
        roomSplitDraftStartRef.current = null;
        roomSplitDraftEndRef.current = null;
        setRoomSplitStartSet(false);
        clearRoomSplitDraft();
        showToast(t('rooms.splitMisses'));
        return;
      }

      roomSplitPiecesRef.current = pieces;
      setRoomSplitPieces(pieces);
      setRoomSplitError(null);
      const sourceIndex = roomEditIdxRef.current;
      const source = sourceIndex === null ? roomDraftRef.current : roomsRef.current[sourceIndex] ?? null;
      const sourceTarget = source
        ? sourceIndex === null ? `draft:${source.id}` : `room:${source.id}`
        : '';
      const largestPieceIndex = pieces.reduce((largestIndex, piece, pieceIndex) => (
        roomZonePointArea(piece) > roomZonePointArea(pieces[largestIndex]) ? pieceIndex : largestIndex
      ), 0);
      setRoomSplitAssignments(pieces.map((_, pieceIndex) => (
        pieceIndex === largestPieceIndex ? sourceTarget : ''
      )));
      delete canvas.dataset.roomSplitDrawing;
      roomSplitDrawingRef.current = false;
      setRoomSplitDrawing(false);
      roomSplitDraftStartRef.current = null;
      roomSplitDraftEndRef.current = null;
      setRoomSplitStartSet(false);
      clearRoomSplitDraft();
      roomSelectedPointRef.current = null;
      setRoomSelectedPoint(null);
      roomSelectedVirtualWallRef.current = null;
      setRoomSelectedVirtualWall(null);
      roomSelectedVirtualWallEndpointRef.current = null;
      setRoomSelectedVirtualWallEndpoint(null);
      roomGizmoActiveRef.current = false;
      setRoomGizmoActive(false);
      ctx.camera.inputs.addPointers();
      applyCameraControlSensitivity(ctx.camera);
      ctx.camera.attachControl(canvas, true);
      canvas.style.cursor = 'pointer';
      updateRoomPreview(positionRef.current, roomPreviewInfoRef.current);
      showToast(t('rooms.splitAssignReady'));
    };
    canvas.addEventListener('pointermove', handleRoomSplitPointerMove, true);
    canvas.addEventListener('pointerdown', handleRoomSplitPointerDown, true);

    ctx.scene.onPointerMove = (evt, pick) => {
      if (pick.hit && pick.pickedPoint) {
        const p = worldToConfigPosition(pick.pickedPoint, modelScaleRef.current);
        setCoordText(`x: ${p.x.toFixed(2)}  z: ${p.y.toFixed(2)}  y: ${p.z.toFixed(2)}`);
        if ((placingModeRef.current || roomVirtualWallDrawingRef.current || roomSplitDrawingRef.current) && canvas) canvas.style.cursor = 'crosshair';
      } else {
        setCoordText(t('editor.coordEmpty'));
        if (!placingModeRef.current && !roomVirtualWallDrawingRef.current && !roomSplitDrawingRef.current && canvas) canvas.style.cursor = 'default';
      }

      if (roomVirtualWallDrawingRef.current && roomVirtualWallDraftStartRef.current) {
        const wallPick = ctx.scene.pick(
          evt.offsetX,
          evt.offsetY,
          (mesh) => modelMeshesRef.current.includes(mesh),
        );
        if (wallPick?.hit && wallPick.pickedPoint) {
          const localEnd = worldPointToRoomLocal(
            wallPick.pickedPoint,
            positionRef.current,
            roomPreviewInfoRef.current.rotation.y,
            modelScaleRef.current,
          );
          roomVirtualWallDraftEndRef.current = localEnd;
          updateRoomVirtualWallDraft(roomVirtualWallDraftStartRef.current, localEnd);
        }
      }

      const roomHoverPick = editorModeRef.current === 'rooms' && !roomPanelOpenRef.current
        ? ctx.scene.pick(
          evt.offsetX,
          evt.offsetY,
          (mesh) => Boolean(mesh.metadata?.roomId) && !mesh.metadata?.roomLabel,
        )
        : null;
      const nextHoveredRoomId = roomHoverPick?.hit
        ? roomHoverPick.pickedMesh?.metadata?.roomId as string | undefined
        : undefined;
      const nextRoomId = nextHoveredRoomId ?? null;
      if (nextRoomId !== hoveredRoomId) {
        hoveredRoomId = nextRoomId;
        setRoomZoneLabelVisibility(roomZoneMeshMapRef.current, hoveredRoomId);
      }
      if (!placingModeRef.current && !roomVirtualWallDrawingRef.current && !roomSplitDrawingRef.current && canvas && hoveredRoomId) canvas.style.cursor = 'pointer';
    };

    // Click to place or click light/display mesh to edit
    ctx.scene.onPointerDown = (evt, pick) => {
      pointerDownPos = { x: evt.clientX, y: evt.clientY };

      if (roomVirtualWallDrawingRef.current && roomPanelOpenRef.current) {
        const wallPick = ctx.scene.pick(
          evt.offsetX,
          evt.offsetY,
          (mesh) => modelMeshesRef.current.includes(mesh),
        );
        if (!wallPick.hit || !wallPick.pickedPoint) return;
        const localPoint = worldPointToRoomLocal(
          wallPick.pickedPoint,
          positionRef.current,
          roomPreviewInfoRef.current.rotation.y,
          modelScaleRef.current,
        );
        const start = roomVirtualWallDraftStartRef.current;
        if (!start) {
          roomVirtualWallDraftStartRef.current = localPoint;
          roomVirtualWallDraftEndRef.current = localPoint;
          setRoomVirtualWallStartSet(true);
          updateRoomVirtualWallDraft(localPoint, localPoint);
          showToast(t('rooms.virtualWallEnd'));
        } else {
          const length = Math.hypot(localPoint.x - start.x, localPoint.z - start.z);
          if (length < 0.03) {
            showToast(t('rooms.virtualWallTooShort'));
            pointerDownPos = null;
            return;
          }
          const wall: RoomVirtualWall = { start: { ...start }, end: localPoint };
          const wallIndex = roomFormRef.current?.addVirtualWall(wall)
            ?? roomPreviewInfoRef.current.virtualWalls.length;
          const nextInfo: RoomPreviewInfo = {
            ...roomPreviewInfoRef.current,
            virtualWalls: [...roomPreviewInfoRef.current.virtualWalls, wall],
          };
          roomPreviewInfoRef.current = nextInfo;
          roomSelectedPointRef.current = null;
          setRoomSelectedPoint(null);
          roomSelectedVirtualWallRef.current = wallIndex;
          setRoomSelectedVirtualWall(wallIndex);
          roomSelectedVirtualWallEndpointRef.current = { wallIndex, endpoint: 'end' };
          setRoomSelectedVirtualWallEndpoint({ wallIndex, endpoint: 'end' });
          roomGizmoActiveRef.current = true;
          setRoomGizmoActive(true);
          handleCancelRoomVirtualWallDrawingRef.current();
          updateRoomPreview(positionRef.current, nextInfo);
          showToast(t('rooms.virtualWallAdded'));
        }
        pointerDownPos = null;
        return;
      }

      if (placingModeRef.current) {
        // Re-pick editor overlays so placement still reaches the imported model surface.
        const placePick = ctx.scene.pick(
          evt.offsetX,
          evt.offsetY,
          (mesh) => roomPanelOpenRef.current
            ? modelMeshesRef.current.includes(mesh)
            : !mesh.metadata?.previewTarget,
        );
        if (!placePick.hit || !placePick.pickedPoint) return;
        posUndoStackRef.current.push({ ...positionRef.current });
        const p = worldToConfigPosition(placePick.pickedPoint, modelScaleRef.current);

        if (roomPanelOpenRef.current) {
          const currentInfo = roomPreviewInfoRef.current;
          const ownWorldVirtualWalls = roomVirtualWallsToWorld(
            currentInfo.virtualWalls,
            positionRef.current,
            currentInfo.rotation.y,
            modelScaleRef.current,
          );
          const initialTrace = traceRoomPolygon(
            ctx.scene,
            placePick.pickedPoint,
            modelMeshesRef.current,
            {
              modelDiagonal: modelDiagonalRef.current,
              modelScale: modelScaleRef.current,
              fallbackWidth: currentInfo.size.width,
              fallbackDepth: currentInfo.size.depth,
              virtualWalls: ownWorldVirtualWalls,
            },
          );
          const initialFloorPosition = worldToConfigPosition(
            new Vector3(placePick.pickedPoint.x, initialTrace.floorY, placePick.pickedPoint.z),
            modelScaleRef.current,
          );
          const editedRoomId = roomEditIdxRef.current === null
            ? null
            : roomsRef.current[roomEditIdxRef.current]?.id ?? null;
          const neighboringRooms = roomsRef.current
            .filter((room) => room.id !== editedRoomId
              && Math.abs(room.anchor.y - initialFloorPosition.y) <= ROOM_FLOOR_TOLERANCE);
          const neighboringBoundaryWalls = neighboringRooms
            .flatMap((room) => roomBoundaryWallsToWorld(room, modelScaleRef.current));
          const trace = neighboringBoundaryWalls.length
            ? traceRoomPolygon(
              ctx.scene,
              placePick.pickedPoint,
              modelMeshesRef.current,
              {
                modelDiagonal: modelDiagonalRef.current,
                modelScale: modelScaleRef.current,
                fallbackWidth: currentInfo.size.width,
                fallbackDepth: currentInfo.size.depth,
                virtualWalls: [...ownWorldVirtualWalls, ...neighboringBoundaryWalls],
              },
            )
            : initialTrace;
          const snappedFloorPosition = worldToConfigPosition(
            new Vector3(placePick.pickedPoint.x, trace.floorY, placePick.pickedPoint.z),
            modelScaleRef.current,
          );
          const newPos: LightPosition = {
            x: snappedFloorPosition.x,
            y: snappedFloorPosition.y,
            z: snappedFloorPosition.z,
          };
          const availableZone = keepAvailableDetectedRoomPart(trace.points, newPos, neighboringRooms);
          if (!availableZone) {
            showToast(t('rooms.traceOccupied'));
            pointerDownPos = null;
            return;
          }
          const detectedSize = roomZonePointBounds(availableZone.points);
          const rebasedVirtualWalls = ownWorldVirtualWalls.map((wall) => ({
            start: {
              x: roundValue(wall.start.x / modelScaleRef.current - newPos.x),
              z: roundValue(wall.start.z / modelScaleRef.current - newPos.z),
            },
            end: {
              x: roundValue(wall.end.x / modelScaleRef.current - newPos.x),
              z: roundValue(wall.end.z / modelScaleRef.current - newPos.z),
            },
          }));
          const nextInfo: RoomPreviewInfo = {
            name: currentInfo.name,
            size: { ...currentInfo.size, width: detectedSize.width, depth: detectedSize.depth },
            rotation: { x: 0, y: 0, z: 0 },
            color: currentInfo.color,
            opacity: currentInfo.opacity,
            points: availableZone.points,
            virtualWalls: rebasedVirtualWalls,
          };
          const remainingConflicts = findOverlappingRooms(
            roomPreviewToConfig('__detected-room__', newPos, nextInfo),
            neighboringRooms,
          );
          if (remainingConflicts.length) {
            showToast(t('rooms.traceOverlapRejected', {
              rooms: remainingConflicts.map((room) => room.name).join(', '),
            }));
            pointerDownPos = null;
            return;
          }
          setPosition(newPos);
          positionRef.current = newPos;
          roomPreviewInfoRef.current = nextInfo;
          roomFormRef.current?.applyDetectedPolygon(availableZone.points);
          roomFormRef.current?.setVirtualWalls(rebasedVirtualWalls);
          setRoomZoneReady(true);
          roomZoneReadyRef.current = true;
          setRoomPointCount(availableZone.points.length);
          roomSelectedPointRef.current = null;
          setRoomSelectedPoint(null);
          roomGizmoActiveRef.current = false;
          setRoomGizmoActive(false);
          updateRoomPreview(newPos, nextInfo);
          showToast(t(
            availableZone.removedOverlap
              ? 'rooms.traceClipped'
              : trace.usedFallback ? 'rooms.traceFallback' : 'rooms.traceSuccess',
            { count: availableZone.points.length },
          ));
        // Display placing mode: capture normal
        } else if (displayPanelOpenRef.current) {
          const faceNormal = placePick.getNormal(true, true);
          const n = faceNormal
            ? { x: parseFloat(faceNormal.x.toFixed(4)), y: parseFloat(faceNormal.y.toFixed(4)), z: parseFloat(faceNormal.z.toFixed(4)) }
            : { x: 0, y: 0, z: 1 };
          setDisplayNormal(n);
          const newPos: LightPosition = {
            x: p.x,
            y: p.y,
            z: p.z,
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else if (blindPanelOpenRef.current) {
          const newPos: LightPosition = {
            x: p.x,
            y: p.y,
            z: p.z,
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else if (wallPanelOpenRef.current || smartDevicePanelOpenRef.current) {
          // Light blockers and device presets use the exact picked position.
          const newPos: LightPosition = {
            x: p.x,
            y: p.y,
            z: p.z,
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else {
          // Light placing mode: offset Y slightly
          const newPos: LightPosition = {
            x: p.x,
            y: parseFloat((p.y + 0.2).toFixed(3)),
            z: p.z,
          };
          setPosition(newPos);
          positionRef.current = newPos;
        }

        setPlacingMode(false);
        document.dispatchEvent(new Event('tour:entity-placed'));
        // Re-enable camera
        ctx.camera.inputs.addPointers();
        applyCameraControlSensitivity(ctx.camera);
        ctx.camera.attachControl(canvas, true);
        if (canvas) canvas.style.cursor = 'default';
        pointerDownPos = null;
        return;
      }
    };

    ctx.scene.onPointerUp = (evt) => {
      // Only treat as a click if the pointer barely moved
      if (!pointerDownPos) return;
      const dx = evt.clientX - pointerDownPos.x;
      const dy = evt.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) return;

      // When editing a light, allow clicking preview meshes to switch gizmo target
      if (panelOpenRef.current) {
        const gizmo = gizmoRef.current;
        if (gizmo) {
          // Multi-pick to find all preview meshes under cursor, prioritize parts/main over hitbox
          const hits = ctx.scene.multiPick(evt.offsetX, evt.offsetY, (m) => !!m.metadata?.previewTarget);
          if (hits && hits.length > 0) {
            // Prefer part/main over hitbox (lights are often inside the hitbox)
            const sorted = hits
              .filter((h) => h.hit && h.pickedMesh)
              .sort((a, b) => {
                const aPri = a.pickedMesh!.metadata.previewTarget === 'hitbox' ? 1 : 0;
                const bPri = b.pickedMesh!.metadata.previewTarget === 'hitbox' ? 1 : 0;
                return aPri - bPri;
              });
            if (sorted.length > 0) {
              const meta = sorted[0].pickedMesh!.metadata;
              gizmo.attachedMesh = sorted[0].pickedMesh as Mesh;
              if (meta.previewTarget === 'main') {
                gizmoTargetRef.current = 'main';
              } else if (meta.previewTarget === 'part') {
                gizmoTargetRef.current = { type: 'part', index: meta.partIndex };
              } else if (meta.previewTarget === 'hitbox') {
                gizmoTargetRef.current = { type: 'hitbox' };
              }
            }
          }
        }
        return;
      }

      if (roomPanelOpenRef.current) {
        const roomPick = ctx.scene.pick(
          evt.offsetX,
          evt.offsetY,
          (mesh) => Boolean(mesh.metadata?.roomEditorTarget),
        );
        if (roomPick?.hit && roomPick.pickedMesh) {
          const metadata = roomPick.pickedMesh.metadata;
          if (metadata.roomEditorTarget === 'splitPiece') {
            return;
          }
          const pointIndex = metadata.roomEditorTarget === 'point'
            ? Number(metadata.roomPointIndex)
            : null;
          const wallIndex = metadata.roomEditorTarget === 'virtualWall'
            || metadata.roomEditorTarget === 'virtualWallEndpoint'
            ? Number(metadata.roomVirtualWallIndex)
            : null;
          const wallEndpoint: RoomVirtualWallEndpoint | null = metadata.roomEditorTarget === 'virtualWallEndpoint'
            ? {
              wallIndex: Number(metadata.roomVirtualWallIndex),
              endpoint: metadata.roomVirtualWallEndpoint === 'end' ? 'end' : 'start',
            }
            : null;
          if (pointIndex !== null || wallEndpoint) {
            transformModeRef.current = 'move';
            setTransformMode('move');
          }
          roomSelectedPointRef.current = pointIndex;
          setRoomSelectedPoint(pointIndex);
          roomSelectedVirtualWallRef.current = wallIndex;
          setRoomSelectedVirtualWall(wallIndex);
          roomSelectedVirtualWallEndpointRef.current = wallEndpoint;
          setRoomSelectedVirtualWallEndpoint(wallEndpoint);
          const activateGizmo = metadata.roomEditorTarget !== 'virtualWall';
          roomGizmoActiveRef.current = activateGizmo;
          setRoomGizmoActive(activateGizmo);
          updateRoomPreview(positionRef.current, roomPreviewInfoRef.current);
        }
        return;
      }
      // Skip click-to-edit while another placed object is being edited.
      if (displayPanelOpenRef.current || blindPanelOpenRef.current || wallPanelOpenRef.current || smartDevicePanelOpenRef.current || tubePanelOpenRef.current) return;

      if (editorModeRef.current === 'rooms') {
        const roomPick = ctx.scene.pick(
          evt.offsetX,
          evt.offsetY,
          (mesh) => Boolean(mesh.metadata?.roomId) && !mesh.metadata?.roomLabel,
        );
        const clickedId = roomPick?.hit
          ? roomPick.pickedMesh?.metadata?.roomId as string | undefined
          : undefined;
        if (clickedId) {
          const idx = roomsRef.current.findIndex((room) => room.id === clickedId);
          if (idx !== -1) handleEditRoomRef.current(idx);
        }
        return;
      }

      // Pick under pointer
      const pick = ctx.scene.pick(evt.offsetX, evt.offsetY);
      if (!pick?.hit) return;

      if (editorModeRef.current === 'modelObjects') {
        const modelObjectId = pick.pickedMesh?.metadata?.modelObjectId as string | undefined;
        if (modelObjectId) handleSelectModelObjectRef.current(modelObjectId);
        return;
      }

      // Click on a light bulb mesh to edit it
      if (pick.pickedMesh?.metadata?.entityId) {
        const clickedId = pick.pickedMesh.metadata.entityId;
        const idx = lightsRef.current.findIndex((l) => l.entityId === clickedId);
        if (idx !== -1) {
          handleEditLightRef.current(idx);
        }
      }

      // Click on a display mesh to edit it
      if (pick.pickedMesh?.metadata?.displayId) {
        const clickedId = pick.pickedMesh.metadata.displayId;
        const idx = displaysRef.current.findIndex((d) => d.id === clickedId);
        if (idx !== -1) {
          handleEditDisplayRef.current(idx);
        }
      }

      // Click on a blind mesh to edit it
      if (pick.pickedMesh?.metadata?.blindId) {
        const clickedId = pick.pickedMesh.metadata.blindId;
        const idx = blindsRef.current.findIndex((b) => b.id === clickedId);
        if (idx !== -1) {
          handleEditBlindRef.current(idx);
        }
      }

      if (pick.pickedMesh?.metadata?.smartDeviceId) {
        const clickedId = pick.pickedMesh.metadata.smartDeviceId;
        const idx = smartDevicesRef.current.findIndex((device) => device.id === clickedId);
        if (idx !== -1) handleEditSmartDeviceRef.current(idx);
      }

      // Click on a tube mesh to edit it
      if (pick.pickedMesh?.metadata?.tubeId) {
        const clickedId = pick.pickedMesh.metadata.tubeId;
        const idx = tubesRef.current.findIndex((t) => t.id === clickedId);
        if (idx !== -1) {
          handleEditTubeRef.current(idx);
        }
      }

    };

    init();

    return () => {
      disposed = true;
      canvas.removeEventListener('pointermove', handleRoomSplitPointerMove, true);
      canvas.removeEventListener('pointerdown', handleRoomSplitPointerDown, true);
      Object.keys(meshMapRef.current).forEach((id) =>
        removeLightMesh(meshMapRef.current, id),
      );
      Object.keys(blindMeshMapRef.current).forEach((id) =>
        removeBlindMesh(blindMeshMapRef.current, id),
      );
      Object.keys(displayMeshMapRef.current).forEach((id) =>
        removeDisplayMesh(displayMeshMapRef.current, id),
      );
      Object.keys(smartDeviceMeshMapRef.current).forEach((id) =>
        removeSmartDeviceMesh(smartDeviceMeshMapRef.current, id),
      );
      disposeAllTubes(tubeMeshMapRef.current);
      disposeAllRoomZones(roomZoneMeshMapRef.current);
      clearPreview();
      detachModelObjectGizmo();
      disposeImportedObjects();
      edgeOutlineRef.current?.dispose();
      edgeOutlineRef.current = null;
      modelMeshesRef.current = [];
      disposeWallEditorMeshes();
      if (utilLayerRef.current) {
        utilLayerRef.current.dispose();
        utilLayerRef.current = null;
      }
      ctx.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update preview mesh when position changes and panel is open
  useEffect(() => {
    if (!panelOpen) return;
    // If the position change came from a gizmo drag, just sync mesh position (no rebuild)
    if (draggingGizmoRef.current && previewMeshRef.current) {
      previewMeshRef.current.position.set(position.x, position.y, position.z);
      return;
    }
    const info = previewInfoRef.current;
    updatePreviewMesh(position, info.shape, info.size, info.rotation, info.scale, info.hitbox, info.parts);
  }, [position, panelOpen, updatePreviewMesh]);

  // Update display preview mesh position when position changes (skip during gizmo drag)
  useEffect(() => {
    if (!displayPanelOpen || !displayPreviewIdRef.current) return;
    if (draggingGizmoRef.current) return;
    const entry = displayMeshMapRef.current[displayPreviewIdRef.current];
    if (!entry) return;
    const normal = new Vector3(displayNormal.x, displayNormal.y, displayNormal.z).normalize();
    entry.plane.position.set(
      position.x + normal.x * 0.005,
      position.y + normal.y * 0.005,
      position.z + normal.z * 0.005,
    );
  }, [position, displayPanelOpen, displayNormal]);

  // Update blind preview mesh position when position changes
  useEffect(() => {
    if (!blindPanelOpen || !blindPreviewIdRef.current) return;
    if (draggingGizmoRef.current) return;
    const entry = blindMeshMapRef.current[blindPreviewIdRef.current];
    if (!entry) return;
    entry.config = { ...entry.config, position };
    entry.frame.position.set(position.x, position.y, position.z);
    updateBlindPosition(entry, 50);
  }, [position, blindPanelOpen]);

  useEffect(() => {
    if (!smartDevicePanelOpen || draggingGizmoRef.current) return;
    smartDevicePreviewChangeRef.current(smartDevicePreviewInfoRef.current);
  }, [position, smartDevicePanelOpen]);

  // Wrap setPosition for slider changes: push undo entry on first change after idle
  const sliderIdleRef = useRef(true);
  const sliderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePositionChange = useCallback((newPos: LightPosition) => {
    if (sliderIdleRef.current) {
      // First change after idle — snapshot current position
      posUndoStackRef.current.push({ ...positionRef.current });
      sliderIdleRef.current = false;
    }
    // Reset idle timer — mark idle after 400ms of no changes
    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(() => { sliderIdleRef.current = true; }, 400);
    setPosition(newPos);
  }, []);

  // Show/hide wall editor meshes when switching to/from walls tab
  useEffect(() => {
    if (editorMode === 'walls') {
      rebuildWallEditorMeshes(shadowWalls);
    } else {
      disposeWallEditorMeshes();
    }
  }, [editorMode, shadowWalls, rebuildWallEditorMeshes, disposeWallEditorMeshes]);

  useEffect(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene || editorMode !== 'rooms') {
      disposeAllRoomZones(roomZoneMeshMapRef.current);
      return;
    }
    // Keep neighboring room boundaries visible while the active room is represented
    // by its editable preview. This makes unassigned floor areas easy to spot.
    const visibleRooms = roomPanelOpen
      ? rooms.filter((_, index) => index !== roomEditIdx)
      : rooms;
    rebuildAllRoomZones(
      scene,
      roomZoneMeshMapRef.current,
      visibleRooms,
      entityScaleRootRef.current ?? undefined,
      roomEditIdx !== null ? rooms[roomEditIdx]?.id : null,
      overlappingRoomIds,
    );
  }, [editorMode, overlappingRoomIds, roomEditIdx, roomPanelOpen, rooms]);

  // Keyboard shortcuts: Ctrl+Z undo, Escape close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;

      // Ctrl+Z undo (must check before the modifier guard)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (!panelOpenRef.current && !displayPanelOpenRef.current && !blindPanelOpenRef.current && !wallPanelOpenRef.current && !smartDevicePanelOpenRef.current && !tubePanelOpenRef.current && !roomPanelOpenRef.current) return;
        const stack = posUndoStackRef.current;
        if (stack.length === 0) return;
        e.preventDefault();
        const prev = stack.pop()!;
        setPosition(prev);
        positionRef.current = prev;
        return;
      }

      // Skip single-key shortcuts when a modifier key is held (allow native Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'c') {
        navigate('/');
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        recenterView();
        return;
      }
      if (e.key === 'Escape') {
        if (roomSplitDrawingRef.current || roomSplitPiecesRef.current.length) {
          e.preventDefault();
          handleCancelRoomSplitRef.current();
          return;
        }
        if (roomVirtualWallDrawingRef.current) {
          e.preventDefault();
          handleCancelRoomVirtualWallDrawingRef.current();
          return;
        }
        if (panelOpenRef.current) {
          e.preventDefault();
          handleClosePanelRef.current();
          return;
        }
        if (displayPanelOpenRef.current) {
          e.preventDefault();
          handleCloseDisplayPanelRef.current();
          return;
        }
        if (blindPanelOpenRef.current) {
          e.preventDefault();
          handleCloseBlindPanelRef.current();
          return;
        }
        if (wallPanelOpenRef.current) {
          e.preventDefault();
          handleCloseWallPanelRef.current();
          return;
        }
        if (smartDevicePanelOpenRef.current) {
          e.preventDefault();
          handleCloseSmartDevicePanelRef.current();
          return;
        }
        if (tubePanelOpenRef.current) {
          e.preventDefault();
          handleCloseTubePanelRef.current();
          return;
        }
        if (roomPanelOpenRef.current) {
          e.preventDefault();
          handleCloseRoomPanelRef.current();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, recenterView]);

  // Handle shape/size changes from LightForm
  const handlePreviewChange = useCallback(
    (info: PreviewInfo) => {
      previewInfoRef.current = info;
      // Skip rebuild when the change came from a gizmo drag on a part/hitbox
      if (skipPreviewRebuildRef.current) {
        skipPreviewRebuildRef.current = false;
        return;
      }
      if (panelOpen) {
        updatePreviewMesh(position, info.shape, info.size, info.rotation, info.scale, info.hitbox, info.parts);
      }
    },
    [panelOpen, position, updatePreviewMesh],
  );

  // Open panel for new light
  const handleAddLight = useCallback(() => {
    setEditIdx(null);
    setPosition({ x: 0, y: 2.5, z: 0 });
    posUndoStackRef.current = [];
    setPanelOpen(true);
  }, []);

  // Edit existing light
  const handleEditLight = useCallback(
    (idx: number) => {
      // Hide any previously visible hitbox
      for (const entry of Object.values(meshMapRef.current)) {
        if (entry.hitboxMesh) entry.hitboxMesh.visibility = 0;
      }
      const cfg = lights[idx];
      // Show hitbox for the light being edited
      const entry = meshMapRef.current[cfg.entityId];
      if (entry?.hitboxMesh) {
        entry.hitboxMesh.visibility = 1;
      }
      setEditIdx(idx);
      setPosition(cfg.position);
      posUndoStackRef.current = [];
      setPanelOpen(true);
    },
    [lights],
  );

  // Ref so Babylon callbacks can call handleEditLight
  const handleEditLightRef = useRef(handleEditLight);
  handleEditLightRef.current = handleEditLight;

  // Delete light (and auto-save to server)
  const handleDeleteLight = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const id = lights[idx].entityId;
      removeLightMesh(meshMapRef.current, id);
      const updated = lights.filter((_, i) => i !== idx);
      setLights(updated);
      rebuildAllMeshes(scene, meshMapRef.current, updated, {
        parent: entityScaleRootRef.current ?? undefined,
        sceneScale: modelScaleRef.current,
      });

      try {
        await updateConfig({ lights: updated });
        showToast(t('editor.lightDeletedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.lightDeletedLocal'));
      }
    },
    [lights, showToast],
  );

  // Duplicate light
  const handleDuplicateLight = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = lights[idx];
      const copy: LightConfig = {
        ...src,
        entityId: src.entityId + '_copy',
        label: (src.label || src.entityId) + t('editor.copySuffix'),
        position: {
          x: src.position.x + 0.3,
          y: src.position.y,
          z: src.position.z,
        },
      };
      const updated = [...lights, copy];
      setLights(updated);
      rebuildAllMeshes(scene, meshMapRef.current, updated, {
        parent: entityScaleRootRef.current ?? undefined,
        sceneScale: modelScaleRef.current,
      });

      try {
        await updateConfig({ lights: updated });
        showToast(t('editor.lightDuplicatedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.lightDuplicatedLocal'));
      }
    },
    [lights, showToast],
  );

  // Reorder light in list
  const handleReorderLight = useCallback(
    async (fromIdx: number, toIdx: number) => {
      const updated = arrayMove(lights, fromIdx, toIdx);
      setLights(updated);
      // Adjust editIdx to follow the selected light
      if (editIdx !== null) {
        if (editIdx === fromIdx) {
          setEditIdx(toIdx);
        } else if (fromIdx < editIdx && toIdx >= editIdx) {
          setEditIdx(editIdx - 1);
        } else if (fromIdx > editIdx && toIdx <= editIdx) {
          setEditIdx(editIdx + 1);
        }
      }
      try {
        await updateConfig({ lights: updated });
      } catch (e) {
        console.error('[Config] Reorder save failed:', e);
      }
    },
    [lights, editIdx],
  );

  // Move light to a group
  const handleMoveToGroup = useCallback(
    async (lightIdx: number, groupId: string | undefined) => {
      const updated = lights.map((l, i) =>
        i === lightIdx ? { ...l, group: groupId } : l,
      );
      setLights(updated);
      try {
        await updateConfig({ lights: updated });
      } catch (e) {
        console.error('[Config] Move-to-group save failed:', e);
      }
    },
    [lights],
  );

  // Group CRUD
  const handleAddGroup = useCallback(
    async (name: string) => {
      const newGroup: LightGroup = { id: generateUUID(), name };
      const updated = [...lightGroups, newGroup];
      setLightGroups(updated);
      try {
        await updateConfig({ lightGroups: updated });
      } catch (e) {
        console.error('[Config] Add group save failed:', e);
      }
    },
    [lightGroups],
  );

  const handleRenameGroup = useCallback(
    async (groupId: string, name: string) => {
      const updated = lightGroups.map((g) =>
        g.id === groupId ? { ...g, name } : g,
      );
      setLightGroups(updated);
      try {
        await updateConfig({ lightGroups: updated });
      } catch (e) {
        console.error('[Config] Rename group save failed:', e);
      }
    },
    [lightGroups],
  );

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const updatedGroups = lightGroups.filter((g) => g.id !== groupId);
      const updatedLights = lights.map((l) =>
        l.group === groupId ? { ...l, group: undefined } : l,
      );
      setLightGroups(updatedGroups);
      setLights(updatedLights);
      try {
        await updateConfig({ lights: updatedLights, lightGroups: updatedGroups });
      } catch (e) {
        console.error('[Config] Delete group save failed:', e);
      }
    },
    [lights, lightGroups],
  );

  // Close panel
  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setEditIdx(null);
  }, [clearPreview, exitPlacingMode]);
  const handleClosePanelRef = useRef(handleClosePanel);
  handleClosePanelRef.current = handleClosePanel;

  // Save light (and auto-save config to server)
  const handleSaveLight = useCallback(
    async (cfg: LightConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      let updated: LightConfig[];
      if (editIdx !== null) {
        const oldId = lights[editIdx].entityId;
        if (oldId !== cfg.entityId) removeLightMesh(meshMapRef.current, oldId);
        updated = lights.map((l, i) => (i === editIdx ? cfg : l));
      } else {
        updated = [...lights, cfg];
      }

      setLights(updated);
      clearPreview();
      rebuildAllMeshes(scene, meshMapRef.current, updated, {
        parent: entityScaleRootRef.current ?? undefined,
        sceneScale: modelScaleRef.current,
      });
      setPanelOpen(false);
      exitPlacingMode();
      setEditIdx(null);
      document.dispatchEvent(new Event('tour:entity-saved'));

      // Auto-save to server
      try {
        await updateConfig({ lights: updated });
        showToast(t('editor.lightSavedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.lightSavedLocal'));
      }
    },
    [lights, editIdx, clearPreview, exitPlacingMode, showToast],
  );

  // --- Display handlers ---

  const handleAddDisplay = useCallback(() => {
    setDisplayEditIdx(null);
    setPosition({ x: 0, y: 1.5, z: 0 });
    setDisplayNormal({ x: 0, y: 0, z: 1 });
    posUndoStackRef.current = [];
    setDisplayPanelOpen(true);
  }, []);

  const handleEditDisplay = useCallback(
    (idx: number) => {
      const cfg = displays[idx];
      setDisplayEditIdx(idx);
      setPosition(cfg.position);
      setDisplayNormal(cfg.normal);
      posUndoStackRef.current = [];
      setDisplayPanelOpen(true);
      // Show purple outline around the display being edited
      const entry = displayMeshMapRef.current[cfg.id];
      if (entry) showDisplayOutline(entry.plane);
    },
    [displays, showDisplayOutline],
  );

  const handleEditDisplayRef = useRef(handleEditDisplay);
  handleEditDisplayRef.current = handleEditDisplay;

  const handleDeleteDisplay = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const id = displays[idx].id;
      removeDisplayMesh(displayMeshMapRef.current, id);
      const updated = displays.filter((_, i) => i !== idx);
      setDisplays(updated);

      try {
        await updateConfig({ displays: updated });
        showToast(t('editor.displayDeletedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.displayDeletedLocal'));
      }
    },
    [displays, showToast],
  );

  const handleDuplicateDisplay = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = displays[idx];
      const copy: DisplayConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || src.id) + t('editor.copySuffix'),
        position: { ...src.position, x: src.position.x + 0.3 },
        sources: src.sources.map((s) => ({ ...s })),
      };
      const updated = [...displays, copy];
      setDisplays(updated);
      rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, updated, entityScaleRootRef.current ?? undefined);
      for (const entry of Object.values(displayMeshMapRef.current)) {
        entry.plane.isPickable = true;
        updateDisplayTexture(entry, {});
      }

      try {
        await updateConfig({ displays: updated });
        showToast(t('editor.displayDuplicatedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.displayDuplicatedLocal'));
      }
    },
    [displays, showToast],
  );

  const handleCloseDisplayPanel = useCallback(() => {
    // Remove preview display mesh
    if (displayPreviewIdRef.current) {
      removeDisplayMesh(displayMeshMapRef.current, displayPreviewIdRef.current);
      displayPreviewIdRef.current = null;
    }
    // Restore original display mesh if we were editing (not adding new)
    const scene = sceneCtxRef.current?.scene;
    if (scene && displayEditIdx !== null) {
      const cfg = displaysRef.current[displayEditIdx];
      if (cfg) {
        const entry = createDisplayMesh(scene, cfg, entityScaleRootRef.current ?? undefined);
        entry.plane.isPickable = true;
        displayMeshMapRef.current[cfg.id] = entry;
        updateDisplayTexture(entry, buildMockupStates(displaysRef.current));
      }
    }
    clearDisplayOutline();
    setDisplayPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setDisplayEditIdx(null);
  }, [clearPreview, clearDisplayOutline, exitPlacingMode, displayEditIdx]);
  const handleCloseDisplayPanelRef = useRef(handleCloseDisplayPanel);
  handleCloseDisplayPanelRef.current = handleCloseDisplayPanel;

  // Live preview: rebuild display mesh on every form change
  const handleDisplayPreviewChange = useCallback(
    (info: DisplayPreviewInfo) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      displayPreviewInfoRef.current = info;

      // Determine which display ID we're previewing
      const editIdx = displayEditIdx;
      const editingCfg = displaysRef.current[editIdx ?? -1];
      const previewId = editingCfg?.id || '__preview__';

      // Remove old preview mesh (or the original display being edited on first call)
      const oldPreviewId = displayPreviewIdRef.current;
      if (oldPreviewId) {
        removeDisplayMesh(displayMeshMapRef.current, oldPreviewId);
      } else if (previewId !== '__preview__') {
        // First preview change while editing — dispose the original display mesh
        removeDisplayMesh(displayMeshMapRef.current, previewId);
      }
      displayPreviewIdRef.current = previewId;

      // Build a temporary DisplayConfig from form state
      const tempCfg: DisplayConfig = {
        id: previewId,
        label: '',
        kind: info.kind !== 'info' ? info.kind : undefined,
        sources: info.sources,
        position: positionRef.current,
        normal: displayNormalRef.current,
        width: info.width,
        height: info.height,
        textAlign: info.textAlign,
        opacity: info.opacity,
        backgroundColor: info.backgroundColor,
        mirrorH: info.mirrorH,
        mirrorV: info.mirrorV,
      };

      const entry = createDisplayMesh(scene, tempCfg, entityScaleRootRef.current ?? undefined);
      entry.plane.isPickable = false;
      displayMeshMapRef.current[previewId] = entry;
      updateDisplayTexture(entry, buildMockupStates([tempCfg]));

      // Show purple outline around the preview display
      showDisplayOutline(entry.plane);

      // Attach active transform gizmo to display plane
      if (gizmoRef.current) {
        gizmoRef.current.dispose();
        gizmoRef.current = null;
      }
      if (!utilLayerRef.current) {
        utilLayerRef.current = new UtilityLayerRenderer(scene);
      }
      const activeMode = transformModeRef.current;
      const gizmo = createGizmoForMode(activeMode, utilLayerRef.current);
      gizmo.anchorPoint = GizmoAnchorPoint.Pivot;
      gizmo.attachedMesh = entry.plane;

      const onDragStart = () => {
        draggingGizmoRef.current = true;
        if (activeMode === 'move') {
          posUndoStackRef.current.push({ ...positionRef.current });
        }
      };
      const onDrag = () => {
        if (activeMode !== 'move') return;
        const p = entry.plane.position;
        const n = displayNormalRef.current;
        const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
        const newPos: LightPosition = {
          x: parseFloat((p.x - (n.x / len) * 0.005).toFixed(3)),
          y: parseFloat((p.y - (n.y / len) * 0.005).toFixed(3)),
          z: parseFloat((p.z - (n.z / len) * 0.005).toFixed(3)),
        };
        scheduleGizmoPosition(newPos);
      };
      const onDragEnd = () => {
        draggingGizmoRef.current = false;
        if (activeMode === 'rotate') {
          const nextNormal = displayNormalFromPlane(entry.plane);
          displayNormalRef.current = nextNormal;
          setDisplayNormal(nextNormal);
          const currentInfo = displayPreviewInfoRef.current;
          if (currentInfo) {
            window.requestAnimationFrame(() => handleDisplayPreviewChange(currentInfo));
          }
        } else if (activeMode === 'scale') {
          const baseSize = meshLocalSize(entry.plane);
          displayFormRef.current?.updateSize(
            baseSize.width * Math.max(0.001, Math.abs(entry.plane.scaling.x)),
            baseSize.height * Math.max(0.001, Math.abs(entry.plane.scaling.y)),
          );
        } else {
          flushGizmoPosition();
        }
        document.dispatchEvent(new Event('tour:gizmo-used'));
      };
      gizmo.onDragStartObservable.add(onDragStart);
      gizmo.onDragObservable.add(onDrag);
      gizmo.onDragEndObservable.add(onDragEnd);
      setUtilityMeshAlpha(utilLayerRef.current, 0.5);
      gizmoRef.current = gizmo;
    },
    [displayEditIdx, flushGizmoPosition, scheduleGizmoPosition, showDisplayOutline],
  );

  useEffect(() => {
    if (!displayPanelOpen) return;
    const info = displayPreviewInfoRef.current;
    if (!info) return;
    handleDisplayPreviewChange(info);
  }, [displayNormal, displayPanelOpen, handleDisplayPreviewChange]);

  const handleSaveDisplay = useCallback(
    async (cfg: DisplayConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Clean up preview mesh
      if (displayPreviewIdRef.current) {
        removeDisplayMesh(displayMeshMapRef.current, displayPreviewIdRef.current);
        displayPreviewIdRef.current = null;
      }

      let updated: DisplayConfig[];
      if (displayEditIdx !== null) {
        const oldId = displays[displayEditIdx].id;
        if (oldId !== cfg.id) removeDisplayMesh(displayMeshMapRef.current, oldId);
        updated = displays.map((d, i) => (i === displayEditIdx ? cfg : d));
      } else {
        updated = [...displays, cfg];
      }

      setDisplays(updated);
      clearPreview();
      rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, updated, entityScaleRootRef.current ?? undefined);
      for (const entry of Object.values(displayMeshMapRef.current)) {
        entry.plane.isPickable = true;
        updateDisplayTexture(entry, buildMockupStates(updated));
      }
      setDisplayPanelOpen(false);
      exitPlacingMode();
      setDisplayEditIdx(null);

      try {
        await updateConfig({ displays: updated });
        showToast(t('editor.displaySavedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.displaySavedLocal'));
      }
    },
    [displays, displayEditIdx, clearPreview, exitPlacingMode, showToast],
  );

  // --- Blind handlers ---

  const removeBlindPreview = useCallback(() => {
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    const previewId = blindPreviewIdRef.current;
    if (previewId) {
      removeBlindMesh(blindMeshMapRef.current, previewId);
      blindPreviewIdRef.current = null;
    }
  }, []);

  const handleAddBlind = useCallback(() => {
    setBlindEditIdx(null);
    setPosition({ x: 0, y: 1.5, z: 0 });
    posUndoStackRef.current = [];
    setBlindPanelOpen(true);
  }, []);

  const handleEditBlind = useCallback(
    (idx: number) => {
      const cfg = blinds[idx];
      setBlindEditIdx(idx);
      setPosition(cfg.position);
      posUndoStackRef.current = [];
      setBlindPanelOpen(true);
    },
    [blinds],
  );

  const handleEditBlindRef = useRef(handleEditBlind);
  handleEditBlindRef.current = handleEditBlind;

  const handleDeleteBlind = useCallback(
    async (idx: number) => {
      const id = blinds[idx].id;
      removeBlindMesh(blindMeshMapRef.current, id);
      const updated = blinds.filter((_, i) => i !== idx);
      setBlinds(updated);
      try {
        await updateConfig({ blinds: updated });
        showToast(t('editor.blindDeletedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.blindDeletedLocal'));
      }
    },
    [blinds, showToast],
  );

  const handleDuplicateBlind = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = blinds[idx];
      const copy: BlindConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || src.entityId) + t('editor.copySuffix'),
        position: { ...src.position, x: src.position.x + 0.3 },
      };
      const updated = [...blinds, copy];
      setBlinds(updated);
      rebuildAllBlindMeshes(scene, blindMeshMapRef.current, updated, entityScaleRootRef.current ?? undefined);
      try {
        await updateConfig({ blinds: updated });
        showToast(t('editor.blindDuplicatedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.blindDuplicatedLocal'));
      }
    },
    [blinds, showToast],
  );

  const handleBlindPreviewChange = useCallback(
    (info: BlindPreviewInfo) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene || !blindPanelOpenRef.current) return;
      blindPreviewInfoRef.current = info;

      const editingCfg = blindsRef.current[blindEditIdx ?? -1];
      const previewId = editingCfg?.id || '__blind_preview__';
      if (blindPreviewIdRef.current) {
        removeBlindMesh(blindMeshMapRef.current, blindPreviewIdRef.current);
      } else if (editingCfg) {
        removeBlindMesh(blindMeshMapRef.current, previewId);
      }
      blindPreviewIdRef.current = previewId;

      const tempCfg: BlindConfig = {
        id: previewId,
        entityId: editingCfg?.entityId || '__preview_blind__',
        label: editingCfg?.label || 'Blind preview',
        position: positionRef.current,
        size: info.size,
        rotationY: info.rotationY,
        slats: info.slats,
      };
      const entry = createBlindMesh(scene, tempCfg, 50, entityScaleRootRef.current ?? undefined);
      blindMeshMapRef.current[previewId] = entry;

      if (gizmoRef.current) {
        gizmoRef.current.dispose();
        gizmoRef.current = null;
      }
      if (!utilLayerRef.current) {
        utilLayerRef.current = new UtilityLayerRenderer(scene);
      }
      const activeMode = transformModeRef.current;
      const gizmo = createGizmoForMode(activeMode, utilLayerRef.current);
      gizmo.anchorPoint = GizmoAnchorPoint.Pivot;
      gizmo.attachedMesh = entry.frame;

      const onDragStart = () => {
        draggingGizmoRef.current = true;
        if (activeMode === 'move') {
          posUndoStackRef.current.push({ ...positionRef.current });
        }
      };
      const onDrag = () => {
        if (activeMode !== 'move') return;
        const p = entry.frame.position;
        const newPos: LightPosition = {
          x: parseFloat(p.x.toFixed(3)),
          y: parseFloat(p.y.toFixed(3)),
          z: parseFloat(p.z.toFixed(3)),
        };
        entry.config = { ...entry.config, position: newPos };
        updateBlindPosition(entry, 50);
        scheduleGizmoPosition(newPos);
      };
      const onDragEnd = () => {
        draggingGizmoRef.current = false;
        if (activeMode === 'rotate') {
          blindFormRef.current?.updateRotationY(Tools.ToDegrees(entry.frame.rotation.y));
        } else if (activeMode === 'scale') {
          const currentSize = blindPreviewInfoRef.current.size;
          blindFormRef.current?.updateSize({
            width: currentSize.width * Math.max(0.001, Math.abs(entry.frame.scaling.x)),
            height: currentSize.height * Math.max(0.001, Math.abs(entry.frame.scaling.y)),
            depth: currentSize.depth * Math.max(0.001, Math.abs(entry.frame.scaling.z)),
          });
        } else {
          flushGizmoPosition();
        }
        document.dispatchEvent(new Event('tour:gizmo-used'));
      };
      gizmo.onDragStartObservable.add(onDragStart);
      gizmo.onDragObservable.add(onDrag);
      gizmo.onDragEndObservable.add(onDragEnd);
      setUtilityMeshAlpha(utilLayerRef.current, 0.5);
      gizmoRef.current = gizmo;
    },
    [blindEditIdx, flushGizmoPosition, scheduleGizmoPosition],
  );

  const handleCloseBlindPanel = useCallback(() => {
    removeBlindPreview();
    const scene = sceneCtxRef.current?.scene;
    if (scene && blindEditIdx !== null) {
      const cfg = blindsRef.current[blindEditIdx];
      if (cfg) {
        blindMeshMapRef.current[cfg.id] = createBlindMesh(scene, cfg, 0, entityScaleRootRef.current ?? undefined);
      }
    }
    setBlindPanelOpen(false);
    exitPlacingMode();
    setBlindEditIdx(null);
  }, [blindEditIdx, exitPlacingMode, removeBlindPreview]);
  const handleCloseBlindPanelRef = useRef(handleCloseBlindPanel);
  handleCloseBlindPanelRef.current = handleCloseBlindPanel;

  const handleSaveBlind = useCallback(
    async (cfg: BlindConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      removeBlindPreview();

      let updated: BlindConfig[];
      if (blindEditIdx !== null) {
        const oldId = blinds[blindEditIdx].id;
        if (oldId !== cfg.id) removeBlindMesh(blindMeshMapRef.current, oldId);
        updated = blinds.map((b, i) => (i === blindEditIdx ? cfg : b));
      } else {
        updated = [...blinds, cfg];
      }

      setBlinds(updated);
      rebuildAllBlindMeshes(scene, blindMeshMapRef.current, updated, entityScaleRootRef.current ?? undefined);
      setBlindPanelOpen(false);
      exitPlacingMode();
      setBlindEditIdx(null);

      try {
        await updateConfig({ blinds: updated });
        showToast(t('editor.blindSavedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.blindSavedLocal'));
      }
    },
    [blinds, blindEditIdx, exitPlacingMode, removeBlindPreview, showToast],
  );

  // --- Smart-device handlers ---

  const removeSmartDevicePreview = useCallback(() => {
    if (gizmoRef.current) { gizmoRef.current.dispose(); gizmoRef.current = null; }
    if (smartDevicePreviewIdRef.current) {
      removeSmartDeviceMesh(smartDeviceMeshMapRef.current, smartDevicePreviewIdRef.current);
      smartDevicePreviewIdRef.current = null;
    }
  }, []);

  const handleAddSmartDevice = useCallback(() => {
    setSmartDeviceEditIdx(null);
    setPosition({ x: 0, y: 0.25, z: 0 });
    posUndoStackRef.current = [];
    setSmartDevicePanelOpen(true);
  }, []);

  const handleEditSmartDevice = useCallback((idx: number) => {
    const config = smartDevices[idx];
    setSmartDeviceEditIdx(idx);
    setPosition(config.position);
    posUndoStackRef.current = [];
    setSmartDevicePanelOpen(true);
  }, [smartDevices]);
  const handleEditSmartDeviceRef = useRef(handleEditSmartDevice);
  handleEditSmartDeviceRef.current = handleEditSmartDevice;

  const handleDeleteSmartDevice = useCallback(async (idx: number) => {
    removeSmartDeviceMesh(smartDeviceMeshMapRef.current, smartDevices[idx].id);
    const updated = smartDevices.filter((_, index) => index !== idx);
    setSmartDevices(updated);
    updateConfig({ smartDevices: updated });
    showToast(t('editor.smartDeviceDeleted'));
  }, [showToast, smartDevices, t]);

  const handleDuplicateSmartDevice = useCallback(async (idx: number) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    const source = smartDevices[idx];
    const copy: SmartDeviceConfig = {
      ...source,
      id: generateUUID(),
      label: `${source.label || source.entityId}${t('editor.copySuffix')}`,
      position: { ...source.position, x: source.position.x + 0.35 },
      rotation: source.rotation ? { ...source.rotation } : undefined,
      scale: source.scale ? { ...source.scale } : undefined,
    };
    const updated = [...smartDevices, copy];
    setSmartDevices(updated);
    rebuildAllSmartDeviceMeshes(scene, smartDeviceMeshMapRef.current, updated, entityScaleRootRef.current ?? undefined);
    updateConfig({ smartDevices: updated });
    showToast(t('editor.smartDeviceDuplicated'));
  }, [showToast, smartDevices, t]);

  const handleSmartDevicePreviewChange = useCallback((info: SmartDevicePreviewInfo) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene || !smartDevicePanelOpenRef.current) return;
    smartDevicePreviewInfoRef.current = info;
    const editing = smartDevicesRef.current[smartDeviceEditIdx ?? -1];
    const previewId = editing?.id ?? '__smart_device_preview__';
    if (smartDevicePreviewIdRef.current) removeSmartDeviceMesh(smartDeviceMeshMapRef.current, smartDevicePreviewIdRef.current);
    else if (editing) removeSmartDeviceMesh(smartDeviceMeshMapRef.current, editing.id);
    smartDevicePreviewIdRef.current = previewId;

    const temporary: SmartDeviceConfig = {
      id: previewId,
      entityId: editing?.entityId ?? '__preview_device__',
      label: editing?.label ?? 'Device preview',
      action: editing?.action ?? 'toggle',
      position: positionRef.current,
      ...info,
    };
    const entry = createSmartDeviceMesh(scene, temporary, entityScaleRootRef.current ?? undefined);
    smartDeviceMeshMapRef.current[previewId] = entry;

    if (gizmoRef.current) gizmoRef.current.dispose();
    if (!utilLayerRef.current) utilLayerRef.current = new UtilityLayerRenderer(scene);
    const activeMode = transformModeRef.current;
    const gizmo = createGizmoForMode(activeMode, utilLayerRef.current);
    gizmo.anchorPoint = GizmoAnchorPoint.Pivot;
    gizmo.attachedMesh = entry.root;
    gizmo.onDragStartObservable.add(() => {
      draggingGizmoRef.current = true;
      if (activeMode === 'move') posUndoStackRef.current.push({ ...positionRef.current });
    });
    gizmo.onDragObservable.add(() => {
      if (activeMode !== 'move') return;
      scheduleGizmoPosition({
        x: parseFloat(entry.root.position.x.toFixed(3)),
        y: parseFloat(entry.root.position.y.toFixed(3)),
        z: parseFloat(entry.root.position.z.toFixed(3)),
      });
    });
    gizmo.onDragEndObservable.add(() => {
      draggingGizmoRef.current = false;
      if (activeMode === 'rotate') smartDeviceFormRef.current?.updateRotation(rotationFromMesh(entry.root));
      else if (activeMode === 'scale') smartDeviceFormRef.current?.updateScale({
        x: parseFloat(Math.max(0.05, Math.abs(entry.root.scaling.x)).toFixed(3)),
        y: parseFloat(Math.max(0.05, Math.abs(entry.root.scaling.y)).toFixed(3)),
        z: parseFloat(Math.max(0.05, Math.abs(entry.root.scaling.z)).toFixed(3)),
      });
      else flushGizmoPosition();
    });
    setUtilityMeshAlpha(utilLayerRef.current, 0.5);
    gizmoRef.current = gizmo;
  }, [flushGizmoPosition, scheduleGizmoPosition, smartDeviceEditIdx]);
  smartDevicePreviewChangeRef.current = handleSmartDevicePreviewChange;

  const handleCloseSmartDevicePanel = useCallback(() => {
    removeSmartDevicePreview();
    const scene = sceneCtxRef.current?.scene;
    if (scene) rebuildAllSmartDeviceMeshes(scene, smartDeviceMeshMapRef.current, smartDevicesRef.current, entityScaleRootRef.current ?? undefined);
    setSmartDevicePanelOpen(false);
    setSmartDeviceEditIdx(null);
    exitPlacingMode();
  }, [exitPlacingMode, removeSmartDevicePreview]);
  handleCloseSmartDevicePanelRef.current = handleCloseSmartDevicePanel;

  const handleSaveSmartDevice = useCallback(async (config: SmartDeviceConfig) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    removeSmartDevicePreview();
    const updated = smartDeviceEditIdx === null
      ? [...smartDevices, config]
      : smartDevices.map((device, index) => index === smartDeviceEditIdx ? config : device);
    setSmartDevices(updated);
    rebuildAllSmartDeviceMeshes(scene, smartDeviceMeshMapRef.current, updated, entityScaleRootRef.current ?? undefined);
    setSmartDevicePanelOpen(false);
    setSmartDeviceEditIdx(null);
    exitPlacingMode();
    updateConfig({ smartDevices: updated });
    showToast(t('editor.smartDeviceSaved'));
  }, [exitPlacingMode, removeSmartDevicePreview, showToast, smartDeviceEditIdx, smartDevices, t]);

  // --- Shadow wall handlers ---

  const handleAddWall = useCallback(() => {
    setWallEditIdx(null);
    setPosition({ x: 0, y: 2.6, z: 0 });
    posUndoStackRef.current = [];
    setWallPanelOpen(true);
  }, []);

  const handleEditWall = useCallback(
    (idx: number) => {
      const cfg = shadowWalls[idx];
      setWallEditIdx(idx);
      setPosition(cfg.position);
      posUndoStackRef.current = [];
      setWallPanelOpen(true);
    },
    [shadowWalls],
  );

  const handleDeleteWall = useCallback(
    async (idx: number) => {
      const updated = shadowWalls.filter((_, i) => i !== idx);
      setShadowWalls(updated);
      try {
        await updateConfig({ shadowWalls: updated });
        showToast(t('editor.wallDeletedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.wallDeletedLocal'));
      }
    },
    [shadowWalls, showToast],
  );

  const handleDuplicateWall = useCallback(
    async (idx: number) => {
      const src = shadowWalls[idx];
      const copy: ShadowWallConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || 'Wall') + t('editor.copySuffix'),
        position: { ...src.position, x: src.position.x + 0.5 },
        size: { ...src.size },
      };
      const updated = [...shadowWalls, copy];
      setShadowWalls(updated);
      try {
        await updateConfig({ shadowWalls: updated });
        showToast(t('editor.wallDuplicatedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.wallDuplicatedLocal'));
      }
    },
    [shadowWalls, showToast],
  );

  const handleCloseWallPanel = useCallback(() => {
    setWallPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setWallEditIdx(null);
  }, [clearPreview, exitPlacingMode]);
  const handleCloseWallPanelRef = useRef(handleCloseWallPanel);
  handleCloseWallPanelRef.current = handleCloseWallPanel;

  const handleWallPreviewChange = useCallback(
    (info: WallPreviewInfo) => {
      wallPreviewInfoRef.current = info;
      if (wallPanelOpen) {
        // Rebuild the wall preview mesh (reuse updatePreviewMesh with cube shape)
        updatePreviewMesh(
          position,
          'cube',
          { width: info.size.width, height: info.size.height, depth: info.size.depth },
          info.rotation,
        );
      }
    },
    [wallPanelOpen, position, updatePreviewMesh],
  );

  const handleSaveWall = useCallback(
    async (cfg: ShadowWallConfig) => {
      let updated: ShadowWallConfig[];
      if (wallEditIdx !== null) {
        updated = shadowWalls.map((w, i) => (i === wallEditIdx ? cfg : w));
      } else {
        updated = [...shadowWalls, cfg];
      }
      setShadowWalls(updated);
      clearPreview();
      exitPlacingMode();
      setWallPanelOpen(false);
      setWallEditIdx(null);

      try {
        await updateConfig({ shadowWalls: updated });
        showToast(t('editor.wallSavedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.wallSavedLocal'));
      }
    },
    [shadowWalls, wallEditIdx, clearPreview, exitPlacingMode, showToast],
  );

  // Update wall preview mesh when position changes and wall panel is open
  useEffect(() => {
    if (!wallPanelOpen) return;
    if (draggingGizmoRef.current && previewMeshRef.current) {
      previewMeshRef.current.position.set(position.x, position.y, position.z);
      return;
    }
    const info = wallPreviewInfoRef.current;
    updatePreviewMesh(
      position,
      'cube',
      { width: info.size.width, height: info.size.height, depth: info.size.depth },
      info.rotation,
    );
  }, [position, wallPanelOpen, updatePreviewMesh]);

  // --- Room handlers ---

  const handleAddRoom = useCallback((area?: HAAreaRegistryEntry) => {
    handleCancelRoomVirtualWallDrawingRef.current();
    handleCancelRoomSplitRef.current();
    const anchor = { x: 0, y: 0, z: 0 };
    const initialPoints = rectangleRoomZonePoints(editorDefaultSizes.wall.width, editorDefaultSizes.wall.depth);
    const roomId = generateUUID();
    const roomColor = defaultRoomZoneColor(roomId);
    const draft: RoomConfig = {
      id: roomId,
      name: area?.name ?? t('rooms.newName'),
      haAreaIds: area ? [area.area_id] : [],
      anchor,
      zone: {
        width: editorDefaultSizes.wall.width,
        height: 0.025,
        depth: editorDefaultSizes.wall.depth,
        rotationY: 0,
        color: roomColor,
        opacity: DEFAULT_ROOM_ZONE_OPACITY,
      },
      primaryEntityIds: [],
    };
    roomPreviewInfoRef.current = {
      name: draft.name,
      size: { width: editorDefaultSizes.wall.width, height: 0.025, depth: editorDefaultSizes.wall.depth },
      rotation: { x: 0, y: 0, z: 0 },
      color: roomColor,
      opacity: DEFAULT_ROOM_ZONE_OPACITY,
      points: initialPoints,
      virtualWalls: [],
    };
    setRoomEditIdx(null);
    roomEditIdxRef.current = null;
    setRoomDraft(draft);
    setRoomZoneReady(false);
    roomZoneReadyRef.current = false;
    setRoomSelectedPoint(null);
    roomSelectedPointRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomPointCount(0);
    setRoomGizmoActive(false);
    roomGizmoActiveRef.current = false;
    setRoomOverlapNames([]);
    roomOverlapNamesRef.current = [];
    setPosition(anchor);
    positionRef.current = anchor;
    posUndoStackRef.current = [];
    setRoomPanelOpen(true);
  }, [editorDefaultSizes.wall.depth, editorDefaultSizes.wall.width, t]);

  const handleEditRoom = useCallback((idx: number) => {
    const room = rooms[idx];
    if (!room) return;
    handleCancelRoomVirtualWallDrawingRef.current();
    handleCancelRoomSplitRef.current();
    roomPreviewInfoRef.current = {
      name: room.name,
      size: {
        width: room.zone.width,
        height: room.zone.height ?? 0.025,
        depth: room.zone.depth,
      },
      rotation: { x: 0, y: room.zone.rotationY ?? 0, z: 0 },
      color: resolveRoomZoneColor(room),
      opacity: clampRoomZoneOpacity(room.zone.opacity),
      points: room.zone.points?.map((point) => ({ ...point }))
        ?? rectangleRoomZonePoints(room.zone.width, room.zone.depth),
      virtualWalls: room.zone.virtualWalls?.map((wall) => ({
        start: { ...wall.start },
        end: { ...wall.end },
      })) ?? [],
    };
    setRoomEditIdx(idx);
    roomEditIdxRef.current = idx;
    setRoomDraft({
      ...room,
      haAreaIds: [...room.haAreaIds],
      anchor: { ...room.anchor },
      zone: {
        ...room.zone,
        points: room.zone.points?.map((point) => ({ ...point })),
        virtualWalls: room.zone.virtualWalls?.map((wall) => ({
          start: { ...wall.start },
          end: { ...wall.end },
        })),
      },
      primaryEntityIds: [...room.primaryEntityIds],
    });
    setRoomZoneReady(true);
    roomZoneReadyRef.current = true;
    setRoomSelectedPoint(null);
    roomSelectedPointRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomPointCount(room.zone.points?.length ?? 4);
    setRoomGizmoActive(false);
    roomGizmoActiveRef.current = false;
    setRoomOverlapNames([]);
    roomOverlapNamesRef.current = [];
    setPosition(room.anchor);
    positionRef.current = room.anchor;
    posUndoStackRef.current = [];
    setRoomPanelOpen(true);
  }, [rooms]);
  const handleEditRoomRef = useRef(handleEditRoom);
  handleEditRoomRef.current = handleEditRoom;

  const handleDeleteRoom = useCallback(async (idx: number) => {
    const room = rooms[idx];
    if (!room) return;
    const updated = rooms.filter((_, index) => index !== idx);
    setRooms(updated);
    roomsRef.current = updated;
    await updateConfig({ rooms: updated });
    showToast(t('rooms.deleted'));
  }, [rooms, showToast, t]);

  const handleCloseRoomPanel = useCallback(() => {
    handleCancelRoomVirtualWallDrawingRef.current();
    handleCancelRoomSplitRef.current();
    setRoomPanelOpen(false);
    setRoomEditIdx(null);
    roomEditIdxRef.current = null;
    setRoomDraft(null);
    setRoomZoneReady(false);
    roomZoneReadyRef.current = false;
    setRoomSelectedPoint(null);
    roomSelectedPointRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomGizmoActive(false);
    roomGizmoActiveRef.current = false;
    setRoomOverlapNames([]);
    roomOverlapNamesRef.current = [];
    clearPreview();
    exitPlacingMode();
  }, [clearPreview, exitPlacingMode]);
  handleCloseRoomPanelRef.current = handleCloseRoomPanel;

  const handleRoomPreviewChange = useCallback((info: RoomPreviewInfo) => {
    roomPreviewInfoRef.current = info;
    setRoomPointCount(info.points.length);
    if (!roomPanelOpen || !roomZoneReadyRef.current || draggingGizmoRef.current) return;
    updateRoomPreview(positionRef.current, info);
  }, [roomPanelOpen, updateRoomPreview]);

  const handleSelectRoomCentre = useCallback(() => {
    transformModeRef.current = 'move';
    setTransformMode('move');
    roomSelectedPointRef.current = null;
    setRoomSelectedPoint(null);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomGizmoActiveRef.current = true;
    setRoomGizmoActive(true);
    updateRoomPreview(positionRef.current, roomPreviewInfoRef.current);
  }, [updateRoomPreview]);

  const handleAddRoomPoint = useCallback(() => {
    const pointIndex = roomFormRef.current?.addPoint();
    if (pointIndex === undefined) return;
    transformModeRef.current = 'move';
    setTransformMode('move');
    roomSelectedPointRef.current = pointIndex;
    setRoomSelectedPoint(pointIndex);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomGizmoActiveRef.current = true;
    setRoomGizmoActive(true);
  }, []);

  const handleRemoveRoomPoint = useCallback(() => {
    const pointIndex = roomSelectedPointRef.current;
    if (pointIndex === null || roomPreviewInfoRef.current.points.length <= 3) return;
    roomFormRef.current?.removePoint(pointIndex);
    const nextIndex = pointIndex > 0 ? pointIndex - 1 : 0;
    roomSelectedPointRef.current = nextIndex;
    setRoomSelectedPoint(nextIndex);
  }, []);

  const handleResetRoomPoints = useCallback(() => {
    handleCancelRoomSplitRef.current();
    roomFormRef.current?.resetPoints();
    roomSelectedPointRef.current = null;
    setRoomSelectedPoint(null);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomGizmoActiveRef.current = false;
    setRoomGizmoActive(false);
  }, []);

  const handleToggleRoomVirtualWallDrawing = useCallback(() => {
    if (roomVirtualWallDrawingRef.current) {
      cancelRoomVirtualWallDrawing();
      return;
    }
    handleCancelRoomSplitRef.current();
    exitPlacingMode();
    roomVirtualWallDrawingRef.current = true;
    roomVirtualWallDraftStartRef.current = null;
    roomVirtualWallDraftEndRef.current = null;
    setRoomVirtualWallDrawing(true);
    setRoomVirtualWallStartSet(false);
    roomSelectedPointRef.current = null;
    setRoomSelectedPoint(null);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomGizmoActiveRef.current = false;
    setRoomGizmoActive(false);
    updateRoomPreview(positionRef.current, roomPreviewInfoRef.current);
    const ctx = sceneCtxRef.current;
    if (ctx) {
      ctx.camera.inputs.removeByType('ArcRotateCameraPointersInput');
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
    showToast(t('rooms.virtualWallStart'));
  }, [cancelRoomVirtualWallDrawing, exitPlacingMode, showToast, t, updateRoomPreview]);

  const handleToggleRoomSplit = useCallback(() => {
    if (roomSplitDrawingRef.current || roomSplitPiecesRef.current.length) {
      cancelRoomSplit();
      return;
    }
    handleCancelRoomVirtualWallDrawingRef.current();
    exitPlacingMode();
    if (canvasRef.current) canvasRef.current.dataset.roomSplitDrawing = 'true';
    roomSplitDrawingRef.current = true;
    roomSplitDraftStartRef.current = null;
    roomSplitDraftEndRef.current = null;
    roomSplitPiecesRef.current = [];
    setRoomSplitDrawing(true);
    setRoomSplitStartSet(false);
    setRoomSplitPieces([]);
    roomSelectedPointRef.current = null;
    setRoomSelectedPoint(null);
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomGizmoActiveRef.current = false;
    setRoomGizmoActive(false);
    updateRoomPreview(positionRef.current, roomPreviewInfoRef.current);
    const ctx = sceneCtxRef.current;
    if (ctx) {
      ctx.camera.inputs.removeByType('ArcRotateCameraPointersInput');
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
    showToast(t('rooms.splitStart'));
  }, [cancelRoomSplit, exitPlacingMode, showToast, t, updateRoomPreview]);

  const handleRemoveRoomVirtualWall = useCallback(() => {
    const wallIndex = roomSelectedVirtualWallRef.current;
    if (wallIndex === null || !roomPreviewInfoRef.current.virtualWalls[wallIndex]) return;
    roomFormRef.current?.removeVirtualWall(wallIndex);
    const nextInfo: RoomPreviewInfo = {
      ...roomPreviewInfoRef.current,
      virtualWalls: roomPreviewInfoRef.current.virtualWalls.filter((_, index) => index !== wallIndex),
    };
    roomPreviewInfoRef.current = nextInfo;
    roomSelectedVirtualWallRef.current = null;
    setRoomSelectedVirtualWall(null);
    roomSelectedVirtualWallEndpointRef.current = null;
    setRoomSelectedVirtualWallEndpoint(null);
    roomGizmoActiveRef.current = false;
    setRoomGizmoActive(false);
    updateRoomPreview(positionRef.current, nextInfo);
    showToast(t('rooms.virtualWallRemoved'));
  }, [showToast, t, updateRoomPreview]);

  const handleRoomSplitAssignmentChange = useCallback((pieceIndex: number, target: string) => {
    setRoomSplitError(null);
    setRoomSplitAssignments((current) => current.map((value, index) => (
      index === pieceIndex ? target : value
    )));
  }, []);

  const handleApplyRoomSplitAssignments = useCallback(async () => {
    const pieces = roomSplitPiecesRef.current;
    const assignments = roomSplitAssignments;
    setRoomSplitError(null);
    if (!pieces.length
      || assignments.length !== pieces.length
      || assignments.some((target) => !target)
      || new Set(assignments).size !== assignments.length) {
      const message = t('rooms.splitAssignmentRequired');
      setRoomSplitError(message);
      showToast(message);
      return;
    }

    const sourceIndex = roomEditIdxRef.current;
    const sourceExistingRoom = sourceIndex === null ? null : roomsRef.current[sourceIndex] ?? null;
    const sourceDraft = sourceIndex === null ? roomDraftRef.current : null;
    const selectedExistingIds = new Set(
      assignments
        .filter((target) => target.startsWith('room:'))
        .map((target) => target.slice('room:'.length)),
    );
    const replacements = new Map<string, RoomConfig>();
    const additions: RoomConfig[] = [];

    const withSplitGeometry = (base: RoomConfig, piece: RoomZonePoint[]): RoomConfig => {
      const bounds = roomZonePointBounds(piece);
      return {
        ...base,
        anchor: { ...positionRef.current },
        zone: {
          width: bounds.width,
          height: roomPreviewInfoRef.current.size.height,
          depth: bounds.depth,
          rotationY: roomPreviewInfoRef.current.rotation.y,
          color: base.zone.color,
          opacity: base.zone.opacity,
          points: piece.map((point) => ({ ...point })),
        },
      };
    };

    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
      const target = assignments[pieceIndex];
      const piece = pieces[pieceIndex];
      if (target.startsWith('room:')) {
        const roomId = target.slice('room:'.length);
        const existing = roomsRef.current.find((room) => room.id === roomId);
        if (!existing) {
          const message = t('rooms.splitTargetUnavailable');
          setRoomSplitError(message);
          showToast(message);
          return;
        }
        replacements.set(existing.id, withSplitGeometry(existing, piece));
        continue;
      }
      if (target.startsWith('draft:')) {
        if (!sourceDraft || target !== `draft:${sourceDraft.id}`) {
          const message = t('rooms.splitTargetUnavailable');
          setRoomSplitError(message);
          showToast(message);
          return;
        }
        additions.push(withSplitGeometry({
          ...sourceDraft,
          name: roomPreviewInfoRef.current.name || sourceDraft.name,
        }, piece));
        continue;
      }
      if (target.startsWith('area:')) {
        const areaId = target.slice('area:'.length);
        const area = haAreas.find((candidate) => candidate.area_id === areaId);
        if (!area) {
          const message = t('rooms.splitTargetUnavailable');
          setRoomSplitError(message);
          showToast(message);
          return;
        }
        const primaryEntityIds = rankRoomEntities(
          haRoomEntities.filter((entity) => entity.area_id === areaId),
          placedEntityIds,
        ).slice(0, 8).map((entity) => entity.entity_id);
        additions.push(withSplitGeometry({
          id: generateUUID(),
          name: area.name,
          haAreaIds: [area.area_id],
          anchor: { ...positionRef.current },
          zone: {
            width: 1,
            height: roomPreviewInfoRef.current.size.height,
            depth: 1,
          },
          primaryEntityIds,
        }, piece));
        continue;
      }
      const message = t('rooms.splitTargetUnavailable');
      setRoomSplitError(message);
      showToast(message);
      return;
    }

    const sourceExistingId = sourceExistingRoom?.id ?? null;
    const updated = roomsRef.current
      .filter((room) => room.id !== sourceExistingId || selectedExistingIds.has(room.id))
      .map((room) => replacements.get(room.id) ?? room);
    for (const room of additions) {
      const existingIndex = updated.findIndex((candidate) => candidate.id === room.id);
      if (existingIndex === -1) updated.push(room);
      else updated[existingIndex] = room;
    }

    const changedRoomIds = new Set([
      ...replacements.keys(),
      ...additions.map((room) => room.id),
    ]);
    const legacySourceOverlapIds = new Set(
      sourceExistingRoom
        ? findOverlappingRooms(sourceExistingRoom, roomsRef.current).map((room) => room.id)
        : [],
    );
    const conflictIds = new Set<string>();
    for (let firstIndex = 0; firstIndex < updated.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < updated.length; secondIndex++) {
        const first = updated[firstIndex];
        const second = updated[secondIndex];
        if (!roomZonesOverlap(first, second)) continue;
        const firstChanged = changedRoomIds.has(first.id);
        const secondChanged = changedRoomIds.has(second.id);
        if (!firstChanged && !secondChanged) continue;
        if (firstChanged !== secondChanged && sourceExistingRoom) {
          const unchangedRoom = firstChanged ? second : first;
          if (legacySourceOverlapIds.has(unchangedRoom.id)) continue;
        }
        conflictIds.add(first.id);
        conflictIds.add(second.id);
      }
    }
    if (conflictIds.size) {
      const conflictNames = updated
        .filter((room) => conflictIds.has(room.id))
        .map((room) => room.name);
      const message = t('rooms.overlapBlocked', { rooms: conflictNames.join(', ') });
      setRoomSplitError(message);
      showToast(message);
      return;
    }

    setRooms(updated);
    roomsRef.current = updated;
    await updateConfig({ rooms: updated });
    handleCloseRoomPanel();
    showToast(t('rooms.splitAssignmentsSaved'));
  }, [haAreas, haRoomEntities, handleCloseRoomPanel, placedEntityIds, roomSplitAssignments, showToast, t]);

  const handleSaveRoom = useCallback(async (room: RoomConfig) => {
    const conflicts = findOverlappingRooms(room, rooms);
    if (conflicts.length) {
      const names = conflicts.map((conflict) => conflict.name);
      roomOverlapNamesRef.current = names;
      setRoomOverlapNames(names);
      showToast(t('rooms.overlapBlocked', { rooms: names.join(', ') }));
      return;
    }
    const updated = roomEditIdx === null
      ? [...rooms, room]
      : rooms.map((current, index) => index === roomEditIdx ? room : current);
    setRooms(updated);
    roomsRef.current = updated;
    await updateConfig({ rooms: updated });
    handleCloseRoomPanel();
    showToast(t('rooms.saved'));
  }, [handleCloseRoomPanel, roomEditIdx, rooms, showToast, t]);

  useEffect(() => {
    if (!roomPanelOpen || !roomZoneReady) return;
    if (draggingGizmoRef.current) return;
    const info = roomPreviewInfoRef.current;
    updateRoomPreview(position, info);
  }, [position, roomGizmoActive, roomPanelOpen, roomSelectedPoint, roomSelectedVirtualWall, roomSelectedVirtualWallEndpoint, roomSplitPieces, roomZoneReady, transformMode, updateRoomPreview]);

  // ── Tube handlers ──────────────────────────────────────────────

  const handleAddTube = useCallback(() => {
    setTubeEditIdx(null);
    setPosition({ x: 0, y: 0, z: 0 });
    posUndoStackRef.current = [];
    setTubePanelOpen(true);
  }, []);

  const handleEditTube = useCallback(
    (idx: number) => {
      const cfg = tubes[idx];
      setTubeEditIdx(idx);
      setPosition({ x: cfg.endX, y: 0, z: cfg.endZ });
      posUndoStackRef.current = [];
      setTubePanelOpen(true);
    },
    [tubes],
  );

  const handleEditTubeRef = useRef(handleEditTube);
  handleEditTubeRef.current = handleEditTube;

  const handleDeleteTube = useCallback(
    async (idx: number) => {
      const deleted = tubes[idx];
      if (deleted) removeTubeMeshes(tubeMeshMapRef.current, deleted.id);
      const updated = tubes.filter((_, i) => i !== idx);
      setTubes(updated);
      try {
        await updateConfig({ tubes: updated });
        showToast(t('editor.tubeDeletedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.tubeDeletedLocal'));
      }
    },
    [tubes, showToast],
  );

  const handleDuplicateTube = useCallback(
    async (idx: number) => {
      const src = tubes[idx];
      const copy: TubeConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || 'Tube') + t('editor.copySuffix'),
        endX: src.endX + 0.5,
        lines: src.lines.map(l => ({ ...l })),
      };
      const updated = [...tubes, copy];
      setTubes(updated);
      // Create mesh for the copy
      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        tubeMeshMapRef.current[copy.id] = createTubeMeshes(scene, copy, null, entityScaleRootRef.current ?? undefined);
      }
      try {
        await updateConfig({ tubes: updated });
        showToast(t('editor.tubeDuplicatedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.tubeDuplicatedLocal'));
      }
    },
    [tubes, showToast],
  );

  const handleCloseTubePanel = useCallback(() => {
    setTubePanelOpen(false);
    clearPreview();
    setTubeEditIdx(null);
    // Show tube meshes that were hidden during editing
    rebuildTubeEditorMeshes(tubesRef.current);
  }, [clearPreview]);
  const handleCloseTubePanelRef = useRef(handleCloseTubePanel);
  handleCloseTubePanelRef.current = handleCloseTubePanel;

  const rebuildTubeEditorMeshes = useCallback((tubeConfigs: TubeConfig[]) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    disposeAllTubes(tubeMeshMapRef.current);
    for (const tc of tubeConfigs) {
      tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null, entityScaleRootRef.current ?? undefined);
    }
    renderMockupLabels(tubeMeshMapRef.current);
  }, []);

  const handleTubePreviewChange = useCallback(
    (info: TubePreviewInfo) => {
      tubePreviewInfoRef.current = info;
      if (!tubePanelOpen) return;
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Remove old preview tube
      removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');

      // Create a temporary preview tube mesh
      const previewCfg: TubeConfig = { ...info.config, id: '__tube_preview__' };
      tubeMeshMapRef.current['__tube_preview__'] = createTubeMeshes(scene, previewCfg, null, entityScaleRootRef.current ?? undefined);
      renderMockupLabels(tubeMeshMapRef.current);
    },
    [tubePanelOpen],
  );

  const handleSaveTube = useCallback(
    async (cfg: TubeConfig) => {
      let updated: TubeConfig[];
      if (tubeEditIdx !== null) {
        // Remove old mesh
        const oldId = tubes[tubeEditIdx]?.id;
        if (oldId) removeTubeMeshes(tubeMeshMapRef.current, oldId);
        updated = tubes.map((t, i) => (i === tubeEditIdx ? cfg : t));
      } else {
        updated = [...tubes, cfg];
      }
      setTubes(updated);
      clearPreview();
      setTubePanelOpen(false);
      setTubeEditIdx(null);

      // Remove preview tube and rebuild all
      removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');
      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        disposeAllTubes(tubeMeshMapRef.current);
        for (const tc of updated) {
          tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null, entityScaleRootRef.current ?? undefined);
        }
      }

      try {
        await updateConfig({ tubes: updated });
        showToast(t('editor.tubeSavedSynced'));
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast(t('editor.tubeSavedLocal'));
      }
    },
    [tubes, tubeEditIdx, clearPreview, showToast],
  );

  // Hide the tube being edited (show only the preview), keep others visible
  useEffect(() => {
    if (tubePanelOpen && tubeEditIdx !== null) {
      const editedId = tubes[tubeEditIdx]?.id;
      if (editedId) {
        const entry = tubeMeshMapRef.current[editedId];
        if (entry) {
          for (const m of entry.tubes) m.setEnabled(false);
          for (const l of entry.labels) l.plane.setEnabled(false);
          for (const pe of entry.particles) {
            for (const s of pe.spheres) s.setEnabled(false);
          }
        }
      }
    }
  }, [tubePanelOpen, tubeEditIdx, tubes]);

  // Attach a position gizmo to the tube endpoint when editing
  useEffect(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!tubePanelOpen || !scene) return;

    // Create a small anchor sphere at the endpoint
    const anchor = MeshBuilder.CreateSphere('tube-endpoint-anchor', { diameter: 0.15 }, scene);
    anchor.position = new Vector3(positionRef.current.x, 0, positionRef.current.z);
    if (entityScaleRootRef.current) anchor.parent = entityScaleRootRef.current;
    anchor.isPickable = false;
    const mat = new StandardMaterial('tube-anchor-mat', scene);
    mat.emissiveColor = new Color3(0.2, 0.7, 1.0);
    mat.alpha = 0.7;
    mat.disableLighting = true;
    anchor.material = mat;
    tubeAnchorRef.current = anchor;

    // Attach gizmo
    if (!utilLayerRef.current) {
      utilLayerRef.current = new UtilityLayerRenderer(scene);
    }
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    const gizmo = new PositionGizmo(utilLayerRef.current);
    gizmo.scaleRatio = 1.2;
    gizmo.attachedMesh = anchor;
    // Disable Y axis — tubes only move in X/Z
    gizmo.yGizmo.dispose();

    const onDragStart = () => {
      draggingGizmoRef.current = true;
      posUndoStackRef.current.push({ ...positionRef.current });
    };
    const onDrag = () => {
      const p = anchor.position;
      const newPos: LightPosition = {
        x: parseFloat(p.x.toFixed(3)),
        y: 0,
        z: parseFloat(p.z.toFixed(3)),
      };
      scheduleGizmoPosition(newPos);
    };
    const onDragEnd = () => {
      draggingGizmoRef.current = false;
      flushGizmoPosition();
      document.dispatchEvent(new Event('tour:gizmo-used'));
    };
    for (const ax of [gizmo.xGizmo, gizmo.zGizmo]) {
      ax.dragBehavior.onDragStartObservable.add(onDragStart);
      ax.dragBehavior.onDragObservable.add(onDrag);
      ax.dragBehavior.onDragEndObservable.add(onDragEnd);
    }
    // Semi-transparent arrows
    for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
      if (m.material) {
        (m.material as StandardMaterial).alpha = 0.5;
      }
    }
    gizmoRef.current = gizmo;

    return () => {
      gizmo.dispose();
      if (gizmoRef.current === gizmo) gizmoRef.current = null;
      anchor.material?.dispose();
      anchor.dispose();
      tubeAnchorRef.current = null;
    };
  }, [flushGizmoPosition, scheduleGizmoPosition, tubePanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tube anchor position during gizmo drag (skip tube rebuild)
  useEffect(() => {
    if (!tubePanelOpen) return;
    if (draggingGizmoRef.current && tubeAnchorRef.current) {
      tubeAnchorRef.current.position.set(position.x, 0, position.z);
      return;
    }
    // Position changed from sliders/placing — sync anchor
    if (tubeAnchorRef.current) {
      tubeAnchorRef.current.position.set(position.x, 0, position.z);
    }
  }, [position, tubePanelOpen]);

  // Show/hide tube editor meshes when switching to/from tubes tab
  useEffect(() => {
    if (editorMode === 'tubes' && !tubePanelOpen) {
      rebuildTubeEditorMeshes(tubes);
    } else if (editorMode !== 'tubes') {
      disposeAllTubes(tubeMeshMapRef.current);
    }
  }, [editorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update tube preview when endpoint position changes (skip during gizmo drag)
  useEffect(() => {
    if (!tubePanelOpen) return;
    if (draggingGizmoRef.current) return; // anchor moves via gizmo, rebuild on drag end
    const info = tubePreviewInfoRef.current;
    if (!info) return;

    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    // Rebuild preview tube at new position
    removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');
    const previewCfg: TubeConfig = {
      ...info.config,
      id: '__tube_preview__',
      endX: position.x,
      endZ: position.z,
    };
    tubeMeshMapRef.current['__tube_preview__'] = createTubeMeshes(scene, previewCfg, null, entityScaleRootRef.current ?? undefined);
    renderMockupLabels(tubeMeshMapRef.current);
  }, [position, tubePanelOpen]);

  // Recreate the active gizmo immediately when the global transform tool changes.
  useEffect(() => {
    if (panelOpenRef.current) {
      const info = previewInfoRef.current;
      updatePreviewMesh(positionRef.current, info.shape, info.size, info.rotation, info.scale, info.hitbox, info.parts);
    } else if (displayPanelOpenRef.current && displayPreviewInfoRef.current) {
      handleDisplayPreviewChange(displayPreviewInfoRef.current);
    } else if (blindPanelOpenRef.current) {
      handleBlindPreviewChange(blindPreviewInfoRef.current);
    } else if (wallPanelOpenRef.current) {
      handleWallPreviewChange(wallPreviewInfoRef.current);
    } else if (smartDevicePanelOpenRef.current) {
      handleSmartDevicePreviewChange(smartDevicePreviewInfoRef.current);
    } else if (roomPanelOpenRef.current && roomZoneReadyRef.current) {
      updateRoomPreview(positionRef.current, roomPreviewInfoRef.current);
    }
  }, [transformMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save config to server
  const handleSaveConfig = useCallback(async () => {
    if (overlappingRoomIds.size) {
      const names = rooms.filter((room) => overlappingRoomIds.has(room.id)).map((room) => room.name);
      showToast(t('rooms.overlapBlocked', { rooms: names.join(', ') }));
      setEditorMode('rooms');
      return;
    }
    try {
      await updateConfig({ lights, lightGroups, blinds, displays, shadowWalls, smartDevices, tubes, rooms });
      showToast(t('editor.savedSummary', { lights: lights.length, blinds: blinds.length, displays: displays.length, walls: shadowWalls.length, devices: smartDevices.length, tubes: tubes.length, rooms: rooms.length }));
    } catch (e) {
      alert(t('editor.saveConfigFailed', { message: e instanceof Error ? e.message : String(e) }));
    }
  }, [lights, lightGroups, blinds, displays, overlappingRoomIds, shadowWalls, smartDevices, tubes, rooms, showToast, t]);

  // Load config from server
  const handleLoadConfig = useCallback(async () => {
    try {
      const config = await getConfig();
      setLights(config.lights || []);
      setLightGroups(config.lightGroups || []);
      setBlinds(config.blinds || []);
      blindsRef.current = config.blinds || [];
      setDisplays(config.displays || []);
      setShadowWalls(config.shadowWalls || []);
      setSmartDevices(config.smartDevices || []);
      smartDevicesRef.current = config.smartDevices || [];
      setTubes(config.tubes || []);
      tubesRef.current = config.tubes || [];
      setRooms(config.rooms || []);
      roomsRef.current = config.rooms || [];
      modelObjectOverridesRef.current = config.model?.objectOverrides ?? [];
      importedModelObjectsRef.current = config.model?.importedObjects ?? [];
      const overridesById = new Map(modelObjectOverridesRef.current.map((override) => [override.id, override]));
      for (const [id, mesh] of Object.entries(modelObjectMeshesRef.current)) {
        if (mesh.metadata?.importedObjectId) continue;
        const override = overridesById.get(id);
        if (override) {
          applyModelObjectTransform(mesh, override);
        } else {
          const original = getOriginalModelObjectTransform(mesh);
          if (original) applyModelObjectTransform(mesh, original);
        }
      }

      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        rebuildAllMeshes(scene, meshMapRef.current, config.lights || [], {
          parent: entityScaleRootRef.current ?? undefined,
          sceneScale: modelScaleRef.current,
        });
        rebuildAllBlindMeshes(scene, blindMeshMapRef.current, config.blinds || [], entityScaleRootRef.current ?? undefined);
        rebuildAllSmartDeviceMeshes(scene, smartDeviceMeshMapRef.current, config.smartDevices || [], entityScaleRootRef.current ?? undefined);
        rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, config.displays || [], entityScaleRootRef.current ?? undefined);
        for (const entry of Object.values(displayMeshMapRef.current)) {
          entry.plane.isPickable = true;
          updateDisplayTexture(entry, buildMockupStates(displaysRef.current));
        }
        disposeAllTubes(tubeMeshMapRef.current);
        for (const tc of (config.tubes || [])) {
          tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null, entityScaleRootRef.current ?? undefined);
        }
        renderMockupLabels(tubeMeshMapRef.current);
        await loadImportedObjectsIntoScene(importedModelObjectsRef.current, scene);
      } else {
        syncModelObjectList(importedModelObjectsRef.current);
      }
      showToast(t('editor.loadedSummary', { lights: config.lights?.length || 0, blinds: config.blinds?.length || 0, displays: config.displays?.length || 0, walls: config.shadowWalls?.length || 0, devices: config.smartDevices?.length || 0, tubes: config.tubes?.length || 0, rooms: config.rooms?.length || 0 }));
    } catch (e) {
      alert(t('editor.loadConfigFailed', { message: e instanceof Error ? e.message : String(e) }));
    }
  }, [loadImportedObjectsIntoScene, showToast, syncModelObjectList, t]);

  return (
    <div className="config-editor">
      {/* Sidebar */}
      <div className="editor-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-actions">
            <Link to="/" className="back-btn">
              &larr; {t('editor.dashboard')}
            </Link>
          </div>
          <span className="sidebar-title">&#9881; {t('editor.title')}</span>
        </div>

        {/* Mode tabs */}
        <div className="editor-tabs">
          <button
            className={`editor-tab${editorMode === 'lights' ? ' active' : ''}`}
            onClick={() => setEditorMode('lights')}
            title={t('editor.lights')}
            aria-label={`${t('editor.lights')}: ${lights.length}`}
          >
            <LampCeiling aria-hidden="true" />
            <span className="editor-tab-count">{lights.length}</span>
          </button>
          <button
            className={`editor-tab${editorMode === 'blinds' ? ' active' : ''}`}
            data-tab="blinds"
            onClick={() => setEditorMode('blinds')}
            title={t('editor.blinds')}
            aria-label={`${t('editor.blinds')}: ${blinds.length}`}
          >
            <PanelTopClose aria-hidden="true" />
            <span className="editor-tab-count">{blinds.length}</span>
          </button>
          <button
            className={`editor-tab${editorMode === 'displays' ? ' active' : ''}`}
            data-tab="displays"
            onClick={() => setEditorMode('displays')}
            title={t('editor.displays')}
            aria-label={`${t('editor.displays')}: ${displays.length}`}
          >
            <Monitor aria-hidden="true" />
            <span className="editor-tab-count">{displays.length}</span>
          </button>
          <button
            className={`editor-tab${editorMode === 'walls' ? ' active' : ''}`}
            data-tab="walls"
            onClick={() => setEditorMode('walls')}
            title={t('editor.walls')}
            aria-label={`${t('editor.walls')}: ${shadowWalls.length}`}
          >
            <BrickWall aria-hidden="true" />
            <span className="editor-tab-count">{shadowWalls.length}</span>
          </button>
          <button
            className={`editor-tab${editorMode === 'smartDevices' ? ' active' : ''}`}
            data-tab="smartDevices"
            onClick={() => setEditorMode('smartDevices')}
            title={t('editor.smartDevices')}
            aria-label={`${t('editor.smartDevices')}: ${smartDevices.length}`}
          >
            <Cpu aria-hidden="true" />
            <span className="editor-tab-count">{smartDevices.length}</span>
          </button>
          <button
            className={`editor-tab${editorMode === 'tubes' ? ' active' : ''}`}
            data-tab="tubes"
            onClick={() => setEditorMode('tubes')}
            title={t('editor.tubes')}
            aria-label={`${t('editor.tubes')}: ${tubes.length}`}
          >
            <Activity aria-hidden="true" />
            <span className="editor-tab-count">{tubes.length}</span>
          </button>
          <button
            className={`editor-tab${editorMode === 'rooms' ? ' active' : ''}`}
            data-tab="rooms"
            onClick={() => setEditorMode('rooms')}
            title={t('editor.rooms')}
            aria-label={`${t('editor.rooms')}: ${rooms.length}`}
          >
            <House aria-hidden="true" />
            <span className="editor-tab-count">{rooms.length}</span>
          </button>
          <button
            className={`editor-tab${editorMode === 'modelObjects' ? ' active' : ''}`}
            data-tab="modelObjects"
            onClick={() => setEditorMode('modelObjects')}
            title={t('editor.modelObjects')}
            aria-label={`${t('editor.modelObjects')}: ${modelObjects.length}`}
          >
            <Box aria-hidden="true" />
            <span className="editor-tab-count">{modelObjects.length}</span>
          </button>
        </div>

        <div className="light-list">
          {editorMode === 'lights' ? (
            <><BlenderLightSettings onSave={updated => {
              setLights(updated);
              const scene = sceneCtxRef.current?.scene;
              if (scene) rebuildAllMeshes(scene, meshMapRef.current, updated, {
                parent: entityScaleRootRef.current ?? undefined, sceneScale: modelScaleRef.current,
              });
            }} />
            <LightList
              lights={lights}
              lightGroups={lightGroups}
              selectedIdx={editIdx}
              onSelect={handleEditLight}
              onDelete={handleDeleteLight}
              onDuplicate={handleDuplicateLight}
              onReorder={handleReorderLight}
              onMoveToGroup={handleMoveToGroup}
              onAddGroup={handleAddGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
            />
            </>
          ) : editorMode === 'blinds' ? (
            <BlindList
              blinds={blinds}
              selectedIdx={blindEditIdx}
              onSelect={handleEditBlind}
              onDelete={handleDeleteBlind}
              onDuplicate={handleDuplicateBlind}
            />
          ) : editorMode === 'displays' ? (
            <DisplayList
              displays={displays}
              selectedIdx={displayEditIdx}
              onSelect={handleEditDisplay}
              onDelete={handleDeleteDisplay}
              onDuplicate={handleDuplicateDisplay}
            />
          ) : editorMode === 'walls' ? (
            <ShadowWallList
              walls={shadowWalls}
              selectedIdx={wallEditIdx}
              onSelect={handleEditWall}
              onDelete={handleDeleteWall}
              onDuplicate={handleDuplicateWall}
            />
          ) : editorMode === 'smartDevices' ? (
            <SmartDeviceList
              devices={smartDevices}
              selectedIdx={smartDeviceEditIdx}
              onSelect={handleEditSmartDevice}
              onDelete={handleDeleteSmartDevice}
              onDuplicate={handleDuplicateSmartDevice}
            />
          ) : editorMode === 'tubes' ? (
            <TubeList
              tubes={tubes}
              selectedIdx={tubeEditIdx}
              onSelect={handleEditTube}
              onDelete={handleDeleteTube}
              onDuplicate={handleDuplicateTube}
            />
          ) : editorMode === 'rooms' ? (
            <RoomList
              rooms={rooms}
              areas={haAreas}
              selectedIdx={roomEditIdx}
              syncStatus={haAreaSyncStatus}
              onSelect={handleEditRoom}
              onDelete={handleDeleteRoom}
              onAddArea={handleAddRoom}
              onSync={() => { void handleSyncHAAreas(false); }}
            />
          ) : (
            <ModelObjectList
              objects={modelObjects}
              selectedId={selectedModelObjectId}
              onSelect={handleSelectModelObject}
              onResetSelected={handleResetSelectedModelObject}
              onUploadObject={handleUploadModelObject}
              onDeleteSelected={handleDeleteSelectedModelObject}
              selectedTransform={selectedModelObjectTransform}
              onTransformChange={handleModelObjectTransformChange}
            />
          )}
        </div>

        <div className="sidebar-footer">
          {editorMode === 'lights' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddLight}>
              {t('editor.addLight')}
            </button>
          ) : editorMode === 'blinds' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddBlind}>
              {t('editor.addBlind')}
            </button>
          ) : editorMode === 'displays' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddDisplay}>
              {t('editor.addDisplay')}
            </button>
          ) : editorMode === 'walls' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddWall}>
              {t('editor.addWall')}
            </button>
          ) : editorMode === 'smartDevices' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddSmartDevice}>
              {t('editor.addSmartDevice')}
            </button>
          ) : editorMode === 'tubes' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddTube}>
              {t('editor.addTube')}
            </button>
          ) : editorMode === 'rooms' ? (
            <button className="btn btn-primary editor-add-btn" onClick={() => handleAddRoom()}>
              {t('editor.addRoom')}
            </button>
          ) : (
            <button
              className="btn btn-primary editor-add-btn"
              disabled={!selectedModelObjectId}
              onClick={() => {
                if (selectedModelObjectId) handleSelectModelObject(selectedModelObjectId);
              }}
            >
              {t('editor.editSelectedObject')}
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleLoadConfig}>
            &uarr; {t('editor.reloadServer')}
          </button>
          <button className="btn btn-success" onClick={handleSaveConfig}>
            &darr; {t('editor.saveServer')}
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className={`canvas-area editor-canvas${panelOpen || displayPanelOpen || blindPanelOpen || wallPanelOpen || smartDevicePanelOpen || tubePanelOpen || roomPanelOpen ? ' form-open' : ''}`}>
        <canvas ref={canvasRef} />
        <div className={`mode-banner${placingMode || roomVirtualWallDrawing || roomSplitDrawing || roomSplitPieces.length ? ' visible' : ''}`}>
          {roomSplitPieces.length
            ? t('rooms.splitAssignBanner')
            : roomSplitDrawing
              ? t(roomSplitStartSet ? 'rooms.splitEnd' : 'rooms.splitStart')
              : roomVirtualWallDrawing
                ? t(roomVirtualWallStartSet ? 'rooms.virtualWallEnd' : 'rooms.virtualWallStart')
            : displayPanelOpen ? t('editor.placeDisplayBanner') : blindPanelOpen ? t('editor.placeBlindBanner') : wallPanelOpen ? t('editor.placeWallBanner') : smartDevicePanelOpen ? t('editor.placeSmartDeviceBanner') : roomPanelOpen ? t('editor.placeRoomBanner') : t('editor.placeLightBanner')}
        </div>
        {(!roomPanelOpen || roomZoneReady) && (
          <div className="editor-view-toolbar editor-transform-toolbar" role="toolbar" aria-label={t('editor.transformTools')}>
            {TRANSFORM_MODES.map((mode) => {
              const Icon = mode === 'move' ? Move3d : mode === 'rotate' ? Rotate3d : Scale3d;
              return (
                <button
                  key={mode}
                  className={`editor-view-tool-btn${transformMode === mode ? ' active' : ''}`}
                  onClick={() => setTransformMode(mode)}
                  aria-label={t(`modelObjects.${mode}`)}
                  aria-pressed={transformMode === mode}
                  title={t(`modelObjects.${mode}`)}
                >
                  <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
        {roomPanelOpen && (
          <div className="editor-view-toolbar editor-room-toolbar" role="toolbar" aria-label={t('rooms.boundaryTools')}>
            {roomZoneReady && (
              <>
                <button
                  className={`editor-view-tool-btn${roomGizmoActive && roomSelectedPoint === null && roomSelectedVirtualWallEndpoint === null ? ' active' : ''}`}
                  onClick={handleSelectRoomCentre}
                  aria-label={t('rooms.selectCentre')}
                  aria-pressed={roomGizmoActive && roomSelectedPoint === null && roomSelectedVirtualWallEndpoint === null}
                  title={t('rooms.selectCentre')}
                >
                  <MapPin size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button
                  className="editor-view-tool-btn"
                  onClick={handleAddRoomPoint}
                  aria-label={t('rooms.addPoint')}
                  title={t('rooms.addPoint')}
                >
                  <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button
                  className="editor-view-tool-btn"
                  onClick={handleRemoveRoomPoint}
                  disabled={roomSelectedPoint === null || roomPointCount <= 3}
                  aria-label={t('rooms.removePoint')}
                  title={t('rooms.removePoint')}
                >
                  <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button
                  className="editor-view-tool-btn"
                  onClick={handleResetRoomPoints}
                  aria-label={t('rooms.resetRectangle')}
                  title={t('rooms.resetRectangle')}
                >
                  <Square size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </>
            )}
            <button
              className={`editor-view-tool-btn${roomVirtualWallDrawing ? ' active' : ''}`}
              onClick={handleToggleRoomVirtualWallDrawing}
              aria-label={t(roomVirtualWallDrawing ? 'rooms.cancelVirtualWall' : 'rooms.drawVirtualWall')}
              aria-pressed={roomVirtualWallDrawing}
              title={t(roomVirtualWallDrawing ? 'rooms.cancelVirtualWall' : 'rooms.drawVirtualWall')}
            >
              <Minus size={17} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              className="editor-view-tool-btn"
              onClick={handleRemoveRoomVirtualWall}
              disabled={roomSelectedVirtualWall === null}
              aria-label={t('rooms.removeVirtualWall')}
              title={t('rooms.removeVirtualWall')}
            >
              <Eraser size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {roomZoneReady && (
              <>
                <button
                  className={`editor-view-tool-btn${roomSplitDrawing || roomSplitPieces.length ? ' active' : ''}`}
                  onClick={handleToggleRoomSplit}
                  aria-label={t(roomSplitDrawing || roomSplitPieces.length ? 'rooms.cancelSplit' : 'rooms.splitZone')}
                  aria-pressed={roomSplitDrawing || roomSplitPieces.length > 0}
                  title={t(roomSplitDrawing || roomSplitPieces.length ? 'rooms.cancelSplit' : 'rooms.splitZone')}
                >
                  <Scissors size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <span className="editor-room-point-count" aria-label={t('rooms.pointsCount', { count: roomPointCount })}>
                  {roomPointCount}
                </span>
              </>
            )}
          </div>
        )}
        <div className="editor-view-toolbar editor-render-toolbar" role="toolbar" aria-label={t('settings.render')}>
          <button
            className={`editor-view-tool-btn${showTextures ? ' active' : ''}`}
            onClick={() => handleEditorTexturesChange(!showTextures)}
            aria-label={`${t('settings.textures')} ${showTextures ? t('common.on') : t('common.off')}`}
            aria-pressed={showTextures}
            title={`${t('settings.textures')} ${showTextures ? t('common.on') : t('common.off')}`}
          >
            {showTextures
              ? <ImageIcon size={16} strokeWidth={1.8} aria-hidden="true" />
              : <ImageOff size={16} strokeWidth={1.8} aria-hidden="true" />}
          </button>
          <button
            className="editor-view-tool-btn"
            onClick={recenterView}
            aria-label={t('common.recenter')}
            title={t('common.recenter')}
          >
            <Crosshair size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        <div className="coord-readout">{coordText}</div>
        <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMsg}</div>

        <LightForm
          ref={lightFormRef}
          open={panelOpen}
          editLight={editIdx !== null ? lights[editIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveLight}
          onClose={handleClosePanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handlePreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
          defaultSize={editorDefaultSizes.light}
          defaultNanoleafSize={editorDefaultSizes.nanoleaf}
        />

        <DisplayForm
          ref={displayFormRef}
          open={displayPanelOpen}
          editDisplay={displayEditIdx !== null ? displays[displayEditIdx] : null}
          position={position}
          normal={displayNormal}
          onPositionChange={handlePositionChange}
          onNormalChange={setDisplayNormal}
          onSave={handleSaveDisplay}
          onClose={handleCloseDisplayPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleDisplayPreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
          defaultSize={editorDefaultSizes.screen}
        />

        <BlindForm
          ref={blindFormRef}
          open={blindPanelOpen}
          editBlind={blindEditIdx !== null ? blinds[blindEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveBlind}
          onClose={handleCloseBlindPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleBlindPreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
          defaultSize={editorDefaultSizes.blind}
        />

        <ShadowWallForm
          ref={wallFormRef}
          open={wallPanelOpen}
          editWall={wallEditIdx !== null ? shadowWalls[wallEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveWall}
          onClose={handleCloseWallPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleWallPreviewChange}
          placingMode={placingMode}
          defaultSize={editorDefaultSizes.wall}
        />

        <SmartDeviceForm
          ref={smartDeviceFormRef}
          open={smartDevicePanelOpen}
          editDevice={smartDeviceEditIdx !== null ? smartDevices[smartDeviceEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveSmartDevice}
          onClose={handleCloseSmartDevicePanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleSmartDevicePreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
        />

        <TubeForm
          open={tubePanelOpen}
          editTube={tubeEditIdx !== null ? tubes[tubeEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveTube}
          onClose={handleCloseTubePanel}
          onPreviewChange={handleTubePreviewChange}
          haEntities={haEntities}
          defaultSettings={editorDefaultSizes.tube}
        />

        <RoomForm
          ref={roomFormRef}
          open={roomPanelOpen}
          room={roomDraft}
          isNew={roomEditIdx === null}
          position={position}
          areas={haAreas}
          entities={haRoomEntities}
          placedEntityIds={placedEntityIds}
          defaultZone={{ width: editorDefaultSizes.wall.width, height: 0.025, depth: editorDefaultSizes.wall.depth }}
          hasZone={roomZoneReady}
          overlappingRoomNames={roomOverlapNames}
          placingMode={placingMode}
          virtualWallDrawing={roomVirtualWallDrawing}
          onPositionChange={handlePositionChange}
          onPreviewChange={handleRoomPreviewChange}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onToggleVirtualWallDrawing={handleToggleRoomVirtualWallDrawing}
          onSave={handleSaveRoom}
          onClose={handleCloseRoomPanel}
        />

        <RoomSplitAssignmentDialog
          pieces={roomSplitPieces}
          assignments={roomSplitAssignments}
          options={roomSplitTargetOptions}
          sourceTargetKey={roomSplitSourceTargetKey}
          sourceRoomName={roomSplitSourceRoom?.name ?? t('rooms.newName')}
          errorMessage={roomSplitError}
          onAssignmentChange={handleRoomSplitAssignmentChange}
          onConfirm={() => { void handleApplyRoomSplitAssignments(); }}
          onCancel={cancelRoomSplit}
        />
      </div>

      {showGuidedTour && (
        <GuidedTour
          steps={editorTourSteps}
          onComplete={() => {
            setShowGuidedTour(false);
            // Clean the URL param
            navigate('/editor', { replace: true });
          }}
        />
      )}
    </div>
  );
}
