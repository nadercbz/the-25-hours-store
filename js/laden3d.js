/* The 25 Hours Store · begehbarer 3D Laden (three.js r186, lokal in vendor/three).
   Modell aus Unity, gebaut nach Naders Referenzbild (3D/StoreUnity, StoreBuilder.cs), für das Web aufbereitet von
   3D/tools/web_bauen.py: assets/laden3d/laden.glb, gebackene Lightmaps lm_*.jpg, Regalplätze regale.json,
   echtes Sortiment als Atlas atlas.webp plus atlas.json, Formdaten formen.json. Die Produkte selbst kommen aus
   window.SORTIMENT und stehen als echte 3D Körper im Regal (js/produkte3d.js), alle in einem BatchedMesh.
   Weltkoordinaten: x = 8 m minus Plan X (Plan X ab linker Wand, die Kühlwand steht links), y = Höhe,
   z = Plan Y ab der Fassade in den Laden hinein. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STUFEN, baueProdukt, produktMaterial } from "./produkte3d.js?v=202611182128";
import { MallLeben } from "./mall3d.js?v=202611182128";

const W = 8;
const VERSION = new URL(import.meta.url).search;   // Cache Brecher aus dem Deploy weiterreichen
const P = (X, y, Y) => new THREE.Vector3(W - X, y, Y);
const glatt = t => t * t * (3 - 2 * t);
const sanft = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const klemme = (v, a, b) => Math.max(a, Math.min(b, v));

/* Standpunkte der Kamera (Plan Koordinaten). fov gilt für Querformat, hochkant wird er weiter. */
const STATIONEN = {
  vorne:    { pos: P(3.3, 1.62, -7.2), ziel: P(3.4, 1.72, 2.0), fov: 56 },     // in der Mall vor dem Laden, ganzer Laden im Bild
  eingang:  { pos: P(3.22, 1.62, -0.55), ziel: P(3.3, 1.3, 3.2), fov: 56 },   // direkt an der Tür, Übergang vom Foto
  innen:    { pos: P(3.35, 1.7, 0.45), ziel: P(3.45, 1.1, 6.8), fov: 60 },
  drinks:   { pos: P(1.6, 1.56, 2.15), ziel: P(0.3, 1.08, 4.5), fov: 58 },
  snacks:   { pos: P(3.62, 1.5, 3.0), ziel: P(2.88, 0.98, 4.9), fov: 58 },
  sweets:   { pos: P(3.18, 1.5, 3.0), ziel: P(3.92, 0.98, 4.9), fov: 58 },
  eis:      { pos: P(6.35, 1.74, 0.8), ziel: P(7.55, 0.45, 1.85), fov: 58 },
  bierwein: { pos: P(1.55, 1.6, 5.3), ziel: P(0.45, 1.05, 8.2), fov: 60 },
  kasse:    { pos: P(4.95, 1.62, 4.8), ziel: P(7.0, 1.12, 6.45), fov: 58 }
};
/* Wo die Bereichs Punkte im Laden hängen */
const ANKER = {
  drinks: P(0.45, 1.98, 4.6), snacks: P(2.45, 1.5, 3.4), sweets: P(4.35, 1.5, 3.4),
  eis: P(7.5, 1.1, 1.75), bierwein: P(3.4, 1.95, 8.05), kasse: P(6.3, 1.42, 5.25)
};
/* Gänge für die Wege: vorne quer (Plan Y unter 2,35), Kühlgang, Mittelgang, Kassengang */
const GANG_VORNE = 1.35, TUER_X = 3.22;
function gang(X, Y) {
  if (Y < 0) return "aussen";
  if (Y < 2.35) return "vorne";
  if (X < 2.0) return "kuehl";
  if (X > 2.9 && X < 3.9) return "mitte";
  if (X > 4.8 && X < 6.0) return "kasse";
  return "sonst";
}

