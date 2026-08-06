import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { Db, type PersistenceStatus } from '../db/sqlite';
import { resetState, saveState } from '../db/repository';
import { maxHpOf, cycleKey, statusOf, todayShort, isElite, isAwake, dayKey, recordActiveDay, streakFrom, ELITE_COIN_MULT } from '../game/logic';
import { FIGHTER_COLORS, SPRITE_POOL, sumDamage } from '../game/seed';
import { STRINGS } from '../game/i18n';
import { AudioEngine, buzz } from './audio';
import { mayActAsFighter, mayManageHousehold, useOnline } from '../online/OnlineContext';
import { isVoucherId, voucherId } from '../online/syncQueue';
import { createBootstrapSnapshot, serverSyncToGameState } from '../online/gameSync';
import type { SyncMutationType } from '../online/api';
import type {
  Boss, Chore, Fighter, GameState, RewardDef, Settings, Tab, Trigger,
} from '../game/types';

export interface DmgNum {
  id: number;
  label: string;
  crit: boolean;
  x: number;
}

export interface Ping {
  fighterId: string;
  id: number;
}

export interface ConfettiPiece {
  id: number;
  color: string;
  left: number;
  dur: number;
  delay: number;
  w: number;
  h: number;
}

type Phase = 'splash' | 'onboarding' | 'app';

export interface UiState {
  tab: Tab;
  phase: Phase;
  intro: boolean;
  won: boolean;
  dying: boolean;
  combo: number;
  dmgNums: DmgNum[];
  ping: Ping | null;
  toast: string | null;
  editingChores: boolean;
  editBossId: string | null;
  editBosses: boolean;
  editParty: boolean;
  settingsOpen: boolean;
  confirmReset: boolean;
  obStep: number;
  lastRewardTotal: number;
}

export interface AppState {
  game: GameState;
  ui: UiState;
}

const CONFETTI_COLORS = ['#F4B942', '#E0564A', '#67D391', '#5B9BE8', '#B57BE0', '#F6EBDD'];

function initialUi(): UiState {
  return {
    tab: 'battle',
    phase: 'splash',
    intro: true,
    won: false,
    dying: false,
    combo: 0,
    dmgNums: [],
    ping: null,
    toast: null,
    editingChores: false,
    editBossId: null,
    editBosses: false,
    editParty: false,
    settingsOpen: false,
    confirmReset: false,
    obStep: 0,
    lastRewardTotal: 0,
  };
}

export interface GameActions {
  replaceGame(game: GameState): void;
  go(tab: Tab): void;
  startFight(): void;
  doAttack(index: number): void;
  reset(): void;
  enterBoss(id: string): void;
  fightAgain(id: string): void;
  selectFighter(id: string): void;
  dismissSplash(): void;
  obNext(): void;
  obPrev(): void;
  finishOnboarding(): void;
  replayOnboarding(): void;
  playLocally(): void;
  openSettings(): void;
  closeSettings(): void;
  setSetting<K extends keyof Settings>(key: K, val: Settings[K]): void;
  askReset(): void;
  cancelReset(): void;
  doReset(): void;
  openPartyManager(): void;
  closePartyManager(): void;
  editFighter(id: string, patch: Partial<Fighter>): void;
  ensureAccountFighter(userId: string, displayName: string): void;
  addFighter(): void;
  deleteFighter(id: string): void;
  setAvatarFile(id: string, file: File): void;
  clearAvatar(id: string): void;
  openBossManager(): void;
  closeBossManager(): void;
  editBoss(id: string, patch: Partial<Pick<Boss, 'name' | 'sprite'>>): void;
  setTrigger(id: string, patch: Partial<Trigger>): void;
  cycleSprite(id: string): void;
  toggleDormant(id: string): void;
  addBoss(): void;
  deleteBoss(id: string): void;
  openEditChores(id?: string): void;
  addChore(): void;
  editChore(index: number, patch: Partial<Chore>): void;
  deleteChore(index: number): void;
  finishEditChores(): void;
  redeemPersonal(r: RewardDef): void;
  redeemGroup(r: RewardDef): void;
  transfer(amount: number | 'all'): void;
  useVoucher(vid: string): void;
  retrySave(): void;
  downloadBackup(): void;
  setStageRef(el: HTMLElement | null): void;
  setSpriteRef(el: HTMLElement | null): void;
  setFlashRef(el: HTMLElement | null): void;
}

