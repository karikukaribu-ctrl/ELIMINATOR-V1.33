const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const uid = () => Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
const nowISO = () => new Date().toISOString();

const STORAGE_KEY = "eliminator_v30_mobile";
const SEASONS = ["printemps", "ete", "automne", "hiver", "noirblanc"];
const MAIN_SCREENS = ["tasks", "inbox", "stats", "notes", "settings"];

const SUBLINES = [
  "Une quête après l’autre.",
  "Le chaos recule. Toi, tu avances.",
  "Le réel apprécie les tâches finies.",
  "Aujourd’hui, on nettoie la carte mentale.",
  "Une micro-victoire vaut mieux qu’un grand flou.",
  "Tu n’as pas besoin d’héroïsme. Juste d’un prochain geste."
];

const TIPS = [
  "Un seul étorion. Pas un opéra intérieur.",
  "Commence petit. Continue vrai.",
  "Une tâche réelle vaut mieux qu’un plan sublime.",
  "Fais simple. Le cerveau survivra.",
  "Un pas suffit pour casser l’inertie.",
  "Tu n’as pas besoin de motivation parfaite."
];

const CELEBRATIONS = [
  { title: "QUÊTE VALIDÉE", msg: "Une tâche est tombée. Le chaos apprécie modérément." },
  { title: "MISSION TERMINÉE", msg: "Le réel vient de perdre un petit territoire." },
  { title: "AVANCÉE CONFIRMÉE", msg: "Ce n’était peut-être pas spectaculaire. C’était utile. Donc supérieur." },
  { title: "BLOC ABATTU", msg: "Un obstacle de moins. Le sac mental pèse déjà un peu moins." }
];

const defaultState = {
  ui: {
    mode: "clair",
    season: "noirblanc",
    serious: false,
    focus: false,
    currentScreen: "tasks",
    tasksTab: "tasks",
    statsTab: "history"
  },
  settings: {
    fatigue: 2,
    motivation: 2,
    tipsChance: 0.18,
    celebrationChance: 0.30,
    listSort: "ordre",
    includedCats: []
  },
  inbox: {
    draft: "",
    keepEditableAfterImport: true,
    history: []
  },
  baseline: {
    totalTasks: 0,
    totalEtorions: 0
  },
  tasks: [],
  currentTaskId: null,
  currentTaskStart: null,
  undo: [],
  notes: {
    entries: [],
    text: "",
    reminders: ""
  },
  pomodoro: {
    workMin: 25,
    breakMin: 5,
    autoStart: "auto",
    phase: "work"
  },
  stats: {
    tasksCompleted: 0,
    etorionsDone: 0,
    celebrationsShown: 0,
    taskHistory: []
  }
};

let state = loadState();
let remainingMs = 0;
let pomoTimer = null;
let pomoRunning = false;
let taskTimerLoop = null;
let notesSaveTimer = null;
let statusTimer = null;
let celebrateTimer = null;
let subtitleLocked = "";

/* =========================
   STORAGE
========================= */

function safeClone(obj){
  if(typeof structuredClone === "function"){
    try{
      return structuredClone(obj);
    }catch(_){}
  }
  return JSON.parse(JSON.stringify(obj));
}

function deepAssign(target, source){
  for(const key in source){
    if(
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key]
    ){
      deepAssign(target[key], source[key]);
    }else{
      target[key] = source[key];
    }
  }
}

function migrateState(loaded){
  const merged = safeClone(defaultState);
  deepAssign(merged, loaded || {});

  if(!merged.ui || typeof merged.ui !== "object") merged.ui = safeClone(defaultState.ui);
  if(!merged.settings || typeof merged.settings !== "object") merged.settings = safeClone(defaultState.settings);
  if(!merged.inbox || typeof merged.inbox !== "object") merged.inbox = safeClone(defaultState.inbox);
  if(!merged.notes || typeof merged.notes !== "object") merged.notes = safeClone(defaultState.notes);
  if(!merged.pomodoro || typeof merged.pomodoro !== "object") merged.pomodoro = safeClone(defaultState.pomodoro);
  if(!merged.stats || typeof merged.stats !== "object") merged.stats = safeClone(defaultState.stats);

  if(typeof merged.inbox.draft !== "string") merged.inbox.draft = "";
  if(typeof merged.inbox.keepEditableAfterImport !== "boolean") merged.inbox.keepEditableAfterImport = true;
  if(!Array.isArray(merged.inbox.history)) merged.inbox.history = [];

  if(typeof merged.notes.text !== "string") merged.notes.text = "";
  if(typeof merged.notes.reminders !== "string") merged.notes.reminders = "";
  if(!Array.isArray(merged.notes.entries)) merged.notes.entries = [];

  if(!Array.isArray(merged.tasks)) merged.tasks = [];
  if(!Array.isArray(merged.undo)) merged.undo = [];
  if(!Array.isArray(merged.stats.taskHistory)) merged.stats.taskHistory = [];

  if(!MAIN_SCREENS.includes(merged.ui.currentScreen)) merged.ui.currentScreen = "tasks";
  if(!["tasks", "today", "done"].includes(merged.ui.tasksTab)) merged.ui.tasksTab = "tasks";
  if(!["history", "graph"].includes(merged.ui.statsTab)) merged.ui.statsTab = "history";
  if(!SEASONS.includes(merged.ui.season)) merged.ui.season = "noirblanc";

  merged.tasks.forEach(task => {
    if(!task.id) task.id = uid();
    if(!task.title && task.label) task.title = task.label;
    if(!task.label && task.title) task.label = task.title;
    if(!task.cat) task.cat = "Inbox";
    if(typeof task.etorionsTotal !== "number"){
      const base = typeof task.etorions === "number" ? task.etorions : 1;
      task.etorionsTotal = base;
    }
    if(typeof task.etorionsLeft !== "number") task.etorionsLeft = task.etorionsTotal;
    if(typeof task.initialEtorions !== "number") task.initialEtorions = task.etorionsTotal;
    if(typeof task.today !== "boolean") task.today = false;
    if(typeof task.pinned !== "boolean") task.pinned = false;
    if(typeof task.done !== "boolean") task.done = false;
    if(!task.createdAt) task.createdAt = nowISO();
    if(!("doneAt" in task)) task.doneAt = null;
  });

  return merged;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return safeClone(defaultState);
    return migrateState(JSON.parse(raw));
  }catch(_){
    return safeClone(defaultState);
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(_){}
}

