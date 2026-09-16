import { useEffect, useRef, useState } from 'react';
import { createPhotoJourney, samplePhotoJourney } from './photo-journey';
import { MEMORY_PHOTOS } from './memory-photos';

export function usePhotoJourney(reduced) {
  const [position, setPosition] = useState(0);
  const driver = useRef(null);
  useEffect(() => {
    driver.current = createPhotoJourney({ count: MEMORY_PHOTOS.length, onUpdate: setPosition });
    const pause = () => driver.current.setPaused(document.hidden);
    document.addEventListener('visibilitychange', pause);
    return () => { document.removeEventListener('visibilitychange', pause); driver.current.dispose(); };
  }, []);
  useEffect(() => { if (reduced) driver.current?.seek(driver.current.target(), true); }, [reduced]);
  return {
    position, frame: samplePhotoJourney(position, MEMORY_PHOTOS.length),
    select: index => driver.current?.seek(index + 1, reduced),
    reset: (immediate = false) => driver.current?.seek(0, immediate || reduced),
    move: value => driver.current?.seek(value, true),
    nudge: delta => driver.current?.seek(driver.current.target() + delta, reduced, .28),
    stop: () => driver.current?.stop(),
  };
}
