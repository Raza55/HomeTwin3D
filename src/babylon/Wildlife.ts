import {
  Color3, Frustum, MaterialPluginBase, Matrix, Mesh, MeshBuilder, Quaternion, ShaderLanguage, StandardMaterial, Vector3, VertexData,
  type Material, type MaterialDefines, type Observer, type Scene, type UniformBuffer,
} from '@babylonjs/core';

/**
 * Optional wildlife outside the building: a cat that visits the courtyard now and
 * then (walks, runs, jumps onto benches, hides behind trees, seeks shelter from
 * rain and snow) and a few birds that fly about and land in the tree crowns.
 *
 * Everything is built in code (no assets): the cat is one mesh, the birds one
 * thin-instanced mesh, so the whole feature costs three draw calls. Legs, tail and
 * wings move in the vertex shader (GLSL; under WebGPU they glide unanimated).
 * The render loop is only kept awake while something visible moves.
 */

interface Tree { x: number; z: number; trunk: number; perches: Vector3[] }
interface Obstacle { x: number; z: number; halfX: number; halfZ: number }
interface Courtyard { treeCenter: Vector3; playCenter: Vector3; benchCenter: Vector3; playBenchCenter: Vector3; trees?: Tree[]; obstacles?: Obstacle[]; seats?: Vector3[] }
interface OutdoorWeather { clouds: number; wet: number; snow: number; fog: number }

export interface WildlifeOptions { reduced?: boolean }
export interface Wildlife { dispose(): void }

const CAT_SCALE = 1.6;
const BIRD_SCALE = 2.3;
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// ---------------------------------------------------------------- shaders

/** Wing beat and folding per bird; per-instance attribute htFlap = (phase, beat, fold, frequency). */
class BirdFlapPlugin extends MaterialPluginBase {
  time = 0;
  constructor(material: Material) { super(material, 'HomeTwinBirdFlap', 220, { HT_BIRD: false }); this._enable(true); }
  override prepareDefines(defines: MaterialDefines): void { defines.HT_BIRD = true; }
  override getClassName(): string { return 'HomeTwinBirdFlapPlugin'; }
  override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.GLSL; }
  override getAttributes(attributes: string[]): void { attributes.push('htFlap'); }
  override getUniforms() { return { ubo: [{ name: 'htBirdTime', size: 1, type: 'float' }], vertex: '#ifdef HT_BIRD\nuniform float htBirdTime;\n#endif' }; }
  override bindForSubMesh(buffer: UniformBuffer): void { buffer.updateFloat('htBirdTime', this.time); }
  override getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): { [point: string]: string } | null {
    if (shaderType !== 'vertex' || language !== ShaderLanguage.GLSL) return null;
    return {
      CUSTOM_VERTEX_DEFINITIONS: '#ifdef HT_BIRD\nattribute vec4 htFlap;\n#endif',
      CUSTOM_VERTEX_UPDATE_POSITION: `#ifdef HT_BIRD
        {
          float htSide = positionUpdated.x < 0. ? -1. : 1.;
          float htOut = max(0., abs(positionUpdated.x) - .03);
          float htReach = htOut * mix(1., .25, htFlap.z);
          positionUpdated.z -= htOut * .6 * htFlap.z;
          float htAngle = htFlap.y * (sin(htBirdTime * htFlap.w + htFlap.x) + .15);
          positionUpdated.x = htSide * (.03 + htReach * cos(htAngle));
          positionUpdated.y += htReach * sin(htAngle);
        }
        #endif`,
    };
  }
}

