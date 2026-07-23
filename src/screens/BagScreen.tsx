import { useGame } from '../store/GameContext';
import { useT, GOLD } from '../ui/common';

const PS = "'Press Start 2P'";

export function BagScreen() {
  const { state, actions } = useGame();
  const t = useT();
  const g = state.game;
  const colorByName = new Map(g.fighters.map((f) => [f.name, f.color]));
  const held = g.redemptions.filter((e) => !e.used);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', padding: '24px 18px 20px' }}>
      <div style={{ fontFamily: PS, fontSize: 15, color: GOLD, lineHeight: 1.4 }}>{t.bag}</div>
      <div style={{ fontSize: 13, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>{t.bagSub}</div>

      {held.length > 0 ? (
        <>
          <div style={{ fontFamily: PS, fontSize: 8, color: '#6C7486', letterSpacing: 1, margin: '26px 0 12px' }}>{t.toUse.replace('{n}', String(held.length))}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {held.map((v) => (
              <div key={v.vid} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#1b2130', border: '1px solid #2b3346', borderRadius: 16, padding: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: '#141a26', border: '1px solid #2b3346', display: 'grid', placeItems: 'center', fontSize: 22 }}>{v.icon || '🎁'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#F6EBDD', lineHeight: 1.2 }}>{v.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorByName.get(v.who) || '#8fc0ff' }} />
                    <span style={{ fontSize: 11, color: '#6C7486', fontWeight: 500 }}>{v.who}</span>
                  </div>
                </div>
                <button onClick={() => actions.useVoucher(v.vid)} style={{ flex: 'none', padding: '11px 16px', border: 'none', borderRadius: 12, background: 'linear-gradient(180deg,#8fe0a8,#67D391)', color: '#0c1a12', fontFamily: PS, fontSize: 8, letterSpacing: .5, cursor: 'pointer', boxShadow: '0 4px 0 #3f9c63' }}>{t.use}</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 40, textAlign: 'center', padding: '40px 20px', border: '1px dashed #333c50', borderRadius: 18 }}>
          <div style={{ fontSize: 40 }}>🎒</div>
          <div style={{ fontSize: 14, color: '#A8B0BF', fontWeight: 600, marginTop: 14 }}>{t.bagEmpty}</div>
          <div style={{ fontSize: 12, color: '#6C7486', marginTop: 8, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t.bagEmptySub }} />
          <button onClick={() => actions.go('rewards')} style={{ marginTop: 18, padding: '12px 22px', border: 'none', borderRadius: 12, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 9, letterSpacing: .5, cursor: 'pointer', boxShadow: '0 4px 0 #b8801f' }}>{t.goShop}</button>
        </div>
      )}
    </div>
  );
}
