const SAVE_KEY = "overdeath-dungeon-prototype-v0";
const DIRS = [
  { name: "北", dx: 0, dy: -1 },
  { name: "東", dx: 1, dy: 0 },
  { name: "南", dx: 0, dy: 1 },
  { name: "西", dx: -1, dy: 0 },
];

// コの字チュートリアル。敵を避けられない一本道に近い形。
const baseMap = [
  "#####",
  "#S..#",
  "###E#",
  "#XP.#",
  "#####",
];

const story = [
  { face: "neutral", text: "……ここが、噂の洞窟か。\n思ったより静かだな。" },
  { face: "neutral", text: "村の人たちは、戻ってきた者が少ないと言っていた。\nでも、入口付近は普通の洞窟に見える。" },
  { face: "angry", text: "……なんだ？\n入口の方で、崩れるような音がする……？" },
  { face: "collapse", text: "ゴゴゴゴゴ……！\n振り返った道が、岩と土砂で塞がれていく。" },
  { face: "cry", text: "う、嘘だろ……。\n入口が……完全に塞がった……？" },
  { face: "neutral", text: "……落ち着け。\nここで止まっていても、何も変わらない。" },
  { face: "neutral", text: "先に進まないと……。\n生きて出るんだ。" },
];

const achievements = [
  { id: "clear", name: "初回踏破", check: s => s.cleared },
  { id: "noDeath", name: "不死踏破", check: s => s.cleared && s.deaths === 0 },
  { id: "theory", name: "理論値踏破", check: s => s.cleared && s.deaths === 0 && s.loads === 0 },
  { id: "overDeath", name: "死還者", check: s => s.cleared && s.deaths > 0 },
];

let storyIndex = 0;
let deathStepIndex = 0;
let deathReturning = false;
let deathSequence = [];
let state = makeNewState();
const $ = id => document.getElementById(id);

function makeNewState() {
  return {
    x: 1, y: 1, dir: 1,
    level: 1,
    baseMaxHp: 34,
    baseAttack: 5,
    maxHp: 34,
    hp: 34,
    attack: 5,
    deaths: 0,
    loads: 0,
    cleared: false,
    potionTaken: false,
    enemyDefeated: false,
    seenFirstDeath: false,
    tutorialEnemySeen: false,
    tutorialPotionSeen: false,
    tutorialDeathReturnSeen: false,
    unlocked: [],
  };
}

function normalizeState(input) {
  const fresh = makeNewState();
  const out = { ...fresh, ...(input || {}) };
  const nums = ["x", "y", "dir", "level", "baseMaxHp", "baseAttack", "maxHp", "hp", "attack", "deaths", "loads"];
  for (const key of nums) {
    if (!Number.isFinite(Number(out[key]))) out[key] = fresh[key];
    else out[key] = Number(out[key]);
  }
  out.dir = ((out.dir % 4) + 4) % 4;
  out.deaths = Math.max(0, Math.floor(out.deaths));
  out.loads = Math.max(0, Math.floor(out.loads));
  out.level = Math.max(1, Math.floor(out.level));
  out.maxHp = Math.max(1, Math.floor(out.maxHp));
  out.attack = Math.max(1, Math.floor(out.attack));
  out.hp = Math.max(0, Math.min(Math.floor(out.hp), out.maxHp));
  if (!Array.isArray(out.unlocked)) out.unlocked = [];
  return out;
}

function tileAt(x, y) {
  if (y < 0 || y >= baseMap.length || x < 0 || x >= baseMap[0].length) return "#";
  return baseMap[y][x];
}
function isSolid(x, y) { return tileAt(x, y) === "#"; }
function isDeathOverlayOpen() { return deathReturning; }
function show(screenId) {
  ["titleScreen", "storyScreen", "gameScreen"].forEach(id => $(id).classList.toggle("hidden", id !== screenId));
}
function setFace(face) {
  const targets = [$("storyVisual"), $("heroPortrait")];
  targets.forEach(el => {
    if (!el) return;
    el.className = el.className.replace(/\b(neutral|smile|angry|cry|collapse)\b/g, "").trim();
    el.classList.add("hero", face || "neutral");
  });
}
function showStoryLine() {
  const line = story[storyIndex];
  setFace(line.face);
  $("storyText").textContent = line.text;
}
function startStory() {
  storyIndex = 0;
  state = makeNewState();
  hideDeathOverlay();
  show("storyScreen");
  showStoryLine();
}
function nextStory() {
  storyIndex += 1;
  if (storyIndex >= story.length) {
    startGame("チュートリアル：前進で進み、左右で向きを変えます。\n閉じ込められた。先に進まないと……。", "neutral");
    return;
  }
  showStoryLine();
}
function startGame(message, face = "neutral") {
  state = normalizeState(state);
  hideDeathOverlay();
  show("gameScreen");
  setMessage(message, face);
  render();
  save(false);
}
function setMessage(message, face = "neutral") {
  $("messageText").textContent = message;
  setFace(face);
}

