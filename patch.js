'use strict';

// Compatibility layer for prototype/v0 save data, inventory, and menus.
(function () {
  const LEGACY_KEY = 'overdeath-dungeon-prototype-v0';
  const AUTO_KEY = 'overdeath-dungeon-prototype-v0:auto';
  const MANUAL_KEY = 'overdeath-dungeon-prototype-v0:manual';
  const SAVE_VERSION = 3;
  const runtime = window.OverDeathPatch = window.OverDeathPatch || { impactPending: false };

  function migrateLegacyState(raw) {
    if (!raw || typeof raw !== 'object' || raw.player || raw.stats) return raw;
    if (!('x' in raw) && !('hp' in raw) && !('deaths' in raw)) return raw;
    return {
      player: { x: raw.x, y: raw.y, dir: raw.dir },
      stats: {
        level: raw.level,
        baseMaxHp: raw.baseMaxHp,
        baseAttack: raw.baseAttack,
        maxHp: raw.maxHp,
        hp: raw.hp,
        attack: raw.attack,
      },
      records: { deaths: raw.deaths, loads: raw.loads },
      progress: {
        enemyDefeated: raw.enemyDefeated,
        potionTaken: raw.potionTaken,
        cleared: raw.cleared,
      },
      tutorial: {
        enemySeen: raw.tutorialEnemySeen,
        potionSeen: raw.tutorialPotionSeen,
        deathReturnSeen: raw.deathReturnSeen,
      },
      achievements: Array.isArray(raw.unlocked) ? raw.unlocked : [],
      inventory: { potions: raw.potions },
    };
  }

  const baseNormalizeState = normalizeState;
  normalizeState = function patchedNormalizeState(raw) {
    const migrated = migrateLegacyState(raw);
    const normalized = baseNormalizeState(migrated);
    normalized.inventory = {
      potions: Math.max(0, Math.floor(Number(migrated?.inventory?.potions) || 0)),
    };
    return normalized;
  };

  function ensurePatchState() {
    if (!state.inventory || typeof state.inventory !== 'object') {
      state.inventory = { potions: 0 };
    }
    state.inventory.potions = Math.max(0, Math.floor(Number(state.inventory.potions) || 0));
  }

  runtime.ensureState = ensurePatchState;

  function writeSave(key, kind, showMessage) {
    ensurePatchState();
    localStorage.setItem(key, JSON.stringify({
      version: SAVE_VERSION,
      kind,
      savedAt: Date.now(),
      state,
    }));
    if (showMessage) {
      setMessage(
        kind === 'manual'
          ? '手動保存した。\nこの場所には「読込」で戻れる。'
          : '保存した。',
        'neutral',
      );
    }
  }

  function readSave(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.state && Number(parsed.version) >= 2) {
        return {
          kind: parsed.kind || (key === MANUAL_KEY ? 'manual' : 'auto'),
          savedAt: Number(parsed.savedAt) || 0,
          state: parsed.state,
        };
      }
      return { kind: 'legacy', savedAt: 0, state: parsed };
    } catch (error) {
      console.error('Failed to read save data:', error);
      return null;
    }
  }

  function findSave(manualOnly) {
    const candidates = manualOnly
      ? [readSave(MANUAL_KEY), readSave(LEGACY_KEY)]
      : [readSave(MANUAL_KEY), readSave(AUTO_KEY), readSave(LEGACY_KEY)];
    return candidates.filter(Boolean).sort((a, b) => b.savedAt - a.savedAt)[0] || null;
  }

  saveGame = function patchedSaveGame(showMessage = true) {
    writeSave(showMessage ? MANUAL_KEY : AUTO_KEY, showMessage ? 'manual' : 'auto', showMessage);
  };

  loadGame = function patchedLoadGame(fromTitle = false) {
    const found = findSave(!fromTitle);
    if (!found) {
      if (fromTitle) setScreen('titleScreen');
      else setMessage('手動セーブデータがない。\n先に「保存」を押しておこう。', 'neutral');
      return false;
    }

    try {
      state = normalizeState(found.state);
      state.records.loads += 1;
      runtime.impactPending = false;
      hideDeathOverlay();
      hideMenu();
      setScreen('gameScreen');
      setMessage(
        found.kind === 'manual'
          ? '手動セーブ地点へ戻った。'
          : '最後の記録から探索を再開した。',
        'neutral',
      );
      render();
      if (found.kind === 'manual') writeSave(MANUAL_KEY, 'manual', false);
      writeSave(AUTO_KEY, 'auto', false);
      return true;
    } catch (error) {
      console.error('Failed to load save data:', error);
      if (!fromTitle) setMessage('セーブデータを読み込めなかった。', 'cry');
      return false;
    }
  };

  resetGame = function patchedResetGame() {
    runtime.impactPending = false;
    hideDeathOverlay();
    hideMenu();
    [MANUAL_KEY, AUTO_KEY, LEGACY_KEY].forEach(key => localStorage.removeItem(key));
    startStory();
  };

  renderHud = function patchedRenderHud() {
    ensurePatchState();
    const { stats, records } = state;
    $('hpText').textContent = `${stats.hp}/${stats.maxHp}`;
    $('attackText').textContent = stats.attack;
    $('levelText').textContent = stats.level;
    $('deathText').textContent = records.deaths;
    $('loadText').textContent = records.loads;
    $('potionText').textContent = state.inventory.potions;
    const ratio = stats.maxHp > 0 ? (stats.hp / stats.maxHp) * 100 : 0;
    $('hpBar').style.width = `${Math.max(0, Math.min(100, ratio))}%`;
  };

  moveTo = function patchedMoveTo(x, y) {
    ensurePatchState();
    const tile = tileAt(x, y);
    state.player.x = x;
    state.player.y = y;

    if (tile === 'P' && !state.progress.potionTaken) {
      state.progress.potionTaken = true;
      state.inventory.potions += 1;
      setMessage('回復薬を拾った。\n下の「アイテム」から使える。', 'smile');
    } else if (tile === 'X') {
      clearGame();
      render();
      saveGame(false);
      return;
    } else {
      render();
      if (!showLookTutorial()) setMessage('足音だけが、湿った通路に残る。', 'neutral');
      saveGame(false);
      return;
    }

    render();
    saveGame(false);
  };

  showLookTutorial = function patchedShowLookTutorial() {
    const front1 = viewCell(1, 0);
    const front2 = viewCell(2, 0);
    const t1 = tileAt(front1.x, front1.y);
    const t2 = tileAt(front2.x, front2.y);
    if (!state.progress.enemyDefeated && !state.tutorial.enemySeen && (t1 === 'E' || t2 === 'E')) {
      state.tutorial.enemySeen = true;
      setMessage('暗がりの奥で、何かがこちらを見ている。', 'angry');
      saveGame(false);
      return true;
    }
    if (!state.progress.potionTaken && !state.tutorial.potionSeen && (t1 === 'P' || t2 === 'P')) {
      state.tutorial.potionSeen = true;
      setMessage('床に小瓶が落ちている。\n近づけば拾えそうだ。', 'smile');
      saveGame(false);
      return true;
    }
    return false;
  };

  setControlsEnabled = function patchedSetControlsEnabled(enabled) {
    [
      'turnLeftButton', 'forwardButton', 'turnRightButton',
      'itemMenuButton', 'statusButton',
      'manualSaveButton', 'manualLoadButton', 'resetButton',
    ].forEach(id => {
      const element = $(id);
      if (element) element.disabled = !enabled;
    });
  };

  function openItemMenu() {
    ensurePatchState();
    if (deathMode || runtime.impactPending) return;
    const count = state.inventory.potions;
    openMenu(
      'アイテム',
      count > 0
        ? `所持アイテム\n\n回復薬 × ${count}\n\n使うとHPが全回復する。`
        : '所持アイテム\n\nまだ何も持っていない。',
      count > 0 ? [{ label: '回復薬を使う', action: usePotion, primary: true }] : [],
    );
  }

  function usePotion() {
    ensurePatchState();
    if (state.inventory.potions <= 0) {
      hideMenu();
      setMessage('回復薬を持っていない。', 'neutral');
      return;
    }
    if (state.stats.hp >= state.stats.maxHp) {
      hideMenu();
      setMessage('傷はない。\n回復薬は取っておこう。', 'neutral');
      return;
    }
    state.inventory.potions -= 1;
    state.stats.hp = state.stats.maxHp;
    hideMenu();
    setMessage('薬の熱が身体に広がり、傷が塞がった。', 'smile');
    render();
    saveGame(false);
  }

  function openStatusMenu() {
    ensurePatchState();
    if (deathMode || runtime.impactPending) return;
    const unlocked = state.achievements.length
      ? state.achievements.map(id => AchievementRules.find(rule => rule.id === id)?.name || id).join('、')
      : 'なし';
    openMenu('ステータス', [
      `HP：${state.stats.hp} / ${state.stats.maxHp}`,
      `攻撃：${state.stats.attack}`,
      `レベル：${state.stats.level}`,
      `死亡回数：${state.records.deaths}`,
      `読込回数：${state.records.loads}`,
      `向き：${DIRS[state.player.dir].name}`,
      `位置：(${state.player.x}, ${state.player.y})`,
      `回復薬：${state.inventory.potions}`,
      `実績：${unlocked}`,
    ].join('\n'), []);
  }

  function openMenu(title, text, actions) {
    const overlay = $('menuOverlay');
    if (!overlay) return;
    $('menuTitle').textContent = title;
    $('menuText').textContent = text;
    const wrap = $('menuActions');
    wrap.innerHTML = '';
    actions.forEach(item => {
      const button = document.createElement('button');
      button.textContent = item.label;
      button.className = item.primary ? 'primary-button' : 'ghost-button';
      button.addEventListener('click', item.action);
      wrap.appendChild(button);
    });
    overlay.classList.remove('hidden');
    runtime.replayAnimation?.(overlay.querySelector('.menu-box'), 'menu-enter');
  }

  function hideMenu() {
    $('menuOverlay')?.classList.add('hidden');
  }

  window.hideMenu = hideMenu;
  $('itemMenuButton')?.addEventListener('click', openItemMenu);
  $('statusButton')?.addEventListener('click', openStatusMenu);
  $('closeMenuButton')?.addEventListener('click', hideMenu);
  $('menuOverlay')?.addEventListener('click', event => {
    if (event.target === $('menuOverlay')) hideMenu();
  });

  ensurePatchState();
  renderHud();
})();
