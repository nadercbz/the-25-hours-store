/* The 25 Hours Store · Steuerung der begehbaren Website.
   Orte: "vorne" (vor dem Laden), "innen" (im Laden), oder eine Kategorie ID (vor dem Regal).
   Wege zwischen Orten laufen als Higgsfield Kamerafahrt (Video), sonst als Zoom Überblendung.
   Adressen: #/  #/laden  #/laden/<kategorie>  #/laden/<kategorie>/<produkt>  #/ueber-uns  #/besuch  #/impressum  #/datenschutz */
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
    const schritte = ort == null || opt.sofort ? [{ ziel: nach, sofort: true }] : wege(ort, nach);
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

  function nachAnkunft(o) {
    ansage(o === "vorne" ? "Du stehst vor dem Laden." : o === "innen" ? "Du bist im Laden. Wähle einen Bereich." : `${KAT[o].name}. ${KAT[o].titel}.`);
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

  function punkt({ x, y, name, farbe, klein, aria, onClick }) {
    const b = document.createElement("button");
    b.className = "punkt" + (klein ? " punkt--klein" : "");
    b.style.setProperty("--c", farbe || "var(--orange-hell)");
    b.setAttribute("aria-label", aria || name);
    b.innerHTML = `<span class="punkt__kern">${klein ? "<i>+</i>" : ""}</span><span class="punkt__name">${name}</span>`;
    b.addEventListener("click", e => { e.stopPropagation(); if (zug.bewegt) return; Ton.klick(); onClick(); });
    punkte.appendChild(b);
    const p = { el: b, x: x / 100, y: y / 100, name };
    aktivePunkte.push(p);
    return p;
  }

  function flaeche(box, art, inhalt, aria, onClick) {
    const b = document.createElement("button");
    b.className = "flaeche flaeche--" + art;
    b.setAttribute("aria-label", aria);
    b.innerHTML = inhalt;
    b.addEventListener("click", e => { e.stopPropagation(); onClick(); });
    punkte.appendChild(b);
    aktivePunkte.push({ el: b, box });
  }

  function baueVorne() {
    const f = hochkant() ? FLAECHEN.hoch : FLAECHEN.breit;
    flaeche(f.tuer, "tuer", `<span class="flaeche__marke">Reinkommen</span>`, "Reinkommen in den Laden", () => los("#/laden"));
    flaeche(f.schild, "schild", `<span class="flaeche__marke"><i></i>Über uns</span>`, "Über den Laden", () => los("#/ueber-uns"));
  }

  function baueInnen() {
    D.kategorien.forEach(k => punkt({ x: k.hub[0], y: k.hub[1], name: k.name, farbe: k.neon, aria: `${k.name}: näher rangehen`, onClick: () => los("#/laden/" + k.id) }));
  }

  function baueRegal(k) {
    $("#regalKicker").textContent = "Im Laden · " + k.name;
    $("#regalTitel").textContent = k.titel;
    $("#regalTitel").style.setProperty("--neon", k.neon);
    $("#regalTitel").style.color = k.neon;
    $("#regalTitel").style.textShadow = `0 0 8px ${k.neon}, 0 0 26px ${k.neon}88`;
    $("#regalText").textContent = k.text;
    const h = $("#regalHinweis"); h.hidden = !k.hinweis; h.textContent = k.hinweis || "";
    k.produkte.filter(p => p.pos).forEach(p => punkt({ x: p.pos[0], y: p.pos[1], name: p.name, farbe: k.neon, klein: true, aria: `${p.name} ansehen`, onClick: () => los(`#/laden/${k.id}/${p.id}`) }));
    const spur = $("#leisteSpur");
    spur.innerHTML = "";
    k.produkte.forEach((p, i) => {
      const b = document.createElement("button");
      b.className = "ware"; b.setAttribute("role", "listitem");
      b.style.setProperty("--c", k.neon);
      b.innerHTML = `<span class="ware__bild"><img src="assets/produkte/sm/${p.id}.webp" alt="" loading="lazy"></span><span class="ware__name">${p.name}</span><span class="ware__info">${p.info}</span>`;
      b.addEventListener("click", () => { Ton.klick(); los(`#/laden/${k.id}/${p.id}`); });
      b.addEventListener("mouseenter", () => markiere(p.name, true));
      b.addEventListener("mouseleave", () => markiere(p.name, false));
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
      el.addEventListener("click", () => { const z = el._ziel; if (z) schwenke(z.x); });
      randpfeile.appendChild(el);
    }
    el.hidden = !liste.length;
    if (liste.length) {
      const z = seite === "l" ? liste.reduce((a, b) => (a.x > b.x ? a : b)) : liste.reduce((a, b) => (a.x < b.x ? a : b));
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
    if (belegt || buehne.panMax() < 0.005 || e.target.closest("button")) { zug.bewegt = false; return; }
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
  const ziehbar = () => body.classList.toggle("ziehbar", buehne.panMax() > 0.005 && ort !== "vorne");
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
    const i = k.produkte.findIndex(p => p.id === pid);
    if (i < 0) return;
    const p = k.produkte[i], neu = pEl.hidden;
    pAktiv = { k, i };
    pEl.style.setProperty("--c", k.neon);
    $("#pKat").textContent = k.name;
    $("#pName").textContent = p.name;
    $("#pMenge").textContent = p.info;
    $("#pText").textContent = p.text;
    $("#pTags").innerHTML = (p.tags || []).map(t => `<li>${t}</li>`).join("");
    $("#pPreis").textContent = p.preis ? p.preis : "Preis im Laden";
    $("#pZaehler").textContent = `${i + 1} / ${k.produkte.length}`;
    const img = $("#pBild");
    img.alt = p.name;
    img.src = `assets/produkte/${p.id}.webp`;
    pEl.hidden = false; body.classList.add("panel");
    Ton.pop();
    if (!REDUZIERT) {
      if (neu) {
        gsap.fromTo(".produkt__hinter", { opacity: 0 }, { opacity: 1, duration: 0.35 });
        gsap.fromTo(".produkt__karte", { y: 60, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" });
      }
      gsap.fromTo(img, { y: 30, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.4)" });
      gsap.fromTo(".produkt__info > *", { x: 18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.04, ease: "power2.out" });
    }
    if (neu) setTimeout(() => pEl.querySelector(".schliessen").focus({ preventScroll: true }), 60);
    ansage(`${p.name}, ${p.info}`);
  }
  function produktZu(still) {
    if (pEl.hidden) return;
    pAktiv = null;
    if (still || REDUZIERT) { pEl.hidden = true; body.classList.toggle("panel", !$("#blatt").hidden); return; }
    gsap.to(".produkt__karte", { y: 40, opacity: 0, duration: 0.3, ease: "power2.in" });
    gsap.to(".produkt__hinter", { opacity: 0, duration: 0.3, onComplete: () => { pEl.hidden = true; body.classList.toggle("panel", !$("#blatt").hidden); gsap.set(".produkt__karte, .produkt__hinter", { clearProps: "all" }); } });
  }
  function produktBlaettern(r) {
    if (!pAktiv) return;
    const { k, i } = pAktiv, n = k.produkte.length, p = k.produkte[(i + r + n) % n];
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
  function zeitenTabelle() {
    const heute = berlin().tag;
    const reihen = [1, 2, 3, 4, 5, 6, 0].map(i => { const t = D.zeiten.tage[i]; return `<tr class="${i === heute ? "heute" : ""}"><td>${t.tag}</td><td>${t.von && t.bis ? `${t.von} bis ${t.bis} Uhr` : "geschlossen"}</td></tr>`; }).join("");
    return `<table class="zeiten"><tbody>${reihen}</tbody></table>${D.zeiten.geprueft ? "" : `<p class="klein">Angaben laut Branchenverzeichnis. Feiertage und Änderungen vorbehalten.</p>`}`;
  }
  const S = D.standort, I = D.impressum;
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
      <div class="tafel__aktion"><a class="knopf knopf--gross" href="#/laden"><span>Komm rein</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></a><a class="knopf knopf--leise" href="#/besuch">Besuch planen</a></div>
      ${fuss()}`,
    besuch: () => `
      <p class="kicker">Besuch</p>
      <h2 id="blattTitel">So findest du uns</h2>
      <h3>Adresse</h3>
      <p class="gross">${esc(S.zeile1)}<br>${esc(S.strasse)}<br>${esc(S.ort)}</p>
      <p>${esc(S.bezirk)}</p>
      <p><a class="knopf knopf--leise" href="${S.karte}" target="_blank" rel="noopener">Route in Karten öffnen</a></p>
      <h3>Öffnungszeiten</h3>
      ${zeitenTabelle()}
      <h3>Anfahrt</h3>
      <p>${esc(S.anfahrt)}</p>
      <h3>Telefon</h3>
      <p class="gross"><a href="tel:+49${S.telefon.replace(/\s/g, "").replace(/^0/, "")}">${esc(S.telefon)}</a></p>
      ${fuss()}`,
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
      <p>Die Ansichten des Ladens, die Kamerafahrten und die Produktbilder auf dieser Website sind mit KI erstellte Visualisierungen. Einrichtung, Sortiment und Verpackungen im Laden können davon abweichen. Abgebildete Produkte sind Beispiele.</p>
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
  function fuss() { return `<div class="blatt__fuss"><a href="#/ueber-uns">Über uns</a><a href="#/besuch">Besuch</a><a href="#/impressum">Impressum</a><a href="#/datenschutz">Datenschutz</a></div>`; }
  let blattVorher = null;
  function blattAuf(id) {
    const neu = blatt.hidden;
    inhalt.innerHTML = SEITEN[id]();
    inhalt.scrollTop = 0;
    blatt.hidden = false; body.classList.add("panel");
    menueZu();
    if (neu) {
      blattVorher = document.activeElement;
      if (!REDUZIERT) {
        gsap.fromTo(".blatt__hinter", { opacity: 0 }, { opacity: 1, duration: 0.4 });
        gsap.fromTo(inhalt, { xPercent: 100 }, { xPercent: 0, duration: 0.7, ease: "power4.out" });
      }
    }
    if (!REDUZIERT) gsap.fromTo(inhalt.children, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.035, ease: "power3.out", delay: neu ? 0.15 : 0, clearProps: "transform,opacity" });
    inhalt.focus({ preventScroll: true });
    document.querySelectorAll(".kopf__nav a").forEach(a => a.toggleAttribute("aria-current", a.getAttribute("href") === "#/" + id));
  }
  function blattZu() {
    if (blatt.hidden) return;
    const fertig = () => { blatt.hidden = true; body.classList.toggle("panel", !pEl.hidden); gsap.set([inhalt, ".blatt__hinter"], { clearProps: "all" }); if (blattVorher && blattVorher.focus) blattVorher.focus({ preventScroll: true }); };
    if (REDUZIERT) return fertig();
    gsap.to(inhalt, { xPercent: 100, duration: 0.45, ease: "power3.in" });
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
  $("#status").addEventListener("click", () => los("#/besuch"));
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
    const el = $("#status"), b = berlin(), t = D.zeiten.tage[b.tag];
    const offen = t && t.von && b.min >= minuten(t.von) && b.min < minuten(t.bis);
    let text;
    if (offen) text = `Geöffnet · bis ${t.bis}`;
    else {
      let n = null;
      for (let i = 0; i < 8 && !n; i++) {
        const tt = D.zeiten.tage[(b.tag + i) % 7];
        if (tt && tt.von && (i > 0 || b.min < minuten(tt.von))) n = { tt, i };
      }
      text = n ? `Geschlossen · öffnet ${n.i === 0 ? "" : n.i === 1 ? "morgen " : n.tt.kurz + " "}${n.tt.von}` : "Geschlossen";
    }
    el.className = "status " + (offen ? "offen" : "zu");
    el.lastChild.textContent = text;
    el.setAttribute("role", "button"); el.setAttribute("tabindex", "0"); el.setAttribute("aria-label", text + ". Öffnungszeiten ansehen.");
  }
  status(); setInterval(status, 60000);

  const ansageEl = $("#ansage");
  function ansage(t) { ansageEl.textContent = t; }

  /* ---------- Start ---------- */
  async function start() {
    const balken = $("#ladeBalken");
    const r = lies();
    const erst = r.blatt ? "vorne" : r.ort;
    let fertig = 0;
    const schritt = () => { fertig++; balken.style.width = Math.min(100, (fertig / 3) * 100) + "%"; };
    const sz = szene(erst);
    const warten = [
      buehne.lade(sz).then(schritt),
      Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), sleep(1500)]).then(schritt),
      sleep(REDUZIERT ? 0 : 900).then(schritt)
    ];
    try { await Promise.all(warten); } catch (e) { console.warn(e); }
    await buehne.setze(sz, { zoom: REDUZIERT ? 1 : 1.07 });
    ort = erst; body.dataset.ort = ortArt(erst);
    body.classList.remove("laedt");
    if (!REDUZIERT) gsap.to(buehne.s, { zoomA: 1, duration: 2.6, ease: "power2.out" });
    zeigeUI(erst);
    nachAnkunft(erst);
    ziehbar();
    if (r.blatt) blattAuf(r.blatt);
    if (r.produkt) produktAuf(KAT[r.ort], r.produkt);
  }
  start();
})();