/* =========================
   HELPERS
========================= */

function dayKey(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function pad2(n){
  return String(n).padStart(2, "0");
}

function fmtMMSS(ms){
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

function escapeHTML(text){
  return String(text || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#039;"
  }[c]));
}

function seasonLabel(season){
  const map = {
    printemps: "PRINTEMPS",
    ete: "ÉTÉ",
    automne: "AUTOMNE",
    hiver: "HIVER",
    noirblanc: "NOIR & BLANC"
  };
  return map[season] || "NOIR & BLANC";
}

function pickRandom(arr){
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : "";
}

function status(message, ms = 3500){
  const box = $("taskMetaDetails");
  if(!box) return;
  const original = box.innerHTML;
  box.hidden = false;
  box.innerHTML = `<span>${escapeHTML(message)}</span>`;
  if(statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    renderCurrentTaskMeta();
  }, ms);
}

function pushUndo(label){
  state.undo.unshift({
    label,
    at: Date.now(),
    payload: safeClone(state)
  });
  state.undo = state.undo.slice(0, 25);
  saveState();
}

function doUndo(){
  const snap = state.undo.shift();
  if(!snap){
    status("RIEN À ANNULER.");
    return;
  }
  state = migrateState(snap.payload);
  saveState();
  renderAll();
  status("RETOUR ARRIÈRE.");
}

/* =========================
   THEME
========================= */

function applyTheme(){
  document.body.classList.remove(
    "theme--printemps",
    "theme--ete",
    "theme--automne",
    "theme--hiver",
    "theme--noirblanc",
    "mode--clair",
    "mode--sombre",
    "is-focus",
    "is-serious"
  );

  document.body.classList.add(`theme--${state.ui.season}`);
  document.body.classList.add(`mode--${state.ui.mode}`);
  if(state.ui.focus) document.body.classList.add("is-focus");
  if(state.ui.serious) document.body.classList.add("is-serious");

  if($("modeToggle")){
    $("modeToggle").textContent = state.ui.mode === "sombre" ? "SOMBRE" : "CLAIR";
    $("modeToggle").setAttribute("aria-pressed", state.ui.mode === "sombre" ? "true" : "false");
  }

  if($("focusBtn")){
    $("focusBtn").textContent = state.ui.focus ? "FOCUS ON" : "FOCUS";
    $("focusBtn").setAttribute("aria-pressed", state.ui.focus ? "true" : "false");
  }

  if($("seriousToggle")){
    $("seriousToggle").textContent = state.ui.serious ? "SÉRIEUX ON" : "SÉRIEUX";
    $("seriousToggle").setAttribute("aria-pressed", state.ui.serious ? "true" : "false");
  }

  if($("seasonCycle")){
    $("seasonCycle").textContent = seasonLabel(state.ui.season);
  }
}

/* =========================
   SCREENS
========================= */

function screenTitleFor(screen){
  const map = {
    tasks: "EXERCICES",
    inbox: "INBOX",
    stats: "STATISTIQUES",
    notes: "NOTES",
    settings: "PARAMÈTRES"
  };
  return map[screen] || "ELIMINATOR";
}

function setScreen(screen){
  state.ui.currentScreen = MAIN_SCREENS.includes(screen) ? screen : "tasks";
  saveState();
  renderScreenNav();
}

function renderScreenNav(){
  $$(".screen-page").forEach(page => page.classList.remove("is-active"));
  $$(".bottom-nav__item").forEach(btn => btn.classList.remove("is-active"));

  const page = $(`screen-${state.ui.currentScreen}`);
  if(page) page.classList.add("is-active");

  const navBtn = document.querySelector(`.bottom-nav__item[data-screen="${state.ui.currentScreen}"]`);
  if(navBtn) navBtn.classList.add("is-active");

  if($("screenTitle")) $("screenTitle").textContent = screenTitleFor(state.ui.currentScreen);

  if($("headerBackBtn")){
    $("headerBackBtn").hidden = state.ui.currentScreen === "tasks";
  }

  if($("topTabs")){
    $("topTabs").hidden = state.ui.currentScreen !== "tasks";
  }
}

function setTasksTab(tab){
  if(!["tasks", "today", "done"].includes(tab)) tab = "tasks";
  state.ui.tasksTab = tab;
  saveState();
  renderTasksTopTabs();
  renderTaskList();
}

function renderTasksTopTabs(){
  $$(".top-tab").forEach(btn => btn.classList.remove("is-active"));
  const active = document.querySelector(`.top-tab[data-main-tab="${state.ui.tasksTab}"]`);
  if(active) active.classList.add("is-active");
}

function setStatsTab(tab){
  if(!["history", "graph"].includes(tab)) tab = "history";
  state.ui.statsTab = tab;
  saveState();

  $$(".subtab").forEach(btn => btn.classList.remove("is-active"));
  const activeBtn = document.querySelector(`.subtab[data-stats-tab="${tab}"]`);
  if(activeBtn) activeBtn.classList.add("is-active");

  $$(".stats-tab-page").forEach(page => page.classList.remove("is-active"));
  const activePage = $(`stats-${tab}-tab`);
  if(activePage) activePage.classList.add("is-active");
}

/* =========================
   TASK PARSING
========================= */

function isAllCapsLine(line){
  const t = String(line || "").trim();
  if(!t) return false;
  const hasLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t);
  if(!hasLetters) return false;
  return t === t.toUpperCase() && t.length <= 90;
}

