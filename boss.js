'use strict';

// Command battle prototype placed in front of the exit.
// Regular encounters keep their compact flow; the boss validates sustained combat,
// skill use, item use, turn exchange, and defeat/retry behavior.
(function () {
  const runtime = window.OverDeathPatch = window.OverDeathPatch || { impactPending: false };
  const BossData = {
    name: '洞窟の主',
    maxHp: 52,
    attack: 18,
    defense: 2,
    skillName: '決死斬り',
    skillPower: 1.55,
    skillBonus: 2,
  };

  let bossActive = false;
  let bossTarget = null;
  let bossHp = BossData.maxHp;
  let skillUsed = false;
  let tutorialStep = 0;
  let actionLocked = false;
  let actionTimer = 0;

  const formula = window.CombatFormula || {
    calculateDamage({ attack, defense = 0, power = 1, flatBonus = 0, minimum = 1 }) {
      return Math.max(minimum, Math.floor((Number(attack) || 0) * power + flatBonus - defense));
    },
  };

  function ensureBossState() {
    if (!state.progress || typeof state.progress !== 'object') state.progress = {};
    if (!state.tutorial || typeof state.tutorial !== 'object') state.tutorial = {};
    state.progress.bossDefeated = Boolean(state.progress.bossDefeated);
    state.tutorial.bossCombatSeen = Boolean(state.tutorial.bossCombatSeen);
    runtime.ensureState?.();
  }

  const baseNormalizeState = normalizeState;
  normalizeState = function bossNormalizeState(raw) {
    const normalized = baseNormalizeState(raw);
    normalized.progress.bossDefeated = Boolean(raw?.progress?.bossDefeated);
    normalized.tutorial.bossCombatSeen = Boolean(raw?.tutorial?.bossCombatSeen);
    return normalized;
  };

  function installBossUi() {
    if ($('bossOverlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <section id="bossOverlay" class="boss-overlay hidden" aria-live="assertive">
        <div class="boss-box">
          <div class="boss-heading"><span>BOSS</span><h2>${BossData.name}</h2></div>
          <div class="boss-visual" aria-label="出口を守るボス"></div>
          <div class="boss-hp-shell" aria-label="ボスHP"><div id="bossHpBar" class="boss-hp-bar"></div></div>
          <p id="bossHpText" class="boss-hp-text"></p>
          <p id="bossTutorialText" class="boss-tutorial"></p>
          <p id="bossBattleLog" class="boss-log"></p>
          <div class="boss-actions">
            <button id="bossAttackButton" class="primary-button">攻撃</button>
            <button id="bossSkillButton" class="ghost-button">スキル</button>
            <button id="bossItemButton" class="ghost-button">アイテム</button>
          </div>
        </div>
      </section>
    `);

    $('bossAttackButton').addEventListener('click', () => chooseAction('attack'));
    $('bossSkillButton').addEventListener('click', () => chooseAction('skill'));
    $('bossItemButton').addEventListener('click', () => chooseAction('item'));
  }

  function setBossLog(message) {
    const log = $('bossBattleLog');
    if (!log) return;
    log.textContent = message;
    runtime.replayAnimation?.(log, 'message-enter');
  }

  function guidedMode() {
    return !state.tutorial.bossCombatSeen;
  }

  function tutorialText() {
    if (!guidedMode()) {
      return '攻撃・スキル・アイテムを選び、HPを保ちながらボスを倒そう。\nスキルは1戦につき1回だけ使える。';
    }
    if (tutorialStep === 0) return 'ボス戦チュートリアル 1/3\nまず「攻撃」。通常攻撃で、与えるダメージと反撃を確認しよう。';
    if (tutorialStep === 1) return `ボス戦チュートリアル 2/3\n次は「スキル」。${BossData.skillName}は高威力だが、1戦につき1回だけ。`;
    if (tutorialStep === 2) return 'ボス戦チュートリアル 3/3\nHPが減った。今度は「アイテム」で回復しよう。アイテム使用中も敵は行動する。';
    return '基本操作は完了。\n残ったHPと行動を見て、最後の一撃を選ぼう。';
  }

  function renderBoss() {
    ensureBossState();
    const ratio = Math.max(0, Math.min(100, (bossHp / BossData.maxHp) * 100));
    $('bossHpBar').style.width = `${ratio}%`;
    $('bossHpText').textContent = `HP ${Math.max(0, bossHp)} / ${BossData.maxHp}`;
    $('bossTutorialText').textContent = tutorialText();
    $('bossItemButton').textContent = `アイテム (${state.inventory.potions})`;
    $('bossSkillButton').textContent = skillUsed ? 'スキル済' : 'スキル';

    const required = guidedMode() ? ['attack', 'skill', 'item'][tutorialStep] : null;
    const buttons = {
      attack: $('bossAttackButton'),
      skill: $('bossSkillButton'),
      item: $('bossItemButton'),
    };

    Object.entries(buttons).forEach(([type, button]) => {
      button.classList.toggle('tutorial-focus', required === type && !actionLocked);
      const blockedByTutorial = required !== null && required !== type;
      const unavailable = (type === 'skill' && skillUsed)
        || (type === 'item' && state.inventory.potions <= 0);
      button.disabled = actionLocked || blockedByTutorial || unavailable;
    });
  }

  function startBossBattle(target) {
    if (bossActive || deathMode || runtime.impactPending) return;
    ensureBossState();
    installBossUi();

    bossActive = true;
    bossTarget = target;
    bossHp = BossData.maxHp;
    skillUsed = false;
    actionLocked = false;
    tutorialStep = state.tutorial.bossCombatSeen ? 3 : 0;

    if (!state.tutorial.bossCombatSeen && state.inventory.potions <= 0) {
      state.inventory.potions = 1;
      setBossLog('足元に残っていた回復薬を拾った。\nチュートリアル用として1個確保した。');
    } else {
      setBossLog(`${BossData.name}が出口を塞いだ。\n長い戦いになりそうだ。`);
    }

    window.hideMenu?.();
    setControlsEnabled(false);
    setMessage('出口の前で、巨大な魔物が立ち上がった。\nここを抜けるには、倒すしかない。', 'angry');
    $('bossOverlay').classList.remove('hidden');
    runtime.replayAnimation?.(document.querySelector('.boss-box'), 'menu-enter');
    renderHud();
    renderBoss();
  }

  function actionAllowed(type) {
    if (!bossActive || actionLocked) return false;
    if (guidedMode()) {
      const required = ['attack', 'skill', 'item'][tutorialStep];
      if (required && required !== type) return false;
    }
    if (type === 'skill' && skillUsed) return false;
    if (type === 'item' && state.inventory.potions <= 0) return false;
    return true;
  }

  function chooseAction(type) {
    if (!actionAllowed(type)) return;
    actionLocked = true;

    if (type === 'item') {
      state.inventory.potions -= 1;
      const recovered = state.stats.maxHp - state.stats.hp;
      state.stats.hp = state.stats.maxHp;
      setBossLog(`回復薬を使い、HPを${recovered}回復した。`);
      renderHud();
      renderBoss();
      queueCounter(type);
      return;
    }

    const power = type === 'skill' ? BossData.skillPower : 1;
    const flatBonus = type === 'skill' ? BossData.skillBonus : 0;
    const damage = formula.calculateDamage({
      attack: state.stats.attack,
      defense: BossData.defense,
      power,
      flatBonus,
      minimum: 1,
    });

    if (type === 'skill') skillUsed = true;
    bossHp = Math.max(0, bossHp - damage);
    setBossLog(type === 'skill'
      ? `${BossData.skillName}！\n${BossData.name}へ${damage}のダメージ。`
      : `${BossData.name}へ${damage}のダメージ。`);
    renderBoss();

    if (bossHp <= 0) {
      clearTimeout(actionTimer);
      actionTimer = setTimeout(winBossBattle, 520);
      return;
    }
    queueCounter(type);
  }

  function queueCounter(playerAction) {
    clearTimeout(actionTimer);
    actionTimer = setTimeout(() => enemyCounter(playerAction), 430);
  }

  function advanceTutorial(playerAction) {
    if (!guidedMode()) return;
    if (tutorialStep === 0 && playerAction === 'attack') tutorialStep = 1;
    else if (tutorialStep === 1 && playerAction === 'skill') tutorialStep = 2;
    else if (tutorialStep === 2 && playerAction === 'item') {
      tutorialStep = 3;
      state.tutorial.bossCombatSeen = true;
    }
  }

  function enemyCounter(playerAction) {
    const damage = formula.calculateDamage({
      attack: BossData.attack,
      defense: state.stats.defense || 0,
      power: 1,
      minimum: 1,
    });
    state.stats.hp = Math.max(0, state.stats.hp - damage);
    renderHud();

    if (state.stats.hp <= 0) {
      loseBossBattle(damage);
      return;
    }

    runtime.triggerHit?.(true);
    advanceTutorial(playerAction);
    setBossLog(`${BossData.name}の反撃。\n${damage}のダメージを受けた。`);
    actionLocked = false;
    renderBoss();
  }

  function loseBossBattle(damage) {
    clearTimeout(actionTimer);
    bossActive = false;
    bossTarget = null;
    actionLocked = false;
    $('bossOverlay').classList.add('hidden');
    beginDeathReturn(damage);
  }

  function winBossBattle() {
    clearTimeout(actionTimer);
    ensureBossState();
    state.progress.bossDefeated = true;
    state.tutorial.bossCombatSeen = true;
    if (bossTarget) {
      state.player.x = bossTarget.x;
      state.player.y = bossTarget.y;
    }

    bossActive = false;
    bossTarget = null;
    actionLocked = false;
    $('bossOverlay').classList.add('hidden');
    setControlsEnabled(true);
    clearGame();
    render();
    saveGame(false);
  }

  const baseIsBusy = isBusy;
  isBusy = function bossIsBusy() {
    return bossActive || baseIsBusy();
  };

  const baseMoveTo = moveTo;
  moveTo = function bossMoveTo(x, y) {
    ensureBossState();
    if (tileAt(x, y) === 'X' && !state.progress.bossDefeated) {
      startBossBattle({ x, y });
      return;
    }
    baseMoveTo(x, y);
  };

  const baseDrawViewSprite = drawViewSprite;
  drawViewSprite = function bossDrawViewSprite(frontBlockedDepth) {
    baseDrawViewSprite(frontBlockedDepth);
    ensureBossState();
    const sprite = $('viewSprite');
    if (!state.progress.bossDefeated && sprite.classList.contains('exit')) {
      sprite.classList.remove('exit');
      sprite.classList.add('boss');
    }
  };

  const baseApplyDeathReturn = applyDeathReturn;
  applyDeathReturn = function bossApplyDeathReturn() {
    clearTimeout(actionTimer);
    bossActive = false;
    bossTarget = null;
    bossHp = BossData.maxHp;
    skillUsed = false;
    actionLocked = false;
    $('bossOverlay')?.classList.add('hidden');
    baseApplyDeathReturn();
    ensureBossState();
    state.progress.bossDefeated = false;
  };

  runtime.boss = {
    isActive: () => bossActive,
    data: BossData,
  };

  installBossUi();
  ensureBossState();
})();
