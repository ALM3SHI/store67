/**
 * Lightweight three.js viewer: environment lighting, soft contact shadow,
 * orbit/drag rotation, tap interactions, and a render loop that sleeps when
 * the canvas is off-screen or the tab is hidden.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildBuiltinModel, disposeObject, BUILTIN_MODELS, type BuiltinModel, type BuiltModel } from "./models";

export type ViewerOptions = {
  /** "builtin:<key>" or a URL to a .glb/.gltf file */
  source: string;
  autoRotate: boolean;
  interactive: boolean;
  reducedMotion: boolean;
  accent: string;
  /** "dark" stage or "light" paper background — tunes the shadow */
  tone: "dark" | "light";
  /** Starting camera angle around the model (radians) */
  azimuth?: number;
  elevation?: number;
  preserveDrawingBuffer?: boolean;
  /** Start interactive models in their "open"/active state (renders, posters) */
  startOpen?: boolean;
  onReady?: () => void;
  onError?: (e: unknown) => void;
};

export type Viewer = {
  dispose: () => void;
  hint: BuiltModel["hint"];
  renderOnce: () => void;
  setView: (azimuth: number, elevation: number) => void;
  /** Rotate around the model (keyboard support) */
  nudge: (dAzimuth: number) => void;
  /** Trigger the model's interaction (keyboard Enter/Space) */
  activate: () => void;
};

export function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function shadowTexture(strength: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgba(0,0,0,${strength})`);
  grad.addColorStop(0.5, `rgba(0,0,0,${strength * 0.45})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

async function loadModel(source: string, o: ViewerOptions): Promise<BuiltModel> {
  if (source.startsWith("builtin:")) {
    const key = source.slice(8) as BuiltinModel;
    if (!BUILTIN_MODELS.includes(key)) throw new Error(`unknown model ${key}`);
    return buildBuiltinModel(key, { reducedMotion: o.reducedMotion, accent: o.accent, startOpen: o.startOpen });
  }
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(source);
  const group = new THREE.Group();
  group.add(gltf.scene);
  // Normalise any uploaded model: centred, resting on the ground, ~2 units wide
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const s = 2 / Math.max(size.x, size.y, size.z, 0.0001);
  group.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(group);
  const c = box2.getCenter(new THREE.Vector3());
  group.position.set(-c.x, -box2.min.y, -c.z);
  const wrap = new THREE.Group();
  wrap.add(group);
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(gltf.scene) : null;
  if (mixer && !o.reducedMotion) gltf.animations.forEach((a) => mixer.clipAction(a).play());
  return { group: wrap, update: mixer ? (dt) => mixer.update(dt) : undefined };
}

/**
 * Set once any viewer finds that WebGL runs without a GPU (software rendering)
 * or draws too slowly. Every viewer created afterwards starts in low-power mode.
 */
let lowPerf = false;
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render driver|mesa offscreen/i;

function detectSoftwareGL(renderer: THREE.WebGLRenderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return SOFTWARE_GL.test(name);
  } catch {
    return false;
  }
}