function parseTaskLine(line){
  const raw = String(line || "").trim();
  if(!raw) return null;

  const cleaned = raw.replace(/^[-*•\s]+/, "").trim();
  if(!cleaned) return null;

  let title = cleaned;
  let etorions = null;

  const match = cleaned.match(/^(.*?)(?:\s*[-–—]\s*|\s+)(\d+)\s*$/);
  if(match){
    title = match[1].trim();
    etorions = parseInt(match[2], 10);
  }

  title = title.replace(/\s+/g, " ").trim();
  if(!title) return null;
  if(etorions !== null) etorions = clamp(etorions, 1, 99);

  return { title, etorions };
}

function estimateEtorions(label){
  const target = String(label || "").trim().toLowerCase();
  const matches = state.stats.taskHistory.filter(entry =>
    String(entry.label || "").trim().toLowerCase() === target
  );

  if(matches.length === 0) return 3;

  const avg = matches.reduce((sum, entry) => sum + (entry.etorionsUsed || 0), 0) / matches.length;
  return clamp(Math.round(avg) || 3, 1, 12);
}

/* =========================
   INBOX
========================= */

function saveInboxDraft(value){
  state.inbox.draft = String(value || "");
  saveState();
}

function archiveInboxList(text){
  const clean = String(text || "").trim();
  if(!clean) return;

  state.inbox.history.unshift({
    id: uid(),
    at: nowISO(),
    text: clean
  });

  state.inbox.history = state.inbox.history.slice(0, 120);
  saveState();
}

function restoreInboxHistoryItem(id){
  const item = state.inbox.history.find(entry => entry.id === id);
  if(!item) return;

  state.inbox.draft = item.text;
  if($("inboxText")) $("inboxText").value = item.text;
  saveState();
  renderInbox();
  status("LISTE RESTAURÉE.");
}

function deleteInboxHistoryItem(id){
  state.inbox.history = state.inbox.history.filter(entry => entry.id !== id);
  saveState();
  renderInbox();
}

function importFromInbox(text){
  const rawText = String(text || "");
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let cat = "Inbox";
  const imported = [];

  for(const line of lines){
    if(isAllCapsLine(line)){
      cat = line.trim();
      continue;
    }

    const parsed = parseTaskLine(line);
    if(!parsed) continue;

    const eto = parsed.etorions ?? estimateEtorions(parsed.title);

    imported.push({
      id: uid(),
      title: parsed.title,
      label: parsed.title,
      cat,
      etorionsTotal: eto,
      etorionsLeft: eto,
      initialEtorions: eto,
      pinned: false,
      today: false,
      done: false,
      createdAt: nowISO(),
      doneAt: null
    });
  }

  if(imported.length === 0) return 0;

  archiveInboxList(rawText);
  pushUndo("import");
  state.tasks.push(...imported);

  const totalTasks = imported.length;
  const totalEtorions = imported.reduce((sum, task) => sum + task.etorionsTotal, 0);

  if(state.baseline.totalTasks === 0 && state.baseline.totalEtorions === 0){
    state.baseline.totalTasks = totalTasks;
    state.baseline.totalEtorions = totalEtorions;
  }else{
    state.baseline.totalTasks += totalTasks;
    state.baseline.totalEtorions += totalEtorions;
  }

  ensureCurrentTask();
  saveState();
  return imported.length;
}

