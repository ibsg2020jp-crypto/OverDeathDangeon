"use strict";

const SAVE_KEY = "overdeath-dungeon-prototype-v0";

const DIRS = [
  { name: "北", dx: 0, dy: -1 },
  { name: "東", dx: 1, dy: 0 },
  { name: "南", dx: 0, dy: 1 },
  { name: "西", dx: -1, dy: 0 },
];

const MapState = {
  width: 5,
  height: 5,
  rows: [
    "#####",
    "#S..#",
    "###E#",
    "#XP.#",
    "#####",
  ],
  start: { x: 1, y: 1, dir: 1 },
  enemy: { hp: 12, damage: 50 },
  deathBoost: { maxHp: 20, attack: 10 },
};

const Story = [
  { face: "neutral", text: "……ここが、噂の洞窟か。\n思ったより静かだな。" },
  { face: "neutral", text: "村の人たちは、戻ってきた者が少ないと言っていた。\nでも、入口付近は普通の洞窟に見える。" },
  { face: "angry", text: "……なんだ？\n入口の方で、崩れるような音がする……？" },
  { face: "collapse", text: "ゴゴゴゴゴ……！\n振り返った道が、岩と土砂で塞がれていく。" },
  { face: "cry", text: "う、嘘だろ……。\n入口が……完全に塞がった……？" },
  { face: "neutral", text: "……落ち着け。\nここで止まっていても、何も変わらない。" },
  { face: "neutral", text: "先に進まないと……。\n生きて出るんだ。" },
];

const AchievementRules = [
  { id: "clear", name: "初回踏破", check: s => s.progress.cleared },
  { id: "noDeath", name: "不死踏破", check: s => s.progress.cleared && s.records.deaths === 0 },
  { id: "theory", name: "理論値踏破", check: s => s.progress.cleared && s.records.deaths === 0 && s.records.loads === 0 },
  { id: "overDeath", name: "死還者", check: s => s.progress.cleared && s.records.deaths > 0 },
];

const $ = id => document.getElementById(id);

let storyIndex = 0;
let deathStepIndex = 0;
let deathSequence = [];
let deathMode = false;
let state = createInitialState();

function createInitialState() {
  return {
    player: { ...MapState.start },
    stats: {
      level: 1,
      baseMaxHp: 34,
      baseAttack: 5,
      maxHp: 34,
      hp: 34,
      attack: 5,
    },
    records: {
      deaths: 0,
      loads: 0,
    },
    progress: {
      enemyDefeated: false,
      potionTaken: false,
      cleared: false,
    },
    tutorial: {
      enemySeen: false,
      potionSeen: false,
      deathReturnSeen: false,
    },
    achievements: [],
  };
}

