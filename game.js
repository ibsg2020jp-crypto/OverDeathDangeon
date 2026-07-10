'use strict';

const SAVE_MANUAL = 'odd-v1-clean:manual';
const SAVE_AUTO = 'odd-v1-clean:auto';
const SAVE_OLD_KEYS = [
  'overdeath-dungeon-prototype-v0',
  'overdeath-dungeon-prototype-v0:auto',
  'overdeath-dungeon-prototype-v0:manual',
];

const DIRS = [
  { name: '北', dx: 0, dy: -1 },
  { name: '東', dx: 1, dy: 0 },
  { name: '南', dx: 0, dy: 1 },
  { name: '西', dx: -1, dy: 0 },
];

const MAP = [
  '#####',
  '#S..#',
  '###E#',
  '#XP.#',
  '#####',
];

const STORY = [
  ['neutral', '……ここが、噂の洞窟か。\n思ったより静かだな。'],
  ['neutral', '村の人たちは、戻ってきた者が少ないと言っていた。\nでも、入口付近は普通の洞窟に見える。'],
  ['angry', '……なんだ？\n入口の方で、崩れるような音がする……？'],
  ['collapse', 'ゴゴゴゴゴ……！\n振り返った道が、岩と土砂で塞がれていく。'],
  ['cry', 'う、嘘だろ……。\n入口が……完全に塞がった……？'],
  ['neutral', '……落ち着け。\nここで止まっていても、何も変わらない。'],
  ['neutral', '先に進まないと……。\n生きて出るんだ。'],
];

const ACHIEVEMENTS = [
  { id: 'clear', name: '初回踏破', ok: s => s.cleared },
  { id: 'noDeath', name: '不死踏破', ok: s => s.cleared && s.deaths === 0 },
  { id: 'theory', name: '理論値踏破', ok: s => s.cleared && s.deaths === 0 && s.loads === 0 },
  { id: 'returner', name: '死還者', ok: s => s.cleared && s.deaths > 0 },
];

const $ = id => document.getElementById(id);

let storyIndex = 0;
let modalMode = null;
let deathStep = 0;
let state = newState();

function newState() {
  return {
    x: 1, y: 1, dir: 1,
    hp: 34, maxHp: 34, atk: 5, level: 1,
    deaths: 0, loads: 0,
    enemyDefeated: false,
    potionPicked: false,
    potions: 0,
    cleared: false,
    seenEnemyTip: false,
    seenPotionTip: false,
    achievements: [],
  };
}

function normalize(raw) {
  const fresh = newState();
  const s = { ...fresh, ...(raw || {}) };
  for (const key of ['x','y','dir','hp','maxHp','atk','level','deaths','loads','potions']) {
    s[key] = Number.isFinite(Number(s[key])) ? Math.floor(Number(s[key])) : fresh[key];
  }
  s.x = Math.max(0, Math.min(4, s.x));
  s.y = Math.max(0, Math.min(4, s.y));
  s.dir = ((s.dir % 4) + 4) % 4;
  s.maxHp = Math.max(1, s.maxHp);
  s.hp = Math.max(0, Math.min(s.maxHp, s.hp));
  s.atk = Math.max(1, s.atk);
  s.level = Math.max(1, s.level);
  s.deaths = Math.max(0, s.deaths);
  s.loads = Math.max(0, s.loads);
  s.potions = Math.max(0, s.potions);
  if (!Array.isArray(s.achievements)) s.achievements = [];
  return s;
}

function tileAt(x, y) {
  if (y < 0 || y >= MAP.length || x < 0 || x >= MAP[0].length) return '#';
  return MAP[y][x];
}

function isWall(x, y) { return tileAt(x, y) === '#'; }
function front() { return DIRS[state.dir]; }
function right() { const f = front(); return { dx: -f.dy, dy: f.dx }; }
function viewCell(depth, side) {
  const f = front();
  const r = right();
  return { x: state.x + f.dx * depth + r.dx * side, y: state.y + f.dy * depth + r.dy * side };
}
function centerBlockedBefore(depth) {
  for (let d = 1; d <= depth; d++) {
    const c = viewCell(d, 0);
    if (isWall(c.x, c.y)) return true;
  }
  return false;
}

