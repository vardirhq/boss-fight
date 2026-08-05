import { useState } from 'react';
import { useGame } from '../store/GameContext';
import { useT, GOLD } from '../ui/common';
import type { Lang } from '../game/types';
import { DialogSurface } from '../ui/a11y';

const PS = "'Press Start 2P'";

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      style={{ position: 'relative', flex: 'none', width: 48, height: 28, padding: 0, border: `1px solid ${on ? '#dca32f' : '#3a4356'}`, borderRadius: 15, cursor: 'pointer', transition: 'background .2s,border-color .2s', background: on ? GOLD : '#293142' }}
    >
      <span style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: on ? '#20160a' : '#a8b0bf', boxShadow: '0 1px 3px rgba(0,0,0,.35)', transition: 'transform .2s', transform: `translateX(${on ? 20 : 0}px)` }} />
    </button>
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

type SettingsPanelProps = {
  onOpenAccount: () => void;
  accountSubtitle: string;
  accountConnected: boolean;
};

type SettingsPage = 'main' | 'language';

export function SettingsPanel({ onOpenAccount, accountSubtitle, accountConnected }: SettingsPanelProps) {
  const { state, actions } = useGame();
  const t = useT();
  const s = state.game.settings;
  const [page, setPage] = useState<SettingsPage>('main');
  const setLang = (l: Lang) => actions.setSetting('lang', l);
  const copy = s.lang === 'en'
    ? {
        title: 'Settings', account: 'Account & household', accountFallback: 'Manage family, devices and sync',
        general: 'General', language: 'Language', currentLanguage: 'English', experience: 'Experience',
        data: 'Data', about: 'Boss Kamp · Version 1.0', back: 'Back', close: 'Close settings',
      }
    : {
        title: 'Innstillinger', account: 'Konto og husholdning', accountFallback: 'Administrer familie, enheter og synk',
        general: 'Generelt', language: 'Språk', currentLanguage: 'Norsk', experience: 'Opplevelse',
        data: 'Data', about: 'Boss Kamp · Versjon 1.0', back: 'Tilbake', close: 'Lukk innstillinger',
      };

  const header = (
    <div style={{ flex: 'none', minHeight: 64, padding: 'calc(12px + env(safe-area-inset-top)) 16px 10px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(11,14,22,.96)' }}>
      {page === 'language' ? (
        <IconButton label={copy.back} onClick={() => setPage('main')}><BackIcon /></IconButton>
      ) : <div style={{ width: 42 }} />}
      <div style={{ flex: 1, fontSize: 22, fontWeight: 800, letterSpacing: '-.35px', color: '#f6ebdd' }}>{page === 'language' ? copy.language : copy.title}</div>
      {page === 'main' ? (
        <IconButton label={copy.close} onClick={actions.closeSettings}><CloseIcon /></IconButton>
      ) : <div style={{ width: 42 }} />}
    </div>
  );

  return (
    <DialogSurface label={copy.title} onClose={actions.closeSettings} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'linear-gradient(180deg,#0d111b,#090c13)', display: 'flex', flexDirection: 'column' }}>
      {header}
      {page === 'main' ? (
        <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '20px 16px calc(32px + env(safe-area-inset-bottom))' }}>
          <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
            <Section>
              <MenuRow
                icon={<AccountIcon />}
                iconColor="#8fc0ff"
                title={copy.account}
                subtitle={accountSubtitle || copy.accountFallback}
                onClick={onOpenAccount}
                trailing={<><span style={{ width: 8, height: 8, borderRadius: '50%', background: accountConnected ? '#67d391' : GOLD, boxShadow: `0 0 8px ${accountConnected ? '#67d39188' : '#f4b94288'}` }} /><Chevron /></>}
              />
            </Section>

            <SectionLabel>{copy.general}</SectionLabel>
            <Section>
              <MenuRow icon={<GlobeIcon />} iconColor="#a88cf0" title={copy.language} onClick={() => setPage('language')} trailing={<><span style={valueStyle}>{copy.currentLanguage}</span><Chevron /></>} />
            </Section>

            <SectionLabel>{copy.experience}</SectionLabel>
            <Section>
              <MenuRow icon={<SoundIcon />} iconColor="#67d391" title={t.sound} subtitle={t.soundSub} trailing={<Toggle label={t.sound} on={s.sound} onClick={() => actions.setSetting('sound', !s.sound)} />} />
              <Divider />
              <MenuRow icon={<HapticsIcon />} iconColor="#f4b942" title={t.haptics} subtitle={t.hapticsSub} trailing={<Toggle label={t.haptics} on={s.haptics} onClick={() => actions.setSetting('haptics', !s.haptics)} />} />
              <Divider />
              <MenuRow icon={<MotionIcon />} iconColor="#e68278" title={t.reducedMotion} subtitle={t.reducedMotionSub} trailing={<Toggle label={t.reducedMotion} on={s.reducedMotion} onClick={() => actions.setSetting('reducedMotion', !s.reducedMotion)} />} />
            </Section>

            <SectionLabel>{copy.data}</SectionLabel>
            <Section>
              <MenuRow icon={<TrashIcon />} iconColor="#e0564a" title={t.resetProgress} subtitle={t.resetSub} titleColor="#f07b70" onClick={actions.askReset} trailing={<Chevron color="#7b4244" />} />
            </Section>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#4d5669', fontWeight: 600, marginTop: 28 }}>{copy.about}</div>
          </div>
        </div>
      ) : (
        <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '20px 16px calc(32px + env(safe-area-inset-bottom))' }}>
          <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
            <Section>
              <LanguageRow flag="🇳🇴" title="Norsk" active={s.lang === 'no'} onClick={() => setLang('no')} />
              <Divider />
              <LanguageRow flag="🇬🇧" title="English" active={s.lang === 'en'} onClick={() => setLang('en')} />
            </Section>
          </div>
        </div>
      )}

      {state.ui.confirmReset && (
        <DialogSurface label={t.resetConfirmTitle} onClose={actions.cancelReset} style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'rgba(6,8,12,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, backdropFilter: 'blur(3px)' }}>
          <div style={{ maxWidth: 340, width: '100%', background: '#161c2b', border: '1px solid #333c50', borderRadius: 20, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 42 }}>⚠️</div>
            <div style={{ fontFamily: PS, fontSize: 14, color: '#E0564A', marginTop: 14, lineHeight: 1.5 }}>{t.resetConfirmTitle}</div>
            <div style={{ fontSize: 13, color: '#A8B0BF', marginTop: 12, lineHeight: 1.6, fontWeight: 500 }}>{t.resetConfirmSub}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={actions.cancelReset} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid #333c50', background: '#232c3e', color: '#F6EBDD', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{t.cancel}</button>
              <button onClick={actions.doReset} style={{ flex: 1, padding: 14, border: 'none', borderRadius: 12, background: 'linear-gradient(180deg,#ef6a5f,#E0564A)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 0 #9f2f27' }}>{t.resetYes}</button>
            </div>
          </div>
        </DialogSurface>
      )}
    </DialogSurface>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ overflow: 'hidden', borderRadius: 16, border: '1px solid #252d3d', background: '#151b28', boxShadow: '0 6px 18px rgba(0,0,0,.16)' }}>{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ margin: '24px 12px 8px', color: '#788297', fontSize: 12, fontWeight: 800, letterSpacing: '.65px', textTransform: 'uppercase' }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, marginLeft: 64, background: 'rgba(255,255,255,.065)' }} />;
}

