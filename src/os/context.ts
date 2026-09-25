import { createContext, useContext } from 'react';
import type { OSData } from './types';

export const OSDataContext = createContext<OSData | null>(null);

export function useOSData(): OSData {
  const data = useContext(OSDataContext);
  if (!data) throw new Error('useOSData must be used inside <OSDataContext.Provider>');
  return data;
}