/** Cat gait: htCat = (gait phase, stride, tail time, sitting), htLegs = phase offset per leg. */
class CatGaitPlugin extends MaterialPluginBase {
  cat = { phase: 0, stride: 0, tail: 0, sit: 0 };
  legs = [0, Math.PI, Math.PI, 0];
  constructor(material: Material) { super(material, 'HomeTwinCatGait', 220, { HT_CAT: false }); this._enable(true); }
  override prepareDefines(defines: MaterialDefines): void { defines.HT_CAT = true; }
  override getClassName(): string { return 'HomeTwinCatGaitPlugin'; }
  override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.GLSL; }
  override getAttributes(attributes: string[]): void { attributes.push('htPart'); }
  override getUniforms() {
    return { ubo: [{ name: 'htCat', size: 4, type: 'vec4' }, { name: 'htLegs', size: 4, type: 'vec4' }], vertex: '#ifdef HT_CAT\nuniform vec4 htCat;\nuniform vec4 htLegs;\n#endif' };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const c = this.cat, l = this.legs;
    buffer.updateFloat4('htCat', c.phase, c.stride, c.tail, c.sit);
    buffer.updateFloat4('htLegs', l[0], l[1], l[2], l[3]);
  }
  override getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): { [point: string]: string } | null {
    if (shaderType !== 'vertex' || language !== ShaderLanguage.GLSL) return null;
    return {
      CUSTOM_VERTEX_DEFINITIONS: '#ifdef HT_CAT\nattribute float htPart;\n#endif',
      CUSTOM_VERTEX_UPDATE_POSITION: `#ifdef HT_CAT
        {
          if (htPart > .5 && htPart < 4.5) {
            float htOff = htPart < 1.5 ? htLegs.x : htPart < 2.5 ? htLegs.y : htPart < 3.5 ? htLegs.z : htLegs.w;
            float htDown = clamp((.21 - positionUpdated.y) / .21, 0., 1.);
            positionUpdated.z += sin(htCat.x + htOff) * htCat.y * htDown * .12;
            positionUpdated.y += max(0., cos(htCat.x + htOff)) * htCat.y * htDown * .04;
            if (htPart > 2.5) {
              // Sitting: hind legs fold under the body.
              positionUpdated.y = mix(positionUpdated.y, .21 - (.21 - positionUpdated.y) * .3, htCat.w);
              positionUpdated.z += htCat.w * htDown * .08;
            } else {
              // Sitting: the body tilts up, front legs reach down to the ground.
              positionUpdated.y -= htCat.w * htDown * .12;
              positionUpdated.z -= htCat.w * htDown * .05;
            }
          } else if (htPart > 4.5) {
            float htT = clamp(length(positionUpdated - vec3(0., .29, -.19)) / .34, 0., 1.);
            positionUpdated.x += sin(htCat.z - htT * 2.6) * .1 * htT * htT;
          }
        }
        #endif`,
    };
  }
}

// ---------------------------------------------------------------- geometry