function renderInbox(){
  if($("inboxText")) $("inboxText").value = state.inbox.draft || "";

  if($("inboxEditableToggle")){
    $("inboxEditableToggle").textContent = state.inbox.keepEditableAfterImport ? "ÉDITION ON" : "ÉDITION OFF";
    $("inboxEditableToggle").setAttribute("aria-pressed", state.inbox.keepEditableAfterImport ? "true" : "false");
  }

  const root = $("inboxHistoryList");
  if(!root) return;

  const list = state.inbox.history || [];
  if(list.length === 0){
    root.innerHTML = `<div class="card"><div class="card__left"><div class="card__title">AUCUNE LISTE VALIDÉE</div><div class="card__sub">L’HISTORIQUE APPARAÎTRA ICI</div></div></div>`;
    return;
  }

  root.innerHTML = list.map(item => {
    const dt = new Date(item.at);
    const stamp = dt.toLocaleString("fr-BE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    const preview = item.text.split(/\r?\n/).filter(Boolean).slice(0, 2).join(" · ");

    return `
      <div class="card">
        <div class="card__left">
          <div class="card__title">${escapeHTML(preview || "LISTE VIDE")}</div>
          <div class="card__sub">${stamp}</div>
        </div>
        <div class="card__actions">
          <button class="task-icon-btn task-icon-btn--filled" data-inbox-open="${item.id}" title="Ouvrir">↺</button>
          <button class="task-icon-btn" data-inbox-del="${item.id}" title="Supprimer">✕</button>
        </div>
      </div>
    `;
  }).join("");

  root.querySelectorAll("[data-inbox-open]").forEach(btn => {
    btn.onclick = () => restoreInboxHistoryItem(btn.dataset.inboxOpen);
  });

  root.querySelectorAll("[data-inbox-del]").forEach(btn => {
    btn.onclick = () => deleteInboxHistoryItem(btn.dataset.inboxDel);
  });
}

/* =========================
   TASK ENGINE
========================= */

function activeTasks(){
  let base = state.tasks.filter(task => !task.done);
  const included = state.settings.includedCats;

  if(included && included.length > 0){
    base = base.filter(task => {
      if(included.includes("CE JOUR") && task.today) return true;
      return included.includes(task.cat);
    });
  }

  return base;
}

function doneTasks(){
  return state.tasks.filter(task => task.done);
}

function getTask(id){
  return state.tasks.find(task => task.id === id) || null;
}

function sortTasks(list){
  const mode = state.settings.listSort || "ordre";
  const todayScore = (task) => task.today ? -1 : 0;
  const pinScore = (task) => task.pinned ? -1 : 0;

  if(mode === "alpha"){
    return [...list].sort((a, b) => {
      const t = todayScore(a) - todayScore(b);
      if(t !== 0) return t;
      const p = pinScore(a) - pinScore(b);
      if(p !== 0) return p;
      return a.title.localeCompare(b.title, "fr");
    });
  }

  if(mode === "cat"){
    return [...list].sort((a, b) => {
      const t = todayScore(a) - todayScore(b);
      if(t !== 0) return t;
      const p = pinScore(a) - pinScore(b);
      if(p !== 0) return p;
      const c = a.cat.localeCompare(b.cat, "fr");
      return c !== 0 ? c : a.title.localeCompare(b.title, "fr");
    });
  }

  if(mode === "roulette"){
    return [...list].sort((a, b) => {
      const t = todayScore(a) - todayScore(b);
      if(t !== 0) return t;
      const p = pinScore(a) - pinScore(b);
      if(p !== 0) return p;
      return (a.etorionsLeft || a.etorionsTotal) - (b.etorionsLeft || b.etorionsTotal);
    });
  }

  return [...list].sort((a, b) => {
    const t = todayScore(a) - todayScore(b);
    if(t !== 0) return t;
    const p = pinScore(a) - pinScore(b);
    if(p !== 0) return p;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });
}

function ensureCurrentTask(){
  const current = getTask(state.currentTaskId);
  const actives = activeTasks();

  if(actives.length === 0){
    state.currentTaskId = null;
    state.currentTaskStart = null;
    return;
  }

  if(!current || current.done){
    const today = actives.find(task => task.today);
    const pinned = actives.find(task => task.pinned);
    state.currentTaskId = (today || pinned || actives[0]).id;
    state.currentTaskStart = Date.now();
  }
}

function computeProgress(){
  const baseTasks = state.baseline.totalTasks || 0;
  const baseEtorions = state.baseline.totalEtorions || 0;

  const remainingTasks = activeTasks();
  const remT = remainingTasks.length;
  const remE = remainingTasks.reduce((sum, task) => sum + (task.etorionsLeft || 0), 0);

  const pct = baseTasks <= 0 ? 100 : clamp(Math.round((remT / baseTasks) * 100), 0, 100);

  return { baseTasks, baseEtorions, remT, remE, pct };
}

function roulettePick(){
  const tasks = activeTasks();
  if(tasks.length === 0) return null;

  const today = tasks.filter(task => task.today);
  const pinned = tasks.filter(task => task.pinned);
  const pool = today.length ? today : (pinned.length ? pinned : tasks);

  const sorted = [...pool].sort((a, b) => (a.etorionsLeft || a.etorionsTotal) - (b.etorionsLeft || b.etorionsTotal));
  const sample = sorted.slice(0, Math.min(4, sorted.length));
  return sample[Math.floor(Math.random() * sample.length)];
}

function selectTask(id){
  const task = getTask(id);
  if(!task || task.done) return;
  state.currentTaskId = id;
  state.currentTaskStart = Date.now();
  saveState();
  renderAll();
}

function toggleTodayTask(id){
  const task = getTask(id);
  if(!task || task.done) return;
  task.today = !task.today;
  saveState();
  renderAll();
}

function togglePinnedTask(id){
  const task = getTask(id);
  if(!task || task.done) return;
  task.pinned = !task.pinned;
  saveState();
  renderAll();
}

function editTaskPrompt(id){
  const task = getTask(id);
  if(!task) return;

  const next = prompt("ÉDITER LA TÂCHE", task.title);
  if(next === null) return;

  const value = next.trim();
  if(!value) return;

  task.title = value;
  task.label = value;
  saveState();
  renderAll();
}

function deleteTask(id){
  const task = getTask(id);
  if(!task) return;

  pushUndo("delete");
  state.tasks = state.tasks.filter(t => t.id !== id);

  if(!task.done){
    state.baseline.totalTasks = Math.max(0, state.baseline.totalTasks - 1);
    state.baseline.totalEtorions = Math.max(0, state.baseline.totalEtorions - (task.etorionsTotal || 0));
  }

  if(state.currentTaskId === id){
    state.currentTaskId = null;
    state.currentTaskStart = null;
  }

  ensureCurrentTask();
  saveState();
  renderAll();
}

function completeTask(id = state.currentTaskId){
  const task = getTask(id);
  if(!task || task.done) return;

  pushUndo("complete");
  task.done = true;
  task.doneAt = nowISO();

  state.stats.tasksCompleted += 1;
  state.stats.taskHistory.push({
    label: task.title,
    etorionsUsed: task.initialEtorions || task.etorionsTotal || 1,
    date: task.doneAt
  });

  ensureCurrentTask();
  saveState();
  maybeShowCelebration();
  renderAll();
  status("TÂCHE TERMINÉE.");
}

function restoreTask(id){
  const task = getTask(id);
  if(!task || !task.done) return;

  pushUndo("restore");
  task.done = false;
  task.doneAt = null;
  ensureCurrentTask();
  saveState();
  renderAll();
}

function degommeEtorion(){
  const task = getTask(state.currentTaskId);
  if(!task || task.done){
    status("AUCUNE TÂCHE.");
    return;
  }

  pushUndo("degomme");
  task.etorionsLeft = clamp((task.etorionsLeft || 1) - 1, 0, 99);
  state.stats.etorionsDone += 1;

  if(task.etorionsLeft <= 0){
    completeTask(task.id);
    return;
  }

  saveState();
  maybeShowTip();
  renderAll();
  status("−1 ÉTORION.");
}

function currentTaskList(){
  if(state.ui.tasksTab === "today"){
    return sortTasks(activeTasks().filter(task => task.today));
  }
  if(state.ui.tasksTab === "done"){
    return sortTasks(doneTasks());
  }
  return sortTasks(activeTasks());
}

/* =========================
   HUB + TASK UI
========================= */

function renderSummary(){
  const p = computeProgress();
  if($("statActiveMain")) $("statActiveMain").textContent = String(activeTasks().length);
  if($("statDoneMain")) $("statDoneMain").textContent = String(doneTasks().length);
  if($("statEtorionsMain")) $("statEtorionsMain").textContent = String(p.remE);

  if($("progressPctLabel")) $("progressPctLabel").textContent = `${p.pct}%`;
  if($("progressBar")) $("progressBar").setAttribute("aria-valuenow", String(p.pct));
  if($("progressFill")) $("progressFill").style.width = `${p.pct}%`;
}

function renderCurrentTaskMeta(){
  ensureCurrentTask();
  const task = getTask(state.currentTaskId);

  if(!task){
    if($("taskTitle")) $("taskTitle").textContent = "AUCUNE TÂCHE SÉLECTIONNÉE";
    if($("taskMetaDetails")){
      $("taskMetaDetails").hidden = false;
      $("taskMetaDetails").innerHTML = `Catégorie : <span id="metaCat">—</span> · Étorions : <span id="metaEt">—</span> · Temps : <span id="metaTimer">00:00</span>`;
    }
    return;
  }

  if($("taskTitle")) $("taskTitle").textContent = task.title.toUpperCase();

  if($("taskMetaDetails")){
    $("taskMetaDetails").hidden = false;
    $("taskMetaDetails").innerHTML = `
      Catégorie : <span id="metaCat">${escapeHTML(task.cat || "Inbox")}</span>
      · Étorions : <span id="metaEt">${task.etorionsLeft}/${task.etorionsTotal}</span>
      · Temps : <span id="metaTimer">${state.currentTaskStart ? fmtMMSS(Date.now() - state.currentTaskStart) : "00:00"}</span>
    `;
  }
}

function renderTaskTimerOnly(){
  const timerEl = $("metaTimer");
  const task = getTask(state.currentTaskId);
  if(!timerEl || !task || !state.currentTaskStart){
    if(timerEl) timerEl.textContent = "00:00";
    return;
  }
  timerEl.textContent = fmtMMSS(Date.now() - state.currentTaskStart);
}

function taskCardHTML(task){
  const isCurrent = task.id === state.currentTaskId;
  const title = `${task.today ? "◆ " : ""}${task.title}`.toUpperCase();
  const sub = `${task.cat} · ${task.etorionsLeft}/${task.etorionsTotal}${task.done ? " · FINIE" : ""}`;

  return `
    <div class="task-card" ${isCurrent ? `style="outline:3px solid var(--black);"` : ""}>
      <div class="task-card__left">
        <div class="task-card__title">${escapeHTML(title)}</div>
        <div class="task-card__sub">${escapeHTML(sub)}</div>
      </div>

      <div class="task-card__actions">
        ${task.done
          ? `<button class="task-icon-btn" data-task-act="restore" data-id="${task.id}" title="Restaurer">↺</button>`
          : `<button class="task-icon-btn ${isCurrent ? "task-icon-btn--filled" : ""}" data-task-act="select" data-id="${task.id}" title="Sélectionner">${isCurrent ? "●" : "▶"}</button>`
        }
        ${task.done
          ? ``
          : `<button class="task-icon-btn ${task.today ? "task-icon-btn--filled" : ""}" data-task-act="today" data-id="${task.id}" title="Ce jour">◆</button>`
        }
        ${task.done
          ? ``
          : `<button class="task-icon-btn ${task.pinned ? "task-icon-btn--filled" : ""}" data-task-act="pin" data-id="${task.id}" title="Favori">★</button>`
        }
        ${task.done
          ? ``
          : `<button class="task-icon-btn task-icon-btn--filled" data-task-act="done" data-id="${task.id}" title="Terminer">✓</button>`
        }
        <button class="task-icon-btn" data-task-act="stats" data-id="${task.id}" title="Stats">▥</button>
        <button class="task-icon-btn" data-task-act="edit" data-id="${task.id}" title="Éditer">≡</button>
        <button class="task-icon-btn" data-task-act="delete" data-id="${task.id}" title="Supprimer">✕</button>
      </div>
    </div>
  `;
}

function bindTaskListActions(root){
  root.querySelectorAll("[data-task-act]").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const act = btn.dataset.taskAct;

      if(act === "select") selectTask(id);
      if(act === "today") toggleTodayTask(id);
      if(act === "pin") togglePinnedTask(id);
      if(act === "done") completeTask(id);
      if(act === "restore") restoreTask(id);
      if(act === "edit") editTaskPrompt(id);
      if(act === "delete") deleteTask(id);
      if(act === "stats"){
        setScreen("stats");
        setStatsTab("history");
      }
    };
  });
}

