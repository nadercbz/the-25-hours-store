/* The 25 Hours Store · Steuerung der begehbaren Website.
   Orte: "vorne" (vor dem Laden), "innen" (im Laden), oder eine Kategorie ID (vor dem Regal).
   Wege zwischen Orten laufen als Higgsfield Kamerafahrt (Video), sonst als Zoom Überblendung.
   Adressen: #/  #/laden  #/laden/<kategorie>  #/laden/<kategorie>/<produkt>  #/ueber-uns  #/standorte (früher #/besuch)  #/impressum  #/datenschutz */
(function () {
  "use strict";
  const D = window.STORE, V = window.VIDEOS || {};
  const $ = s => document.querySelector(s);
  const body = document.body;
  const REDUZIERT = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SPAREN = !!(navigator.connection && navigator.connection.saveData);
  const KAT = Object.fromEntries(D.kategorien.map(k => [k.id, k]));
  const istKat = id => !!KAT[id];
  const hochkant = () => innerWidth / innerHeight < 0.9;
  const MOBIL = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600;
  // Produkte: echtes Sortiment aus den Ladenfotos (js/sortiment.js), sonst die Beispiele aus daten.js
  const SORT = Array.isArray(window.SORTIMENT) && window.SORTIMENT.length ? window.SORTIMENT : null;
  const PROD = Object.fromEntries(D.kategorien.map(k => [k.id, SORT
    ? SORT.filter(p => p.kat === k.id).map(p => ({ id: p.id, name: p.name, info: p.info, text: p.text || "", tags: [p.marke].filter(Boolean),
        bild: `assets/sortiment/${p.id}.webp`, sm: `assets/sortiment/sm/${p.id}.webp` }))
    : k.produkte.map(p => ({ ...p, bild: `assets/produkte/${p.id}.webp`, sm: `assets/produkte/sm/${p.id}.webp` }))]));
  // Begehbarer 3D Laden (js/laden3d.js). Mit ?foto in der Adresse gibt es die alte Fassung mit Fotos und Videos.
  const MIT3D = !/[?&]foto\b/.test(location.search) && !!window.WebGL2RenderingContext;
  let L3 = null, l3Bereit = null;
  const station = o => (o === "innen" ? "innen" : o);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  /* ---------- Szenen ---------- */
  const FOKUS = { vorne: 0.46, innen: 0.42, drinks: 0.5, snacks: 0.5, sweets: 0.5, eis: 0.5, bierwein: 0.5, kasse: 0.48 };
  function szene(id) {
    const klein = !hochkant() && innerWidth * Math.min(devicePixelRatio || 1, 2) < 1700;
    if (id === "vorne" && hochkant()) return { id, bild: "assets/szenen/front-hoch.webp", tiefe: "assets/szenen/front-hoch-t.png", fokus: 0.5 };
    const name = id === "vorne" ? "front" : id;
    return { id, bild: `assets/szenen/${name}${klein ? "-m" : ""}.webp`, tiefe: `assets/szenen/${name}-t.png`, fokus: FOKUS[id] || 0.45 };
  }
  // klickbare Flächen vor dem Laden, in Bildanteilen [x0, y0, x1, y1]
  const FLAECHEN = {
    breit: { schild: [0.30, 0.16, 0.70, 0.315], tuer: [0.19, 0.37, 0.73, 0.80] },
    hoch: { schild: [0.18, 0.205, 0.85, 0.30], tuer: [0.04, 0.33, 0.90, 0.58] }
  };

  /* ---------- Bühne ---------- */
  const buehne = new Buehne($("#gl"), $("#glErsatz"));
  const video = $("#fahrt");
  let ort = null, belegt = false, umgeschaut = false;

  /* ---------- Ton (WebAudio, nur nach Klick) ---------- */
  const Ton = {
    an: (() => { try { return localStorage.getItem("25h-ton") !== "aus"; } catch (e) { return true; } })(),
    ctx: null,
    bereit() { if (!this.an) return null; try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === "suspended") this.ctx.resume(); } catch (e) { return null; } return this.ctx; },
    ton(f, t0, dauer, laut, typ = "sine") {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = typ; o.frequency.value = f; g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(laut, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dauer + 0.05);
    },
    tuer() { const c = this.bereit(); if (!c) return; const t = c.currentTime + 0.05; this.ton(1318.5, t, 1.1, 0.06); this.ton(659.3, t, 1.1, 0.05); this.ton(1046.5, t + 0.38, 1.4, 0.06); this.ton(523.3, t + 0.38, 1.4, 0.05); },
    klick() { const c = this.bereit(); if (!c) return; this.ton(1900, c.currentTime, 0.06, 0.025, "triangle"); },
    pop() { const c = this.bereit(); if (!c) return; const t = c.currentTime; this.ton(520, t, 0.18, 0.05, "sine"); this.ton(880, t + 0.05, 0.16, 0.035, "sine"); },
    wusch(dauer = 2) {
      const c = this.bereit(); if (!c) return;
      const n = c.sampleRate * dauer, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
      s.buffer = b; f.type = "lowpass"; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(900, t + dauer * 0.5); f.frequency.linearRampToValueAtTime(260, t + dauer);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + dauer * 0.35); g.gain.linearRampToValueAtTime(0, t + dauer);
      s.connect(f).connect(g).connect(c.destination); s.start(t);
    },
    setze(an) {
      this.an = an; try { localStorage.setItem("25h-ton", an ? "an" : "aus"); } catch (e) {}
      $("#ton").setAttribute("aria-pressed", an); $("#tonMenue").textContent = an ? "Ton an" : "Ton aus";
      if (an) this.klick();
    }
  };
  $("#ton").addEventListener("click", () => Ton.setze(!Ton.an));
  $("#tonMenue").addEventListener("click", () => Ton.setze(!Ton.an));
  Ton.setze.call({ ...Ton, klick() {} }, Ton.an);

  /* ---------- Videos vorladen (als Blob, damit sie sofort starten) ---------- */
  const vCache = new Map();
  function vorladen(name) {
    const url = V[name];
    if (!url || REDUZIERT || vCache.has(name)) return vCache.get(name);
    const p = fetch(url).then(r => (r.ok ? r.blob() : null)).then(b => (b ? URL.createObjectURL(b) : url)).catch(() => url);
    vCache.set(name, p);
    return p;
  }
  async function vorladenReihe(namen) {
    if (SPAREN) return;
    for (const n of namen) { await vorladen(n); await sleep(120); }
  }
  async function quelle(name) {
    const url = V[name]; if (!url) return null;
    if (!vCache.has(name)) return url;
    return Promise.race([vCache.get(name), sleep(500).then(() => url)]);
  }

  /* ---------- Kamerafahrt abspielen ---------- */
  let ueberspringen = null;
  function spiele(name, rate, ziel) {
    return new Promise(async fertig => {
      const src = await quelle(name);
      if (!src) return fertig(false);
      let erledigt = false, laeuft = false;
      const ende = async ok => {
        if (erledigt) return; erledigt = true;
        clearTimeout(wache); video.onplaying = video.onended = video.onerror = null; ueberspringen = null;
        $("#ueberspringen").hidden = true;
        if (!ok || !laeuft) { video.classList.remove("an"); video.pause(); return fertig(false); }
        try { await buehne.setze(ziel); } catch (e) {}
        await raf2();
        video.classList.remove("an");
        await sleep(200);
        video.pause();
        fertig(true);
      };
      const wache = setTimeout(() => { if (!laeuft) ende(false); }, 5000);
      video.onplaying = () => {
        if (laeuft) return; laeuft = true; clearTimeout(wache);
        video.playbackRate = rate;
        body.dataset.fahrt = ((body.dataset.fahrt ? body.dataset.fahrt + " " : "") + name).slice(-200); // für den Prüfstand
        requestAnimationFrame(() => video.classList.add("an"));
        $("#ueberspringen").hidden = false;
      };
      video.onended = () => ende(true);
      video.onerror = () => ende(false);
      ueberspringen = () => ende(true);
      video.src = src; video.muted = true; video.playbackRate = rate;
      try { video.currentTime = 0; } catch (e) {}
      const p = video.play(); if (p) p.catch(() => ende(false));
    });
  }
  $("#ueberspringen").addEventListener("click", () => ueberspringen && ueberspringen());

  /* ---------- Wege zwischen Orten ---------- */
  // Hochkant gibt es eigene Fahrten (Mitte des breiten Videos), sonst die breite Fassung
  const vname = basis => (hochkant() && V[basis + "-hoch"] ? basis + "-hoch" : basis);
  function wege(von, nach) {
    if (von === nach) return [];
    if (von === "vorne" && nach === "innen") return [{ video: vname("rein"), ziel: "innen", zc: [0.5, 0.6], ton: "tuer" }];
    if (von === "innen" && nach === "vorne") return [{ video: vname("raus"), ziel: "vorne", zc: [0.5, 0.5], ton: "wusch" }];
    if (von === "innen" && istKat(nach)) return [{ video: vname("zu-" + nach), ziel: nach, zc: KAT[nach].hub.map(v => v / 100), ton: "wusch", rate: 1.25 }];
    if (istKat(von) && nach === "innen") return [{ video: vname("von-" + von), ziel: "innen", zc: [0.5, 0.5], ton: "wusch", rate: 1.4 }];
    if (istKat(von) && istKat(nach)) return [{ ziel: nach, zc: [0.5, 0.5] }];
    if (von === "vorne" && istKat(nach)) return [{ ...wege("vorne", "innen")[0], rate: 1.35 }, { ...wege("innen", nach)[0], rate: 1.2 }];
    if (istKat(von) && nach === "vorne") return [{ ...wege(von, "innen")[0], rate: 1.6 }, { ...wege("innen", "vorne")[0], rate: 1.4 }];
    return [{ ziel: nach }];
  }

  async function gehe(nach, opt = {}) {
    if (!nach || nach === ort) return;
    if (belegt) { gehe.warte = nach; return; }
    belegt = true; body.classList.add("faehrt");
    produktZu(true);
    zeigeUI(null);
    tippEl.classList.remove("an");
    if (nach !== "vorne" && !L3 && l3Bereit) await warte3D();
    const schritte = L3 ? [] : ort == null || opt.sofort ? [{ ziel: nach, sofort: true }] : wege(ort, nach);
    if (L3) await wege3D(ort, nach, opt);
    for (const st of schritte) {
      const ziel = szene(st.ziel);
      buehne.lade(ziel).catch(() => {});
      if (st.sofort) { await buehne.setze(ziel); continue; }
      buehne.ruhig = true;
      gsap.killTweensOf(buehne.s);
      if (Math.abs(buehne.s.panA) > 0.001) await new Promise(r => gsap.to(buehne.s, { panA: 0, duration: 0.45, ease: "power2.inOut", onComplete: r }));
      await sleep(120);
      if (st.ton === "tuer") Ton.tuer(); else if (st.ton) Ton.wusch(1.6 / (st.rate || 1));
      let ok = false;
      if (st.video && !REDUZIERT) ok = await spiele(st.video, st.rate || 1, ziel);
      if (!ok) await buehne.blende(ziel, { dauer: REDUZIERT ? 0.4 : 0.95, vonZoom: REDUZIERT ? 1 : 1.1, zielZoom: REDUZIERT ? 1 : 1.35, zcAlt: st.zc || [0.5, 0.5] });
      ort = st.ziel; body.dataset.ort = ortArt(ort);
    }
    ort = nach; body.dataset.ort = ortArt(nach);
    buehne.ruhig = false;
    body.classList.remove("faehrt");
    belegt = false;
    zeigeUI(nach);
    nachAnkunft(nach);
    if (gehe.warte && gehe.warte !== ort) { const w = gehe.warte; gehe.warte = null; gehe(w); } else gehe.warte = null;
  }
  const ortArt = o => (istKat(o) ? "regal" : o);

  /* ---------- Wege im 3D Laden ---------- */
  const TUER = { breit: [0.46, 0.585], hoch: [0.47, 0.455] };
  async function wege3D(von, nach, opt) {
    const sofort = von == null || opt.sofort;
    L3.belegt = true;
    if (sofort) {
      L3.setzeStation(station(nach)); L3.zeige(true); buehne.pausiert = true;
    } else if (nach === "vorne") {
      // rückwärts hinaus in die Mall, der Laden bleibt im Blick
      Ton.wusch(1.8);
      if (!L3.aktiv) { L3.setzeStation("vorne"); L3.zeige(true); buehne.pausiert = true; }
      else await L3.fahre("vorne");
    } else if (von === "vorne" && !L3.aktiv) {
      // 3D wurde erst fertig, als schon das Foto stand: vom Foto in die Tür zoomen und dort in 3D weiterfahren
      Ton.tuer();
      L3.setzeStation("eingang");
      buehne.ruhig = true;
      gsap.killTweensOf(buehne.s);
      buehne.s.zcA = hochkant() ? TUER.hoch : TUER.breit;
      if (!REDUZIERT) gsap.to(buehne.s, { zoomA: 1.5, panA: 0, duration: 0.95, ease: "power2.in" });
      await sleep(REDUZIERT ? 0 : 420);
      L3.zeige(true);
      await sleep(REDUZIERT ? 0 : 620);
      buehne.pausiert = true;
      await L3.fahre(station(nach));
    } else {
      if (von === "vorne") Ton.tuer();
      await L3.fahre(station(nach));
    }
    L3.belegt = false;
  }
  // Startansicht in 3D: sobald der Laden geladen ist, ersetzt die 3D Mall das Foto vor dem Laden (weiche Überblendung)
  function vorne3D() {
    if (!L3 || ort !== "vorne" || belegt || L3.aktiv) return;
    L3.setzeStation("vorne");
    L3.zeige(true);
    setTimeout(() => { if (ort === "vorne" && L3.aktiv) buehne.pausiert = true; }, 700);
    punkte.innerHTML = ""; randpfeile.innerHTML = ""; aktivePunkte = [];
    baueVorne();
  }

  /* 3D Laden laden: Modell, Lightmaps, Produktatlas. Bei Fehler bleibt die Fassung mit Fotos. */
  function starte3D(fortschritt) {
    return new Promise((ok, fehler) => {
      if (window.Laden3D) return ok();
      document.addEventListener("laden3d", ok, { once: true });
      setTimeout(() => fehler(new Error("3D Modul lädt nicht")), 20000);
    }).then(async () => {
      const l = new window.Laden3D($("#buehne"), { mobil: MOBIL, reduziert: REDUZIERT, sortiment: SORT || [] });
      await l.laden(fortschritt || (() => {}));
      l.onFrame = rahmen3D;
      l.onProdukt = id => {
        const p = SORT && SORT.find(x => x.id === id);
        if (!p) return;
        Ton.klick();
        los(`#/laden/${p.kat}/${id}`);
      };
      l.onHover = tipp3D;
      L3 = l;
      window.laden3d = l;   // zum Prüfen in der Konsole
      body.classList.add("mit3d");
      return l;
    }).catch(e => { console.warn("3D Laden nicht verfügbar, nutze Fotos:", e); l3Bereit = null; return null; });
  }
  // Wer vor dem fertigen Laden reingeht, sieht kurz die Ladeanzeige
  async function warte3D() {
    const lader = $("#lader"), balken = $("#ladeBalken");
    const t = setTimeout(() => { balken.style.width = "35%"; lader.classList.add("zwischen"); body.classList.add("laedt"); }, 250);
    await l3Bereit;
    clearTimeout(t);
    if (body.classList.contains("laedt")) { balken.style.width = "100%"; await sleep(200); body.classList.remove("laedt"); lader.classList.remove("zwischen"); }
  }
  const tippEl = document.createElement("div");
  tippEl.className = "tipp3d"; tippEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(tippEl);
  function tipp3D(p, x, y) {
    if (!p || belegt) { tippEl.classList.remove("an"); return; }
    if (tippEl.dataset.id !== p.id) { tippEl.dataset.id = p.id; tippEl.innerHTML = `<b>${p.name}</b><span>${p.info}</span>`; }
    tippEl.style.transform = `translate3d(${Math.round(x + 16)}px, ${Math.round(y + 18)}px, 0)`;
    tippEl.classList.add("an");
  }

  function nachAnkunft(o) {
    ansage(o === "vorne" ? "Du stehst vor dem Laden." : o === "innen" ? "Du bist im Laden. Wähle einen Bereich." : `${KAT[o].name}. ${KAT[o].titel}.`);
    if (L3 || l3Bereit) return;
    if (o === "vorne") vorladen(vname("rein"));
    if (o === "innen") {
      setTimeout(() => vorladenReihe([...D.kategorien.map(k => vname("zu-" + k.id)), vname("raus")]), 1500);
      if (hochkant() && !umgeschaut && !REDUZIERT) umschauen();
    }
    if (istKat(o)) { vorladen(vname("von-" + o)); D.kategorien.forEach(k => buehne.lade(szene(k.id)).catch(() => {})); }
    // Szenen im Hintergrund schon mal laden
    if (o === "vorne") setTimeout(() => buehne.lade(szene("innen")).catch(() => {}), 800);
    if (o === "innen") setTimeout(() => D.kategorien.forEach(k => buehne.lade(szene(k.id)).catch(() => {})), 1200);
  }

  // Handy: einmal kurz nach links und rechts schauen, damit klar ist, dass man sich umsehen kann
  function umschauen() {
    umgeschaut = true;
    const m = buehne.panMax(); if (m < 0.02) return;
    gsap.timeline({ delay: 0.5 })
      .to(buehne.s, { panA: -m * 0.85, duration: 1.3, ease: "sine.inOut" })
      .to(buehne.s, { panA: m * 0.85, duration: 2.0, ease: "sine.inOut" })
      .to(buehne.s, { panA: 0, duration: 1.2, ease: "sine.inOut" });
  }

  /* ---------- Oberfläche je Ort ---------- */
  const punkte = $("#punkte"), randpfeile = $("#randpfeile");
  let aktivePunkte = [];

  function zeigeUI(o) {
    const art = o == null ? null : ortArt(o);
    toggle($("#tafelVorne"), art === "vorne");
    toggle($("#tafelInnen"), art === "innen");
    toggle($("#tafelRegal"), art === "regal");
    toggle($("#dock"), art === "innen" || art === "regal", true);
    toggle($("#leiste"), art === "regal", true);
    punkte.classList.remove("an");
    punkte.innerHTML = ""; randpfeile.innerHTML = ""; aktivePunkte = [];
    document.querySelectorAll(".kopf__nav a").forEach(a => a.removeAttribute("aria-current"));
    if (art) document.querySelector('.kopf__nav a[data-nav="laden"]').toggleAttribute("aria-current", art !== "vorne");
    if (art === "vorne") baueVorne();
    if (art === "innen") baueInnen();
    if (art === "regal") baueRegal(KAT[o]);
    if (art) {
      baueDock(o);
      requestAnimationFrame(() => punkte.classList.add("an"));
      einblenden(art);
    }
  }
  function toggle(el, an, mitWeg) {
    if (an) { el.hidden = false; el.classList.add("weg"); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("weg"))); }
    else if (!el.hidden) { el.classList.add("weg"); setTimeout(() => { if (el.classList.contains("weg")) el.hidden = true; }, mitWeg ? 450 : 420); }
  }
  function einblenden(art) {
    if (REDUZIERT) return;
    const tafel = art === "vorne" ? "#tafelVorne" : art === "innen" ? "#tafelInnen" : "#tafelRegal";
    gsap.fromTo(`${tafel} .tafel__kicker, ${tafel} .tafel__titel > span, ${art === "regal" ? "#regalTitel, " : ""}${tafel} .tafel__text, ${tafel} .tafel__aktion > *, ${tafel} .tafel__tipp`,
      { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.07, ease: "power3.out", delay: 0.1, clearProps: "transform,opacity" });
  }

  function punkt({ x, y, w, name, farbe, klein, aria, onClick, id }) {
    const b = document.createElement("button");
    b.className = "punkt" + (klein ? " punkt--klein" : "");
    b.style.setProperty("--c", farbe || "var(--orange-hell)");
    b.setAttribute("aria-label", aria || name);
    b.innerHTML = `<span class="punkt__kern">${klein ? "<i>+</i>" : ""}</span><span class="punkt__name">${name}</span>`;
    b.addEventListener("click", e => { e.stopPropagation(); if (zug.bewegt) return; Ton.klick(); onClick(); });
    punkte.appendChild(b);
    const p = w ? { el: b, w, name, id } : { el: b, x: x / 100, y: y / 100, name, id };
    aktivePunkte.push(p);
    return p;
  }

  function flaeche(box, art, inhalt, aria, onClick, welt) {
    const b = document.createElement("button");
    b.className = "flaeche flaeche--" + art;
    b.setAttribute("aria-label", aria);
    b.innerHTML = inhalt;
    b.addEventListener("click", e => { e.stopPropagation(); onClick(); });
    punkte.appendChild(b);
    aktivePunkte.push(welt ? { el: b, wbox: welt.map(([X, y, Y]) => L3.planPunkt(X, y, Y)) } : { el: b, box });
  }

  function baueVorne() {
    if (L3 && L3.aktiv) {
      // Tür (Plan X 2,0 bis 4,4) und Logo an der Fassade, als Rechtecke in der Welt
      flaeche(null, "tuer", `<span class="flaeche__marke">Reinkommen</span>`, "Reinkommen in den Laden", () => los("#/laden"), [[2.05, 0.1, 0], [4.35, 2.38, 0]]);
      flaeche(null, "schild", `<span class="flaeche__marke"><i></i>Über uns</span>`, "Über den Laden", () => los("#/ueber-uns"), [[1.05, 2.58, -0.12], [4.75, 3.36, -0.12]]);
      return;
    }
    const f = hochkant() ? FLAECHEN.hoch : FLAECHEN.breit;
    flaeche(f.tuer, "tuer", `<span class="flaeche__marke">Reinkommen</span>`, "Reinkommen in den Laden", () => los("#/laden"));
    flaeche(f.schild, "schild", `<span class="flaeche__marke"><i></i>Über uns</span>`, "Über den Laden", () => los("#/ueber-uns"));
  }

  function baueInnen() {
    D.kategorien.forEach(k => punkt({ ...(L3 ? { w: L3.anker(k.id) } : { x: k.hub[0], y: k.hub[1] }), name: k.name, farbe: k.neon, aria: `${k.name}: näher rangehen`, onClick: () => los("#/laden/" + k.id) }));
  }

  function baueRegal(k) {
    $("#regalKicker").textContent = "Im Laden · " + k.name;
    $("#regalTitel").textContent = k.titel;
    $("#regalTitel").style.setProperty("--neon", k.neon);
    $("#regalTitel").style.color = k.neon;
    $("#regalTitel").style.textShadow = `0 0 8px ${k.neon}, 0 0 26px ${k.neon}88`;
    $("#regalText").textContent = k.text;
    const h = $("#regalHinweis"); h.hidden = !k.hinweis; h.textContent = k.hinweis || "";
    const liste = PROD[k.id];
    if (L3) {
      L3.produktPunkte(k.id, MOBIL ? 4 : 5).forEach(({ id, w }) => {
        const p = liste.find(x => x.id === id);
        if (p) punkt({ w, id, name: p.name, farbe: k.neon, klein: true, aria: `${p.name} ansehen`, onClick: () => los(`#/laden/${k.id}/${p.id}`) });
      });
    } else k.produkte.filter(p => p.pos).forEach(p => punkt({ x: p.pos[0], y: p.pos[1], name: p.name, farbe: k.neon, klein: true, aria: `${p.name} ansehen`, onClick: () => los(`#/laden/${k.id}/${p.id}`) }));
    const spur = $("#leisteSpur");
    spur.innerHTML = "";
    liste.forEach((p, i) => {
      const b = document.createElement("button");
      b.className = "ware"; b.setAttribute("role", "listitem");
      b.style.setProperty("--c", k.neon);
      b.innerHTML = `<span class="ware__bild"><img src="${p.sm}" alt="" loading="lazy"></span><span class="ware__name">${p.name}</span><span class="ware__info">${p.info}</span>`;
      b.addEventListener("click", () => { Ton.klick(); los(`#/laden/${k.id}/${p.id}`); });
      b.addEventListener("mouseenter", () => { markiere(p.name, true); if (L3) L3.markiere(p.id, true); });
      b.addEventListener("mouseleave", () => { markiere(p.name, false); if (L3 && !(pAktiv && PROD[pAktiv.k.id][pAktiv.i].id === p.id)) L3.markiere(p.id, false); });
      spur.appendChild(b);
      setTimeout(() => b.classList.add("da"), REDUZIERT ? 0 : 260 + i * 70);
    });
    spur.scrollLeft = 0;
  }
  function markiere(name, an) { aktivePunkte.forEach(p => p.name === name && p.el.classList.toggle("zeigen", an)); }

  function baueDock(o) {
    const z = $("#zurueck");
    z.querySelector("span").textContent = o === "innen" ? "Raus" : "Zurück";
    z.setAttribute("aria-label", o === "innen" ? "Zurück vor den Laden" : "Zurück in den Laden");
    z.onclick = () => los(o === "innen" ? "#/" : "#/laden");
    const l = $("#dockListe");
    if (!l.children.length) {
      D.kategorien.forEach(k => {
        const b = document.createElement("button");
        b.dataset.id = k.id; b.style.setProperty("--c", k.neon);
        b.innerHTML = `<i></i>${k.name}`;
        b.addEventListener("click", () => { Ton.klick(); los("#/laden/" + k.id); });
        l.appendChild(b);
      });
    }
    [...l.children].forEach(b => b.setAttribute("aria-current", b.dataset.id === o));
    const akt = l.querySelector('[aria-current="true"]');
    if (akt) akt.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  /* Punkte im 3D Laden: Weltposition auf den Schirm, außerhalb gibt es Randpfeile zum Hindrehen */
  function rahmen3D() {
    if (!aktivePunkte.length || belegt) return;
    const w = L3.w, h = L3.h;
    const links = [], rechts = [];
    for (const p of aktivePunkte) {
      if (p.wbox) {
        const [a, b] = p.wbox, ecken = [a, b, a.clone().setY(b.y), b.clone().setY(a.y)].map(v => L3.zuSchirm(v));
        if (ecken.some(e => !e)) { p.el.style.visibility = "hidden"; continue; }
        const xs = ecken.map(e => e[0]), ys = ecken.map(e => e[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        Object.assign(p.el.style, { visibility: "visible", left: x0 + "px", top: y0 + "px", width: Math.max(...xs) - x0 + "px", height: Math.max(...ys) - y0 + "px" });
        continue;
      }
      if (!p.w) continue;
      const s = L3.zuSchirm(p.w);
      const drin = s && s[0] > 8 && s[0] < w - 8 && s[1] > 40 && s[1] < h - 20;
      if (s) p.el.style.transform = `translate3d(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px, 0)`;
      p.el.style.visibility = drin ? "visible" : "hidden";
      if (drin) p.el.classList.toggle("punkt--links", s[0] > w - Math.min(220, w * 0.42));
      else if (!p.id) (L3.seite(p.w) < 0 ? links : rechts).push(p);
    }
    randpfeil("l", links); randpfeil("r", rechts);
  }

  /* Punkte jedes Bild an die Szene heften (mit Tiefe, damit sie mit dem Raum mitgehen) */
  buehne.onFrame = () => {
    if (!aktivePunkte.length || belegt) return;
    const w = buehne.w, h = buehne.h;
    let links = [], rechts = [];
    for (const p of aktivePunkte) {
      if (p.box) {
        const a = buehne.zuSchirm(p.box[0], p.box[1], false), b = buehne.zuSchirm(p.box[2], p.box[3], false);
        if (!a) continue;
        Object.assign(p.el.style, { left: a[0] + "px", top: a[1] + "px", width: b[0] - a[0] + "px", height: b[1] - a[1] + "px" });
        continue;
      }
      const s = buehne.zuSchirm(p.x, p.y);
      if (!s) continue;
      p.el.style.transform = `translate3d(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px, 0)`;
      const raus = s[0] < 8 || s[0] > w - 8;
      p.el.style.visibility = raus ? "hidden" : "visible";
      p.el.classList.toggle("punkt--links", s[0] > w - Math.min(220, w * 0.42));
      if (s[0] < 8) links.push(p); else if (s[0] > w - 8) rechts.push(p);
    }
    randpfeil("l", links); randpfeil("r", rechts);
    // Ohne WebGL: Bildausschnitt am Ersatzbild nachziehen
    if (!buehne.gl && buehne.a) { const m = buehne.panMax(); $("#glErsatz").style.objectPosition = `${m > 0 ? 50 + (buehne.s.panA / m) * 50 : 50}% 50%`; }
  };
  const pfeile = {};
  function randpfeil(seite, liste) {
    let el = pfeile[seite];
    if (!el || !el.isConnected) {
      el = pfeile[seite] = document.createElement("button");
      el.className = "randpfeil randpfeil--" + seite;
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${seite === "l" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}"/></svg><span></span>`;
      el.addEventListener("click", () => { const z = el._ziel; if (!z) return; if (z.w && L3) L3.schaueZu(z.w); else schwenke(z.x); });
      randpfeile.appendChild(el);
    }
    el.hidden = !liste.length;
    if (liste.length) {
      const z = liste[0].w ? liste[0] : seite === "l" ? liste.reduce((a, b) => (a.x > b.x ? a : b)) : liste.reduce((a, b) => (a.x < b.x ? a : b));
      el._ziel = z;
      const t = liste.length > 1 ? `${z.name} +${liste.length - 1}` : z.name;
      if (el.lastChild.textContent !== t) el.lastChild.textContent = t;
      el.setAttribute("aria-label", "Umschauen: " + z.name);
    }
  }
  function schwenke(x) {
    const ziel = buehne.klemmePan(x - 0.5);
    gsap.to(buehne.s, { panA: ziel, duration: 0.9, ease: "power3.inOut" });
  }

  /* ---------- Zeiger, Ziehen, Rad ---------- */
  const zug = { an: false, x: 0, pan: 0, bewegt: false, vx: 0, t: 0 };
  const buehnenEl = $("#buehne");
  addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") buehne.zeiger((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    if (!zug.an) return;
    const dx = e.clientX - zug.x;
    if (Math.abs(dx) > 6) { zug.bewegt = true; body.classList.add("zieht"); }
    if (zug.bewegt && buehne.a) {
      const fw = buehne.sichtbar(buehne.a.asp);
      const neu = buehne.klemmePan(zug.pan - (dx / innerWidth) * fw);
      const jetzt = performance.now();
      zug.vx = (neu - buehne.s.panA) / Math.max(1, jetzt - zug.t); zug.t = jetzt;
      buehne.s.panA = neu;
      if (e.pointerType !== "mouse") buehne.zeiger(Math.max(-1, Math.min(1, -dx / 160)), 0);
    }
  }, { passive: true });
  buehnenEl.addEventListener("pointerdown", e => {
    if (belegt || (L3 && L3.aktiv) || buehne.panMax() < 0.005 || e.target.closest("button")) { zug.bewegt = false; return; }
    gsap.killTweensOf(buehne.s, "panA");
    Object.assign(zug, { an: true, x: e.clientX, pan: buehne.s.panA, bewegt: false, vx: 0, t: performance.now() });
  });
  addEventListener("pointerup", () => {
    if (!zug.an) return;
    zug.an = false; body.classList.remove("zieht");
    if (zug.bewegt) gsap.to(buehne.s, { panA: buehne.klemmePan(buehne.s.panA + zug.vx * 260), duration: 0.9, ease: "power3.out" });
    buehne.zeiger(0, 0);
    setTimeout(() => (zug.bewegt = false), 30);
  });
  addEventListener("pointercancel", () => { zug.an = false; body.classList.remove("zieht"); });
  const ziehbar = () => body.classList.toggle("ziehbar", (L3 && L3.aktiv) || (buehne.panMax() > 0.005 && ort !== "vorne"));
  addEventListener("resize", () => { ziehbar(); if (ort === "vorne" && buehne.aktuell && buehne.aktuell.bild !== szene("vorne").bild) buehne.setze(szene("vorne")); });
  // Handy: leichtes Mitgehen mit der Neigung (Android ohne Nachfrage, iOS nur nach Freigabe)
  addEventListener("deviceorientation", e => {
    if (e.gamma == null || zug.an) return;
    buehne.zeiger(Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
  });

  let radSperre = 0;
  addEventListener("wheel", e => {
    if (body.classList.contains("panel") || Date.now() < radSperre || belegt) return;
    if (ort === "vorne" && e.deltaY > 30) { radSperre = Date.now() + 1500; los("#/laden"); }
  }, { passive: true });
  // Wischen nach oben vor dem Laden = reingehen
  let wisch = null;
  addEventListener("touchstart", e => { wisch = e.touches.length === 1 ? { y: e.touches[0].clientY, x: e.touches[0].clientX } : null; }, { passive: true });
  addEventListener("touchend", e => {
    if (!wisch || ort !== "vorne" || belegt || body.classList.contains("panel")) return;
    const t = e.changedTouches[0], dy = wisch.y - t.clientY, dx = Math.abs(wisch.x - t.clientX);
    if (dy > 70 && dx < 60 && !e.target.closest("button, a")) los("#/laden");
    wisch = null;
  }, { passive: true });

  /* ---------- Produkt ---------- */
  let pAktiv = null;
  const pEl = $("#produkt");
  function produktAuf(k, pid) {
    const liste = PROD[k.id];
    const i = liste.findIndex(p => p.id === pid);
    if (i < 0) return;
    const p = liste[i], neu = pEl.hidden;
    if (L3) { if (pAktiv) L3.markiere(PROD[pAktiv.k.id][pAktiv.i].id, false); L3.markiere(p.id, true); }
    pAktiv = { k, i };
    pEl.style.setProperty("--c", k.neon);
    $("#pKat").textContent = k.name;
    $("#pName").textContent = p.name;
    $("#pMenge").textContent = p.info;
    $("#pText").textContent = p.text;
    $("#pTags").innerHTML = (p.tags || []).map(t => `<li>${t}</li>`).join("");
    $("#pPreis").textContent = p.preis ? p.preis : "Preis im Laden";
    $("#pZaehler").textContent = `${i + 1} / ${liste.length}`;
    const img = $("#pBild");
    img.alt = p.name;
    img.src = p.bild;
    pEl.hidden = false; body.classList.add("panel");
    // im 3D Laden steht das Produkt auch in der Karte als 3D Körper zum Drehen
    const in3d = !!(L3 && L3.ansicht(pEl.querySelector(".produkt__bild"), p.id));
    pEl.classList.toggle("mit3d", in3d);
    Ton.pop();
    if (!REDUZIERT) {
      if (neu) {
        gsap.fromTo(".produkt__hinter", { opacity: 0 }, { opacity: 1, duration: 0.35 });
        gsap.fromTo(".produkt__karte", { y: 60, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" });
      }
      gsap.fromTo(in3d ? ".produkt3d" : img, { y: 30, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.4)" });
      gsap.fromTo(".produkt__info > *", { x: 18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.04, ease: "power2.out" });
    }
    if (neu) setTimeout(() => pEl.querySelector(".schliessen").focus({ preventScroll: true }), 60);
    ansage(`${p.name}, ${p.info}`);
  }
  function produktZu(still) {
    if (pEl.hidden) return;
    if (L3 && pAktiv) L3.markiere(PROD[pAktiv.k.id][pAktiv.i].id, false);
    if (L3) L3.ansichtZu();
    pAktiv = null;
    if (still || REDUZIERT) { pEl.hidden = true; body.classList.toggle("panel", !$("#blatt").hidden); return; }
    gsap.to(".produkt__karte", { y: 40, opacity: 0, duration: 0.3, ease: "power2.in" });
    gsap.to(".produkt__hinter", { opacity: 0, duration: 0.3, onComplete: () => { pEl.hidden = true; body.classList.toggle("panel", !$("#blatt").hidden); gsap.set(".produkt__karte, .produkt__hinter", { clearProps: "all" }); } });
  }
  function produktBlaettern(r) {
    if (!pAktiv) return;
    const { k, i } = pAktiv, n = PROD[k.id].length, p = PROD[k.id][(i + r + n) % n];
    history.replaceState(null, "", `#/laden/${k.id}/${p.id}`);
    produktAuf(k, p.id);
  }
  pEl.querySelectorAll("[data-zu]").forEach(el => el.addEventListener("click", () => los("#/laden/" + (pAktiv ? pAktiv.k.id : ort))));
  $("#pVor").addEventListener("click", () => produktBlaettern(-1));
  $("#pNach").addEventListener("click", () => produktBlaettern(1));
  let pWisch = null;
  pEl.addEventListener("touchstart", e => { pWisch = e.touches[0].clientX; }, { passive: true });
  pEl.addEventListener("touchend", e => { if (pWisch == null) return; const dx = e.changedTouches[0].clientX - pWisch; if (Math.abs(dx) > 60) produktBlaettern(dx < 0 ? 1 : -1); pWisch = null; }, { passive: true });

  /* ---------- Blätter: Über uns, Besuch, Impressum, Datenschutz ---------- */
  const blatt = $("#blatt"), inhalt = $("#blattInhalt");
  const fehlt = v => (v ? v : null);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const zeile = (dt, dd) => `<dt>${dt}</dt>${dd ? `<dd>${dd}</dd>` : `<dd class="fehlt">wird ergänzt</dd>`}`;
  const I = D.impressum;
  const SEITEN = {
    "ueber-uns": () => `
      <img class="blatt__logo" src="assets/logo/logo.webp" alt="The 25 Hours Store">
      <p class="kicker">Über uns</p>
      <h2 id="blattTitel">${esc(D.claim)}</h2>
      <h3>${esc(D.ueber.titel)}</h3>
      ${D.ueber.text.map(t => `<p class="gross">${esc(t)}</p>`).join("")}
      <div class="fakten">${D.ueber.fakten.map(f => `<div><b>${f.zahl}</b><span>${esc(f.text)}</span></div>`).join("")}</div>
      ${D.ueber.imagefilm ? `<h3>Imagefilm</h3><video src="${D.ueber.imagefilm}" controls playsinline preload="none"></video>` : ""}
      <h3>Unser Versprechen</h3>
      ${D.slogans.map(s => `<p class="gross">${esc(s)}</p>`).join("")}
      <div class="tafel__aktion"><a class="knopf knopf--gross" href="#/laden"><span>Komm rein</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></a><a class="knopf knopf--leise" href="#/standorte">Alle Standorte</a></div>
      ${fuss()}`,
    standorte: () => standorteHTML(),
    impressum: () => `
      <p class="kicker">Rechtliches</p>
      <h2 id="blattTitel">Impressum</h2>
      <h3>Angaben nach § 5 DDG</h3>
      <dl>
        ${zeile("Firma", esc(I.firma))}
        ${zeile("Inhaber", fehlt(I.inhaber) && esc(I.inhaber))}
        ${I.rechtsform ? zeile("Rechtsform", esc(I.rechtsform)) : ""}
        ${zeile("Anschrift", `${esc(I.strasse)}<br>${esc(I.ort)}`)}
        ${zeile("Telefon", esc(I.telefon))}
        ${zeile("E Mail", fehlt(I.email) && `<a href="mailto:${esc(I.email)}">${esc(I.email)}</a>`)}
        ${zeile("USt ID", fehlt(I.ustid) && esc(I.ustid))}
        ${I.register ? zeile("Register", esc(I.register)) : ""}
      </dl>
      <h3>Verantwortlich für den Inhalt</h3>
      <p>${I.verantwortlich ? esc(I.verantwortlich) + ", Anschrift wie oben." : "Der Inhaber, Anschrift wie oben."}</p>
      <h3>Verbraucherstreitbeilegung</h3>
      <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      <h3>Hinweis zu den Bildern</h3>
      <p>Die Außenansicht ist eine mit KI erstellte Visualisierung, der Laden innen ein 3D Modell nach Vorlage. Die Produktfotos stammen aus dem Laden und zeigen einen Ausschnitt des Sortiments, im 3D Laden sind die Produkte daraus als 3D Modelle nachgebaut. Einrichtung, Sortiment und Verpackungen können abweichen. Marken und Logos auf den Produkten gehören den jeweiligen Herstellern.</p>
      <h3>Haftung</h3>
      <p>Die Inhalte dieser Seite wurden mit Sorgfalt erstellt. Für Richtigkeit, Vollständigkeit und Aktualität, etwa von Öffnungszeiten und Sortiment, übernehmen wir keine Gewähr. Für Inhalte verlinkter fremder Seiten sind ausschließlich deren Betreiber verantwortlich.</p>
      ${fuss()}`,
    datenschutz: () => `
      <p class="kicker">Rechtliches</p>
      <h2 id="blattTitel">Datenschutz</h2>
      <h3>Kurz gesagt</h3>
      <p class="gross">Keine Cookies, kein Tracking, keine Werbung, keine Kontaktformulare. Diese Website sammelt keine persönlichen Daten.</p>
      <h3>Verantwortlich</h3>
      <p>${esc(I.firma)}, ${esc(I.strasse)}, ${esc(I.ort)}, Telefon ${esc(I.telefon)}${I.email ? ", " + esc(I.email) : ""}.</p>
      <h3>Hosting</h3>
      <p>Die Seite wird über GitHub Pages ausgeliefert (GitHub Inc., USA). Beim Aufruf verarbeitet der Hoster technisch notwendige Daten wie IP Adresse, Datum und Uhrzeit sowie den Browser, um die Seite sicher auszuliefern. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Die Übermittlung in die USA stützt sich auf den EU US Data Privacy Framework.</p>
      <h3>Schriften und Medien</h3>
      <p>Alle Schriften, Bilder und Videos liegen auf demselben Server. Es werden keine Inhalte von Google oder anderen Drittanbietern nachgeladen.</p>
      <h3>Speicher im Browser</h3>
      <p>Nur deine Einstellung für den Ton wird im lokalen Speicher deines Browsers abgelegt. Sie verlässt dein Gerät nicht und lässt sich jederzeit im Browser löschen.</p>
      <h3>Externe Links</h3>
      <p>Der Link zur Route öffnet Google Maps erst nach deinem Klick in einem neuen Fenster. Dort gelten die Datenschutzhinweise von Google.</p>
      <h3>Deine Rechte</h3>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und Beschwerde bei einer Aufsichtsbehörde, in Berlin bei der Berliner Beauftragten für Datenschutz und Informationsfreiheit.</p>
      ${fuss()}`
  };
  /* ---------- Standorte: Berlin Karte mit allen Läden ---------- */
  const ORTE = D.standorte.liste;
  const nr = i => String(i + 1).padStart(2, "0");
  const routeLink = o => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(`The 25 Hours Store, ${o.strasse}, ${o.plz} ${o.ort}`);
  function standorteHTML() {
    const T = D.standorte, n = ORTE.filter(o => !o.bald && o.ort === "Berlin").length;
    const eintrag = (o, i) => `
      <li class="ort__eintrag${o.bald ? " ort__eintrag--bald" : ""}" data-i="${i}">
        <button class="ort__knopf" type="button" aria-expanded="false">
          <span class="ort__nr">${nr(i)}</span>
          <span class="ort__adr"><b>${esc(o.strasse)}</b><span>${o.bald ? "Coming soon" : `${o.plz} ${esc(o.ort)}`} · ${esc(o.kiez)}</span></span>
          ${o.bald ? `<span class="ort__bald">Bald</span>` : `<svg class="ort__pfeil" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`}
        </button>
      </li>`;
    return `
      <div class="ort">
        <header class="ort__kopf">
          <p class="kicker">Standorte</p>
          <h2 id="blattTitel"><span class="ort__zahl" data-zahl="${n}">${n}</span> mal Berlin.</h2>
          <p class="ort__unter">${esc(T.unter)}</p>
          <p class="ort__text">${esc(T.text)}</p>
        </header>
        <div class="ort__karte" id="ortKarte">
          <div class="ort__info" id="ortInfo" hidden></div>
          <button class="ort__alle" id="ortAlle" type="button" hidden>Ganz Berlin</button>
        </div>
        <ol class="ort__liste" id="ortListe">${ORTE.map(eintrag).join("")}</ol>
        <div class="ort__fuss">${fuss()}</div>
      </div>`;
  }

  function standorteStart(neu) {
    const K = window.BERLIN_KARTE, box = $("#ortKarte"), liste = $("#ortListe");
    if (!K || !box) return;
    const [, , VW, VH] = K.viewBox, p = K.proj;
    const proj = (lon, lat) => [(lon - p.lonMin) * p.kx * p.k, (p.latMax - lat) * p.k];
    const aktivB = new Set(ORTE.map(o => o.bezirk).filter(Boolean));
    const ns = "http://www.w3.org/2000/svg";
    const pos = ORTE.map(o => proj(o.lon, o.lat));
    const zeh = pos[ORTE.findIndex(o => o.kiez === "Zehlendorf")] || [VW * 0.25, VH * 0.75], pot = pos[ORTE.length - 1];
    const namen = K.bezirke.map(b => {
      const t = b.name.split("-");
      return `<text class="bezirk__name" x="${b.mitte[0]}" y="${b.mitte[1]}">${t.map((w, i) => `<tspan x="${b.mitte[0]}" dy="${i ? 13 : (1 - t.length) * 6.5}">${w.toUpperCase()}${i < t.length - 1 ? "-" : ""}</tspan>`).join("")}</text>`;
    }).join("");
    const pins = ORTE.map((o, i) => `
      <g class="pin${o.bald ? " pin--bald" : ""}" data-i="${i}" transform="translate(${pos[i][0].toFixed(1)} ${pos[i][1].toFixed(1)})" tabindex="0" role="button" aria-label="${esc(o.strasse)}, ${esc(o.kiez)}${o.bald ? ", bald" : ""}">
        <g class="pin__z"><g class="pin__s"><g class="pin__k">
          <circle class="pin__welle" r="10"/><circle class="pin__glow" r="22"/><circle class="pin__kern" r="10"/>
          <text class="pin__nr" y="3.6">${i + 1}</text>
        </g></g></g>
      </g>`).join("");
    box.insertAdjacentHTML("afterbegin", `
      <svg class="karte" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Karte von Berlin mit allen Standorten des 25 Hours Store">
        <defs>
          <radialGradient id="kGlow"><stop offset="0" stop-color="#ff5a1f" stop-opacity=".55"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>
          <filter id="kSchatten" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity=".55"/></filter>
        </defs>
        <text class="karte__wasser" x="${VW * 0.5}" y="${VH * 0.53}">BERLIN</text>
        <g class="karte__land" filter="url(#kSchatten)">${K.bezirke.map(b => `<path class="bezirk${aktivB.has(b.name) ? " bezirk--aktiv" : ""}" d="${b.d}"/>`).join("")}</g>
        <g class="karte__namen">${namen}</g>
        <path class="karte__weg" d="M${zeh[0].toFixed(1)},${zeh[1].toFixed(1)} Q${((zeh[0] + pot[0]) / 2 - 30).toFixed(1)},${((zeh[1] + pot[1]) / 2 - 40).toFixed(1)} ${pot[0].toFixed(1)},${pot[1].toFixed(1)}"/>
        <text class="karte__potsdam" x="${(pot[0] + 22).toFixed(1)}" y="${(pot[1] + 34).toFixed(1)}">POTSDAM · COMING SOON</text>
        <g class="karte__pins">${pins}</g>
      </svg>`);
    const svg = box.querySelector("svg"), info = $("#ortInfo"), alleKnopf = $("#ortAlle");
    const pinEls = [...svg.querySelectorAll(".pin")], items = [...liste.querySelectorAll(".ort__eintrag")];
    let aktiv = -1;
    const vb = { x: 0, y: 0, w: VW, h: VH };
    const setzeVB = () => {
      svg.setAttribute("viewBox", `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
      const s = vb.w / VW;                         // Pins bleiben beim Zoomen gleich groß
      pinEls.forEach(el => el.firstElementChild.setAttribute("transform", `scale(${s.toFixed(3)})`));   // .pin__z
      svg.style.setProperty("--z", s.toFixed(3));
    };
    function zoom(i) {
      let z = { x: 0, y: 0, w: VW, h: VH };
      if (i >= 0) {
        const f = 0.42, w = VW * f, h = VH * f, [x, y] = pos[i];
        z = { x: Math.max(-60, Math.min(VW - w + 60, x - w / 2)), y: Math.max(-40, Math.min(VH - h + 40, y - h / 2)), w, h };
      }
      gsap.to(vb, { ...z, duration: REDUZIERT ? 0 : 1.1, ease: "power3.inOut", onUpdate: setzeVB });
      alleKnopf.hidden = i < 0;
    }
    function waehle(i, quelle) {
      if (i === aktiv) i = -1;
      aktiv = i;
      pinEls.forEach((el, k) => { el.classList.toggle("aktiv", k === i); el.classList.toggle("leise", i >= 0 && k !== i); });
      items.forEach((el, k) => { el.classList.toggle("aktiv", k === i); el.firstElementChild.setAttribute("aria-expanded", k === i); });
      zoom(i);
      if (i < 0) { gsap.to(info, { opacity: 0, y: 12, duration: 0.25, onComplete: () => { info.hidden = true; } }); return; }
      const o = ORTE[i];
      info.innerHTML = `<span class="ort__nr">${nr(i)}</span><div><b>${esc(o.strasse)}</b><span>${o.bald ? `${o.plz} ${esc(o.ort)} · Coming soon` : `${o.plz} ${esc(o.ort)} · ${esc(o.kiez)}`}</span></div>
        ${o.bald ? `<span class="ort__bald">Bald</span>` : `<a class="knopf knopf--route" href="${routeLink(o)}" target="_blank" rel="noopener">Route</a>`}`;
      info.hidden = false;
      gsap.fromTo(info, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" });
      if (quelle === "karte") items[i].scrollIntoView({ block: "nearest", behavior: REDUZIERT ? "auto" : "smooth" });
      Ton.klick();
    }
    alleKnopf.addEventListener("click", () => waehle(-1));
    pinEls.forEach((el, i) => {
      el.addEventListener("click", () => waehle(i, "karte"));
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); waehle(i, "karte"); } });
      el.addEventListener("pointerenter", () => items[i].classList.add("hover"));
      el.addEventListener("pointerleave", () => items[i].classList.remove("hover"));
    });
    items.forEach((el, i) => {
      el.firstElementChild.addEventListener("click", () => { waehle(i, "liste"); if (matchMedia("(max-width: 900px)").matches) box.scrollIntoView({ block: "start", behavior: REDUZIERT ? "auto" : "smooth" }); });
      el.addEventListener("pointerenter", () => pinEls[i].classList.add("hover"));
      el.addEventListener("pointerleave", () => pinEls[i].classList.remove("hover"));
    });
    setzeVB();
    if (REDUZIERT) { svg.classList.add("fertig"); return; }
    // Aufbau: Bezirke zeichnen sich, Namen erscheinen, Läden fallen nacheinander auf die Karte, Zahl zählt hoch
    const t = gsap.timeline({ delay: neu ? 0.25 : 0.05, onComplete: () => svg.classList.add("fertig") });
    const pfade = [...svg.querySelectorAll(".bezirk")];
    pfade.forEach(pf => { const L = pf.getTotalLength(); pf.style.strokeDasharray = L; pf.style.strokeDashoffset = L; });
    t.to(pfade, { strokeDashoffset: 0, duration: 1.3, stagger: 0.06, ease: "power2.inOut" }, 0)
      .fromTo(pfade, { fillOpacity: 0 }, { fillOpacity: 1, duration: 0.8, stagger: 0.04, ease: "power1.out" }, 0.55)
      .fromTo(svg.querySelectorAll(".bezirk__name, .karte__wasser"), { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.0)
      .fromTo(svg.querySelectorAll(".pin:not(.pin--bald) .pin__s"), { y: -70, opacity: 0, scale: 0.4 }, { y: 0, opacity: 1, scale: 1, duration: 0.75, stagger: 0.085, ease: "back.out(2.4)", transformOrigin: "50% 100%" }, 1.05)
      .fromTo(svg.querySelector(".karte__weg"), { strokeDashoffset: 300 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, 2.2)
      .fromTo(svg.querySelectorAll(".pin--bald .pin__s, .karte__potsdam"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2)", transformOrigin: "50% 50%" }, 2.9)
      .fromTo(inhalt.querySelectorAll(".ort__kopf > *"), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.07, ease: "power3.out", clearProps: "transform,opacity" }, 0.05)
      .fromTo(items, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.55, stagger: 0.045, ease: "power3.out", clearProps: "transform,opacity" }, 0.6);
    const zahl = inhalt.querySelector(".ort__zahl"), ziel = +zahl.dataset.zahl, zz = { v: 0 };
    zahl.textContent = "0";
    t.to(zz, { v: ziel, duration: 1.4, ease: "power2.out", onUpdate: () => { zahl.textContent = Math.round(zz.v); } }, 1.05);
    pinEls.forEach((el, i) => t.call(() => el.classList.add("gelandet"), null, 1.05 + i * 0.085 + 0.45));
  }

  function fuss() { return `<div class="blatt__fuss"><a href="#/ueber-uns">Über uns</a><a href="#/standorte">Standorte</a><a href="#/impressum">Impressum</a><a href="#/datenschutz">Datenschutz</a></div>`; }
  let blattVorher = null;
  function blattAuf(id) {
    const neu = blatt.hidden;
    const orte = id === "standorte", warOrte = blatt.classList.contains("blatt--standorte");
    gsap.killTweensOf(inhalt);
    if (orte !== warOrte) gsap.set(inhalt, { clearProps: "all" });
    blatt.classList.toggle("blatt--standorte", orte);
    inhalt.innerHTML = SEITEN[id]();
    inhalt.scrollTop = 0;
    blatt.hidden = false; body.classList.add("panel");
    menueZu();
    if (neu) {
      blattVorher = document.activeElement;
      if (!REDUZIERT) {
        gsap.fromTo(".blatt__hinter", { opacity: 0 }, { opacity: 1, duration: 0.4 });
        if (orte) gsap.fromTo(inhalt, { opacity: 0, y: 40, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "power3.out", clearProps: "transform" });
        else gsap.fromTo(inhalt, { xPercent: 100 }, { xPercent: 0, duration: 0.7, ease: "power4.out" });
      }
    }
    if (orte) { standorteStart(neu); inhalt.focus({ preventScroll: true }); markiereNav(id); return; }
    if (!REDUZIERT) gsap.fromTo(inhalt.children, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.035, ease: "power3.out", delay: neu ? 0.15 : 0, clearProps: "transform,opacity" });
    inhalt.focus({ preventScroll: true });
    markiereNav(id);
  }
  function markiereNav(id) { document.querySelectorAll(".kopf__nav a").forEach(a => a.toggleAttribute("aria-current", a.getAttribute("href") === "#/" + id)); }
  function blattZu() {
    if (blatt.hidden) return;
    const fertig = () => { blatt.hidden = true; body.classList.toggle("panel", !pEl.hidden); gsap.set([inhalt, ".blatt__hinter"], { clearProps: "all" }); if (blattVorher && blattVorher.focus) blattVorher.focus({ preventScroll: true }); };
    if (REDUZIERT) return fertig();
    if (blatt.classList.contains("blatt--standorte")) gsap.to(inhalt, { opacity: 0, y: 30, duration: 0.4, ease: "power3.in" });
    else gsap.to(inhalt, { xPercent: 100, duration: 0.45, ease: "power3.in" });
    gsap.to(".blatt__hinter", { opacity: 0, duration: 0.45, onComplete: fertig });
  }
  blatt.querySelectorAll("[data-blatt-zu]").forEach(el => el.addEventListener("click", () => los(ortHash(ort))));

  /* ---------- Menü (Handy) ---------- */
  const menueKnopf = $("#menueKnopf"), menue = $("#menue");
  function menueZu() { menue.hidden = true; menueKnopf.setAttribute("aria-expanded", "false"); }
  menueKnopf.addEventListener("click", () => {
    const auf = menue.hidden; menue.hidden = !auf; menueKnopf.setAttribute("aria-expanded", auf);
    if (auf && !REDUZIERT) gsap.fromTo("#menue a, #menue .ton", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: "power3.out" });
  });
  menue.addEventListener("click", e => { if (e.target.closest("a")) menueZu(); });

  /* ---------- Adressen (Hash) ---------- */
  const ortHash = o => (o === "vorne" || o == null ? "#/" : o === "innen" ? "#/laden" : "#/laden/" + o);
  function los(hash) { if (location.hash === hash || (hash === "#/" && !location.hash)) route(); else location.hash = hash; }
  function lies() {
    const t = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!t.length) return { ort: "vorne" };
    if (t[0] === "besuch") return { blatt: "standorte" };
    if (SEITEN[t[0]]) return { blatt: t[0] };
    if (t[0] === "laden") {
      if (!t[1]) return { ort: "innen" };
      if (istKat(t[1])) return { ort: t[1], produkt: t[2] };
      return { ort: "innen" };
    }
    return { ort: "vorne" };
  }
  async function route() {
    const r = lies();
    if (r.blatt) { if (ort == null) await gehe("vorne", { sofort: true }); blattAuf(r.blatt); return; }
    blattZu(); menueZu();
    if (r.ort !== ort) await gehe(r.ort);
    if (r.produkt && ort === r.ort) produktAuf(KAT[r.ort], r.produkt); else produktZu();
  }
  addEventListener("hashchange", route);
  document.querySelectorAll("[data-hash]").forEach(b => b.addEventListener("click", () => los(b.dataset.hash)));
  $("#reinKnopf").addEventListener("click", () => los("#/laden"));
  $("#logoKnopf").addEventListener("click", () => los("#/ueber-uns"));
  $("#status").addEventListener("click", () => los("#/standorte"));
  addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!menue.hidden) return menueZu();
      if (!blatt.hidden) return los(ortHash(ort));
      if (!pEl.hidden) return los(ortHash(ort));
      if (istKat(ort)) return los("#/laden");
      if (ort === "innen") return los("#/");
    }
    if (!pEl.hidden && (e.key === "ArrowRight" || e.key === "ArrowLeft")) produktBlaettern(e.key === "ArrowRight" ? 1 : -1);
    if (e.key === "Enter" && ort === "vorne" && document.activeElement === document.body) los("#/laden");
  });

  /* ---------- Öffnungsstatus (Berliner Zeit) ---------- */
  function berlin() {
    const f = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = Object.fromEntries(f.map(p => [p.type, p.value]));
    const tage = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return { tag: tage.indexOf(g.weekday.replace(".", "")), min: (+g.hour % 24) * 60 + +g.minute };
  }
  const minuten = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  function status() {
    const el = $("#status"), L = D.standorte.liste, n = L.filter(o => !o.bald && o.ort === "Berlin").length;
    const text = `${n} Standorte in Berlin`;
    el.className = "status status--orte";
    el.lastChild.textContent = text;
    el.setAttribute("role", "button"); el.setAttribute("tabindex", "0"); el.setAttribute("aria-label", text + ". Alle Standorte auf der Karte ansehen.");
  }
  status();

  const ansageEl = $("#ansage");
  function ansage(t) { ansageEl.textContent = t; }

  /* ---------- Start ---------- */
  async function start() {
    const balken = $("#ladeBalken");
    const r = lies();
    const erst = r.blatt ? "vorne" : r.ort;
    let fertig = 0;
    const schritt = () => { fertig++; if (!l3Bereit || erst === "vorne") balken.style.width = Math.min(100, (fertig / 3) * 100) + "%"; };
    const drin = erst !== "vorne";
    if (MIT3D) l3Bereit = starte3D(f => { if (drin) balken.style.width = Math.round(10 + f * 85) + "%"; });
    const mit3d = drin && l3Bereit ? !!(await l3Bereit) : false;
    const sz = szene(mit3d ? "vorne" : erst);
    const warten = [
      buehne.lade(sz).then(schritt),
      Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), sleep(1500)]).then(schritt),
      sleep(REDUZIERT ? 0 : 900).then(schritt)
    ];
    try { await Promise.all(warten); } catch (e) { console.warn(e); }
    await buehne.setze(sz, { zoom: REDUZIERT ? 1 : 1.07 });
    if (mit3d) { L3.setzeStation(station(erst)); L3.zeige(true); buehne.pausiert = true; }
    ort = erst; body.dataset.ort = ortArt(erst);
    body.classList.remove("laedt");
    if (!REDUZIERT) gsap.to(buehne.s, { zoomA: 1, duration: 2.6, ease: "power2.out" });
    zeigeUI(erst);
    nachAnkunft(erst);
    ziehbar();
    if (r.blatt) blattAuf(r.blatt);
    if (r.produkt) produktAuf(KAT[r.ort], r.produkt);
    if (!mit3d && l3Bereit) l3Bereit.then(l => { if (l) vorne3D(); });
  }
  start();
})();
