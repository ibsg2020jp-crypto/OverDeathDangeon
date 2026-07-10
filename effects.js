'use strict';

// Hit feedback and slower narrative beats for prototype/v0.
(function () {
  const runtime = window.OverDeathPatch = window.OverDeathPatch || { impactPending: false };
  const EFFECT_MS = 560;
  let effectTimer = 0;

  function installStyles() {
    const style = document.createElement('style');
    style.id = 'prototypeV0Effects';
    style.textContent = `
      body::after{content:"";position:fixed;inset:0;z-index:2000;pointer-events:none;opacity:0;background:radial-gradient(circle,rgba(255,255,255,.8),rgba(198,0,0,.72) 52%,rgba(60,0,0,.9))}
      body.damage-flash::after{animation:od-flash ${EFFECT_MS}ms ease-out both}body.damage-flash-light::after{animation:od-flash-light ${EFFECT_MS}ms ease-out both}
      .phone-shell.damage-shake{animation:od-shake ${EFFECT_MS}ms cubic-bezier(.36,.07,.19,.97) both}.phone-shell.damage-shake-light{animation:od-shake-light ${EFFECT_MS}ms ease-out both}
      .message-enter{animation:od-enter 240ms ease-out both}.portrait-enter{animation:od-portrait 280ms ease-out both}.death-text-enter{animation:od-death 420ms ease-out both}.menu-enter{animation:od-menu 180ms ease-out both}
      @keyframes od-flash{0%{opacity:0}8%{opacity:.92}24%{opacity:.3}38%{opacity:.7}100%{opacity:0}}@keyframes od-flash-light{0%{opacity:0}12%{opacity:.55}100%{opacity:0}}
      @keyframes od-shake{0%,100%{transform:translate3d(0,0,0)}12%{transform:translate3d(-9px,3px,0) rotate(-.7deg)}24%{transform:translate3d(8px,-4px,0) rotate(.65deg)}36%{transform:translate3d(-7px,-2px,0) rotate(-.45deg)}50%{transform:translate3d(6px,3px,0) rotate(.35deg)}66%{transform:translate3d(-4px,1px,0)}82%{transform:translate3d(2px,-1px,0)}}
      @keyframes od-shake-light{0%,100%{transform:none}20%{transform:translate(-4px,1px)}42%{transform:translate(4px,-1px)}65%{transform:translate(-2px,0)}}
      @keyframes od-enter{from{opacity:.25;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes od-portrait{from{opacity:.45;transform:scale(.985)}to{opacity:1;transform:none}}@keyframes od-death{from{opacity:0;filter:blur(3px);transform:translateY(8px)}to{opacity:1;filter:none;transform:none}}@keyframes od-menu{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
      @media(prefers-reduced-motion:reduce){.phone-shell.damage-shake,.phone-shell.damage-shake-light,.message-enter,.portrait-enter,.death-text-enter,.menu-enter{animation:none!important}body.damage-flash::after,body.damage-flash-light::after{animation-duration:180ms}}
    `;
    document.head.appendChild(style);
  }

  function replay(element, className) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  runtime.replayAnimation = replay;

  const baseSetMessage = setMessage;
  setMessage = function patchedSetMessage(message, face = 'neutral') {
    baseSetMessage(message, face);
    replay($('messageText'), 'message-enter');
  };

  const baseRenderStoryLine = renderStoryLine;
  renderStoryLine = function patchedRenderStoryLine() {
    baseRenderStoryLine();
    replay($('storyText'), 'message-enter');
    replay($('storyVisual'), 'portrait-enter');
  };

  const baseIsBusy = isBusy;
  isBusy = function patchedIsBusy() {
    return runtime.impactPending || baseIsBusy();
  };

  function triggerHit(light = false) {
    const shell = document.querySelector('.phone-shell');
    if (!shell) return;
    clearTimeout(effectTimer);
    shell.classList.remove('damage-shake', 'damage-shake-light');
    document.body.classList.remove('damage-flash', 'damage-flash-light');
    void shell.offsetWidth;
    shell.classList.add(light ? 'damage-shake-light' : 'damage-shake');
    document.body.classList.add(light ? 'damage-flash-light' : 'damage-flash');
    effectTimer = setTimeout(() => {
      shell.classList.remove('damage-shake', 'damage-shake-light');
      document.body.classList.remove('damage-flash', 'damage-flash-light');
    }, EFFECT_MS);
  }

  runtime.triggerHit = triggerHit;

  const baseBeginDeathReturn = beginDeathReturn;
  beginDeathReturn = function patchedBeginDeathReturn(damage = MapState.enemy.damage) {
    runtime.ensureState?.();
    if (runtime.impactPending || deathMode) return;
    runtime.impactPending = true;
    state.inventory.potions = 0;
    setControlsEnabled(false);
    setMessage(`魔物の一撃が身体を貫いた。\n${damage}のダメージ。`, 'cry');
    triggerHit(false);

    setTimeout(() => {
      runtime.impactPending = false;
      baseBeginDeathReturn(damage);
      deathStepIndex = 0;
      deathSequence = [
        `${damage}のダメージ。\n視界が赤く弾け、膝から力が抜ける。`,
        '音が、遠のいていく。\n\n……死んだ、はずだった。',
        '冷たい石床の感触。\n目を開けると、洞窟の入口に戻っていた。',
        '傷は消えている。\n身体の奥に、以前より強い力が息づいている。',
        '死を越えるたび、身体は強くなる。\nただし、倒した敵や拾った物は失われる。',
      ];
      showDeathStep();
    }, 680);
  };

  const baseShowDeathStep = showDeathStep;
  showDeathStep = function patchedShowDeathStep() {
    baseShowDeathStep();
    replay($('deathOverlayText'), 'death-text-enter');
  };

  const baseApplyDeathReturn = applyDeathReturn;
  applyDeathReturn = function patchedApplyDeathReturn() {
    baseApplyDeathReturn();
    setMessage('静寂が戻った。\n今度は、あの一撃を越えられる。', 'neutral');
  };

  const baseFight = battle.fight.bind(battle);
  battle.fight = function patchedFight(target) {
    const hpBefore = state.stats.hp;
    baseFight(target);
    if (state.progress.enemyDefeated && state.stats.hp < hpBefore) triggerHit(true);
  };

  clearGame = function patchedClearGame() {
    state.progress.cleared = true;
    const unlocked = unlockAchievements();
    const suffix = unlocked.length ? `\n\n実績解除：${unlocked.join('、')}` : '';
    setMessage(
      `頬を、洞窟の外から来た風が撫でた。\n振り返ると、暗闇はもう追ってこない。\n\nチュートリアル踏破。${suffix}`,
      state.records.deaths === 0 ? 'smile' : 'neutral',
    );
  };

  installStyles();
})();