function normalizeState(raw) {
  const fresh = createInitialState();
  const merged = {
    ...fresh,
    ...(raw || {}),
    player: { ...fresh.player, ...((raw && raw.player) || {}) },
    stats: { ...fresh.stats, ...((raw && raw.stats) || {}) },
    records: { ...fresh.records, ...((raw && raw.records) || {}) },
    progress: { ...fresh.progress, ...((raw && raw.progress) || {}) },
    tutorial: { ...fresh.tutorial, ...((raw && raw.tutorial) || {}) },
    achievements: Array.isArray(raw && raw.achievements) ? raw.achievements : [],
  };

  merged.player.x = clampInt(merged.player.x, 0, MapState.width - 1, fresh.player.x);
  merged.player.y = clampInt(merged.player.y, 0, MapState.height - 1, fresh.player.y);
  merged.player.dir = modulo(clampInt(merged.player.dir, 0, 3, fresh.player.dir), 4);

  for (const key of ["level", "baseMaxHp", "baseAttack", "maxHp", "hp", "attack"]) {
    merged.stats[key] = Number.isFinite(Number(merged.stats[key])) ? Number(merged.stats[key]) : fresh.stats[key];
  }
  merged.stats.level = Math.max(1, Math.floor(merged.stats.level));
  merged.stats.baseMaxHp = Math.max(1, Math.floor(merged.stats.baseMaxHp));
  merged.stats.baseAttack = Math.max(1, Math.floor(merged.stats.baseAttack));
  merged.stats.maxHp = Math.max(1, Math.floor(merged.stats.maxHp));
  merged.stats.attack = Math.max(1, Math.floor(merged.stats.attack));
  merged.stats.hp = Math.max(0, Math.min(Math.floor(merged.stats.hp), merged.stats.maxHp));

  merged.records.deaths = Math.max(0, Math.floor(Number(merged.records.deaths) || 0));
  merged.records.loads = Math.max(0, Math.floor(Number(merged.records.loads) || 0));
  return merged;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function modulo(value, size) {
  return ((value % size) + size) % size;
}

function tileAt(x, y) {
  if (y < 0 || y >= MapState.height || x < 0 || x >= MapState.width) return "#";
  return MapState.rows[y][x];
}

function isWall(x, y) {
  return tileAt(x, y) === "#";
}

function frontVector(dir = state.player.dir) {
  return DIRS[dir];
}

function rightVector(dir = state.player.dir) {
  const front = frontVector(dir);
  return { dx: -front.dy, dy: front.dx };
}

function viewCell(depth, side = 0) {
  const front = frontVector();
  const right = rightVector();
  return {
    x: state.player.x + front.dx * depth + right.dx * side,
    y: state.player.y + front.dy * depth + right.dy * side,
  };
}

function cellIsVisibleBefore(depth) {
  for (let d = 1; d <= depth; d += 1) {
    const cell = viewCell(d, 0);
    if (isWall(cell.x, cell.y)) return false;
  }
  return true;
}

function isBusy() {
  return deathMode || state.progress.cleared;
}

function setScreen(screenId) {
  for (const id of ["titleScreen", "storyScreen", "gameScreen"]) {
    $(id).classList.toggle("hidden", id !== screenId);
  }
}

function setFace(face = "neutral") {
  for (const id of ["storyVisual", "heroPortrait"]) {
    const el = $(id);
    if (!el) continue;
    el.className = el.className.replace(/\b(neutral|smile|angry|cry|collapse)\b/g, "").trim();
    el.classList.add("hero", face);
  }
}

function setMessage(message, face = "neutral") {
  $("messageText").textContent = message;
  setFace(face);
}

function startStory() {
  storyIndex = 0;
  state = createInitialState();
  hideDeathOverlay();
  setScreen("storyScreen");
  renderStoryLine();
}

function renderStoryLine() {
  const line = Story[storyIndex];
  setFace(line.face);
  $("storyText").textContent = line.text;
}

function nextStory() {
  storyIndex += 1;
  if (storyIndex >= Story.length) {
    startGame("チュートリアル：前進で進み、左右で向きを変えます。\n閉じ込められた。先に進まないと……。", "neutral");
    return;
  }
  renderStoryLine();
}

function startGame(message, face = "neutral") {
  state = normalizeState(state);
  hideDeathOverlay();
  setScreen("gameScreen");
  setMessage(message, face);
  render();
  saveGame(false);
}

const movement = {
  turn(delta) {
    if (isBusy()) return;
    state.player.dir = modulo(state.player.dir + delta, 4);
    render();
    if (showLookTutorial()) return;
    setMessage(`${DIRS[state.player.dir].name}を向いた。`, "neutral");
  },

  forward() {
    if (isBusy()) return;

    const front = frontVector();
    const nx = state.player.x + front.dx;
    const ny = state.player.y + front.dy;
    const tile = tileAt(nx, ny);

    if (tile === "#") {
      setMessage("岩壁だ。ここは進めない。\n壁の形を見て、通れる方向を探そう。", "neutral");
      render();
      return;
    }

    if (tile === "E" && !state.progress.enemyDefeated) {
      battle.fight({ x: nx, y: ny });
      return;
    }

    moveTo(nx, ny);
  },
};

function moveTo(x, y) {
  const tile = tileAt(x, y);
  state.player.x = x;
  state.player.y = y;

  if (tile === "P" && !state.progress.potionTaken) {
    state.progress.potionTaken = true;
    state.stats.hp = state.stats.maxHp;
    setMessage("回復薬です。体力が回復しました。", "smile");
  } else if (tile === "X") {
    clearGame();
    render();
    saveGame(false);
    return;
  } else {
    render();
    if (!showLookTutorial()) {
      setMessage("湿った通路を進む。", "neutral");
    }
    saveGame(false);
    return;
  }

  render();
  saveGame(false);
}

const battle = {
  fight(target) {
    setMessage("敵と遭遇しました。戦いましょう。", "angry");

    if (state.stats.attack < MapState.enemy.hp) {
      setMessage("敵と遭遇しました。戦いましょう。\nしかし、今の攻撃力では押し負けてしまった……。", "angry");
      beginDeathReturn(MapState.enemy.damage);
      return;
    }

    state.progress.enemyDefeated = true;
    state.stats.hp = Math.max(1, state.stats.hp - 8);
    state.stats.level += 1;
    state.stats.attack += 2;
    state.stats.maxHp += 4;
    state.stats.hp = Math.min(state.stats.maxHp, state.stats.hp + 4);
    state.player.x = target.x;
    state.player.y = target.y;

    setMessage("敵を倒しました。レベルがあがりました。\n攻撃力と最大HPも少し上がりました。", "smile");
    render();
    saveGame(false);
  },
};

function beginDeathReturn(damage) {
  if (deathMode) return;

  state.stats.hp = 0;
  deathMode = true;
  deathStepIndex = 0;
  deathSequence = [
    `${damage}のダメージを受けた。\n死んでしまった……`,
    "ここは、、、？",
    "体力がもどっている。\n攻撃力と体力の上限値が上がっている、、、？\nこれは一体、、、",
    "死に戻りすると能力があがりますが、進捗が初めからになります",
  ];

  setControlsEnabled(false);
  setFace("cry");
  render();
  showDeathStep();
}

function showDeathStep() {
  $("deathOverlayText").textContent = deathSequence[deathStepIndex] || "死に戻りした。";
  $("deathNextButton").textContent = deathStepIndex >= deathSequence.length - 1 ? "探索に戻る" : "タップして進む";
  $("deathOverlay").classList.remove("hidden");
}

function advanceDeathStep() {
  if (!deathMode) return;

  deathStepIndex += 1;
  if (deathStepIndex >= deathSequence.length) {
    applyDeathReturn();
    return;
  }

  showDeathStep();
}

function applyDeathReturn() {
  state.records.deaths += 1;
  state.stats.maxHp = state.stats.baseMaxHp + MapState.deathBoost.maxHp * state.records.deaths;
  state.stats.attack = state.stats.baseAttack + MapState.deathBoost.attack * state.records.deaths;
  state.stats.hp = state.stats.maxHp;
  state.player = { ...MapState.start };
  state.progress.enemyDefeated = false;
  state.progress.potionTaken = false;
  state.tutorial.deathReturnSeen = true;
  state.tutorial.enemySeen = false;
  state.tutorial.potionSeen = false;

  hideDeathOverlay();
  setMessage("死に戻り地点に戻された。\nもう一度、敵に挑もう。", "cry");
  render();
  saveGame(false);
}

function hideDeathOverlay() {
  deathMode = false;
  deathStepIndex = 0;
  deathSequence = [];
  $("deathOverlay").classList.add("hidden");
  setControlsEnabled(true);
}

function setControlsEnabled(enabled) {
  const ids = [
    "turnLeftButton",
    "forwardButton",
    "turnRightButton",
    "manualSaveButton",
    "manualLoadButton",
    "resetButton",
  ];
  for (const id of ids) {
    const el = $(id);
    if (el) el.disabled = !enabled;
  }
}

function showLookTutorial() {
  const front1 = viewCell(1, 0);
  const front2 = viewCell(2, 0);
  const t1 = tileAt(front1.x, front1.y);
  const t2 = tileAt(front2.x, front2.y);

  if (!state.progress.enemyDefeated && !state.tutorial.enemySeen && (t1 === "E" || t2 === "E")) {
    state.tutorial.enemySeen = true;
    setMessage("敵と遭遇しました。戦いましょう。", "angry");
    saveGame(false);
    return true;
  }

  if (!state.progress.potionTaken && !state.tutorial.potionSeen && (t1 === "P" || t2 === "P")) {
    state.tutorial.potionSeen = true;
    setMessage("アイテムがあります。近づいて使用しましょう。", "smile");
    saveGame(false);
    return true;
  }

  return false;
}

function clearGame() {
  state.progress.cleared = true;
  const newlyUnlocked = unlockAchievements();
  const suffix = newlyUnlocked.length ? `\n\n実績解除：${newlyUnlocked.join("、")}` : "";
  setMessage(`外へ続く風を見つけた。\nチュートリアル踏破！${suffix}`, state.records.deaths === 0 ? "smile" : "neutral");
}

function unlockAchievements() {
  const newly = [];
  for (const rule of AchievementRules) {
    if (!state.achievements.includes(rule.id) && rule.check(state)) {
      state.achievements.push(rule.id);
      newly.push(rule.name);
    }
  }
  return newly;
}

function saveGame(showMessage = true) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (showMessage) setMessage("保存しました。", "neutral");
}

