import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './OptionWheel.css';

export default function OptionWheel({
  items,
  selected,
  defaultSelected = 0,
  onChange,
  textColor = '#86868b',
  activeColor = '#1d1d1f',
  side = 'right',
  fontSize = 0.86,
  spacing = 2.25,
  curve = 0.9,
  tilt = 10,
  blur = 1.2,
  fade = 0.22,
  minOpacity = 0.08,
  smoothing = 180,
  inset = 28,
  loop = false,
  draggable = true,
  soundUrl = '',
  soundVolume = 0.5,
  ariaLabel = 'Option wheel',
  className = '',
}) {
  const initial = Number.isFinite(selected) ? selected : defaultSelected;
  const rootRef = useRef(null);
  const itemRefs = useRef([]);
  const posRef = useRef(initial);
  const targetRef = useRef(initial);
  const selectedRef = useRef(initial);
  const committedRef = useRef(initial);
  const controlledSelectedRef = useRef(initial);
  const cfgRef = useRef({});
  const onChangeRef = useRef(onChange);
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const wheelTimerRef = useRef(null);
  const dragRef = useRef(null);
  const dragMovedRef = useRef(false);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const lastTickRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);

  onChangeRef.current = onChange;
  cfgRef.current = {
    count: items.length,
    items,
    rowH: Math.max(fontSize * spacing * 16, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume,
  };

  const runFrame = useCallback((now) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const cfg = cfgRef.current;
    const k = 1 - Math.exp(-dt / (Math.max(cfg.smoothing, 1) / 1000));
    const target = targetRef.current;
    let next = posRef.current + (target - posRef.current) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    posRef.current = next;

    const mirror = cfg.side === 'right' ? -1 : 1;
    const tiltRad = (cfg.tilt * Math.PI) / 180;
    const radius = tiltRad > 0.0005 ? cfg.rowH / tiltRad : 0;
    itemRefs.current.forEach((element, index) => {
      if (!element) return;
      let distanceFromCenter = index - next;
      if (cfg.loop && cfg.count > 1) {
        distanceFromCenter = ((distanceFromCenter % cfg.count) + cfg.count) % cfg.count;
        if (distanceFromCenter > cfg.count / 2) distanceFromCenter -= cfg.count;
      }
      const distance = Math.abs(distanceFromCenter);
      let x = 0;
      let y = distanceFromCenter * cfg.rowH;
      let rotation = 0;
      if (radius > 0) {
        const angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, distanceFromCenter * tiltRad));
        y = radius * Math.sin(angle);
        x = -mirror * radius * (1 - Math.cos(angle)) * cfg.curve;
        rotation = (mirror * angle * 180) / Math.PI;
      }
      element.style.transform = `translate3d(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%), 0) rotate(${rotation.toFixed(3)}deg)`;
      element.style.opacity = String(Math.max(cfg.minOpacity, 1 - distance * cfg.fade));
      element.style.filter = cfg.blur > 0 ? `blur(${(distance * cfg.blur).toFixed(2)}px)` : 'none';
      element.style.setProperty('--ow-p', Math.max(0, 1 - Math.min(distance, 1)).toFixed(4));
    });
    rafRef.current = settled ? null : requestAnimationFrame(runFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const playTick = useCallback(() => {
    const cfg = cfgRef.current;
    if (!cfg.soundUrl || performance.now() - lastTickRef.current < 70) return;
    lastTickRef.current = performance.now();
    if (!audioRef.current || audioUrlRef.current !== cfg.soundUrl) {
      audioRef.current = new Audio(cfg.soundUrl);
      audioRef.current.preload = 'auto';
      audioUrlRef.current = cfg.soundUrl;
    }
    audioRef.current.volume = Math.min(Math.max(cfg.soundVolume, 0), 1);
    audioRef.current.currentTime = 0;
    audioRef.current.play()?.catch(() => {});
  }, []);

  const applyTarget = useCallback((value, snap, notify = true) => {
    const cfg = cfgRef.current;
    if (!cfg.count) return;
    let next = value;
    if (!cfg.loop) next = Math.min(Math.max(next, 0), cfg.count - 1);
    if (snap) next = Math.round(next);
    targetRef.current = next;
    const index = ((Math.round(next) % cfg.count) + cfg.count) % cfg.count;
    if (index !== selectedRef.current) {
      selectedRef.current = index;
      setSelectedIndex(index);
    }
    if (snap && notify && index !== committedRef.current) {
      committedRef.current = index;
      controlledSelectedRef.current = index;
      onChangeRef.current?.(index, cfg.items[index]);
      playTick();
    }
    startLoop();
  }, [playTick, startLoop]);

  useEffect(() => {
    if (!Number.isFinite(selected) || selected === controlledSelectedRef.current) return;
    controlledSelectedRef.current = selected;
    committedRef.current = selected;
    applyTarget(selected, true, false);
  }, [selected, applyTarget]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      const cfg = cfgRef.current;
      const delta = event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
      applyTarget(targetRef.current + Math.max(-1, Math.min(1, delta / cfg.rowH)), false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget]);

  useLayoutEffect(() => {
    applyTarget(targetRef.current, false, false);
  }, [items, fontSize, spacing, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, applyTarget]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioRef.current?.pause();
  }, []);

  const handlePointerDown = (event) => {
    if (!cfgRef.current.draggable) return;
    dragRef.current = { y: event.clientY, start: targetRef.current, id: event.pointerId };
    dragMovedRef.current = false;
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientY - drag.y;
    if (!dragMovedRef.current && Math.abs(delta) > 4) {
      dragMovedRef.current = true;
      rootRef.current?.setPointerCapture(drag.id);
    }
    if (dragMovedRef.current) applyTarget(drag.start - delta / cfgRef.current.rowH, false);
  };

  const handlePointerEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
  };

  const handleItemClick = (index) => {
    if (dragMovedRef.current) return;
    const cfg = cfgRef.current;
    const current = targetRef.current;
    let delta = index - (((current % cfg.count) + cfg.count) % cfg.count);
    if (cfg.loop && cfg.count > 1) {
      if (delta > cfg.count / 2) delta -= cfg.count;
      if (delta < -cfg.count / 2) delta += cfg.count;
    }
    applyTarget(current + delta, true);
  };

  const handleKeyDown = (event) => {
    let delta = 0;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') delta = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') delta = 1;
    if (!delta) return;
    event.preventDefault();
    applyTarget(Math.round(targetRef.current) + delta, true);
  };

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`option-wheel${side === 'right' ? ' option-wheel--right' : ''}${isDragging ? ' option-wheel--dragging' : ''}${className ? ` ${className}` : ''}`}
      style={{
        '--ow-text-color': textColor,
        '--ow-active-color': activeColor,
        '--ow-font-size': `${fontSize}rem`,
        '--ow-inset': `${inset}px`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {items.map((label, index) => (
        <button
          type="button"
          key={`${label}-${index}`}
          ref={(element) => { itemRefs.current[index] = element; }}
          role="option"
          aria-selected={selectedIndex === index}
          className={`option-wheel__item${selectedIndex === index ? ' option-wheel__item--selected' : ''}`}
          onClick={() => handleItemClick(index)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
