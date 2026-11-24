(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Utilitaires
   * ------------------------------------------------------------------ */
  const STORE_KEY = 'bonspoints.v1';
  const LOCK_KEY = 'bonspoints.lock';
  // Empreinte du code parent par défaut (le code lui-même n'est pas écrit dans le programme).
  const DEFAULT_PIN_HASH = '19611nm0113';
  const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const hashPin = p => cyrb53('bp|' + p + '|k7');
  const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const DAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'];

  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = n => (Math.abs(n) > 1 ? 's' : '');

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  const dow = d => (d.getDay() + 6) % 7; // lundi = 0
  const monday = d => addDays(d, -dow(d));
  const today = () => fmt(new Date());
  const longDate = d => `${DAY_LONG[dow(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

  /* ------------------------------------------------------------------ *
   *  Données
   * ------------------------------------------------------------------ */
  const defaultTasks = () => [
    { id: 'mettre-table', label: 'Mettre la table', ok: 1, ko: 0 },
    { id: 'debarrasser-table', label: 'Débarrasser la table', ok: 1, ko: 0 },
    { id: 'devoirs', label: 'Faire ses devoirs', ok: 2, ko: 1 },
    { id: 'chambre', label: 'Ranger sa chambre', ok: 1, ko: 0 },
    { id: 'entente', label: 'Bonne entente entre frères', ok: 2, ko: 2 },
    { id: 'obeir', label: 'Obéir aux parents', ok: 2, ko: 2 },
    { id: 'ecole', label: 'Être sage à l’école', ok: 2, ko: 2 }
  ];

  const defaultTiers = (a, b, c) => [
    { name: 'Bronze', emoji: '🥉', min: a, reward: '30 min d’écran en plus le samedi' },
    { name: 'Argent', emoji: '🥈', min: b, reward: 'Choisir le film ou le repas du samedi soir' },
    { name: 'Or', emoji: '🥇', min: c, reward: 'Une sortie au choix : parc, piscine ou cinéma' }
  ];

  const defaultGoals = () => [
    { id: 'g' + uid(), name: 'Mon objectif', emoji: '🎁', target: 150, done: false }
  ];

  function defaults() {
    return {
      version: 1,
      epoch: { id: '0', ts: 0 }, // change quand on réinitialise ou importe : remplace alors tous les appareils
      ts: {},            // horodatage de chaque note (pour la fusion entre appareils)
      settingsTs: 0,     // date de dernière modification des réglages
      settings: {
        countedDays: [0, 1, 2, 3, 4], // jours comptés pour la récompense (lundi = 0)
        children: [
          { id: 'c1', name: 'Enfant 1', age: 10, emoji: '🦁', dailyGoal: 8, tasks: defaultTasks(), tiers: defaultTiers(30, 40, 48), goals: defaultGoals(), spent: [] },
          { id: 'c2', name: 'Enfant 2', age: 6, emoji: '🐯', dailyGoal: 7, tasks: defaultTasks(), tiers: defaultTiers(25, 35, 45), goals: defaultGoals(), spent: [] }
        ]
      },
      log: {} // log[date][enfant][tâche] = 1 (fait) | -1 (pas fait)
    };
  }

  function isValid(s) {
    return s && typeof s === 'object' && s.settings && Array.isArray(s.settings.children) &&
      s.settings.children.length > 0 && Array.isArray(s.settings.countedDays) && s.log && typeof s.log === 'object';
  }

  // Ajoute les champs de la cagnotte aux données enregistrées avant cette version.
  function normalize(s) {
    s.settings.children.forEach(c => {
      if (!Array.isArray(c.goals)) c.goals = defaultGoals();
      if (!Array.isArray(c.spent)) c.spent = [];
      c.tasks.forEach(k => {
        k.slots = k.slots === true;
        k.timer = Number.isFinite(k.timer) && k.timer > 0 ? Math.round(k.timer) : 0;
      });
    });
    if (!s.epoch || typeof s.epoch.id !== 'string') s.epoch = { id: '0', ts: 0 };
    if (!s.ts || typeof s.ts !== 'object') s.ts = {};
    if (typeof s.settingsTs !== 'number') s.settingsTs = 0;
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { const s = JSON.parse(raw); if (isValid(s)) return normalize(s); }
    } catch (e) { /* données illisibles : on repart des valeurs par défaut */ }
    return defaults();
  }

  let state = load();
  const allSig = () => JSON.stringify([state.epoch, state.settingsTs, state.log, state.ts]);
  let settingsSig = JSON.stringify(state.settings);
  let lastAll = allSig();
  function save() {
    const sig = JSON.stringify(state.settings);
    if (sig !== settingsSig) { settingsSig = sig; state.settingsTs = Date.now(); }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Sauvegarde impossible sur cet appareil'); }
    const all = allSig();
    if (all !== lastAll) { lastAll = all; scheduleSync(); }
    setTimeout(checkBadges, 0);
  }

  const ui = { tab: 'day', childId: state.settings.children[0].id, date: today(), weekRef: today(), weekMode: 'bilan', setMode: 'general', imgLvl: 0, card: null, cardFlip: false, openBadge: null, evoWeeks: 8, unlocked: false, pin: null };

  const getChild = id => state.settings.children.find(c => c.id === id);
  const curChild = () => getChild(ui.childId) || state.settings.children[0];

  /* ------------------------------------------------------------------ *
   *  Calcul des points
   * ------------------------------------------------------------------ */
  const getV = (ds, cid, tid) => (state.log[ds] && state.log[ds][cid] && state.log[ds][cid][tid]) || 0;

  function setV(ds, cid, tid, v) {
    const L = state.log;
    state.ts[`${ds}|${cid}|${tid}`] = Date.now();
    if (v === 0) {
      if (L[ds] && L[ds][cid]) {
        delete L[ds][cid][tid];
        if (!Object.keys(L[ds][cid]).length) delete L[ds][cid];
        if (!Object.keys(L[ds]).length) delete L[ds];
      }
      return;
    }
    if (!L[ds]) L[ds] = {};
    if (!L[ds][cid]) L[ds][cid] = {};
    L[ds][cid][tid] = v;
  }

  // Une tâche « matin et soir » a deux cases : k.id (matin) et k.id + '@s' (soir).
  const taskKeys = k => (k.slots ? [k.id, k.id + '@s'] : [k.id]);
  const taskOfKey = (c, key) => c.tasks.find(k => k.id === key.replace(/@s$/, ''));

  function dayPoints(c, ds) {
    let t = 0;
    for (const k of c.tasks) {
      for (const key of taskKeys(k)) {
        const v = getV(ds, c.id, key);
        if (v === 1) t += k.ok; else if (v === -1) t -= k.ko;
      }
    }
    return t;
  }
  const dayMax = c => c.tasks.reduce((s, k) => s + k.ok * taskKeys(k).length, 0);
  const dayRated = (c, ds) => c.tasks.some(k => taskKeys(k).some(key => getV(ds, c.id, key) !== 0));
  const goalReached = (c, ds) => dayRated(c, ds) && dayPoints(c, ds) >= c.dailyGoal;

  function weekTotal(c, mon) {
    let t = 0;
    for (const i of state.settings.countedDays) t += dayPoints(c, fmt(addDays(mon, i)));
    return t;
  }

  function tierState(c, total) {
    const ts = [...c.tiers].sort((a, b) => a.min - b.min);
    let got = null;
    for (const t of ts) if (total >= t.min) got = t;
    const next = ts.find(t => total < t.min) || null;
    return { got, next, ts };
  }

  /* ------------------------------------------------------------------ *
   *  Cagnotte : les points positifs de chaque semaine s'accumulent.
   *  Une mauvaise semaine compte 0 (elle ne fait jamais baisser la cagnotte).
   * ------------------------------------------------------------------ */
  function weeklyEarned(c) {
    const days = Object.keys(state.log).sort();
    const out = [];
    if (!days.length) return out;
    const last = fmt(monday(new Date()));
    for (let m = monday(parse(days[0])); fmt(m) <= last; m = addDays(m, 7)) {
      out.push({ mon: fmt(m), pts: Math.max(0, weekTotal(c, m)) });
    }
    return out;
  }
  function bank(c) {
    const weeks = weeklyEarned(c);
    const earned = weeks.reduce((t, w) => t + w.pts, 0);
    const spent = c.spent.reduce((t, x) => t + x.cost, 0);
    return { weeks, earned, spent, balance: earned - spent };
  }
  const activeGoal = c => c.goals.find(g => !g.done) || null;
  const fmtFR = ds => { const [y, m, d] = ds.split('-'); return `${d}/${m}/${y}`; };

  /* ------------------------------------------------------------------ *
   *  Minuteurs : les points sont accordés à la fin du compte à rebours.
   *  Les minuteurs en cours restent sur cet appareil (non synchronisés).
   * ------------------------------------------------------------------ */
  const TIMER_KEY = 'bonspoints.timers';
  const TIMER_GRACE = 30 * 60 * 1000; // au-delà, un minuteur terminé « dans le vide » n'accorde rien
  let timers = {};
  try { timers = JSON.parse(localStorage.getItem(TIMER_KEY) || '{}') || {}; } catch (e) { timers = {}; }
  const saveTimers = () => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timers)); } catch (e) { /* ignoré */ } };
  const tkey = (ds, cid, key) => `${ds}|${cid}|${key}`;
  const clock = sec => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
  const dur = sec => (sec % 60 === 0 ? `${sec / 60} min` : clock(sec));

  let actx = null;
  function primeAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { /* ignoré */ }
  }
  function beep() {
    try {
      primeAudio();
      if (actx) [0, 0.25, 0.5].forEach((d, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + d;
        o.frequency.value = i === 2 ? 1175 : 880;
        o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.start(t); o.stop(t + 0.25);
      });
    } catch (e) { /* ignoré */ }
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignoré */ }
  }
  let wake = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wake) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch (e) { /* ignoré */ }
  }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* ignoré */ } wake = null; }

  function tick() {
    const now = Date.now();
    const keys = Object.keys(timers);
    if (!keys.length) { releaseWake(); return; }
    const done = [];
    let late = 0;
    for (const tk of keys) {
      const t = timers[tk];
      if (now < t.end) continue;
      delete timers[tk];
      const [ds, cid, key] = tk.split('|');
      const c = getChild(cid), k = c && taskOfKey(c, key);
      if (!k) continue;
      if (now - t.end > TIMER_GRACE) { late++; continue; }
      const was = goalReached(c, ds);
      if (getV(ds, cid, key) !== 1) setV(ds, cid, key, 1);
      done.push({ c, k, key, newGoal: !was && goalReached(c, ds) });
    }
    if (done.length || late) {
      saveTimers();
      if (done.length) save();
      if (ui.tab !== 'settings') render();
      if (done.length) {
        beep();
        const d = done[0];
        const slot = d.k.slots ? (d.key.endsWith('@s') ? ' (soir)' : ' (matin)') : '';
        toast(`⏱️ Terminé ! +${d.k.ok} pt${plural(d.k.ok)} pour ${d.c.name} : ${d.k.label}${slot}`);
        const g = done.find(x => x.newGoal);
        if (g) setTimeout(() => celebrate(g.c), 900);
      } else {
        toast('Minuteur expiré sans validation : à relancer');
      }
      return;
    }
    document.querySelectorAll('[data-timer-text]').forEach(el => {
      const t = timers[el.dataset.timerText];
      if (!t) return;
      el.textContent = clock(Math.max(0, Math.ceil((t.end - now) / 1000)));
      const bar = el.parentElement.querySelector('i');
      if (bar) bar.style.width = `${Math.min(100, ((now - (t.end - t.dur * 1000)) / (t.dur * 1000)) * 100)}%`;
    });
  }

  /* ------------------------------------------------------------------ *
   *  Statistiques et graphiques (SVG, sans dépendance)
   *  Les statistiques portent sur les jours comptés, comme le total de la semaine :
   *  bons points − mauvais points = total.
   * ------------------------------------------------------------------ */
  const PAL = i => `var(--p${(i % 8) + 1})`;
  const countedDates = mon => state.settings.countedDays.map(i => fmt(addDays(mon, i)));
  const shortDate = ds => { const p = ds.split('-'); return `${p[2]}/${p[1]}`; };
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

  function stats(c, dates) {
    const per = c.tasks.map(k => ({ label: k.label, done: 0, missed: 0, gained: 0, lost: 0 }));
    let gained = 0, lost = 0, rated = 0, goals = 0;
    for (const ds of dates) {
      if (!dayRated(c, ds)) continue;
      rated++;
      if (goalReached(c, ds)) goals++;
      c.tasks.forEach((k, i) => {
        for (const key of taskKeys(k)) {
          const v = getV(ds, c.id, key);
          if (v === 1) { per[i].done++; per[i].gained += k.ok; gained += k.ok; }
          else if (v === -1) { per[i].missed++; per[i].lost += k.ko; lost += k.ko; }
        }
      });
    }
    return { gained, lost, net: gained - lost, rated, goals, per };
  }

  function goalStreak(c) {
    const cs = state.settings.countedDays;
    let n = 0;
    for (let d = new Date(), i = 0; i < 400; d = addDays(d, -1), i++) {
      if (!cs.includes(dow(d))) continue;
      const ds = fmt(d);
      if (goalReached(c, ds)) n++;
      else if (ds === today() && !dayRated(c, ds)) continue;
      else break;
    }
    return n;
  }

  function donut(slices, big, small, label) {
    const R = 42, C = 2 * Math.PI * R;
    const live = slices.filter(s => s.v > 0);
    const tot = live.reduce((t, s) => t + s.v, 0);
    let off = 0;
    const arcs = tot ? live.map(s => {
      const len = (s.v / tot) * C;
      const el = `<circle cx="60" cy="60" r="${R}" fill="none" style="stroke:${s.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
      off += len;
      return el;
    }).join('') : `<circle cx="60" cy="60" r="${R}" fill="none" style="stroke:var(--line)" stroke-width="18"/>`;
    return `<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="${esc(label)}">${arcs}
      <text x="60" y="61" text-anchor="middle" class="d-big">${big}</text>
      <text x="60" y="76" text-anchor="middle" class="d-small">${esc(small)}</text></svg>`;
  }

  const legend = items => `<ul class="legend">${items.map(i =>
    `<li><span class="sw" style="background:${i.color}"></span><span class="lg-l">${esc(i.label)}</span><strong>${i.value}</strong></li>`).join('')}</ul>`;

  // Barres des totaux hebdomadaires, avec les paliers en pointillés.
  function weeksChart(c, weeks) {
    const W = 320, H = 180, L = 30, R = 6, T = 14, B = 22;
    const ts = [...c.tiers].sort((a, b) => a.min - b.min);
    const vals = weeks.map(w => w.total);
    const hi = Math.max(1, ...vals, ...ts.map(t => t.min));
    const lo = Math.min(0, ...vals);
    const y = v => T + ((hi - v) / (hi - lo)) * (H - T - B);
    const bw = (W - L - R) / weeks.length;
    const step = Math.ceil(weeks.length / 8);
    const lines = ts.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t.min)}" y2="${y(t.min)}" class="ch-tier"/>
      <text x="${L - 4}" y="${y(t.min) + 3}" text-anchor="end" class="ch-e">${esc(t.emoji)}</text>`).join('');
    const bars = weeks.map((w, i) => {
      const x = L + i * bw + bw * 0.15, wd = bw * 0.7;
      const top = y(Math.max(w.total, 0)), h = Math.max(Math.abs(y(w.total) - y(0)), w.rated ? 1.5 : 0);
      const fill = w.got ? 'var(--gold)' : w.total >= 0 ? 'var(--primary)' : 'var(--ko)';
      const val = w.rated && bw >= 18 ? `<text x="${x + wd / 2}" y="${(w.total >= 0 ? top - 3 : top + h + 9)}" text-anchor="middle" class="ch-v">${w.total}</text>` : '';
      const lab = i % step === 0 || i === weeks.length - 1 ? `<text x="${x + wd / 2}" y="${H - 7}" text-anchor="middle" class="ch-t">${shortDate(w.mon)}</text>` : '';
      return `<rect x="${x.toFixed(1)}" y="${(w.total >= 0 ? top : y(0)).toFixed(1)}" width="${wd.toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="fill:${fill}" opacity="${w.partial ? .55 : 1}"/>${val}${lab}`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Total de points par semaine">
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="ch-axis"/>${lines}${bars}</svg>`;
  }

  // Points de chaque jour avec l'objectif quotidien en pointillés.
  function daysChart(c, dates) {
    const W = 320, H = 130, L = 30, R = 6, T = 12, B = 20;
    const vals = dates.map(ds => (dayRated(c, ds) ? dayPoints(c, ds) : null));
    const hi = Math.max(1, dayMax(c), c.dailyGoal);
    const lo = Math.min(0, ...vals.filter(v => v !== null));
    const y = v => T + ((hi - v) / (hi - lo)) * (H - T - B);
    const bw = (W - L - R) / dates.length;
    const cs = state.settings.countedDays;
    const bars = dates.map((ds, i) => {
      const x = L + i * bw + bw * 0.12, wd = Math.max(bw * 0.76, 1);
      const d = parse(ds), v = vals[i];
      const lab = dow(d) === 0 ? `<text x="${x}" y="${H - 6}" class="ch-t">${shortDate(ds)}</text>` : '';
      if (v === null) return lab;
      const fill = v >= c.dailyGoal ? 'var(--ok)' : v >= 0 ? 'var(--primary)' : 'var(--ko)';
      const top = v >= 0 ? y(v) : y(0), h = Math.max(Math.abs(y(v) - y(0)), 1.5);
      return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${wd.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" style="fill:${fill}" opacity="${cs.includes(dow(d)) ? 1 : .4}"/>${lab}`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Points par jour">
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="ch-axis"/>
      <line x1="${L}" x2="${W - R}" y1="${y(c.dailyGoal)}" y2="${y(c.dailyGoal)}" class="ch-tier"/>
      <text x="${L - 4}" y="${y(c.dailyGoal) + 3}" text-anchor="end" class="ch-t">${c.dailyGoal}</text>${bars}</svg>`;
  }

  function taskPies(c, st) {
    const g = st.per.map((p, i) => ({ v: p.gained, color: PAL(i), label: p.label, value: `+${p.gained}` })).filter(x => x.v > 0);
    const l = st.per.map((p, i) => ({ v: p.lost, color: PAL(i), label: p.label, value: `−${p.lost}` })).filter(x => x.v > 0);
    const side = (title, items, big, empty) => `<div class="pie-col"><h3>${title}</h3>
      ${items.length ? donut(items, big, 'pts', title) + legend(items) : `<p class="hint">${empty}</p>`}</div>`;
    return `<div class="pies">${side('Points gagnés', g, `+${st.gained}`, 'Aucun point gagné sur la période.')}
      ${side('Points perdus', l, `−${st.lost}`, 'Aucun point perdu, bravo 👏')}</div>`;
  }

  function taskRates(st) {
    return st.per.map(p => {
      const n = p.done + p.missed;
      const pct = n ? Math.round((p.done / n) * 100) : null;
      return `<div class="rate"><div class="rate-top"><span>${esc(p.label)}</span><strong>${pct === null ? '–' : pct + ' %'}</strong></div>
        <div class="rbar">${n ? `<i class="ok" style="width:${pct}%"></i><i class="ko" style="width:${100 - pct}%"></i>` : ''}</div>
        <small>${p.done} ✔ · ${p.missed} ✖${p.lost ? ` · −${p.lost} pt${plural(p.lost)}` : ''}</small></div>`;
    }).join('');
  }

  function evoView() {
    const c = curChild();
    const cur = monday(new Date());
    const logged = Object.keys(state.log).sort();
    const n = ui.evoWeeks || (logged.length ? Math.min(52, Math.round((cur - monday(parse(logged[0]))) / 6048e5) + 1) : 1);

    const weeks = [];
    for (let i = n - 1; i >= 0; i--) {
      const mon = addDays(cur, -7 * i);
      const s = stats(c, countedDates(mon));
      weeks.push({ mon: fmt(mon), total: s.net, rated: s.rated, got: tierState(c, s.net).got, partial: i === 0 });
    }
    const dates = weeks.flatMap(w => countedDates(parse(w.mon)));
    const st = stats(c, dates);
    const withData = weeks.filter(w => w.rated);

    let prevTile = '';
    if (ui.evoWeeks) {
      const prevDates = [];
      for (let i = n; i < 2 * n; i++) prevDates.push(...countedDates(addDays(cur, -7 * i)));
      const prev = stats(c, prevDates);
      if (prev.rated && st.rated) {
        const d = st.net - prev.net;
        prevTile = `<div class="tile"><span>Période précédente</span><strong class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '＝'} ${signed(d)}</strong><small>${prev.net} pts avant</small></div>`;
      }
    }
    const best = withData.length ? withData.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    const avg = withData.length ? Math.round((st.net / withData.length) * 10) / 10 : 0;
    const streak = goalStreak(c);

    const dayCount = Math.min(n, 8) * 7;
    const days = [];
    for (let i = dayCount - 1; i >= 0; i--) days.push(fmt(addDays(new Date(), -i)));

    const body = st.rated ? `
      <section class="card">
        <div class="tiles">
          <div class="tile"><span>Total</span><strong>${st.net}</strong><small>pts sur ${n} sem.</small></div>
          <div class="tile"><span>Moyenne</span><strong>${avg}</strong><small>pts / semaine</small></div>
          <div class="tile"><span>Meilleure semaine</span><strong>${best.total}</strong><small>du ${shortDate(best.mon)}</small></div>
          <div class="tile"><span>Objectif du jour</span><strong>${Math.round((st.goals / st.rated) * 100)} %</strong><small>${st.goals} jour${plural(st.goals)} sur ${st.rated}</small></div>
          <div class="tile"><span>Série en cours</span><strong>${streak}</strong><small>jour${plural(streak)} d’affilée ⭐</small></div>
          ${prevTile}
        </div>
      </section>
      <section class="card">
        <h2 class="c-title">Points par semaine</h2>
        ${weeksChart(c, weeks)}
        <p class="hint">Barre dorée : palier atteint. Pointillés : paliers (${c.tiers.length ? [...c.tiers].sort((a, b) => a.min - b.min).map(t => esc(t.emoji) + ' ' + t.min).join(', ') : 'aucun'}). Barre pâle : semaine en cours.</p>
      </section>
      <section class="card">
        <h2 class="c-title">Points par jour</h2>
        ${daysChart(c, days)}
        <p class="hint">Vert : objectif du jour atteint (${c.dailyGoal} pts). Rouge : journée négative. Pâle : jour non compté.</p>
      </section>
      <section class="card">
        <h2 class="c-title">Bons et mauvais points</h2>
        <div class="split">
          ${donut([{ v: st.gained, color: 'var(--ok)' }, { v: st.lost, color: 'var(--ko)' }], signed(st.net), 'net', 'Répartition des bons et mauvais points')}
          ${legend([
            { color: 'var(--ok)', label: 'Bons points', value: `+${st.gained}` },
            { color: 'var(--ko)', label: 'Mauvais points', value: `−${st.lost}` }
          ])}
        </div>
      </section>
      <section class="card">
        <h2 class="c-title">D’où viennent les points ?</h2>
        ${taskPies(c, st)}
      </section>
      <section class="card">
        <h2 class="c-title">Réussite par tâche</h2>
        ${taskRates(st)}
      </section>` : `
      <section class="card"><p class="hint">Pas encore de journée notée sur cette période pour ${esc(c.name)}. Les graphiques apparaîtront dès les premiers points.</p></section>`;

    return `
      <header class="top"><h1>📈 Évolution des points</h1></header>
      ${weekModes()}
      ${childTabs()}
      <div class="chips" role="group" aria-label="Période">${[4, 8, 12, 0].map(v =>
        `<button class="pchip ${ui.evoWeeks === v ? 'on' : ''}" data-action="evo-weeks" data-n="${v}">${v ? v + ' sem.' : 'Tout'}</button>`).join('')}</div>
      ${body}
      <p class="note">Statistiques calculées sur les jours comptés (${state.settings.countedDays.length ? [...state.settings.countedDays].sort().map(i => DAY_SHORT[i]).join(', ') : 'aucun'}).</p>`;
  }

  const weekModes = () => `<div class="seg2" role="tablist">
    <button class="${ui.weekMode === 'bilan' ? 'on' : ''}" data-action="week-mode" data-mode="bilan">Bilan</button>
    <button class="${ui.weekMode === 'evol' ? 'on' : ''}" data-action="week-mode" data-mode="evol">Évolution</button>
    <button class="${ui.weekMode === 'badges' ? 'on' : ''}" data-action="week-mode" data-mode="badges">🏅 Détail</button></div>`;

  /* ------------------------------------------------------------------ *
   *  Badges : calculés à partir de l'historique, donc identiques sur tous les appareils.
   *  Un niveau gagné ne se perd jamais : pour les séries, c'est le record qui compte.
   *  Seuls les jours comptés (réglages) comptent ; les autres ne cassent pas une série.
   * ------------------------------------------------------------------ */
  const LEVELS = ['Bois', 'Pierre', 'Fer', 'Or', 'Émeraude', 'Diamant', 'Netherite'];
  const SEEN_KEY = 'bonspoints.badges';

  // task : mot-clé pour retrouver automatiquement la tâche liée (modifiable dans Réglages > Badges)
  const BADGES = [
    { id: 'serie', e: '🔥', name: 'Série de feu', desc: 'Jours d’affilée avec l’objectif du jour atteint', unit: 'jours', lv: [3, 5, 10, 20, 40, 80, 150] },
    { id: 'dents', e: '🦷', name: 'Sourire éclatant', desc: 'Jours d’affilée avec la tâche réussie (matin et soir s’il y a deux coches)', unit: 'jours', task: /dent|brosse/i, lv: [3, 5, 10, 20, 30, 60, 100] },
    { id: 'parfaite', e: '🌟', name: 'Journée parfaite', desc: 'Jours avec le score maximum', unit: 'jours', lv: [1, 3, 7, 15, 30, 60, 100] },
    { id: 'sansfaute', e: '😇', name: 'Sans faute', desc: 'Jours d’affilée sans aucun ✖', unit: 'jours', lv: [2, 4, 7, 14, 30, 60, 100] },
    { id: 'champion', e: '🏆', name: 'Semaine de champion', desc: 'Semaines terminées avec au moins le premier palier de récompense atteint', unit: 'semaines', lv: [1, 2, 4, 8, 16, 30, 52] },
    { id: 'roi', e: '👑', name: 'Roi des paliers', desc: 'Semaines terminées au palier de récompense le plus haut', unit: 'semaines', lv: [1, 2, 3, 5, 10, 20, 40] },
    { id: 'retour', e: '💪', name: 'Le retour du héros', desc: 'Objectif atteint le jour qui suit une journée sous l’objectif', unit: 'fois', lv: [1, 3, 5, 10, 20, 40, 75] },
    { id: 'devoirs', e: '📚', name: 'Studieux', desc: 'Jours d’affilée avec la tâche réussie', unit: 'jours', task: /devoir/i, lv: [3, 5, 10, 20, 40, 80, 150] },
    { id: 'entente', e: '🤝', name: 'Frères en or', desc: 'Jours d’affilée avec la tâche réussie', unit: 'jours', task: /entente|fr[eè]re/i, lv: [3, 5, 10, 20, 40, 80, 150] },
    { id: 'chambre', e: '🛏️', name: 'Chambre nickel', desc: 'Nombre de fois où la tâche est réussie (total)', unit: 'fois', task: /chambre/i, lv: [5, 15, 30, 60, 100, 200, 365] },
    { id: 'matinsoir', e: '🌅', name: 'Du matin au soir', desc: 'Jours où toutes les coches matin et soir sont validées', unit: 'jours', lv: [3, 7, 15, 30, 60, 100, 200] },
    { id: 'chrono', e: '⏱️', name: 'Chrono-champion', desc: 'Tâches chronométrées réussies', unit: 'fois', lv: [5, 15, 30, 60, 120, 250, 500] },
    { id: 'tirelire', e: '💰', name: 'Tirelire', desc: 'Points gagnés depuis le début (semaines terminées)', unit: 'pts', lv: [100, 250, 500, 1000, 2500, 5000, 10000] },
    { id: 'chasseur', e: '🎁', name: 'Chasseur de récompenses', desc: 'Objectifs de la cagnotte validés', unit: 'objectifs', lv: [1, 2, 3, 5, 8, 12, 20] }
  ];
  const STREAKS = ['serie', 'dents', 'sansfaute', 'devoirs', 'entente'];

  const badgeCfg = (c, b) => {
    const o = (c.badges && c.badges[b.id]) || {};
    return { on: o.on !== false, task: o.task || '', lv: Array.isArray(o.lv) && o.lv.length === 7 ? o.lv : b.lv };
  };
  const badgeTask = (c, b) => {
    if (!b.task) return null;
    const t = badgeCfg(c, b).task;
    return c.tasks.find(k => k.id === t) || c.tasks.find(k => b.task.test(k.label)) || null;
  };

  function badgeStats(c) {
    const t = today();
    const cs = state.settings.countedDays;
    const logged = Object.keys(state.log).sort();
    const days = [];
    if (logged.length) for (let d = parse(logged[0]); fmt(d) <= t; d = addDays(d, 1)) if (cs.includes(dow(d))) days.push(fmt(d));

    const lastC = cs.length ? Math.max(...cs) : -1;
    const weeks = [];
    if (logged.length && lastC >= 0) {
      for (let m = monday(parse(logged[0])); t > fmt(addDays(m, lastC)); m = addDays(m, 7)) {
        weeks.push({ total: weekTotal(c, m), rated: countedDates(m).some(ds => dayRated(c, ds)) });
      }
    }
    const mins = c.tiers.map(x => x.min);
    const lowest = mins.length ? Math.min(...mins) : null;
    const highest = mins.length ? Math.max(...mins) : null;

    const allOk = (k, ds) => taskKeys(k).every(key => getV(ds, c.id, key) === 1);
    const sumOk = k => logged.reduce((n, ds) => n + taskKeys(k).filter(key => getV(ds, c.id, key) === 1).length, 0);
    // Série : le record compte ; un jour en cours (aujourd'hui) pas encore réussi ne casse pas la série.
    const runs = cond => {
      let run = 0, best = 0;
      for (const ds of days) {
        if (cond(ds)) { run++; if (run > best) best = run; } else if (ds !== t) run = 0;
      }
      return { v: best, cur: run };
    };
    const count = cond => ({ v: days.reduce((n, ds) => n + (cond(ds) ? 1 : 0), 0) });
    const reached = ds => goalReached(c, ds);
    const noKo = ds => dayRated(c, ds) && !c.tasks.some(k => taskKeys(k).some(key => getV(ds, c.id, key) === -1));
    const slotTasks = c.tasks.filter(k => k.slots);
    const timed = c.tasks.filter(k => k.timer > 0);

    const out = {};
    for (const b of BADGES) {
      const cf = badgeCfg(c, b);
      const k = b.task ? badgeTask(c, b) : null;
      let r = { v: 0 }, hint = '';
      if (b.task && !k) hint = 'Aucune tâche trouvée : choisissez-la dans Réglages › Badges.';
      else if (b.id === 'matinsoir' && !slotTasks.length) hint = 'Activez « Matin et soir » sur une tâche dans Réglages.';
      else if (b.id === 'chrono' && !timed.length) hint = 'Ajoutez un minuteur à une tâche dans Réglages.';
      else {
        switch (b.id) {
          case 'serie': r = runs(reached); break;
          case 'dents': case 'devoirs': case 'entente': r = runs(ds => allOk(k, ds)); break;
          case 'sansfaute': r = runs(noKo); break;
          case 'parfaite': r = count(ds => dayRated(c, ds) && dayMax(c) > 0 && dayPoints(c, ds) >= dayMax(c)); break;
          case 'champion': r = { v: lowest === null ? 0 : weeks.filter(w => w.rated && w.total >= lowest).length }; break;
          case 'roi': r = { v: highest === null ? 0 : weeks.filter(w => w.rated && w.total >= highest).length }; break;
          case 'retour': {
            let n = 0;
            for (let i = 1; i < days.length; i++) if (dayRated(c, days[i - 1]) && !reached(days[i - 1]) && reached(days[i])) n++;
            r = { v: n };
            break;
          }
          case 'chambre': r = { v: sumOk(k) }; break;
          case 'matinsoir': r = count(ds => slotTasks.every(x => allOk(x, ds))); break;
          case 'chrono': r = { v: timed.reduce((n, x) => n + sumOk(x), 0) }; break;
          case 'tirelire': r = { v: weeks.reduce((n, w) => n + Math.max(0, w.total), 0) }; break;
          case 'chasseur': r = { v: c.goals.filter(g => g.done).length }; break;
        }
      }
      const level = cf.lv.filter(x => r.v >= x).length;
      out[b.id] = { b, cf, k, v: r.v, cur: r.cur === undefined ? null : r.cur, hint, level, next: cf.lv[level] === undefined ? null : cf.lv[level] };
    }
    return out;
  }

  function burst(emojis) {
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      s.className = 'fx';
      s.textContent = emojis[i % emojis.length];
      s.style.left = `${8 + Math.random() * 84}%`;
      s.style.animationDelay = `${Math.random() * 0.4}s`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 2200);
    }
  }

  // Détecte les niveaux franchis (aucune célébration au premier lancement ni pour un nouvel enfant).
  function checkBadges() {
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)); } catch (e) { seen = null; }
    // Réinitialisation / import (nouvelle « époque ») : on repart sans célébrer.
    const first = !seen || typeof seen !== 'object' || seen._e !== state.epoch.id;
    if (first) seen = { _e: state.epoch.id };
    const ups = [];
    for (const c of state.settings.children) {
      const known = !first && !!seen[c.id];
      const m = seen[c.id] || (seen[c.id] = {});
      const st = badgeStats(c);
      for (const b of BADGES) {
        const lvl = st[b.id].level;
        if (known && st[b.id].cf.on && lvl > (m[b.id] || 0)) ups.push({ c, b, lvl });
        m[b.id] = Math.max(m[b.id] || 0, lvl);
      }
    }
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* ignoré */ }
    if (!ups.length) return;
    const u = ups[0];
    burst(['🏅', '⭐', '✨', '🎉', '🏆']);
    toast(`${u.b.e} ${u.c.name} : ${u.b.name} niveau ${LEVELS[u.lvl - 1]} !${ups.length > 1 ? ` (+${ups.length - 1} autre${plural(ups.length - 1)})` : ''}`);
  }

  const medal = (b, level, url) => `<div class="medal lv${level}" aria-hidden="true">${url ? `<img src="${url}" alt="">` : `<span>${b.e}</span>`}</div>`;
  const pips = level => `<div class="pips" aria-hidden="true">${LEVELS.map((n, i) => `<i class="lv${i + 1} ${level > i ? 'on' : ''}" title="${n}"></i>`).join('')}</div>`;

  function badgesView() {
    const c = curChild();
    const st = badgeStats(c);
    const list = BADGES.map(b => st[b.id]).filter(x => x.cf.on);
    const got = list.filter(x => x.level > 0).length;
    const lvls = list.reduce((n, x) => n + x.level, 0);

    const cards = list.map(x => {
      const { b, level, next, v, cur, hint, k } = x;
      const pct = next ? Math.min(100, (v / next) * 100) : 100;
      const lab = level ? `Niveau ${LEVELS[level - 1]}` : 'À débloquer';
      let prog;
      if (hint) prog = `<p class="b-hint">${esc(hint)}</p>`;
      else prog = `<div class="rbar b-bar"><i class="lv${Math.min(7, Math.max(1, next ? level + 1 : level))}" style="width:${pct}%"></i></div>
          <small>${v}${next ? ` / ${next}` : ''} ${esc(b.unit)}${next ? ` · prochain : ${LEVELS[level]}` : ' · niveau maximum 🎉'}${cur !== null && STREAKS.includes(b.id) ? ` · série en cours : ${cur}` : ''}</small>`;
      return `
      <li class="badge ${level ? '' : 'locked'}">
        ${medal(b, level, imgFor(c.id, b.id, level).url)}
        <div class="b-body">
          <div class="b-top"><strong>${esc(b.name)}</strong><span class="b-lvl lv${level}">${lab}</span></div>
          <div class="b-desc">${esc(b.desc)}${k ? ` · « ${esc(k.label)} »` : ''}</div>
          ${prog}
          ${pips(level)}
        </div>
      </li>`;
    }).join('');

    return `
      <header class="top"><h1>🏅 Détail des badges</h1></header>
      ${weekModes()}
      ${childTabs()}
      <section class="card b-sum"><strong>${got} / ${list.length}</strong> badges débloqués · <strong>${lvls}</strong> niveau${plural(lvls)}</section>
      <ul class="badges">${cards || '<li class="note">Aucun badge actif. Activez-les dans Réglages › Badges.</li>'}</ul>
      <p class="note">Un niveau gagné ne se perd jamais. Pour les séries, c’est le meilleur record qui compte. Les jours non comptés ne cassent pas une série.</p>`;
  }

  const setModes = () => `<div class="seg2" role="tablist">
    <button class="${ui.setMode === 'badges' ? '' : 'on'}" data-action="set-mode" data-mode="general">Général</button>
    <button class="${ui.setMode === 'badges' ? 'on' : ''}" data-action="set-mode" data-mode="badges">🏅 Badges</button></div>`;

  function imgRow(c, b) {
    const lv = ui.imgLvl || 0;
    const url = imgUrl(c.id, b.id, lv);
    const rec = IMG.recs[imgKey(c.id, b.id, lv)];
    const gif = gifOf(c.id, b.id, lv, true);
    const data = `data-child="${c.id}" data-badge="${b.id}" data-lvl="${lv}"`;
    const chips = ['Toutes', ...LEVELS].map((n, i) => {
      const has = !!imgUrl(c.id, b.id, i), hg = !!gifOf(c.id, b.id, i, true);
      return `<button class="${i === lv ? 'on' : ''}" data-action="img-lvl" data-lvl="${i}" data-badge="${b.id}">${i ? `<i class="dotc lv${i}"></i>` : ''}${esc(n)}${has ? ' ✓' : ''}${hg ? ' 🎬' : ''}</button>`;
    }).join('');
    return `
      <div class="lv-chips" role="tablist" aria-label="Niveau de l’image">${chips}</div>
      <p class="hint">${lv ? `Image affichée quand la carte est au niveau <strong>${LEVELS[lv - 1]}</strong>.` : 'Image utilisée pour tous les niveaux qui n’ont pas leur propre image.'}</p>
      <div class="img-row">
        <div class="img-prev">${url ? `<img src="${url}" alt="">` : `<span>${b.e}</span>`}</div>
        <div class="img-btns">
          <label class="btn ghost">🖼️ ${url ? 'Changer l’image' : 'Choisir une image'}<input type="file" accept="image/*" hidden data-img="${c.id}|${b.id}|${lv}"></label>
          ${url ? `<button class="btn ghost" data-action="img-nobg" ${data}>✂️ Retirer le fond uni</button>
          <button class="btn ghost ${rec && rec.bg === 'none' ? 'on' : ''}" data-action="img-bg" ${data}>${rec && rec.bg === 'none' ? '🎨 Remettre le fond coloré' : '🔲 Sans fond coloré (transparent)'}</button>
          <button class="btn ghost" data-action="img-orig" ${data}>↩️ Image d’origine</button>
          <button class="btn danger" data-action="img-del" ${data}>Supprimer l’image</button>` : ''}
        </div>
      </div>
      <p class="hint">L’image reste sur cet appareil : elle n’est ni envoyée, ni synchronisée avec l’autre téléphone.</p>
      <div class="img-row">
        <div class="img-prev">${gif ? (gif.video ? `<video src="${gif.url}" muted loop playsinline autoplay></video>` : `<img src="${gif.url}" alt="">`) : '🎬'}</div>
        <div class="img-btns">
          <label class="btn ghost">🎬 ${gif ? 'Changer le GIF' : 'Choisir un GIF'}<input type="file" accept="image/gif,image/webp,image/apng,video/mp4,video/webm,video/quicktime" hidden data-gif="${c.id}|${b.id}|${lv}"></label>
          ${gif ? `<button class="btn danger" data-action="gif-del" ${data}>Supprimer le GIF</button>` : ''}
        </div>
      </div>
      <p class="hint">${lv ? `GIF du niveau ${LEVELS[lv - 1]}` : 'GIF « Toutes »'} : il s’affiche tant qu’on garde le doigt appuyé sur la carte (un niveau sans GIF utilise celui de « Toutes »). GIF ou courte vidéo, 12 Mo maximum, conservé sur cet appareil.</p>`;
  }

  function badgeSettingsView() {
    const c = curChild();
    const cards = BADGES.map(b => {
      const cf = badgeCfg(c, b);
      const auto = b.task ? badgeTask(c, { ...b, id: '' }) : null;
      const sel = b.task ? `
        <label class="field">Tâche liée
          <select class="in" data-bind="badge|${c.id}|${b.id}|task">
            <option value="" ${cf.task ? '' : 'selected'}>Automatique${auto && !cf.task ? ` (« ${esc(auto.label)} »)` : ''}</option>
            ${c.tasks.map(k => `<option value="${k.id}" ${cf.task === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}
          </select></label>` : '';
      const grid = LEVELS.map((n, i) => `
        <label class="field lvf"><span><i class="dotc lv${i + 1}"></i>${n}</span>
          <input class="in" type="number" min="1" max="99999" inputmode="numeric" value="${cf.lv[i]}" data-bind="badge|${c.id}|${b.id}|l${i}" aria-label="Seuil ${n} : ${esc(b.name)}"></label>`).join('');
      return `
      <section class="card bset">
        <div class="bset-head">
          <span class="bset-e">${b.e}</span>
          <div class="grow"><strong>${esc(b.name)}</strong><div class="hint" style="margin:0">${esc(b.desc)}</div></div>
          <label class="chk"><input type="checkbox" ${cf.on ? 'checked' : ''} data-bind="badge|${c.id}|${b.id}|on"> Actif</label>
        </div>
        <details ${ui.openBadge === b.id ? 'open' : ''}>
          <summary>Image, niveaux${b.task ? ' et tâche' : ''}</summary>
          ${imgRow(c, b)}
          ${sel}
          <p class="hint">Seuil à atteindre (en ${esc(b.unit)}) pour chaque niveau.</p>
          <div class="lv-grid">${grid}</div>
          <button class="btn ghost" data-action="badge-reset" data-child="${c.id}" data-badge="${b.id}">Valeurs par défaut</button>
        </details>
      </section>`;
    }).join('');

    return `
      <header class="top"><h1>⚙️ Réglages</h1></header>
      ${setModes()}
      ${childTabs()}
      <p class="hint">Réglages des badges de ${esc(c.name)} : activez ou masquez chaque badge, choisissez la tâche liée et ajustez les seuils des 7 niveaux.</p>
      ${cards}`;
  }

  /* ------------------------------------------------------------------ *
   *  Collection de cartes (page pour les enfants) : chaque badge est une carte à collectionner
   *  qu'on peut incliner au doigt (effet 3D + reflet holographique), retourner, ou piloter en
   *  inclinant le téléphone. Dessin original, sans rapport avec une marque existante.
   * ------------------------------------------------------------------ */
  const BADGE_HUE = { serie: 18, dents: 195, parfaite: 48, sansfaute: 280, champion: 38, roi: 52, retour: 350, devoirs: 220, entente: 150, chambre: 26, matinsoir: 330, chrono: 170, tirelire: 45, chasseur: 300 };
  const tc = { lp: 0, gifOn: false, drag: false, moved: false, t0: 0, x0: 0, y0: 0, wrap: null, gyro: false, hover: null };
  const clamp01 = n => Math.max(0, Math.min(1, n));

  function cardFront(x, c, mini) {
    const { b, level, v, next, k, hint } = x;
    const idx = BADGES.indexOf(b) + 1;
    const im = imgFor(c.id, b.id, level);
    const pct = next ? Math.min(100, (v / next) * 100) : 100;
    const prog = hint
      ? '<small>Demandez à un parent de régler ce badge</small>'
      : `<div class="tc-bar"><i style="width:${pct}%"></i></div><small>${v}${next ? ` / ${next}` : ''} ${esc(b.unit)}${next ? '' : ' · max 🎉'}</small>`;
    return `<div class="tcard lv${level} ${level ? '' : 'locked'} ${mini ? 'mini' : ''}" style="--h:${BADGE_HUE[b.id] || 200}">
      <div class="tc-top"><span class="tc-name">${level ? esc(b.name) : '? ? ?'}</span><span class="tc-lvl">${level ? '★'.repeat(level) : '🔒'}</span></div>
      <div class="tc-art ${im.rec && im.rec.bg === 'none' ? 'clear' : ''}">${!level ? '<span class="tc-emoji q">?</span>' : im.url ? `<img class="tc-img" src="${im.url}" alt="" draggable="false">` : `<span class="tc-emoji">${b.e}</span>`}<i class="tc-s s1"></i><i class="tc-s s2"></i><i class="tc-s s3"></i></div>
      <div class="tc-rank"><strong>${level ? LEVELS[level - 1] : 'À débloquer'}</strong><span>${esc(b.unit)}</span></div>
      <div class="tc-text">${level ? `${esc(b.desc)}${k ? ` « ${esc(k.label)} »` : ''}` : 'Carte mystère : continue tes efforts pour la découvrir !'}</div>
      <div class="tc-prog">${prog}</div>
      <div class="tc-foot"><span>${esc(c.emoji)} ${esc(c.name)}</span><span>${String(idx).padStart(2, '0')}/${BADGES.length}</span></div>
      <div class="tc-foil"></div><div class="tc-glare"></div>
    </div>`;
  }

  function cardBack(x) {
    const { b, cf, level, v, cur } = x;
    return `<div class="tcard back lv${level}" style="--h:${BADGE_HUE[b.id] || 200}">
      <div class="tb-title">BONS POINTS</div>
      <div class="tb-crest">${level ? b.e : '?'}</div>
      <ul class="tb-lv">${LEVELS.map((n, i) => `<li class="${level > i ? 'got' : ''}"><i class="dotc lv${i + 1}"></i><span>${n}</span><b>${cf.lv[i]} ${esc(b.unit)}</b><em>${level > i ? '✔' : ''}</em></li>`).join('')}</ul>
      <div class="tb-now">Actuellement : <strong>${v}</strong> ${esc(b.unit)}${cur !== null && STREAKS.includes(b.id) ? ` · série en cours : ${cur}` : ''}</div>
    </div>`;
  }

  function cardsView() {
    const c = curChild();
    const st = badgeStats(c);
    const list = BADGES.map(b => st[b.id]).filter(x => x.cf.on);
    const got = list.filter(x => x.level > 0).length;
    const lvls = list.reduce((n, x) => n + x.level, 0);
    const cards = list.map(x => `
      <li><button class="card-btn" data-action="card-open" data-badge="${x.b.id}" aria-label="${x.level ? esc(x.b.name) + ' : niveau ' + LEVELS[x.level - 1] : 'Carte mystère à débloquer'}">
        <div class="tc-box">${cardFront(x, c, true)}</div></button></li>`).join('');
    return `
      <header class="top"><h1>🏅 Mes badges</h1></header>
      ${childTabs()}
      <section class="card b-sum"><strong>${got} / ${list.length}</strong> cartes débloquées · <strong>${lvls}</strong> étoile${plural(lvls)} ⭐</section>
      <ul class="cards-grid">${cards || '<li class="note">Aucun badge actif.</li>'}</ul>
      <p class="note">Touchez une carte pour la prendre en main : inclinez-la avec le doigt, tapez pour la retourner.</p>`;
  }

  function cardViewer() {
    if (!ui.card) return '';
    const c = curChild();
    const st = badgeStats(c);
    const list = BADGES.filter(b => st[b.id].cf.on);
    const i = list.findIndex(b => b.id === ui.card);
    if (i < 0) { ui.card = null; return ''; }
    const x = st[list[i].id];
    return `
      <div class="cv" role="dialog" aria-modal="true" aria-label="Carte ${x.level ? esc(x.b.name) : 'mystère'}">
        <div class="cv-bg" data-action="card-close"></div>
        <button class="cv-x" data-action="card-close" aria-label="Fermer">✕</button>
        <div class="cv-stage">
          <div class="tc-wrap tc-box" data-child="${c.id}" data-badge="${x.b.id}" data-level="${x.level}">
            <div class="tc-tilt"><div class="tc-flip ${ui.cardFlip ? 'back' : ''}">${cardFront(x, c, false)}${cardBack(x)}</div></div>
            <div class="tc-shadow"></div>
          </div>
        </div>
        <p class="cv-hint">Glissez le doigt pour incliner la carte · tapez pour la retourner</p>
        <div class="cv-bar">
          <button class="icon-btn" data-action="card-nav" data-n="-1" aria-label="Carte précédente">‹</button>
          <button class="btn ghost" data-action="card-flip">↻ Retourner</button>
          <button class="btn ghost ${tc.gyro ? 'on' : ''}" data-action="card-gyro" aria-label="Piloter en inclinant le téléphone">📱</button>
          <button class="icon-btn" data-action="card-nav" data-n="1" aria-label="Carte suivante">›</button>
        </div>
      </div>`;
  }

  // Inclinaison : px, py entre 0 et 1 (position du doigt sur la carte)
  function tiltTo(el, px, py, glare) {
    const MAX = 28;
    const s = el.style;
    s.setProperty('--rx', `${(-(py - 0.5) * 2 * MAX).toFixed(2)}deg`);
    s.setProperty('--ry', `${((px - 0.5) * 2 * MAX).toFixed(2)}deg`);
    s.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    s.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    s.setProperty('--bx', `${(10 + px * 80).toFixed(1)}%`);
    s.setProperty('--by', `${(10 + py * 80).toFixed(1)}%`);
    s.setProperty('--px', ((px - 0.5) * 2).toFixed(3));
    s.setProperty('--py', ((py - 0.5) * 2).toFixed(3));
    s.setProperty('--go', glare ? '0.6' : '0');
  }
  function tiltFromEvent(wrap, e) {
    const r = wrap.getBoundingClientRect();
    tiltTo(wrap.querySelector('.tc-tilt'), clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height), true);
  }
  function resetTilt(wrap) {
    const el = wrap && wrap.querySelector('.tc-tilt');
    if (!el) return;
    el.classList.remove('drag');
    tiltTo(el, 0.5, 0.5, false);
  }
  function showGif(w) {
    if (ui.cardFlip || !w || !(+w.dataset.level)) return;
    const g = gifOf(w.dataset.child, w.dataset.badge, +w.dataset.level || 0);
    const art = w.querySelector('.tc-flip .tcard:not(.back) .tc-art');
    if (!g || !art || art.querySelector('.tc-gif')) return;
    let el;
    if (g.video) {
      el = document.createElement('video');
      el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true;
      el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
      el.src = g.url;
      if (el.play) { const pr = el.play(); if (pr && pr.catch) pr.catch(() => {}); }
    } else {
      el = document.createElement('img');
      el.alt = ''; el.draggable = false; el.src = g.url;
    }
    el.className = 'tc-gif';
    art.appendChild(el);
    tc.gifOn = true;
    if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* ignoré */ } }
  }
  function hideGif() {
    document.querySelectorAll('.tc-gif').forEach(e => e.remove());
    tc.gifOn = false;
  }
  function flipCard() {
    ui.cardFlip = !ui.cardFlip;
    const f = document.querySelector('.cv .tc-flip');
    if (f) f.classList.toggle('back', ui.cardFlip);
  }
  async function toggleGyro() {
    try {
      if (!('DeviceOrientationEvent' in window)) { toast('Capteurs indisponibles sur cet appareil'); return; }
      if (!tc.gyro && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { toast('Autorisation refusée'); return; }
      }
      tc.gyro = !tc.gyro;
      const b = document.querySelector('[data-action="card-gyro"]');
      if (b) b.classList.toggle('on', tc.gyro);
      if (!tc.gyro) resetTilt(document.querySelector('.cv .tc-wrap'));
      toast(tc.gyro ? '📱 Inclinez votre téléphone' : 'Inclinaison du téléphone désactivée');
    } catch (e) { toast('Inclinaison indisponible'); }
  }

  document.addEventListener('pointerdown', e => {
    const w = e.target.closest && e.target.closest('.cv .tc-wrap');
    if (!w) return;
    tc.drag = true; tc.moved = false; tc.t0 = Date.now(); tc.x0 = e.clientX; tc.y0 = e.clientY; tc.wrap = w;
    try { w.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    w.querySelector('.tc-tilt').classList.add('drag');
    tiltFromEvent(w, e);
    clearTimeout(tc.lp);
    tc.lp = setTimeout(() => { if (tc.drag && !tc.moved) showGif(tc.wrap); }, 450);
  });
  document.addEventListener('pointermove', e => {
    if (tc.drag) {
      if (Math.hypot(e.clientX - tc.x0, e.clientY - tc.y0) > 8) tc.moved = true;
      tiltFromEvent(tc.wrap, e);
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const w = e.target.closest && e.target.closest('.cv .tc-wrap');
    if (w) { tc.hover = w; w.querySelector('.tc-tilt').classList.add('drag'); tiltFromEvent(w, e); }
    else if (tc.hover) { resetTilt(tc.hover); tc.hover = null; }
  });
  const endDrag = e => {
    if (!tc.drag) return;
    clearTimeout(tc.lp);
    hideGif();
    tc.drag = false;
    const w = tc.wrap;
    if (e.type === 'pointerup' && !tc.moved && Date.now() - tc.t0 < 400) flipCard();
    resetTilt(w);
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  window.addEventListener('deviceorientation', e => {
    if (!tc.gyro || tc.drag || e.gamma === null || e.gamma === undefined) return;
    const w = document.querySelector('.cv .tc-wrap');
    if (!w) return;
    const el = w.querySelector('.tc-tilt');
    el.classList.add('drag');
    tiltTo(el, clamp01(0.5 + e.gamma / 70), clamp01(0.5 + ((e.beta || 45) - 45) / 70), true);
  });
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.cv .tc-wrap')) e.preventDefault(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.card) { ui.card = null; render(); } });

  /* ------------------------------------------------------------------ *
   *  Images personnalisées des badges : choisies depuis la galerie du téléphone et enregistrées
   *  sur CET appareil uniquement (IndexedDB). Elles ne sont ni publiées ni synchronisées.
   * ------------------------------------------------------------------ */
  const IMG = { db: null, urls: {}, recs: {}, gifs: {} };
  const imgKey = (cid, bid, lv) => lv ? `${cid}|${bid}|${lv}` : `${cid}|${bid}`;
  const imgUrl = (cid, bid, lv) => IMG.urls[imgKey(cid, bid, lv)] || '';
  // Image à afficher pour un niveau : celle du niveau, sinon l'image « générale », sinon (carte verrouillée) celle du niveau 1.
  function imgFor(cid, bid, level) {
    const keys = level ? [imgKey(cid, bid, level), imgKey(cid, bid)] : [imgKey(cid, bid), imgKey(cid, bid, 1)];
    for (const k of keys) if (IMG.urls[k]) return { url: IMG.urls[k], rec: IMG.recs[k] };
    return { url: '', rec: null };
  }

  function imgDb() {
    return new Promise((res, rej) => {
      if (IMG.db) return res(IMG.db);
      if (typeof indexedDB === 'undefined') return rej(new Error('indexedDB indisponible'));
      const r = indexedDB.open('bonspoints-img', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('img');
      r.onsuccess = () => { IMG.db = r.result; res(IMG.db); };
      r.onerror = () => rej(r.error);
    });
  }
  const imgTx = (mode, fn) => imgDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction('img', mode);
    const out = fn(tx.objectStore('img'));
    tx.oncomplete = () => res(out);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  }));
  function setRec(key, rec) {
    if (IMG.urls[key]) URL.revokeObjectURL(IMG.urls[key]);
    if (rec) { IMG.recs[key] = rec; IMG.urls[key] = URL.createObjectURL(rec.cur); }
    else { delete IMG.recs[key]; delete IMG.urls[key]; }
  }
  async function loadImgs() {
    try {
      const rq = {};
      await imgTx('readonly', st => { rq.k = st.getAllKeys(); rq.v = st.getAll(); });
      rq.k.result.forEach((k, i) => {
        const r = rq.v.result[i];
        if (String(k).indexOf('gif|') === 0) { if (r && r.blob) setGif(k, r); }
        else if (r && r.cur) setRec(k, r);
      });
      return rq.k.result.length > 0;
    } catch (e) { return false; }
  }
  const gifKey = (cid, bid, lv) => lv ? `gif|${cid}|${bid}|${lv}` : `gif|${cid}|${bid}`;
  // GIF d'un niveau, sinon le GIF « général » ; exact = sans repli (pour l'écran de réglage)
  const gifOf = (cid, bid, lv, exact) => {
    if (exact) return IMG.gifs[gifKey(cid, bid, lv)] || null;
    return (lv && IMG.gifs[gifKey(cid, bid, lv)]) || IMG.gifs[gifKey(cid, bid)] || (!lv && IMG.gifs[gifKey(cid, bid, 1)]) || null;
  };
  function setGif(key, rec) {
    if (IMG.gifs[key]) URL.revokeObjectURL(IMG.gifs[key].url);
    if (rec) IMG.gifs[key] = { url: URL.createObjectURL(rec.blob), video: !!rec.video };
    else delete IMG.gifs[key];
  }
  const GIF_MAX = 12 * 1024 * 1024;
  async function gifPick(cid, bid, file, lv) {
    try {
      if (file.size > GIF_MAX) { toast('Fichier trop lourd (12 Mo maximum)'); return; }
      const video = /^video\//.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name || '');
      if (!video) { const bmp = await createImageBitmap(file); if (bmp.close) bmp.close(); }
      const rec = { blob: file, video };
      await imgTx('readwrite', st => st.put(rec, gifKey(cid, bid, lv)));
      setGif(gifKey(cid, bid, lv), rec);
      toast('GIF enregistré sur cet appareil ✔');
    } catch (e) { toast('Fichier illisible ou stockage impossible'); }
    ui.openBadge = bid;
    render();
  }
  async function gifDel(cid, bid, lv) {
    try { await imgTx('readwrite', st => st.delete(gifKey(cid, bid, lv))); setGif(gifKey(cid, bid, lv), null); }
    catch (e) { toast('Suppression impossible'); }
    ui.openBadge = bid;
    render();
  }

  async function putImg(key, rec) { await imgTx('readwrite', st => st.put(rec, key)); setRec(key, rec); }
  async function delImg(key) { await imgTx('readwrite', st => st.delete(key)); setRec(key, null); }

  const blobOf = cv => new Promise(res => cv.toBlob(b => res(b), 'image/webp', 0.92)); // Safari : repli PNG
  async function decodeImg(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* repli ci-dessous */ }
    }
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = URL.createObjectURL(blob);
    });
  }
  const dimsOf = im => [im.width || im.naturalWidth, im.height || im.naturalHeight];

  // Réduit l'image (côté le plus long : 640 px) pour qu'elle reste légère.
  async function shrink(file) {
    const im = await decodeImg(file);
    const [w0, h0] = dimsOf(im);
    const k = Math.min(1, 640 / Math.max(w0, h0));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w0 * k));
    cv.height = Math.max(1, Math.round(h0 * k));
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return blobOf(cv);
  }

  // Retire un fond uni (blanc, couleur unie ou faux damier de transparence) connecté aux bords.
  // Renvoie null si le fond n'est pas uni ou si le résultat paraît aberrant.
  async function noBg(blob) {
    const im = await decodeImg(blob);
    const [w, h] = dimsOf(im);
    if (w < 16 || h < 16) return null;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(im, 0, 0);
    const img = cx.getImageData(0, 0, w, h), d = img.data;
    const dist = (i, c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);

    const pal = [];
    for (const [x0, y0] of [[0, 0], [w - 8, 0], [0, h - 8], [w - 8, h - 8]]) {
      for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 200) return null; // déjà transparent
        const c = [d[i], d[i + 1], d[i + 2]];
        if (!pal.some(p => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 24)) pal.push(c);
      }
    }
    if (pal.length > 6) return null;
    const isBg = i => pal.some(c => dist(i, c) < 54);

    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
      const p = y * w + x;
      if (!seen[p] && isBg(p * 4)) { seen[p] = 1; stack.push(p); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    let n = 0;
    while (stack.length) {
      const p = stack.pop();
      n++;
      const x = p % w, y = (p - x) / w;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    if (n < w * h * 0.02 || n > w * h * 0.96) return null;
    for (let p = 0; p < w * h; p++) if (seen[p]) d[p * 4 + 3] = 0;
    cx.putImageData(img, 0, 0);
    return blobOf(cv);
  }

  async function hasAlpha(blob) {
    try {
      const im = await decodeImg(blob);
      const [w, h] = dimsOf(im);
      const cv = document.createElement('canvas'); cv.width = Math.min(w, 200); cv.height = Math.min(h, 200);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(im, 0, 0, cv.width, cv.height);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    } catch (e) { /* ignoré */ }
    return false;
  }
  async function imgBg(cid, bid, lv) {
    const key = imgKey(cid, bid, lv), r = IMG.recs[key];
    if (!r) return;
    try { await putImg(key, { cur: r.cur, orig: r.orig, bg: r.bg === 'none' ? undefined : 'none' }); } catch (e) { toast('Enregistrement impossible'); }
    ui.openBadge = bid;
    render();
  }
  async function imgPick(cid, bid, file, lv) {
    try {
      const orig = await shrink(file);
      await putImg(imgKey(cid, bid, lv), { cur: orig, orig });
      toast('Image enregistrée sur cet appareil ✔');
    } catch (e) { toast('Image illisible ou stockage impossible'); }
    ui.openBadge = bid;
    render();
  }
  async function imgNoBg(cid, bid, lv) {
    const key = imgKey(cid, bid, lv), r = IMG.recs[key];
    if (!r) return;
    try {
      const nb = await noBg(r.orig);
      if (!nb) { toast(await hasAlpha(r.orig) ? 'Cette image a déjà un fond transparent ✔' : 'Fond non uniforme : impossible de le retirer automatiquement'); return; }
      await putImg(key, { cur: nb, orig: r.orig, bg: r.bg });
      toast('Fond retiré ✔');
    } catch (e) { toast('Retrait du fond impossible'); }
    ui.openBadge = bid;
    render();
  }
  async function imgOrig(cid, bid, lv) {
    const key = imgKey(cid, bid, lv), r = IMG.recs[key];
    if (!r) return;
    try { await putImg(key, { cur: r.orig, orig: r.orig, bg: r.bg }); } catch (e) { toast('Enregistrement impossible'); }
    ui.openBadge = bid;
    render();
  }
  async function imgDel(cid, bid, lv) {
    try { await delImg(imgKey(cid, bid, lv)); } catch (e) { toast('Suppression impossible'); }
    ui.openBadge = bid;
    render();
  }

  /* ------------------------------------------------------------------ *
   *  Vues
   * ------------------------------------------------------------------ */
  function childTabs() {
    return `<div class="tabs" role="tablist">${state.settings.children.map(c => `
      <button class="tab ${c.id === curChild().id ? 'on' : ''}" role="tab" data-action="child" data-id="${c.id}">
        ${esc(c.emoji)} ${esc(c.name)}
      </button>`).join('')}</div>`;
  }

  function dayView() {
    const c = curChild();
    const ds = ui.date;
    const d = parse(ds);
    const pts = dayPoints(c, ds);
    const max = dayMax(c);
    const rated = dayRated(c, ds);
    const reached = goalReached(c, ds);
    const counted = state.settings.countedDays.includes(dow(d));
    const pct = max ? Math.max(0, Math.min(100, (pts / max) * 100)) : 0;
    const goalPct = max ? Math.max(0, Math.min(100, (c.dailyGoal / max) * 100)) : 0;

    let msg;
    if (reached) msg = '🎉 Objectif atteint, bravo !';
    else if (rated) msg = `Encore ${c.dailyGoal - pts} point${plural(c.dailyGoal - pts)} pour atteindre l’objectif`;
    else msg = 'Notez la journée avec ✔ (fait) ou ✖ (pas fait)';

    const seg = (k, key) => {
      const v = getV(ds, c.id, key);
      const tk = tkey(ds, c.id, key);
      const run = timers[tk];
      let ok;
      if (k.timer > 0 && v !== 1) {
        ok = run
          ? `<button class="seg-btn ok timer run" data-action="timer-stop" data-task="${key}" aria-label="Arrêter le minuteur : ${esc(k.label)}">
              <span data-timer-text="${tk}">${clock(Math.max(0, Math.ceil((run.end - Date.now()) / 1000)))}</span><i style="width:${Math.min(100, ((Date.now() - (run.end - run.dur * 1000)) / (run.dur * 1000)) * 100)}%"></i></button>`
          : `<button class="seg-btn ok timer" data-action="timer-start" data-task="${key}" aria-label="Lancer le minuteur de ${dur(k.timer)} : ${esc(k.label)}">▶ ${clock(k.timer)}</button>`;
      } else {
        ok = `<button class="seg-btn ok ${v === 1 ? 'on' : ''}" data-action="rate" data-task="${key}" data-v="1"
            aria-pressed="${v === 1}" aria-label="Fait : ${esc(k.label)}">✔</button>`;
      }
      return `<div class="seg">${ok}
          <button class="seg-btn ko ${v === -1 ? 'on' : ''}" data-action="rate" data-task="${key}" data-v="-1"
            aria-pressed="${v === -1}" aria-label="Pas fait : ${esc(k.label)}">✖</button></div>`;
    };
    const rows = c.tasks.map(k => {
      const head = `<div>
          <div class="task-name">${esc(k.label)}${k.timer > 0 ? ` <span class="badge">⏱ ${dur(k.timer)}</span>` : ''}</div>
          <div class="task-pts">+${k.ok} si fait${k.ko ? ` · −${k.ko} sinon` : ''}${k.slots ? ' (par coche)' : ''}</div>
        </div>`;
      if (!k.slots) return `<li class="task">${head}${seg(k, k.id)}</li>`;
      return `<li class="task slots">${head}<div class="slot-list">
          <div class="slot"><span class="slot-l">☀️ Matin</span>${seg(k, k.id)}</div>
          <div class="slot"><span class="slot-l">🌙 Soir</span>${seg(k, k.id + '@s')}</div></div></li>`;
    }).join('');
    const hasTimer = c.tasks.some(k => k.timer > 0);

    return `
      <header class="top"><h1>⭐ Bons points</h1></header>
      ${childTabs()}
      <div class="datebar">
        <button class="icon-btn" data-action="day-shift" data-n="-1" aria-label="Jour précédent">‹</button>
        <div class="date-label">
          <strong>${esc(cap(longDate(d)))}</strong>
          ${ds === today() ? '<span class="chip">Aujourd’hui</span>' : '<button class="link" data-action="day-today">Revenir à aujourd’hui</button>'}
        </div>
        <button class="icon-btn" data-action="day-shift" data-n="1" aria-label="Jour suivant">›</button>
      </div>
      <section class="score ${reached ? 'reached' : ''}">
        <div class="score-main"><span class="score-num">${pts}</span><span class="score-max">/ ${c.dailyGoal} objectif (max ${max})</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div><div class="bar-goal" style="left:${goalPct}%"></div></div>
        <p class="score-msg">${msg}</p>
      </section>
      <ul class="tasks">${rows}</ul>
      <div class="row-actions">
        <button class="btn" data-action="all-done">Tout fait ✔</button>
        <button class="btn ghost" data-action="clear-day">Effacer la journée</button>
      </div>
      ${hasTimer ? '<p class="note">⏱ Lancez le minuteur : les points sont accordés à la fin. Parents : maintenez ▶ appuyé pour valider sans minuteur.</p>' : ''}
      ${counted ? '' : '<p class="note">Ce jour n’est pas compté pour la récompense du week-end.</p>'}`;
  }

  function weekCard(c, mon, finished) {
    const total = weekTotal(c, mon);
    const { got, next, ts } = tierState(c, total);
    const cs = state.settings.countedDays;

    const cells = DAY_SHORT.map((n, i) => {
      const ds = fmt(addDays(mon, i));
      const rated = dayRated(c, ds);
      return `<button class="wd ${cs.includes(i) ? '' : 'off'} ${ds === today() ? 'today' : ''}"
        data-action="goto-day" data-child="${c.id}" data-date="${ds}" aria-label="${DAY_NAMES[i]}">
        <span class="wd-n">${n}</span><span class="wd-p">${rated ? dayPoints(c, ds) : '–'}</span>
        <span class="wd-s">${goalReached(c, ds) ? '⭐' : ''}</span></button>`;
    }).join('');

    const scale = Math.max(total, 1, ...ts.map(t => t.min));
    const fill = Math.max(0, Math.min(100, (total / scale) * 100));
    const marks = ts.map(t => `<div class="tier-mark" style="left:${(t.min / scale) * 100}%">${esc(t.emoji)}<small>${t.min}</small></div>`).join('');
    const bar = ts.length ? `<div class="tier-bar"><div class="tier-fill" style="width:${fill}%"></div>${marks}</div>` : '';

    let verdict;
    if (got) {
      verdict = `<div class="verdict won">${esc(got.emoji)} Palier ${esc(got.name)} ${finished ? 'atteint' : 'atteint (provisoire)'}
        <small>Récompense du week-end : ${esc(got.reward)}</small></div>`;
    } else if (next) {
      const left = next.min - total;
      verdict = `<div class="verdict">${finished ? 'Pas de palier cette semaine : pas de bonus, on repart à zéro lundi 💪'
        : `Encore ${left} point${plural(left)} pour le palier ${esc(next.emoji)} ${esc(next.name)}`}</div>`;
    } else {
      verdict = '';
    }

    const st = stats(c, countedDates(mon));
    const prev = stats(c, countedDates(addDays(mon, -7)));
    let trend = '';
    if (st.rated && prev.rated) {
      const d = st.net - prev.net;
      trend = `<p class="trend ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d === 0 ? '＝ Identique à la semaine précédente' : `${d > 0 ? '▲' : '▼'} ${signed(d)} pt${plural(d)} par rapport à la semaine précédente`} (${prev.net} pts)</p>`;
    }
    const weak = st.per.filter(p => p.lost > 0).sort((x, y) => y.lost - x.lost);
    const split = st.rated ? `
        <div class="split">
          ${donut([{ v: st.gained, color: 'var(--ok)' }, { v: st.lost, color: 'var(--ko)' }], signed(st.net), 'net', `Bons et mauvais points de ${c.name}`)}
          ${legend([
            { color: 'var(--ok)', label: 'Bons points', value: `+${st.gained}` },
            { color: 'var(--ko)', label: 'Mauvais points', value: `−${st.lost}` },
            { color: 'var(--line)', label: 'Objectif atteint', value: `${st.goals} / ${st.rated} j` }
          ])}
        </div>
        ${weak.length ? `<p class="hint">À améliorer : ${weak.map(p => `${esc(p.label)} (−${p.lost})`).join(', ')}</p>` : ''}
        ${trend}` : '<p class="hint">Aucune journée notée cette semaine.</p>';

    return `
      <section class="card">
        <div class="card-head">
          <h2>${esc(c.emoji)} ${esc(c.name)}</h2>
          <div class="total">${total} <small>pts</small></div>
        </div>
        <div class="week-days">${cells}</div>
        ${bar}
        ${verdict}
        ${split}
      </section>`;
  }

  function weekView() {
    if (ui.weekMode === 'evol') return evoView();
    if (ui.weekMode === 'badges') return badgesView();
    const mon = monday(parse(ui.weekRef));
    const sun = addDays(mon, 6);
    const cs = state.settings.countedDays;
    const lastCounted = cs.length ? Math.max(...cs) : -1;
    const finished = lastCounted >= 0 && today() > fmt(addDays(mon, lastCounted));
    const isThisWeek = fmt(monday(new Date())) === fmt(mon);
    const label = `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;

    return `
      <header class="top"><h1>🏆 Bilan de la semaine</h1></header>
      ${weekModes()}
      <div class="datebar">
        <button class="icon-btn" data-action="week-shift" data-n="-1" aria-label="Semaine précédente">‹</button>
        <div class="date-label">
          <strong>${esc(label)}</strong>
          ${isThisWeek ? '<span class="chip">Cette semaine</span>' : '<button class="link" data-action="week-today">Revenir à cette semaine</button>'}
          ${finished ? '<span class="chip final">Semaine terminée</span>' : ''}
        </div>
        <button class="icon-btn" data-action="week-shift" data-n="1" aria-label="Semaine suivante">›</button>
      </div>
      ${state.settings.children.map(c => weekCard(c, mon, finished)).join('')}
      <p class="note">Jours comptés : ${cs.length ? [...cs].sort().map(i => DAY_SHORT[i]).join(', ') : 'aucun'}. Les étoiles ⭐ indiquent un objectif quotidien atteint. Touchez un jour pour le modifier.</p>`;
  }

  function settingsView() {
    if (ui.setMode === 'badges') return badgeSettingsView();
    const kids = state.settings.children.map(c => {
      const tasks = c.tasks.map(k => `
        <div class="s-task">
          <input class="in grow" type="text" value="${esc(k.label)}" data-bind="task|${c.id}|${k.id}|label" aria-label="Nom de la tâche">
          <label class="num"><span>+</span><input type="number" min="0" max="99" inputmode="numeric" value="${k.ok}" data-bind="task|${c.id}|${k.id}|ok" aria-label="Points si fait"></label>
          <label class="num"><span>−</span><input type="number" min="0" max="99" inputmode="numeric" value="${k.ko}" data-bind="task|${c.id}|${k.id}|ko" aria-label="Points retirés si pas fait"></label>
          <button class="icon-btn danger" data-action="del-task" data-child="${c.id}" data-task="${k.id}" aria-label="Supprimer la tâche">🗑</button>
          <div class="s-opts">
            <label class="chk"><input type="checkbox" ${k.slots ? 'checked' : ''} data-bind="task|${c.id}|${k.id}|slots"> ☀️🌙 Matin et soir</label>
            <label class="num tm"><span>⏱ Minuteur</span><input type="number" min="0" max="60" step="0.5" inputmode="decimal" value="${k.timer ? k.timer / 60 : ''}" placeholder="0" data-bind="task|${c.id}|${k.id}|timer" aria-label="Minuteur en minutes (0 = aucun)"><span>min</span></label>
          </div>
        </div>`).join('');

      const tiers = c.tiers.map((t, i) => `
        <div class="s-tier">
          <input class="in emo" type="text" value="${esc(t.emoji)}" data-bind="tier|${c.id}|${i}|emoji" aria-label="Emoji du palier">
          <input class="in grow" type="text" value="${esc(t.name)}" data-bind="tier|${c.id}|${i}|name" aria-label="Nom du palier">
          <label class="num"><span>≥</span><input type="number" min="0" max="999" inputmode="numeric" value="${t.min}" data-bind="tier|${c.id}|${i}|min" aria-label="Points minimum"></label>
          <button class="icon-btn danger" data-action="del-tier" data-child="${c.id}" data-idx="${i}" aria-label="Supprimer le palier">🗑</button>
          <input class="in reward" type="text" value="${esc(t.reward)}" placeholder="Récompense du week-end" data-bind="tier|${c.id}|${i}|reward" aria-label="Récompense">
        </div>`).join('');

      return `
      <section class="card">
        <div class="grid-2">
          <label class="field">Emoji<input class="in" type="text" value="${esc(c.emoji)}" data-bind="child|${c.id}|emoji"></label>
          <label class="field">Prénom<input class="in" type="text" value="${esc(c.name)}" data-bind="child|${c.id}|name"></label>
        </div>
        <div class="grid-3">
          <label class="field">Âge<input class="in" type="number" min="0" max="25" inputmode="numeric" value="${c.age}" data-bind="child|${c.id}|age"></label>
          <label class="field">Objectif par jour<input class="in" type="number" min="0" max="999" inputmode="numeric" value="${c.dailyGoal}" data-bind="child|${c.id}|dailyGoal"></label>
        </div>
        <h3 class="s-title">Tâches <small class="hint">(+ si fait, − si pas fait)</small></h3>
        ${tasks}
        <button class="btn ghost" data-action="add-task" data-child="${c.id}">+ Ajouter une tâche</button>
        <h3 class="s-title">Paliers de récompense (total de la semaine)</h3>
        ${tiers}
        <button class="btn ghost" data-action="add-tier" data-child="${c.id}">+ Ajouter un palier</button>
        ${goalsHtml(c)}
        ${state.settings.children.length > 1 ? `<p><button class="btn danger" data-action="del-child" data-child="${c.id}">Supprimer ${esc(c.name)}</button></p>` : ''}
      </section>`;
    }).join('');

    const days = DAY_NAMES.map((n, i) => `
      <label><input type="checkbox" data-bind="day|${i}" ${state.settings.countedDays.includes(i) ? 'checked' : ''}> ${n}</label>`).join('');

    return `
      <header class="top"><h1>⚙️ Réglages</h1></header>
      ${setModes()}
      ${kids}
      <p><button class="btn ghost" data-action="add-child">+ Ajouter un enfant</button></p>
      <section class="card">
        <h3 class="s-title" style="margin-top:0">Jours comptés pour la récompense</h3>
        <div class="days-check">${days}</div>
        <p class="hint">Par défaut du lundi au vendredi : le bilan donne la récompense du week-end.</p>
      </section>
      ${syncHtml()}
      <section class="card">
        <h3 class="s-title" style="margin-top:0">Code parent 🔒</h3>
        <p class="hint">Code à 4 chiffres demandé pour ouvrir les Réglages et valider une récompense. C’est un verrou simple contre les enfants, pas une protection de données sensibles.</p>
        <div class="row-actions">
          <input id="new-pin" class="in" style="max-width:150px" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*" placeholder="Nouveau code" autocomplete="off" aria-label="Nouveau code à 4 chiffres">
          <button class="btn" data-action="set-pin">Changer le code</button>
        </div>
      </section>
      <section class="card">
        <h3 class="s-title" style="margin-top:0">Sauvegarde</h3>
        <p class="hint">Les données sont stockées uniquement sur cet appareil. Exportez régulièrement une sauvegarde, ou utilisez-la pour passer d’un téléphone à l’autre.</p>
        <div class="row-actions">
          <button class="btn" data-action="export">Exporter</button>
          <button class="btn ghost" data-action="import">Importer</button>
          <button class="btn danger" data-action="reset">Tout réinitialiser</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        ${installPrompt ? '<p><button class="btn" data-action="install">📲 Installer l’application</button></p>' : ''}
        <p class="hint">iPhone : bouton Partager, puis « Sur l’écran d’accueil ». Android : menu du navigateur, puis « Installer l’application ».</p>
      </section>`;
  }

  function cagnotteView() {
    const c = curChild();
    const b = bank(c);
    const bal = Math.max(0, b.balance);
    const g = activeGoal(c);
    const cur = b.weeks.length ? b.weeks[b.weeks.length - 1].pts : 0;

    let goal;
    if (!g) {
      goal = '<section class="card"><p class="note" style="margin:0">Aucun objectif en cours. Un parent peut en ajouter dans Réglages 🔒.</p></section>';
    } else {
      const pct = Math.min(100, (bal / g.target) * 100);
      const reached = bal >= g.target;
      const left = g.target - bal;
      const past = b.weeks.slice(0, -1).slice(-4);
      const avg = past.length ? past.reduce((t, w) => t + w.pts, 0) / past.length : 0;
      const wk = avg > 0 ? Math.ceil(left / avg) : 0;
      const msg = reached ? '🎉 Objectif atteint, bravo !'
        : `Encore ${left} point${plural(left)}${avg > 0 ? ` · environ ${wk} semaine${plural(wk)} à ce rythme` : ''}`;
      goal = `
      <section class="card goal ${reached ? 'reached' : ''}">
        <div class="goal-head">
          <span class="goal-emoji">${esc(g.emoji)}</span>
          <div><strong>${esc(g.name)}</strong><div class="hint" style="margin:0">Objectif : ${g.target} points</div></div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <p class="score-msg">${msg}</p>
        ${reached ? `<p><button class="btn" data-action="validate-goal" data-child="${c.id}">Valider la récompense 🔒</button></p>` : ''}
      </section>`;
    }

    const next = c.goals.filter(x => !x.done).slice(1);
    const upcoming = next.length ? `
      <section class="card">
        <h3 class="s-title" style="margin-top:0">Prochains objectifs</h3>
        ${next.map(x => `<div class="row-item"><span>${esc(x.emoji)} ${esc(x.name)}</span><strong>${x.target} pts</strong></div>`).join('')}
      </section>` : '';

    const got = [...c.spent].reverse();
    const history = got.length ? `
      <section class="card">
        <h3 class="s-title" style="margin-top:0">Récompenses obtenues</h3>
        ${got.map(x => `<div class="row-item"><span>${esc(x.emoji)} ${esc(x.name)}</span><span class="hint" style="margin:0">${fmtFR(x.date)} · −${x.cost} pts</span></div>`).join('')}
      </section>` : '';

    return `
      <header class="top"><h1>💰 Cagnotte</h1></header>
      ${childTabs()}
      <section class="card" style="margin-top:14px">
        <div class="card-head">
          <h2>${esc(c.emoji)} ${esc(c.name)}</h2>
          <div class="total">${bal} <small>pts</small></div>
        </div>
        <p class="hint" style="margin-bottom:0">Gagnés : ${b.earned} · Dépensés : ${b.spent} · Cette semaine : +${cur} (provisoire)</p>
      </section>
      ${goal}
      ${upcoming}
      ${history}
      <p class="note">Les points positifs de chaque semaine s’ajoutent à la cagnotte. Une mauvaise semaine compte 0 : la cagnotte ne baisse jamais.</p>`;
  }

  function goalsHtml(c) {
    const open = c.goals.filter(g => !g.done);
    const rows = open.map((g, i) => `
        <div class="s-tier">
          <input class="in emo" type="text" value="${esc(g.emoji)}" data-bind="goal|${c.id}|${g.id}|emoji" aria-label="Emoji de l’objectif">
          <input class="in grow" type="text" value="${esc(g.name)}" data-bind="goal|${c.id}|${g.id}|name" aria-label="Nom de l’objectif">
          <label class="num"><input type="number" min="1" max="9999" inputmode="numeric" value="${g.target}" data-bind="goal|${c.id}|${g.id}|target" aria-label="Points nécessaires"><span>pts</span></label>
          <button class="icon-btn" data-action="goal-up" data-child="${c.id}" data-goal="${g.id}" ${i === 0 ? 'disabled' : ''} aria-label="Rendre prioritaire">↑</button>
          <button class="icon-btn danger" data-action="del-goal" data-child="${c.id}" data-goal="${g.id}" aria-label="Supprimer l’objectif">🗑</button>
        </div>`).join('');
    return `
        <h3 class="s-title">Objectifs de la cagnotte <small class="hint">(le premier de la liste est en cours)</small></h3>
        ${rows || '<p class="hint">Aucun objectif en cours.</p>'}
        <button class="btn ghost" data-action="add-goal" data-child="${c.id}">+ Ajouter un objectif</button>`;
  }

  function pinOverlay() {
    const p = ui.pin;
    if (!p) return '';
    const shake = p.shake; p.shake = false;
    const dots = [0, 1, 2, 3].map(i => `<span class="dot ${i < p.value.length ? 'on' : ''}"></span>`).join('');
    const digit = n => `<button class="key" data-action="pin-key" data-k="${n}" aria-label="${n}">${n}</button>`;
    return `
      <div class="pin-wrap" role="dialog" aria-modal="true" aria-label="Code parent">
        <div class="pin ${shake ? 'shake' : ''}">
          <h2 style="margin:0">🔒 Code parent</h2>
          <div class="dots" aria-hidden="true">${dots}</div>
          <p class="pin-msg" role="alert">${esc(p.msg || '')}</p>
          <div class="keypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit).join('')}
            <button class="key small" data-action="pin-cancel">Annuler</button>
            ${digit(0)}
            <button class="key small" data-action="pin-del" aria-label="Effacer">⌫</button>
          </div>
        </div>
      </div>`;
  }

  function nav() {
    const item = (t, icon, label) =>
      `<button class="${ui.tab === t ? 'on' : ''}" data-action="tab" data-tab="${t}" aria-label="${label}"><span>${icon}</span>${label}</button>`;
    return `<nav class="nav"><div class="nav-inner">${item('day', '📅', 'Jour')}${item('week', '🏆', 'Semaine')}${item('cards', '🏅', 'Badges')}${item('cagnotte', '💰', 'Cagnotte')}${item('settings', ui.unlocked ? '⚙️' : '🔒', 'Réglages')}</div></nav>`;
  }

  function render() {
    const y = window.scrollY;
    if (ui.tab === 'settings' && !ui.unlocked) ui.tab = 'day';
    if (tc.drag) { setTimeout(render, 300); return; }
    if (ui.tab !== 'cards') ui.card = null;
    const view = ui.tab === 'week' ? weekView() : ui.tab === 'cards' ? cardsView() : ui.tab === 'cagnotte' ? cagnotteView()
      : ui.tab === 'settings' ? settingsView() : dayView();
    document.getElementById('app').innerHTML = `<main class="view">${view}</main>${nav()}${cardViewer()}${pinOverlay()}`;
    document.documentElement.classList.toggle('noscroll', !!ui.card);
    window.scrollTo(0, y);
  }

  /* ------------------------------------------------------------------ *
   *  Retours visuels
   * ------------------------------------------------------------------ */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function celebrate(c) {
    const emojis = ['⭐', '🎉', '✨', '🌟', '🏆'];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'fx';
      s.textContent = emojis[i % emojis.length];
      s.style.left = `${8 + Math.random() * 84}%`;
      s.style.animationDelay = `${Math.random() * 0.4}s`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 2200);
    }
    toast(`🎉 Objectif atteint pour ${c.name} !`);
  }

  /* ------------------------------------------------------------------ *
   *  Actions
   * ------------------------------------------------------------------ */
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    if (ui.tab === 'settings') render();
  });

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ------------------------------------------------------------------ *
   *  Synchronisation entre appareils (serveur Cloudflare Workers + D1)
   * ------------------------------------------------------------------ */
  const SYNC_LS = 'bonspoints.sync';
  const DEFAULT_SYNC_URL = 'https://bons-points-sync.delph-ulrich.workers.dev';
  const KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;
  const clone = o => JSON.parse(JSON.stringify(o));
  const canon = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((r, x) => { r[x] = v[x]; return r; }, {}) : v));
  const b64u = t => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = t => atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const okUrl = u => /^https:\/\/[^\s/]+[^\s]*$/.test(u) || /^http:\/\/localhost(:\d+)?$/.test(u);

  function loadSync() {
    try {
      const o = JSON.parse(localStorage.getItem(SYNC_LS));
      if (o && okUrl(o.url) && KEY_RE.test(o.key)) return { url: o.url, key: o.key };
    } catch (e) { /* aucune configuration */ }
    return {};
  }
  function saveSync() {
    try {
      if (sync.key) localStorage.setItem(SYNC_LS, JSON.stringify(sync));
      else localStorage.removeItem(SYNC_LS);
    } catch (e) { /* ignoré */ }
  }
  let sync = loadSync();
  let syncInfo = { state: sync.key ? 'idle' : 'off', at: 0, msg: '' };
  let syncing = false, syncAgain = false, syncTimer = null;

  const pairingCode = () => b64u(JSON.stringify({ u: sync.url, k: sync.key }));
  const pairingLink = () => `${location.origin}${location.pathname}#sync=${pairingCode()}`;
  function parsePairing(text) {
    const m = /sync=([A-Za-z0-9_-]+)/.exec(text);
    try {
      const o = JSON.parse(unb64u(m ? m[1] : text.trim()));
      if (o && typeof o.u === 'string' && okUrl(o.u) && KEY_RE.test(o.k || '')) return { url: o.u.replace(/\/+$/, ''), key: o.k };
    } catch (e) { /* code invalide */ }
    return null;
  }

  function syncLabel() {
    if (!sync.key) return 'Non configurée';
    if (syncInfo.state === 'busy') return 'Synchronisation…';
    if (syncInfo.state === 'err') return syncInfo.msg || 'Erreur de synchronisation';
    if (syncInfo.at) { const d = new Date(syncInfo.at); return `Synchronisé à ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
    return 'En attente';
  }
  function paintSync() {
    const el = document.getElementById('sync-chip');
    if (el) el.textContent = syncLabel();
  }

  const wireDoc = () => ({ v: 1, epoch: state.epoch, settings: state.settings, settingsTs: state.settingsTs, log: state.log, ts: state.ts });
  const isWire = d => !!(d && typeof d === 'object' && d.settings && Array.isArray(d.settings.children) && d.log &&
    typeof d.log === 'object' && d.ts && typeof d.ts === 'object' && d.epoch && typeof d.epoch.id === 'string');

  // Fusion de deux versions des données. Le résultat est identique quel que soit l'ordre,
  // donc les appareils convergent vers les mêmes données.
  function mergeDocs(a, b) {
    if (!b) return clone(a);
    if (a.epoch.id !== b.epoch.id) {
      // Réinitialisation ou import : la version la plus récente remplace l'autre.
      const aWins = a.epoch.ts !== b.epoch.ts ? a.epoch.ts > b.epoch.ts : a.epoch.id > b.epoch.id;
      return clone(aWins ? a : b);
    }
    // Réglages : la dernière modification l'emporte (égalité départagée de façon stable).
    const win = a.settingsTs !== b.settingsTs ? (a.settingsTs > b.settingsTs ? a : b)
      : (canon(a.settings) >= canon(b.settings) ? a : b);
    const lose = win === a ? b : a;
    const out = { v: 1, epoch: clone(a.epoch), settings: clone(win.settings), settingsTs: win.settingsTs, log: {}, ts: {} };
    // Récompenses validées : on garde celles des deux côtés.
    for (const c of out.settings.children) {
      const o = lose.settings.children.find(x => x.id === c.id);
      if (!o) continue;
      const seen = new Set(c.spent.map(x => x.id));
      for (const x of (o.spent || [])) if (!seen.has(x.id)) c.spent.push(clone(x));
      c.spent.sort((p, q) => ((p.date + p.id) < (q.date + q.id) ? -1 : 1));
      for (const og of (o.goals || [])) {
        if (!og.done) continue;
        const g = c.goals.find(x => x.id === og.id);
        if (g && !g.done) { g.done = true; g.doneDate = og.doneDate; }
      }
    }
    // Notes : la plus récente de chaque case l'emporte.
    const keys = new Set([...Object.keys(a.ts), ...Object.keys(b.ts)]);
    for (const d of [a, b]) for (const ds in d.log) for (const cid in d.log[ds]) for (const tid in d.log[ds][cid]) keys.add(`${ds}|${cid}|${tid}`);
    const known = new Set(out.settings.children.map(c => c.id));
    const val = (d, ds, cid, tid) => (d.log[ds] && d.log[ds][cid] && d.log[ds][cid][tid]) || 0;
    for (const k of keys) {
      const [ds, cid, tid] = k.split('|');
      if (!known.has(cid)) continue;
      const ta = a.ts[k] || 0, tb = b.ts[k] || 0;
      const va = val(a, ds, cid, tid), vb = val(b, ds, cid, tid);
      const v = ta !== tb ? (ta > tb ? va : vb) : Math.max(va, vb);
      const t = Math.max(ta, tb);
      if (v !== 0) {
        if (!out.log[ds]) out.log[ds] = {};
        if (!out.log[ds][cid]) out.log[ds][cid] = {};
        out.log[ds][cid][tid] = v;
      }
      if (t > 0) out.ts[k] = t;
    }
    return out;
  }

  function applyMerged(m) {
    if (canon(m) === canon(wireDoc())) return;
    state.epoch = m.epoch; state.settings = m.settings; state.settingsTs = m.settingsTs;
    state.log = m.log; state.ts = m.ts;
    normalize(state);
    settingsSig = JSON.stringify(state.settings);
    lastAll = allSig();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
    if (!getChild(ui.childId)) ui.childId = state.settings.children[0].id;
    if (ui.tab !== 'settings' && !ui.pin) render();
  }

  async function api(method, body) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(sync.url + '/state', {
        method, signal: ctl.signal,
        headers: { Authorization: 'Bearer ' + sync.key, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      let json = null;
      try { json = await res.json(); } catch (e) { /* réponse vide */ }
      return { status: res.status, json };
    } finally { clearTimeout(to); }
  }

  function scheduleSync() {
    if (!sync.key) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(runSync, 2500);
  }

  async function runSync() {
    if (!sync.key || !sync.url) return;
    if (syncing) { syncAgain = true; return; }
    if (!navigator.onLine) { syncInfo = { ...syncInfo, state: 'err', msg: 'Hors connexion' }; paintSync(); return; }
    syncing = true;
    syncInfo = { ...syncInfo, state: 'busy' };
    paintSync();
    try {
      for (let i = 0; i < 4; i++) {
        const g = await api('GET');
        if (g.status === 401) throw new Error('Clé refusée par le serveur');
        if (g.status !== 200 || !g.json) throw new Error('Erreur du serveur (' + g.status + ')');
        const remote = g.json.data;
        if (remote && !isWire(remote)) throw new Error('Données du serveur illisibles');
        // Fusion et application sans aucune pause : une saisie en cours ne peut pas être écrasée.
        const merged = mergeDocs(wireDoc(), remote);
        applyMerged(merged);
        if (remote && canon(merged) === canon(remote)) break;
        const p = await api('PUT', { data: merged, baseRev: g.json.rev });
        if (p.status === 200) break;
        if (p.status !== 409) throw new Error('Erreur du serveur (' + p.status + ')');
        if (i === 3) throw new Error('Conflit, nouvel essai automatique');
      }
      syncInfo = { state: 'ok', at: Date.now(), msg: '' };
    } catch (e) {
      const net = e.name === 'AbortError' || e instanceof TypeError;
      syncInfo = { state: 'err', at: syncInfo.at, msg: net ? 'Serveur injoignable, nouvel essai automatique' : e.message };
    } finally {
      syncing = false;
      paintSync();
      if (syncAgain) { syncAgain = false; scheduleSync(); }
    }
  }

  function syncHtml() {
    if (!sync.key) {
      return `
      <section class="card">
        <h3 class="s-title" style="margin-top:0">Synchronisation entre appareils</h3>
        <p class="hint">Partagez les mêmes points sur plusieurs téléphones. Les données sont enregistrées sur votre propre serveur Cloudflare et protégées par une clé secrète.</p>
        ${DEFAULT_SYNC_URL ? '' : '<label class="field">Adresse du serveur<input id="sync-url" class="in" type="url" placeholder="https://….workers.dev" autocomplete="off"></label>'}
        <div class="row-actions" style="margin-top:10px"><button class="btn" data-action="sync-enable">Activer sur cet appareil</button></div>
        <h3 class="s-title">Rejoindre un groupe existant</h3>
        <p class="hint">Sur le premier appareil, copiez le lien ou le code d’appairage, puis collez-le ici.</p>
        <div class="row-actions"><input id="sync-code" class="in grow" type="text" placeholder="Lien ou code d’appairage" autocomplete="off"><button class="btn ghost" data-action="sync-join">Rejoindre</button></div>
      </section>`;
    }
    return `
      <section class="card">
        <div class="card-head"><h3 class="s-title" style="margin:0">Synchronisation</h3><span id="sync-chip" class="chip">${esc(syncLabel())}</span></div>
        <div class="row-actions" style="margin-top:12px">
          <button class="btn" data-action="sync-now">Synchroniser maintenant</button>
          <button class="btn ghost" data-action="sync-copy">Copier le lien d’appairage</button>
        </div>
        <label class="field" style="margin-top:12px">Code d’appairage (secret : ne le partagez qu’avec l’autre parent)
          <input class="in mono" type="text" readonly data-select value="${esc(pairingCode())}"></label>
        <p class="hint">Pour ajouter un téléphone : ouvrez le lien dessus, ou collez le code dans Réglages. Les modifications se synchronisent toutes seules.</p>
        <p><button class="btn danger" data-action="sync-leave">Quitter la synchronisation</button></p>
      </section>`;
  }

  /* Code parent */
  function lockInfo() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { fails: 0, until: 0 }; }
    catch (e) { return { fails: 0, until: 0 }; }
  }
  function setLock(o) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(o)); } catch (e) { /* ignoré */ } }
  const pinOk = v => hashPin(v) === (state.settings.pinHash || DEFAULT_PIN_HASH);

  function validateGoal(cid) {
    const c = getChild(cid);
    const g = c && activeGoal(c);
    if (!g || bank(c).balance < g.target) return null;
    g.done = true;
    g.doneDate = today();
    c.spent.push({ id: 's' + uid(), date: today(), name: g.name, emoji: g.emoji, cost: g.target });
    return c;
  }

  // Renvoie l'enfant à célébrer, le cas échéant.
  function handlePin(a, el) {
    const p = ui.pin;
    if (!p) return null;
    if (a === 'pin-cancel') { ui.pin = null; return null; }
    if (a === 'pin-del') { p.value = p.value.slice(0, -1); p.msg = ''; return null; }
    const lk = lockInfo();
    if (Date.now() < lk.until) { p.value = ''; p.msg = 'Trop d’essais, patientez un peu'; return null; }
    if (p.value.length >= 4) return null;
    p.value += el.dataset.k;
    p.msg = '';
    if (p.value.length < 4) return null;
    if (pinOk(p.value)) {
      setLock({ fails: 0, until: 0 });
      const n = p.next;
      ui.pin = null;
      if (n.type === 'settings') { ui.tab = 'settings'; ui.unlocked = true; return null; }
      if (n.type === 'validate') return validateGoal(n.child);
      return null;
    }
    const fails = (lk.fails || 0) + 1;
    if (fails >= 5) { setLock({ fails: 0, until: Date.now() + 60000 }); p.msg = 'Trop d’essais : patientez 1 minute'; }
    else { setLock({ fails, until: 0 }); p.msg = 'Code incorrect'; }
    p.value = '';
    p.shake = true;
    return null;
  }

  // Appui long sur ▶ (0,7 s) : le parent valide la tâche sans attendre le minuteur.
  let lp = null;
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('[data-action="timer-start"]');
    if (lp) clearTimeout(lp.timer);
    lp = null;
    if (!b) return;
    const key = b.dataset.task;
    lp = { fired: false, timer: setTimeout(() => {
      lp.fired = true;
      const c = curChild(), was = goalReached(c, ui.date);
      setV(ui.date, c.id, key, 1);
      save(); render();
      toast('✔ Validé sans minuteur');
      if (!was && goalReached(c, ui.date)) celebrate(c);
    }, 700) };
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, () => { if (lp) clearTimeout(lp.timer); }, true));
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.timer')) e.preventDefault(); });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    let celebrateFor = null;

    if (a.startsWith('pin-')) {
      const done = handlePin(a, el);
      save(); render();
      if (done) celebrate(done);
      return;
    }

    switch (a) {
      case 'tab': {
        const t = el.dataset.tab;
        if (t === 'settings' && !ui.unlocked) { ui.pin = { value: '', msg: '', next: { type: 'settings' } }; break; }
        ui.tab = t;
        if (t !== 'settings') ui.unlocked = false;
        break;
      }
      case 'validate-goal': ui.pin = { value: '', msg: '', next: { type: 'validate', child: el.dataset.child } }; break;
      case 'child': ui.childId = el.dataset.id; break;
      case 'day-shift': ui.date = fmt(addDays(parse(ui.date), Number(el.dataset.n))); break;
      case 'day-today': ui.date = today(); break;
      case 'week-shift': ui.weekRef = fmt(addDays(parse(ui.weekRef), 7 * Number(el.dataset.n))); break;
      case 'week-today': ui.weekRef = today(); break;
      case 'week-mode': ui.weekMode = ['evol', 'badges'].includes(el.dataset.mode) ? el.dataset.mode : 'bilan'; break;
      case 'card-open': ui.card = el.dataset.badge; ui.cardFlip = false; break;
      case 'card-close': ui.card = null; break;
      case 'card-flip': flipCard(); return;
      case 'card-gyro': toggleGyro(); return;
      case 'card-nav': {
        const c = curChild(), st = badgeStats(c);
        const list = BADGES.filter(b => st[b.id].cf.on);
        const i = list.findIndex(b => b.id === ui.card);
        if (i < 0) break;
        ui.card = list[(i + Number(el.dataset.n) + list.length) % list.length].id;
        ui.cardFlip = false;
        break;
      }
      case 'set-mode': ui.setMode = el.dataset.mode === 'badges' ? 'badges' : 'general'; break;
      case 'img-nobg': imgNoBg(el.dataset.child, el.dataset.badge, +el.dataset.lvl || 0); return;
      case 'img-bg': imgBg(el.dataset.child, el.dataset.badge, +el.dataset.lvl || 0); return;
      case 'img-lvl': ui.imgLvl = +el.dataset.lvl || 0; ui.openBadge = el.dataset.badge; break;
      case 'gif-del':
        if (confirm('Supprimer le GIF de ce badge ?')) gifDel(el.dataset.child, el.dataset.badge, +el.dataset.lvl || 0);
        return;
      case 'img-orig': imgOrig(el.dataset.child, el.dataset.badge, +el.dataset.lvl || 0); return;
      case 'img-del':
        if (confirm('Supprimer l’image de ce badge ? L’emoji reviendra.')) imgDel(el.dataset.child, el.dataset.badge, +el.dataset.lvl || 0);
        return;
      case 'badge-reset': {
        ui.openBadge = el.dataset.badge;
        const c = getChild(el.dataset.child);
        if (c && c.badges) delete c.badges[el.dataset.badge];
        break;
      }
      case 'evo-weeks': ui.evoWeeks = Number(el.dataset.n) || 0; break;
      case 'goto-day':
        ui.childId = el.dataset.child; ui.date = el.dataset.date; ui.tab = 'day'; ui.unlocked = false; break;

      case 'rate': {
        const c = curChild();
        const val = Number(el.dataset.v);
        const cur = getV(ui.date, c.id, el.dataset.task);
        const was = goalReached(c, ui.date);
        if (timers[tkey(ui.date, c.id, el.dataset.task)]) { delete timers[tkey(ui.date, c.id, el.dataset.task)]; saveTimers(); }
        setV(ui.date, c.id, el.dataset.task, cur === val ? 0 : val);
        if (!was && goalReached(c, ui.date)) celebrateFor = c;
        break;
      }
      case 'timer-start': {
        if (lp && lp.fired) { lp = null; return; }
        const c = curChild();
        const k = taskOfKey(c, el.dataset.task);
        if (!k || !(k.timer > 0)) return;
        timers[tkey(ui.date, c.id, el.dataset.task)] = { end: Date.now() + k.timer * 1000, dur: k.timer };
        saveTimers(); primeAudio(); keepAwake();
        break;
      }
      case 'timer-stop': {
        const c = curChild();
        delete timers[tkey(ui.date, c.id, el.dataset.task)];
        saveTimers();
        break;
      }
      case 'all-done': {
        const c = curChild();
        const was = goalReached(c, ui.date);
        c.tasks.forEach(k => taskKeys(k).forEach(key => { delete timers[tkey(ui.date, c.id, key)]; setV(ui.date, c.id, key, 1); }));
        saveTimers();
        if (!was && goalReached(c, ui.date)) celebrateFor = c;
        break;
      }
      case 'clear-day': {
        const c = curChild();
        if (!dayRated(c, ui.date) || !confirm(`Effacer la notation de ${c.name} pour ce jour ?`)) return;
        c.tasks.forEach(k => taskKeys(k).forEach(key => { delete timers[tkey(ui.date, c.id, key)]; setV(ui.date, c.id, key, 0); }));
        saveTimers();
        break;
      }

      case 'add-task': {
        const c = getChild(el.dataset.child);
        c.tasks.push({ id: 't' + uid(), label: 'Nouvelle tâche', ok: 1, ko: 0, slots: false, timer: 0 });
        break;
      }
      case 'del-task': {
        const c = getChild(el.dataset.child);
        const k = c.tasks.find(t => t.id === el.dataset.task);
        if (!k || !confirm(`Supprimer la tâche « ${k.label} » ?`)) return;
        c.tasks = c.tasks.filter(t => t.id !== k.id);
        break;
      }
      case 'add-tier': {
        const c = getChild(el.dataset.child);
        const top = c.tiers.reduce((m, t) => Math.max(m, t.min), 0);
        c.tiers.push({ name: 'Nouveau palier', emoji: '🎁', min: top + 5, reward: '' });
        break;
      }
      case 'del-tier': {
        const c = getChild(el.dataset.child);
        c.tiers.splice(Number(el.dataset.idx), 1);
        break;
      }
      case 'add-child': {
        const id = 'c' + uid();
        state.settings.children.push({
          id, name: 'Enfant', age: 8, emoji: '🙂', dailyGoal: 8,
          tasks: defaultTasks(), tiers: defaultTiers(30, 40, 48), goals: defaultGoals(), spent: []
        });
        break;
      }
      case 'del-child': {
        const c = getChild(el.dataset.child);
        if (!c || state.settings.children.length < 2) return;
        if (!confirm(`Supprimer ${c.name} et tout son historique ?`)) return;
        state.settings.children = state.settings.children.filter(x => x.id !== c.id);
        for (const ds of Object.keys(state.log)) {
          delete state.log[ds][c.id];
          if (!Object.keys(state.log[ds]).length) delete state.log[ds];
        }
        ui.childId = state.settings.children[0].id;
        break;
      }

      case 'add-goal': {
        const c = getChild(el.dataset.child);
        c.goals.push({ id: 'g' + uid(), name: 'Nouvel objectif', emoji: '🎁', target: 150, done: false });
        break;
      }
      case 'del-goal': {
        const c = getChild(el.dataset.child);
        const g = c.goals.find(x => x.id === el.dataset.goal);
        if (!g || !confirm(`Supprimer l’objectif « ${g.name} » ?`)) return;
        c.goals = c.goals.filter(x => x.id !== g.id);
        break;
      }
      case 'goal-up': {
        const c = getChild(el.dataset.child);
        const i = c.goals.findIndex(x => x.id === el.dataset.goal);
        let j = i - 1;
        while (j >= 0 && c.goals[j].done) j--;
        if (i > 0 && j >= 0) { const t = c.goals[i]; c.goals[i] = c.goals[j]; c.goals[j] = t; }
        break;
      }
      case 'set-pin': {
        const v = (document.getElementById('new-pin').value || '').trim();
        if (!/^\d{4}$/.test(v)) { toast('Le code doit avoir 4 chiffres'); return; }
        state.settings.pinHash = hashPin(v);
        save(); render(); toast('Code modifié ✔');
        return;
      }
      case 'sync-enable': {
        const urlEl = document.getElementById('sync-url');
        const url = ((urlEl && urlEl.value) || DEFAULT_SYNC_URL).trim().replace(/\/+$/, '');
        if (!okUrl(url)) { toast('Adresse du serveur invalide'); return; }
        const bytes = crypto.getRandomValues(new Uint8Array(24));
        sync = { url, key: b64u(String.fromCharCode(...bytes)) };
        saveSync(); runSync(); render(); toast('Synchronisation activée ✔');
        return;
      }
      case 'sync-join': {
        const cfg = parsePairing((document.getElementById('sync-code').value || '').trim());
        if (!cfg) { toast('Lien ou code d’appairage invalide'); return; }
        if (!confirm('Rejoindre la synchronisation ? Les données de cet appareil seront fusionnées avec celles du groupe.')) return;
        sync = cfg; saveSync(); runSync(); render(); toast('Appareil rejoint ✔');
        return;
      }
      case 'sync-now': runSync(); return;
      case 'sync-copy': {
        const link = pairingLink();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(() => toast('Lien copié ✔'), () => toast('Copie impossible : copiez le code ci-dessous'));
        } else toast('Copie impossible : copiez le code ci-dessous');
        return;
      }
      case 'sync-leave':
        if (!confirm('Quitter la synchronisation sur cet appareil ? Les données restent ici et sur le serveur.')) return;
        sync = {}; saveSync(); syncInfo = { state: 'off', at: 0, msg: '' };
        break;
      case 'export':
        download(`bons-points-${today()}.json`, JSON.stringify(state, null, 2));
        return;
      case 'import':
        document.getElementById('import-file').click();
        return;
      case 'reset':
        if (!confirm(sync.key ? 'Tout effacer, y compris sur les autres appareils synchronisés ? Cette action est définitive.' : 'Tout effacer (réglages et historique) ? Cette action est définitive.')) return;
        state = defaults();
        state.epoch = { id: 'e' + uid(), ts: Date.now() };
        ui.childId = state.settings.children[0].id;
        break;
      case 'install':
        if (installPrompt) { installPrompt.prompt(); installPrompt = null; }
        return;
      default: return;
    }

    save();
    render();
    if (celebrateFor) celebrate(celebrateFor);
  });

  // Édition des champs des réglages (pas de rendu pour ne pas perdre le focus)
  document.addEventListener('change', e => {
    const el = e.target;

    if (el.id === 'import-file') {
      const file = el.files && el.files[0];
      if (!file) return;
      if (sync.key && !confirm('Importer remplacera aussi les données des autres appareils synchronisés. Continuer ?')) { el.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const s = JSON.parse(reader.result);
          if (!isValid(s)) throw new Error('format');
          state = normalize(s);
          state.epoch = { id: 'e' + uid(), ts: Date.now() };
          state.ts = {};
          ui.childId = state.settings.children[0].id;
          save(); render(); toast('Sauvegarde importée ✔');
        } catch (err) { toast('Fichier invalide'); }
      };
      reader.readAsText(file);
      return;
    }

    if (el.dataset && el.dataset.gif) {
      const [gcid, gbid, glv] = el.dataset.gif.split('|');
      const f = el.files && el.files[0];
      el.value = '';
      if (f) gifPick(gcid, gbid, f, +glv || 0);
      return;
    }
    if (el.dataset && el.dataset.img) {
      const [icid, ibid, ilv] = el.dataset.img.split('|');
      const f = el.files && el.files[0];
      el.value = '';
      if (f) imgPick(icid, ibid, f, +ilv || 0);
      return;
    }

    const bind = el.dataset && el.dataset.bind;
    if (!bind) return;
    const p = bind.split('|');
    const num = max => Math.max(0, Math.min(max, parseInt(el.value, 10) || 0));

    if (p[0] === 'child') {
      const c = getChild(p[1]); if (!c) return;
      if (p[2] === 'name') c.name = el.value.trim() || c.name;
      else if (p[2] === 'emoji') c.emoji = el.value.trim() || '🙂';
      else if (p[2] === 'age') c.age = num(25);
      else if (p[2] === 'dailyGoal') c.dailyGoal = num(999);
    } else if (p[0] === 'task') {
      const c = getChild(p[1]); const k = c && c.tasks.find(t => t.id === p[2]); if (!k) return;
      if (p[3] === 'label') k.label = el.value.trim() || k.label;
      else if (p[3] === 'slots') k.slots = el.checked;
      else if (p[3] === 'timer') {
        const min = parseFloat(String(el.value).replace(',', '.')) || 0;
        k.timer = Math.round(Math.max(0, Math.min(60, min)) * 60);
      }
      else k[p[3]] = num(99);
    } else if (p[0] === 'tier') {
      const c = getChild(p[1]); const t = c && c.tiers[Number(p[2])]; if (!t) return;
      if (p[3] === 'min') t.min = num(999);
      else if (p[3] === 'emoji') t.emoji = el.value.trim() || '🎁';
      else t[p[3]] = el.value.trim();
    } else if (p[0] === 'goal') {
      const c = getChild(p[1]); const g = c && c.goals.find(x => x.id === p[2]); if (!g) return;
      if (p[3] === 'target') g.target = Math.max(1, num(9999));
      else if (p[3] === 'emoji') g.emoji = el.value.trim() || '🎁';
      else g.name = el.value.trim() || g.name;
    } else if (p[0] === 'badge') {
      const c = getChild(p[1]); const b = BADGES.find(x => x.id === p[2]); if (!c || !b) return;
      if (!c.badges || typeof c.badges !== 'object') c.badges = {};
      const o = c.badges[b.id] || (c.badges[b.id] = {});
      if (p[3] === 'on') o.on = el.checked;
      else if (p[3] === 'task') o.task = el.value;
      else if (/^l[0-6]$/.test(p[3])) {
        const lv = (Array.isArray(o.lv) && o.lv.length === 7 ? o.lv : b.lv).slice();
        lv[Number(p[3].slice(1))] = Math.max(1, Math.min(99999, parseInt(el.value, 10) || 1));
        for (let i = 1; i < 7; i++) if (lv[i] <= lv[i - 1]) lv[i] = lv[i - 1] + 1;
        o.lv = lv;
        document.querySelectorAll(`[data-bind^="badge|${c.id}|${b.id}|l"]`).forEach(inp => { inp.value = lv[Number(inp.dataset.bind.split('|')[3].slice(1))]; });
      }
    } else if (p[0] === 'day') {
      const i = Number(p[1]);
      const set = new Set(state.settings.countedDays);
      if (el.checked) set.add(i); else set.delete(i);
      state.settings.countedDays = [...set].sort((x, y) => x - y);
    }
    save();
  });

  setInterval(tick, 500);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    tick();
    if (Object.keys(timers).length) keepAwake();
  });
  tick();

  document.addEventListener('focusin', e => { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-select')) e.target.select(); });

  // Appairage par lien : ouvrir « …/#sync=CODE » rejoint le groupe.
  function joinFromLink() {
    const m = /#sync=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    const cfg = parsePairing(m[1]);
    if (!cfg) { setTimeout(() => toast('Lien d’appairage invalide'), 300); return; }
    if (confirm('Rejoindre la synchronisation ? Les données de cet appareil seront fusionnées avec celles du groupe.')) {
      sync = cfg; saveSync(); setTimeout(() => { toast('Appareil rejoint ✔'); runSync(); }, 300);
    }
  }
  joinFromLink();
  setTimeout(checkBadges, 0);
  loadImgs().then(any => { if (any && !tc.drag && !ui.pin) render(); });
  window.addEventListener('hashchange', joinFromLink); // lien ouvert alors que l'application tourne déjà

  document.addEventListener('visibilitychange', () => { if (!document.hidden) runSync(); });
  window.addEventListener('online', runSync);
  setInterval(() => { if (!document.hidden) runSync(); }, 45000);

  // Les Réglages se reverrouillent dès que l'application quitte l'écran.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (ui.unlocked || ui.pin)) {
      ui.unlocked = false; ui.pin = null;
      if (ui.tab === 'settings') ui.tab = 'day';
      render();
    }
  });

  render();
  if (sync.key) setTimeout(runSync, 400);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
