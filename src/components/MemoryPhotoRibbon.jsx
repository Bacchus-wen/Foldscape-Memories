import { useEffect, useEffectEvent, useRef } from 'react';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { ArrowDown, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { MEMORY_PHOTOS } from '../iphone-duo/memory-photos';

gsap.registerPlugin(Observer);

// The photographs live in the phone's WebGL scene. This layer only handles
// gestures and accessible controls; it never draws an image over the screen.
export default function MemoryPhotoRibbon({ journey, visible, disabled }) {
  const gesture = useRef(null), start = useRef(0);
  const { position, frame } = journey;
  const press = useEffectEvent(() => { journey.stop(); start.current = position; });
  const move = useEffectEvent(observer => {
    const delta = observer.axis === 'y' ? observer.startY - observer.y : observer.startX - observer.x;
    journey.move(start.current + delta / Math.max(220, Math.min(600, gesture.current.clientWidth * .7)));
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
    <div ref={gesture} className="memory-photo-gesture" role="group" aria-label="Browse photographs. Scroll or drag horizontally." tabIndex={disabled ? -1 : 0}
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
      }} />
    <div className="memory-photo-navigation">
      {position < .98 ? <button type="button" className="memory-scroll-cue" disabled={disabled} onClick={() => journey.select(0)}><ArrowDown size={13} /><span>Scroll to discover</span></button> :
        <div className="memory-photo-controls" role="group" aria-label="Outer screen photographs">
          <button type="button" className="memory-icon-button" aria-label="Previous photograph" disabled={disabled || frame.cursor <= 0} onClick={() => journey.select(Math.max(0, Math.ceil(frame.cursor) - 1))}><CaretLeft size={17} /></button>
          <div className="memory-photo-dots">{MEMORY_PHOTOS.map((photo, i) => <button key={photo.id} type="button" disabled={disabled} aria-label={`Photograph ${i + 1}: ${photo.title}`} aria-pressed={i === frame.index} onClick={() => journey.select(i)}><span /></button>)}</div>
          <button type="button" className="memory-icon-button" aria-label="Next photograph" disabled={disabled || frame.cursor >= MEMORY_PHOTOS.length - 1} onClick={() => journey.select(Math.min(MEMORY_PHOTOS.length - 1, Math.floor(frame.cursor) + 1))}><CaretRight size={17} /></button>
        </div>}
      {position >= .98 && <p className="memory-collection-hint">Scroll or drag to move between moments</p>}
    </div>
  </div>;
}
