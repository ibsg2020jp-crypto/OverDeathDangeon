const SAVE_KEY = "overdeath-dungeon-prototype-v0";
const DIRS = [
  { name: "北", dx: 0, dy: -1 },
  { name: "東", dx: 1, dy: 0 },
  { name: "南", dx: 0, dy: 1 },
  { name: "西", dx: -1, dy: 0 },
];

const baseMap = [
  "#####",
  "#S..#",
  "#.#E#",
  "#P..#",
  "##X##",
];

const story = [
  { face: "neutral", text: "……ここが、噂の洞窟か。\n思ったより静かだな。" },
  { face: "neutral", text: "村の人たちは、戻ってきた者が少ないと言っていた。\nでも、入口付近は普通の洞窟に見える。" },
  { face: "angry", text: "……なんだ？\n奥の方で、地面が鳴っている……？" },
  { face: "collapse", text: "ゴゴゴゴゴ……！\n天井が崩れ、通ってきた道が岩で塞がれた。" },
  { face: "cry", text: "う、嘘だろ……。\n入口が……塞がった……？" },
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
    baseLevel: 34,
    level: 34,
    maxHp: 34,
    hp: 34,
    deaths: 0,
    loads: 0,
    cleared: false,
    potionTaken: false,
    enemyDefeated: false,
    seenFirstDeath: false,
    unlocked: [],
  };
}

function tileAt(x, y) {
  if (y < 0 || y >= baseMap.length || x < 0 || x >= baseMap[0].length) return "#";
  return baseMap[y][x];
}

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
    startGame("閉じ込められた。先に進まないと……。", "neutral");
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
    setMessage("岩壁だ。ここは進めない。", "neutral");
    render();
    return;
  }

  state.x = nx;
  state.y = ny;

  if (tile === "P" && !state.potionTaken) {
    state.potionTaken = true;
    state.hp = Math.min(state.maxHp, state.hp + 16);
    setMessage("回復薬を見つけた。\n少しだけ息が整った。", "smile");
  } else if (tile === "E" && !state.enemyDefeated) {
    fightEnemy();
  } else if (tile === "X") {
    clearGame();
  } else {
    setMessage("湿った通路を進む。", "neutral");
  }

  render();
  save(false);
}

function fightEnemy() {
  const damage = Math.max(8, 42 - state.level);
  state.hp -= damage;
  if (state.hp <= 0) {
    die();
    return;
  }
  if (state.level >= 38) {
    state.enemyDefeated = true;
    setMessage("何かが飛びかかってきた。\n傷は負ったが、押し返せた。", "angry");
  } else {
    setMessage("暗闇から何かが襲ってきた。\nまだ倒しきれない……！", "angry");
  }
}

function die() {
  state.deaths += 1;
  state.level = state.baseLevel + Math.floor(state.baseLevel * 0.5 * state.deaths);
  state.maxHp = state.level;
  state.hp = state.maxHp;
  state.x = 1;
  state.y = 1;
  state.dir = 1;
  state.potionTaken = false;
  state.enemyDefeated = false;

  if (!state.seenFirstDeath) {
    state.seenFirstDeath = true;
    setMessage("……あれ？\n俺、さっき……死んだ、よな？\n場所が戻ってる。でも、記憶は残ってる。", "cry");
  } else {
    setMessage("また戻された。\nでも、前より体が動く。", "angry");
  }
  save(false);
}

function clearGame() {
  state.cleared = true;
  const newly = unlockAchievements();
  const suffix = newly.length ? `\n\n実績解除：${newly.join("、")}` : "";
  setMessage(`外へ続く風を見つけた。\nプロトタイプ踏破！${suffix}`, state.deaths === 0 ? "smile" : "neutral");
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
    setMessage("まだセーブデータがない。", "cry");
    show("titleScreen");
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
  $("levelText").textContent = state.level;
  $("deathText").textContent = state.deaths;
  $("loadText").textContent = state.loads;
  $("hpBar").style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;

  const d = DIRS[state.dir];
  const front = tileAt(state.x + d.dx, state.y + d.dy);
  $("frontWall").classList.toggle("open", front !== "#");
  const eventAhead = ["P", "E", "X"].includes(front);
  $("eventMarker").classList.toggle("hidden", !eventAhead);
  drawMiniMap();
}

function drawMiniMap() {
  const canvas = $("miniMap");
  const ctx = canvas.getContext("2d");
  const cell = 18;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < baseMap.length; y++) {
    for (let x = 0; x < baseMap[y].length; x++) {
      const tile = tileAt(x, y);
      ctx.strokeStyle = "#111";
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