function renderTaskList(){
  const root = $("taskList");
  if(!root) return;

  const list = currentTaskList();
  if(list.length === 0){
    root.innerHTML = `<div class="card"><div class="card__left"><div class="card__title">AUCUNE TÂCHE</div><div class="card__sub">RIEN À AFFICHER DANS CETTE VUE</div></div></div>`;
    return;
  }

  root.innerHTML = list.map(taskCardHTML).join("");
  bindTaskListActions(root);
}

/* =========================
   NOTES
========================= */

function addNoteEntry(text){
  const value = String(text || "").trim();
  if(!value) return;

  state.notes.entries.unshift({
    id: uid(),
    text: value,
    at: nowISO()
  });

  state.notes.entries = state.notes.entries.slice(0, 120);
  saveState();
}

function scheduleNotesSave(){
  if(notesSaveTimer) clearTimeout(notesSaveTimer);

  notesSaveTimer = setTimeout(() => {
    if($("notesArea")) state.notes.text = $("notesArea").value;
    if($("remindersArea")) state.notes.reminders = $("remindersArea").value;
    saveState();
  }, 250);
}

function renderNotes(){
  if($("notesArea")) $("notesArea").value = state.notes.text || "";
  if($("remindersArea")) $("remindersArea").value = state.notes.reminders || "";

  const root = $("notesEntriesList");
  if(!root) return;

  const entries = state.notes.entries || [];
  if(entries.length === 0){
    root.innerHTML = `<div class="card"><div class="card__left"><div class="card__title">AUCUNE ENTRÉE</div><div class="card__sub">LES NOTES HORODATÉES APPARAÎTRONT ICI</div></div></div>`;
    return;
  }

  root.innerHTML = entries.slice(0, 20).map(entry => {
    const dt = new Date(entry.at);
    const stamp = dt.toLocaleString("fr-BE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    return `
      <div class="card">
        <div class="card__left">
          <div class="card__title">${escapeHTML(entry.text)}</div>
          <div class="card__sub">${stamp}</div>
        </div>
      </div>
    `;
  }).join("");
}

/* =========================
   STATS
========================= */

function recentHistoryRows(limit = 20){
  return state.stats.taskHistory
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limit);
}

function renderHistoryContent(){
  const root = $("historyContent");
  if(!root) return;

  const rows = recentHistoryRows(20);
  if(rows.length === 0){
    root.innerHTML = `<div class="card"><div class="card__left"><div class="card__title">AUCUN HISTORIQUE</div><div class="card__sub">TERMINE QUELQUES TÂCHES POUR ALIMENTER CETTE ZONE</div></div></div>`;
    return;
  }

  root.innerHTML = rows.map(row => {
    const dt = new Date(row.date);
    const stamp = dt.toLocaleString("fr-BE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    return `
      <div class="card">
        <div class="card__left">
          <div class="card__title">${escapeHTML(String(row.label || "").toUpperCase())}</div>
          <div class="card__sub">${stamp} · ${row.etorionsUsed || 0} ÉTORION(S)</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderGraphContent(){
  const root = $("statsContent");
  if(!root) return;

  const completed = state.stats.tasksCompleted || 0;
  const eto = state.stats.etorionsDone || 0;
  const cele = state.stats.celebrationsShown || 0;
  const remaining = activeTasks().length;
  const total = state.baseline.totalTasks || 0;

  root.innerHTML = `
    <div class="settings-stack">
      <article class="setting-card">
        <div class="setting-card__title">VUE D’ENSEMBLE</div>
        <div class="setting-card__desc">STATISTIQUES ACTUELLES</div>
        <div class="summary-strip">
          <div class="summary-box">
            <div class="summary-box__label">FINIES</div>
            <div class="summary-box__value">${completed}</div>
          </div>
          <div class="summary-box">
            <div class="summary-box__label">ÉTORIONS</div>
            <div class="summary-box__value">${eto}</div>
          </div>
          <div class="summary-box">
            <div class="summary-box__label">RESTANTES</div>
            <div class="summary-box__value">${remaining}</div>
          </div>
        </div>
      </article>

      <article class="setting-card">
        <div class="setting-card__title">RATIO</div>
        <div class="setting-card__desc">${remaining}/${total} TÂCHES RESTANTES · ${cele} CÉLÉBRATION(S)</div>
        <div class="mono-progress" aria-hidden="true">
          <div class="mono-progress__fill" style="width:${computeProgress().pct}%"></div>
        </div>
      </article>
    </div>
  `;
}

function renderStats(){
  renderHistoryContent();
  renderGraphContent();
  setStatsTab(state.ui.statsTab);
}

/* =========================
   TIPS / CELEBRATIONS
========================= */

function maybeShowTip(force = false){
  if(!force && Math.random() > state.settings.tipsChance) return;
  status(pickRandom(TIPS), 5000);
}

function ensureCelebrationShell(){
  let shell = $("celebrateShell");
  if(shell) return shell;

  shell = document.createElement("div");
  shell.id = "celebrateShell";
  shell.setAttribute("hidden", "");
  shell.style.position = "fixed";
  shell.style.inset = "0";
  shell.style.zIndex = "999";
  shell.style.display = "grid";
  shell.style.placeItems = "center";
  shell.style.background = "rgba(0,0,0,.10)";
  shell.innerHTML = `
    <div style="
      width:min(92vw,520px);
      background:var(--bg);
      border:3px solid var(--line);
      padding:22px 18px;
      text-align:center;
      box-shadow:none;
    ">
      <div id="celebrateTitle" style="font-size:1.4rem;font-weight:900;text-transform:uppercase;margin-bottom:10px;"></div>
      <div id="celebrateMsg" style="font-size:1rem;font-weight:700;line-height:1.35;"></div>
    </div>
  `;
  document.body.appendChild(shell);
  return shell;
}

function maybeShowCelebration(force = false){
  if(!force && Math.random() > state.settings.celebrationChance) return;

  const card = pickRandom(CELEBRATIONS);
  if(!card) return;

  const shell = ensureCelebrationShell();
  const title = $("celebrateTitle");
  const msg = $("celebrateMsg");

  if(title) title.textContent = card.title;
  if(msg) msg.textContent = card.msg;

  shell.removeAttribute("hidden");
  state.stats.celebrationsShown += 1;
  saveState();

  if(celebrateTimer) clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => {
    shell.setAttribute("hidden", "");
  }, 2400);
}

/* =========================
   POMODORO
========================= */

function currentPhaseMinutes(){
  return state.pomodoro.phase === "break" ? state.pomodoro.breakMin : state.pomodoro.workMin;
}

function resetPhase(){
  remainingMs = clamp(currentPhaseMinutes(), 1, 120) * 60 * 1000;
  renderPomodoro();
}

function renderPomodoro(){
  if($("pomoTime")){
    $("pomoTime").textContent = fmtMMSS(remainingMs);
  }
}

function pausePomo(){
  pomoRunning = false;
  if(pomoTimer) clearInterval(pomoTimer);
  pomoTimer = null;
  renderPomodoro();
}

function playPomo(){
  if(pomoRunning) return;
  if(!remainingMs) resetPhase();

  pomoRunning = true;
  renderPomodoro();

  pomoTimer = setInterval(() => {
    remainingMs -= 250;

    if(remainingMs <= 0){
      remainingMs = 0;
      pausePomo();

      state.pomodoro.phase = state.pomodoro.phase === "work" ? "break" : "work";
      saveState();

      status(state.pomodoro.phase === "work" ? "POMODORO PRÊT." : "PAUSE PRÊTE.");
      resetPhase();

      if(state.pomodoro.autoStart === "auto") playPomo();
      return;
    }

    renderPomodoro();
  }, 250);
}

function togglePomo(){
  if(pomoRunning) pausePomo();
  else playPomo();
}

/* =========================
   EXPORT
========================= */

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    status("COPIÉ.");
  }catch(_){
    status("COPIE IMPOSSIBLE.");
  }
}

function exportTodayText(){
  const lines = [];
  lines.push(`ELIMINATOR — ${dayKey()}`);
  lines.push("");
  lines.push(`TÂCHES FINIES : ${doneTasks().length}`);
  doneTasks().slice(0, 50).forEach(task => lines.push(`- ${task.title}`));
  lines.push("");
  lines.push(`TÂCHES RESTANTES : ${activeTasks().length}`);
  activeTasks().slice(0, 50).forEach(task => lines.push(`- ${task.title}`));
  return lines.join("\n");
}

/* =========================
   FILTERS
========================= */

function categories(){
  const set = new Set(state.tasks.map(task => task.cat || "Inbox"));
  const out = Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  out.unshift("CE JOUR");
  out.unshift("Toutes");
  return out;
}

function renderCatFilter(){
  const select = $("catFilter");
  if(!select) return;

  const selected = state.settings.includedCats || [];
  select.innerHTML = categories().map(cat => `
    <option value="${escapeHTML(cat)}" ${selected.includes(cat) ? "selected" : ""}>${escapeHTML(cat)}</option>
  `).join("");
}

function syncIncludedCatsFromSelect(){
  const sel = $("catFilter");
  if(!sel) return;
  const values = Array.from(sel.selectedOptions).map(o => o.value).filter(v => v !== "Toutes");
  state.settings.includedCats = values;
  saveState();
}

/* =========================
   MODALS
========================= */

function openModal(id){
  const el = $(id);
  if(el) el.removeAttribute("hidden");
}

function closeModal(id){
  const el = $(id);
  if(el) el.setAttribute("hidden", "");
}

function syncFilterUI(){
  renderCatFilter();
  if($("viewFilter")) $("viewFilter").value = state.ui.tasksTab === "today" ? "active" : (state.ui.tasksTab === "done" ? "done" : "active");
  if($("sortFilter")) $("sortFilter").value = state.settings.listSort || "ordre";
}

/* =========================
   RENDER
========================= */

function renderAll(){
  applyTheme();
  renderScreenNav();
  renderTasksTopTabs();
  renderSummary();
  renderCurrentTaskMeta();
  renderTaskList();
  renderInbox();
  renderNotes();
  renderStats();
  renderPomodoro();
  syncFilterUI();
}

/* =========================
   TIMER LOOP
========================= */

function startTaskTimerLoop(){
  if(taskTimerLoop) clearInterval(taskTimerLoop);
  taskTimerLoop = setInterval(() => {
    renderTaskTimerOnly();
  }, 500);
}

/* =========================
   EVENTS
========================= */

function bindMainNav(){
  $$(".bottom-nav__item").forEach(btn => {
    btn.addEventListener("click", () => {
      setScreen(btn.dataset.screen);
    });
  });

  $("headerSettingsBtn")?.addEventListener("click", () => setScreen("settings"));
  $("headerBackBtn")?.addEventListener("click", () => setScreen("tasks"));
  $("openInboxBtn")?.addEventListener("click", () => setScreen("inbox"));
  $("openStatsBtn")?.addEventListener("click", () => setScreen("stats"));
}

function bindTopTabs(){
  $$(".top-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      setTasksTab(btn.dataset.mainTab);
    });
  });

  $$(".subtab").forEach(btn => {
    btn.addEventListener("click", () => {
      setStatsTab(btn.dataset.statsTab);
    });
  });
}