function showScreen(id) {
  ['titleScreen','storyScreen','gameScreen'].forEach(s => $(s).classList.toggle('hidden', s !== id));
}

function face(name) {
  ['heroFace','storyFace'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.remove('neutral','smile','angry','cry','collapse');
    el.classList.add(name || 'neutral');
  });
}

function log(text, mood = 'neutral') {
  $('logText').textContent = text;
  face(mood);
}

function startNew() {
  clearAllSaves();
  state = newState();
  storyIndex = 0;
  closeOverlay();
  showScreen('storyScreen');
  showStory();
}

function showStory() {
  const [mood, text] = STORY[storyIndex];
  face(mood);
  $('storyText').textContent = text;
}

function nextStory() {
  storyIndex++;
  if (storyIndex >= STORY.length) {
    showScreen('gameScreen');
    log('チュートリアル：前進で進み、左右で向きを変えます。\n閉じ込められた。先に進まないと……。');
    render();
    autoSave();
    return;
  }
  showStory();
}

function turn(delta) {
  if (busy()) return;
  state.dir = (state.dir + delta + 4) % 4;
  render();
  if (!lookTips()) log(`${DIRS[state.dir].name}を向いた。`);
  autoSave();
}

function forwardMove() {
  if (busy()) return;
  const f = front();
  const nx = state.x + f.dx;
  const ny = state.y + f.dy;
  const tile = tileAt(nx, ny);

  if (tile === '#') {
    log('岩壁だ。ここは進めない。\n壁の形を見て、通れる方向を探そう。');
    render();
    return;
  }

  if (tile === 'E' && !state.enemyDefeated) {
    fightEnemy();
    return;
  }

  state.x = nx;
  state.y = ny;

  if (tile === 'P' && !state.potionPicked) {
    state.potionPicked = true;
    state.potions += 1;
    log('回復薬を拾った。\n下の「アイテム」から回復薬を使ってみよう。', 'smile');
  } else if (tile === 'X') {
    clearGame();
  } else {
    render();
    if (!lookTips()) log('湿った通路を進む。');
    autoSave();
    return;
  }

  render();
  autoSave();
}

function lookTips() {
  const c1 = viewCell(1, 0);
  const c2 = viewCell(2, 0);
  const t1 = tileAt(c1.x, c1.y);
  const t2 = tileAt(c2.x, c2.y);

  if (!state.enemyDefeated && !state.seenEnemyTip && (t1 === 'E' || t2 === 'E')) {
    state.seenEnemyTip = true;
    log('敵と遭遇しました。戦いましょう。', 'angry');
    return true;
  }
  if (!state.potionPicked && !state.seenPotionTip && (t1 === 'P' || t2 === 'P')) {
    state.seenPotionTip = true;
    log('アイテムがあります。近づいて拾いましょう。', 'smile');
    return true;
  }
  return false;
}

function fightEnemy() {
  if (state.atk < 12) {
    log('敵と遭遇しました。戦いましょう。\nしかし、今の攻撃力では押し負けてしまった……。', 'angry');
    beginDeathReturn();
    return;
  }
  state.enemyDefeated = true;
  state.hp = Math.max(1, state.hp - 8);
  state.level += 1;
  state.atk += 2;
  state.maxHp += 4;
  log('敵を倒しました。レベルがあがりました。\n攻撃力と最大HPも少し上がりました。', 'smile');
  render();
  autoSave();
}

function beginDeathReturn() {
  state.hp = 0;
  render();
  modalMode = 'death';
  deathStep = 0;
  face('cry');
  setMoveEnabled(false);
  showDeathStep();
}

function showDeathStep() {
  const lines = [
    '50のダメージを受けた。\n死んでしまった……',
    'ここは、、、？',
    '体力がもどっている。\n攻撃力と体力の上限値が上がっている、、、？\nこれは一体、、、',
    '死に戻りすると能力があがりますが、進捗が初めからになります',
  ];
  openOverlay('死に戻り', lines[deathStep], [{ label: deathStep === lines.length - 1 ? '探索に戻る' : 'タップして進む', action: nextDeath, primary: true }], true, false);
}

