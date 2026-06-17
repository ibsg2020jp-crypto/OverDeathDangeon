'use strict';

// prototype/v0 hotfix layer.
// Keep this file small: it fixes save/load behavior and adds item/status menus
// without disturbing the already-working dungeon prototype.
(function () {
  const LEGACY_KEY = 'overdeath-dungeon-prototype-v0';
  const AUTO_KEY = 'overdeath-dungeon-prototype-v0:auto';
  const MANUAL_KEY = 'overdeath-dungeon-prototype-v0:manual';

  function ensurePatchState() {
    if (!state) return;
    if (!Number.isFinite(Number(state.potions))) state.potions = 0;
    state.potions = Math.max(0, Math.floor(Number(state.potions) || 0));
    if (!Object.prototype.hasOwnProperty.call(state, 'tutorialPotionUseSeen')) {
      state.tutorialPotionUseSeen = false;
    }
  }

  function writeSave(key, kind, showMessage) {
    ensurePatchState();
    localStorage.setItem(key, JSON.stringify({
      version: 2,
      kind,
      savedAt: Date.now(),
      state,
    }));

    if (showMessage) {
      setMessage(kind === 'manual'
        ? '手動保存しました。\nこの場所は「読込」で戻れます。'
        : '保存しました。', 'neutral');
    }
  }

  save = function patchedSave(showMessage = true) {
    writeSave(showMessage ? MANUAL_KEY : AUTO_KEY, showMessage ? 'manual' : 'auto', showMessage);
  };

  function readSave(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 2 && parsed.state) {
        return {
          key,
          kind: parsed.kind || (key === MANUAL_KEY ? 'manual' : 'auto'),
          savedAt: Number(parsed.savedAt) || 0,
          state: parsed.state,
        };
      }
      return { key, kind: 'legacy', savedAt: 0, state: parsed };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function findSave(mode) {
    const candidates = mode === 'manual'
      ? [readSave(MANUAL_KEY), readSave(LEGACY_KEY)]
      : [readSave(MANUAL_KEY), readSave(AUTO_KEY), readSave(LEGACY_KEY)];

    return candidates
      .filter(Boolean)
      .sort((a, b) => b.savedAt - a.savedAt)[0] || null;
  }

  loadGame = function patchedLoadGame(fromTitle = false) {
    const mode = fromTitle ? 'best' : 'manual';
    const found = findSave(mode);

    if (!found) {
      if (fromTitle) {
        show('titleScreen');
      } else {
        setMessage('手動セーブデータがありません。\nまず「保存」を押してください。', 'neutral');
      }
      return false;
    }

    try {
      state = normalizeState(found.state);
      ensurePatchState();
      state.loads += 1;
      hideDeathOverlay();
      hideMenu();
      show('gameScreen');
      setMessage(found.kind === 'manual'
        ? '手動セーブ地点を読み込みました。'
        : 'セーブデータを読み込みました。', 'neutral');
      render();
      if (found.kind === 'manual') writeSave(MANUAL_KEY, 'manual', false);
      writeSave(AUTO_KEY, 'auto', false);
      return true;
    } catch (error) {
      console.error(error);
      if (!fromTitle) setMessage('セーブデータが壊れているようです。', 'cry');
      return false;
    }
  };

  resetGame = function patchedResetGame() {
    state = makeNewState();
    ensurePatchState();
    hideDeathOverlay();
    hideMenu();
    localStorage.removeItem(MANUAL_KEY);
    localStorage.removeItem(AUTO_KEY);
    localStorage.removeItem(LEGACY_KEY);
    startStory();
  };

  renderHud = function patchedRenderHud() {
    ensurePatchState();
    $('hpText').textContent = `${state.hp}/${state.maxHp}`;
    $('attackText').textContent = state.attack;
    $('levelText').textContent = state.level;
    $('deathText').textContent = state.deaths;
    $('loadText').textContent = state.loads;
    const potionText = $('potionText');
    if (potionText) potionText.textContent = state.potions;

    const hpRatio = state.maxHp > 0 ? (state.hp / state.maxHp) * 100 : 0;
    $('hpBar').style.width = `${Math.max(0, Math.min(100, hpRatio))}%`;
  };

  moveTo = function patchedMoveTo(x, y) {
    ensurePatchState();
    const tile = tileAt(x, y);
    state.x = x;
    state.y = y;

    if (tile === 'P' && !state.potionTaken) {
      state.potionTaken = true;
      state.potions += 1;
      state.tutorialPotionUseSeen = true;
      setMessage('回復薬を拾った。\n下の「アイテム」ボタンから使ってみよう。', 'smile');
    } else if (tile === 'X') {
      clearGame();
      render();
      save(false);
      return;
    } else {
      render();
      if (!maybeShowLookTutorial()) setMessage('湿った通路を進む。', 'neutral');
      save(false);
      return;
    }

    render();
    save(false);
  };

  maybeShowLookTutorial = function patchedMaybeShowLookTutorial() {
    const front1 = forwardCell(1);
    const front2 = forwardCell(2);
    const t1 = tileAt(front1.x, front1.y);
    const t2 = tileAt(front2.x, front2.y);

    if (!state.enemyDefeated && (t1 === 'E' || t2 === 'E') && !state.tutorialEnemySeen) {
      state.tutorialEnemySeen = true;
      setMessage('敵と遭遇しました。戦いましょう。', 'angry');
      save(false);
      return true;
    }
    if (!state.potionTaken && (t1 === 'P' || t2 === 'P') && !state.tutorialPotionSeen) {
      state.tutorialPotionSeen = true;
      setMessage('アイテムがあります。近づいて拾いましょう。', 'smile');
      save(false);
      return true;
    }
    return false;
  };

  const originalBeginDeathReturn = beginDeathReturn;
  beginDeathReturn = function patchedBeginDeathReturn(damage = 50) {
    ensurePatchState();
    state.potions = 0;
    originalBeginDeathReturn(damage);
  };

  setControlsEnabled = function patchedSetControlsEnabled(enabled) {
    const ids = [
      'turnLeftButton', 'forwardButton', 'turnRightButton',
      'itemMenuButton', 'statusButton',
      'manualSaveButton', 'manualLoadButton', 'resetButton',
    ];
    ids.forEach(id => {
      const el = $(id);
      if (el) el.disabled = !enabled;
    });
  };

  function openItemMenu() {
    ensurePatchState();
    if (isDeathOverlayOpen()) return;

    const text = state.potions > 0
      ? `所持アイテム\n\n回復薬 × ${state.potions}\n\n使うとHPが全回復します。`
      : '所持アイテム\n\nまだアイテムを持っていません。';

    openMenu('アイテム', text, state.potions > 0 ? [{
      label: '回復薬を使う',
      action: usePotion,
      primary: true,
    }] : []);
  }

  function usePotion() {
    ensurePatchState();
    if (state.potions <= 0) {
      hideMenu();
      setMessage('回復薬を持っていない。', 'neutral');
      return;
    }
    if (state.hp >= state.maxHp) {
      hideMenu();
      setMessage('今はHPが満タンだ。\n回復薬は温存しておこう。', 'neutral');
      return;
    }

    state.potions -= 1;
    state.hp = state.maxHp;
    hideMenu();
    setMessage('回復薬です。体力が回復しました。', 'smile');
    render();
    save(false);
  }

  function openStatusMenu() {
    ensurePatchState();
    if (isDeathOverlayOpen()) return;
    const dirName = DIRS[state.dir].name;
    const unlocked = Array.isArray(state.unlocked) && state.unlocked.length > 0
      ? state.unlocked.map(id => (achievements.find(a => a.id === id) || {}).name || id).join('、')
      : 'なし';

    openMenu('ステータス', [
      `HP：${state.hp} / ${state.maxHp}`,
      `攻撃：${state.attack}`,
      `レベル：${state.level}`,
      `死亡回数：${state.deaths}`,
      `読込回数：${state.loads}`,
      `向き：${dirName}`,
      `位置：(${state.x}, ${state.y})`,
      `回復薬：${state.potions}`,
      `実績：${unlocked}`,
    ].join('\n'), []);
  }

  function openMenu(title, text, actions) {
    const overlay = $('menuOverlay');
    if (!overlay) return;

    $('menuTitle').textContent = title;
    $('menuText').textContent = text;

    const actionsWrap = $('menuActions');
    actionsWrap.innerHTML = '';
    actions.forEach(item => {
      const button = document.createElement('button');
      button.textContent = item.label;
      button.className = item.primary ? 'primary-button' : 'ghost-button';
      button.addEventListener('click', item.action);
      actionsWrap.appendChild(button);
    });

    overlay.classList.remove('hidden');
  }

  function hideMenu() {
    const overlay = $('menuOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  window.hideMenu = hideMenu;

  function bindPatchEvents() {
    const itemButton = $('itemMenuButton');
    const statusButton = $('statusButton');
    const closeButton = $('closeMenuButton');
    const overlay = $('menuOverlay');

    if (itemButton) itemButton.addEventListener('click', openItemMenu);
    if (statusButton) statusButton.addEventListener('click', openStatusMenu);
    if (closeButton) closeButton.addEventListener('click', hideMenu);
    if (overlay) {
      overlay.addEventListener('click', event => {
        if (event.target === overlay) hideMenu();
      });
    }
  }

  ensurePatchState();
  bindPatchEvents();
  renderHud();
})();
