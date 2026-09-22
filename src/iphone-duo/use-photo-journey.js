import { useEffect, useRef, useState } from 'react';
import { useMotionValue } from 'motion/react';
import { createPhotoJourney, samplePhotoJourney, photoJourneyUIKey } from './photo-journey';
import { MEMORY_PHOTOS } from './memory-photos';

export function usePhotoJourney(reduced, availableCount = MEMORY_PHOTOS.length) {
  const available = useRef(availableCount);
  available.current = availableCount;
  const motionPosition = useMotionValue(0);
  const [, setUIKey] = useState(photoJourneyUIKey(0, MEMORY_PHOTOS.length));
  const driver = useRef(null);
  useEffect(() => {
    let key = photoJourneyUIKey(0, MEMORY_PHOTOS.length);
    driver.current = createPhotoJourney({ count: MEMORY_PHOTOS.length, getLimit: () => available.current, onUpdate: value => {
      motionPosition.set(value);
      const nextKey = photoJourneyUIKey(value, MEMORY_PHOTOS.length);
      if (key !== nextKey) { key = nextKey; setUIKey(key); }
    } });
    const pause = () => driver.current.setPaused(document.hidden);
    document.addEventListener('visibilitychange', pause);
    return () => { document.removeEventListener('visibilitychange', pause); driver.current.dispose(); };
  }, []);
  useEffect(() => { if (reduced) driver.current?.seek(driver.current.target(), true); }, [reduced]);
  return {
    availableCount,
    motionPosition,
    get position() { return motionPosition.get(); },
    get frame() { return samplePhotoJourney(motionPosition.get(), MEMORY_PHOTOS.length); },
    select: index => driver.current?.seek(index + 1, reduced),
    reset: (immediate = false) => driver.current?.seek(0, immediate || reduced),
    move: value => driver.current?.seek(value, true),
    nudge: delta => driver.current?.seek(driver.current.target() + delta, reduced, .28),
    stop: () => driver.current?.stop(),
  };
}
