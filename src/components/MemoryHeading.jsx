import { useLayoutEffect, useRef } from 'react';

// Measure the two editorial layouts, then move the same visible words between them.
// Scroll updates only transforms; no React render or text replacement per frame.
export default function MemoryHeading({ reveal }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    const element = root.current;
    const words = [...element.querySelectorAll('[data-word]')];
    let geometry = [];
    const paint = () => {
      const t = reveal.get();
      words.forEach((word, i) => {
        const g = geometry[i];
        if (!g) return;
        word.style.transform = `translate3d(${g.x + (g.toX - g.x) * t}px, ${g.y + (g.toY - g.y) * t}px, 0) scale(${1 + (g.scale - 1) * t})`;
        word.style.opacity = '1';
      });
    };
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      geometry = words.map((word, i) => {
        const from = element.querySelector(`[data-start="${i}"]`);
        const to = element.querySelector(`[data-end="${i}"]`);
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        const style = getComputedStyle(from);
        word.style.fontSize = style.fontSize;
        word.style.lineHeight = style.lineHeight;
        return { x: a.left - bounds.left, y: a.top - bounds.top, toX: b.left - bounds.left, toY: b.top - bounds.top, scale: parseFloat(getComputedStyle(to).fontSize) / parseFloat(style.fontSize) };
      });
      paint();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    let live = true;
    document.fonts.ready.then(() => { if (live) measure(); });
    const unsubscribe = reveal.on('change', paint);
    return () => { live = false; observer.disconnect(); unsubscribe(); };
  }, [reveal]);
  return <div ref={root} className="memory-travel-heading">
    <div className="memory-title-measure memory-title-start" aria-hidden="true"><span className="memory-title-type"><span data-start="0">Some places</span>{' '}<em data-start="1">stay with you.</em></span></div>
    <div className="memory-title-measure memory-title-end" aria-hidden="true"><span className="memory-display-title"><span data-end="0">Some places</span><br /><em data-end="1">stay with you.</em></span></div>
    <h1 className="memory-moving-title"><span data-word="0">Some places</span>{' '}<em data-word="1">stay with you.</em></h1>
  </div>;
}