function bindCoreActions(){
  $("undoBtn")?.addEventListener("click", doUndo);

  $("rouletteBtn")?.addEventListener("click", () => {
    const pick = roulettePick();
    if(!pick){
      status("RIEN À TIRER.");
      return;
    }
    selectTask(pick.id);
    maybeShowTip();
  });

  $("bombBtn")?.addEventListener("click", degommeEtorion);
  $("doneTaskBtn")?.addEventListener("click", () => completeTask());
  $("editTaskBtn")?.addEventListener("click", () => editTaskPrompt(state.currentTaskId));

  $("taskInfoBtn")?.addEventListener("click", () => {
    const meta = $("taskMetaDetails");
    if(meta) meta.hidden = !meta.hidden;
  });

  $("sortCycleBtn")?.addEventListener("click", () => {
    const modes = ["ordre", "alpha", "cat", "roulette"];
    const idx = modes.indexOf(state.settings.listSort || "ordre");
    state.settings.listSort = modes[(idx + 1) % modes.length];
    saveState();
    renderTaskList();
    status(`TRI : ${(state.settings.listSort || "").toUpperCase()}`);
  });

  $("filterBtn")?.addEventListener("click", () => openModal("filterModal"));
  $("filterCloseBtn")?.addEventListener("click", () => closeModal("filterModal"));
  $("filterModal")?.addEventListener("mousedown", (e) => {
    if(e.target === $("filterModal")) closeModal("filterModal");
  });
}