export async function createViewer(canvas: HTMLCanvasElement, o: ViewerOptions): Promise<Viewer> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPerf, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: o.preserveDrawingBuffer ?? false });
  if (!lowPerf && detectSoftwareGL(renderer)) lowPerf = true;
  renderer.setPixelRatio(lowPerf ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.tone === "dark" ? 1.05 : 0.95;

  const scene = new THREE.Scene();
  // The reflection environment is the most expensive part to build; software
  // WebGL takes seconds for it, so low-power mode lights the model with lamps only.
  const pmrem = lowPerf ? null : new THREE.PMREMGenerator(renderer);
  const envTex = pmrem ? pmrem.fromScene(new RoomEnvironment(), 0.04).texture : null;
  scene.environment = envTex;

  const key = new THREE.DirectionalLight("#ffffff", o.tone === "dark" ? 1.6 : 1.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(o.accent, o.tone === "dark" ? 1.1 : 0.4);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight("#ffffff", o.tone === "dark" ? "#0a0e14" : "#d9d4cb", lowPerf ? 2.2 : 0.6));

  let model: BuiltModel;
  try {
    model = await loadModel(o.source, o);
  } catch (e) {
    renderer.dispose();
    pmrem?.dispose();
    throw e;
  }
  scene.add(model.group);

  // Fit camera to the model
  const sphere = new THREE.Box3().setFromObject(model.group).getBoundingSphere(new THREE.Sphere());
  const shadowSize = sphere.radius * 2.6;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(shadowSize, shadowSize), new THREE.MeshBasicMaterial({ map: shadowTexture(o.tone === "dark" ? 0.75 : 0.32), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(sphere.center.x, 0.001, sphere.center.z);
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const target = sphere.center.clone();
  // A little headroom so moving parts (e.g. ejected wallet cards) stay in frame
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(30 / 2))) * 1.28;
  const setView = (az: number, el: number) => {
    camera.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);
  };
  setView(o.azimuth ?? 0.6, o.elevation ?? 0.42);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.45;
  controls.autoRotate = o.autoRotate && !o.reducedMotion && !lowPerf;
  controls.autoRotateSpeed = 1.1;
  controls.enabled = o.interactive;
  // Let the page scroll vertically on phones; horizontal drags rotate the model.
  canvas.style.touchAction = o.interactive ? "pan-y" : "auto";

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // Tap → model interaction (ignores drags)
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
  const onUp = (e: PointerEvent) => {
    if (!down || !model.tap) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 400;
    down = null;
    if (moved > 6 || !quick) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(model.group, true)[0];
    if (hit) {
      model.tap(hit.object);
      wake();
    }
  };
  if (o.interactive) {
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
  }

  // Render loop that sleeps off-screen and, when nothing moves, on-screen too:
  // with auto-rotation off it only runs for a few seconds after an interaction.
  let raf = 0;
  let visible = false;
  let elapsed = 0;
  let last = performance.now();
  let awakeUntil = 0;
  let inFrame = false;
  // Frame-cost guard: without GPU acceleration (software WebGL) a frame can take
  // 100ms+ and a continuous loop starves the page — buttons stop responding.
  // When frames are consistently slow we stop auto-rotation, drop the pixel
  // ratio, and only render while the visitor is actually moving the model.
  let slowFrames = 0;
  let measured = 0;
  let degraded = lowPerf;
  if (degraded) canvas.dataset.perf = "low";
  const degrade = () => {
    if (degraded) return;
    degraded = true;
    lowPerf = true;
    controls.autoRotate = false;
    renderer.setPixelRatio(1);
    resize();
    awakeUntil = 0;
    canvas.dataset.perf = "low";
  };
  const frame = () => {
    raf = 0;
    inFrame = true;
    const now = performance.now();
    const gap = now - last;
    const dt = Math.min(gap / 1000, 0.05);
    last = now;
    elapsed += dt;
    controls.update(dt);
    model.update?.(dt, elapsed);
    renderer.render(scene, camera);
    inFrame = false;
    const cost = performance.now() - now;
    // Only judge continuous frames (gap < 250ms), not the first one after a pause.
    if (!degraded && gap < 250) {
      measured++;
      if (cost > 45 || gap > 90) slowFrames++;
      if (measured >= 12 && slowFrames / measured > 0.6) degrade();
      if (measured > 60) {
        measured = 0;
        slowFrames = 0;
      }
    }
    const moving = controls.autoRotate || performance.now() < awakeUntil;
    if (visible && !document.hidden && moving) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    awakeUntil = performance.now() + (degraded ? 600 : 4000);
    // Inside a frame the loop reschedules itself; never queue a second callback
    if (!raf && !inFrame && visible && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) wake();
  });
  io.observe(canvas);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  controls.addEventListener("start", wake);
  controls.addEventListener("change", wake);

  renderer.render(scene, camera);
  o.onReady?.();

  return {
    hint: model.hint,
    renderOnce: () => {
      controls.update();
      model.update?.(0.016, elapsed);
      renderer.render(scene, camera);
    },
    setView: (az, el) => {
      setView(az, el);
      controls.update();
      renderer.render(scene, camera);
    },
    nudge: (d) => {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), d);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      wake();
      renderer.render(scene, camera);
    },
    activate: () => {
      if (model.tap) {
        model.tap(model.group);
        wake();
      }
    },
    dispose: () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      controls.dispose();
      disposeObject(scene);
      envTex?.dispose();
      pmrem?.dispose();
      renderer.dispose();
    },
  };
}