interface GameContextValue {
  state: AppState;
  actions: GameActions;
  confetti: ConfettiPiece[];
  persistence: PersistenceStatus;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within <GameProvider>');
  return ctx;
}

export function GameProvider({ db, initial, children }: { db: Db; initial: GameState; children: ReactNode }) {
  const online = useOnline();
  const [state, setState] = useState<AppState>(() => ({ game: initial, ui: initialUi() }));
  const [persistence, setPersistence] = useState<PersistenceStatus>(() => db.persistenceStatus());

  // Refs to always read the latest state inside timers/closures.
  const stateRef = useRef(state);
  stateRef.current = state;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const configurationSignature = useRef<string | null>(null);

  const audio = useRef(new AudioEngine()).current;
  const confetti = useRef<ConfettiPiece[]>([]);
  const pingSeq = useRef(0);
  const stageEl = useRef<HTMLElement | null>(null);
  const spriteEl = useRef<HTMLElement | null>(null);
  const flashEl = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  audio.setEnabled(state.game.settings.sound);

  useEffect(() => db.subscribePersistence(setPersistence), [db]);

  // Debounced persistence whenever the durable game slice changes.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const result = saveState(db, stateRef.current.game);
      if (!result.ok) console.warn('[store] save failed', result.error);
    }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [db, state.game]);

  // Once connected, configuration edits are local-first but no longer local-only.
  // A compact signature prevents battle HP/log changes from uploading the whole
  // configuration, while a debounce coalesces typing into one atomic replace.
  useEffect(() => {
    if (!online.state.householdId || !online.state.configurationConnectedAt
      || (online.state.role !== 'owner' && online.state.role !== 'parent')) {
      configurationSignature.current = null;
      return;
    }
    const signature = gameConfigurationSignature(state.game);
    if (configurationSignature.current === null) {
      configurationSignature.current = signature;
      return;
    }
    if (configurationSignature.current === signature) return;
    configurationSignature.current = signature;
    const timer = setTimeout(() => {
      const game = stateRef.current.game;
      void createBootstrapSnapshot(game)
        .then((snapshot) => {
          onlineRef.current.actions.enqueueMutation('configuration_replace', snapshot as unknown as Record<string, unknown>);
          return onlineRef.current.actions.flushMutations();
        })
        .then((sync) => {
          if (!sync) return;
          const next = serverSyncToGameState(sync, stateRef.current.game);
          configurationSignature.current = gameConfigurationSignature(next);
          setState((current) => ({ ...current, game: next }));
        })
        .catch((error) => {
          if (!(error instanceof Error && error.message === 'fighter_name_required')) {
            console.warn('[sync] configuration upload deferred', error);
          }
        });
    }, 750);
    return () => clearTimeout(timer);
  }, [online.state.configurationConnectedAt, online.state.householdId, state.game]);

  // On mount: roll over any bosses whose cycle has elapsed, and dismiss splash.
  useEffect(() => {
    setState((s) => ({ ...s, game: rolloverCycles(s.game) }));
    const t = setTimeout(() => {
      setState((s) => (s.ui.phase === 'splash'
        ? { ...s, ui: { ...s.ui, phase: s.game.onboarded ? 'app' : 'onboarding' } }
        : s));
    }, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions = useMemo<GameActions>(() => {
    const patchGame = (fn: (g: GameState) => GameState) =>
      setState((s) => ({ ...s, game: fn(s.game) }));
    const patchUi = (fn: (u: UiState) => UiState) =>
      setState((s) => ({ ...s, ui: fn(s.ui) }));

    const currentBoss = (g: GameState): Boss =>
      g.bosses.find((b) => b.id === g.currentBossId) ?? g.bosses[0];

    const flash = (msg: string) => {
      patchUi((u) => ({ ...u, toast: msg }));
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => patchUi((u) => ({ ...u, toast: null })), 2200);
    };

    const reduce = () => stateRef.current.game.settings.reducedMotion;

    /**
     * Returns the queued mutation's id, or null when the household is local-only or
     * the mutation could not be queued. The server uses that id as the primary key of
     * the row the mutation creates, so callers that also build an optimistic local
     * record adopt it as the record's id rather than inventing their own.
     */
    const queueMutation = (type: SyncMutationType, payload: Record<string, unknown>): string | null => {
      if (!onlineRef.current.state.configurationConnectedAt) return null;
      try {
        const id = onlineRef.current.actions.enqueueMutation(type, payload);
        window.setTimeout(() => void onlineRef.current.actions.flushMutations().catch(() => undefined), 0);
        return id;
      } catch (error) {
        console.warn('[sync] mutation queue failed', error);
        return null;
      }
    };

    const hitFx = (crit: boolean) => {
      if (reduce()) return;
      const dx = crit ? 14 : 8;
      stageEl.current?.animate?.(
        [
          { transform: 'translate(0,0)' },
          { transform: `translate(${dx}px,-2px)` },
          { transform: `translate(-${dx}px,2px)` },
          { transform: `translate(${dx * 0.6}px,0)` },
          { transform: 'translate(0,0)' },
        ],
        { duration: crit ? 420 : 280, easing: 'ease-out' },
      );
      spriteEl.current?.animate?.(
        [{ filter: 'brightness(4) saturate(0.2)' }, { filter: 'brightness(1)' }],
        { duration: 300, easing: 'ease-out' },
      );
    };

    const bossDeath = () => {
      flashEl.current?.animate?.(
        [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 0 }],
        { duration: 820, easing: 'ease-out' },
      );
      if (reduce()) return;
      stageEl.current?.animate?.(
        [
          { transform: 'translate(0,0)' }, { transform: 'translate(-11px,3px)' },
          { transform: 'translate(11px,-3px)' }, { transform: 'translate(-8px,2px)' },
          { transform: 'translate(6px,-1px)' }, { transform: 'translate(0,0)' },
        ],
        { duration: 620, easing: 'ease-out' },
      );
      spriteEl.current?.animate?.(
        [
          { transform: 'rotate(0) scale(1) translateY(0)', filter: 'brightness(1) blur(0)', opacity: 1 },
          { transform: 'rotate(-4deg) scale(1.06) translateY(-4px)', filter: 'brightness(3.6) saturate(.2)', opacity: 1, offset: 0.16 },
          { transform: 'rotate(4deg) scale(1.04) translateY(0)', filter: 'brightness(1) saturate(1)', opacity: 1, offset: 0.32 },
          { transform: 'rotate(-3deg) scale(1.02)', filter: 'brightness(4) saturate(.1)', opacity: 1, offset: 0.46 },
          { transform: 'rotate(2deg) scale(1) translateY(2px)', filter: 'brightness(1)', opacity: 1, offset: 0.56 },
          { transform: 'rotate(26deg) scale(.48) translateY(140px)', filter: 'brightness(0) blur(6px)', opacity: 0, offset: 1 },
        ],
        { duration: 1060, easing: 'cubic-bezier(.55,0,.9,.35)', fill: 'forwards' },
      );
    };

    const clearDeathAnims = () => {
      spriteEl.current?.getAnimations?.().forEach((a) => a.cancel());
      flashEl.current?.getAnimations?.().forEach((a) => a.cancel());
    };

    const makeConfetti = () => {
      confetti.current = Array.from({ length: 28 }, (_, i) => ({
        id: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        left: Math.random() * 100,
        dur: 1.6 + Math.random() * 1.4,
        delay: Math.random() * 0.5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
      }));
    };

    const grantVictory = (g: GameState): GameState => {
      const boss = g.bosses.find((b) => b.id === g.currentBossId);
      if (!boss) return g;
      const ck = cycleKey(boss);
      const elite = isElite(boss);
      const gained: Record<string, number> = {};
      for (const f of g.fighters) {
        gained[f.id] = g.log
          .filter((e) => e.fighterId === f.id && e.bossId === boss.id)
          .reduce((a, e) => a + e.damage, 0);
      }
      let total = 0;
      const fighters = g.fighters.map((f) => {
        // Coins reward effort; an enraged boss pays a bonus. Career XP tracks the
        // real damage dealt and is never multiplied.
        const earned = Math.round(((gained[f.id] || 0) / 4) * (elite ? ELITE_COIN_MULT : 1));
        total += earned;
        return {
          ...f,
          careerXp: f.careerXp + (gained[f.id] || 0),
          coins: f.coins + earned,
        };
      });
      patchUi((u) => ({ ...u, lastRewardTotal: total }));

      // A milestone win can awaken slumbering bosses — celebrate the reveal by name.
      const victories = g.victories + 1;
      const woke = g.bosses.filter((b) => !isAwake(b, g.victories) && isAwake(b, victories));
      if (woke.length) {
        const s = STRINGS[g.settings.lang];
        flash(s.bossAwoke.replace('{name}', woke.map((b) => b.name).join(', ')));
      }

      return {
        ...g,
        fighters,
        victories,
        goldenRevealed: boss.rare ? true : g.goldenRevealed,
        bosses: g.bosses.map((b) => (b.id === boss.id ? { ...b, clearedCycle: ck } : b)),
      };
    };

    return {
      replaceGame: (game) => setState((current) => {
        const accessible = game.fighters.filter((fighter) => mayActAsFighter(onlineRef.current.state, fighter));
        const activeFighterId = accessible.some((fighter) => fighter.id === game.activeFighterId)
          ? game.activeFighterId
          : accessible[0]?.id ?? null;
        return {
        game: { ...game, activeFighterId },
        ui: { ...current.ui, won: false, dying: false, combo: 0, dmgNums: [], ping: null },
      };
      }),
      go: (tab) => patchUi((u) => ({ ...u, tab })),

      startFight: () => {
        audio.prime();
        patchUi((u) => ({ ...u, intro: false }));
      },

      selectFighter: (id) => patchGame((g) => {
        const fighter = g.fighters.find((item) => item.id === id);
        return fighter && mayActAsFighter(onlineRef.current.state, fighter) ? { ...g, activeFighterId: id } : g;
      }),

      doAttack: (index) => {
        const s = stateRef.current;
        if (s.ui.intro || s.ui.editingChores) return;
        const boss = currentBoss(s.game);
        if (!boss || boss.hp <= 0) return;
        const chore = boss.chores[index];
        if (!chore) return;
        if (!chore.repeatable && boss.usedChores.includes(chore.id)) return;

        const caster = s.game.activeFighterId
          ?? s.game.fighters[0]?.id
          ?? '';
        const actingFighter = s.game.fighters.find((fighter) => fighter.id === caster);
        if (!actingFighter || !mayActAsFighter(onlineRef.current.state, actingFighter)) return;
        const dmg = Number(chore.damage) || 0;
        const nextHp = Math.max(0, boss.hp - dmg);
        const defeated = nextHp === 0;
        const crit = dmg >= 28;
        const dmgId = pingSeq.current + Math.random();
        const pingId = ++pingSeq.current;
        const label = (crit ? 'CRIT ' : '') + '-' + dmg;
        const x = 34 + Math.random() * 32;

        queueMutation('chore_completion', {
          bossId: boss.id,
          choreId: chore.id,
          fighterId: caster,
          cycleKey: cycleKey(boss),
          resetSeq: boss.resetSeq ?? 0,
          choreTitle: chore.title,
          damage: dmg,
          completedAt: new Date().toISOString(),
        });

        const today = dayKey();
        setState((st) => {
          // Completing a chore marks the day for the fighter who did it; the cached
          // streak is recomputed from that record rather than incremented.
          const activeDays = { ...st.game.activeDays, [caster]: recordActiveDay(st.game.activeDays[caster], today) };
          const casterStreak = streakFrom(activeDays[caster], today);
          return {
          game: {
            ...st.game,
            activeDays,
            fighters: st.game.fighters.map((f) => (f.id === caster ? { ...f, streak: casterStreak } : f)),
            activeFighterId: st.game.activeFighterId ?? (caster || null),
            bosses: st.game.bosses.map((b) =>
              b.id === boss.id
                ? {
                    ...b,
                    hp: nextHp,
                    usedChores: chore.repeatable ? b.usedChores : [...b.usedChores, chore.id],
                  }
                : b),
            log: [{ bossId: boss.id, fighterId: caster, attack: chore.title, damage: dmg }, ...st.game.log],
          },
          ui: {
            ...st.ui,
            combo: st.ui.combo + 1,
            dmgNums: [...st.ui.dmgNums, { id: dmgId, label, crit, x }],
            ping: { fighterId: caster, id: pingId },
          },
        };
        });

        hitFx(crit);
        audio.hit(crit);
        buzz(defeated ? 'win' : crit ? 'crit' : 'hit', s.game.settings.haptics);

        setTimeout(() => patchUi((u) => ({ ...u, dmgNums: u.dmgNums.filter((d) => d.id !== dmgId) })), 950);
        setTimeout(() => patchUi((u) => (u.ping?.id === pingId ? { ...u, ping: null } : u)), 620);

        if (defeated) {
          patchUi((u) => ({ ...u, dying: true }));
          audio.explode();
          setTimeout(() => bossDeath(), 40);
          const wait = reduce() ? 260 : 1120;
          setTimeout(() => {
            patchGame((g) => grantVictory(g));
            makeConfetti();
            audio.victory();
            patchUi((u) => ({ ...u, won: true, dying: false }));
          }, wait);
        }
      },

      reset: () => {
        confetti.current = [];
        clearDeathAnims();
        const id = stateRef.current.game.currentBossId;
        const boss = stateRef.current.game.bosses.find((item) => item.id === id);
        const resetSeq = boss ? (boss.resetSeq ?? 0) + 1 : 0;
        if (boss) queueMutation('boss_reset', {
          bossId: id,
          fighterId: stateRef.current.game.activeFighterId,
          cycleKey: cycleKey(boss),
          resetSeq,
          reason: 'fight_again',
        });
        setState((s) => ({
          game: resetBoss(s.game, id, resetSeq),
          ui: { ...s.ui, intro: true, ping: null, dmgNums: [], combo: 0, dying: false, won: false },
        }));
      },

      enterBoss: (id) => {
        confetti.current = [];
        clearDeathAnims();
        setState((s) => {
          const active = s.game.activeFighterId ?? s.game.fighters[0]?.id ?? null;
          return {
            game: { ...s.game, currentBossId: id, activeFighterId: active },
            ui: { ...s.ui, tab: 'battle', intro: true, dmgNums: [], combo: 0, ping: null, dying: false, won: false },
          };
        });
      },

      fightAgain: (id) => {
        confetti.current = [];
        clearDeathAnims();
        const boss = stateRef.current.game.bosses.find((item) => item.id === id);
        const resetSeq = boss ? (boss.resetSeq ?? 0) + 1 : 0;
        if (boss) queueMutation('boss_reset', {
          bossId: id,
          fighterId: stateRef.current.game.activeFighterId,
          cycleKey: cycleKey(boss),
          resetSeq,
          reason: 'fight_again',
        });
        setState((s) => {
          const active = s.game.activeFighterId ?? s.game.fighters[0]?.id ?? null;
          return {
            game: { ...resetBoss(s.game, id, resetSeq), currentBossId: id, activeFighterId: active },
            ui: { ...s.ui, tab: 'battle', intro: true, dmgNums: [], combo: 0, ping: null, dying: false, won: false },
          };
        });
      },

      dismissSplash: () =>
        patchUi((u) => (u.phase !== 'splash'
          ? u
          : { ...u, phase: stateRef.current.game.onboarded ? 'app' : 'onboarding' })),

      obNext: () => {
        const step = stateRef.current.ui.obStep;
        if (step >= 4) {
          setState((s) => ({ game: { ...s.game, onboarded: true }, ui: { ...s.ui, phase: 'app' } }));
        } else {
          patchUi((u) => ({ ...u, obStep: u.obStep + 1 }));
        }
      },
      obPrev: () => patchUi((u) => ({ ...u, obStep: Math.max(0, u.obStep - 1) })),
      finishOnboarding: () =>
        setState((s) => ({ game: { ...s.game, onboarded: true }, ui: { ...s.ui, phase: 'app' } })),
      replayOnboarding: () => patchUi((u) => ({ ...u, phase: 'onboarding', obStep: 0 })),
      // Play on this device with no account. Gameplay never depended on one — only the
      // setup gate did — so this simply records the choice.
      playLocally: () => patchGame((g) => (g.localPlay ? g : { ...g, localPlay: true })),

      openSettings: () => patchUi((u) => ({ ...u, settingsOpen: true })),
      closeSettings: () => patchUi((u) => ({ ...u, settingsOpen: false, confirmReset: false })),
      setSetting: (key, val) => patchGame((g) => ({ ...g, settings: { ...g.settings, [key]: val } })),
      askReset: () => patchUi((u) => ({ ...u, confirmReset: true })),
      cancelReset: () => patchUi((u) => ({ ...u, confirmReset: false })),
      doReset: () => {
        const fresh = resetState(db);
        setState({ game: fresh, ui: { ...initialUi(), phase: 'app' } });
      },

      openPartyManager: () => patchUi((u) => ({ ...u, editParty: true })),
      closePartyManager: () => patchUi((u) => ({ ...u, editParty: false })),
      editFighter: (id, patch) =>
        patchGame((g) => ({ ...g, fighters: g.fighters.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      ensureAccountFighter: (userId, displayName) =>
        patchGame((g) => {
          const id = `account-${userId}`;
          const existing = g.fighters.find((fighter) => fighter.userId === userId || fighter.id === id);
          const name = displayName.trim() || existing?.name || STRINGS[g.settings.lang].fighterFallback;
          if (existing) {
            const fighters = g.fighters.map((fighter) => fighter.id === existing.id
              ? { ...fighter, name, userId, userKind: 'adult' as const, accountStatus: 'active' as const }
              : fighter);
            return { ...g, fighters, activeFighterId: g.activeFighterId ?? existing.id };
          }
          const fighter: Fighter = {
            id,
            name,
            color: FIGHTER_COLORS[0],
            streak: 0,
            coins: 0,
            careerXp: 0,
            userId,
            userKind: 'adult',
            accountStatus: 'active',
          };
          return { ...g, fighters: [fighter, ...g.fighters], activeFighterId: fighter.id };
        }),
      addFighter: () =>
        patchGame((g) => {
          const id = 'f' + Date.now();
          const fighter: Fighter = {
            id,
            name: 'Ny kjemper',
            color: FIGHTER_COLORS[g.fighters.length % FIGHTER_COLORS.length],
            streak: 0,
            coins: 0,
            careerXp: 0,
          };
          return { ...g, fighters: [...g.fighters, fighter], activeFighterId: g.activeFighterId ?? id };
        }),
      deleteFighter: (id) =>
        patchGame((g) => {
          if (g.fighters.length <= 1) return g;
          const fighters = g.fighters.filter((f) => f.id !== id);
          return { ...g, fighters, activeFighterId: g.activeFighterId === id ? fighters[0].id : g.activeFighterId };
        }),
      clearAvatar: (id) =>
        patchGame((g) => ({ ...g, fighters: g.fighters.map((f) => (f.id === id ? { ...f, avatar: undefined } : f)) })),
      setAvatarFile: (id, file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const S = 96;
            const canvas = document.createElement('canvas');
            canvas.width = S;
            canvas.height = S;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const side = Math.min(img.width, img.height);
            const sx = (img.width - side) / 2;
            const sy = (img.height - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
            const url = canvas.toDataURL('image/png');
            patchGame((g) => ({ ...g, fighters: g.fighters.map((f) => (f.id === id ? { ...f, avatar: url } : f)) }));
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      },

      openBossManager: () => patchUi((u) => ({ ...u, editBosses: true })),
      closeBossManager: () =>
        setState((s) => ({ game: rolloverCycles(s.game), ui: { ...s.ui, editBosses: false } })),
      editBoss: (id, patch) =>
        patchGame((g) => ({ ...g, bosses: g.bosses.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
      setTrigger: (id, patch) =>
        patchGame((g) => ({
          ...g,
          bosses: g.bosses.map((b) => (b.id === id ? { ...b, trigger: { ...b.trigger, ...patch } } : b)),
        })),
      cycleSprite: (id) =>
        patchGame((g) => ({
          ...g,
          bosses: g.bosses.map((b) => {
            if (b.id !== id) return b;
            const i = SPRITE_POOL.indexOf(b.sprite);
            return { ...b, sprite: SPRITE_POOL[(i + 1) % SPRITE_POOL.length] };
          }),
        })),
      toggleDormant: (id) =>
        patchGame((g) => ({
          ...g,
          bosses: g.bosses.map((b) => {
            if (b.id !== id) return b;
            // Sleeping a boss clears its auto-wake milestone (a deliberate parent choice);
            // waking one just clears the dormant flag.
            return b.dormant ? { ...b, dormant: false } : { ...b, dormant: true, unlockAt: 0 };
          }),
        })),
      addBoss: () =>
        patchGame((g) => {
          const id = 'b' + Date.now();
          const copy = STRINGS[g.settings.lang];
          const chore: Chore = { id: id + '-0', title: copy.newChore, damage: 20, repeatable: false };
          const boss: Boss = {
            id, name: copy.newBoss, sprite: SPRITE_POOL[0], frames: 0, rare: false,
            trigger: { type: 'daglig', note: '' }, chores: [chore], hp: 20, clearedCycle: '', usedChores: [],
            dormant: false, unlockAt: 0,
          };
          return { ...g, bosses: [...g.bosses, boss] };
        }),
      deleteBoss: (id) =>
        patchGame((g) => {
          const bosses = g.bosses.filter((b) => b.id !== id);
          if (bosses.length === 0) return g;
          return { ...g, bosses, currentBossId: g.currentBossId === id ? bosses[0].id : g.currentBossId };
        }),

      openEditChores: (id) =>
        patchUi((u) => ({ ...u, editingChores: true, editBossId: id ?? stateRef.current.game.currentBossId })),
      addChore: () =>
        patchGame((g) => {
          const bossId = stateRef.current.ui.editBossId ?? g.currentBossId;
          const chore: Chore = { id: bossId + '-' + Date.now(), title: '', damage: 15, repeatable: false };
          return { ...g, bosses: g.bosses.map((b) => (b.id === bossId ? { ...b, chores: [...b.chores, chore] } : b)) };
        }),
      editChore: (index, patch) =>
        patchGame((g) => {
          const bossId = stateRef.current.ui.editBossId ?? g.currentBossId;
          return {
            ...g,
            bosses: g.bosses.map((b) =>
              b.id === bossId
                ? { ...b, chores: b.chores.map((c, i) => (i === index ? { ...c, ...patch } : c)) }
                : b),
          };
        }),
      deleteChore: (index) =>
        patchGame((g) => {
          const bossId = stateRef.current.ui.editBossId ?? g.currentBossId;
          return {
            ...g,
            bosses: g.bosses.map((b) =>
              b.id === bossId ? { ...b, chores: b.chores.filter((_, i) => i !== index) } : b),
          };
        }),
      finishEditChores: () => {
        clearDeathAnims();
        setState((s) => {
          const bossId = s.ui.editBossId ?? s.game.currentBossId;
          const boss = s.game.bosses.find((b) => b.id === bossId);
          const mh = boss ? maxHpOf(boss.chores) : 0;
          const isCurrent = bossId === s.game.currentBossId;
          const game: GameState = {
            ...s.game,
            bosses: s.game.bosses.map((b) => (b.id === bossId ? { ...b, hp: mh, usedChores: [] } : b)),
            log: s.game.log.filter((e) => e.bossId !== bossId),
          };
          const ui: UiState = {
            ...s.ui,
            editingChores: false,
            editBossId: null,
            ...(isCurrent ? { dmgNums: [], combo: 0, won: false, dying: false, intro: false } : {}),
          };
          return { game, ui };
        });
      },

      redeemPersonal: (r) => {
        const s = stateRef.current;
        const copy = STRINGS[s.game.settings.lang];
        const id = s.game.activeFighterId;
        const fighter = s.game.fighters.find((f) => f.id === id);
        if (!fighter || fighter.coins < r.cost) return;
        const vid = queueMutation('reward_redemption', {
          rewardId: r.id,
          fighterId: fighter.id,
        }) ?? voucherId();
        buzz('crit', s.game.settings.haptics);
        patchGame((g) => ({
          ...g,
          fighters: g.fighters.map((f) => (f.id === id ? { ...f, coins: f.coins - r.cost } : f)),
          redemptions: [
            { vid, rewardId: r.id, icon: r.icon, title: r.title, cost: r.cost, at: todayShort(new Date(), g.settings.lang), who: fighter.name, used: false },
            ...g.redemptions,
          ].slice(0, 12),
        }));
        flash(copy.redeemedFlash.replace('{name}', fighter.name).replace('{reward}', r.title));
      },
      redeemGroup: (r) => {
        const s = stateRef.current;
        const copy = STRINGS[s.game.settings.lang];
        if (s.game.pool < r.cost) return;
        const vid = queueMutation('reward_redemption', {
          rewardId: r.id,
          fighterId: null,
        }) ?? voucherId();
        buzz('win', s.game.settings.haptics);
        patchGame((g) => ({
          ...g,
          pool: g.pool - r.cost,
          redemptions: [
            { vid, rewardId: r.id, icon: r.icon, title: r.title, cost: r.cost, at: todayShort(new Date(), g.settings.lang), who: copy.sharedWho, used: false },
            ...g.redemptions,
          ].slice(0, 12),
        }));
        flash(copy.sharedRewardFlash.replace('{reward}', r.title));
      },
      transfer: (amount) => {
        const s = stateRef.current;
        const id = s.game.activeFighterId;
        const fighter = s.game.fighters.find((f) => f.id === id);
        if (!fighter) return;
        const give = amount === 'all' ? fighter.coins : Math.min(fighter.coins, amount);
        if (give <= 0) return;
        const transferGroup = crypto.randomUUID();
        queueMutation('wallet_transfer', {
          fighterId: fighter.id,
          amount: give,
          transferGroup,
        });
        buzz('crit', s.game.settings.haptics);
        patchGame((g) => ({
          ...g,
          pool: g.pool + give,
          fighters: g.fighters.map((f) => (f.id === id ? { ...f, coins: f.coins - give } : f)),
        }));
        const copy = STRINGS[s.game.settings.lang];
        flash(copy.transferFlash.replace('{name}', fighter.name).replace('{amount}', String(give)));
      },
      useVoucher: (vid) => {
        const s = stateRef.current;
        if (!mayManageHousehold(onlineRef.current.state)) return;
        const copy = STRINGS[s.game.settings.lang];
        const entry = s.game.redemptions.find((x) => x.vid === vid);
        // Vouchers issued before redemptions shared an id with their mutation carry a
        // local-only id the server cannot resolve. Sending one is rejected for good and
        // shows up as a stuck conflict; those vouchers reconcile on the next pull.
        if (isVoucherId(vid)) {
          queueMutation('reward_redemption_update', { redemptionId: vid, status: 'used' });
        }
        patchGame((g) => ({
          ...g,
          redemptions: g.redemptions.map((x) => (x.vid === vid ? { ...x, used: true } : x)),
        }));
        buzz('win', s.game.settings.haptics);
        flash(entry ? copy.voucherUsedFlash.replace('{reward}', entry.title) : copy.voucherUsed);
      },
      retrySave: () => {
        const result = saveState(db, stateRef.current.game);
        if (!result.ok) console.warn('[store] retry save failed', result.error);
      },
      downloadBackup: () => {
        try {
          const bytes = db.exportBytes();
          const backup = new Uint8Array(bytes.byteLength);
          backup.set(bytes);
          const blob = new Blob([backup.buffer], { type: 'application/vnd.sqlite3' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `boss-kamp-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`;
          link.click();
          URL.revokeObjectURL(url);
        } catch (error) {
          db.reportWriteFailure(error);
        }
      },

      setStageRef: (el) => { stageEl.current = el; },
      setSpriteRef: (el) => { spriteEl.current = el; },
      setFlashRef: (el) => { flashEl.current = el; },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const value: GameContextValue = { state, actions, confetti: state.ui.won ? confetti.current : [], persistence };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// ---- pure helpers on GameState ----

function resetBoss(g: GameState, id: string, resetSeq?: number): GameState {
  return {
    ...g,
    bosses: g.bosses.map((b) =>
      b.id === id ? { ...b, hp: maxHpOf(b.chores), usedChores: [], clearedCycle: '', resetSeq: resetSeq ?? b.resetSeq } : b),
    log: g.log.filter((e) => e.bossId !== id),
  };
}

/** Reset any boss whose stored cleared-cycle no longer matches the current window. */
function rolloverCycles(g: GameState, now = new Date()): GameState {
  let changed = false;
  const bosses = g.bosses.map((b) => {
    if (b.clearedCycle && b.clearedCycle !== cycleKey(b, now)) {
      changed = true;
      return { ...b, hp: maxHpOf(b.chores), clearedCycle: '', usedChores: [] };
    }
    return b;
  });
  if (!changed) return g;
  const clearedIds = new Set(
    g.bosses.filter((b) => b.clearedCycle && b.clearedCycle !== cycleKey(b, now)).map((b) => b.id),
  );
  return { ...g, bosses, log: g.log.filter((e) => !clearedIds.has(e.bossId)) };
}

// Re-export helpers used by components for convenience.
export { statusOf, sumDamage };

function gameConfigurationSignature(game: GameState) {
  return JSON.stringify({
    fighters: game.fighters.map(({ id, name, color, avatar }) => ({ id, name, color, avatar })),
    bosses: game.bosses.map((boss) => ({
      id: boss.id,
      name: boss.name,
      sprite: boss.sprite,
      frames: boss.frames,
      rare: boss.rare,
      hue: boss.hue,
      trigger: boss.trigger,
      dormant: boss.dormant,
      unlockAt: boss.unlockAt,
      chores: boss.chores.map(({ id, title, damage, repeatable }) => ({ id, title, damage, repeatable })),
    })),
  });
}