function bindInboxActions(){
  $("inboxText")?.addEventListener("input", (e) => {
    saveInboxDraft(e.target.value);
  });

  $("inboxEditableToggle")?.addEventListener("click", () => {
    state.inbox.keepEditableAfterImport = !state.inbox.keepEditableAfterImport;
    saveState();
    renderInbox();
  });

  $("inboxAdd")?.addEventListener("click", () => {
    const text = $("inboxText")?.value || "";
    const count = importFromInbox(text);

    if(count > 0){
      addNoteEntry(`Import de ${count} tâche(s).`);

      if(!state.inbox.keepEditableAfterImport){
        state.inbox.draft = "";
        if($("inboxText")) $("inboxText").value = "";
      }else{
        state.inbox.draft = text;
      }

      saveState();
      ensureCurrentTask();
      renderAll();
      status(`${count} TÂCHE(S) IMPORTÉE(S).`);
      setScreen("tasks");
    }else{
      status("RIEN IMPORTÉ.");
    }
  });

  $("inboxClear")?.addEventListener("click", () => {
    state.inbox.draft = "";
    if($("inboxText")) $("inboxText").value = "";
    saveState();
    renderInbox();
    status("INBOX EFFACÉE.");
  });
}

function bindSettingsActions(){
  $("modeToggle")?.addEventListener("click", () => {
    state.ui.mode = state.ui.mode === "sombre" ? "clair" : "sombre";
    saveState();
    applyTheme();
  });

  $("focusBtn")?.addEventListener("click", () => {
    state.ui.focus = !state.ui.focus;
    saveState();
    applyTheme();
  });

  $("seriousToggle")?.addEventListener("click", () => {
    state.ui.serious = !state.ui.serious;
    saveState();
    applyTheme();
  });

  $("seasonCycle")?.addEventListener("click", () => {
    const idx = SEASONS.indexOf(state.ui.season);
    state.ui.season = SEASONS[(idx + 1) % SEASONS.length];
    saveState();
    applyTheme();
  });

  $("saveFlowBtn")?.addEventListener("click", () => {
    state.settings.fatigue = clamp(parseInt($("fatigueInline")?.value, 10) || state.settings.fatigue, 0, 4);
    state.settings.motivation = clamp(parseInt($("motivationInline")?.value, 10) || state.settings.motivation, 0, 4);
    saveState();
    status("FLOW SAUVÉ.");
  });

  $("testTipBtn")?.addEventListener("click", () => maybeShowTip(true));
  $("testCeleBtn")?.addEventListener("click", () => maybeShowCelebration(true));

  $("exportBtn")?.addEventListener("click", () => copyText(JSON.stringify(state, null, 2)));
  $("reportBtn")?.addEventListener("click", () => copyText(exportTodayText()));
  $("wipeBtn")?.addEventListener("click", () => {
    pushUndo("reset");
    state.tasks = [];
    state.baseline = { totalTasks: 0, totalEtorions: 0 };
    state.currentTaskId = null;
    state.currentTaskStart = null;
    state.stats.tasksCompleted = 0;
    state.stats.etorionsDone = 0;
    saveState();
    renderAll();
    status("RESET TOTAL.");
  });
}

