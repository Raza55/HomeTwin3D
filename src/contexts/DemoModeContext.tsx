import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getSetting, updateSettings } from '../services/settingsStore';

interface DemoModeValue {
  demoMode: boolean;
  setDemoMode: (on: boolean) => void;
}

const DemoModeContext = createContext<DemoModeValue>({ demoMode: false, setDemoMode: () => {} });

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(() => getSetting('connection').mode === 'demo');

  const setDemoMode = useCallback((on: boolean) => {
    updateSettings('connection', { mode: on ? 'demo' : 'live' });
    setDemoModeState(on);
  }, []);

  return (
    <DemoModeContext.Provider value={{ demoMode, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
