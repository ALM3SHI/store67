/**
 * Procedural 3D models of the store's products (three.js, no external assets).
 *
 * Each builder returns a group resting on y = 0 plus optional behaviour:
 *  - update(dt):  per-frame animation
 *  - tap(object): reaction to a click/tap on part of the model
 *
 * These are *illustrative* models of the product designs. A real scanned or
 * CAD model (.glb) can replace any of them from the admin (Products → 3D model).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type BuiltModel = {
  group: THREE.Group;
  update?: (dt: number, t: number) => void;
  tap?: (obj: THREE.Object3D) => boolean;
  /** Human hint for the interaction, if any */
  hint?: { ar: string; en: string };
};

export type ModelOptions = { reducedMotion: boolean; accent: string; startOpen?: boolean };

export const BUILTIN_MODELS = ["magcharge", "scalp-massager", "smart-wallet"] as const;
export type BuiltinModel = (typeof BUILTIN_MODELS)[number];

/* ───────────── shared helpers */
function textTexture(text: string, opts: { color: string; size?: number; weight?: number; font?: string } = { color: "#9aa3ae" }) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = opts.color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${opts.weight ?? 500} ${opts.size ?? 120}px ${opts.font ?? "'Readex Pro', Arial, sans-serif"}`;
  g.fillText(text, 256, 262);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function material(kind: "aluminium" | "graphite" | "softTouch" | "glossWhite" | "greyPlastic" | "silicone" | "braid" | "leather", color?: string) {
  switch (kind) {
    case "aluminium":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#c9ced5", metalness: 1, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    case "graphite":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#3b4048", metalness: 0.85, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    case "softTouch":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#141a22", metalness: 0, roughness: 0.82, sheen: 0.4, sheenColor: new THREE.Color("#2a3442") });
    case "glossWhite":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#f2f3f5", metalness: 0, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.18 });
    case "greyPlastic":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#9aa0a8", metalness: 0.05, roughness: 0.5 });
    case "silicone":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#8f969e", metalness: 0, roughness: 0.72, sheen: 0.3 });
    case "braid":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#262c35", metalness: 0.1, roughness: 0.62, sheen: 0.6, sheenColor: new THREE.Color("#4b5563") });
    case "leather":
      return new THREE.MeshPhysicalMaterial({ color: color ?? "#2b2420", metalness: 0, roughness: 0.68, sheen: 0.5, sheenColor: new THREE.Color("#5b4a40") });
  }
}

function sitOnGround(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
}

/* ───────────── MagCharge 76 — magnetic wireless charger puck */
function magcharge(o: ModelOptions): BuiltModel {
  const group = new THREE.Group();
  group.name = "magcharge";

  // Aluminium body (lathe profile with rounded edges)
  const profile = [
    [0, 0],
    [0.9, 0],
    [0.965, 0.012],
    [0.995, 0.05],
    [1.0, 0.1],
    [0.998, 0.17],
    [0.985, 0.205],
    [0.96, 0.226],
    [0.92, 0.234],
    [0.885, 0.228],
    [0.88, 0.212],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), material("aluminium"));
  group.add(body);

  // Soft-touch top
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.882, 0.882, 0.02, 128), material("softTouch"));
  top.position.y = 0.212;
  group.add(top);

  // Engraved "76"
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshBasicMaterial({ map: textTexture("76", { color: "#7f8894", size: 132 }), transparent: true, opacity: 0.75, toneMapped: false }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.2225;
  group.add(label);

  // Status light ring
  const ringMat = new THREE.MeshStandardMaterial({ color: o.accent, emissive: new THREE.Color(o.accent), emissiveIntensity: 1.6, roughness: 0.3, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.855, 0.016, 16, 192), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.224;
  group.add(ring);

  // Cable with strain relief
  const relief = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 32), material("aluminium"));
  relief.rotation.z = Math.PI / 2;
  relief.position.set(1.06, 0.11, 0);
  group.add(relief);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.12, 0.11, 0),
    new THREE.Vector3(1.45, 0.06, 0.05),
    new THREE.Vector3(1.7, 0.035, 0.3),
    new THREE.Vector3(1.8, 0.035, 0.75),
    new THREE.Vector3(1.6, 0.035, 1.15),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.034, 16, false), material("braid"));
  group.add(cable);

  sitOnGround(group);
  group.position.x += 0.3; // keep the puck, not the cable, at the visual centre

  return {
    group,
    update: o.reducedMotion
      ? undefined
      : (_dt, t) => {
          ringMat.emissiveIntensity = 1.2 + Math.sin(t * 1.6) * 0.6; // gentle "charging" breath
        },
  };
}

/* ───────────── Scalp massager — dome body with four rotating silicone heads */
function scalpMassager(o: ModelOptions): BuiltModel {
  const group = new THREE.Group();
  group.name = "scalp-massager";
  const SX = 1.15;
  const SZ = 0.95;
  const BASE = 0.42;

  // White glossy dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), material("glossWhite"));
  dome.scale.set(SX, 0.72, SZ);
  dome.position.y = BASE;
  group.add(dome);

  // Grey band
  const bandProfile = [
    [0.86, 0.14],
    [0.95, 0.16],
    [1.0, 0.22],
    [1.012, 0.3],
    [1.004, 0.38],
    [1.0, BASE + 0.001],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const band = new THREE.Mesh(new THREE.LatheGeometry(bandProfile, 128), material("greyPlastic", "#7a818b"));
  band.scale.set(SX, 1, SZ);
  group.add(band);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.87, 96), material("greyPlastic", "#7d848d"));
  bottom.rotation.x = Math.PI / 2;
  bottom.scale.set(SX, SZ, 1);
  bottom.position.y = 0.14;
  group.add(bottom);

  // Power button on the dome surface (tap to switch on/off)
  const a = 0.36;
  const p = new THREE.Vector3(0, BASE + 0.72 * Math.cos(a), -SZ * Math.sin(a));
  const normal = new THREE.Vector3(0, Math.cos(a) / 0.72, -Math.sin(a) / SZ).normalize();
  const button = new THREE.Group();
  const btnMat = new THREE.MeshPhysicalMaterial({ color: "#7a818b", roughness: 0.4, emissive: new THREE.Color(o.accent), emissiveIntensity: 0 });
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.045, 48), btnMat);
  btn.name = "power-button";
  button.add(btn);
  const icon = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 32, Math.PI * 1.55), new THREE.MeshStandardMaterial({ color: "#6b727c" }));
  icon.rotation.x = -Math.PI / 2;
  icon.rotation.z = -Math.PI / 2 + Math.PI * 0.225;
  icon.position.y = 0.024;
  button.add(icon);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.05), new THREE.MeshStandardMaterial({ color: "#6b727c" }));
  bar.position.set(0, 0.025, -0.03);
  button.add(bar);
  button.position.copy(p);
  button.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.add(button);

  // Four silicone heads
  const heads: THREE.Group[] = [];
  const sil = material("silicone", "#5b626b");
  const nubGeo = new THREE.CapsuleGeometry(0.036, 0.19, 6, 12);
  const positions: [number, number][] = [
    [0.6, 0.48],
    [-0.6, 0.48],
    [0.6, -0.48],
    [-0.6, -0.48],
  ];
  for (const [x, z] of positions) {
    const head = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.26, 32), sil);
    stem.position.y = 0.1;
    head.add(stem);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.07, 48), sil);
    disc.position.y = -0.02;
    head.add(disc);
    const rings: [number, number, number][] = [
      [0.21, 12, 0.5],
      [0.11, 6, 0.25],
    ];
    for (const [r, n, tilt] of rings) {
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const nub = new THREE.Mesh(nubGeo, sil);
        nub.position.set(Math.cos(ang) * r, -0.15, Math.sin(ang) * r);
        nub.rotation.set(Math.sin(ang) * tilt, 0, -Math.cos(ang) * tilt);
        head.add(nub);
      }
    }
    head.position.set(x, 0.0, z);
    // tilt each head outward like the real product
    head.rotation.set(z * 0.55, 0, -x * 0.5);
    const spinner = new THREE.Group();
    spinner.add(head);
    spinner.position.set(0, 0.0, 0);
    group.add(spinner);
    heads.push(head);
  }

  sitOnGround(group);

  let on = !o.reducedMotion;
  let speed = on ? 1 : 0;
  const setOn = (v: boolean) => {
    on = v;
  };
  btnMat.emissiveIntensity = on ? 0.6 : 0;

  return {
    group,
    hint: { ar: "اضغط الزر لتشغيل الرؤوس", en: "Tap the button to start the heads" },
    update: (dt) => {
      speed += ((on ? 1 : 0) - speed) * Math.min(1, dt * 3);
      btnMat.emissiveIntensity = speed * 0.6;
      heads.forEach((h, i) => {
        h.rotateY((i % 2 ? -1 : 1) * dt * 3.2 * speed);
      });
    },
    tap: () => {
      setOn(!on);
      return true;
    },
  };
}

/* ───────────── Smart wallet — aluminium card holder with pop-up cards and a tracker */
function smartWallet(o: ModelOptions): BuiltModel {
  const group = new THREE.Group();
  group.name = "smart-wallet";
  const W = 0.68; // width (x)
  const H = 1.04; // height (y)
  const T = 0.028; // plate thickness
  const GAP = 0.07; // card space

  const metal = material("graphite");
  const front = new THREE.Mesh(new RoundedBoxGeometry(W, H, T, 5, 0.03), metal);
  front.position.set(0, H / 2, GAP / 2 + T / 2);
  const back = new THREE.Mesh(new RoundedBoxGeometry(W, H, T, 5, 0.03), metal);
  back.position.set(0, H / 2, -GAP / 2 - T / 2);
  group.add(front, back);

  // Side rails and base
  const railMat = material("aluminium", "#8d939b");
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(0.03, H - 0.02, GAP + 0.01, 3, 0.012), railMat);
    rail.position.set(sx * (W / 2 - 0.015), H / 2, 0);
    group.add(rail);
  }
  const base = new THREE.Mesh(new RoundedBoxGeometry(W - 0.02, 0.05, GAP + 0.01, 3, 0.015), railMat);
  base.position.set(0, 0.03, 0);
  group.add(base);

  // Pop-up trigger
  const trigger = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.05, 0.05, 3, 0.02), material("aluminium"));
  trigger.position.set(W / 2 - 0.13, 0.03, GAP / 2 + T + 0.012);
  trigger.name = "trigger";
  group.add(trigger);

  // Brushed accent band across the front
  const bandStrip = new THREE.Mesh(new RoundedBoxGeometry(W - 0.002, 0.05, T + 0.004, 2, 0.01), material("aluminium", "#9aa1aa"));
  bandStrip.position.set(0, H * 0.18, GAP / 2 + T / 2);
  group.add(bandStrip);

  // Engraved mark on the front
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: textTexture("76", { color: "#9aa3ae", size: 150, weight: 600 }), transparent: true, opacity: 0.55, toneMapped: false }));
  mark.position.set(0, H * 0.6, GAP / 2 + T + 0.0012);
  group.add(mark);

  // Tracker module on the back: disc + status LED
  const tracker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 64), material("softTouch", "#1c222b"));
  tracker.rotation.x = Math.PI / 2;
  tracker.position.set(0, H * 0.38, -GAP / 2 - T - 0.006);
  group.add(tracker);
  const ledMat = new THREE.MeshStandardMaterial({ color: o.accent, emissive: new THREE.Color(o.accent), emissiveIntensity: 1.4 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16), ledMat);
  led.position.set(0.1, H * 0.38, -GAP / 2 - T - 0.013);
  group.add(led);

  // Cards
  const cardColors = ["#1e3a8a", "#0f1115", "#e9e4da", "#0f766e"];
  const cards: { mesh: THREE.Mesh; out: number }[] = [];
  cardColors.forEach((c, i) => {
    const card = new THREE.Mesh(new RoundedBoxGeometry(W - 0.08, H * 0.82, 0.008, 2, 0.003), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.6 }));
    const z = -GAP / 2 + 0.012 + i * 0.015;
    card.position.set(0, H * 0.43, z);
    // EMV chip on each card
    const chip = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.08, 0.004, 2, 0.01), new THREE.MeshStandardMaterial({ color: "#d4b062", metalness: 1, roughness: 0.3 }));
    chip.position.set(-0.14, 0.24, 0.006);
    card.add(chip);
    group.add(card);
    cards.push({ mesh: card, out: 0.16 + i * 0.07 });
  });

  sitOnGround(group);

  let open = Boolean(o.startOpen);
  let progress = open ? 1 : 0;
  let idle = 0;
  let userTouched = false;

  return {
    group,
    hint: { ar: "اضغط لإخراج البطاقات", en: "Tap to pop up the cards" },
    update: (dt, t) => {
      if (!o.reducedMotion && !userTouched) {
        idle += dt;
        if (idle > 3.2) {
          idle = 0;
          open = !open;
        }
      }
      const target = open ? 1 : 0;
      progress += (target - progress) * Math.min(1, dt * 5);
      cards.forEach((c, i) => {
        const delay = i * 0.08;
        const p = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
        c.mesh.position.y = H * 0.43 + p * c.out + 0.02;
      });
      trigger.position.y = 0.03 - progress * 0.012 + 0.02;
      ledMat.emissiveIntensity = 0.8 + (Math.sin(t * 2.2) > 0.94 ? 1.6 : 0);
    },
    tap: () => {
      userTouched = true;
      open = !open;
      return true;
    },
  };
}

export function buildBuiltinModel(key: BuiltinModel, o: ModelOptions): BuiltModel {
  switch (key) {
    case "magcharge":
      return magcharge(o);
    case "scalp-massager":
      return scalpMassager(o);
    case "smart-wallet":
      return smartWallet(o);
  }
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
