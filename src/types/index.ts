export interface LightSize {
  diameter?: number;
  width?: number;
  height?: number;
  depth?: number;
}

export interface LightPosition {
  x: number;
  y: number;
  z: number;
}

export type LightType = 'toggle' | 'dimmeable' | 'warmCold' | 'rgb' | 'rgbw' | 'remote' | 'nanoleafShapes';
export type LightShape = 'sphere' | 'cube' | 'ellipsoid' | 'nanoleafShapes';
export type LightFixtureStyle = 'none' | 'ceiling' | 'pendant' | 'floor' | 'spot' | 'strip';

export interface LightInteractionConfig {
  /** Render the hitbox as a subtle touch zone in the live dashboard. */
  touchZone?: boolean;
  /** Show a camera-facing light icon above the touch zone. */
  showIcon?: boolean;
  /** Opacity of the touch zone while it is not hovered. */
  idleOpacity?: number;
}

export interface RemoteButton {
  entityId: string;
  label: string;
  /** Visual group heading in the remote modal (e.g., "Power", "Scenes"). */
  group?: string;
  /** Hex color to render on the 3D light when this mode is active (e.g., "#ef4444"). */
  color?: string;
}

export interface LightPart {
  shape: LightShape;
  size: LightSize;
  position: LightPosition;
  /** Visual rotation in degrees. */
  rotation?: LightPosition;
  /** Visual scale multiplier after size has been applied. */
  scale?: LightPosition;
}

export interface HitboxConfig {
  shape: LightShape;
  size: LightSize;
  /** Hitbox position. If undefined, defaults to the light's position. */
  position?: LightPosition;
  /** Hitbox rotation in degrees. */
  rotation?: LightPosition;
  /** Hitbox scale multiplier after size has been applied. */
  scale?: LightPosition;
}

export interface LightConfig {
  floorplanIds?: string[];
  emitters?: FloorplanEmitter[];
  entityId: string;
  label: string;
  type: LightType;
  shape?: LightShape;
  size?: LightSize;
  position: LightPosition;
  /** Visual rotation in degrees. */
  rotation?: LightPosition;
  /** Visual scale multiplier after size has been applied. */
  scale?: LightPosition;
  /** Optional built-in 3D fixture surrounding the emissive light source. */
  fixtureStyle?: LightFixtureStyle;
  /** Live-dashboard interaction visualisation. */
  interaction?: LightInteractionConfig;
  /** Base color temperature in Kelvin (2000-6500). Used as default color for toggle/dimmeable lights. */
  warmth?: number;
  /** Intensity multiplier for the 3D point light (0.1–1000, default 1). Applies to all light types. */
  brightness?: number;
  /** Multiple sub-shapes for this light. When defined, top-level shape/size are ignored. */
  parts?: LightPart[];
  /** Custom hitbox for click detection. If undefined, the bulb mesh is used as the hitbox. */
  hitbox?: HitboxConfig;
  /** Group ID this light belongs to (references LightGroup.id). Undefined = ungrouped. */
  group?: string;
  /** Buttons for 'remote' type lights (IR remote simulation via ESPHome). */
  remoteButtons?: RemoteButton[];
  /** Entity ID of a HA sensor that reports the current mode (e.g., text_sensor from ESPHome). */
  modeEntityId?: string;
  /** Secondary entity ID to toggle on double-tap (e.g., a fan entity attached to a ceiling light). */
  doubleTapEntityId?: string;
}

export interface LightGroup {
  id: string;
  name: string;
}

// --- 3D model ---

export interface ModelObjectTransform {
  position?: LightPosition;
  /** Rotation in degrees. */
  rotation?: LightPosition;
  scale?: LightPosition;
}

export interface ModelObjectOverride extends ModelObjectTransform {
  id: string;
  label?: string;
}

export interface ImportedModelObjectConfig extends ModelObjectTransform {
  id: string;
  label: string;
  fileName: string;
  format: string;
}

export interface FloorplanEmitter {
  kind: 'point' | 'spot';
  position: LightPosition;
  direction?: LightPosition;
  /** Total luminous flux for this source; strip samples share the fixture's flux. */
  lumens: number;
  range: number;
  angle?: number;
  radius?: number;
}

export interface ApplianceConfig {
  kind: 'washer' | 'dryer';
  runningStates?: string[];
  powerThreshold?: number;
  remainingEntityId?: string;
  programEntityId?: string;
}

export interface ITMetric {
  key: string; label: string; entityId: string;
  format?: 'value' | 'uptime'; positiveOnly?: boolean;
}
export interface ITAction {
  id: string; label: string; entityId: string;
  kind: 'toggle' | 'button' | 'wake';
}
export interface ITDevice {
  id: string; label: string; kind: 'pc' | 'nas' | 'host' | 'router';
  statusEntityId: string; statusMode: 'power' | 'telemetry' | 'connection';
  metrics: ITMetric[]; actions: ITAction[];
  screenMaterials?: string[]; rgbMaterials?: string[];
  screenshotEntityId?: string;
}
export interface ITConfig { kind: 'pc' | 'rack'; devices: ITDevice[]; }

