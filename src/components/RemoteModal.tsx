import { useState, useCallback } from 'react';
import type { RemoteButton, HAState } from '../types';
import './RemoteModal.css';

interface Props {
  visible: boolean;
  label: string;
  toggleEntityId: string | null;
  state: HAState | null;
  buttons: RemoteButton[];
  onClose: () => void;
  onToggle: (entityId: string) => void;
  onPressButton: (entityId: string) => void;
}

/** Helper: find a button by matching the end of its entityId */
function btn(buttons: RemoteButton[], suffix: string): RemoteButton | undefined {
  return buttons.find((b) => b.entityId.endsWith(suffix));
}

/** Scene grid layout — 4 columns, matching the physical iDual remote */
const SCENE_GRID: string[] = [
  '_candle', '_bulb',        '_sun',        '_cold',
  '_dream',  '_sleep',       '_read',       '_meditate',
  '_wake',   '_colorcycle',  '_colorbubles','_sunset',
  /* row 4 col 1 missing */
  '',        '_sea',         '_fire',       '_love',
];

/** Color wheel positions: suffix → CSS color for the dot */
const CW_COLORS: { suffix: string; color: string; angle: number }[] = [
  { suffix: '_cwred',    color: '#ef4444', angle: 0 },
  { suffix: '_cwyellow', color: '#eab308', angle: 90 },
  { suffix: '_cwgreen',  color: '#22c55e', angle: 180 },
  { suffix: '_cwviolet', color: '#8b5cf6', angle: 270 },
];

/** Emoji icons for each suffix */
const ICONS: Record<string, string> = {
  '_candle':      '🕯️',
  '_bulb':        '💡',
  '_sun':         '☀️',
  '_cold':        '❄️',
  '_dream':       '🌙',
  '_sleep':       '😴',
  '_read':        '📖',
  '_meditate':    '🧘',
  '_wake':        '🌅',
  '_colorcycle':  '🔴',
  '_colorbubles': '🫧',
  '_sunset':      '🌴',
  '_sea':         '🌊',
  '_fire':        '🔥',
  '_love':        '💕',
};