function loadGame(fromTitle = false) {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) {
    if (fromTitle) {
      setScreen("titleScreen");
      return false;
    }
    setMessage("セーブデータがありません。", "neutral");
    return false;
  }

  try {
    state = normalizeState(JSON.parse(saved));
    state.records.loads += 1;
    hideDeathOverlay();
    setScreen("gameScreen");
    setMessage("セーブデータを読み込みました。", "neutral");
    render();
    saveGame(false);
    return true;
  } catch (error) {
    console.error(error);
    localStorage.removeItem(SAVE_KEY);
    if (fromTitle) {
      setScreen("titleScreen");
    } else {
      setMessage("セーブデータが壊れていたので削除しました。", "cry");
    }
    return false;
  }
}

function resetGame() {
  state = createInitialState();
  hideDeathOverlay();
  localStorage.removeItem(SAVE_KEY);
  startStory();
}

function render() {
  renderHud();
  renderMiniMap();
  renderDungeon();
}

function renderHud() {
  const { stats, records } = state;
  $("hpText").textContent = `${stats.hp}/${stats.maxHp}`;
  $("attackText").textContent = stats.attack;
  $("levelText").textContent = stats.level;
  $("deathText").textContent = records.deaths;
  $("loadText").textContent = records.loads;

  const hpRatio = stats.maxHp > 0 ? (stats.hp / stats.maxHp) * 100 : 0;
  $("hpBar").style.width = `${Math.max(0, Math.min(100, hpRatio))}%`;
}

