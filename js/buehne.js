/* Bühne: zeigt eine Szene (Foto plus Tiefenkarte) als WebGL Bild mit echtem Tiefen Parallax.
   Bild füllt den Schirm wie object-fit: cover. Hochkant wird das breite Bild seitlich verschoben (pan).
   Zwei Ebenen (a, b) für weiche Überblendungen mit Zoom. Fällt ohne WebGL auf ein normales <img> zurück. */
(function () {
  const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; v.y = 1.0 - v.y; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `precision highp float;
varying vec2 v;
uniform sampler2D tA, dA, tB, dB;
uniform float aspA, aspB, view, mixAB, panA, panB, zoomA, zoomB, strength, focusA, focusB, vignette;
uniform vec2 zcA, zcB, ptr;
vec2 cover(vec2 s, float ia, float pan, float zoom, vec2 zc){
  vec2 uv = s;
  if (view < ia) { float fw = view / ia; uv.x = 0.5 + pan + (s.x - 0.5) * fw; }
  else { float fh = ia / view; uv.y = 0.5 + (s.y - 0.5) * fh; }
  return zc + (uv - zc) / zoom;
}
vec3 layer(sampler2D t, sampler2D d, vec2 uv, float focus){
  float dep = texture2D(d, uv).r;
  vec2 off = ptr * (dep - focus) * strength;
  // zweiter Abgriff glättet Kanten an Regalen
  float dep2 = texture2D(d, uv + off * 0.5).r;
  off = ptr * (mix(dep, dep2, 0.5) - focus) * strength;
  return texture2D(t, clamp(uv + off, 0.001, 0.999)).rgb;
}
void main(){
  vec3 a = layer(tA, dA, cover(v, aspA, panA, zoomA, zcA), focusA);
  vec3 col = a;
  if (mixAB > 0.001) {
    vec3 b = layer(tB, dB, cover(v, aspB, panB, zoomB, zcB), focusB);
    col = mix(a, b, mixAB);
  }
  float r = distance(v, vec2(0.5));
  col *= 1.0 - vignette * smoothstep(0.45, 0.95, r);
  gl_FragColor = vec4(col, 1.0);
}`;

  function ladeBild(src) {
    return new Promise((ok, fail) => {
      const i = new Image();
      i.decoding = "async";
      i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => ok(i));
      i.onerror = () => fail(new Error("Bild fehlt: " + src));
      i.src = src;
    });
  }

  class Buehne {
    constructor(canvas, fallbackImg) {
      this.canvas = canvas;
      this.img = fallbackImg;
      this.cache = new Map();
      this.a = null; this.b = null;
      this.s = { mix: 0, panA: 0, panB: 0, zoomA: 1, zoomB: 1, zcA: [0.5, 0.5], zcB: [0.5, 0.5] };
      this.ptr = [0, 0]; this.ptrZiel = [0, 0];
      this.staerke = 0.018; this.staerkeZiel = 0.018;
      this.idle = 0;
      try {
        this.gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
      } catch (e) { this.gl = null; }
      if (this.gl) this._init(); else this._ohneGL();
      this.groesse();
      addEventListener("resize", () => this.groesse());
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    _ohneGL() {
      this.canvas.hidden = true;
      this.img.hidden = false;
    }

    _init() {
      const gl = this.gl;
      const sh = (typ, src) => { const s = gl.createShader(typ); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      try {
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link");
        gl.useProgram(p);
        this.p = p;
      } catch (e) { console.warn("WebGL Shader", e); this.gl = null; this._ohneGL(); return; }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(this.p, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      ["tA", "dA", "tB", "dB", "aspA", "aspB", "view", "mixAB", "panA", "panB", "zoomA", "zoomB", "strength", "focusA", "focusB", "vignette", "zcA", "zcB", "ptr"]
        .forEach(n => (this.u[n] = gl.getUniformLocation(this.p, n)));
      gl.uniform1i(this.u.tA, 0); gl.uniform1i(this.u.dA, 1); gl.uniform1i(this.u.tB, 2); gl.uniform1i(this.u.dB, 3);
      this.canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); this.verloren = true; });
      this.canvas.addEventListener("webglcontextrestored", () => { this.verloren = false; this.cache.clear(); this._init(); if (this.aktuell) this.setze(this.aktuell); });
    }

    _tex(bild) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, bild);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    /* Szene laden (Bild, Tiefe, Tiefe auch als Pixel für Hotspots). Ergebnis wird gemerkt. */
    lade(sz) {
      if (this.cache.has(sz.bild)) return this.cache.get(sz.bild);
      const pr = Promise.all([ladeBild(sz.bild), ladeBild(sz.tiefe)]).then(([bild, tiefe]) => {
        const c = document.createElement("canvas");
        c.width = 128; c.height = Math.round(128 * tiefe.height / tiefe.width);
        const cx = c.getContext("2d", { willReadFrequently: true });
        cx.drawImage(tiefe, 0, 0, c.width, c.height);
        const px = cx.getImageData(0, 0, c.width, c.height);
        const e = { sz, bild, tiefe, asp: bild.width / bild.height, tiefePx: px, tw: c.width, th: c.height };
        if (this.gl && !this.verloren) { e.tB = this._tex(bild); e.tT = this._tex(tiefe); }
        return e;
      });
      pr.catch(() => this.cache.delete(sz.bild));
      this.cache.set(sz.bild, pr);
      return pr;
    }

    /* Szene sofort zeigen */
    async setze(sz, opt = {}) {
      const e = await this.lade(sz);
      this.aktuell = sz;
      this.a = e; this.b = null;
      this.s.mix = 0; this.s.zoomA = opt.zoom || 1; this.s.zcA = opt.zc || [0.5, 0.5];
      this.s.panA = this.klemmePan(opt.pan || 0, e.asp);
      this.img.src = sz.bild;
      return e;
    }

    /* weich überblenden, neue Szene kommt mit leichtem Zoom an */
    async blende(sz, opt = {}) {
      const e = await this.lade(sz);
      if (!this.a) return this.setze(sz, opt);
      this.b = e;
      if (opt.zcAlt) this.s.zcA = opt.zcAlt;
      this.s.mix = 0; this.s.zoomB = opt.vonZoom || 1.08; this.s.zcB = opt.zc || [0.5, 0.5];
      this.s.panB = this.klemmePan(opt.pan || 0, e.asp);
      const d = opt.dauer || 0.9;
      await new Promise(ok => {
        const tl = gsap.timeline({ onComplete: ok });
        tl.to(this.s, { mix: 1, duration: d, ease: "power2.inOut" }, 0)
          .to(this.s, { zoomB: 1, duration: d * 1.25, ease: "power3.out" }, 0);
        if (opt.zielZoom) tl.to(this.s, { zoomA: opt.zielZoom, duration: d, ease: "power2.in" }, 0);
      });
      this.a = e; this.b = null; this.aktuell = sz;
      Object.assign(this.s, { mix: 0, zoomA: 1, panA: this.s.panB, zcA: [0.5, 0.5] });
      this.img.src = sz.bild;
      return e;
    }

    /* sichtbarer Anteil der Bildbreite (1 = ganzes Bild sichtbar) */
    sichtbar(asp) { const v = this.w / this.h; return v < asp ? v / asp : 1; }
    klemmePan(pan, asp) { const fw = this.sichtbar(asp || (this.a && this.a.asp) || 1.79); const m = (1 - fw) / 2; return Math.max(-m, Math.min(m, pan)); }
    panMax() { return this.a ? (1 - this.sichtbar(this.a.asp)) / 2 : 0; }

    /* Bildkoordinate (0..1) -> Bildschirm px, inklusive Parallax der Tiefe an dieser Stelle */
    zuSchirm(x, y, mitTiefe = true) {
      const e = this.a; if (!e) return null;
      const view = this.w / this.h, s = this.s;
      let u = (x - s.zcA[0]) * s.zoomA + s.zcA[0], vv = (y - s.zcA[1]) * s.zoomA + s.zcA[1];
      if (mitTiefe) {
        const d = this.tiefeBei(x, y);
        u -= this.ptr[0] * (d - this.fokus(e)) * this.staerke;
        vv -= this.ptr[1] * (d - this.fokus(e)) * this.staerke;
      }
      let sx, sy;
      if (view < e.asp) { const fw = view / e.asp; sx = (u - 0.5 - s.panA) / fw + 0.5; sy = vv; }
      else { const fh = e.asp / view; sx = u; sy = (vv - 0.5) / fh + 0.5; }
      return [sx * this.w, sy * this.h];
    }

    tiefeBei(x, y) {
      const e = this.a; if (!e) return 0.5;
      const ix = Math.min(e.tw - 1, Math.max(0, Math.round(x * (e.tw - 1))));
      const iy = Math.min(e.th - 1, Math.max(0, Math.round(y * (e.th - 1))));
      return e.tiefePx.data[(iy * e.tw + ix) * 4] / 255;
    }
    fokus(e) { return (e && e.sz.fokus) || 0.45; }

    zeiger(x, y) { this.ptrZiel = [x, y]; this.idle = 0; }

    groesse() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.w = innerWidth; this.h = innerHeight;
      this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
      if (this.a) this.s.panA = this.klemmePan(this.s.panA, this.a.asp);
      if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    _loop(t) {
      requestAnimationFrame(this._loop);
      // Zeiger weich nachziehen, bei Ruhe leicht atmen
      this.idle += 1;
      const atem = this.idle > 90 && !this.ruhig ? [Math.sin(t / 2600) * 0.35, Math.cos(t / 3300) * 0.2] : [0, 0];
      const zx = this.ruhig ? 0 : this.ptrZiel[0] + atem[0], zy = this.ruhig ? 0 : this.ptrZiel[1] + atem[1];
      this.ptr[0] += (zx - this.ptr[0]) * 0.06;
      this.ptr[1] += (zy - this.ptr[1]) * 0.06;
      this.staerke += (this.staerkeZiel - this.staerke) * 0.08;
      if (this.onFrame) this.onFrame();
      if (!this.gl || !this.a || this.verloren || document.hidden) return;
      const gl = this.gl, u = this.u, s = this.s, a = this.a, b = this.b || this.a;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tB);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a.tT);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, b.tB);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, b.tT);
      gl.uniform1f(u.aspA, a.asp); gl.uniform1f(u.aspB, b.asp);
      gl.uniform1f(u.view, this.w / this.h);
      gl.uniform1f(u.mixAB, this.b ? s.mix : 0);
      gl.uniform1f(u.panA, s.panA); gl.uniform1f(u.panB, s.panB);
      gl.uniform1f(u.zoomA, s.zoomA); gl.uniform1f(u.zoomB, s.zoomB);
      gl.uniform2f(u.zcA, s.zcA[0], s.zcA[1]); gl.uniform2f(u.zcB, s.zcB[0], s.zcB[1]);
      gl.uniform1f(u.focusA, this.fokus(a)); gl.uniform1f(u.focusB, this.fokus(b));
      gl.uniform1f(u.strength, this.staerke);
      gl.uniform1f(u.vignette, 0.38);
      gl.uniform2f(u.ptr, this.ptr[0], this.ptr[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  window.Buehne = Buehne;
})();
