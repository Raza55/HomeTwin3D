import {
  Color3, Frustum, MaterialPluginBase, Matrix, Mesh, MeshBuilder, Quaternion, ShaderLanguage, StandardMaterial, Vector3, VertexData,
  type Material, type MaterialDefines, type Observer, type Scene, type UniformBuffer,
} from '@babylonjs/core';

/**
 * Optional wildlife outside the building: a cat that visits the courtyard now and
 * then (walks, runs, jumps onto benches and posts to lie there, hides behind trees,
 * seeks shelter from rain and snow) and birds that fly over the courtyard and the
 * flat and land in the tree crowns or on the lawn.
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
export interface Wildlife {
  /** Brings the cat at once (to a bench, to lie there) and a few birds onto the lawn nearby. */
  visit(): void;
  /** Where the visit takes place (for a camera). */
  readonly stage: Vector3 | null;
  dispose(): void;
}

const CAT_SCALE = 1.6;
const BIRD_SCALE = 3;
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

/**
 * Cat gait: htCat = (gait phase, stride, tail time, sitting), htLegs = phase offset
 * per leg, htPose.x = lying (legs tucked in, tail curled round).
 */
class CatGaitPlugin extends MaterialPluginBase {
  cat = { phase: 0, stride: 0, tail: 0, sit: 0, lie: 0 };
  legs = [0, Math.PI, Math.PI, 0];
  constructor(material: Material) { super(material, 'HomeTwinCatGait', 220, { HT_CAT: false }); this._enable(true); }
  override prepareDefines(defines: MaterialDefines): void { defines.HT_CAT = true; }
  override getClassName(): string { return 'HomeTwinCatGaitPlugin'; }
  override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.GLSL; }
  override getAttributes(attributes: string[]): void { attributes.push('htPart'); }
  override getUniforms() {
    return {
      ubo: [{ name: 'htCat', size: 4, type: 'vec4' }, { name: 'htLegs', size: 4, type: 'vec4' }, { name: 'htPose', size: 4, type: 'vec4' }],
      vertex: '#ifdef HT_CAT\nuniform vec4 htCat;\nuniform vec4 htLegs;\nuniform vec4 htPose;\n#endif',
    };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const c = this.cat, l = this.legs;
    buffer.updateFloat4('htCat', c.phase, c.stride, c.tail, c.sit);
    buffer.updateFloat4('htLegs', l[0], l[1], l[2], l[3]);
    buffer.updateFloat4('htPose', c.lie, 0, 0, 0);
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
            // Lying: all legs tucked under, the front paws stretched out a little.
            positionUpdated.y = mix(positionUpdated.y, .21 - (.21 - positionUpdated.y) * .12, htPose.x);
            positionUpdated.z += htPose.x * htDown * (htPart < 2.5 ? .11 : .04);
          } else if (htPart > 4.5) {
            float htT = clamp(length(positionUpdated - vec3(0., .29, -.19)) / .34, 0., 1.);
            positionUpdated.x += sin(htCat.z - htT * 2.6) * .1 * htT * htT * (1. - .6 * htPose.x);
            // Lying: the tail curls round along the body.
            positionUpdated.x += htPose.x * .2 * htT;
            positionUpdated.y -= htPose.x * .17 * htT;
            positionUpdated.z += htPose.x * .14 * htT * htT;
          }
        }
        #endif`,
    };
  }
}

// ---------------------------------------------------------------- geometry

