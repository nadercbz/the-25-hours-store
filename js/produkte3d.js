/* The 25 Hours Store · echte 3D Produkte.
   Aus den Formdaten (assets/laden3d/formen.json, gebaut von 3D/tools/web_bauen.py aus der Silhouette jedes Produktfotos)
   entsteht hier für jedes Produkt ein richtiger Körper mit dem Foto als Etikett:
   dreh   Flasche, Dose, Becher, Rolle: Drehkörper mit der echten Kontur Zeile für Zeile, Etikett von vorn projiziert
   beutel Tüte: Kissen, das sich zur Mitte wölbt (Abstand zum Umriss), Umriss schneidet der Alphakanal
   kiste  Schachtel, Tafel, Karton: Quader mit Tiefe, Seiten in der Randfarbe der Verpackung
   Jedes Produkt gibt es in zwei Detailstufen (nah und fern). Maße in Metern, Boden bei y = 0, Front zeigt nach +z. */
import * as THREE from "three";

export const STUFEN = {
  rechner: { hi: { seg: 30, raster: 30, profil: "hi", falten: true }, lo: { seg: 10, raster: 11, profil: "lo" } },
  handy: { hi: { seg: 18, raster: 17, profil: "hi", falten: true }, lo: { seg: 7, raster: 7, profil: "lo" } }
};

const k01 = v => Math.max(0, Math.min(1, v));

class Bau {
  constructor(R) { this.R = R; this.p = []; this.n = []; this.t = []; this.i = []; }
  v(x, y, z, nx, ny, nz, u, v) {
    const R = this.R;
    this.p.push(x, y, z); this.n.push(nx, ny, nz);
    this.t.push(R[0] + k01(u) * R[2], R[1] + k01(v) * R[3]);
    return this.p.length / 3 - 1;
  }
  geo(cut, rau, metall, normalenNeu) {
    const g = new THREE.BufferGeometry();
    const n = this.p.length / 3;
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute("aCut", new THREE.Float32BufferAttribute(new Float32Array(n).fill(cut), 1));
    const mat = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) { mat[k * 2] = rau; mat[k * 2 + 1] = metall; }
    g.setAttribute("aMat", new THREE.Float32BufferAttribute(mat, 2));
    g.setIndex(this.i);
    if (normalenNeu) g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/* ---------- Drehkörper ---------- */
function dreh(p, f, R, st) {
  const w = (p.breite_cm || 7) / 100, H = w / (p.seite || 0.4);
  const roh = f[st.profil] || f.hi;
  const pts = roh.map(([y, c, r]) => ({ y: (y - f.y0) * H, yi: y, c, rn: r, r: r * w }));
  const N = pts.length, seg = st.seg;
  // Normale je Profilpunkt aus den angrenzenden Strecken (außen zeigend)
  const sn = [];
  for (let i = 0; i < N - 1; i++) {
    const dr = pts[i + 1].r - pts[i].r, dy = pts[i + 1].y - pts[i].y, L = Math.hypot(dr, dy) || 1;
    sn.push([dy / L, -dr / L]);
  }
  const b = new Bau(R);
  const ringe = [];
  for (let i = 0; i < N; i++) {
    const a = sn[Math.max(0, i - 1)], c = sn[Math.min(N - 2, i)];
    let nr = a[0] + c[0], ny = a[1] + c[1];
    const L = Math.hypot(nr, ny) || 1; nr /= L; ny /= L;
    const P = pts[i], ring = [];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2, s = Math.sin(th), co = Math.cos(th);
      // Etikett von vorn projiziert, wie das Foto aufgenommen wurde; knapp innerhalb der Kontur abtasten
      ring.push(b.v(P.r * s, P.y, P.r * co, nr * s, ny, nr * co, P.c + P.rn * s * 0.95, 1 - P.yi));
    }
    ringe.push(ring);
  }
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg, A = ringe[i][j], B = ringe[i][j2], C = ringe[i + 1][j2], D = ringe[i + 1][j];
      b.i.push(A, B, C, A, C, D);
    }
  }
  // Deckel und Boden
  for (const [k, oben] of [[0, false], [N - 1, true]]) {
    const P = pts[k];
    if (P.r < 0.0015) continue;
    const ny = oben ? 1 : -1;
    const mitte = b.v(0, P.y, 0, 0, ny, 0, P.c, 1 - P.yi);
    const ring = [];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      ring.push(b.v(P.r * Math.sin(th), P.y, P.r * Math.cos(th), 0, ny, 0, P.c + P.rn * Math.sin(th) * 0.9, 1 - P.yi + (oben ? 0.004 : -0.004)));
    }
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      if (oben) b.i.push(mitte, ring[j], ring[j2]); else b.i.push(mitte, ring[j2], ring[j]);
    }
  }
  const rmax = Math.max(...pts.map(q => q.r));
  return { geo: b.geo(0, f.rau, f.metall, false), fw: rmax * 2, d: rmax * 2, h: pts[N - 1].y };
}

