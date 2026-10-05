import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'aqualab.debug';

interface Debug {
  debug: boolean;
  setDebug: (value: boolean) => void;
}

const DebugContext = createContext<Debug>({ debug: false, setDebug: () => undefined });

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Debug mode: elements hidden because of missing permissions are displayed
 * (outlined in red) so the user can check that the API really refuses them.
 */
export function DebugProvider({ children }: { children: ReactNode }) {
  const [debug, setDebug] = useState(readStored);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(debug));
    } catch {
      // Storage unavailable: the preference is simply not remembered.
    }
  }, [debug]);
  return <DebugContext.Provider value={{ debug, setDebug }}>{children}</DebugContext.Provider>;
}

export function useDebug() {
  return useContext(DebugContext);
}