function buildCat(scene: Scene): Mesh {
  const fur = new Color3(.86, .55, .26), light = new Color3(.97, .89, .76), dark = new Color3(.56, .32, .14);
  const pink = new Color3(.93, .58, .6), iris = new Color3(.58, .78, .2), pupil = new Color3(.05, .05, .04);
  const parts: { mesh: Mesh; part: number; color: Color3; stripes?: boolean }[] = [];
  const add = (mesh: Mesh, part: number, color: Color3, at: Vector3, scale?: Vector3, rotation?: Vector3, stripes = false) => {
    mesh.position.copyFrom(at);
    if (scale) mesh.scaling.copyFrom(scale);
    if (rotation) mesh.rotation.copyFrom(rotation);
    parts.push({ mesh, part, color, stripes });
  };
  const sphere = (name: string, segments = 7) => MeshBuilder.CreateSphere(name, { diameter: 1, segments }, scene);
  add(sphere('cat-body', 9), 0, fur, new Vector3(0, .27, 0), new Vector3(.17, .17, .4), undefined, true);
  add(sphere('cat-chest'), 0, light, new Vector3(0, .3, .16), new Vector3(.13, .15, .14));
  add(sphere('cat-head', 9), 0, fur, new Vector3(0, .43, .25), new Vector3(.19, .17, .175), undefined, true);
  add(sphere('cat-cheeks'), 0, light, new Vector3(0, .395, .29), new Vector3(.15, .08, .09));
  add(sphere('cat-muzzle'), 0, light, new Vector3(0, .4, .325), new Vector3(.08, .06, .05));
  add(sphere('cat-nose', 5), 0, pink, new Vector3(0, .424, .352), new Vector3(.026, .018, .018));
  for (const side of [-1, 1]) {
    add(sphere('cat-eye'), 0, iris, new Vector3(side * .046, .455, .322), new Vector3(.046, .05, .026));
    add(sphere('cat-pupil', 5), 0, pupil, new Vector3(side * .046, .455, .334), new Vector3(.015, .04, .01));
    add(MeshBuilder.CreateCylinder('cat-ear', { diameterTop: 0, diameterBottom: .07, height: .08, tessellation: 4 }, scene), 0, dark,
      new Vector3(side * .055, .52, .235), undefined, new Vector3(0, Math.PI / 4, side * -.3));
    add(MeshBuilder.CreateCylinder('cat-ear-inner', { diameterTop: 0, diameterBottom: .042, height: .055, tessellation: 4 }, scene), 0, pink,
      new Vector3(side * .053, .513, .249), undefined, new Vector3(0, Math.PI / 4, side * -.3));
  }
  // Legs: 1 front left, 2 front right, 3 hind left, 4 hind right; each with a paw.
  [[.055, .13], [-.055, .13], [.06, -.14], [-.06, -.14]].forEach(([x, z], i) => {
    add(MeshBuilder.CreateCylinder('cat-leg', { diameterTop: .05, diameterBottom: .038, height: .21, tessellation: 6, subdivisions: 3 }, scene), i + 1, i < 2 ? light : fur, new Vector3(x, .115, z));
    add(sphere('cat-paw', 5), i + 1, light, new Vector3(x, .016, z + .012), new Vector3(.05, .032, .062));
  });
  const tailPath = [0, 1, 2, 3, 4, 5, 6].map(i => { const t = i / 6; return new Vector3(0, .29 + t * .2 + Math.sin(t * 2.4) * .04, -.19 - t * .27); });
  add(MeshBuilder.CreateTube('cat-tail', { path: tailPath, radiusFunction: i => .03 - i * .002, tessellation: 7, cap: Mesh.CAP_END }, scene), 5, fur, Vector3.Zero(), undefined, undefined, true);

  let merged: VertexData | null = null;
  const tags: number[] = [];
  for (const { mesh, part, color, stripes } of parts) {
    mesh.bakeCurrentTransformIntoVertices();
    const data = VertexData.ExtractFromMesh(mesh);
    const positions = data.positions ?? [];
    const count = positions.length / 3;
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // Tabby stripes across the back, the head and the tail.
      const y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      const stripe = stripes && y > .29 && Math.sin((z + y * .6) * 46) > .55 ? .72 : 1;
      colors.set([color.r * stripe, color.g * stripe, color.b * stripe, 1], i * 4);
      tags.push(part);
    }
    data.colors = colors;
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
  | { kind: 'sit' | 'lie'; time: number }
  | { kind: 'jump'; to: Vector3 }
  /** A short leap forward from wherever the cat is then. */
  | { kind: 'pounce' }
  | { kind: 'hide'; tree: Tree; time: number }
  | { kind: 'leave' };

interface Bird {
  pos: Vector3; vel: Vector3; state: 'fly' | 'land' | 'perch';
  target: Vector3; perch: Vector3 | null; timer: number; burst: number; hop: number;
  phase: number; freq: number; beat: number; fold: number; yaw: number; roll: number; peck: number;
}

export function createWildlife(scene: Scene, options: WildlifeOptions = {}): Wildlife {
  const courtyard = scene.metadata?.courtyard as Courtyard | undefined;
  const bounds = scene.metadata?.weatherBounds as { x: number; z: number; halfX: number; halfZ: number; groundY: number } | undefined;
  if (!courtyard?.treeCenter || !bounds) return { visit() {}, stage: null, dispose() {} };
  const groundY = bounds.groundY;

  const allTrees: Tree[] = [...(courtyard.trees ?? []), ...((scene.metadata?.parkTrees as Tree[] | undefined) ?? [])];
  const groveTrees = (courtyard.trees ?? []).filter(t => t.trunk > .3);
  const obstacles = courtyard.obstacles ?? [];
  const seats = courtyard.seats ?? [];
  const weather = () => (scene.metadata?.outdoorWeather as OutdoorWeather | undefined) ?? { clouds: 0, wet: 0, snow: 0, fog: 0 };
  const night = () => (scene.metadata?.sunAltitudeDeg ?? 30) < -4;
  const badWeather = () => { const w = weather(); return w.wet > 0 || w.snow > 0; };
  const ground = (x: number, z: number) => new Vector3(x, groundY, z);
  const flat = (v: Vector3) => new Vector3(v.x, groundY, v.z);
  const cameraPos = () => scene.activeCamera?.globalPosition ?? courtyard.benchCenter;

  // The courtyard axis (grove → play area) and the side away from the flat: entries, exits, lawn.
  const axis = courtyard.playCenter.subtract(courtyard.treeCenter); axis.y = 0; axis.normalize();
  let away = new Vector3(-axis.z, 0, axis.x);
  const middle = Vector3.Lerp(courtyard.treeCenter, courtyard.playCenter, .5);
  if (Vector3.Dot(away, middle.subtract(new Vector3(bounds.x, 0, bounds.z))) < 0) away = away.scale(-1);
  const exits = [
    flat(courtyard.treeCenter.subtract(axis.scale(17))),
    flat(courtyard.playCenter.add(axis.scale(15))),
    flat(middle.add(away.scale(22))),
  ];

  // ---- obstacles and routes
  const margin = .35;
  const inBox = (p: Vector3, o: Obstacle, m: number) => Math.abs(p.x - o.x) < o.halfX + m && Math.abs(p.z - o.z) < o.halfZ + m;
  const blockedBy = (p: Vector3, m = margin): Obstacle | Tree | null =>
    obstacles.find(o => inBox(p, o, m)) ?? groveTrees.find(t => Math.hypot(p.x - t.x, p.z - t.z) < t.trunk + m) ?? null;
  /** A free ground point near p (pushed out of benches and trunks). */
  const free = (p: Vector3) => {
    const at = flat(p);
    for (let i = 0; i < 4; i++) {
      const hit = blockedBy(at, margin + .05);
      if (!hit) break;
      if ('halfX' in hit) {
        const dx = at.x - hit.x, dz = at.z - hit.z;
        if (hit.halfX + margin - Math.abs(dx) < hit.halfZ + margin - Math.abs(dz)) at.x = hit.x + Math.sign(dx || 1) * (hit.halfX + margin + .1);
        else at.z = hit.z + Math.sign(dz || 1) * (hit.halfZ + margin + .1);
      } else {
        const d = new Vector3(at.x - hit.x, 0, at.z - hit.z); if (d.lengthSquared() < 1e-4) d.set(1, 0, 0);
        d.normalize(); at.x = hit.x + d.x * (hit.trunk + margin + .1); at.z = hit.z + d.z * (hit.trunk + margin + .1);
      }
    }
    return at;
  };
  const segmentHit = (a: Vector3, b: Vector3) => {
    const n = Math.ceil(Vector3.Distance(a, b) / .2);
    for (let i = 1; i < n; i++) { const hit = blockedBy(Vector3.Lerp(a, b, i / n)); if (hit) return hit; }
    return null;
  };
  /** Waypoints around benches and trunks (corners of the widened bench, sides of a trunk). */
  const route = (from: Vector3, to: Vector3): Vector3[] => {
    const path: Vector3[] = [];
    let at = flat(from);
    for (let i = 0; i < 4; i++) {
      const hit = segmentHit(at, to);
      if (!hit) break;
      const m = margin + .25;
      const corners = 'halfX' in hit
        ? [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => ground(hit.x + sx * (hit.halfX + m), hit.z + sz * (hit.halfZ + m)))
        : (() => { const d = to.subtract(at); const side = new Vector3(-d.z, 0, d.x).normalize().scale(hit.trunk + m + .2); return [ground(hit.x + side.x, hit.z + side.z), ground(hit.x - side.x, hit.z - side.z)]; })();
      const usable = corners.filter(c => !blockedBy(c, margin * .8) && !segmentHit(at, c));
      const options = usable.length ? usable : corners;
      const best = options.reduce((b, c) => Vector3.Distance(at, c) + Vector3.Distance(c, to) < Vector3.Distance(at, b) + Vector3.Distance(b, to) ? c : b);
      path.push(best); at = best;
    }
    path.push(flat(to));
    return path;
  };

  // ---- cat
  const cat = buildCat(scene);
  const catMaterial = new StandardMaterial('wildlife-cat-material', scene);
  catMaterial.specularColor = new Color3(.08, .08, .08);
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
    present: false, away: new URLSearchParams(location.search).has('wildlife') ? 1 : rand(12, 35), pos: Vector3.Zero(), heading: 0, speed: 0,
    steps: [] as CatStep[], step: null as CatStep | null, path: [] as Vector3[], timer: 0, jumpFrom: Vector3.Zero(), jumpT: 0,
    height: 0, sit: 0, lie: 0, swish: 0, nextSwish: 3, sheltering: false, arrived: false, stuck: 0,
  };
  const spots = () => [courtyard.treeCenter, courtyard.playCenter, courtyard.benchCenter, courtyard.playBenchCenter, middle]
    .map(p => free(ground(p.x + rand(-3.5, 3.5), p.z + rand(-3.5, 3.5))));
  const shelterTree = () => groveTrees.length ? groveTrees.reduce((best, t) => Vector3.Distance(flat(catState.pos), ground(t.x, t.z)) < Vector3.Distance(flat(catState.pos), ground(best.x, best.z)) ? t : best) : null;
  /** Behind a trunk as seen from the camera. */
  const behind = (tree: Tree) => {
    const cam = cameraPos(), dir = new Vector3(tree.x - cam.x, 0, tree.z - cam.z).normalize();
    return ground(tree.x + dir.x * (tree.trunk + .3 * CAT_SCALE), tree.z + dir.z * (tree.trunk + .3 * CAT_SCALE));
  };
  /** Jump onto a bench, seat or post, lie or sit there a while, jump down again. */
  const chill = (seat: Vector3, long = false): CatStep[] => {
    const side = Math.random() < .5 ? 1 : -1;
    const below = free(ground(seat.x + side * 1.15, seat.z + rand(-.6, .6)));
    const lieFirst = seat.y - groundY < 1 || long;
    return [
      { kind: 'walk', to: below }, { kind: 'sit', time: rand(.6, 1.2) }, { kind: 'jump', to: seat.clone() },
      ...(lieFirst ? [{ kind: 'lie', time: long ? rand(28, 40) : rand(10, 24) } as CatStep, { kind: 'sit', time: rand(3, 6) } as CatStep] : [{ kind: 'sit', time: rand(6, 12) } as CatStep]),
      { kind: 'jump', to: free(ground(seat.x - side * 1.2, seat.z + rand(-.6, .6))) },
    ];
  };
  const planVisit = (): CatStep[] => {
    const steps: CatStep[] = [];
    const count = Math.round(rand(4, 7));
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r < .38 && seats.length) steps.push(...chill(pick(seats)));
      else if (r < .55) steps.push({ kind: 'walk', to: pick(spots()) }, { kind: 'sit', time: rand(4, 9) });
      else if (r < .68) steps.push({ kind: 'run', to: pick(spots()) }, { kind: 'sit', time: rand(2, 4) });
      else if (r < .84 && groveTrees.length) steps.push({ kind: 'hide', tree: pick(groveTrees), time: rand(5, 10) });
      else {
        // A pounce: crouch, then a short leap forward.
        steps.push({ kind: 'sit', time: rand(1.5, 3) }, { kind: 'pounce' }, { kind: 'run', to: pick(spots()) });
      }
    }
    steps.push({ kind: 'leave' });
    return steps;
  };

  const show = (on: boolean) => { cat.setEnabled(on); blob.setEnabled(on); };
  const arrive = (from: Vector3, steps: CatStep[]) => {
    const s = catState;
    s.pos.copyFrom(from); s.heading = Math.atan2(middle.x - from.x, middle.z - from.z);
    s.present = true; s.steps = steps; s.step = null; s.height = 0; s.sit = 0; s.lie = 0; s.sheltering = false;
    show(true);
  };

  /** Follows the current route; true when the target is reached. */
  const follow = (speed: number, dt: number) => {
    const s = catState, next = s.path[0];
    if (!next) { s.speed = 0; return true; }
    const dx = next.x - s.pos.x, dz = next.z - s.pos.z, dist = Math.hypot(dx, dz);
    if (dist < .12) { s.path.shift(); return follow(speed, dt); }
    let diff = Math.atan2(dx, dz) - s.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.heading += Math.max(-dt * 6, Math.min(dt * 6, diff));
    s.speed += (speed - s.speed) * Math.min(1, dt * 4);
    // Turn on the spot first when the waypoint lies behind.
    const step = Math.min(dist, s.speed * dt * Math.max(0, Math.cos(diff)));
    s.pos.x += Math.sin(s.heading) * step; s.pos.z += Math.cos(s.heading) * step;
    // Never stuck: after a while without progress the cat simply goes on to the target.
    s.stuck = step < .002 && Math.abs(diff) < .2 ? s.stuck + dt : 0;
    if (s.stuck > 1.5) { s.path = [s.path[s.path.length - 1]]; s.stuck = 0; }
    return false;
  };
  const startPath = (to: Vector3) => { catState.path = route(catState.pos, to); };

  const updateCat = (dt: number) => {
    const s = catState;
    if (!s.present) {
      s.away -= dt;
      if (s.away > 0) return false;
      // Fewer visits at night, none in rain or snow.
      if (badWeather() || night() && Math.random() < .6) { s.away = rand(40, 90); return false; }
      arrive(pick(exits), planVisit());
    }
    // Rain or snow: run for the nearest big tree and wait there until it is dry.
    if (badWeather() && !s.sheltering) {
      const tree = shelterTree();
      s.sheltering = true;
      s.steps = [...(s.height > .05 ? [{ kind: 'jump', to: free(ground(s.pos.x - 1.2, s.pos.z)) } as CatStep] : []),
        ...(tree ? [{ kind: 'run', to: behind(tree) } as CatStep, { kind: 'sit', time: 1e9 } as CatStep] : [{ kind: 'leave' } as CatStep])];
      s.step = null;
    } else if (!badWeather() && s.sheltering) {
      s.sheltering = false; s.steps = [{ kind: 'walk', to: pick(spots()) }, { kind: 'leave' }]; s.step = null;
    }
    if (!s.step) {
      s.step = s.steps.shift() ?? { kind: 'leave' };
      if (s.step.kind === 'pounce') s.step = { kind: 'jump', to: free(s.pos.add(new Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)).scale(1.4))) }; s.timer = 0; s.jumpT = 0; s.arrived = false; s.stuck = 0;
      s.jumpFrom = s.pos.clone(); s.jumpFrom.y = s.height;
      const step = s.step;
      if (step.kind === 'walk' || step.kind === 'run') startPath(step.to);
      else if (step.kind === 'hide') startPath(behind(step.tree));
      else if (step.kind === 'leave') startPath(exits.reduce((best, e) => Vector3.Distance(s.pos, e) < Vector3.Distance(s.pos, best) ? e : best));
    }
    const step = s.step;
    let moving = false, sitTarget = 0, lieTarget = 0, stride = 0, gallop = false;
    s.timer += dt;
    switch (step.kind) {
      case 'walk': case 'run': {
        const run = step.kind === 'run';
        if (follow((run ? 3.2 : .75) * CAT_SCALE * .8, dt)) s.step = null;
        moving = true; stride = run ? 1 : .75; gallop = run;
        break;
      }
      case 'sit':
        sitTarget = 1;
        if (s.timer > step.time) s.step = null;
        break;
      case 'lie':
        lieTarget = 1;
        if (s.timer > step.time) s.step = null;
        break;
      case 'hide': {
        if (!s.arrived) {
          if (follow(2.4 * CAT_SCALE * .8, dt)) { s.arrived = true; s.timer = 0; } else { moving = true; stride = 1; gallop = true; }
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
        if (s.jumpT === 0) s.heading = Math.atan2(step.to.x - from.x, step.to.z - from.z) || s.heading;
        s.jumpT = Math.min(1, s.jumpT + dt / Math.max(.35, .25 + distance * .12));
        const t = s.jumpT, y0 = from.y, y1 = step.to.y - groundY, top = Math.max(y0, y1) + .25 + distance * .12;
        s.pos.x = from.x + (step.to.x - from.x) * t; s.pos.z = from.z + (step.to.z - from.z) * t;
        // Parabola through start height, apex and landing height.
        s.height = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (2 * top - (y0 + y1) / 2) + t * t * y1;
        moving = true;
        if (t >= 1) { s.height = y1; s.step = null; }
        break;
      }
      case 'leave': {
        if (s.height > .05) { s.steps.unshift({ kind: 'jump', to: free(ground(s.pos.x - 1.2, s.pos.z)) }, { kind: 'leave' }); s.step = null; break; }
        moving = true; stride = .75;
        if (follow(.95 * CAT_SCALE * .8, dt)) {
          s.present = false; s.away = night() ? rand(120, 260) : rand(50, 130);
          show(false);
          return false;
        }
      }
    }
    // Gait and pose.
    const k = Math.min(1, dt * 5);
    s.sit += (sitTarget - s.sit) * k;
    s.lie += (lieTarget - s.lie) * Math.min(1, dt * 3);
    gait.legs = gallop ? [0, .5, Math.PI, Math.PI + .5] : [0, Math.PI, Math.PI, 0];
    gait.cat.stride += (stride * Math.min(1, s.speed / .3) - gait.cat.stride) * Math.min(1, dt * 6);
    gait.cat.phase += s.speed * dt / (.3 * CAT_SCALE) * Math.PI;
    gait.cat.sit = s.sit; gait.cat.lie = s.lie;
    // The tail swishes in short bursts while resting (a still cat lets the render loop rest).
    let tailMoving = moving;
    if (!moving) {
      s.nextSwish -= dt;
      if (s.nextSwish < 0) { s.swish = rand(1.2, 2.4); s.nextSwish = lieTarget ? rand(8, 16) : rand(5, 11); }
      if (s.swish > 0) { s.swish -= dt; tailMoving = true; }
    }
    if (tailMoving) gait.cat.tail += dt * (moving ? 5 : 3);

    cat.position.set(s.pos.x, groundY + s.height - .165 * s.lie * CAT_SCALE, s.pos.z);
    cat.rotation.set(-.42 * s.sit + (step.kind === 'jump' ? -.25 * Math.cos(s.jumpT * Math.PI) : 0), s.heading, 0);
    blob.position.set(s.pos.x + Math.sin(s.heading) * .05, groundY + (s.height > .4 ? s.height : 0) + .015, s.pos.z + Math.cos(s.heading) * .05);
    blob.rotation.y = s.heading;
    return moving || tailMoving || Math.abs(sitTarget - s.sit) > .01 || Math.abs(lieTarget - s.lie) > .01;
  };

  // ---- birds
  // Lawn in front of the flat (towards the courtyard): visible from the plan view.
  const toYard = middle.subtract(new Vector3(bounds.x, 0, bounds.z)); toYard.y = 0; toYard.normalize();
  const edge = Math.min(bounds.halfX / Math.max(.01, Math.abs(toYard.x)), bounds.halfZ / Math.max(.01, Math.abs(toYard.z)));
  const lawn: Vector3[] = [];
  for (let i = 0; i < 12; i++) {
    const p = free(ground(bounds.x + toYard.x * (edge + rand(2.5, 9)) + away.x * rand(-9, 9), bounds.z + toYard.z * (edge + rand(2.5, 9)) + away.z * rand(-9, 9)));
    lawn.push(p);
  }
  const benchLawn = [courtyard.benchCenter, courtyard.playCenter].flatMap(c => [0, 1, 2].map(() => free(ground(c.x + rand(-4, 4), c.z + rand(-4, 4)))));
  const groundPerches = new Set<Vector3>([...lawn, ...benchLawn]);
  const perches = [...allTrees.flatMap(t => t.perches), ...groundPerches];
  const count = perches.length ? (options.reduced ? 6 : 12) : 0;
  const birdMesh = buildBird(scene);
  const birdMaterial = new StandardMaterial('wildlife-bird-material', scene);
  birdMaterial.diffuseColor = new Color3(.25, .23, .21); birdMaterial.specularColor = Color3.Black(); birdMaterial.backFaceCulling = false;
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
  const skyTarget = (): Vector3 => {
    // Often across the flat itself, a few metres above the roof: visible from the plan view too.
    if (Math.random() < .4) return new Vector3(bounds.x + rand(-1, 1) * bounds.halfX, groundY + rand(9, 15), bounds.z + rand(-1, 1) * bounds.halfZ);
    for (let i = 0; ; i++) {
      const p = new Vector3(flightCenter.x + rand(-28, 28), groundY + rand(4, 22), flightCenter.z + rand(-28, 28));
      if (!canopy(p) || i > 20) return p;
    }
  };
  const freePerch = (from?: Vector3[]) => { const free = (from ?? perches).filter(p => !occupied.has(p)); return free.length ? pick(free) : null; };
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const perch = i % 2 === 0 ? freePerch() : null;
    if (perch) occupied.add(perch);
    const pos = perch ? perch.clone() : skyTarget();
    birds.push({ pos, vel: new Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().scale(6), state: perch ? 'perch' : 'fly', target: skyTarget(), perch,
      timer: perch ? rand(3, 25) : rand(8, 25), burst: rand(0, 1), hop: rand(1, 4), phase: rand(0, TAU), freq: rand(15, 19), beat: 0, fold: perch ? 1 : 0, yaw: rand(0, TAU), roll: 0, peck: 0 });
  }
  if (count) {
    birdMesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
    birdMesh.thinInstanceSetBuffer('htFlap', flaps, 4, false);
  } else birdMesh.setEnabled(false);
  const scale = new Vector3(BIRD_SCALE, BIRD_SCALE, BIRD_SCALE), rotation = new Quaternion(), matrix = new Matrix();

  const land = (b: Bird, perch: Vector3) => { if (b.perch) occupied.delete(b.perch); occupied.add(perch); b.perch = perch; b.state = 'land'; b.target = perch; };
  /** Returns whether the bird visibly moves this step. */
  const updateBird = (b: Bird, dt: number) => {
    // Night, rain and snow: into the trees (not onto the lawn) and stay there.
    const grounded = night() || badWeather();
    if (b.state === 'perch') {
      b.beat = 0; b.fold += (1 - b.fold) * Math.min(1, dt * 6);
      if (!grounded && b.timer > 1e8) b.timer = rand(2, 15);
      if (grounded && b.perch && groundPerches.has(b.perch)) b.timer = 0;
      b.timer -= dt;
      let moved = false;
      // On the lawn: peck now and then, hop a little.
      if (b.perch && groundPerches.has(b.perch)) {
        b.hop -= dt;
        if (b.hop < 0) { b.hop = rand(1.2, 3.5); b.yaw += rand(-1.2, 1.2); b.peck = .6; b.pos.addInPlace(new Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)).scale(.12)); moved = true; }
        if (b.peck > 0) { b.peck -= dt; moved = true; }
      }
      if (b.timer < 0) {
        if (b.perch) occupied.delete(b.perch);
        b.perch = null; b.state = 'fly'; b.target = skyTarget(); b.timer = rand(8, 26);
        b.vel.set(Math.sin(b.yaw) * 2, 3.5, Math.cos(b.yaw) * 2);
        return true;
      }
      return moved;
    }
    b.timer -= dt;
    if (b.state === 'fly' && (b.timer < 0 || grounded)) {
      const perch = freePerch(grounded ? allTrees.flatMap(t => t.perches) : undefined);
      if (perch) land(b, perch); else b.timer = rand(4, 8);
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
      b.pos.copyFrom(b.target); b.vel.setAll(0); b.state = 'perch'; b.roll = 0; b.peck = 0;
      b.timer = grounded ? 1e9 : groundPerches.has(b.target) ? rand(8, 22) : rand(6, 30);
    }
    return true;
  };

  // ---- loop
  let last = performance.now(), time = 0;
  const point = new Vector3();
  const moving = new Array<boolean>(count).fill(false);
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
      birds.forEach((b, i) => { moving[i] = updateBird(b, step) || (dt > 0 && moving[i]); });
    }
    birds.forEach((b, i) => {
      if (moving[i] && inView(b.pos)) animating = true;
      const pitch = b.state === 'perch' ? (b.peck > 0 ? .55 : 0) : -Math.asin(Math.max(-.6, Math.min(.6, b.vel.y / Math.max(.1, b.vel.length()))));
      Quaternion.RotationYawPitchRollToRef(b.yaw, pitch, b.roll, rotation);
      // Perched birds sit on their feet: a little above the perch point.
      point.copyFrom(b.pos); if (b.state === 'perch') point.y += .02 * BIRD_SCALE;
      Matrix.ComposeToRef(scale, rotation, point, matrix);
      matrix.copyToArray(matrices, i * 16);
      flaps.set([b.phase, b.beat, b.fold, b.freq], i * 4);
    });
    if (count) { birdMesh.thinInstanceBufferUpdated('matrix'); birdMesh.thinInstanceBufferUpdated('htFlap'); }
    if (!!scene.metadata?.wildlifeAnimating !== animating) scene.metadata = { ...scene.metadata, wildlifeAnimating: animating };
  });

  // The first seat is the vent bench by the path (courtyard order).
  const stageSeat = seats[0] ?? null;
  const api: Wildlife = {
    stage: stageSeat ? flat(stageSeat) : flat(courtyard.benchCenter),
    visit() {
      // Straight to the vent bench, lie there for a while; three birds on the lawn nearby.
      const seat = stageSeat ?? courtyard.benchCenter;
      const from = exits.reduce((best, e) => Vector3.Distance(e, seat) < Vector3.Distance(best, seat) ? e : best);
      // Close by already, so a camera on the bench sees it arrive within a few seconds.
      const start = Vector3.Lerp(from, flat(seat), .85);
      arrive(free(start), [...chill(seat, true), { kind: 'hide', tree: groveTrees[0] ?? { x: seat.x, z: seat.z, trunk: .4, perches: [] }, time: 5 }, { kind: 'leave' }]);
      const near = benchLawn.filter(p => Vector3.Distance(p, seat) < 7);
      birds.slice(0, 3).forEach(b => { const perch = freePerch(near); if (perch) { if (b.state === 'perch') { b.state = 'fly'; b.vel.set(0, 3, 0); } land(b, perch); } });
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const m of [cat, blob, birdMesh]) m.dispose();
      for (const m of [catMaterial, blobMaterial, birdMaterial]) m.dispose();
      if (scene.metadata) scene.metadata = { ...scene.metadata, wildlifeAnimating: false };
    },
  };
  if (import.meta.env?.DEV) (window as Window & { __wildlife?: Wildlife }).__wildlife = api;
  return api;
}