function turn(delta) {
  if (state.cleared || isDeathOverlayOpen()) return;
  state.dir = (state.dir + delta + 4) % 4;
  render();
  if (maybeShowLookTutorial()) return;
  setMessage(`${DIRS[state.dir].name}を向いた。`, "neutral");
}
function forward() {
  if (state.cleared || isDeathOverlayOpen()) return;
  const d = DIRS[state.dir];
  const nx = state.x + d.dx;
  const ny = state.y + d.dy;
  const tile = tileAt(nx, ny);
  if (tile === "#") {
    setMessage("岩壁だ。ここは進めない。\n壁の形を見て、通れる方向を探そう。", "neutral");
    render();
    return;
  }
  if (tile === "E" && !state.enemyDefeated) {
    state.tutorialEnemySeen = true;
    fightEnemy();
    return;
  }
  state.x = nx;
  state.y = ny;
  if (tile === "P" && !state.potionTaken) {
    state.potionTaken = true;
    state.hp = Math.min(state.maxHp, state.hp + 18);
    setMessage("回復薬です。体力が回復しました。", "smile");
  } else if (tile === "X") {
    clearGame();
  } else {
    render();
    if (!maybeShowLookTutorial()) setMessage("湿った通路を進む。", "neutral");
    save(false);
    return;
  }
  render();
  save(false);
}
function maybeShowLookTutorial() {
  const front1 = forwardCell(1);
  const front2 = forwardCell(2);
  const t1 = tileAt(front1.x, front1.y);
  const t2 = tileAt(front2.x, front2.y);
  if (!state.enemyDefeated && (t1 === "E" || t2 === "E") && !state.tutorialEnemySeen) {
    state.tutorialEnemySeen = true;
    setMessage("敵と遭遇しました。戦いましょう。", "angry");
    save(false);
    return true;
  }
  if (!state.potionTaken && (t1 === "P" || t2 === "P") && !state.tutorialPotionSeen) {
    state.tutorialPotionSeen = true;
    setMessage("アイテムがあります。近づいて使用しましょう。", "smile");
    save(false);
    return true;
  }
  return false;
}
function fightEnemy() {
  const enemyHp = 12;
  if (state.attack < enemyHp) {
    setMessage("敵と遭遇しました。戦いましょう。\nしかし、今の攻撃力では押し負けてしまった……。", "angry");
    beginDeathReturn(50);
    return;
  }
  state.hp = Math.max(1, state.hp - 8);
  state.enemyDefeated = true;
  state.level += 1;
  state.attack += 2;
  state.maxHp += 4;
  state.hp = Math.min(state.maxHp, state.hp + 4);
  setMessage("敵を倒しました。レベルがあがりました。\n攻撃力と最大HPも少し上がりました。", "smile");
  render();
  save(false);
}

