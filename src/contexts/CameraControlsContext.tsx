import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getSetting, updateSettings } from '../services/settingsStore';

export interface CameraControlsFlags {
  zoom: boolean;
  rotate: boolean;
  pan: boolean;
}

interface CameraControlsValue {
  desktop: CameraControlsFlags;
  mobile: CameraControlsFlags;
  toggleDesktop: (key: keyof CameraControlsFlags) => void;
  toggleMobile: (key: keyof CameraControlsFlags) => void;
}

const defaults: { desktop: CameraControlsFlags; mobile: CameraControlsFlags } = {
  desktop: { zoom: true, rotate: true, pan: true },
  mobile: { zoom: true, rotate: true, pan: true },
};

function load() {
  const stored = getSetting('controls').cameraControls;
  return {
    desktop: { ...defaults.desktop, ...stored.desktop },
    mobile: { ...defaults.mobile, ...stored.mobile },
  };
}

const CameraControlsContext = createContext<CameraControlsValue>({
  ...defaults,
  toggleDesktop: () => {},
  toggleMobile: () => {},
});

export function CameraControlsProvider({ children }: { children: ReactNode }) {
  const [desktop, setDesktop] = useState<CameraControlsFlags>(() => load().desktop);
  const [mobile, setMobile] = useState<CameraControlsFlags>(() => load().mobile);

  const persist = useCallback((d: CameraControlsFlags, m: CameraControlsFlags) => {
    updateSettings('controls', { cameraControls: { desktop: d, mobile: m } });
  }, []);

  const toggleDesktop = useCallback((key: keyof CameraControlsFlags) => {
    setDesktop(prev => {
      const next = { ...prev, [key]: !prev[key] };
      setMobile(m => { persist(next, m); return m; });
      return next;
    });
  }, [persist]);

  const toggleMobile = useCallback((key: keyof CameraControlsFlags) => {
    setMobile(prev => {
      const next = { ...prev, [key]: !prev[key] };
      setDesktop(d => { persist(d, next); return d; });
      return next;
    });
  }, [persist]);

  return (
    <CameraControlsContext.Provider value={{ desktop, mobile, toggleDesktop, toggleMobile }}>
      {children}
    </CameraControlsContext.Provider>
  );
}

export function useCameraControls() {
  return useContext(CameraControlsContext);
}
