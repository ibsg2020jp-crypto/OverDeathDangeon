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
let state = makeNewState();
const $ = id => document.getElementById(id);

function makeNewState() {
  return {
    x: 1,
    y: 1,
    dir: 1,
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

function tileAt(x, y) {
  if (y < 0 || y >= baseMap.length || x < 0 || x >= baseMap[0].length) return "#";
  return baseMap[y][x];
}
function isSolid(x, y) { return tileAt(x, y) === "#"; }
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
  if (state.cleared) return;
  state.dir = (state.dir + delta + 4) % 4;
  setMessage(`${DIRS[state.dir].name}を向いた。`, "neutral");
  render();
}
function forward() {
  if (state.cleared) return;
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
    render();
    save(false);
    return;
  }
  state.x = nx;
  state.y = ny;
  if (tile === "P" && !state.potionTaken) {
    state.tutorialPotionSeen = true;
    state.potionTaken = true;
    state.hp = Math.min(state.maxHp, state.hp + 18);
    setMessage("アイテムがあります。近づくと使用できます。\n回復薬を使い、HPが回復しました。", "smile");
  } else if (tile === "X") {
    clearGame();
  } else {
    setMessage("湿った通路を進む。", "neutral");
  }
  render();
  save(false);
}
function fightEnemy() {
  const enemyHp = 12;
  if (state.attack < enemyHp) {
    setMessage("敵と遭遇しました。戦いましょう。\nしかし、今の攻撃力では押し負けてしまった……。", "angry");
    die();
    return;
  }
  state.hp = Math.max(1, state.hp - 8);
  state.enemyDefeated = true;
  state.level += 1;
  state.attack += 2;
  state.maxHp += 4;
  state.hp = Math.min(state.maxHp, state.hp + 4);
  setMessage("敵を倒しました。レベルがあがりました。\n攻撃力と最大HPも少し上がりました。", "smile");
}
function die() {
  playDeathFade();
  state.deaths += 1;
  const boost = 1 + 0.5 * state.deaths;
  state.maxHp = Math.floor(state.baseMaxHp * boost);
  state.attack = Math.floor(state.baseAttack * boost);
  state.hp = state.maxHp;
  state.x = 1;
  state.y = 1;
  state.dir = 1;
  state.potionTaken = false;
  state.enemyDefeated = false;
  state.tutorialDeathReturnSeen = true;
  if (!state.seenFirstDeath) {
    state.seenFirstDeath = true;
    setMessage("死に戻りしたようです。\n攻撃力と体力が向上しましたが、進捗が最初からになりました。", "cry");
  } else {
    setMessage("また最初に戻された。\n攻撃力と体力は、さらに上がっている。", "angry");
  }
  save(false);
}
function playDeathFade() {
  const fade = $("deathFade");
  fade.classList.remove("hidden", "show");
  void fade.offsetWidth;
  fade.classList.add("show");
  setTimeout(() => fade.classList.add("hidden"), 1050);
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
  state = { ...makeNewState(), ...JSON.parse(raw) };
  state.loads += 1;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  startGame("記憶をたどって再開した。\n読込回数が記録された。", "neutral");
  return true;
}
function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  state = makeNewState();
  storyIndex = 0;
  show("titleScreen");
}

function render() {
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
  return { f, l: { dx: -f.dy, dy: f.dx } };
}
function viewCell(depth, side) {
  const b = basis();
  return { x: state.x + b.f.dx * depth + b.l.dx * side, y: state.y + b.f.dy * depth + b.l.dy * side };
}
function forwardCell(depth) { return viewCell(depth, 0); }

function drawDungeonView() {
  const c = $("viewCanvas");
  const ctx = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  const view = makeViewGrid();
  ctx.clearRect(0, 0, w, h);
  drawBaseDungeon(ctx, w, h);
  drawCurrentSidePanels(ctx, view);
  drawDepthSidePanels(ctx, view, 2);
  drawDepthSidePanels(ctx, view, 1);
  drawForwardSpace(ctx, view);
  drawVisibleObjects(ctx, view);
}