function beginDeathReturn(damage = 50) {
  if (deathReturning) return;

  state.hp = 0;
  render();

  state.deaths += 1;
  state.maxHp = state.baseMaxHp + 20 * state.deaths;
  state.attack = state.baseAttack + 10 * state.deaths;
  state.hp = state.maxHp;
  state.x = 1;
  state.y = 1;
  state.dir = 1;
  state.potionTaken = false;
  state.enemyDefeated = false;
  state.tutorialDeathReturnSeen = true;
  state.seenFirstDeath = true;
  save(false);

  deathSequence = [
    `${damage}のダメージを受けた。\n死んでしまった……`,
    "ここは、、、？",
    "体力がもどっている。\n攻撃力と体力の上限値が上がっている、、、？\nこれは一体、、、",
    "死に戻りすると能力があがりますが、進捗が初めからになります",
  ];
  deathStepIndex = 0;
  deathReturning = true;
  setFace("cry");
  showDeathStep();
}
function ensureDeathOverlay() {
  let overlay = $("deathOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("section");
  overlay.id = "deathOverlay";
  overlay.className = "death-overlay";
  overlay.innerHTML = `<div class="death-box"><p id="deathOverlayText"></p><button id="deathNextButton" class="primary-button">タップして進む</button></div>`;
  document.body.appendChild(overlay);
  return overlay;
}
function showDeathStep() {
  const overlay = ensureDeathOverlay();
  const textEl = $("deathOverlayText");
  const button = $("deathNextButton");
  if (!overlay || !textEl || !button) {
    finishDeathReturn();
    return;
  }
  textEl.textContent = deathSequence[deathStepIndex] || "死に戻りした。";
  button.textContent = deathStepIndex >= deathSequence.length - 1 ? "探索に戻る" : "タップして進む";
  button.onclick = advanceDeathStep;
  overlay.classList.remove("hidden");
}
function advanceDeathStep() {
  if (!deathReturning) return;
  deathStepIndex += 1;
  if (deathStepIndex >= deathSequence.length) {
    finishDeathReturn();
    return;
  }
  showDeathStep();
}
function finishDeathReturn() {
  hideDeathOverlay();
  setMessage("死に戻り地点に戻された。\nもう一度、敵に挑もう。", "cry");
  render();
  save(false);
}
function hideDeathOverlay() {
  deathReturning = false;
  deathSequence = [];
  deathStepIndex = 0;
  const overlay = $("deathOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function clearGame() {
  state.cleared = true;
  const newly = unlockAchievements();
  const suffix = newly.length ? `\n\n実績解除：${newly.join("、")}` : "";
  setMessage(`外へ続く風を見つけた。\nチュートリアル踏破！${suffix}`, state.deaths === 0 ? "smile" : "neutral");
  save(false);
}
function unlockAchievements() {
  const newly = [];
  for (const a of achievements) {
    if (!state.unlocked.includes(a.id) && a.check(state)) {
      state.unlocked.push(a.id);
      newly.push(a.name);
    }
  }
  return newly;
}
function save(showMessage = true) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (showMessage) setMessage("現在の状態を保存した。", "smile");
}
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    show("titleScreen");
    alert("まだセーブデータがない。");
    return false;
  }
  try { state = normalizeState(JSON.parse(raw)); }
  catch { state = makeNewState(); }
  state.loads += 1;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  startGame("記憶をたどって再開した。\n読込回数が記録された。", "neutral");
  return true;
}
function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  state = makeNewState();
  storyIndex = 0;
  hideDeathOverlay();
  show("titleScreen");
}

function render() {
  state = normalizeState(state);
  $("hpText").textContent = `${Math.max(0, state.hp)}/${state.maxHp}`;
  $("attackText").textContent = state.attack;
  $("levelText").textContent = state.level;
  $("deathText").textContent = state.deaths;
  $("loadText").textContent = state.loads;
  $("hpBar").style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;
  drawDungeonView();
  drawMiniMap();
  updateViewSprite();
}
function basis() {
  const f = DIRS[state.dir];
  // 画面上の「左」。東向きなら北、南向きなら東を指す。
  return { f, l: { dx: f.dy, dy: -f.dx } };
}
function viewCell(depth, side) {
  const b = basis();
  return { x: state.x + b.f.dx * depth + b.l.dx * side, y: state.y + b.f.dy * depth + b.l.dy * side };
}
function forwardCell(depth) { return viewCell(depth, 0); }

