import { forwardRef, type CSSProperties } from 'react';
import { useGame } from '../store/GameContext';
import { STRINGS, type Strings } from '../game/i18n';
import { bossFilter } from '../game/logic';
import type { Boss, Fighter } from '../game/types';

export function useT(): Strings {
  const { state } = useGame();
  return STRINGS[state.game.settings.lang];
}

export const GOLD = '#F4B942';
export const DIM = '#6C7486';

/** Renders a boss sprite, animating sprite-sheets when `frames > 0`. */
export const BossSprite = forwardRef<HTMLDivElement | HTMLImageElement, {
  boss: Boss;
  style?: CSSProperties;
  imgStyle?: CSSProperties;
  elite?: boolean;
}>(function BossSprite({ boss, style, imgStyle, elite }, ref) {
  const filter = bossFilter(boss, elite);
  if (boss.frames > 0) {
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        style={{ position: 'relative', overflow: 'hidden', aspectRatio: '362 / 724', ...style }}
      >
        <img
          src={boss.sprite}
          alt={boss.name}
          style={{
            height: '100%', width: 'auto', maxWidth: 'none', display: 'block',
            animation: `goldIdle .8s steps(${boss.frames}) infinite`,
            ...(filter ? { filter } : {}),
          }}
        />
      </div>
    );
  }
  return (
    <img
      ref={ref as React.Ref<HTMLImageElement>}
      src={boss.sprite}
      alt={boss.name}
      style={{ display: 'block', ...style, ...imgStyle, ...(filter ? { filter } : {}) }}
    />
  );
});

export function Avatar({ fighter, radius = 0 }: { fighter: Fighter; radius?: number }) {
  if (!fighter.avatar) return null;
  return (
    <img
      src={fighter.avatar}
      alt={fighter.name}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', imageRendering: 'pixelated', borderRadius: radius,
      }}
    />
  );
}

export function initialOf(name: string): string {
  return (name || '?')[0].toUpperCase();
}
