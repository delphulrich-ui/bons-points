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
  }

  const ui = { tab: 'day', childId: state.settings.children[0].id, date: today(), weekRef: today(), unlocked: false, pin: null };

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

  function dayPoints(c, ds) {
    let t = 0;
    for (const k of c.tasks) {
      const v = getV(ds, c.id, k.id);
      if (v === 1) t += k.ok; else if (v === -1) t -= k.ko;
    }
    return t;
  }
  const dayMax = c => c.tasks.reduce((s, k) => s + k.ok, 0);
  const dayRated = (c, ds) => c.tasks.some(k => getV(ds, c.id, k.id) !== 0);
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

    const rows = c.tasks.map(k => {
      const v = getV(ds, c.id, k.id);
      return `
      <li class="task">
        <div>
          <div class="task-name">${esc(k.label)}</div>
          <div class="task-pts">+${k.ok} si fait${k.ko ? ` · −${k.ko} sinon` : ''}</div>
        </div>
        <div class="seg">
          <button class="seg-btn ok ${v === 1 ? 'on' : ''}" data-action="rate" data-task="${k.id}" data-v="1"
            aria-pressed="${v === 1}" aria-label="Fait : ${esc(k.label)}">✔</button>
          <button class="seg-btn ko ${v === -1 ? 'on' : ''}" data-action="rate" data-task="${k.id}" data-v="-1"
            aria-pressed="${v === -1}" aria-label="Pas fait : ${esc(k.label)}">✖</button>
        </div>
      </li>`;
    }).join('');

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

    return `
      <section class="card">
        <div class="card-head">
          <h2>${esc(c.emoji)} ${esc(c.name)}</h2>
          <div class="total">${total} <small>pts</small></div>
        </div>
        <div class="week-days">${cells}</div>
        ${bar}
        ${verdict}
      </section>`;
  }

  function weekView() {
    const mon = monday(parse(ui.weekRef));
    const sun = addDays(mon, 6);
    const cs = state.settings.countedDays;
    const lastCounted = cs.length ? Math.max(...cs) : -1;
    const finished = lastCounted >= 0 && today() > fmt(addDays(mon, lastCounted));
    const isThisWeek = fmt(monday(new Date())) === fmt(mon);
    const label = `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;

    return `
      <header class="top"><h1>🏆 Bilan de la semaine</h1></header>
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
    const kids = state.settings.children.map(c => {
      const tasks = c.tasks.map(k => `
        <div class="s-task">
          <input class="in grow" type="text" value="${esc(k.label)}" data-bind="task|${c.id}|${k.id}|label" aria-label="Nom de la tâche">
          <label class="num"><span>+</span><input type="number" min="0" max="99" inputmode="numeric" value="${k.ok}" data-bind="task|${c.id}|${k.id}|ok" aria-label="Points si fait"></label>
          <label class="num"><span>−</span><input type="number" min="0" max="99" inputmode="numeric" value="${k.ko}" data-bind="task|${c.id}|${k.id}|ko" aria-label="Points retirés si pas fait"></label>
          <button class="icon-btn danger" data-action="del-task" data-child="${c.id}" data-task="${k.id}" aria-label="Supprimer la tâche">🗑</button>
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
    return `<nav class="nav"><div class="nav-inner">${item('day', '📅', 'Jour')}${item('week', '🏆', 'Semaine')}${item('cagnotte', '💰', 'Cagnotte')}${item('settings', ui.unlocked ? '⚙️' : '🔒', 'Réglages')}</div></nav>`;
  }

  function render() {
    const y = window.scrollY;
    if (ui.tab === 'settings' && !ui.unlocked) ui.tab = 'day';
    const view = ui.tab === 'week' ? weekView() : ui.tab === 'cagnotte' ? cagnotteView()
      : ui.tab === 'settings' ? settingsView() : dayView();
    document.getElementById('app').innerHTML = `<main class="view">${view}</main>${nav()}${pinOverlay()}`;
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
      case 'goto-day':
        ui.childId = el.dataset.child; ui.date = el.dataset.date; ui.tab = 'day'; ui.unlocked = false; break;

      case 'rate': {
        const c = curChild();
        const val = Number(el.dataset.v);
        const cur = getV(ui.date, c.id, el.dataset.task);
        const was = goalReached(c, ui.date);
        setV(ui.date, c.id, el.dataset.task, cur === val ? 0 : val);
        if (!was && goalReached(c, ui.date)) celebrateFor = c;
        break;
      }
      case 'all-done': {
        const c = curChild();
        const was = goalReached(c, ui.date);
        c.tasks.forEach(k => setV(ui.date, c.id, k.id, 1));
        if (!was && goalReached(c, ui.date)) celebrateFor = c;
        break;
      }
      case 'clear-day': {
        const c = curChild();
        if (!dayRated(c, ui.date) || !confirm(`Effacer la notation de ${c.name} pour ce jour ?`)) return;
        c.tasks.forEach(k => setV(ui.date, c.id, k.id, 0));
        break;
      }

      case 'add-task': {
        const c = getChild(el.dataset.child);
        c.tasks.push({ id: 't' + uid(), label: 'Nouvelle tâche', ok: 1, ko: 0 });
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
    } else if (p[0] === 'day') {
      const i = Number(p[1]);
      const set = new Set(state.settings.countedDays);
      if (el.checked) set.add(i); else set.delete(i);
      state.settings.countedDays = [...set].sort((x, y) => x - y);
    }
    save();
  });

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