function drawDungeonView() {
  const c = $("viewCanvas");
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  drawBaseDungeon(ctx, c.width, c.height);
  const rects = [
    { x: -18, y: -8, w: 396, h: 276 },
    { x: 50, y: 32, w: 260, h: 198 },
    { x: 94, y: 60, w: 172, h: 146 },
    { x: 128, y: 84, w: 104, h: 98 },
    { x: 154, y: 104, w: 52, h: 58 },
  ];
  drawFarFogWall(ctx, rects[4]);
  for (let depth = 4; depth >= 1; depth--) {
    const center = viewCell(depth, 0);
    const near = rects[depth - 1];
    const far = rects[depth];
    drawSideWallIfNeeded(ctx, near, far, depth, -1);
    drawSideWallIfNeeded(ctx, near, far, depth, 1);
    drawFrontSideBlockIfNeeded(ctx, far, depth, -1);
    drawFrontSideBlockIfNeeded(ctx, far, depth, 1);
    if (isSolid(center.x, center.y)) drawFrontWall(ctx, far, depth);
    else drawOpeningFrame(ctx, far, depth);
  }
  drawVisibleObjects(ctx);
}
function drawBaseDungeon(ctx, w, h) {
  const gradCeil = ctx.createLinearGradient(0, 0, 0, h / 2);
  gradCeil.addColorStop(0, "#151817");
  gradCeil.addColorStop(1, "#2b2c26");
  ctx.fillStyle = gradCeil;
  ctx.fillRect(0, 0, w, h / 2);
  const gradFloor = ctx.createLinearGradient(0, h / 2, 0, h);
  gradFloor.addColorStop(0, "#383429");
  gradFloor.addColorStop(1, "#151511");
  ctx.fillStyle = gradFloor;
  ctx.fillRect(0, h / 2, w, h / 2);
  ctx.strokeStyle = "rgba(0,0,0,.65)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}
function drawSideWallIfNeeded(ctx, near, far, depth, side) {
  const cell = viewCell(depth - 1, side);
  if (!isSolid(cell.x, cell.y)) return;
  const pts = side < 0
    ? [[near.x, near.y], [far.x, far.y], [far.x, far.y + far.h], [near.x, near.y + near.h]]
    : [[near.x + near.w, near.y], [far.x + far.w, far.y], [far.x + far.w, far.y + far.h], [near.x + near.w, near.y + near.h]];
  const color = depth === 1 ? "#75694d" : depth === 2 ? "#685d45" : depth === 3 ? "#554c39" : "#40382a";
  drawPoly(ctx, pts, color, true);
  drawPerspectiveBricks(ctx, pts, depth);
}
function drawFrontSideBlockIfNeeded(ctx, rect, depth, side) {
  const cell = viewCell(depth, side);
  if (!isSolid(cell.x, cell.y)) return;
  const width = Math.max(8, rect.w * .18);
  const x = side < 0 ? rect.x - width : rect.x + rect.w;
  const pts = side < 0
    ? [[x, rect.y + 4], [rect.x, rect.y], [rect.x, rect.y + rect.h], [x, rect.y + rect.h - 4]]
    : [[rect.x + rect.w, rect.y], [x + width, rect.y + 4], [x + width, rect.y + rect.h - 4], [rect.x + rect.w, rect.y + rect.h]];
  const color = depth === 1 ? "#817454" : depth === 2 ? "#6c6047" : "#514837";
  drawPoly(ctx, pts, color, true);
  drawPerspectiveBricks(ctx, pts, depth);
}
function drawVisibleObjects(ctx) {
  const slots = [
    { depth: 1, rect: { x: 112, y: 82, w: 136, h: 144 }, scale: 1 },
    { depth: 2, rect: { x: 146, y: 100, w: 68, h: 82 }, scale: .62 },
    { depth: 3, rect: { x: 164, y: 114, w: 34, h: 44 }, scale: .38 },
  ];
  for (const slot of slots) {
    const center = forwardCell(slot.depth);
    const t = tileAt(center.x, center.y);
    if (t === "#") return;
    if (t === "E" && !state.enemyDefeated) { drawEnemyHint(ctx, slot.rect); return; }
    if (t === "P" && !state.potionTaken) { drawPotionHint(ctx, slot.rect, slot.scale); return; }
    if (t === "X") { drawExitHint(ctx, slot.rect, slot.scale); return; }
  }
}
function drawEnemyHint(ctx, rect) {
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h - 8, rect.w * .38, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}
function roundedRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}
function drawPotionHint(ctx, rect, scale) {
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * .66);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#23c928";
  ctx.strokeStyle = "#050505";
  ctx.lineWidth = 5;
  ctx.beginPath();
  roundedRectPath(ctx, -18, -28, 36, 52, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(-10, -40, 20, 16);
  ctx.strokeRect(-10, -40, 20, 16);
  ctx.restore();
}
function drawExitHint(ctx, rect, scale) {
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * .52);
  ctx.scale(scale, scale);
  ctx.font = "900 34px sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#050505";
  ctx.fillStyle = "#fff";
  ctx.strokeText("出口", 0, 0);
  ctx.fillText("出口", 0, 0);
  ctx.restore();
}
function drawOpeningFrame(ctx, rect, depth) {
  ctx.strokeStyle = depth === 1 ? "rgba(255,255,255,.20)" : "rgba(255,255,255,.10)";
  ctx.lineWidth = depth === 1 ? 4 : 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}