function buildCat(scene: Scene): Mesh {
  const fur = new Color3(.86, .55, .26), light = new Color3(.96, .86, .7), dark = new Color3(.55, .33, .16);
  const parts: { mesh: Mesh; part: number; color: Color3 }[] = [];
  const add = (mesh: Mesh, part: number, color: Color3, at: Vector3, scale?: Vector3, rotation?: Vector3) => {
    mesh.position.copyFrom(at);
    if (scale) mesh.scaling.copyFrom(scale);
    if (rotation) mesh.rotation.copyFrom(rotation);
    parts.push({ mesh, part, color });
  };
  const sphere = (name: string) => MeshBuilder.CreateSphere(name, { diameter: 1, segments: 6 }, scene);
  add(sphere('cat-body'), 0, fur, new Vector3(0, .27, 0), new Vector3(.17, .17, .4));
  add(sphere('cat-chest'), 0, light, new Vector3(0, .31, .15), new Vector3(.13, .15, .15));
  add(sphere('cat-head'), 0, fur, new Vector3(0, .42, .24), new Vector3(.17, .155, .16));
  add(sphere('cat-muzzle'), 0, light, new Vector3(0, .395, .315), new Vector3(.08, .06, .06));
  for (const side of [-1, 1]) {
    add(MeshBuilder.CreateCylinder('cat-ear', { diameterTop: 0, diameterBottom: .065, height: .075, tessellation: 4 }, scene), 0, dark,
      new Vector3(side * .05, .505, .225), undefined, new Vector3(0, Math.PI / 4, side * -.25));
  }
  // Legs: 1 front left, 2 front right, 3 hind left, 4 hind right.
  [[.055, .13], [-.055, .13], [.06, -.14], [-.06, -.14]].forEach(([x, z], i) => {
    add(MeshBuilder.CreateCylinder('cat-leg', { diameterTop: .055, diameterBottom: .042, height: .22, tessellation: 6, subdivisions: 3 }, scene), i + 1, i < 2 ? light : fur, new Vector3(x, .11, z));
  });
  const tailPath = [0, 1, 2, 3, 4, 5, 6].map(i => { const t = i / 6; return new Vector3(0, .29 + t * .2 + Math.sin(t * 2.4) * .04, -.19 - t * .27); });
  add(MeshBuilder.CreateTube('cat-tail', { path: tailPath, radius: .024, tessellation: 6, cap: Mesh.CAP_END }, scene), 5, dark, Vector3.Zero());

  let merged: VertexData | null = null;
  const tags: number[] = [];
  for (const { mesh, part, color } of parts) {
    mesh.bakeCurrentTransformIntoVertices();
    const data = VertexData.ExtractFromMesh(mesh);
    const count = (data.positions?.length ?? 0) / 3;
    data.colors = new Float32Array(count * 4).map((_, i) => i % 4 === 3 ? 1 : i % 4 === 0 ? color.r : i % 4 === 1 ? color.g : color.b);
    for (let i = 0; i < count; i++) tags.push(part);
    if (merged) merged.merge(data); else merged = data;
    mesh.dispose();
  }
  const cat = new Mesh('wildlife-cat', scene);
  merged!.applyToMesh(cat);
  cat.setVerticesData('htPart', tags, false, 1);
  cat.isPickable = false;
  return cat;
}

function buildBird(scene: Scene): Mesh {
  // Forward +z, wings along x; vertices beyond |x| = .03 belong to the wings.
  const positions = [
    0, 0, .13, 0, .03, 0, .03, 0, .01, -.03, 0, .01, 0, -.025, 0, 0, 0, -.11, // 0 nose, 1 back, 2/3 sides, 4 belly, 5 tail root
    .045, 0, -.17, -.045, 0, -.17, // 6/7 tail fan
    .03, 0, .045, .03, 0, -.035, .115, 0, .035, .19, 0, -.035, // 8-11 left wing
    -.03, 0, .045, -.03, 0, -.035, -.115, 0, .035, -.19, 0, -.035, // 12-15 right wing
  ];
  const indices = [0, 1, 2, 0, 3, 1, 0, 2, 4, 0, 4, 3, 1, 5, 2, 1, 3, 5, 4, 2, 5, 4, 5, 3, 5, 6, 7,
    8, 10, 9, 9, 10, 11, 12, 13, 14, 13, 15, 14];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals;
  const bird = new Mesh('wildlife-birds', scene);
  data.applyToMesh(bird);
  bird.isPickable = false;
  return bird;
}

// ---------------------------------------------------------------- behaviour

type CatStep =
  | { kind: 'walk' | 'run'; to: Vector3 }
  | { kind: 'sit'; time: number; swish?: boolean }
  | { kind: 'jump'; to: Vector3 }
  | { kind: 'hide'; tree: Tree; time: number }
  | { kind: 'leave' };

interface Bird {
  pos: Vector3; vel: Vector3; state: 'fly' | 'land' | 'perch';
  target: Vector3; perch: Vector3 | null; timer: number; burst: number;
  phase: number; freq: number; beat: number; fold: number; yaw: number; roll: number;
}