/* ---------- Tüte als Kissen ---------- */
function beutel(p, f, R, st) {
  const w = (p.breite_cm || 15) / 100, H = w / (p.seite || 0.8);
  const nx = f.nx, ny = f.ny;
  const raw = f._raw || (f._raw = Uint8Array.from(atob(f.d), c => c.charCodeAt(0)));
  const cw = 1 / (nx - 2), ch = 1 / (ny - 2);
  const D = (i, j) => raw[Math.max(0, Math.min(ny - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))] * (0.5 / 255);
  const probe = (u, v) => {   // bilinear im Raster, Zellmitte i liegt bei u = (i - 0.5) / (nx - 2)
    const gi = u * (nx - 2) + 0.5, gj = v * (ny - 2) + 0.5;
    const i0 = Math.floor(gi), j0 = Math.floor(gj), fi = gi - i0, fj = gj - j0;
    return (D(i0, j0) * (1 - fi) + D(i0 + 1, j0) * fi) * (1 - fj) + (D(i0, j0 + 1) * (1 - fi) + D(i0 + 1, j0 + 1) * fi) * fj;
  };
  // Ausdehnung der Tüte im Bild
  let uL = 1, uR = 0, vT = 1, vB = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (raw[j * nx + i]) {
    uL = Math.min(uL, (i - 1) * cw); uR = Math.max(uR, i * cw); vT = Math.min(vT, (j - 1) * ch); vB = Math.max(vB, j * ch);
  }
  const fw = (uR - uL) * w, hoehe = (vB - vT) * H;
  const dick = f.tiefe * fw;              // Dicke in der Mitte (beide Seiten zusammen)
  const rund = 0.2;                       // Rundungsbreite am Rand, in Bildbreiten
  const ry = st.raster, rx = Math.max(5, Math.round(ry * fw / hoehe));
  const mu = cw, mv = ch;                 // Rand außerhalb, damit der Umriss sauber vom Alphakanal kommt
  const u0 = uL - mu, u1 = uR + mu, v0 = vT - mv, v1 = vB + mv;
  const uMid = (uL + uR) / 2;
  const b = new Bau(R);
  const zFeld = [], innen = [];
  for (let j = 0; j <= ry; j++) for (let i = 0; i <= rx; i++) {
    const u = u0 + (u1 - u0) * i / rx, v = v0 + (v1 - v0) * j / ry;
    const d = probe(u, v);
    const t = Math.min(1, d / rund);
    let z = 0.5 * dick * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    if (st.falten) z *= 1 + 0.07 * Math.sin(u * 41 + v * 13) * Math.cos(v * 37 - u * 9);
    zFeld.push(z);
  }
  // Viereck behalten, wenn irgendeine Rasterzelle darin zur Tüte gehört
  const zelleInnen = (ua, ub, va, vb) => {
    const ia = Math.floor(ua * (nx - 2) + 1), ib = Math.ceil(ub * (nx - 2) + 1), ja = Math.floor(va * (ny - 2) + 1), jb = Math.ceil(vb * (ny - 2) + 1);
    for (let j = Math.max(0, ja); j <= Math.min(ny - 1, jb); j++) for (let i = Math.max(0, ia); i <= Math.min(nx - 1, ib); i++) if (raw[j * nx + i]) return true;
    return false;
  };
  for (let j = 0; j < ry; j++) for (let i = 0; i < rx; i++) {
    innen.push(zelleInnen(u0 + (u1 - u0) * i / rx, u0 + (u1 - u0) * (i + 1) / rx, v0 + (v1 - v0) * j / ry, v0 + (v1 - v0) * (j + 1) / ry));
  }
  for (const seite of [1, -1]) {
    const basis = b.p.length / 3;
    for (let j = 0; j <= ry; j++) for (let i = 0; i <= rx; i++) {
      const u = u0 + (u1 - u0) * i / rx, v = v0 + (v1 - v0) * j / ry;
      b.v((u - uMid) * w, (vB - v) * H, seite * zFeld[j * (rx + 1) + i], 0, 0, seite, u, v);
    }
    for (let j = 0; j < ry; j++) for (let i = 0; i < rx; i++) {
      if (!innen[j * rx + i]) continue;
      const A = basis + j * (rx + 1) + i, B = A + 1, C = A + rx + 2, Dd = A + rx + 1;
      // oben links A, oben rechts B, unten rechts C, unten links Dd (v wächst nach unten)
      if (seite > 0) b.i.push(Dd, C, B, Dd, B, A); else b.i.push(Dd, B, C, Dd, A, B);
    }
  }
  return { geo: b.geo(1, f.rau, f.metall, true), fw, d: dick, h: hoehe };
}

