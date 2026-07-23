import { useGame } from '../store/GameContext';
import { useT, GOLD } from '../ui/common';
import { FighterRows } from './managers';
import type { Lang } from '../game/types';

const PS = "'Press Start 2P'";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ position: 'relative', width: 50, height: 30, borderRadius: 16, cursor: 'pointer', transition: 'background .2s', background: on ? GOLD : '#333c50' }}>
      <div style={{ position: 'absolute', top: 3, left: 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'transform .2s', transform: `translateX(${on ? 20 : 0}px)` }} />
    </div>
  );
}

function langBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: 14, borderRadius: 12, border: `1px solid ${active ? GOLD : '#333c50'}`,
    background: active ? 'rgba(244,185,66,.16)' : '#0f1420', color: active ? GOLD : '#A8B0BF',
    fontSize: 14, fontWeight: active ? 700 : 600, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  };
}

export function SettingsPanel() {
  const { state, actions } = useGame();
  const t = useT();
  const s = state.game.settings;
  const setLang = (l: Lang) => actions.setSetting('lang', l);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#0b0e16', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', padding: 'calc(20px + env(safe-area-inset-top)) 18px 14px', borderBottom: '1px solid #222a3c', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: PS, fontSize: 13, color: GOLD }}>{t.settings}</div>
          <div style={{ fontSize: 12, color: '#6C7486', marginTop: 8, fontWeight: 500 }}>{t.settingsSub}</div>
        </div>
        <button onClick={actions.closeSettings} style={{ flex: 'none', padding: '12px 20px', border: 'none', borderRadius: 13, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 9, letterSpacing: 1, cursor: 'pointer', boxShadow: '0 4px 0 #b8801f' }}>{t.done}</button>
      </div>
      <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={secLabel}>{t.language}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setLang('no')} style={langBtn(s.lang === 'no')}><span style={{ fontSize: 18 }}>🇳🇴</span> Norsk</button>
          <button onClick={() => setLang('en')} style={langBtn(s.lang === 'en')}><span style={{ fontSize: 18 }}>🇬🇧</span> English</button>
        </div>

        <div style={{ ...secLabel, marginTop: 22 }}>{t.audioMotion}</div>
        <Row title={t.sound} sub={t.soundSub}><Toggle on={s.sound} onClick={() => actions.setSetting('sound', !s.sound)} /></Row>
        <Row title={t.haptics} sub={t.hapticsSub}><Toggle on={s.haptics} onClick={() => actions.setSetting('haptics', !s.haptics)} /></Row>
        <Row title={t.reducedMotion} sub={t.reducedMotionSub}><Toggle on={s.reducedMotion} onClick={() => actions.setSetting('reducedMotion', !s.reducedMotion)} /></Row>

        <div style={{ ...secLabel, marginTop: 22 }}>{t.data}</div>
        <button onClick={actions.askReset} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#1b2130', border: '1px solid rgba(224,86,74,.35)', borderRadius: 15, padding: '15px 16px', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#E0564A' }}>{t.resetProgress}</div>
            <div style={{ fontSize: 12, color: '#6C7486', marginTop: 3, fontWeight: 500 }}>{t.resetSub}</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E0564A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#3f4759', fontWeight: 600, marginTop: 24 }}>{t.about}</div>
      </div>

      {state.ui.confirmReset && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'rgba(6,8,12,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, backdropFilter: 'blur(3px)' }}>
          <div style={{ maxWidth: 340, width: '100%', background: '#161c2b', border: '1px solid #333c50', borderRadius: 20, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 42 }}>⚠️</div>
            <div style={{ fontFamily: PS, fontSize: 14, color: '#E0564A', marginTop: 14, lineHeight: 1.5 }}>{t.resetConfirmTitle}</div>
            <div style={{ fontSize: 13, color: '#A8B0BF', marginTop: 12, lineHeight: 1.6, fontWeight: 500 }}>{t.resetConfirmSub}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={actions.cancelReset} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid #333c50', background: '#232c3e', color: '#F6EBDD', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{t.cancel}</button>
              <button onClick={actions.doReset} style={{ flex: 1, padding: 14, border: 'none', borderRadius: 12, background: 'linear-gradient(180deg,#ef6a5f,#E0564A)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 0 #9f2f27' }}>{t.resetYes}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#1b2130', border: '1px solid #2b3346', borderRadius: 15, padding: '15px 16px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F6EBDD' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#6C7486', marginTop: 3, fontWeight: 500 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

export function Splash() {
  const { actions } = useGame();
  const t = useT();
  return (
    <div onClick={actions.dismissSplash} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'radial-gradient(120% 90% at 50% 22%,#1a2338,#0c0f16 60%,#070910)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(91,155,232,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(91,155,232,.08) 1px,transparent 1px)', backgroundSize: '34px 34px', maskImage: 'linear-gradient(180deg,#000,transparent 85%)', WebkitMaskImage: 'linear-gradient(180deg,#000,transparent 85%)' }} />
      <img src="/uploads/sock-void-boss-transparent.png" alt="" style={{ position: 'absolute', bottom: -50, left: '50%', transform: 'translateX(-50%)', width: 'min(94vw,480px)', opacity: .09, filter: 'grayscale(1)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, animation: 'introSlam .8s cubic-bezier(.2,.9,.2,1) both' }}>
        <SwordCrest size={92} />
        <div style={{ textAlign: 'center', lineHeight: 1 }}>
          <div style={{ fontFamily: PS, fontSize: 42, color: GOLD, textShadow: '0 3px 0 #b8801f,0 6px 0 #7a5410,0 8px 0 #000,0 0 26px rgba(244,185,66,.5)' }}>BOSS</div>
          <div style={{ fontFamily: PS, fontSize: 42, color: '#E0564A', marginTop: 10, textShadow: '0 3px 0 #8f2b23,0 6px 0 #5e1a15,0 8px 0 #000,0 0 26px rgba(224,86,74,.45)' }}>KAMP</div>
        </div>
        <div style={{ fontSize: 13, color: '#A8B0BF', fontWeight: 500, letterSpacing: .5 }}>{t.splashTagline}</div>
      </div>
      <div style={{ position: 'relative', zIndex: 2, marginTop: 46, width: 'min(72vw,300px)' }}>
        <div style={{ height: 16, borderRadius: 8, background: '#0b0e16', border: '1.5px solid #000', overflow: 'hidden', boxShadow: 'inset 0 2px 4px rgba(0,0,0,.6)' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#67D391,#F4B942)', animation: 'loadfill 1.9s ease-out both' }} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontFamily: PS, fontSize: 9, color: '#A8B0BF', animation: 'blink 1s steps(1) infinite' }}>{t.splashStart}</div>
      </div>
    </div>
  );
}

export function Onboarding() {
  const { state, actions } = useGame();
  const t = useT();
  const step = state.ui.obStep;
  const setLang = (l: Lang) => actions.setSetting('lang', l);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'radial-gradient(120% 90% at 50% 12%,#161f30,#0c0f16 65%)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 'none', display: 'flex', justifyContent: 'flex-end', padding: 'calc(16px + env(safe-area-inset-top)) 18px 6px' }}>
        <button onClick={actions.finishOnboarding} style={{ background: 'none', border: 'none', color: '#6C7486', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 8 }}>{t.skip}</button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', height: '100%', width: '600%', transform: `translateX(-${step * (100 / 6)}%)`, transition: 'transform .45s cubic-bezier(.4,0,.2,1)' }}>
          <Step>
            <div style={{ fontSize: 52 }}>🌍</div>
            <StepTitle color={GOLD}>{t.langStepTitle}</StepTitle>
            <StepBody>{t.langStepBody}</StepBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280, marginTop: 6 }}>
              <button onClick={() => setLang('no')} style={langBtn(state.game.settings.lang === 'no')}><span style={{ fontSize: 20 }}>🇳🇴</span> Norsk</button>
              <button onClick={() => setLang('en')} style={langBtn(state.game.settings.lang === 'en')}><span style={{ fontSize: 20 }}>🇬🇧</span> English</button>
            </div>
          </Step>
          <Step>
            <SwordCrest size={80} />
            <StepTitle color={GOLD}>{t.ob1Title}</StepTitle>
            <StepBody>{t.ob1Body}</StepBody>
          </Step>
          <Step>
            <img src="/uploads/crumb-colossus-boss-transparent.png" alt="" style={{ width: 'min(56vw,220px)', animation: 'idleBob 3.2s ease-in-out infinite', filter: 'drop-shadow(0 18px 22px rgba(0,0,0,.5))' }} />
            <StepTitle color="#E0564A">{t.ob2Title}</StepTitle>
            <StepBody>{t.ob2Body}</StepBody>
          </Step>
          <Step>
            <div style={{ position: 'relative', height: 150, width: 220, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 104, height: 104, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#ffe08a,#F4B942 60%,#b8801f)', boxShadow: '0 0 34px rgba(244,185,66,.5),inset 0 -6px 10px rgba(0,0,0,.3)', display: 'grid', placeItems: 'center', fontFamily: PS, fontSize: 30, color: '#7a5410', animation: 'floatBadge 2.4s ease-in-out infinite' }}>★</div>
              <div style={{ position: 'absolute', top: 14, right: 26, width: 44, height: 44, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#bfe0ff,#5B9BE8 60%,#2f6bb0)', boxShadow: '0 0 16px rgba(91,155,232,.5)' }} />
            </div>
            <StepTitle color={GOLD}>{t.ob3Title}</StepTitle>
            <StepBody>{t.ob3Body}</StepBody>
          </Step>
          <Step>
            <div style={{ display: 'flex', gap: 12, animation: 'floatBadge 2.6s ease-in-out infinite' }}>
              {[['C', GOLD], ['M', '#E0564A'], ['A', '#67D391']].map(([ch, col]) => (
                <div key={ch} style={{ width: 52, height: 52, borderRadius: 15, background: '#2C3548', border: `2px solid ${col}`, display: 'grid', placeItems: 'center', fontFamily: PS, fontSize: 16, color: col }}>{ch}</div>
              ))}
            </div>
            <StepTitle color="#67D391">{t.ob4Title}</StepTitle>
            <StepBody>{t.ob4Body}</StepBody>
          </Step>
          <div style={{ flex: '0 0 16.6666%', height: '100%', display: 'flex', flexDirection: 'column', padding: '8px 20px 0' }}>
            <div style={{ flex: 'none', textAlign: 'center', padding: '0 8px 14px' }}>
              <div style={{ fontFamily: PS, fontSize: 15, color: '#5B9BE8', lineHeight: 1.5, textShadow: '0 3px 0 rgba(0,0,0,.5)' }}>{t.obSetupTitle}</div>
              <div style={{ fontSize: 14, color: '#C6CDDA', lineHeight: 1.5, fontWeight: 500, marginTop: 12 }}>{t.obSetupBody}</div>
            </div>
            <div className="scr" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 8px' }}>
              <FighterRows />
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex: 'none', padding: '16px 24px calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i === step ? GOLD : '#333c50', transition: 'all .3s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 360 }}>
          {step > 0 && <button onClick={actions.obPrev} style={{ flex: 'none', padding: '15px 22px', borderRadius: 14, border: '1px solid #333c50', background: '#1b2130', color: '#A8B0BF', fontFamily: PS, fontSize: 9, letterSpacing: .5, cursor: 'pointer' }}>‹</button>}
          <button onClick={actions.obNext} style={{ flex: 1, padding: 15, border: 'none', borderRadius: 14, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 10, letterSpacing: 1, cursor: 'pointer', boxShadow: '0 5px 0 #b8801f' }}>{step === 5 ? t.getStarted : t.next}</button>
        </div>
      </div>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: '0 0 16.6666%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 32px', gap: 22 }}>{children}</div>;
}
function StepTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return <div style={{ fontFamily: PS, fontSize: 18, color, lineHeight: 1.5, textShadow: '0 3px 0 rgba(0,0,0,.5)' }}>{children}</div>;
}
function StepBody({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 15, color: '#C6CDDA', lineHeight: 1.6, fontWeight: 500, maxWidth: 300 }}>{children}</div>;
}

function SwordCrest({ size }: { size: number }) {
  const inner = Math.round(size * 0.52);
  return (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: 24, background: 'linear-gradient(180deg,#20283c,#141a28)', border: `2px solid ${GOLD}`, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 4px rgba(244,185,66,.12),0 12px 34px rgba(0,0,0,.6)' }}>
      <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: 'radial-gradient(circle,rgba(244,185,66,.35),transparent 70%)', animation: 'glowPulse 3s ease-in-out infinite' }} />
      <div style={{ position: 'relative', width: inner, height: inner }}>
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', inset: 0 }}><path d="M14.5 3.5 20 3l-.5 5.5-9 9-4.5.5.5-4.5z" /><path d="m6.5 13.5 4 4" /><path d="M3 21l3.5-3.5" /></svg>
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="#F6EBDD" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', inset: 0, transform: 'scaleX(-1)' }}><path d="M14.5 3.5 20 3l-.5 5.5-9 9-4.5.5.5-4.5z" /><path d="m6.5 13.5 4 4" /><path d="M3 21l3.5-3.5" /></svg>
      </div>
    </div>
  );
}

export function Toast() {
  const { state } = useGame();
  if (!state.ui.toast) return null;
  return (
    <div style={{ position: 'fixed', bottom: 112, left: 16, right: 16, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ maxWidth: 340, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 9, lineHeight: 1.5, letterSpacing: .5, padding: '13px 20px', borderRadius: 13, boxShadow: '0 8px 20px rgba(0,0,0,.5)', animation: 'victoryPop .35s ease-out both', textAlign: 'center' }}>🎉 {state.ui.toast}</div>
    </div>
  );
}

const secLabel: React.CSSProperties = { fontFamily: PS, fontSize: 8, color: '#6C7486', letterSpacing: 1, marginBottom: 4 };