function renderMiniMap() {
  const canvas = $("miniMap");
  const ctx = canvas.getContext("2d");
  const cell = 18;
  const offsetX = 3;
  const offsetY = 3;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MapState.height; y += 1) {
    for (let x = 0; x < MapState.width; x += 1) {
      const tile = tileAt(x, y);
      const px = offsetX + x * cell;
      const py = offsetY + y * cell;

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#111";
      ctx.fillStyle = tile === "#" ? "#111" : "#fff";
      ctx.fillRect(px, py, cell, cell);
      ctx.strokeRect(px, py, cell, cell);

      if (tile === "E" && !state.progress.enemyDefeated) drawMiniDot(ctx, px, py, cell, "#8c2f2f");
      if (tile === "P" && !state.progress.potionTaken) drawMiniDot(ctx, px, py, cell, "#22c52f");
      if (tile === "X") drawMiniDot(ctx, px, py, cell, "#4f68d7");
    }
  }

  const px = offsetX + state.player.x * cell + cell / 2;
  const py = offsetY + state.player.y * cell + cell / 2;
  const dir = frontVector();
  ctx.fillStyle = "#f04444";
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f04444";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + dir.dx * 9, py + dir.dy * 9);
  ctx.stroke();
}

function drawMiniDot(ctx, x, y, cell, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + cell / 2, y + cell / 2, 4, 0, Math.PI * 2);
  ctx.fill();
}