export function createWildlife(scene: Scene, options: WildlifeOptions = {}): Wildlife {
  const courtyard = scene.metadata?.courtyard as Courtyard | undefined;
  const groundY = (scene.metadata?.weatherBounds as { groundY?: number } | undefined)?.groundY;
  if (!courtyard?.treeCenter || groundY === undefined) return { dispose() {} };

  const allTrees: Tree[] = [...(courtyard.trees ?? []), ...((scene.metadata?.parkTrees as Tree[] | undefined) ?? [])];
  const groveTrees = (courtyard.trees ?? []).filter(t => t.trunk > .3);
  const obstacles = courtyard.obstacles ?? [];
  const seats = courtyard.seats ?? [];
  const perches = allTrees.flatMap(t => t.perches);
  const weather = () => (scene.metadata?.outdoorWeather as OutdoorWeather | undefined) ?? { clouds: 0, wet: 0, snow: 0, fog: 0 };
  const night = () => (scene.metadata?.sunAltitudeDeg ?? 30) < -4;
  const badWeather = () => { const w = weather(); return w.wet > 0 || w.snow > 0; };
  const ground = (x: number, z: number) => new Vector3(x, groundY, z);
  const flat = (v: Vector3) => new Vector3(v.x, groundY, v.z);
  const cameraPos = () => scene.activeCamera?.globalPosition ?? courtyard.benchCenter;

  // ---- cat
  const cat = buildCat(scene);
  const catMaterial = new StandardMaterial('wildlife-cat-material', scene);
  catMaterial.specularColor = Color3.Black();
  const gait = new CatGaitPlugin(catMaterial);
  cat.material = catMaterial;
  cat.scaling.setAll(CAT_SCALE);
  cat.setPivotPoint(new Vector3(0, 0, -.14));
  cat.setEnabled(false);
  const blob = MeshBuilder.CreateDisc('wildlife-cat-shadow', { radius: .2, tessellation: 14 }, scene);
  const blobMaterial = new StandardMaterial('wildlife-shadow-material', scene);
  blobMaterial.diffuseColor = Color3.Black(); blobMaterial.specularColor = Color3.Black(); blobMaterial.alpha = .28; blobMaterial.disableLighting = true;
  blob.material = blobMaterial; blob.rotation.x = Math.PI / 2; blob.scaling.set(CAT_SCALE * .85, CAT_SCALE * 1.5, 1); blob.isPickable = false;
  blob.setEnabled(false);

  // With ?wildlife in the URL the cat comes at once (for trying it out).
  const catState = {
    present: false, away: new URLSearchParams(location.search).has('wildlife') ? 1 : rand(12, 35), pos: Vector3.Zero(), heading: 0, speed: 0, steps: [] as CatStep[],
    step: null as CatStep | null, timer: 0, jumpFrom: Vector3.Zero(), jumpT: 0, height: 0, sit: 0, swish: 0, nextSwish: 3, sheltering: false, arrived: false,
  };
  const exits = () => {
    const c = courtyard.treeCenter;
    return [0, 1, 2, 3].map(i => ground(c.x + Math.cos(i * TAU / 4 + .6) * 26, c.z + Math.sin(i * TAU / 4 + .6) * 26));
  };
  const spots = () => [courtyard.treeCenter, courtyard.playCenter, courtyard.benchCenter, courtyard.playBenchCenter]
    .map(p => ground(p.x + rand(-3, 3), p.z + rand(-3, 3)));
  const shelterTree = () => groveTrees.length ? groveTrees.reduce((best, t) => Vector3.Distance(flat(catState.pos), ground(t.x, t.z)) < Vector3.Distance(flat(catState.pos), ground(best.x, best.z)) ? t : best) : null;
  /** Behind a trunk as seen from the camera. */
  const behind = (tree: Tree) => {
    const cam = cameraPos(), dir = new Vector3(tree.x - cam.x, 0, tree.z - cam.z).normalize();
    return ground(tree.x + dir.x * (tree.trunk + .3 * CAT_SCALE), tree.z + dir.z * (tree.trunk + .3 * CAT_SCALE));
  };

  const planVisit = () => {
    const steps: CatStep[] = [];
    const count = Math.round(rand(4, 7));
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r < .3) steps.push({ kind: 'walk', to: pick(spots()) }, { kind: 'sit', time: rand(4, 10), swish: true });
      else if (r < .48) { const at = pick(spots()); steps.push({ kind: 'run', to: at }, { kind: 'sit', time: rand(2, 4) }); }
      else if (r < .68 && groveTrees.length) steps.push({ kind: 'hide', tree: pick(groveTrees), time: rand(5, 11) });
      else if (r < .84 && seats.length) {
        const seat = pick(seats);
        steps.push({ kind: 'walk', to: ground(seat.x + 1.1, seat.z + rand(-.8, .8)) }, { kind: 'jump', to: seat.clone() },
          { kind: 'sit', time: rand(5, 12), swish: true }, { kind: 'jump', to: ground(seat.x - 1.2, seat.z + rand(-.8, .8)) });
      } else {
        // A pounce: a short leap forward.
        const ahead = new Vector3(Math.sin(catState.heading), 0, Math.cos(catState.heading)).scale(1.4);
        steps.push({ kind: 'sit', time: rand(1.5, 3) }, { kind: 'jump', to: flat(catState.pos.add(ahead)) }, { kind: 'run', to: pick(spots()) });
      }
    }
    steps.push({ kind: 'leave' });
    return steps;
  };

  const blocked = (p: Vector3) => obstacles.some(o => Math.abs(p.x - o.x) < o.halfX + .3 && Math.abs(p.z - o.z) < o.halfZ + .3)
    || groveTrees.some(t => Math.hypot(p.x - t.x, p.z - t.z) < t.trunk + .15);

  /** Moves toward a ground target; true when arrived. */
  const moveTo = (to: Vector3, speed: number, dt: number) => {
    const s = catState, dx = to.x - s.pos.x, dz = to.z - s.pos.z, dist = Math.hypot(dx, dz);
    if (dist < .15) { s.speed = 0; return true; }
    let want = Math.atan2(dx, dz);
    // Steer around benches and trunks: try headings further and further off the direct line.
    for (const turn of [0, .6, -.6, 1.2, -1.2, 1.8, -1.8]) {
      const probe = s.pos.add(new Vector3(Math.sin(want + turn), 0, Math.cos(want + turn)).scale(.7));
      if (dist < .9 || !blocked(probe)) { want += turn; break; }
    }
    let diff = want - s.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.heading += Math.max(-dt * 5, Math.min(dt * 5, diff));
    s.speed += (speed - s.speed) * Math.min(1, dt * 4);
    const step = Math.min(dist, s.speed * dt * Math.max(.2, Math.cos(diff)));
    s.pos.x += Math.sin(s.heading) * step; s.pos.z += Math.cos(s.heading) * step;
    return false;
  };

  const updateCat = (dt: number) => {
    const s = catState;
    if (!s.present) {
      s.away -= dt;
      if (s.away > 0) return false;
      // Fewer visits at night, none in rain or snow.
      if (badWeather() || night() && Math.random() < .6) { s.away = rand(40, 90); return false; }
      const start = pick(exits());
      s.pos.copyFrom(start); s.heading = Math.atan2(courtyard.treeCenter.x - start.x, courtyard.treeCenter.z - start.z);
      s.present = true; s.steps = planVisit(); s.step = null; s.height = 0; s.sit = 0; s.sheltering = false;
      cat.setEnabled(true); blob.setEnabled(true);
    }
    // Rain or snow: run for the nearest big tree and wait there until it is dry.
    if (badWeather() && !s.sheltering) {
      const tree = shelterTree();
      s.sheltering = true;
      s.steps = tree ? [{ kind: 'run', to: behind(tree) }, { kind: 'sit', time: 1e9 }] : [{ kind: 'leave' }];
      s.step = null;
    } else if (!badWeather() && s.sheltering) {
      s.sheltering = false; s.steps = [{ kind: 'walk', to: pick(spots()) }, { kind: 'leave' }]; s.step = null;
    }
    if (!s.step) { s.step = s.steps.shift() ?? { kind: 'leave' }; s.timer = 0; s.jumpT = 0; s.arrived = false; s.jumpFrom = s.pos.clone(); s.jumpFrom.y = s.height; }
    const step = s.step;
    let moving = false, sitTarget = 0, stride = 0, gallop = false;
    s.timer += dt;
    switch (step.kind) {
      case 'walk': case 'run': {
        const run = step.kind === 'run';
        if (moveTo(step.to, (run ? 3.2 : .7) * CAT_SCALE * .8, dt)) s.step = null;
        moving = true; stride = run ? 1 : .75; gallop = run;
        break;
      }
      case 'sit':
        sitTarget = 1;
        if (s.timer > step.time) s.step = null;
        break;
      case 'hide': {
        if (!s.arrived) {
          if (moveTo(behind(step.tree), 2.4 * CAT_SCALE * .8, dt)) { s.arrived = true; s.timer = 0; } else { moving = true; stride = 1; gallop = true; }
          break;
        }
        // Hidden behind the trunk; then it peeks out sideways.
        sitTarget = 1;
        if (s.timer > step.time) {
          const cam = cameraPos(), side = new Vector3(-(step.tree.z - cam.z), 0, step.tree.x - cam.x).normalize().scale(step.tree.trunk + .35);
          s.steps.unshift({ kind: 'walk', to: ground(s.pos.x + side.x, s.pos.z + side.z) }, { kind: 'sit', time: rand(2, 4) });
          s.step = null;
        }
        break;
      }
      case 'jump': {
        const from = s.jumpFrom, distance = Math.hypot(step.to.x - from.x, step.to.z - from.z);
        if (s.jumpT === 0) s.heading = Math.atan2(step.to.x - from.x, step.to.z - from.z);
        s.jumpT = Math.min(1, s.jumpT + dt / Math.max(.35, .25 + distance * .12));
        const t = s.jumpT, top = Math.max(from.y, step.to.y - groundY) + .25 + distance * .12;
        s.pos.x = from.x + (step.to.x - from.x) * t; s.pos.z = from.z + (step.to.z - from.z) * t;
        // Parabola through start height, apex and landing height.
        const y0 = from.y, y1 = step.to.y - groundY;
        s.height = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (2 * top - (y0 + y1) / 2) + t * t * y1;
        moving = true; stride = 0;
        if (t >= 1) { s.height = y1; s.step = null; }
        break;
      }
      case 'leave': {
        const exit = exits().reduce((best, e) => Vector3.Distance(s.pos, e) < Vector3.Distance(s.pos, best) ? e : best);
        if (s.height > .05) { s.steps.unshift({ kind: 'jump', to: ground(s.pos.x - 1.2, s.pos.z) }, { kind: 'leave' }); s.step = null; break; }
        moving = true; stride = .75;
        if (moveTo(exit, .9 * CAT_SCALE * .8, dt)) {
          s.present = false; s.away = night() ? rand(120, 260) : rand(55, 150);
          cat.setEnabled(false); blob.setEnabled(false);
          return false;
        }
      }
    }
    // Gait and pose.
    s.sit += (sitTarget - s.sit) * Math.min(1, dt * 5);
    gait.legs = gallop ? [0, .5, Math.PI, Math.PI + .5] : [0, Math.PI, Math.PI, 0];
    gait.cat.stride += (stride * Math.min(1, s.speed / .3) - gait.cat.stride) * Math.min(1, dt * 6);
    gait.cat.phase += s.speed * dt / (.3 * CAT_SCALE) * Math.PI;
    gait.cat.sit = s.sit;
    // The tail swishes in short bursts while sitting (a still cat lets the render loop rest).
    let tailMoving = moving;
    if (!moving) {
      s.nextSwish -= dt;
      if (s.nextSwish < 0) { s.swish = rand(1.2, 2.4); s.nextSwish = rand(5, 11); }
      if (s.swish > 0) { s.swish -= dt; tailMoving = true; }
    }
    if (tailMoving) gait.cat.tail += dt * (moving ? 5 : 3);

    cat.position.set(s.pos.x, groundY + s.height, s.pos.z);
    cat.rotation.set(-.42 * s.sit + (step.kind === 'jump' ? -.25 * Math.cos(s.jumpT * Math.PI) : 0), s.heading, 0);
    blob.position.set(s.pos.x + Math.sin(s.heading) * .05, groundY + (s.height > .4 ? s.height : 0) + .015, s.pos.z + Math.cos(s.heading) * .05);
    blob.rotation.y = s.heading;
    return moving || tailMoving || Math.abs(sitTarget - s.sit) > .01;
  };

  // ---- birds
  const count = perches.length ? (options.reduced ? 4 : 7) : 0;
  const birdMesh = buildBird(scene);
  const birdMaterial = new StandardMaterial('wildlife-bird-material', scene);
  birdMaterial.diffuseColor = new Color3(.27, .25, .23); birdMaterial.specularColor = Color3.Black(); birdMaterial.backFaceCulling = false;
  const flap = new BirdFlapPlugin(birdMaterial);
  birdMesh.material = birdMaterial;
  birdMesh.metadata = { reportsOwnMotion: true };
  birdMesh.alwaysSelectAsActiveMesh = true;
  const matrices = new Float32Array(Math.max(1, count) * 16);
  const flaps = new Float32Array(Math.max(1, count) * 4);
  const occupied = new Set<Vector3>();
  const flightCenter = Vector3.Lerp(courtyard.treeCenter, courtyard.playCenter, .4);
  // Flight targets stay out of the plane-tree canopy (about 8–19 m up within ~15 m of the grove).
  const canopy = (p: Vector3) => Math.hypot(p.x - courtyard.treeCenter.x, p.z - courtyard.treeCenter.z) < 16 && p.y - groundY > 6 && p.y - groundY < 20;
  const home = scene.metadata?.weatherBounds as { x: number; z: number; halfX: number; halfZ: number } | undefined;
  const skyTarget = (): Vector3 => {
    // Now and then across the flat itself, a few metres above the roof: visible from the plan view too.
    if (home && Math.random() < .22) return new Vector3(home.x + rand(-1, 1) * home.halfX, groundY + rand(11, 16), home.z + rand(-1, 1) * home.halfZ);
    for (let i = 0; ; i++) {
      const p = new Vector3(flightCenter.x + rand(-28, 28), groundY + rand(4, 24), flightCenter.z + rand(-28, 28));
      if (!canopy(p) || i > 20) return p;
    }
  };
  const freePerch = () => { const free = perches.filter(p => !occupied.has(p)); return free.length ? pick(free) : null; };
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const perch = i % 2 === 0 ? freePerch() : null;
    if (perch) occupied.add(perch);
    const pos = perch ? perch.clone() : skyTarget();
    birds.push({ pos, vel: new Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().scale(6), state: perch ? 'perch' : 'fly', target: skyTarget(), perch,
      timer: perch ? rand(3, 25) : rand(8, 25), burst: rand(0, 1), phase: rand(0, TAU), freq: rand(15, 19), beat: 0, fold: perch ? 1 : 0, yaw: rand(0, TAU), roll: 0 });
  }
  if (count) {
    birdMesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
    birdMesh.thinInstanceSetBuffer('htFlap', flaps, 4, false);
  } else birdMesh.setEnabled(false);
  const scale = new Vector3(BIRD_SCALE, BIRD_SCALE, BIRD_SCALE), rotation = new Quaternion(), matrix = new Matrix();

  const updateBird = (b: Bird, dt: number) => {
    const grounded = night() || badWeather();
    if (b.state === 'perch') {
      b.beat = 0; b.fold += (1 - b.fold) * Math.min(1, dt * 6);
      if (!grounded && b.timer > 1e8) b.timer = rand(2, 15);
      b.timer -= dt;
      if (b.timer < 0 && !grounded) {
        if (b.perch) occupied.delete(b.perch);
        b.perch = null; b.state = 'fly'; b.target = skyTarget(); b.timer = rand(8, 28);
        b.vel.set(Math.sin(b.yaw) * 2, 3.5, Math.cos(b.yaw) * 2);
      }
      return;
    }
    b.timer -= dt;
    if (b.state === 'fly' && (b.timer < 0 || grounded)) {
      const perch = freePerch();
      if (perch) { occupied.add(perch); b.perch = perch; b.state = 'land'; b.target = perch; } else b.timer = rand(4, 8);
    }
    const to = b.target.subtract(b.pos), dist = to.length();
    if (b.state === 'fly' && dist < 4) b.target = skyTarget();
    const landing = b.state === 'land';
    const cruise = landing ? Math.min(7, Math.max(1.2, dist * 1.1)) : 7.5;
    const desired = to.normalize().scale(cruise);
    const steer = desired.subtract(b.vel), maxTurn = (landing && dist < 6 ? 14 : 5) * dt;
    if (steer.length() > maxTurn) steer.normalize().scaleInPlace(maxTurn);
    const before = Math.atan2(b.vel.x, b.vel.z);
    b.vel.addInPlace(steer);
    b.pos.addInPlace(b.vel.scale(dt));
    const yaw = Math.atan2(b.vel.x, b.vel.z);
    let turn = yaw - before; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    b.yaw = yaw; b.roll += (Math.max(-.7, Math.min(.7, -turn / Math.max(dt, .001) * .25)) - b.roll) * Math.min(1, dt * 4);
    // Bounding flight: bursts of wing beats, then a short glide; steady beating when climbing or landing.
    b.burst += dt;
    const climbing = b.vel.y > 1 || landing && dist < 8;
    const flapping = climbing || b.burst % 1.1 < .65;
    b.beat += ((flapping ? .95 : 0) - b.beat) * Math.min(1, dt * 10);
    b.fold += ((flapping ? 0 : .3) - b.fold) * Math.min(1, dt * 8);
    if (landing && dist < .2) {
      b.pos.copyFrom(b.target); b.vel.setAll(0); b.state = 'perch'; b.roll = 0;
      b.timer = grounded ? 1e9 : rand(6, 30);
    }
  };

  // ---- loop
  let last = performance.now(), time = 0;
  const point = new Vector3();
  const observer: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    let dt = Math.min(1, (now - last) / 1000);
    last = now;
    if (dt <= 0) return;
    time += dt;
    flap.time = time;
    const planes = scene.frustumPlanes;
    const inView = (p: Vector3) => !planes || Frustum.IsPointInFrustum(p, planes);
    let animating = false;
    // Long gaps (the render loop rests when nothing moves) advance in steps.
    while (dt > 0) {
      const step = Math.min(dt, .1); dt -= step;
      const catMoves = updateCat(step);
      if (dt === 0 && catMoves && catState.present && inView(point.set(catState.pos.x, groundY + .3, catState.pos.z))) animating = true;
      for (const b of birds) updateBird(b, step);
    }
    birds.forEach((b, i) => {
      if (b.state !== 'perch' && inView(b.pos)) animating = true;
      Quaternion.RotationYawPitchRollToRef(b.yaw, b.state === 'perch' ? 0 : -Math.asin(Math.max(-.6, Math.min(.6, b.vel.y / Math.max(.1, b.vel.length())))), b.roll, rotation);
      Matrix.ComposeToRef(scale, rotation, b.pos, matrix);
      matrix.copyToArray(matrices, i * 16);
      flaps.set([b.phase, b.beat, b.fold, b.freq], i * 4);
    });
    if (count) { birdMesh.thinInstanceBufferUpdated('matrix'); birdMesh.thinInstanceBufferUpdated('htFlap'); }
    if (!!scene.metadata?.wildlifeAnimating !== animating) scene.metadata = { ...scene.metadata, wildlifeAnimating: animating };
  });

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const m of [cat, blob, birdMesh]) m.dispose();
      for (const m of [catMaterial, blobMaterial, birdMaterial]) m.dispose();
      if (scene.metadata) scene.metadata = { ...scene.metadata, wildlifeAnimating: false };
    },
  };
}