function nextDeath() {
  deathStep++;
  if (deathStep < 4) {
    showDeathStep();
    return;
  }
  state.deaths += 1;
  state.maxHp = 34 + state.deaths * 20;
  state.atk = 5 + state.deaths * 10;
  state.hp = state.maxHp;
  state.x = 1; state.y = 1; state.dir = 1;
  state.enemyDefeated = false;
  state.potionPicked = false;
  state.potions = 0;
  state.seenEnemyTip = false;
  state.seenPotionTip = false;
  closeOverlay();
  setMoveEnabled(true);
  log('死に戻り地点に戻された。\nもう一度、敵に挑もう。', 'cry');
  render();
  autoSave();
}

function clearGame() {
  state.cleared = true;
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements.includes(a.id) && a.ok(state)) {
      state.achievements.push(a.id);
      unlocked.push(a.name);
    }
  }
  log(`外へ続く風を見つけた。\nチュートリアル踏破！${unlocked.length ? '\n\n実績解除：' + unlocked.join('、') : ''}`, 'smile');
}

function busy() { return Boolean(modalMode) || state.cleared; }

function render() {
  renderHud();
  renderMap();
  renderView();
}

function renderHud() {
  $('hpText').textContent = `${state.hp}/${state.maxHp}`;
  $('atkText').textContent = state.atk;
  $('lvText').textContent = state.level;
  $('potionText').textContent = state.potions;
  $('hpBar').style.width = `${Math.max(0, Math.min(100, state.hp / state.maxHp * 100))}%`;
}

function renderMap() {
  const ctx = $('miniMap').getContext('2d');
  const cell = 18, ox = 3, oy = 3;
  ctx.clearRect(0, 0, 96, 96);
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, 96, 96);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const t = tileAt(x, y), px = ox + x * cell, py = oy + y * cell;
    ctx.fillStyle = t === '#' ? '#111' : '#fff';
    ctx.fillRect(px, py, cell, cell);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, cell, cell);
    if (t === 'E' && !state.enemyDefeated) dot(ctx, px, py, cell, '#8c2f2f');
    if (t === 'P' && !state.potionPicked) dot(ctx, px, py, cell, '#22c52f');
    if (t === 'X') dot(ctx, px, py, cell, '#4169e1');
  }
  const px = ox + state.x * cell + cell / 2, py = oy + state.y * cell + cell / 2;
  const f = front();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + f.dx * 9, py + f.dy * 9); ctx.stroke();
}
function dot(ctx, x, y, cell, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + cell/2, y + cell/2, 4, 0, Math.PI*2); ctx.fill(); }