/* ---------- Quader ---------- */
function kiste(p, f, R) {
  const w = (p.breite_cm || 10) / 100, H = w / (p.seite || 1);
  const [u0, v0, u1, v1] = f.box;
  const bw = (u1 - u0) * w, bh = (v1 - v0) * H, bd = f.tiefe * bw;
  const x = bw / 2, z = bd / 2, e = 0.012;
  const b = new Bau(R);
  const flaeche = (ecken, n, uvs) => {
    const k = ecken.map((q, i) => b.v(q[0], q[1], q[2], n[0], n[1], n[2], uvs[i][0], uvs[i][1]));
    b.i.push(k[0], k[1], k[2], k[0], k[2], k[3]);
  };
  // jeweils unten links, unten rechts, oben rechts, oben links aus Sicht von außen
  flaeche([[-x, 0, z], [x, 0, z], [x, bh, z], [-x, bh, z]], [0, 0, 1], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
  flaeche([[x, 0, -z], [-x, 0, -z], [-x, bh, -z], [x, bh, -z]], [0, 0, -1], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
  flaeche([[x, 0, z], [x, 0, -z], [x, bh, -z], [x, bh, z]], [1, 0, 0], [[u1 - e, v1], [u1 - e, v1], [u1 - e, v0], [u1 - e, v0]]);
  flaeche([[-x, 0, -z], [-x, 0, z], [-x, bh, z], [-x, bh, -z]], [-1, 0, 0], [[u0 + e, v1], [u0 + e, v1], [u0 + e, v0], [u0 + e, v0]]);
  flaeche([[-x, bh, z], [x, bh, z], [x, bh, -z], [-x, bh, -z]], [0, 1, 0], [[u0, v0 + e], [u1, v0 + e], [u1, v0 + e], [u0, v0 + e]]);
  flaeche([[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]], [0, -1, 0], [[u0, v1 - e], [u1, v1 - e], [u1, v1 - e], [u0, v1 - e]]);
  return { geo: b.geo(0, f.rau, f.metall, false), fw: bw, d: bd, h: bh };
}

const BAUER = { dreh, beutel, kiste };

/* Ein Produkt in einer Detailstufe bauen. R = Lage im Atlas [x, y, breite, höhe] (Anteile). */
export function baueProdukt(p, form, R, stufe) {
  const bauer = BAUER[form && form.typ];
  if (!bauer) return null;
  return bauer(p, form, R, stufe);
}

/* Material für alle Produkte: Atlas als Farbe, Rauheit und Metall je Produkt aus dem Attribut aMat,
   Tüten schneiden ihren Umriss über den Alphakanal (aCut = 1), alles andere ist voll deckend. */
export function produktMaterial(atlas, mobil) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, roughness: 1, metalness: 0, alphaTest: 0.5, alphaToCoverage: !mobil, envMapIntensity: 1.1 });
  // weiches Licht von vorn oben (wie die Regalbeleuchtung), damit Etiketten lesbar sind und die Form trotzdem rund wirkt
  const licht = { uKey: { value: new THREE.Vector3(-0.25, 0.55, 0.8).normalize() }, uStark: { value: mobil ? 0.62 : 0.58 } };
  m.userData.licht = licht;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, licht);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCut;\nattribute vec2 aMat;\nvarying float vCut;\nvarying vec2 vMat;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n\tvCut = aCut; vMat = aMat;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vCut;\nvarying vec2 vMat;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n\tif (vCut < 0.5) diffuseColor.a = 1.0;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vMat.x;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vMat.y;")
      .replace("#include <common>", "#include <common>\nuniform vec3 uKey;\nuniform float uStark;")
      .replace("#include <opaque_fragment>", "outgoingLight += diffuseColor.rgb * uStark * (0.3 + 0.7 * max(dot(normal, uKey), 0.0)) * (1.0 - 0.6 * vMat.y);\n#include <opaque_fragment>");
  };
  m.customProgramCacheKey = () => "produkte3d";
  return m;
}
