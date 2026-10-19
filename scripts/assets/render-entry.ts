// Browser entry used by render3d.mjs to snapshot the procedural 3D models.
import { createViewer } from "../../src/lib/three/viewer";

declare global {
  interface Window {
    shoot: (source: string, shots: { az: number; el: number; tone: "dark" | "light"; warm?: number }[]) => Promise<string[]>;
  }
}

window.shoot = async (source, shots) => {
  const out: string[] = [];
  for (const s of shots) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1600;
    canvas.style.width = canvas.style.height = "1600px";
    document.body.appendChild(canvas);
    const v = await createViewer(canvas, { source, autoRotate: false, interactive: false, reducedMotion: false, startOpen: true, accent: "#58d8ef", tone: s.tone, azimuth: s.az, elevation: s.el, preserveDrawingBuffer: true });
    for (let i = 0; i < (s.warm ?? 20); i++) v.renderOnce();
    v.setView(s.az, s.el);
    out.push(canvas.toDataURL("image/png"));
    v.dispose();
    canvas.remove();
  }
  return out;
};