function renderView() {
  const canvas = $('viewCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  background(ctx, W, H);

  const planes = [
    { x: 0, y: 0, w: W, h: H },
    { x: 42, y: 30, w: 276, h: 200 },
    { x: 96, y: 66, w: 168, h: 128 },
    { x: 134, y: 94, w: 92, h: 76 },
    { x: 160, y: 114, w: 40, h: 38 },
  ];

  drawFog(ctx, planes[4]);

  let frontWall = null;
  for (let d = 1; d <= 4; d++) {
    const c = viewCell(d, 0);
    if (isWall(c.x, c.y)) { frontWall = d; break; }
  }

  for (let seg = 3; seg >= 0; seg--) {
    if (centerBlockedBefore(seg)) continue;
    for (const side of [-1, 1]) {
      const c = viewCell(seg, side);
      if (isWall(c.x, c.y)) drawSideWall(ctx, planes[seg], planes[seg + 1], side, seg);
      else drawOpening(ctx, planes[seg], planes[seg + 1], side);
    }
  }

  drawGuideLines(ctx, planes);
  if (frontWall !== null) drawFrontWall(ctx, planes[frontWall], frontWall);
  drawObjects(frontWall);
}

function background(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2116'); g.addColorStop(.5, '#17130e'); g.addColorStop(1, '#090806');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawFog(ctx, p){ctx.fillStyle='rgba(0,0,0,.58)';ctx.fillRect(p.x,p.y,p.w,p.h)}
function poly(ctx, pts){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);pts.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]));ctx.closePath()}
function drawSideWall(ctx, near, far, side, seg) {
  const pts = side < 0
    ? [[near.x,near.y],[far.x,far.y],[far.x,far.y+far.h],[near.x,near.y+near.h]]
    : [[near.x+near.w,near.y],[far.x+far.w,far.y],[far.x+far.w,far.y+far.h],[near.x+near.w,near.y+near.h]];
  poly(ctx, pts);
  const shade = 126 - seg * 18;
  ctx.fillStyle = `rgb(${shade},${Math.max(72,shade-32)},${Math.max(46,shade-58)})`;
  ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = seg === 0 ? 5 : 3; ctx.stroke();
  drawSideBricks(ctx, pts);
}
function drawOpening(ctx, near, far, side) {
  const pts = side < 0
    ? [[near.x,near.y],[far.x,far.y],[far.x,far.y+far.h],[near.x,near.y+near.h]]
    : [[near.x+near.w,near.y],[far.x+far.w,far.y],[far.x+far.w,far.y+far.h],[near.x+near.w,near.y+near.h]];
  poly(ctx, pts); ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=2; ctx.stroke();
}
function drawFrontWall(ctx, p, depth) {
  const shade = 160 - depth * 22;
  ctx.fillStyle = `rgb(${shade},${Math.max(76,shade-34)},${Math.max(48,shade-62)})`;
  ctx.fillRect(p.x,p.y,p.w,p.h);
  ctx.strokeStyle = '#111'; ctx.lineWidth = depth === 1 ? 5 : 3; ctx.strokeRect(p.x,p.y,p.w,p.h);
  ctx.strokeStyle = 'rgba(0,0,0,.48)'; ctx.lineWidth = Math.max(1, 3 - depth * .3);
  const rows = Math.max(3, 7 - depth), rh = p.h / rows;
  for (let r=1;r<rows;r++){ctx.beginPath();ctx.moveTo(p.x,p.y+r*rh);ctx.lineTo(p.x+p.w,p.y+r*rh);ctx.stroke()}
  for (let r=0;r<rows;r++){const off=r%2?p.w/6:0;for(let x=p.x-off;x<p.x+p.w;x+=p.w/3){ctx.beginPath();ctx.moveTo(x,p.y+r*rh);ctx.lineTo(x,p.y+(r+1)*rh);ctx.stroke()}}
}
function drawSideBricks(ctx, pts) {
  const [a,b,c,d] = pts;
  ctx.strokeStyle='rgba(0,0,0,.38)'; ctx.lineWidth=2;
  for(let i=1;i<5;i++){const t=i/5;const p1=lerp(a,d,t),p2=lerp(b,c,t);ctx.beginPath();ctx.moveTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);ctx.stroke()}
  for(let i=1;i<4;i++){const t=i/4;const p1=lerp(a,b,t),p2=lerp(d,c,t);ctx.beginPath();ctx.moveTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);ctx.stroke()}
}
function drawGuideLines(ctx, planes) {
  ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=2;
  for(const p of planes.slice(1)){ctx.strokeRect(p.x,p.y,p.w,p.h)}
}
function lerp(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}
function drawObjects(frontWall) {
  const el = $('viewObject');
  el.className = 'view-object hidden';
  const found = [];
  for (let d = 1; d <= 3; d++) {
    if (frontWall !== null && d >= frontWall) break;
    const c = viewCell(d, 0), t = tileAt(c.x, c.y);
    if (t === 'E' && !state.enemyDefeated) found.push(['enemy', d]);
    if (t === 'P' && !state.potionPicked) found.push(['potion', d]);
    if (t === 'X') found.push(['exit', d]);
  }
  if (!found.length) return;
  const [type, depth] = found[0];
  el.classList.remove('hidden'); el.classList.add(type);
  const scale = depth === 1 ? 1 : depth === 2 ? .7 : .5;
  el.style.transform = `translateX(-50%) scale(${scale})`;
  el.style.opacity = depth === 1 ? '1' : depth === 2 ? '.86' : '.7';
}

