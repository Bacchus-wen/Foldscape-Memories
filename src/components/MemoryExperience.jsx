import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion, useSpring } from 'motion/react';
import { ArrowUpRight, ArrowsClockwise, CaretRight, Check, ImageSquare, Pause, Play, Rewind, SlidersHorizontal, SpeakerHigh, SpeakerSlash, X } from '@phosphor-icons/react';
import MemoryPhotoRibbon from './MemoryPhotoRibbon';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { MEMORY_PHOTOS } from '../iphone-duo/memory-photos';
gsap.registerPlugin(Observer);

function MemoryDialog({ open, onClose, title, className = '', children }) {
  const ref = useRef(null);
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  useEffect(() => {
    let cancelled = false;
    if (open) {
      if (!ref.current.open) ref.current.showModal();
      controls.start({ opacity: 1, y: 0, transition: { duration: reduced ? 0 : .25 } });
    } else if (ref.current.open) {
      controls.start({ opacity: 0, y: 14, transition: { duration: reduced ? 0 : .18 } }).then(() => {
        if (!cancelled) ref.current?.close();
      });
    }
    return () => { cancelled = true; };
  }, [open, controls, reduced]);
  return <dialog ref={ref} className={`memory-dialog ${className}`} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <motion.div className="memory-dialog-surface" initial={{ opacity: 0, y: 14 }} animate={controls}>
      <div className="memory-dialog-heading"><h2>{title}</h2><button className="memory-icon-button" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={20} /></button></div>
      {children}
    </motion.div>
  </dialog>;
}

// The restrained spring tilt follows React Bits' Tilted Card interaction pattern.
// Source reference: https://reactbits.dev/components/tilted-card
function PhotoEntrance({ onClick, photo }) {
  const reduced = useReducedMotion();
  const rotateX = useSpring(0, { stiffness: 180, damping: 24 });
  const rotateY = useSpring(0, { stiffness: 180, damping: 24 });
  return <motion.button type="button" className="memory-photo-entrance" onClick={onClick}
    style={{ rotateX, rotateY }}
    onPointerMove={event => {
      if (reduced || event.pointerType !== 'mouse') return;
      const rect = event.currentTarget.getBoundingClientRect();
      rotateX.set(-(event.clientY - rect.top - rect.height / 2) / rect.height * 5);
      rotateY.set((event.clientX - rect.left - rect.width / 2) / rect.width * 5);
    }} onPointerLeave={() => { rotateX.set(0); rotateY.set(0); }}>
    <span className="memory-photo-thumb"><img src={photo.image} alt="" /></span>
    <span><strong>{photo.title}</strong><span>View original photo <ArrowUpRight size={14} /></span></span>
  </motion.button>;
}

function SettingToggle({ title, detail, checked, onChange, disabled = false }) {
  return <div className="memory-setting-row"><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
    <button className="memory-switch" type="button" role="switch" aria-label={title} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>
  </div>;
}

