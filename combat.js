'use strict';

// Centralized combat math for prototype/v0.
// Keep all numerical damage decisions here so the battle system can grow later
// without spreading formulas across UI, effects, and encounter code.
(function () {
  const CombatFormula = {
    version: 1,

    clampNumber(value, fallback = 0) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    },

    calculateDamage({
      attack,
      defense = 0,
      power = 1,
      flatBonus = 0,
      minimum = 1,
      maximum = Number.POSITIVE_INFINITY,
    }) {
      const safeAttack = Math.max(0, this.clampNumber(attack));
      const safeDefense = Math.max(0, this.clampNumber(defense));
      const safePower = Math.max(0, this.clampNumber(power, 1));
      const safeBonus = this.clampNumber(flatBonus);
      const safeMinimum = Math.max(0, Math.floor(this.clampNumber(minimum, 1)));
      const safeMaximum = Math.max(safeMinimum, this.clampNumber(maximum, Number.POSITIVE_INFINITY));

      // Prototype formula:
      // floor((attack × skill power) + flat bonus − defense)
      // Critical hits, elemental affinity, variance, armor penetration, and buffs
      // can be inserted here later without changing battle.fight().
      const rawDamage = Math.floor((safeAttack * safePower) + safeBonus - safeDefense);
      return Math.min(safeMaximum, Math.max(safeMinimum, rawDamage));
    },

    resolveEncounter({ playerStats, enemy }) {
      const playerDamage = this.calculateDamage({
        attack: playerStats.attack,
        defense: enemy.defense,
        power: enemy.playerAttackTakenPower,
        minimum: 1,
      });

      const enemyFatalDamage = this.calculateDamage({
        attack: enemy.attack,
        defense: playerStats.defense,
        power: enemy.fatalAttackPower,
        minimum: 1,
      });

      const enemyCounterDamage = this.calculateDamage({
        attack: enemy.attack,
        defense: playerStats.defense,
        power: enemy.counterAttackPower,
        minimum: 1,
      });

      return {
        playerDamage,
        enemyFatalDamage,
        enemyCounterDamage,
        enemyDefeated: playerDamage >= enemy.hp,
      };
    },
  };

  window.CombatFormula = CombatFormula;

  // Translate the current prototype enemy values into an extensible stat block.
  MapState.enemy.attack = Number(MapState.enemy.attack ?? MapState.enemy.damage ?? 50);
  MapState.enemy.defense = Number(MapState.enemy.defense ?? 0);
  MapState.enemy.playerAttackTakenPower = Number(MapState.enemy.playerAttackTakenPower ?? 1);
  MapState.enemy.fatalAttackPower = Number(MapState.enemy.fatalAttackPower ?? 1);
  MapState.enemy.counterAttackPower = Number(MapState.enemy.counterAttackPower ?? 0.16);

  const baseNormalizeState = normalizeState;
  normalizeState = function combatNormalizeState(raw) {
    const normalized = baseNormalizeState(raw);
    normalized.stats.baseDefense = Math.max(
      0,
      Math.floor(Number(normalized.stats.baseDefense) || 0),
    );
    normalized.stats.defense = Math.max(
      0,
      Math.floor(Number(normalized.stats.defense) || normalized.stats.baseDefense),
    );
    return normalized;
  };

  battle.fight = function calculatedFight(target) {
    const result = CombatFormula.resolveEncounter({
      playerStats: state.stats,
      enemy: MapState.enemy,
    });

    setMessage(
      `魔物へ${result.playerDamage}のダメージを与えた。`,
      'angry',
    );

    if (!result.enemyDefeated) {
      setMessage(
        `魔物へ${result.playerDamage}のダメージ。\nだが、まだ倒れない。反撃が迫る……。`,
        'angry',
      );
      beginDeathReturn(result.enemyFatalDamage);
      return;
    }

    state.progress.enemyDefeated = true;
    state.stats.hp = Math.max(1, state.stats.hp - result.enemyCounterDamage);
    state.stats.level += 1;
    state.stats.attack += 2;
    state.stats.maxHp += 4;
    state.stats.hp = Math.min(state.stats.maxHp, state.stats.hp + 4);
    state.player.x = target.x;
    state.player.y = target.y;

    setMessage(
      `魔物へ${result.playerDamage}のダメージ。\n反撃で${result.enemyCounterDamage}のダメージを受けたが、敵を倒した。\nレベルが上がった。`,
      'smile',
    );
    render();
    saveGame(false);
  };
})();
