import { useEffect, useRef, useState } from 'react';
import { GitBranch, House, MonitorSmartphone, SlidersHorizontal, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { installation } from '../../services/installationConfig';

interface Props {
  /** Reading time and its end (performance.now()). */
  ms: number;
  until: number;
  onStart: () => void;
  onExit: () => void;
}

/** Intro card of the day demo: what the board is and where it runs, shown long enough to read. */
export default function DayDemoIntro({ ms, until, onStart, onExit }: Props) {
  const { t } = useLanguage();
  const [left, setLeft] = useState(() => Math.max(0, until - performance.now()));
  const start = useRef<HTMLButtonElement>(null);
  // The bar runs as one CSS animation; its offset is fixed once (re-setting it each tick would speed it up).
  const [offset] = useState(() => Math.min(0, until - performance.now() - ms));
  useEffect(() => {
    const timer = setInterval(() => setLeft(Math.max(0, until - performance.now())), 250);
    start.current?.focus({ preventScroll: true });
    return () => clearInterval(timer);
  }, [until]);
  // The name is part of the private installation values, never of the public code.
  const author = installation.author;
  const points = [
    { Icon: House, text: t('dayDemo.intro.app') },
    { Icon: MonitorSmartphone, text: t('dayDemo.intro.devices') },
    { Icon: SlidersHorizontal, text: t('dayDemo.intro.control') },
    { Icon: GitBranch, text: t('dayDemo.intro.github') },
  ];
  return (
    <div className="day-demo-intro" role="dialog" aria-modal="true" aria-labelledby="day-demo-intro-title">
      <div className="day-demo-intro-card">
        <button type="button" className="day-demo-intro-close" onClick={onExit} aria-label={t('dayDemo.exit')} title={t('dayDemo.exit')}><X size={16} /></button>
        <h2 id="day-demo-intro-title">HomeTwin3D</h2>
        <p className="day-demo-intro-subtitle">{t('dayDemo.intro.subtitle')}</p>
        {author && <p className="day-demo-intro-author">{t('dayDemo.intro.author', { author })}</p>}
        <ul>
          {points.map(({ Icon, text }) => <li key={text}><Icon size={18} strokeWidth={1.8} aria-hidden /><span>{text}</span></li>)}
        </ul>
        <div className="day-demo-intro-track" aria-hidden><span style={{ animationDuration: `${ms}ms`, animationDelay: `${offset}ms` }} /></div>
        <footer>
          <small aria-live="off">{t('dayDemo.intro.startsIn', { s: Math.ceil(left / 1000) })}</small>
          <button ref={start} type="button" className="day-demo-btn primary" onClick={onStart}>{t('dayDemo.intro.start')}</button>
        </footer>
      </div>
    </div>
  );
}
