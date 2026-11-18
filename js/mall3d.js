/* The 25 Hours Store · Leben in der Mall vor dem Laden.
   Passanten: Mixamo Figur (assets/laden3d/mensch.glb, gebaut von 3D/tools/menschen_bauen.mjs) mit Gehen und Stehen,
   jede Person mit eigener Kleidung, Haut und Haarfarbe, Größe und Tempo. Sie kommen aus den Ausgängen an den Enden,
   bleiben an Schaufenstern stehen (auch an unserem) und gehen weiter. Dazu die Infostele mit wechselnden Bildern.
   Plan Koordinaten wie in laden3d.js: Welt x = 8 minus Plan X, z = Plan Y (Gang liegt bei Y kleiner 0). */
import * as THREE from "three";
import { clone as klonSkelett } from "three/addons/utils/SkeletonUtils.js";

const W = 8;
const P = (X, y, Y) => new THREE.Vector3(W - X, y, Y);
const ENDE_L = -15.4, ENDE_R = 23.4;
const BAHNEN = [-1.7, -2.6, -3.4, -8.4, -9.1];
// Plätze vor Schaufenstern: X von bis, Y, Blickrichtung (+1 zur Ladenseite, -1 nach gegenüber)
const FENSTER = [
  { x: [5.2, 6.6], y: -0.95, blick: 1 },     // vor unserem Laden, Blick hinein
  { x: [-5.5, -1.8], y: -0.95, blick: 1 },   // Optiker
  { x: [9.4, 12.0], y: -0.95, blick: 1 },    // Blumen
  { x: [-1.4, 1.2], y: -8.95, blick: -1 },   // Kaffeebar gegenüber
  { x: [9.0, 12.0], y: -8.95, blick: -1 },   // Drogerie
  { x: [16.0, 18.8], y: -8.95, blick: -1 },  // Mode
  { x: [-12.5, -10.0], y: -8.95, blick: -1 } // Sneaker
];
const KLEID = ["#2b3140", "#7d2433", "#2f6f8f", "#3f5c4b", "#ece7de", "#1d1d20", "#5b6f92", "#c23b3b", "#6a5a7a", "#e0b33a"];
const HOSE = ["#1f2430", "#2c2c30", "#3a4660", "#5a4a3a", "#cfc6b4", "#1a1a1a"];
const HAUT = ["#ffffff", "#f1d6c4", "#d8b094", "#b08466", "#8a634a", "#6a4a36"];
const HAAR = ["#2a1e18", "#141010", "#5a3e2a", "#b8925e", "#3a2a22", "#8a8680"];
const zz = (a, b) => a + Math.random() * (b - a);
const wahl = l => l[Math.floor(Math.random() * l.length)];
const winkel = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class MallLeben {
  constructor(laden) {
    this.l = laden;
    this.mobil = laden.mobil;
    this.leute = [];
    this.gruppe = new THREE.Group();
    this.gruppe.name = "Passanten";
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Sphere(new THREE.Vector3(), 1.1);
    this.bildschirme = [];
  }

  async laden(basis, version, loader) {
    const gltf = await loader.loadAsync(basis + "mensch.glb" + version);
    this.vorlage = gltf.scene;
    this.clips = Object.fromEntries(gltf.animations.map(a => [a.name, a]));
    // Größe der Vorlage messen, damit jede Person rund 1,75 m groß ist
    const box = new THREE.Box3().setFromObject(this.vorlage);
    this.grundSkala = 1.75 / Math.max(0.1, box.max.y - box.min.y);
    const schattenTex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 1, 32, 32, 31);
      gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.schattenMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: schattenTex, transparent: true, opacity: 0.5, depthWrite: false });
    this.schattenGeo = new THREE.PlaneGeometry(0.75, 0.75).rotateX(-Math.PI / 2);
    const n = this.mobil ? 7 : 14;
    for (let i = 0; i < n; i++) this.leute.push(this._person(i, n));
    this.l.scene.add(this.gruppe);
    return this;
  }

  _person(i, n) {
    const obj = klonSkelett(this.vorlage);
    const farben = { Topmat: wahl(KLEID), Bottommat: wahl(HOSE), Bodymat: wahl(HAUT), Hairmat: wahl(HAAR) };
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const name = o.material && o.material.name;
      o.material = o.material.clone();                 // je Person eigene Materialien (Farben und Ausblenden)
      o.material.userData.blend = o.material.transparent;
      if (farben[name]) o.material.color.set(farben[name]);
      // Remy trägt Schwarz: Oberteil und Hose bekommen eine eigene Farbe (Falten bleiben über die Normalen)
      if (name === "Topmat" || name === "Bottommat") { o.material.map = null; o.material.roughness = 0.92; }
      o.material.envMapIntensity = 0.9;
    });
    const s = this.grundSkala * zz(0.93, 1.06);
    obj.scale.multiplyScalar(s);
    const huelle = new THREE.Group();
    huelle.add(obj);
    const schatten = new THREE.Mesh(this.schattenGeo, this.schattenMat);
    schatten.position.y = 0.006; schatten.renderOrder = 1;
    huelle.add(schatten);
    this.gruppe.add(huelle);
    const mixer = new THREE.AnimationMixer(obj);
    const gehen = mixer.clipAction(this.clips.gehen), stehen = mixer.clipAction(this.clips.stehen);
    gehen.play(); stehen.play();
    stehen.time = Math.random() * this.clips.stehen.duration;
    const p = { huelle, mixer, gehen, stehen, tempo: zz(1.05, 1.45), weg: [], ziel: 0, warte: 0, steht: 0, yaw: 0, alpha: 1, mats: [] };
    huelle.traverse(o => { if (o.isMesh && o !== schatten) p.mats.push(o.material); });
    this._neueRoute(p, true, i / n);
    return p;
  }

  /* Route: aus einem Ausgang hinein, eventuell an einem Schaufenster stehen bleiben, zum anderen Ausgang hinaus */
  _neueRoute(p, start, verteilt) {
    const vonLinks = Math.random() < 0.5;
    const a = vonLinks ? ENDE_L : ENDE_R, b = vonLinks ? ENDE_R : ENDE_L;
    const bahn = wahl(BAHNEN) + zz(-0.2, 0.2);
    const weg = [];
    let pos = { X: a, Y: bahn };
    if (Math.random() < 0.55) {
      const f = wahl(FENSTER);
      const fx = zz(f.x[0], f.x[1]);
      weg.push({ X: fx, Y: bahn }, { X: fx, Y: f.y + zz(-0.15, 0.15), warte: zz(3, 9), blick: f.blick });
      const bahn2 = wahl(BAHNEN.filter(y => Math.sign(y + 5) === Math.sign(f.y + 5))) + zz(-0.2, 0.2);
      weg.push({ X: fx + (b > a ? 0.6 : -0.6), Y: bahn2 }, { X: b, Y: bahn2 });
    } else weg.push({ X: b, Y: bahn });
    if (start) {
      // beim ersten Mal über den Gang verteilt beginnen, nicht alle am Ausgang
      const t = verteilt * 0.9 + Math.random() * 0.1;
      pos = { X: a + (weg[0].X - a) * t, Y: bahn };
    }
    p.weg = weg; p.ziel = 0; p.warte = 0;
    p.X = pos.X; p.Y = pos.Y;
    p.tempo = zz(1.05, 1.45);
    p.gehen.timeScale = p.tempo / 1.3;
    p.huelle.position.copy(P(p.X, 0, p.Y));
  }

  /* Bildschirme der Infostele (Material "screen" im Ladenmodell) mit wechselnden Bildern füllen */
  bildschirmeSuchen(szene) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 920;
    this.stele = { c, g: c.getContext("2d"), t: 0, folie: -1 };
    const tex = this.stele.tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.color.setScalar(0.92);
    szene.traverse(o => { if (o.isMesh && /screen/i.test(o.material && o.material.name)) { o.material = mat; this.bildschirme.push(o); } });
    this._steleZeichnen(0);
  }

  _steleZeichnen(jetzt) {
    const S = this.stele; if (!S) return;
    const g = S.g, w = 512, h = 920;
    const dauer = 5200, n = 4, k = Math.floor(jetzt / dauer) % n, t = (jetzt % dauer) / dauer;
    const ein = Math.min(1, t * 6), aus = t > 0.9 ? 1 - (t - 0.9) * 10 : 1;
    g.globalAlpha = 1;
    g.fillStyle = "#0b0a0c"; g.fillRect(0, 0, w, h);
    g.globalAlpha = Math.max(0, Math.min(ein, aus));
    const disp = "800 120px 'Big Shoulders Display', Impact, sans-serif", txt = "500 34px 'DM Sans', sans-serif";
    g.textAlign = "center";
    if (k === 0) {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#ff5a1f"); gr.addColorStop(1, "#b0122b");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff4e0"; g.font = disp; g.fillText("KALTE", w / 2, 300 - (1 - ein) * 30); g.fillText("DRINKS", w / 2, 420 - (1 - ein) * 20);
      g.font = txt; g.fillText("rund um die Uhr", w / 2, 500);
      g.font = "800 46px 'Big Shoulders Display', sans-serif"; g.fillText("THE 25 HOURS STORE", w / 2, 800);
    } else if (k === 1) {
      const d = new Date(), z = d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
      g.fillStyle = "#14161c"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#9fb4d8"; g.font = txt; g.fillText("Willkommen im Zentrum", w / 2, 230);
      g.fillStyle = "#ffffff"; g.font = "800 190px 'Big Shoulders Display', sans-serif"; g.fillText(z, w / 2, 480);
      g.fillStyle = "#9fb4d8"; g.font = "500 30px 'DM Sans', sans-serif";
      ["Kaffeebar  ·  gegenüber", "Paketshop  ·  im 25 Hours Store", "Ausgang  ·  links und rechts"].forEach((s, i) => g.fillText(s, w / 2, 640 + i * 52));
    } else if (k === 2) {
      g.fillStyle = "#2a1c14"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe8c8"; g.font = "800 92px 'Big Shoulders Display', sans-serif"; g.fillText("KAFFEEBAR", w / 2, 300);
      g.font = txt; g.fillText("Flat White 3,90", w / 2, 400); g.fillText("Croissant 2,50", w / 2, 450);
      g.beginPath(); g.arc(w / 2, 640, 110 + Math.sin(jetzt / 400) * 6, 0, Math.PI * 2); g.fillStyle = "#c98a52"; g.fill();
    } else {
      g.fillStyle = "#ffc20e"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#1a1a1a"; g.font = "800 100px 'Big Shoulders Display', sans-serif"; g.fillText("PAKETE", w / 2, 320); g.fillText("ABHOLEN", w / 2, 420);
      g.font = txt; g.fillText("im 25 Hours Store", w / 2, 500); g.fillText("auch spät am Abend", w / 2, 550);
    }
    g.globalAlpha = 1;
    S.tex.needsUpdate = true;
  }

  /* pro Bild: Leute bewegen. Liefert true, wenn etwas davon im Bild ist (dann muss neu gezeichnet werden). */
  schritt(dt, jetzt) {
    if (!this.leute.length) return false;
    dt = Math.min(dt, 0.1);
    const cam = this.l.cam;
    this.frustum.setFromProjectionMatrix(this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const cx = W - cam.position.x, cy = cam.position.z;   // Kamera in Plan Koordinaten
    const fahrt = !!this.l.fahrt;
    let sichtbar = false;
    for (const p of this.leute) {
      const z = p.weg[p.ziel];
      let geht = false;
      if (p.warte > 0) {
        p.warte -= dt;
        if (p.warte <= 0) p.ziel++;
      } else if (z) {
        const dx = z.X - p.X, dy = z.Y - p.Y, d = Math.hypot(dx, dy);
        // während einer Kamerafahrt nicht vor die Tür laufen
        const vorTuer = fahrt && p.X > 1.6 && p.X < 4.9 && p.Y > -6 && Math.abs(cx - 3.2) < 1.5 && cy < 1 && Math.abs(p.X - cx) > 0.9;
        const v = vorTuer ? 0 : p.tempo;
        if (d < 0.05) {
          if (z.warte) { p.warte = z.warte; p.blickZiel = z.blick > 0 ? 0 : Math.PI; }
          else p.ziel++;
        } else {
          const s = Math.min(d, v * dt);
          p.X += (dx / d) * s; p.Y += (dy / d) * s;
          if (v > 0) { geht = true; p.blickZiel = Math.atan2(-dx, dy); }
        }
      } else {
        this._neueRoute(p, false);
        continue;
      }
      // Gehen und Stehen weich überblenden
      p.steht += ((geht ? 0 : 1) - p.steht) * Math.min(1, dt * 5);
      p.gehen.setEffectiveWeight(1 - p.steht); p.stehen.setEffectiveWeight(p.steht);
      if (p.blickZiel != null) p.yaw = winkel(p.yaw, p.blickZiel, Math.min(1, dt * 6));
      p.huelle.position.set(W - p.X, 0, p.Y);
      p.huelle.rotation.y = p.yaw;
      // zu nah an der Kamera: kurz ausblenden statt durch den Kopf zu laufen
      const nah = Math.hypot(p.X - cx, p.Y - cy);
      const a = Math.max(0, Math.min(1, (nah - 0.45) / 0.5));
      if (Math.abs(a - p.alpha) > 0.01) {
        p.alpha = a;
        for (const m of p.mats) { m.transparent = a < 1 || m.userData.blend; m.opacity = a; }
      }
      this._s.center.set(W - p.X, 0.9, p.Y);
      const imBild = a > 0.01 && this.frustum.intersectsSphere(this._s);
      p.huelle.visible = imBild;          // außerhalb des Bildes gar nicht zeichnen
      if (imBild) { p.mixer.update(dt); sichtbar = true; }
      else p.mixer.update(0);
    }
    if (this.stele && this.bildschirme.length) {
      const imBild = this.bildschirme.some(o => { o.getWorldPosition(this._s.center); this._s.radius = 1; return this.frustum.intersectsSphere(this._s); });
      this._s.radius = 1.1;
      if (imBild) {
        this.stele.t += dt;
        if (this.stele.t > 0.08) { this.stele.t = 0; this._steleZeichnen(jetzt); }
        sichtbar = true;
      }
    }
    return sichtbar;
  }
}