function manualSave() { writeSave(SAVE_MANUAL); log('保存しました。\nこの地点は「読込」で戻れます。'); }
function autoSave() { writeSave(SAVE_AUTO, false); }
function writeSave(key, showMessage) {
  localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), state }));
  if (showMessage === true) log('保存しました。');
}
function readSave(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function loadManual() {
  const data = readSave(SAVE_MANUAL);
  if (!data || !data.state) { log('手動セーブがありません。\n先に「保存」を押してください。'); return; }
  state = normalize(data.state);
  state.loads += 1;
  writeSave(SAVE_MANUAL, false);
  autoSave();
  closeOverlay(); showScreen('gameScreen'); log('手動セーブ地点を読み込みました。'); render();
}
function continueGame() {
  const a = readSave(SAVE_AUTO), m = readSave(SAVE_MANUAL);
  const data = [a,m].filter(Boolean).sort((x,y)=>(y.savedAt||0)-(x.savedAt||0))[0];
  if (!data || !data.state) { showScreen('titleScreen'); return; }
  state = normalize(data.state);
  state.loads += 1;
  autoSave();
  closeOverlay(); showScreen('gameScreen'); log('セーブから再開しました。'); render();
}
function clearAllSaves() { [SAVE_MANUAL,SAVE_AUTO,...SAVE_OLD_KEYS].forEach(k => localStorage.removeItem(k)); }
function resetGame() { clearAllSaves(); state = newState(); startNew(); }

function openItems() {
  if (modalMode) return;
  const actions = [];
  if (state.potions > 0) actions.push({ label: '回復薬を使う', primary: true, action: usePotion });
  openOverlay('アイテム', state.potions > 0 ? `所持アイテム\n\n回復薬 × ${state.potions}\n\nHPを全回復します。` : '所持アイテム\n\nまだ何も持っていません。', actions);
}
function usePotion() {
  if (state.potions <= 0) { closeOverlay(); log('回復薬を持っていない。'); return; }
  if (state.hp >= state.maxHp) { closeOverlay(); log('HPは満タンだ。\n今は使わず温存しよう。'); return; }
  state.potions -= 1; state.hp = state.maxHp;
  closeOverlay(); log('回復薬です。体力が回復しました。', 'smile'); render(); autoSave();
}
function openStatus() {
  if (modalMode) return;
  const ach = state.achievements.length ? state.achievements.map(id => (ACHIEVEMENTS.find(a => a.id === id) || {name:id}).name).join('、') : 'なし';
  openOverlay('ステータス', [
    `HP：${state.hp} / ${state.maxHp}`,
    `攻撃：${state.atk}`,
    `レベル：${state.level}`,
    `回復薬：${state.potions}`,
    `死亡回数：${state.deaths}`,
    `読込回数：${state.loads}`,
    `向き：${DIRS[state.dir].name}`,
    `位置：(${state.x}, ${state.y})`,
    `実績：${ach}`,
  ].join('\n'), []);
}
function openOverlay(title, text, actions = [], dark = false, closeable = true) {
  modalMode = dark ? 'death' : 'menu';
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = text;
  $('overlay').classList.remove('hidden');
  $('overlay').querySelector('.modal').classList.toggle('dark', dark);
  const wrap = $('overlayActions'); wrap.innerHTML = '';
  actions.forEach(a => { const b = document.createElement('button'); b.textContent = a.label; b.className = a.primary ? 'primary' : ''; b.addEventListener('click', a.action); wrap.appendChild(b); });
  $('overlayCloseBtn').classList.toggle('hidden', !closeable);
}
function closeOverlay() { modalMode = null; $('overlay').classList.add('hidden'); $('overlayActions').innerHTML = ''; setMoveEnabled(true); }
function setMoveEnabled(on) { ['leftBtn','forwardBtn','rightBtn','itemBtn','statusBtn','saveBtn','loadBtn','resetBtn'].forEach(id => { const el=$(id); if(el) el.disabled = !on; }); }

function bind() {
  $('newGameBtn').addEventListener('click', startNew);
  $('continueBtn').addEventListener('click', continueGame);
  $('storyNextBtn').addEventListener('click', nextStory);
  $('leftBtn').addEventListener('click', () => turn(-1));
  $('rightBtn').addEventListener('click', () => turn(1));
  $('forwardBtn').addEventListener('click', forwardMove);
  $('itemBtn').addEventListener('click', openItems);
  $('statusBtn').addEventListener('click', openStatus);
  $('saveBtn').addEventListener('click', manualSave);
  $('loadBtn').addEventListener('click', loadManual);
  $('resetBtn').addEventListener('click', resetGame);
  $('overlayCloseBtn').addEventListener('click', closeOverlay);
}

bind();
showScreen('titleScreen');