function MenuRow({ icon, iconColor, title, subtitle, titleColor = '#f6ebdd', trailing, onClick }: {
  icon: React.ReactNode; iconColor: string; title: string; subtitle?: string; titleColor?: string;
  trailing?: React.ReactNode; onClick?: () => void;
}) {
  const content = (
    <>
      <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', color: iconColor, background: `${iconColor}18` }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: titleColor, lineHeight: 1.25 }}>{title}</span>
        {subtitle && <span style={{ display: 'block', fontSize: 12, color: '#818a9d', marginTop: 3, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>}
      </span>
      {trailing && <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>{trailing}</span>}
    </>
  );
  const style: React.CSSProperties = { width: '100%', minHeight: 62, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: 0, background: 'transparent', textAlign: 'left', color: '#f6ebdd' };
  return onClick
    ? <button type="button" onClick={onClick} style={{ ...style, cursor: 'pointer' }}>{content}</button>
    : <div style={style}>{content}</div>;
}

function LanguageRow({ flag, title, active, onClick }: { flag: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ width: '100%', minHeight: 58, display: 'flex', alignItems: 'center', gap: 13, padding: '10px 16px', border: 0, background: 'transparent', color: '#f6ebdd', cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ fontSize: 24 }}>{flag}</span>
      <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{title}</span>
      {active && <CheckIcon />}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} style={{ width: 42, height: 42, padding: 0, border: '1px solid #293143', borderRadius: '50%', background: '#171d2a', color: '#d9deea', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>{children}</button>;
}

const valueStyle: React.CSSProperties = { color: '#929bad', fontSize: 13, fontWeight: 600 };
const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function AccountIcon() { return <svg {...iconProps}><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /><path d="M3 11.5V5l9-3 9 3v6.5" /></svg>; }
function GlobeIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>; }
function SoundIcon() { return <svg {...iconProps}><path d="M11 5 6 9H3v6h3l5 4zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></svg>; }
function HapticsIcon() { return <svg {...iconProps}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M4 8v8M20 8v8M10 17h4" /></svg>; }
function MotionIcon() { return <svg {...iconProps}><path d="M4 12h3l2-5 4 10 2-5h5" /></svg>; }
function TrashIcon() { return <svg {...iconProps}><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 10v7M14 10v7" /></svg>; }
function Chevron({ color = '#657086' }: { color?: string }) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>; }
function BackIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>; }
function CloseIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function CheckIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>; }

export function Splash() {
  const { actions } = useGame();
  const t = useT();
  return (
    <button type="button" aria-label={t.splashStart} onClick={actions.dismissSplash} style={{ position: 'fixed', inset: 0, zIndex: 100, width: '100%', border: 0, color: 'inherit', background: 'radial-gradient(120% 90% at 50% 22%,#1a2338,#0c0f16 60%,#070910)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(91,155,232,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(91,155,232,.08) 1px,transparent 1px)', backgroundSize: '34px 34px', maskImage: 'linear-gradient(180deg,#000,transparent 85%)', WebkitMaskImage: 'linear-gradient(180deg,#000,transparent 85%)' }} />
      <img src="/uploads/sock-void-boss-transparent.webp" alt="" style={{ position: 'absolute', bottom: -50, left: '50%', transform: 'translateX(-50%)', width: 'min(94vw,480px)', opacity: .09, filter: 'grayscale(1)', pointerEvents: 'none' }} />
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
    </button>
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
        <div style={{ display: 'flex', height: '100%', width: '500%', transform: `translateX(-${step * 20}%)`, transition: 'transform .45s cubic-bezier(.4,0,.2,1)' }}>
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
            <img src="/uploads/crumb-colossus-boss-transparent.webp" alt="" style={{ width: 'min(56vw,220px)', animation: 'idleBob 3.2s ease-in-out infinite', filter: 'drop-shadow(0 18px 22px rgba(0,0,0,.5))' }} />
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
        </div>
      </div>
      <div style={{ flex: 'none', padding: '16px 24px calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i === step ? GOLD : '#333c50', transition: 'all .3s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 360 }}>
          {step > 0 && <button onClick={actions.obPrev} style={{ flex: 'none', padding: '15px 22px', borderRadius: 14, border: '1px solid #333c50', background: '#1b2130', color: '#A8B0BF', fontFamily: PS, fontSize: 9, letterSpacing: .5, cursor: 'pointer' }}>‹</button>}
          <button onClick={actions.obNext} style={{ flex: 1, padding: 15, border: 'none', borderRadius: 14, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 10, letterSpacing: 1, cursor: 'pointer', boxShadow: '0 5px 0 #b8801f' }}>{step === 4 ? t.getStarted : t.next}</button>
        </div>
      </div>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: '0 0 20%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 32px', gap: 22 }}>{children}</div>;
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
    <div role="status" aria-live="polite" aria-atomic="true" style={{ position: 'fixed', bottom: 112, left: 16, right: 16, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ maxWidth: 340, background: 'linear-gradient(180deg,#ffd873,#F4B942)', color: '#20160A', fontFamily: PS, fontSize: 9, lineHeight: 1.5, letterSpacing: .5, padding: '13px 20px', borderRadius: 13, boxShadow: '0 8px 20px rgba(0,0,0,.5)', animation: 'victoryPop .35s ease-out both', textAlign: 'center' }}>🎉 {state.ui.toast}</div>
    </div>
  );
}