function bindNotesActions(){
  $("notesArea")?.addEventListener("input", scheduleNotesSave);
  $("remindersArea")?.addEventListener("input", scheduleNotesSave);
}

function bindPomodoroActions(){
  $("pomoTime")?.addEventListener("click", togglePomo);

  $("pomoMinusBtn")?.addEventListener("click", () => {
    state.pomodoro.workMin = clamp((state.pomodoro.workMin || 25) - 1, 5, 90);
    saveState();
    resetPhase();
  });

  $("pomoPlusBtn")?.addEventListener("click", () => {
    state.pomodoro.workMin = clamp((state.pomodoro.workMin || 25) + 1, 5, 90);
    saveState();
    resetPhase();
  });

  $("pomoEdit")?.addEventListener("click", () => {
    if($("pomoMinutes")) $("pomoMinutes").value = state.pomodoro.workMin;
    if($("breakMinutes")) $("breakMinutes").value = state.pomodoro.breakMin;
    if($("autoStartSel")) $("autoStartSel").value = state.pomodoro.autoStart;
    openModal("pomoModal");
  });

  $("modalClose")?.addEventListener("click", () => closeModal("pomoModal"));
  $("pomoModal")?.addEventListener("mousedown", (e) => {
    if(e.target === $("pomoModal")) closeModal("pomoModal");
  });

  $("pomoApply")?.addEventListener("click", () => {
    state.pomodoro.workMin = clamp(parseInt($("pomoMinutes")?.value, 10) || 25, 5, 90);
    state.pomodoro.breakMin = clamp(parseInt($("breakMinutes")?.value, 10) || 5, 1, 30);
    state.pomodoro.autoStart = $("autoStartSel")?.value || "auto";
    saveState();
    resetPhase();
    closeModal("pomoModal");
  });

  $("pomoReset")?.addEventListener("click", () => {
    pausePomo();
    resetPhase();
  });

  $("pomoResetModal")?.addEventListener("click", () => {
    pausePomo();
    resetPhase();
  });
}

function bindFilterActions(){
  $("catFilter")?.addEventListener("change", () => {
    syncIncludedCatsFromSelect();
    renderTaskList();
  });

  $("viewFilter")?.addEventListener("change", () => {
    const value = $("viewFilter")?.value || "active";
    if(value === "done") setTasksTab("done");
    else setTasksTab("tasks");
  });

  $("sortFilter")?.addEventListener("change", () => {
    state.settings.listSort = $("sortFilter")?.value || "ordre";
    saveState();
    renderTaskList();
  });
}

/* =========================
   INIT
========================= */

function init(){
  subtitleLocked = pickRandom(SUBLINES);

  ensureCurrentTask();
  applyTheme();
  bindMainNav();
  bindTopTabs();
  bindCoreActions();
  bindInboxActions();
  bindSettingsActions();
  bindNotesActions();
  bindPomodoroActions();
  bindFilterActions();

  if($("fatigueInline")) $("fatigueInline").value = state.settings.fatigue;
  if($("motivationInline")) $("motivationInline").value = state.settings.motivation;

  renderAll();
  resetPhase();
  startTaskTimerLoop();
}

document.addEventListener("DOMContentLoaded", init);
