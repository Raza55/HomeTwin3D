import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { setSimulationSettingsOverride } from '../services/settingsStore';
import { setSimulationConfigOverride } from '../services/configApi';
import { SIMULATION_CONFIG, SIMULATION_SETTINGS } from '../data/simulationData';

/** Module-level flag readable outside React (e.g. from settingsStore). */
let _simulationActive = false;
export function isSimulationActive(): boolean {
  return _simulationActive;
}

interface SimulationModeValue {
  simulationMode: boolean;
  setSimulationMode: (on: boolean) => void;
}

const SimulationModeContext = createContext<SimulationModeValue>({
  simulationMode: false,
  setSimulationMode: () => {},
});

export function SimulationModeProvider({ children }: { children: ReactNode }) {
  const [simulationMode, setSimulationModeState] = useState(false);

  const setSimulationMode = useCallback((on: boolean) => {
    _simulationActive = on;
    if (on) {
      setSimulationSettingsOverride(SIMULATION_SETTINGS);
      setSimulationConfigOverride(SIMULATION_CONFIG);
    } else {
      setSimulationSettingsOverride(null);
      setSimulationConfigOverride(null);
    }
    setSimulationModeState(on);
  }, []);

  return (
    <SimulationModeContext.Provider value={{ simulationMode, setSimulationMode }}>
      {children}
    </SimulationModeContext.Provider>
  );
}

export function useSimulationMode() {
  return useContext(SimulationModeContext);
}
