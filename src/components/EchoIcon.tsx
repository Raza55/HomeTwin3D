/** Compact silhouettes: Echo Dot with its light ring, Echo Show with a screen. */
export default function EchoIcon({ kind = 'dot', size = 14 }: { kind?: 'dot' | 'show'; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'show' ? <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="m7 21 2-4m8 4-2-4M7 21h10M7 13h10"/></>
      : <><path d="M3 15a9 9 0 1 1 18 0c0 4-18 4-18 0Z"/><ellipse cx="12" cy="15" rx="9" ry="3"/><path d="M11 6h2"/></>}
  </svg>;
}