function drawFrontWall(ctx, rect, depth) {
  ctx.fillStyle = depth === 1 ? "#7a6e51" : depth === 2 ? "#645940" : depth === 3 ? "#4e4636" : "#342f28";
  ctx.strokeStyle = "#050505";
  ctx.lineWidth = depth === 1 ? 7 : 5;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  drawBrickTexture(ctx, rect.x, rect.y, rect.w, rect.h, depth === 1 ? 1 : Math.max(.42, 1 / depth));
}
function drawFarFogWall(ctx, rect) {
  const g = ctx.createRadialGradient(180, 130, 4, 180, 130, 86);
  g.addColorStop(0, "rgba(42,46,42,.96)");
  g.addColorStop(.58, "rgba(16,18,17,.96)");
  g.addColorStop(1, "rgba(0,0,0,.98)");
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "#050505";
  ctx.lineWidth = 4;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  [[160,112,17],[188,118,22],[174,138,19],[198,150,15],[154,150,14]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
}
function drawBrickTexture(ctx, x, y, w, h, scale = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,.50)";
  ctx.lineWidth = Math.max(1.5, 3 * scale);
  const rowH = 22 * scale;
  const brickW = 50 * scale;
  for (let yy = y + rowH; yy < y + h; yy += rowH) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  for (let row = 0, yy = y; yy < y + h; row++, yy += rowH) {
    const offset = row % 2 ? brickW / 2 : 0;
    for (let xx = x - offset; xx < x + w; xx += brickW) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + rowH); ctx.stroke(); }
  }
  ctx.restore();
}
function drawPerspectiveBricks(ctx, pts, depth) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,.42)";
  ctx.lineWidth = Math.max(1, 3 - depth * .35);
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const a = lerpPoint(pts[0], pts[3], t);
    const b = lerpPoint(pts[1], pts[2], t);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const a = lerpPoint(pts[0], pts[1], t);
    const b = lerpPoint(pts[3], pts[2], t);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.restore();
}
function lerpPoint(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function drawPoly(ctx, pts, fill = "#444", stroke = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = "#050505"; ctx.lineWidth = 5; ctx.stroke(); }
}
function updateViewSprite() {
  const sprite = $("viewSprite");
  sprite.className = "view-sprite hidden";
  for (let depth = 1; depth <= 3; depth++) {
    const f = forwardCell(depth);
    const t = tileAt(f.x, f.y);
    if (t === "#") return;
    if (t === "E" && !state.enemyDefeated) {
      sprite.className = "view-sprite enemy";
      sprite.style.width = depth === 1 ? "58%" : depth === 2 ? "38%" : "24%";
      sprite.style.opacity = depth === 3 ? ".58" : depth === 2 ? ".78" : "1";
      return;
    }
    if (t === "P" && !state.potionTaken) {
      sprite.className = "view-sprite potion";
      sprite.style.width = depth === 1 ? "42%" : depth === 2 ? "28%" : "18%";
      sprite.style.opacity = "1";
      return;
    }
    if (t === "X") {
      sprite.className = "view-sprite exit";
      sprite.style.width = depth === 1 ? "50%" : "32%";
      sprite.style.opacity = "1";
      return;
    }
  }
}
function drawMiniMap() {
  const canvas = $("miniMap");
  const ctx = canvas.getContext("2d");
  const cell = 18;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < baseMap.length; y++) {
    for (let x = 0; x < baseMap[y].length; x++) {
      const tile = tileAt(x, y);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 3;
      ctx.strokeRect(3 + x * cell, 3 + y * cell, cell, cell);
      if (tile === "#") { ctx.fillStyle = "#111"; ctx.fillRect(3 + x * cell + 3, 3 + y * cell + 3, cell - 6, cell - 6); }
      if (tile === "P" && !state.potionTaken) drawDot(ctx, x, y, "#22c52f");
      if (tile === "E" && !state.enemyDefeated) drawDot(ctx, x, y, "#f04444");
      if (tile === "X") drawDot(ctx, x, y, "#2288ff");
    }
  }
  drawDot(ctx, state.x, state.y, "#ff1d1d", 7);
  const d = DIRS[state.dir];
  ctx.strokeStyle = "#ff1d1d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(3 + state.x * 18 + 9, 3 + state.y * 18 + 9);
  ctx.lineTo(3 + (state.x + d.dx) * 18 + 9, 3 + (state.y + d.dy) * 18 + 9);
  ctx.stroke();
}
function drawDot(ctx, x, y, color, r = 5) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(3 + x * 18 + 9, 3 + y * 18 + 9, r, 0, Math.PI * 2);
  ctx.fill();
}

$("startButton").addEventListener("click", startStory);
$("loadButton").addEventListener("click", loadGame);
$("nextStoryButton").addEventListener("click", nextStory);
$("turnLeftButton").addEventListener("click", () => turn(-1));
$("turnRightButton").addEventListener("click", () => turn(1));
$("forwardButton").addEventListener("click", forward);
$("manualSaveButton").addEventListener("click", () => { save(true); render(); });
$("manualLoadButton").addEventListener("click", loadGame);
$("resetButton").addEventListener("click", resetGame);
show("titleScreen");