function makeViewGrid() {
  const rows = [];
  for (let depth = 0; depth <= 2; depth++) {
    const row = {};
    for (let side = -1; side <= 1; side++) {
      const p = viewCell(depth, side);
      row[side] = { ...p, tile: tileAt(p.x, p.y) };
    }
    rows.push(row);
  }
  return rows;
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

function drawCurrentSidePanels(ctx, view) {
  if (view[0][-1].tile === "#") {
    drawPoly(ctx, [[0, 0], [72, 45], [72, 215], [0, 260]], "#6b6048", true);
    drawBrickTexture(ctx, 0, 0, 78, 260, 1.35);
  }
  if (view[0][1].tile === "#") {
    drawPoly(ctx, [[360, 0], [288, 45], [288, 215], [360, 260]], "#6b6048", true);
    drawBrickTexture(ctx, 282, 0, 78, 260, 1.35);
  }
}
function drawDepthSidePanels(ctx, view, depth) {
  const near = depth === 1
    ? { leftTop: [72, 45], leftBottom: [72, 215], rightTop: [288, 45], rightBottom: [288, 215], color: "#62583f" }
    : { leftTop: [118, 72], leftBottom: [118, 188], rightTop: [242, 72], rightBottom: [242, 188], color: "#4f4634" };
  const far = depth === 1
    ? { leftTop: [118, 72], leftBottom: [118, 188], rightTop: [242, 72], rightBottom: [242, 188] }
    : { leftTop: [152, 94], leftBottom: [152, 166], rightTop: [208, 94], rightBottom: [208, 166] };
  if (view[depth][-1].tile === "#") {
    drawPoly(ctx, [near.leftTop, far.leftTop, far.leftBottom, near.leftBottom], near.color, true);
    drawPerspectiveBricks(ctx, [near.leftTop, far.leftTop, far.leftBottom, near.leftBottom]);
  }
  if (view[depth][1].tile === "#") {
    drawPoly(ctx, [near.rightTop, far.rightTop, far.rightBottom, near.rightBottom], near.color, true);
    drawPerspectiveBricks(ctx, [near.rightTop, far.rightTop, far.rightBottom, near.rightBottom]);
  }
}
function drawForwardSpace(ctx, view) {
  if (view[1][0].tile === "#") {
    drawFrontWall(ctx, { x: 72, y: 45, w: 216, h: 170 }, 1);
    return;
  }
  drawOpeningFrame(ctx, { x: 72, y: 45, w: 216, h: 170 }, 1);
  if (view[2][0].tile === "#") {
    drawFrontWall(ctx, { x: 118, y: 72, w: 124, h: 116 }, 2);
    return;
  }
  drawOpeningFrame(ctx, { x: 118, y: 72, w: 124, h: 116 }, 2);
  drawFarFogWall(ctx);
}
function drawFarFogWall(ctx) {
  const g = ctx.createRadialGradient(180, 130, 4, 180, 130, 74);
  g.addColorStop(0, "rgba(35,39,36,.96)");
  g.addColorStop(.62, "rgba(18,20,19,.96)");
  g.addColorStop(1, "rgba(0,0,0,.98)");
  ctx.fillStyle = g;
  ctx.fillRect(152, 94, 56, 72);
  ctx.strokeStyle = "#050505";
  ctx.lineWidth = 5;
  ctx.strokeRect(152, 94, 56, 72);
  ctx.fillStyle = "rgba(0,0,0,.25)";
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(160 + Math.random() * 42, 100 + Math.random() * 60, 10 + Math.random() * 16, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawVisibleObjects(ctx, view) {
  const slots = [
    { depth: 1, rect: { x: 112, y: 82, w: 136, h: 144 }, scale: 1 },
    { depth: 2, rect: { x: 146, y: 100, w: 68, h: 82 }, scale: .62 },
  ];
  for (const slot of slots) {
    const center = view[slot.depth][0];
    if (center.tile === "E" && !state.enemyDefeated) { drawEnemyHint(ctx, slot.rect); continue; }
    if (center.tile === "P" && !state.potionTaken) { drawPotionHint(ctx, slot.rect, slot.scale); continue; }
    if (center.tile === "X") { drawExitHint(ctx, slot.rect, slot.scale); continue; }
  }
}
function drawEnemyHint(ctx, rect) {
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h - 8, rect.w * .38, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawPotionHint(ctx, rect, scale) {
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * .66);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#23c928";
  ctx.strokeStyle = "#050505";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-18, -28, 36, 52, 8);
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
  ctx.strokeStyle = depth === 1 ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.13)";
  ctx.lineWidth = depth === 1 ? 4 : 3;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y);
  ctx.lineTo(rect.x + rect.w / 2, 130);
  ctx.lineTo(rect.x, rect.y + rect.h);
  ctx.moveTo(rect.x + rect.w, rect.y);
  ctx.lineTo(rect.x + rect.w / 2, 130);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
  ctx.stroke();
}
function drawFrontWall(ctx, rect, depth) {
  ctx.fillStyle = depth === 1 ? "#766a4e" : "#5d523d";
  ctx.strokeStyle = "#050505";
  ctx.lineWidth = 6;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  drawBrickTexture(ctx, rect.x, rect.y, rect.w, rect.h, depth === 1 ? 1 : .74);
}
function drawBrickTexture(ctx, x, y, w, h, scale = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,.50)";
  ctx.lineWidth = Math.max(2, 3 * scale);
  const rowH = 22 * scale;
  const brickW = 50 * scale;
  for (let yy = y + rowH; yy < y + h; yy += rowH) {
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  for (let row = 0, yy = y; yy < y + h; row++, yy += rowH) {
    const offset = row % 2 ? brickW / 2 : 0;
    for (let xx = x - offset; xx < x + w; xx += brickW) {
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + rowH);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function drawPerspectiveBricks(ctx, pts) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,.42)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const a = lerpPoint(pts[0], pts[3], t);
    const b = lerpPoint(pts[1], pts[2], t);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const a = lerpPoint(pts[0], pts[1], t);
    const b = lerpPoint(pts[3], pts[2], t);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
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
  if (stroke) {
    ctx.strokeStyle = "#050505";
    ctx.lineWidth = 5;
    ctx.stroke();
  }
}
function updateViewSprite() {
  const sprite = $("viewSprite");
  sprite.className = "view-sprite hidden";
  for (let depth = 1; depth <= 2; depth++) {
    const f = forwardCell(depth);
    const t = tileAt(f.x, f.y);
    if (t === "#") return;
    if (t === "E" && !state.enemyDefeated) {
      sprite.className = "view-sprite enemy";
      sprite.style.width = depth === 1 ? "58%" : "38%";
      sprite.style.opacity = depth === 2 ? ".78" : "1";
      return;
    }
    if (t === "P" && !state.potionTaken) {
      sprite.className = "view-sprite potion";
      sprite.style.width = depth === 1 ? "42%" : "28%";
      sprite.style.opacity = "1";
      return;
    }
    if (t === "X") {
      sprite.className = "view-sprite exit";
      sprite.style.width = "50%";
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
      if (tile === "#") {
        ctx.fillStyle = "#111";
        ctx.fillRect(3 + x * cell + 3, 3 + y * cell + 3, cell - 6, cell - 6);
      }
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