export default function RemoteModal({
  visible,
  label,
  toggleEntityId,
  state,
  buttons,
  onClose,
  onToggle,
  onPressButton,
}: Props) {
  const isOn = state?.state === 'on';
  const [lastPressed, setLastPressed] = useState<string | null>(null);

  const handlePress = useCallback(
    (entityId: string) => {
      onPressButton(entityId);
      setLastPressed(entityId);
      setTimeout(() => setLastPressed(null), 300);
    },
    [onPressButton],
  );

  const handlePower = useCallback(
    (on: boolean) => {
      if (!toggleEntityId) return;
      const ha = on ? btn(buttons, '_on') : btn(buttons, '_off');
      // Press the IR ON/OFF button
      if (ha) onPressButton(ha.entityId);
      // Also set the switch state so HA tracks it
      const domain = toggleEntityId.split('.')[0];
      // We call toggle only if the current state doesn't match desired
      const currentlyOn = state?.state === 'on';
      if (currentlyOn !== on) onToggle(toggleEntityId);
    },
    [toggleEntityId, buttons, state, onPressButton, onToggle],
  );

  const brightDown = btn(buttons, '_lightdown');
  const brightUp = btn(buttons, '_lightup');
  const rgbBtn = btn(buttons, '_rgb');
  const rgbwBtn = btn(buttons, '_rgbw');

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="remote-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <div
              className="modal-bulb-icon"
              style={{
                background: isOn ? 'rgba(251,191,36,0.15)' : 'transparent',
                borderColor: isOn ? '#fbbf24' : '#334155',
              }}
            >
              📡
            </div>
            <div>
              <div className="modal-entity-name">{label}</div>
              <div className="modal-entity-id">{toggleEntityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &#10005;
          </button>
        </div>

        <div className="remote-body">
          {/* ── Power row ── */}
          <div className="remote-power-row">
            <button
              className={`remote-power-btn on${isOn ? ' active' : ''}${lastPressed === btn(buttons, '_on')?.entityId ? ' pressed' : ''}`}
              onClick={() => handlePower(true)}
            >
              <span className="power-icon">I</span>
            </button>
            <button
              className={`remote-power-btn off${!isOn ? ' active' : ''}${lastPressed === btn(buttons, '_off')?.entityId ? ' pressed' : ''}`}
              onClick={() => handlePower(false)}
            >
              <span className="power-icon">O</span>
            </button>
          </div>

          {/* ── Brightness row ── */}
          <div className="remote-brightness-row">
            {brightDown && (
              <button
                className={`remote-bright-btn${lastPressed === brightDown.entityId ? ' pressed' : ''}`}
                onClick={() => handlePress(brightDown.entityId)}
              >
                <span className="bright-icon dim">✦</span>
              </button>
            )}
            <div className="bright-gradient" />
            {brightUp && (
              <button
                className={`remote-bright-btn${lastPressed === brightUp.entityId ? ' pressed' : ''}`}
                onClick={() => handlePress(brightUp.entityId)}
              >
                <span className="bright-icon">✦</span>
              </button>
            )}
          </div>

          {/* ── 4×4 Scene grid ── */}
          <div className="remote-scene-grid">
            {SCENE_GRID.map((suffix, i) => {
              if (!suffix) return <div key={i} className="remote-scene-btn empty" />;
              const b = btn(buttons, suffix);
              if (!b) return <div key={i} className="remote-scene-btn empty" />;
              const icon = ICONS[suffix] ?? '';
              return (
                <button
                  key={b.entityId}
                  className={`remote-scene-btn${lastPressed === b.entityId ? ' pressed' : ''}`}
                  onClick={() => handlePress(b.entityId)}
                  title={b.label}
                >
                  <span className="scene-icon">{icon}</span>
                  <span className="scene-label">{b.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Color wheel ── */}
          <div className="remote-wheel-section">
            <div className="remote-wheel">
              <div className="wheel-ring" />
              {CW_COLORS.map(({ suffix, color, angle }) => {
                const b = btn(buttons, suffix);
                if (!b) return null;
                const rad = (angle - 90) * (Math.PI / 180);
                const r = 42; // % from center
                const x = 50 + r * Math.cos(rad);
                const y = 50 + r * Math.sin(rad);
                return (
                  <button
                    key={b.entityId}
                    className={`wheel-dot${lastPressed === b.entityId ? ' pressed' : ''}`}
                    style={{
                      background: color,
                      left: `${x}%`,
                      top: `${y}%`,
                    }}
                    onClick={() => handlePress(b.entityId)}
                    title={b.label}
                  />
                );
              })}
            </div>
            <div className="remote-mode-row">
              {rgbBtn && (
                <button
                  className={`remote-mode-btn${lastPressed === rgbBtn.entityId ? ' pressed' : ''}`}
                  onClick={() => handlePress(rgbBtn.entityId)}
                >
                  <span className="mode-dots">
                    <span style={{ background: '#ef4444' }} />
                    <span style={{ background: '#22c55e' }} />
                    <span style={{ background: '#3b82f6' }} />
                  </span>
                  RGB
                </button>
              )}
              {rgbwBtn && (
                <button
                  className={`remote-mode-btn${lastPressed === rgbwBtn.entityId ? ' pressed' : ''}`}
                  onClick={() => handlePress(rgbwBtn.entityId)}
                >
                  <span className="mode-dots">
                    <span style={{ background: '#ef4444' }} />
                    <span style={{ background: '#22c55e' }} />
                    <span style={{ background: '#3b82f6' }} />
                    <span style={{ background: '#ffffff', border: '1px solid #666' }} />
                  </span>
                  RGBW
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
