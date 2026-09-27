import { useOSData } from '../core/context';

/** The photos in Jincheng's Photos library. */
export function usePhotos() {
  return useOSData().photos;
}