export interface FloorplanObject {
  it?: ITConfig;
  coffee?: {
    statusEntityId: string;
    activeProgramEntityId: string;
    remainingEntityId: string;
    progressEntityId: string;
    remoteStartEntityId: string;
    connectivityEntityId: string;
    localControlEntityId: string;
    stopEntityId: string;
  };
  echo?: { kind: 'dot' | 'show' };
  /** Read-only marker, visible only for explicitly listed active states. */
  statusIndicator?: { kind: 'smoke'; activeStates: string[] };
  /** One contact per opening; a double door animates its right leaf only. */
  /** `tiltOnly`: the sash can only be tilted (furniture in front), so an open contact means tilted. */
  door?: { kind: 'double' | 'single' | 'entrance'; tiltOnly?: boolean };
  doorLock?: { doorId: string };
  appliance?: ApplianceConfig;
  id: string;
  label: string;
  domain: 'light' | 'cover' | 'switch' | 'fan' | 'vacuum' | 'media_player' | 'sensor' | 'binary_sensor' | 'button' | 'climate' | 'lock';
  entityId: string;
  position: LightPosition;
  size: { width: number; height: number; depth: number };
  rotationY: number;
  room?: string;
  /** Explicit room confirmation in the matching guide. */
  haAreaId?: string;
  lightCalibration?: { lumens?: number; range?: number };
  lightType?: LightType;
  emitters?: FloorplanEmitter[];
}

export interface FloorplanManifest {
  version: 1;
  source: string;
  coordinateSystem: 'babylon-lh-meters';
  objects: FloorplanObject[];
}

/** Durable relationships, independent of the currently loaded model geometry. */
export type FloorplanBinding = Pick<FloorplanObject, 'id' | 'label' | 'domain' | 'entityId' | 'haAreaId' | 'lightCalibration' | 'lightType' | 'appliance' | 'door' | 'doorLock' | 'statusIndicator' | 'echo' | 'coffee' | 'it'>;

export interface ModelConfig {
  floorplan?: FloorplanManifest;
  /** User scale applied on top of the loader's automatic unit conversion. */
  scale?: number;
  /** Local transform overrides for imported model sub-objects. */
  objectOverrides?: ModelObjectOverride[];
  /** Additional user-uploaded 3D objects placed inside the model scene. */
  importedObjects?: ImportedModelObjectConfig[];
}

// --- Blinds / covers ---

export interface BlindConfig {
  floorplanIds?: string[];
  id: string;
  entityId: string;
  label: string;
  position: LightPosition;
  size: { width: number; height: number; depth: number };
  /** Rotation around the vertical axis in degrees. */
  rotationY?: number;
  /** Number of horizontal slats/segments to render inside the blind. */
  slats?: number;
}

// --- Shadow Walls (invisible roof / sun blockers) ---

export interface ShadowWallConfig {
  id: string;
  label: string;
  position: LightPosition;
  size: { width: number; height: number; depth: number };
  /** Optional visual/shadow rotation in degrees. */
  rotation?: LightPosition;
}

// --- Smart-home devices ---

export type SmartDeviceGroup = 'kitchen' | 'climate' | 'cleaning' | 'security' | 'entertainment' | 'other';
export type SmartDeviceType = 'coffeeMaker' | 'fan' | 'vacuum' | 'airPurifier' | 'humidifier' | 'speaker' | 'camera' | 'generic';
export type SmartDeviceAction = 'toggle' | 'start' | 'returnHome' | 'press' | 'none';

export interface SmartDeviceConfig {
  appliance?: ApplianceConfig;
  floorplanIds?: string[];
  id: string;
  entityId: string;
  label: string;
  group: SmartDeviceGroup;
  type: SmartDeviceType;
  action: SmartDeviceAction;
  position: LightPosition;
  /** Visual rotation in degrees. */
  rotation?: LightPosition;
  /** Visual scale multiplier for the selected device preset. */
  scale?: LightPosition;
}

// --- Rooms / Home Assistant areas ---

export interface RoomZone {
  width: number;
  depth: number;
  /** Hex colour used for the translucent floor overlay. */
  color?: string;
  /** Floor overlay opacity between 0 and 1. */
  opacity?: number;
  /** Optional polygon vertices relative to the room anchor on the floor plane. */
  points?: RoomZonePoint[];
  /** Editor-defined line segments that act as finite walls during room detection. */
  virtualWalls?: RoomVirtualWall[];
  /** Thin editor-only floor marker height. */
  height?: number;
  /** Rotation around the vertical axis in degrees. */
  rotationY?: number;
}

