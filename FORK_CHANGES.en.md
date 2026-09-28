# Fork Feature Overview

[Deutsch](./FORK_CHANGES.md) | English

This document covers the additions on the `featureaddon` branch compared with
`upstream/main` of `Kdcius/3Dash_webapp`. Existing configurations remain compatible:
new fields are optional and are only stored when their corresponding editor features
are used.

## 3D Model and Additional Objects

- The main model can be replaced with a new GLB file or reloaded at runtime from
  Settings.
- A replacement file is validated before use. If loading fails, the previously used
  model is restored.
- Shared scene scaling keeps the main model, lights, blinds, screens, energy flows,
  and other placed objects aligned relative to each other.
- Textures can be enabled or disabled using compact icon buttons in both the editor
  and the regular 3D view.
- Additional models can be imported as GLB, glTF, OBJ, or STL.
- Imported models have their own position, rotation, and scale and are stored
  separately from the main model.
- Subobjects of the main model can be selected and fine-tuned with local position,
  rotation, and scale overrides. The original GLB file is not modified.
- When the main model is replaced, subobject overrides that can no longer be matched
  reliably are discarded. Placed smart-home objects remain available.

## Editor and Navigation

- The editor is available as a top-level entry in the side panel.
- Editor categories use compact Lucide icons with counts, tooltips, and accessible
  `aria-label` values instead of long tab labels.
- Global Move, Rotate, and Scale modes are available directly inside the 3D view.
- Position, orientation, and scale are separate sections in object forms and are
  available for lights, blinds, screens, light blockers, smart-home devices, imported
  models, and model subobjects.
- Sliders use finer, value-relative ranges to make small mouse adjustments less
  sensitive.
- Orbit panning, right-button dragging, and zooming have been tuned for smoother
  control.
- Model textures can be toggled directly in the editor for better orientation.
- The editor header places the Back button on the left and the Editor title on the
  right.
- German and English translations cover the new interfaces and guided tours.

## Lights and Home Assistant

- Lights support spheres, cubes, ellipsoids, multipart shapes, light strips, and
  Nanoleaf Shapes-style panels.
- Position, rotation, and three-axis scale can be edited independently.
- A custom hitbox can be positioned, rotated, and scaled as a sphere, box, or
  ellipsoid.
- Built-in fixture bodies are available for ceiling lights, pendant lights, floor
  lamps, spotlights, and light strips. They use lightweight procedural 3D geometry,
  not external or brand-specific GLB files.
- The hitbox can optionally appear in the live view as a translucent touch zone with
  a floating, camera-facing light icon.
- The touch zone follows the Home Assistant light color and state, highlights on
  hover, and remains neutrally visible while the light is off.
- A short tap toggles the light. A long press opens the detailed controls.
- A double tap can optionally toggle a secondary entity, such as a ceiling fan.
- Dimming, color temperature, RGB color, and Hue/Home Assistant scenes are available
  from the live view.
- Controls are shown only when supported by the entity's Home Assistant
  `supported_color_modes` data.
- Brightness and color affect both the emissive light material and the Babylon light
  source. A minimum visual level prevents a heavily dimmed active light from looking
  fully off.
- IR/remote lights can map modes and colors through additional entities.

## Rooms and Home Assistant Areas

- The editor includes a dedicated `Rooms` category that reads Home Assistant area,
  device, and entity registries through the WebSocket API without modifying HA.
- Unconfigured HA areas can be added directly from the room list, and one visual room
  can combine multiple HA areas when needed.
- Each room has a centre that can be placed in the 3D model and an adjustable,
  rotatable floor area. A dedicated stable centre handle follows both model clicks and
  position sliders without a delayed preview.
- Room areas can be stored as rectangles or free-form polygons, including concave
  outlines. Corner points can be selected, moved, added, and removed directly in the
  3D view, and a reset action restores a rectangle.
- New rooms start without a pre-rendered area. A click on a clear floor spot is first
  projected onto a broad horizontal floor surface. When the imported model provides a
  separate floor mesh, its real triangle boundary is preferred as the room polygon.
  This keeps rooms separated at open doorways when their floor materials are distinct.
  Models without separate floor surfaces retain the fallback based on tall, vertical
  wall hits that remain consistent across five probe heights, largely ignoring low or
  compact furniture.
- Open transitions can be bounded directly in the 3D model with virtual walls drawn as
  finite start-to-end lines. Each endpoint can be moved independently, while the whole
  line can be selected or deleted. Re-running room detection treats these segments as
  walls, and they are persisted separately for each room.
- Virtual walls can be drawn before the first room detection. In this state the 3D view
  shows only lines and endpoints, without an artificial starting area; room detection
  keeps and rebases those boundaries. A labelled action in the room panel keeps this
  tool visible and discoverable before detection.
- Development mode automatically removes stale production PWA service workers so the
  local editor cannot remain pinned to an outdated cached interface after code changes.
- Room areas on the same floor cannot overlap. The check uses the actual polygons,
  including concave outlines, while allowing shared edges and corners. Conflicts are
  shown in red with the affected room names, and both room-level and global saving stay
  blocked until the overlap is resolved. Rooms on different floors remain independent.
- In Rooms mode, all saved neighboring rooms remain visible while another area is being
  edited or detected. Polygon edges on the same floor automatically act as finite virtual
  partitions during detection without being copied into the new room as manual walls.
- Automatic detection geometrically subtracts already assigned room areas on the same
  floor and keeps the available component at the clicked floor point. If no non-overlapping
  component can be represented as a simple polygon there, detection is rejected instead
  of creating an overlap.