export default function MemoryExperience({ children, photoJourney, photoCoverView, coverPhoto, pendingPhotoOpen, ready, error, phase, playing, rewinding, progress, fold, openingAngle, onPlay, onSeek, onReset, onStudio, viewLabel, presets, onPreset, onAngleChange, finish, onFinish, zoom, onZoom, autoOrbit, onAutoOrbit, livingScene, onLivingScene, sound, onOverlayChange }) {
  const [panel, setPanel] = useState(null);
  const root = useRef(null);
  const reduced = useReducedMotion();
  const immersive = fold > .13 || phase === 'exploring';
  const exploring = phase === 'exploring';
  const isReturning = phase === 'returning';
  const photo = MEMORY_PHOTOS[coverPhoto.index];
  const canRequestOpen = phase === 'cover' && coverPhoto.ready && photo.scene;
  const playLabel = pendingPhotoOpen || (!ready && !canRequestOpen) ? 'Preparing memory' : playing ? (rewinding ? 'Pause rewind' : 'Pause memory') : phase === 'paused' ? (rewinding ? 'Continue rewind' : 'Continue memory') : exploring ? 'Rewind' : 'Open memory';
  const status = error || (pendingPhotoOpen ? `Preparing ${photo.title} to unfold…` : !ready && !canRequestOpen ? 'Preparing your photograph…' : isReturning ? 'Returning to your photograph' : playing ? (rewinding ? 'A place, held in a photograph.' : 'A moment, unfolding.') : phase === 'paused' ? 'Take a breath. Continue when you’re ready.' : exploring ? 'Drag to look around · Scroll or pinch to zoom' : coverPhoto.busy ? 'Another moment comes into view.' : 'A photograph is only the beginning.');
  useEffect(() => { onOverlayChange(Boolean(panel)); }, [panel, onOverlayChange]);
  // Playback readiness includes !coverPhoto.busy and 3D asset loading. Using it
  // here disables the very gesture needed to finish a fractional photo transfer.
  const browse = coverPhoto.ready && photoCoverView && !pendingPhotoOpen && !panel;
  const scrollPhotographs = useEffectEvent(observer => {
    const delta = Math.abs(observer.deltaX) > Math.abs(observer.deltaY) ? observer.deltaX : observer.deltaY;
    photoJourney.nudge(delta / 700);
  });
  useEffect(() => {
    if (!browse) return;
    const element = root.current;
    const observer = Observer.create({
      id: 'memory-gallery-wheel', target: element, type: 'wheel', preventDefault: true,
      ignore: 'dialog, input, select, textarea',
      ignoreCheck: event => event.ctrlKey || (window.innerHeight < 740 && !event.target.closest('.memory-stage')),
      onChange: scrollPhotographs,
    });
    element.dataset.inputDriver = 'gsap-observer';
    return () => observer.kill();
  }, [browse]);
  useEffect(() => {
    if (playing) setPanel(null);
  }, [playing]);
  const transition = { duration: reduced ? 0 : .65, ease: [.22, 1, .36, 1] };
  return <div ref={root} className={`memory-experience ${immersive ? 'is-immersive' : 'is-cover'}`} data-phase={phase} data-journey={photoJourney.position.toFixed(4)} data-browsing={browse}>
    <a href="#memory-transport" className="memory-skip">Skip to memory controls</a>
    <header className="memory-header">
      <button type="button" className="memory-wordmark" onClick={onReset} aria-label="Nature Memories — return to cover">Nature Memories<span>.</span></button>
      <nav aria-label="Experience navigation">
        <button type="button" className="memory-studio-link" onClick={onStudio}>Wallpaper Studio <ArrowUpRight size={13} /></button>
        <span className="memory-nav-divider" aria-hidden="true" />
        <button className="memory-tools-link" type="button" aria-label="View & device" onClick={() => setPanel('tools')} aria-haspopup="dialog"><SlidersHorizontal size={18} /><span>View & device</span></button>
      </nav>
    </header>

    <motion.section className="memory-intro" aria-label="About this memory" aria-hidden={immersive} inert={immersive || undefined}
      animate={{ opacity: immersive ? 0 : 1, y: immersive ? -18 : 0 }} transition={transition}>
      <p className="memory-eyebrow">A place to return to</p>
      <h1>Some places<br /><em>stay with you.</em></h1>
      <p className="memory-description">A photograph, unfolded into a place<br className="memory-desktop-break" /> you can return to.</p>
      <PhotoEntrance photo={photo} onClick={() => setPanel('photo')} />
    </motion.section>
    <motion.div className="memory-scene-heading" aria-hidden={!immersive} inert={!immersive || undefined}
      animate={{ opacity: immersive ? 1 : 0, y: immersive ? 0 : 12 }} transition={transition}>
      <p className="memory-eyebrow">A moment, unfolded</p><h2>{photo.title}<span>.</span></h2>
      <p>Take your time. Look around.</p>
    </motion.div>

    <div className="memory-stage">{children}<MemoryPhotoRibbon journey={photoJourney} visible={photoCoverView} disabled={!browse} /></div>

    <footer className="memory-footer">
      <div className="memory-stage-caption"><span className="memory-caption-dot" />{photo.title}<span className="memory-caption-divider" />{photo.detail}</div>
      <div className="memory-transport" id="memory-transport" role="group" aria-label="Memory playback">
        <button className="memory-primary" type="button" disabled={(!ready && !canRequestOpen) || pendingPhotoOpen} onClick={onPlay} aria-label={playLabel}>
          {playing ? <Pause size={17} weight="fill" /> : exploring || (rewinding && phase === 'paused') ? <Rewind size={18} weight="fill" /> : <Play size={17} weight="fill" />}<span>{playLabel}</span>
        </button>
        <div className="memory-progress" style={{ '--memory-progress': `${progress * 100}%` }}>
          <div className="memory-progress-track" aria-hidden="true"><span /></div>
          <input type="range" min="0" max="1000" step="1" value={Math.round(progress * 1000)} onChange={event => onSeek(Number(event.target.value) / 1000)} aria-label="Memory progress" aria-valuetext={`${Math.round(progress * 100)} percent${isReturning ? ', returning to cover' : ''}`} disabled={!ready} />
          <span className="memory-progress-caption" aria-hidden="true">{isReturning ? 'RETURNING' : rewinding && progress > .001 && progress < .999 ? 'REWINDING' : progress < .01 ? 'PHOTOGRAPH' : progress >= .999 ? 'UNFOLDED' : 'UNFOLDING'}</span>
        </div>
        <div className="memory-transport-actions">
          <button type="button" className={`memory-icon-button memory-orbit-button ${autoOrbit && exploring ? 'is-on' : ''}`} aria-label={autoOrbit ? 'Pause automatic orbit' : 'Start automatic orbit'} aria-pressed={autoOrbit} disabled={!exploring || reduced} title={reduced ? 'Automatic orbit is off with reduced motion' : 'Automatic orbit'} onClick={() => onAutoOrbit(!autoOrbit)}><ArrowsClockwise size={20} /><span className="memory-active-dot" /></button>
          <button type="button" className="memory-icon-button" aria-label="View original photo" aria-haspopup="dialog" onClick={() => setPanel('photo')}><ImageSquare size={20} /></button>
          <button type="button" className={`memory-icon-button ${(sound.coast || sound.music) ? 'is-on' : ''}`} aria-label="Sound settings" aria-haspopup="dialog" onClick={() => setPanel('sound')}>{sound.coast || sound.music ? <SpeakerHigh size={20} /> : <SpeakerSlash size={20} />}</button>
        </div>
      </div>
      <p className="memory-status" role="status" aria-live="polite">{status}</p>
    </footer>

    <MemoryDialog open={panel === 'photo'} onClose={() => setPanel(null)} title="The original photograph" className="memory-photo-dialog">
      <figure><div className={`memory-original-frame ${photo.scene ? '' : 'is-study'}`}><img src={photo.image} alt={photo.title} /></div>
        <figcaption><strong>{photo.title}</strong><span>{photo.scene ? 'Where this memory begins.' : 'A photograph from the transition study.'}</span></figcaption></figure>
      <p className="memory-dialog-note">{photo.scene ? 'A photograph becomes a place you can look around.' : 'This photo previews the outer-screen transition. Select the lighthouse or scarlet sails to unfold.'}</p>
    </MemoryDialog>
    <MemoryDialog open={panel === 'tools'} onClose={() => setPanel(null)} title="View & device" className="memory-tools-dialog">
      <div className="memory-settings-section"><div className="memory-field-heading"><h3>Viewpoint</h3><span>{viewLabel}</span></div>
        <div className="memory-preset-list">{presets.map(preset => <button key={preset.id} type="button" aria-pressed={viewLabel === preset.label} onClick={() => onPreset(preset.id)}><span>{preset.label}</span>{viewLabel === preset.label ? <Check size={16} /> : <CaretRight size={16} />}</button>)}</div>
      </div>
      <div className="memory-settings-section"><div className="memory-field-heading"><h3>Opening angle</h3><output>{openingAngle}°</output></div>
        <input className="memory-setting-range" type="range" min="0" max="180" value={openingAngle} aria-label="Device opening angle" onChange={event => onAngleChange(Number(event.target.value))} />
        <div className="memory-angle-shortcuts">{[0, 90, 180].map(angle => <button key={angle} type="button" aria-pressed={openingAngle === angle} onClick={() => onPreset(angle)}>{angle === 0 ? 'Closed' : angle === 90 ? 'Half open' : 'Open'} <span>{angle}°</span></button>)}</div>
      </div>
      <div className="memory-settings-section"><div className="memory-field-heading"><h3>Zoom</h3><output>{Math.round(zoom * 100)}%</output></div><input className="memory-setting-range" type="range" min="72" max="155" value={Math.round(zoom * 100)} aria-label="Scene zoom" onChange={event => onZoom(Number(event.target.value) / 100)} /></div>
      <div className="memory-settings-section"><h3>Device finish</h3><div className="memory-finish-list">{[{ id: 'star-white', label: 'Star White' }, { id: 'night-sky', label: 'Night Sky' }].map(item => <button key={item.id} type="button" aria-pressed={finish === item.id} onClick={() => onFinish(item.id)}><i className={item.id} /><span>{item.label}</span>{finish === item.id && <Check size={15} />}</button>)}</div></div>
      <SettingToggle title="Living scene" detail={reduced ? 'Paused by your reduced-motion preference' : 'Water, coastal grass and lantern light'} checked={livingScene && !reduced} disabled={reduced} onChange={onLivingScene} />
      <button className="memory-reset-link" type="button" onClick={() => { onReset(); setPanel(null); }}>Return to photograph <Rewind size={17} /></button>
      <p className="memory-dialog-note">Drag to rotate. Use arrow keys to look around and + / − to zoom when the scene is focused.</p>
    </MemoryDialog>
    <MemoryDialog open={panel === 'sound'} onClose={() => setPanel(null)} title="A little atmosphere" className="memory-sound-dialog">
      <p className="memory-sound-intro">Let the coast come a little closer.</p>
      <SettingToggle title="Coast" detail="Soft wind and water" checked={sound.coast} onChange={sound.onCoast} />
      <SettingToggle title="Music" detail="A quiet, slowly changing ambient score" checked={sound.music} onChange={sound.onMusic} />
      <div className="memory-settings-section"><div className="memory-field-heading"><h3>Volume</h3><output>{Math.round(sound.volume * 100)}%</output></div><input className="memory-setting-range" type="range" min="0" max="100" aria-label="Sound volume" value={Math.round(sound.volume * 100)} onChange={event => sound.onVolume(Number(event.target.value) / 100)} /></div>
      <p className="memory-dialog-note">Sound follows the memory and fades as it closes.</p>
      {sound.error && <p className="memory-audio-error" role="alert">{sound.error}</p>}
    </MemoryDialog>
  </div>;
}