export interface RoomZonePoint {
  x: number;
  z: number;
}

export interface RoomVirtualWall {
  start: RoomZonePoint;
  end: RoomZonePoint;
}

export interface RoomDashboardView {
  dashboardPath: string;
  viewPath: string;
}

export interface RoomConfig {
  id: string;
  name: string;
  icon?: string;
  /** One visual room may combine multiple Home Assistant areas. */
  haAreaIds: string[];
  /** Logical centre of the room in model coordinates. */
  anchor: LightPosition;
  zone: RoomZone;
  /** Entities promoted to the compact room controls, in display order. */
  primaryEntityIds: string[];
  hiddenEntityIds?: string[];
  dashboardView?: RoomDashboardView;
}

// --- Wall Displays ---

export type DisplayAnimation = 'spin' | 'pulse' | 'glow' | 'bounce' | 'flash';

export interface DisplayCondition {
  /** Value to match (e.g., 'heat', 'idle', 'on', 'off'). */
  state: string;
  /** Attribute name to match against instead of entity .state (e.g., 'hvac_action'). */
  attribute?: string;
  /** Text color when this condition matches. */
  color?: string;
  /** Override display label when this condition matches. */
  label?: string;
  /** Lucide icon name to display instead of text (e.g., 'Flame', 'Snowflake', 'Power'). */
  icon?: string;
  /** Override display background color when this condition matches. */
  backgroundColor?: string;
  /** Animation to apply when this condition matches. */
  animation?: DisplayAnimation;
}

export interface DisplaySource {
  entityId: string;
  label?: string;
  unit?: string;
  precision?: number;
  /** Per-source overrides (fall back to display-level defaults). */
  color?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  /** Conditional styling rules evaluated against entity state. */
  conditions?: DisplayCondition[];
}

export type TextAlign = 'left' | 'center' | 'right';

export type DisplayKind = 'info' | 'tv' | 'pc' | 'console' | 'qnap';

export interface DisplayConfig {
  /** Receiver decides the displayed input; SHIELD metadata is gated by that input. */
  tvMedia?: { receiver: string; shield: string; television: string; remote?: string; screenshot?: string; pcScreenshot?: string };
  floorplanIds?: string[];
  id: string;
  label: string;
  /** Info displays show sensor values; screen kinds show TV, PC, console, or NAS status. */
  kind?: DisplayKind;
  sources: DisplaySource[];
  position: LightPosition;
  /** Wall face normal (unit vector) — display faces outward along this direction. */
  normal: LightPosition;
  width: number;
  height: number;
  /** Default font size for sources that don't override it. */
  fontSize?: number;
  /** Default font weight for sources that don't override it. */
  fontWeight?: 'normal' | 'bold';
  /** Default text color for sources that don't override it. */
  color?: string;
  textAlign?: TextAlign;
  backgroundColor?: string;
  opacity?: number;
  /** Seven-segment LED digits on a dark window (appliance panels). */
  segment?: boolean;
  /** Mirror the texture horizontally. */
  mirrorH?: boolean;
  /** Mirror the texture vertically. */
  mirrorV?: boolean;
  /** Allow clicking this display to open a detail modal. */
  clickable?: boolean;
  /** Default animation for this display (can be overridden per-condition). */
  animation?: DisplayAnimation;
}

export interface OnboardingState {
  completed: boolean;
}

export interface AppConfig {
  floorplanBindings?: FloorplanBinding[];
  location: {
    latitude: number;
    longitude: number;
    /** Clockwise rotation offset (degrees) from model north to true north. */
    northOffset?: number;
  };
  lights: LightConfig[];
  model?: ModelConfig;
  blinds?: BlindConfig[];
  lightGroups?: LightGroup[];
  displays?: DisplayConfig[];
  shadowWalls?: ShadowWallConfig[];
  smartDevices?: SmartDeviceConfig[];
  rooms?: RoomConfig[];
  sidePanel?: SidePanelConfig;
  tubes?: TubeConfig[];
  /**
   * Home view for every browser of the installation (camera pose the centre
   * button returns to). A browser's own home view (settings) takes precedence.
   */
  homeView?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } };
  onboarding?: OnboardingState;
}

export interface HASettings {
  url: string;
  port: number;
  token: string;
}

export interface FullConfig {
  floorplanBindings?: FloorplanBinding[];
  location: {
    latitude: number;
    longitude: number;
    northOffset?: number;
  };
  lights: LightConfig[];
  model?: ModelConfig;
  blinds?: BlindConfig[];
  lightGroups?: LightGroup[];
  displays?: DisplayConfig[];
  shadowWalls?: ShadowWallConfig[];
  smartDevices?: SmartDeviceConfig[];
  rooms?: RoomConfig[];
  sidePanel?: SidePanelConfig;
  tubes?: TubeConfig[];
  onboarding?: OnboardingState;
}