- The floor is determined from the detected floor surface rather than the height of any
  clicked furniture. Detection then runs again with every neighbouring room boundary and
  defensively rejects any remaining overlap.
- A scissors tool splits an existing room area directly in the 3D view. After the cut,
  an assignment dialog covers every resulting part: each part can replace the area of
  an existing configured room or be assigned to an unassigned Home Assistant area.
  Unassigned areas become new rooms with prioritised entities. The source room is
  removed when none of the resulting parts is assigned to it.
- Shared split edges do not count as overlaps. Existing conflicts that are unchanged by
  the split no longer block assignment again, while newly introduced overlaps are shown
  directly in the assignment dialog.
- Until an outline has been detected, transform tools and saving remain hidden or
  disabled. Fine editing then shows small corner handles, while the gizmo appears only
  for the selected handle.
- The global Move, Rotate, and Scale tools apply to the complete room area. Moving an
  individual polygon point keeps it locked to the room's floor plane.
- While editing, only the active room area is shown. Stale preview surfaces, outlines,
  and corner handles are fully removed before each rebuild so they cannot overlap
  while being moved.
- Room names use compact labels scaled to their room and appear only on hover or for
  an active selection. In the Rooms tab, clicking a room area takes precedence over
  overlapping lights and other objects.
- Assigned entities are ranked by Safety, Primary Controls, Climate, Media, and Room
  Status. Diagnostic, configuration, disabled, and hidden entities are omitted by
  default.
- Entities already placed as lights, blinds, screens, smart-home devices, or energy
  flows are detected automatically and receive a higher recommendation priority.
- Key entities can be selected individually for each room and are stored in a stable
  order in the application configuration.
- In narrow editor windows, the object list steps aside while a form is open so the
  3D surface, transform tools, and form remain usable together.

### Room Colours

- Each room area can use its own colour and translucent opacity.
- Existing rooms without a saved colour automatically receive a stable colour from a
  visually distinct palette.
- Red remains reserved as the warning colour for positive-area overlaps on the same
  floor; shared edges and corners are still allowed.
- Colour and opacity are stored with the room configuration and included in backup and
  restore.

## Blinds and Cover Entities

- The Blinds category connects rectangular 3D blinds to Home Assistant entities in
  the `cover` domain.
- Open, Close, Stop, and percentage target positions are supported when the entity
  exposes the corresponding features.
- Partially open blinds are rendered with visible slats.
- Width, height, depth, slat count, position, rotation, and scale are editable.
- The current cover state is visualized and updated in the live view.

## Screens and Computers

- The previous Displays section is now called `Screens/Computer`.
- Available types include information display, TV, PC, console, and QNAP/NAS.
- TV mode can connect a `media_player` entity and display information such as power
  state, source, app, volume, and available media metadata.
- An inactive screen is rendered dark, while an active screen receives a suitable
  glow effect.
- Size, position, orientation, and scale can be edited from the right-hand editor
  panel.
- New screens and other placed objects use default dimensions calculated relative to
  the model size.

## Light Blockers

- The previous `Walls` category is now called `Light blockers`.
- Light blockers are invisible geometry for locations where an imported model lacks
  a suitable shadow-casting wall, ceiling, or surface.
- Position, size, rotation, and scale can be adjusted in the editor.

## Smart-Home Devices

- A dedicated category organizes placed smart-home devices into functional groups.
- Groups include Kitchen, Climate/Air, Cleaning, Entertainment, Security, Network,
  and Other.
- Presets include coffee makers, fans, air purifiers, air-quality sensors, robot
  vacuums, speakers, cameras, and generic appliances.
- Devices can be connected to a Home Assistant entity and, depending on their type,
  invoke actions such as Toggle, Turn on, Start, Return to base, or Press.
- The state, color, and animation of the 3D marker respond to the entity.
- Position, rotation, and scale are editable.

## Energy and Flows

- The previous `Tubes` category is now called `Energy & Flows`.
- Flow types include Network, Electricity, Water, Gas, and custom measurement flows.
- Presets create appropriate measurement sources for Network, Smart Plug,
  Electricity Meter, Water Meter, and Gas Meter use cases.
- Supported units include bit/s, byte/s, W, kW, kWh, MWh, V, A, L/min, m³, and m³/h.
- SI units can be scaled automatically. Automatic scaling can be disabled for sensors
  that already report units such as `kWh` or `m³`.
- Animated particles visualize the direction and intensity of a measurement flow.
- A smart plug is configured as a controllable item under Smart-Home Devices; its
  power, energy, voltage, and current sensors are visualized under Energy & Flows.

## Data, Backup, and Compatibility

- The configuration includes optional blocks for model scaling, subobject overrides,
  imported objects, blinds, smart-home devices, light fixtures, touch zones, rooms, and
  energy-flow types.
- Configuration and settings continue to be stored in the browser. Large model files
  are stored in IndexedDB.
- Backup and restore cover the model, settings, placed objects, and newly added
  configuration sections.
- Existing light and tube configurations remain valid and retain their previous
  defaults until a new visualization option is selected.

## Not Yet Included

- The light editor does not yet load an individual GLB directly as a fixture body.
  Custom models can already be imported as additional 3D objects and placed together
  with a light and its touch zone.
- Local subobject overrides are not written back into the GLB file, and the edited
  scene cannot yet be exported as a new GLB.

## Technical Verification

Changes are checked before committing with:

```bash
npx tsc --noEmit
npm run build
```

The development branch is `featureaddon` in the
[`Raza55/3Dash_webapp`](https://github.com/Raza55/3Dash_webapp) fork.