function renderDungeon() {
  const canvas = $("viewCanvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h);

  const planes = [
    { x: 0, y: 0, w, h },
    { x: 48, y: 34, w: 264, h: 192 },
    { x: 104, y: 70, w: 152, h: 118 },
    { x: 140, y: 96, w: 80, h: 68 },
    { x: 164, y: 116, w: 32, h: 30 },
  ];

  drawDepthFog(ctx, planes[4]);

  let frontBlockedDepth = null;
  for (let d = 1; d <= 4; d += 1) {
    const c = viewCell(d, 0);
    if (isWall(c.x, c.y)) {
      frontBlockedDepth = d;
      break;
    }
  }

  for (let segment = 3; segment >= 0; segment -= 1) {
    if (!cellIsVisibleBefore(segment)) continue;

    const left = viewCell(segment, -1);
    const right = viewCell(segment, 1);

    if (isWall(left.x, left.y)) {
      drawSideWall(ctx, planes[segment], planes[segment + 1], "left", segment);
    } else {
      drawSideOpening(ctx, planes[segment], planes[segment + 1], "left");
    }

    if (isWall(right.x, right.y)) {
      drawSideWall(ctx, planes[segment], planes[segment + 1], "right", segment);
    } else {
      drawSideOpening(ctx, planes[segment], planes[segment + 1], "right");
    }
  }

  drawCeilingAndFloorLines(ctx, planes);

  if (frontBlockedDepth !== null) {
    drawFrontWall(ctx, planes[frontBlockedDepth], frontBlockedDepth);
  }

  drawViewSprite(frontBlockedDepth);
}

function drawBackground(ctx, w, h) {
  ctx.fillStyle = "#15120d";
  ctx.fillRect(0, 0, w, h);

  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "#2a2116");
  grd.addColorStop(.45, "#19150f");
  grd.addColorStop(1, "#0d0b09");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (let y = 26; y < h; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y) * 3);
    ctx.lineTo(w, y + Math.cos(y) * 3);
    ctx.stroke();
  }
}

function drawDepthFog(ctx, plane) {
  ctx.fillStyle = "rgba(0,0,0,.55)";
  roundRect(ctx, plane.x, plane.y, plane.w, plane.h, 4, true, false);
}

function drawSideWall(ctx, near, far, side, segment) {
  const leftSide = side === "left";
  const points = leftSide
    ? [
        [near.x, near.y],
        [far.x, far.y],
        [far.x, far.y + far.h],
        [near.x, near.y + near.h],
      ]
    : [
        [near.x + near.w, near.y],
        [far.x + far.w, far.y],
        [far.x + far.w, far.y + far.h],
        [near.x + near.w, near.y + near.h],
      ];

  ctx.save();
  pathPoly(ctx, points);
  const shade = 118 - segment * 18;
  ctx.fillStyle = `rgb(${shade}, ${Math.max(74, shade - 26)}, ${Math.max(48, shade - 54)})`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111";
  ctx.stroke();

  drawBrickLines(ctx, points, leftSide);
  ctx.restore();
}