export interface HAStateAttributes {
  brightness?: number;
  color_temp?: number;
  color_temp_kelvin?: number;
  min_color_temp_kelvin?: number;
  max_color_temp_kelvin?: number;
  hs_color?: [number, number];
  xy_color?: [number, number];
  rgb_color?: [number, number, number];
  white_value?: number;
  color_mode?: string;
  supported_color_modes?: string[];
  effect?: string;
  effect_list?: string[];
  friendly_name?: string;
  [key: string]: unknown;
}

export interface HAState {
  last_changed?: string;
  entity_id: string;
  state: string;
  attributes: HAStateAttributes;
}

export interface LightSceneOption {
  entityId: string;
  label: string;
}

// --- Energy and flow visualisations ---

export type TubeOriginDirection = 'top' | 'bottom' | 'left' | 'right';
export type TubeFlowType = 'network' | 'electricity' | 'water' | 'gas' | 'custom';

/** Unit the HA sensor reports its value in. Lowercase = bits, uppercase = bytes. */
export type TubeInputUnit = 'b' | 'kb' | 'mb' | 'gb' | 'tb' | 'B' | 'kB' | 'mB' | 'gB' | 'tB';

export interface TubeLineConfig {
  /** HA sensor entity ID (e.g. sensor.freebox_download_speed). */
  sensorId: string;
  /** Hex color for this tube line (e.g. "#00aaff"). */
  color: string;
  /** Optional Lucide icon name displayed before the label (e.g. "Wifi", "Droplet"). */
  icon?: string;
  /** Unit the sensor value is reported in (default: "b" = bits). Only used in speed mode. */
  inputUnit?: TubeInputUnit;
  /** Display in bytes instead of bits (default: false = bits). Only used in speed mode. */
  displayBytes?: boolean;
  /** Custom display unit (e.g. "W", "L", "m³", "L/min"). When set, bypasses speed formatting
   *  and uses generic SI auto-scaling instead. */
  displayUnit?: string;
  /** Apply SI prefixes automatically (W -> kW). Disable when the sensor already reports kWh, m3, etc. */
  autoScale?: boolean;
  /** Number of decimal places for the displayed value (default: 1 for generic, auto for speed). */
  precision?: number;
  /** Enable animated particles flowing inside the tube (default: false). */
  particles?: boolean;
  /** Direction particles flow: 'inward' toward building, 'outward' away (default: 'inward'). */
  particleDirection?: 'inward' | 'outward';
  /** Speed multiplier for particles (0.1–5, default: 1). */
  particleSpeed?: number;
  /** Sensor value (in input unit) at which particles reach max speed (default: 1000). */
  particleMaxValue?: number;
}

export interface TubeConfig {
  id: string;
  label: string;
  /** Semantic group used by the editor. Omitted legacy entries are treated as network flows. */
  flowType?: TubeFlowType;
  /** Origin direction relative to home view. */
  originDirection: TubeOriginDirection;
  /** Tube diameter in world units. */
  diameter: number;
  /** Font size for the floating sensor value label. */
  fontSize: number;
  /** Gap between parallel tube lines. */
  gap: number;
  /** X position of the tube endpoint (after the right angle). */
  endX: number;
  /** Z position of the tube endpoint (after the right angle). */
  endZ: number;
  /** Label position along the horizontal tube segment (0 = edge, 1 = corner). */
  labelPosition: number;
  /** Height of the label above the tube (world units). */
  labelHeight: number;
  /** Individual tube lines within this group. */
  lines: TubeLineConfig[];
}

// --- Side Panel ---

export interface CardLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BaseCard {
  id: string;
  title: string;
  showTitle?: boolean;
  layout: CardLayout;
}

export interface ScriptCard extends BaseCard {
  type: 'script';
  entityId: string;
  icon?: string;
  longPressEntityId?: string;
  doublePressEntityId?: string;
}

export interface IndicatorCard extends BaseCard {
  type: 'indicator';
  entityId: string;
  unit?: string;
  precision?: number;
  icon?: string;
  /** Optional climate entity to show heating controls in the indicator modal. */
  climateEntityId?: string;
}

export interface GraphCard extends BaseCard {
  type: 'graph';
  entityId: string;
  period: string;
  refreshInterval?: number;
}

export type SidePanelCard = ScriptCard | IndicatorCard | GraphCard;

export interface SidePanelConfig {
  columns?: number;
  rowHeight?: number;
  cards: SidePanelCard[];
}

export interface HAHistoryPoint {
  state: string;
  last_changed: string;
}