export class Laden3D {
  constructor(buehnenEl, opt = {}) {
    this.el = buehnenEl;
    this.mobil = !!opt.mobil;
    this.reduziert = !!opt.reduziert;
    this.basis = opt.basis || "assets/laden3d/";
    this.sortiment = (opt.sortiment || []).filter(p => !/^blechschild/.test(p.id));
    this.onProdukt = null;     // (id) => {}
    this.onFrame = null;       // pro Bild, für die HTML Punkte
    this.onHover = null;       // (produkt | null) => {}
    this.aktiv = false;
    this.belegt = false;

    const canvas = this.canvas = document.createElement("canvas");
    canvas.className = "laden3d";
    canvas.setAttribute("aria-hidden", "true");
    buehnenEl.insertBefore(canvas, buehnenEl.querySelector("#fahrt"));
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: false });
    if (!r.capabilities.isWebGL2) throw new Error("WebGL2 fehlt");
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 0.8;
    this.pr = Math.min(devicePixelRatio || 1, this.mobil ? 1.6 : 1.75);
    r.setPixelRatio(this.pr);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0b0a0c");
    this.scene.add(new THREE.HemisphereLight(0xfff3e6, 0x6e625a, 0.35));

    this.cam = new THREE.PerspectiveCamera(58, 1, 0.04, 80);
    const s0 = STATIONEN.eingang;
    this.pos = s0.pos.clone(); this.ziel = s0.ziel.clone(); this.fovBasis = s0.fov;
    this.station = "eingang";
    this.blick = { yaw: 0, pitch: 0, zielYaw: 0, zielPitch: 0 };   // Umschauen per Ziehen
    this.ptr = [0, 0]; this.ptrZiel = [0, 0];                       // Maus Parallaxe
    this.fahrt = null;
    this.hover = -1;
    this.dirty = 2;
    this.t0 = performance.now();

    if (!this.mobil) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.cam));
      // nur die Neon Rahmen und Schilder sollen leuchten, nicht die hellen Flächen
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.35, 1.8);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this._groesse();
    addEventListener("resize", () => { this._groesse(); this.dirty = 3; });
    this._eingaben();
    this._loop = this._loop.bind(this);
  }

  /* ---------- Laden ---------- */
  async laden(fortschritt = () => {}) {
    const b = this.basis, v = VERSION;
    let teile = { glb: 0, rest: 0 };
    const melde = () => fortschritt(Math.min(1, teile.glb * 0.8 + teile.rest * 0.2));
    const tl = new THREE.TextureLoader();
    const json = u => fetch(b + u + v).then(x => { if (!x.ok) throw new Error(u); return x.json(); });
    const [regale, atlasInfo, formen] = await Promise.all([json("regale.json"), json("atlas.json"), json("formen.json")]);
    const lmTex = await Promise.all(Array.from({ length: regale.lightmaps }, (_, i) => tl.loadAsync(`${b}lm_${i}.jpg${v}`).then(t => {
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.anisotropy = 4; return t;
    })));
    const atlasP = tl.loadAsync(b + (this.mobil ? "atlas_m.webp" : "atlas.webp") + v);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    this.mall = new MallLeben(this);
    const mallP = this.mall.laden(b, v, loader).catch(e => { console.warn("Passanten nicht geladen", e); this.mall = null; });
    const gltf = await loader.loadAsync(b + (this.mobil ? "laden_m.glb" : "laden.glb") + v, e => { if (e.total) { teile.glb = e.loaded / e.total; melde(); } });
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const lmMax = regale.lmMax || 4;
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      const lm = m.userData ? m.userData.lightmap : -1;
      const metall = m.userData ? (m.userData.metall || 0) : 0;
      if (lm >= 0 && lmTex[lm]) {
        m.lightMap = lmTex[lm];
        m.lightMapIntensity = lmMax * Math.PI;
        m.envMapIntensity = metall > 0.3 ? 1.0 : 0.45;
      } else m.envMapIntensity = m.transparent ? 1.0 : 0.6;
      if (m.transparent) { m.depthWrite = false; o.renderOrder = 2; }
      // Glas spiegelt sonst die helle Decke so stark, dass man Eis und Kühlregal kaum noch sieht
      if (/glas/i.test(m.name || "")) m.envMapIntensity = 0.28;
      if (m.map) m.map.anisotropy = maxAniso;
      o.matrixAutoUpdate = false; o.updateMatrix();
    });
    gltf.scene.updateMatrixWorld(true);
    this.scene.add(gltf.scene);
    // Nebel ganz hinten im Gang, der Laden selbst bleibt klar
    this.scene.fog = new THREE.Fog(0x2b2622, 19, 52);
    teile.glb = 1; melde();

    const atlas = await atlasP;
    atlas.flipY = false; atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = maxAniso;
    atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter;
    this._regaleFuellen(regale.slots, atlasInfo.lage, atlas, formen);
    await this._zeitschriften(regale.slots);
    await mallP;
    if (this.mall) this.mall.bildschirmeSuchen(gltf.scene);
    teile.rest = 1; melde();
    this._umgebung();
    this.setzeStation("vorne");
    // einmal zeichnen, damit Shader kompiliert sind, bevor die Fahrt startet
    this.renderer.compile(this.scene, this.cam);
    return this;
  }

  /* Spiegelungen: der Laden selbst als Umgebung (Würfelbild aus der Ladenmitte), damit Epoxidboden, Glas und
     Metall den echten Raum zeigen statt eines hellen Ersatzraums */
  _umgebung() {
    const rt = new THREE.WebGLCubeRenderTarget(this.mobil ? 128 : 256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.05, 40, rt);
    cc.position.copy(P(3.4, 1.4, 4.6));
    cc.update(this.renderer, this.scene);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromCubemap(rt.texture).texture;
    pm.dispose(); rt.dispose();
  }

  /* ---------- Regale mit dem echten Sortiment füllen: echte 3D Produkte ---------- */
  _regaleFuellen(slots, lage, atlas, formen) {
    const stufe = STUFEN[this.mobil ? "handy" : "rechner"];
    const bau = {};          // Produkt id -> { hi, lo, fw, d, h }
    for (const p of this.sortiment) {
      if (!lage[p.id] || !formen[p.id]) continue;
      const hi = baueProdukt(p, formen[p.id], lage[p.id], stufe.hi);
      const lo = baueProdukt(p, formen[p.id], lage[p.id], stufe.lo);
      if (hi && lo) bau[p.id] = { hi: hi.geo, lo: lo.geo, fw: hi.fw, d: hi.d, h: hi.h };
    }
    const nachKat = {};
    this.sortiment.forEach(p => { if (bau[p.id]) (nachKat[p.kat] = nachKat[p.kat] || []).push(p); });
    const zeiger = {};
    const inst = [];
    const zufall = (() => { let s = 25; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const q = new THREE.Quaternion(), achseY = new THREE.Vector3(0, 1, 0), achseX = new THREE.Vector3(1, 0, 0);
    const a = new THREE.Vector3(), bv = new THREE.Vector3(), dir = new THREE.Vector3(), n = new THREE.Vector3(), pos = new THREE.Vector3();
    for (const s of slots) {
      const liste = nachKat[s.kat];
      if (!liste || !liste.length) continue;
      a.fromArray(s.a); bv.fromArray(s.b); n.fromArray(s.n);
      dir.subVectors(bv, a);
      const laenge = dir.length(); dir.normalize();
      const winkel = Math.atan2(n.x, n.z);
      const truhe = s.typ === "truhe";
      const qKipp = new THREE.Quaternion().setFromAxisAngle(achseX, truhe ? -0.62 : 0);   // in der Truhe liegt das Eis schräg
      let x = 0.01;
      let i = zeiger[s.kat] = (zeiger[s.kat] || 0);
      let schutz = 0;
      while (x < laenge - 0.03 && schutz++ < 200) {
        const p = liste[i % liste.length]; i++;
        const B = bau[p.id];
        const sk = Math.min(1, (s.h * 0.95) / B.h);        // zu hohe Produkte im Fach verkleinern
        const fw = B.fw * sk, d = B.d * sk, h = B.h * sk;
        if (h < 0.035) continue;
        const schritt = d + 0.012;
        const reihen = s.typ === "theke" ? 1 : klemme(Math.floor((s.tief || 0.2) / schritt), 1, this.mobil ? 2 : 3);
        const reihe = klemme(Math.round(0.24 / fw), 1, 4);
        for (let f = 0; f < reihe && x + fw <= laenge; f++) {
          for (let r = 0; r < reihen; r++) {
            pos.copy(a).addScaledVector(dir, x + fw / 2).addScaledVector(n, -(d / 2 + r * schritt + zufall() * 0.008));
            q.setFromAxisAngle(achseY, winkel + (zufall() - 0.5) * 0.07).multiply(qKipp);
            const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(sk, sk, sk));
            const punkt = pos.clone().addScaledVector(n, d / 2).setY(pos.y + h * 0.6);
            inst.push({ p, m, pos: pos.clone(), punkt, fw, d, yaw: winkel, truhe,
              hell: (s.licht || 1) * (1 - r * 0.16) * (0.95 + zufall() * 0.07), vorne: r === 0 });
          }
          x += fw + 0.006;
        }
        x += 0.008;
      }
      zeiger[s.kat] = i;
    }
    // alle Produkte in einem BatchedMesh: je Produkt zwei Detailstufen, je Platz eine Instanz
    const ids = Object.keys(bau);
    this.bau = bau;
    this.atlas = atlas;
    let nv = 0, ni = 0;
    ids.forEach(id => { for (const g of [bau[id].hi, bau[id].lo]) { nv += g.attributes.position.count; ni += g.index.count; } });
    const mesh = this.produkte = new THREE.BatchedMesh(inst.length, nv, ni, produktMaterial(atlas, this.mobil));
    ids.forEach(id => { bau[id].gHi = mesh.addGeometry(bau[id].hi); bau[id].gLo = mesh.addGeometry(bau[id].lo); });
    const N = this.anzahl = inst.length;
    const col = new THREE.Color();
    this.instProdukt = [];
    this.instHell = new Float32Array(N);
    this.instPos = new Float32Array(N * 3);
    this.instPunkt = [];
    this.instHi = new Int32Array(N); this.instLo = new Int32Array(N); this.instGeo = new Int32Array(N);
    this.instVorne = new Uint8Array(N);
    this.proInst = {};
    this.vorneInst = [];
    inst.forEach((it, k) => {
      const B = bau[it.p.id];
      const id = mesh.addInstance(B.gLo);
      mesh.setMatrixAt(id, it.m);
      this.instHell[id] = it.hell * 1.05;
      mesh.setColorAt(id, col.setScalar(this.instHell[id]));
      this.instProdukt[id] = it.p;
      it.pos.toArray(this.instPos, id * 3);
      this.instPunkt[id] = it.punkt;
      this.instHi[id] = B.gHi; this.instLo[id] = B.gLo; this.instGeo[id] = B.gLo;
      this.instVorne[id] = it.vorne ? 1 : 0;
      (this.proInst[it.p.id] = this.proInst[it.p.id] || []).push(id);
      if (it.vorne) this.vorneInst.push(id);
    });
    mesh.frustumCulled = false;
    this.lodWeit2 = Math.pow(this.mobil ? 1.7 : 2.4, 2);
    this.scene.add(mesh);
    this._schatten(inst);
    let tris = 0;
    ids.forEach(id => { tris += bau[id].hi.index.count / 3; });
    this.statistik = { instanzen: N, produkte: ids.length, dreieckeHiSumme: tris };
  }

  /* Detailstufe je Instanz nach Abstand zur Kamera: nah und vorne die feine Form, sonst die einfache */
  _lod() {
    if (!this.instPos) return;
    const c = this.cam.position;
    if (this._lodPos && this._lodPos.distanceToSquared(c) < 0.0004) return;
    (this._lodPos = this._lodPos || new THREE.Vector3()).copy(c);
    const P = this.instPos, g2 = this.lodWeit2;
    for (let k = 0; k < this.anzahl; k++) {
      const dx = P[k * 3] - c.x, dy = P[k * 3 + 1] - c.y, dz = P[k * 3 + 2] - c.z;
      const soll = this.instVorne[k] && dx * dx + dy * dy + dz * dz < g2 ? this.instHi[k] : this.instLo[k];
      if (soll !== this.instGeo[k]) { this.produkte.setGeometryIdAt(k, soll); this.instGeo[k] = soll; }
    }
  }

  /* weicher Kontaktschatten unter jedem Produkt, damit nichts über dem Regalboden schwebt */
  _schatten(inst) {
    const liste = inst.filter(it => !it.truhe);
    if (!liste.length) return;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.55, "rgba(255,255,255,0.55)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.62, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.InstancedMesh(geo, mat, liste.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    liste.forEach((it, k) => {
      p.copy(it.pos).setY(it.pos.y + 0.002);
      q.setFromAxisAngle(Y, it.yaw);
      m.compose(p, q, sc.set(it.fw * 1.3, 1, it.d * 1.45 + 0.02));
      mesh.setMatrixAt(k, m);
    });
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /* Zeitschriften im Ständer: ausgedachte Titel ohne echte Marken, im Browser gezeichnet */
  async _zeitschriften(slots) {
    const plaetze = slots.filter(s => s.typ === "zeitschrift");
    if (!plaetze.length) return;
    try { await document.fonts.load("800 80px 'Big Shoulders Display'"); } catch (e) {}
    const titel = [["BERLIN", "#e3122d", "Was die Stadt bewegt"], ["AUTO", "#1d4fa3", "Test: die neuen Elektro"], ["KOCHEN", "#2f8f4e", "30 Rezepte für den Abend"],
      ["STYLE", "#111111", "Herbst in Farbe"], ["RÄTSEL", "#f2a20c", "500 Rätsel zum Mitnehmen"], ["TOR!", "#0f8a7a", "Der Spieltag im Überblick"]];
    const c = document.createElement("canvas"); c.width = 1536; c.height = 340;
    const g = c.getContext("2d");
    titel.forEach(([t, farbe, zeile], i) => {
      const x = i * 256;
      const grad = g.createLinearGradient(x, 0, x, 340);
      grad.addColorStop(0, "#f4efe7"); grad.addColorStop(1, "#d9d2c6");
      g.fillStyle = grad; g.fillRect(x + 4, 4, 248, 332);
      g.fillStyle = farbe; g.fillRect(x + 4, 4, 248, 92);
      g.fillStyle = "#fff"; g.font = "800 74px 'Big Shoulders Display', Impact, sans-serif"; g.textAlign = "center";
      g.fillText(t, x + 128, 80, 230);
      g.fillStyle = `hsl(${i * 57 + 20} 45% 55%)`; g.fillRect(x + 22, 120, 212, 150);
      g.fillStyle = "#222"; g.font = "700 22px 'DM Sans', sans-serif"; g.fillText(zeile, x + 128, 305, 220);
    });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    const mats = [];
    plaetze.forEach(s => {
      a.fromArray(s.a); b.fromArray(s.b); n.fromArray(s.n);
      d.subVectors(b, a); const L = d.length(); d.normalize();
      const w = 0.21, h = Math.min(s.h * 0.95, 0.28);
      for (let x = 0.01, i = 0; x + w <= L; x += w + 0.02, i++) {
        const k = (i + Math.round(a.y * 10)) % 6;
        const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, x + w / 2).addScaledVector(n, 0.01),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, Math.atan2(n.x, n.z), 0, "YXZ")), new THREE.Vector3(w, h, 1));
        mats.push({ m, k });
      }
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aK;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n\tvMapUv = vec2((aK + uv.x) / 6.0, 1.0 - uv.y);");
    };
    tex.flipY = false;
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    const ka = new Float32Array(mats.length);
    mats.forEach((z, i) => { mesh.setMatrixAt(i, z.m); ka[i] = z.k; mesh.setColorAt(i, new THREE.Color().setScalar(0.92)); });
    geo.setAttribute("aK", new THREE.InstancedBufferAttribute(ka, 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /* ---------- Produkt in 3D zum Drehen (Produktkarte) ---------- */
  ansicht(behaelter, id) {
    const B = this.bau && this.bau[id];
    if (!B || !behaelter) return false;
    let A = this._ansicht;
    if (!A) {
      const canvas = document.createElement("canvas");
      canvas.className = "produkt3d";
      canvas.setAttribute("aria-hidden", "true");
      let r;
      try { r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); } catch (e) { return false; }
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.NeutralToneMapping;
      r.toneMappingExposure = 1.0;
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      r.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(r);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      scene.environmentIntensity = 0.75;
      scene.add(new THREE.HemisphereLight(0xfff4e8, 0x3a3230, 0.5));
      const key = new THREE.DirectionalLight(0xfff0dc, 1.7); key.position.set(-1.4, 2.2, 2.4); scene.add(key);
      const kante = new THREE.DirectionalLight(0xffe2c8, 1.1); kante.position.set(1.8, 1.2, -1.6); scene.add(kante);
      const mat = produktMaterial(this.atlas, false);
      mat.userData.licht.uStark.value = 0.12;
      const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 20);
      const gruppe = new THREE.Group(); scene.add(gruppe);
      A = this._ansicht = { r, scene, cam, gruppe, canvas, mat, winkel: -1.1, ziel: 0, zug: null, frei: 0, an: false };
      canvas.addEventListener("pointerdown", e => { A.zug = { x: e.clientX, w: A.ziel }; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
      canvas.addEventListener("pointermove", e => { if (A.zug) A.ziel = klemme(A.zug.w + (e.clientX - A.zug.x) * 0.011, -1.3, 1.3); });
      const lass = () => { if (A.zug) { A.zug = null; A.frei = performance.now(); } };
      canvas.addEventListener("pointerup", lass); canvas.addEventListener("pointercancel", lass);
      A.loop = jetzt => {
        if (!A.an) { A.raf = 0; return; }
        A.raf = requestAnimationFrame(A.loop);
        if (document.hidden) return;
        // von selbst sanft hin und her schwenken, nach dem Ziehen erst nach einer Pause wieder
        if (!A.zug && !this.reduziert && jetzt - A.frei > 2600) A.ziel = Math.sin((jetzt - A.t0) / 1700) * 0.62;
        A.winkel += (A.ziel - A.winkel) * 0.075;
        A.gruppe.rotation.y = A.winkel;
        const w = A.canvas.clientWidth, h = A.canvas.clientHeight;
        if (w && (w !== A.w || h !== A.h)) { A.w = w; A.h = h; A.r.setSize(w, h, false); A.cam.aspect = w / h; A.passe(); }
        A.r.render(A.scene, A.cam);
      };
      A.passe = () => {
        const g = A.groesse; if (!g) return;
        const t = Math.tan(THREE.MathUtils.degToRad(A.cam.fov / 2));
        const d = Math.max((g.h / 2) / t, (g.b / 2) / (t * A.cam.aspect)) * 1.18 + g.t / 2;
        A.cam.position.set(0, g.h * 0.06, d); A.cam.lookAt(0, 0, 0); A.cam.updateProjectionMatrix();
      };
    }
    if (A.mesh) A.gruppe.remove(A.mesh);
    A.mesh = new THREE.Mesh(B.hi, A.mat);
    A.mesh.position.set(0, -B.h / 2, 0);
    A.gruppe.add(A.mesh);
    A.groesse = { h: B.h, b: Math.hypot(B.fw, B.d) * 0.86, t: B.d };
    if (A.canvas.parentNode !== behaelter) behaelter.appendChild(A.canvas);
    A.w = 0; A.winkel = this.reduziert ? 0 : -1.1; A.ziel = 0; A.t0 = performance.now(); A.frei = A.t0 - 1600;
    A.an = true;
    if (!A.raf) A.raf = requestAnimationFrame(A.loop);
    return true;
  }
  ansichtZu() { if (this._ansicht) this._ansicht.an = false; }

  /* ---------- Kamera ---------- */
  _groesse() {
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.pr); this.composer.setSize(w, h); }
    this.cam.aspect = w / h;
    this._fov();
  }
  _fov() {
    const a = this.cam.aspect;
    // hochkant: horizontal mindestens 56 Grad zeigen, höchstens 86 Grad senkrecht
    const vMin = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(56) / 2) / a);
    this.cam.fov = klemme(Math.max(this.fovBasis, THREE.MathUtils.radToDeg(vMin)), 30, 86);
    this.cam.updateProjectionMatrix();
  }
  hochkant() { return this.cam.aspect < 0.9; }

  setzeStation(id) {
    const s = STATIONEN[id]; if (!s) return;
    this.fahrt = null;
    this.station = id;
    this.pos.copy(s.pos); this.ziel.copy(s.ziel); this.fovBasis = s.fov;
    this.blick.zielYaw = this.blick.yaw = 0; this.blick.zielPitch = this.blick.pitch = 0;
    this._fov(); this.dirty = 3;
  }

  _weg(von, nach) {
    // Punkte in Plan Koordinaten (X, y, Y)
    const pl = v => ({ X: W - v.x, y: v.y, Y: v.z });
    const A = pl(von), B = pl(nach);
    const pts = [A];
    const gA = gang(A.X, A.Y), gB = gang(B.X, B.Y);
    const y = (A.y + B.y) / 2;
    if (gA === "aussen") pts.push({ X: TUER_X, y: A.y, Y: -1.6 }, { X: TUER_X, y: A.y, Y: 0.15 });
    const vorneA = gA === "vorne" || gA === "aussen", vorneB = gB === "vorne" || gB === "aussen";
    const gleicherGang = gA === gB && !vorneA && gA !== "sonst" && Math.abs(A.X - B.X) < 0.7;
    if (!gleicherGang) {
      if (!vorneA) pts.push({ X: A.X, y, Y: GANG_VORNE });
      if (!vorneB) pts.push({ X: B.X, y, Y: GANG_VORNE });
      else if (gB !== "aussen" && pts.length > 1) { /* vorne zu vorne: direkt */ }
    }
    if (gB === "aussen") pts.push({ X: TUER_X, y: B.y, Y: 0.15 }, { X: TUER_X, y: B.y, Y: -1.6 });
    pts.push(B);
    // doppelte Punkte entfernen
    const sauber = pts.filter((p, i) => i === 0 || Math.hypot(p.X - pts[i - 1].X, p.Y - pts[i - 1].Y) > 0.12);
    return sauber.map(p => P(p.X, p.y, p.Y));
  }

  /* Fährt die Kamera zu einem Standpunkt. Liefert ein Promise, das bei Ankunft erfüllt wird. */
  fahre(id, opt = {}) {
    const s = STATIONEN[id]; if (!s) return Promise.resolve();
    if (this.reduziert || opt.sofort) { this.setzeStation(id); return Promise.resolve(); }
    const vonPos = this._kameraPos(), vonZiel = this.ziel.clone();
    const pts = this._weg(vonPos, s.pos);
    const kurve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5) : new THREE.LineCurve3(pts[0], pts[pts.length - 1]);
    const laenge = kurve.getLength();
    const dauer = (opt.dauer || klemme(0.9 + laenge * 0.38, 1.1, 3.4)) * (opt.tempo || 1);
    const vonBlick = { yaw: this.blick.yaw, pitch: this.blick.pitch };
    this.blick.zielYaw = 0; this.blick.zielPitch = 0;
    const vonFov = this.fovBasis;
    this.station = id;
    // Blick als Richtung (Gier und Neigung) überblenden, nie als Punkt: so dreht die Kamera weich statt umzuspringen
    const richtung = (a, b) => { const d = b.clone().sub(a).normalize(); return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(klemme(d.y, -1, 1)) }; };
    const vonDir = richtung(vonPos, vonZiel), nachDir = richtung(s.pos, s.ziel);
    // raus aus dem Laden: Blick bleibt im Laden, die Kamera fährt rückwärts durch die Tür in die Mall
    const rueck = id === "vorne";
    return new Promise(fertig => {
      if (this.fahrt) this.fahrt.fertig();
      this.fahrt = { kurve, dauer, t0: performance.now(), vonDir, nachDir, rueck, nachZiel: s.ziel.clone(), vonFov, nachFov: s.fov, vonBlick, fertig, laenge };
    });
  }

  _kameraPos() { return this.pos.clone(); }

  _schritt(jetzt) {
    const f = this.fahrt;
    if (f) {
      const roh = klemme((jetzt - f.t0) / (f.dauer * 1000), 0, 1);
      const t = sanft(roh);
      f.kurve.getPointAt(t, this.pos);
      // Blick: am Anfang vom alten Blick lösen, unterwegs in Fahrtrichtung, am Ende auf den neuen Blick
      const wl = (x, y, k) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * k;
      const V = f.vonDir, N = f.nachDir;
      let yaw, pitch;
      if (f.rueck || f.laenge < 1.2) {
        const k = glatt(klemme((roh - 0.05) / 0.85, 0, 1));
        yaw = wl(V.yaw, N.yaw, k); pitch = V.pitch + (N.pitch - V.pitch) * k;
      } else {
        const tan = f.kurve.getTangentAt(Math.min(0.999, t + 0.08));
        const tYaw = Math.atan2(tan.x, tan.z), tPitch = -0.06;
        const a = glatt(klemme(roh / 0.35, 0, 1)), e = glatt(klemme((roh - 0.55) / 0.45, 0, 1));
        yaw = wl(wl(V.yaw, tYaw, a), N.yaw, e);
        pitch = (V.pitch + (tPitch - V.pitch) * a) * (1 - e) + N.pitch * e;
      }
      this.ziel.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(3).add(this.pos);
      this.fovBasis = f.vonFov + (f.nachFov - f.vonFov) * t;
      this.blick.yaw = f.vonBlick.yaw * (1 - t); this.blick.pitch = f.vonBlick.pitch * (1 - t);
      this._fov();
      if (roh >= 1) { this.fahrt = null; this.pos.copy(f.kurve.getPointAt(1)); this.ziel.copy(f.nachZiel); f.fertig(); }
      this.dirty = 2;
    }
    // Umschauen und Maus Parallaxe weich nachziehen
    const bl = this.blick;
    if (!f) {
      const dy = bl.zielYaw - bl.yaw, dp = bl.zielPitch - bl.pitch;
      if (Math.abs(dy) + Math.abs(dp) > 1e-4) { bl.yaw += dy * 0.14; bl.pitch += dp * 0.14; this.dirty = 2; }
    }
    const atem = !this.mobil && !f && !this.zug ? (jetzt - this.letzteEingabe > 2500 ? 1 : 0) : 0;
    const zx = this.ptrZiel[0] + atem * Math.sin(jetzt / 2800) * 0.25, zy = this.ptrZiel[1] + atem * Math.cos(jetzt / 3500) * 0.15;
    const px = zx - this.ptr[0], py = zy - this.ptr[1];
    if (Math.abs(px) + Math.abs(py) > 1e-4) { this.ptr[0] += px * 0.05; this.ptr[1] += py * 0.05; this.dirty = Math.max(this.dirty, 1); }

    const c = this.cam;
    c.position.copy(this.pos);
    c.lookAt(this.ziel);
    c.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), bl.yaw - this.ptr[0] * 0.035);
    c.rotateX(bl.pitch - this.ptr[1] * 0.022);
    // Kamera leicht seitlich mit der Maus, wirkt räumlicher
    c.translateX(this.ptr[0] * 0.05);
    c.updateMatrixWorld();
  }

  _loop(jetzt) {
    if (!this.aktiv) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this._loop);
    if (document.hidden) { this._tAlt = 0; return; }
    const dt = this._tAlt ? (jetzt - this._tAlt) / 1000 : 0;
    this._tAlt = jetzt;
    this._schritt(jetzt);
    if (this.mall && this.mall.schritt(dt, jetzt)) this.dirty = Math.max(this.dirty, 1);
    if (this.onFrame) this.onFrame();
    if (this.dirty > 0 || this.immer) {
      this.dirty--;
      this._lod();
      if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.cam);
    }
  }

  zeige(an) {
    if (an === this.aktiv) return;
    this.aktiv = an;
    this.canvas.classList.toggle("an", an);
    this.dirty = 3;
    if (an && !this.raf) this.raf = requestAnimationFrame(this._loop);
  }

  /* ---------- Eingaben: ziehen zum Umschauen, klicken auf Produkte, Hover ---------- */
  _eingaben() {
    this.letzteEingabe = 0;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const treffer = (x, y) => {
      if (!this.produkte) return -1;
      const r = this.canvas.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.cam);
      ray.far = 6;
      const h = ray.intersectObject(this.produkte, false)[0];
      if (!h) return -1;
      return h.batchId;
    };
    this._treffer = treffer;
    this.zug = null;
    let z = null;
    this.el.addEventListener("pointerdown", e => {
      if (!this.aktiv || this.belegt || e.target.closest("button, a")) return;
      z = { x: e.clientX, y: e.clientY, yaw: this.blick.zielYaw, pitch: this.blick.zielPitch, bewegt: false, typ: e.pointerType };
      this.zug = z;
    });
    addEventListener("pointermove", e => {
      if (!this.aktiv) return;
      this.letzteEingabe = performance.now();
      if (e.pointerType === "mouse" && !z) this.ptrZiel = [(e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1];
      if (z) {
        const dx = e.clientX - z.x, dy = e.clientY - z.y;
        if (!z.bewegt && Math.hypot(dx, dy) > 7) { z.bewegt = true; document.body.classList.add("zieht"); this._setzeHover(-1); }
        if (z.bewegt) {
          const s = (this.cam.fov / this.h) * (Math.PI / 180) * 1.1;
          const maxYaw = this.hochkant() ? 1.15 : 0.7;
          this.blick.zielYaw = klemme(z.yaw + dx * s, -maxYaw, maxYaw);
          this.blick.zielPitch = klemme(z.pitch + dy * s * 0.8, -0.4, 0.35);
        }
        return;
      }
      if (e.pointerType === "mouse" && !this.belegt && !this.fahrt) {
        if (this._hoverWarte) return;
        this._hoverWarte = true;
        requestAnimationFrame(() => {
          this._hoverWarte = false;
          if (e.target !== this.canvas && !e.target.classList.contains("buehne__schleier") && !e.target.closest(".punkte")) { this._setzeHover(-1); return; }
          this._setzeHover(treffer(e.clientX, e.clientY), e.clientX, e.clientY);
        });
      }
    }, { passive: true });
    const ende = e => {
      if (!z) return;
      const war = z; z = null; this.zug = null;
      document.body.classList.remove("zieht");
      if (!war.bewegt && e.type === "pointerup" && !this.belegt && !this.fahrt) {
        const k = treffer(e.clientX, e.clientY);
        if (k >= 0 && this.onProdukt) this.onProdukt(this.instProdukt[k].id);
      }
    };
    addEventListener("pointerup", ende);
    addEventListener("pointercancel", ende);
    this.canvas.addEventListener("pointerleave", () => this._setzeHover(-1));
  }

  _setzeHover(k, x, y) {
    const id = k >= 0 ? this.instProdukt[k].id : null;
    if (id !== this.hoverId) {
      if (this.hoverId) this.markiere(this.hoverId, false);
      this.hoverId = id;
      if (id) this.markiere(id, true);
      this.canvas.style.cursor = id ? "pointer" : "";
    }
    if (this.onHover) this.onHover(id ? this.instProdukt[k] : null, x, y);
  }

  /* Produkt im Regal aufleuchten lassen (Hover, Produktleiste, offenes Produkt) */
  markiere(id, an) {
    const liste = this.proInst && this.proInst[id];
    if (!liste) return;
    const c = new THREE.Color();
    liste.forEach(k => this.produkte.setColorAt(k, c.setScalar(this.instHell[k] * (an ? 1.45 : 1))));
    this.dirty = 2;
  }

  zeiger(x, y) { this.ptrZiel = [x, y]; }

  /* links (-1) oder rechts (1) vom aktuellen Blick, für die Randpfeile */
  seite(v) {
    const p = v.clone().applyMatrix4(this.cam.matrixWorldInverse);
    return p.x < 0 ? -1 : 1;
  }
  /* zu einem Punkt hindrehen (Randpfeil), ohne den Standpunkt zu verlassen */
  schaueZu(v) {
    const b = this.ziel.clone().sub(this.pos), t = v.clone().sub(this.pos);
    let d = Math.atan2(t.x, t.z) - Math.atan2(b.x, b.z);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxYaw = this.hochkant() ? 1.15 : 0.7;
    this.blick.zielYaw = klemme(d, -maxYaw, maxYaw);
    this.blick.zielPitch = 0;
  }

  /* ---------- Bildschirm Koordinaten für die HTML Punkte ---------- */
  zuSchirm(v) {
    const p = this._tmp || (this._tmp = new THREE.Vector3());
    p.copy(v).project(this.cam);
    if (p.z > 1 || p.z < -1) return null;
    return [(p.x * 0.5 + 0.5) * this.w, (-p.y * 0.5 + 0.5) * this.h];
  }
  anker(kat) { return ANKER[kat]; }
  planPunkt(X, y, Y) { return P(X, y, Y); }

  /* Produkte, die vom Standpunkt eines Bereichs gut zu sehen sind, für die Plus Punkte (Handy hat kein Hover) */
  produktPunkte(kat, max = 5) {
    const s = STATIONEN[kat]; if (!s || !this.produkte) return [];
    const cam = this.cam.clone();
    cam.position.copy(s.pos); cam.lookAt(s.ziel); cam.fov = this.cam.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const kand = [];
    for (const k of this.vorneInst) {
      const pr = this.instProdukt[k];
      if (pr.kat !== kat) continue;
      const w = this.instPunkt[k].clone();
      const d = w.distanceTo(s.pos);
      if (d > 3.6 || d < 0.6) continue;
      const v = w.clone().project(cam);
      if (Math.abs(v.x) > 0.72 || v.y > 0.55 || v.y < -0.45 || v.z > 1) continue;
      kand.push({ id: pr.id, w, sx: v.x, sy: v.y, d: Math.hypot(v.x * 0.8, v.y) + d * 0.08 });
    }
    kand.sort((a, b) => a.d - b.d);
    const wahl = [];
    for (const c of kand) {
      if (wahl.length >= max) break;
      if (wahl.some(o => o.id === c.id || Math.hypot(o.sx - c.sx, (o.sy - c.sy) * 1.4) < 0.3)) continue;
      wahl.push(c);
    }
    return wahl.map(c => ({ id: c.id, w: c.w }));
  }
}

export { STATIONEN, ANKER };
window.Laden3D = Laden3D;
document.dispatchEvent(new Event("laden3d"));