function drawSideOpening(ctx, near, far, side) {
  const leftSide = side === "left";
  const points = leftSide
    ? [
        [near.x, near.y],
        [far.x, far.y],
        [far.x, far.y + far.h],
        [near.x, near.y + near.h],
      ]
    : [
        [near.x + near.w, near.y],
        [far.x + far.w, far.y],
        [far.x + far.w, far.y + far.h],
        [near.x + near.w, near.y + near.h],
      ];

  ctx.save();
  pathPoly(ctx, points);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawFrontWall(ctx, plane, depth) {
  const shade = Math.max(78, 156 - depth * 20);
  ctx.fillStyle = `rgb(${shade}, ${Math.max(62, shade - 30)}, ${Math.max(42, shade - 58)})`;
  roundRect(ctx, plane.x, plane.y, plane.w, plane.h, 4, true, false);

  ctx.strokeStyle = "#111";
  ctx.lineWidth = depth === 1 ? 5 : 3;
  roundRect(ctx, plane.x, plane.y, plane.w, plane.h, 4, false, true);

  drawFrontBricks(ctx, plane, depth);
}

function drawFrontBricks(ctx, plane, depth) {
  const rows = Math.max(3, 7 - depth);
  const rowH = plane.h / rows;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plane.x, plane.y, plane.w, plane.h);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.lineWidth = Math.max(1.2, 3 - depth * .4);

  for (let row = 1; row < rows; row += 1) {
    const y = plane.y + row * rowH;
    ctx.beginPath();
    ctx.moveTo(plane.x, y);
    ctx.lineTo(plane.x + plane.w, y);
    ctx.stroke();
  }

  for (let row = 0; row < rows; row += 1) {
    const y0 = plane.y + row * rowH;
    const offset = row % 2 === 0 ? 0 : plane.w / 5;
    const brickW = plane.w / 3;
    for (let x = plane.x - offset; x < plane.x + plane.w; x += brickW) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + rowH);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawBrickLines(ctx, points, leftSide) {
  const topA = points[0];
  const topB = points[1];
  const bottomB = points[2];
  const bottomA = points[3];

  ctx.strokeStyle = "rgba(0,0,0,.42)";
  ctx.lineWidth = 2;

  for (let i = 1; i < 5; i += 1) {
    const t = i / 5;
    const a = lerpPoint(topA, bottomA, t);
    const b = lerpPoint(topB, bottomB, t);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  for (let i = 1; i < 4; i += 1) {
    const t = i / 4;
    const a = lerpPoint(leftSide ? topA : topB, leftSide ? topB : topA, t);
    const b = lerpPoint(leftSide ? bottomA : bottomB, leftSide ? bottomB : bottomA, t);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
}

function drawCeilingAndFloorLines(ctx, planes) {
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 2;

  for (let i = 1; i < planes.length; i += 1) {
    const p = planes[i];
    ctx.strokeRect(p.x, p.y, p.w, p.h);
  }

  const center = { x: 180, y: 130 };
  for (const p of planes.slice(1)) {
    for (const point of [
      [p.x, p.y],
      [p.x + p.w, p.y],
      [p.x, p.y + p.h],
      [p.x + p.w, p.y + p.h],
    ]) {
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(point[0], point[1]);
      ctx.stroke();
    }
  }
}

function drawViewSprite(frontBlockedDepth) {
  const sprite = $("viewSprite");
  sprite.className = "view-sprite hidden";
  sprite.style.width = "";
  sprite.style.height = "";
  sprite.style.opacity = "1";

  const candidates = [];
  for (let depth = 1; depth <= 3; depth += 1) {
    if (frontBlockedDepth !== null && depth >= frontBlockedDepth) break;
    const c = viewCell(depth, 0);
    const tile = tileAt(c.x, c.y);

    if (tile === "E" && !state.progress.enemyDefeated) candidates.push({ type: "enemy", depth });
    if (tile === "P" && !state.progress.potionTaken) candidates.push({ type: "potion", depth });
    if (tile === "X") candidates.push({ type: "exit", depth });
  }

  const target = candidates[0];
  if (!target) return;

  sprite.classList.remove("hidden");
  sprite.classList.add(target.type);

  if (target.depth === 1) {
    sprite.style.width = "56%";
    sprite.style.height = "78%";
  } else if (target.depth === 2) {
    sprite.style.width = "36%";
    sprite.style.height = "56%";
    sprite.style.opacity = ".88";
  } else {
    sprite.style.width = "24%";
    sprite.style.height = "40%";
    sprite.style.opacity = ".7";
  }
}

function pathPoly(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.closePath();
}

function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function roundRect(ctx, x, y, w, h, radius, fill, stroke) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function bindEvents() {
  $("startButton").addEventListener("click", startStory);
  $("loadButton").addEventListener("click", () => loadGame(true));
  $("nextStoryButton").addEventListener("click", nextStory);
  $("turnLeftButton").addEventListener("click", () => movement.turn(-1));
  $("forwardButton").addEventListener("click", () => movement.forward());
  $("turnRightButton").addEventListener("click", () => movement.turn(1));
  $("manualSaveButton").addEventListener("click", () => saveGame(true));
  $("manualLoadButton").addEventListener("click", () => loadGame(false));
  $("resetButton").addEventListener("click", resetGame);
  $("deathNextButton").addEventListener("click", advanceDeathStep);
}

function boot() {
  bindEvents();
  hideDeathOverlay();
  setScreen("titleScreen");
}

boot();
