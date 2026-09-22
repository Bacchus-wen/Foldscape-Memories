import { useEffect, useEffectEvent, useRef } from 'react';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { ArrowDown, ArrowLeft, ArrowRight, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { MEMORY_PHOTOS } from '../iphone-duo/memory-photos';
import { motion, useReducedMotion } from 'motion/react';

gsap.registerPlugin(Observer);

// The photographs live in the phone's WebGL scene. This layer only handles
// gestures and accessible controls; it never draws an image over the screen.
export default function MemoryPhotoRibbon({ journey, visible, disabled }) {
  const gesture = useRef(null), start = useRef(0);
  const { position, frame } = journey;
  const press = useEffectEvent(() => { journey.stop(); start.current = journey.position; });
  const move = useEffectEvent(observer => {
    const delta = observer.axis === 'y' ? observer.startY - observer.y : observer.startX - observer.x;
    journey.move(start.current + delta / Math.max(220, Math.min(600, gesture.current.parentElement.clientWidth * .7)));
  });
  useEffect(() => {
    if (!visible || disabled) return;
    const observer = Observer.create({
      id: 'memory-gallery-drag', target: gesture.current, type: 'pointer,touch',
      preventDefault: true, lockAxis: true, dragMinimum: 3,
      onPress: press, onDrag: move,
    });
    return () => observer.kill();
  }, [visible, disabled]);
  return <div className={`memory-photo-ribbon ${visible ? '' : 'is-hidden'}`} aria-hidden={!visible} inert={!visible || undefined}>
    <div ref={gesture} className="memory-photo-gesture" hidden={!visible || disabled || position < .98} role="group" aria-label="Browse photographs. Scroll or drag horizontally." tabIndex={disabled ? -1 : 0}
      onKeyDown={event => {
        if (disabled) return;
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (event.key === 'Home') journey.reset();
          else if (event.key === 'End') journey.select(MEMORY_PHOTOS.length - 1);
          else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') journey.select(position < 1 ? 0 : Math.min(MEMORY_PHOTOS.length - 1, Math.floor(frame.cursor) + 1));
          else if (position <= 1) journey.reset();
          else journey.select(Math.max(0, Math.ceil(frame.cursor) - 1));
        }
      }}>
      {visible && !disabled && position >= .98 && <div className="memory-drag-cue" aria-hidden="true"><ArrowLeft size={17} /><span>Drag to explore</span><ArrowRight size={17} /></div>}
    </div>
  </div>;
}

export function MemoryPhotoNavigation({ journey, visible, disabled }) {
  const { position, frame } = journey;
  const availableCount = journey.availableCount ?? MEMORY_PHOTOS.length;
  const reduced = useReducedMotion();
  return <motion.div className="memory-photo-navigation" hidden={!visible} layout="position" layoutDependency={`${position >= .98}:${visible}`} transition={{ duration: reduced ? 0 : .65, ease: [.22, 1, .36, 1] }}>
      {position < .98 && !disabled && <div className="memory-home-drag-cue"><ArrowLeft size={15} aria-hidden="true" /><span>Drag to rotate</span><ArrowRight size={15} aria-hidden="true" /></div>}
      {position < .98 ? <button type="button" className="memory-scroll-cue" disabled={disabled} onClick={() => journey.select(0)}><ArrowDown size={13} /><span>Scroll to discover</span></button> :
        <div className="memory-photo-controls" role="group" aria-label="Outer screen photographs">
          <button type="button" className="memory-icon-button" aria-label="Previous photograph" disabled={disabled || frame.cursor <= 0} onClick={() => journey.select(Math.max(0, Math.ceil(frame.cursor) - 1))}><CaretLeft size={17} /></button>
          <details className="memory-photo-index">
            <summary className="memory-photo-count" title="Choose a photograph" aria-label={`Photograph ${frame.index + 1} of ${MEMORY_PHOTOS.length}`}>{String(frame.index + 1).padStart(2, '0')} <span>/ {String(MEMORY_PHOTOS.length).padStart(2, '0')}</span></summary>
            <div className="memory-photo-dots">{MEMORY_PHOTOS.map((photo, i) => <button key={photo.id} type="button" disabled={disabled || i >= availableCount} title={photo.title} aria-label={`Photograph ${i + 1}: ${photo.title}`} aria-pressed={i === frame.index} onClick={event => { event.currentTarget.closest('details').open = false; journey.select(i); }}><span /></button>)}</div>
          </details>
          <button type="button" className="memory-icon-button" aria-label="Next photograph" disabled={disabled || frame.cursor >= availableCount - 1} onClick={() => journey.select(Math.min(MEMORY_PHOTOS.length - 1, Math.floor(frame.cursor) + 1))}><CaretRight size={17} /></button>
        </div>}
      {position >= .98 && <p className="memory-collection-hint">Scroll or drag to explore</p>}
  </motion.div>;
}
