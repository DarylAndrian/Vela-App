import { useEffect, useRef, useState } from 'react';
import { prepareMermaidSource } from '../../lib/mermaidSource';
import { nextMermaidGraphId, renderMermaidSvg } from '../../lib/mermaidRuntime';

const cache = new Map<string, string | null>();

function Placeholder({ faded }: { faded?: boolean }) {
  return (
    <svg viewBox="0 0 200 96" style={{ width: '100%', height: '100%', opacity: faded ? 0.45 : 1 }}>
      <rect x="24" y="20" width="52" height="18" rx="5" fill="var(--accent)" opacity=".8" />
      <rect x="122" y="56" width="52" height="18" rx="5" fill="var(--accent)" opacity=".8" />
      <rect x="80" y="38" width="42" height="18" rx="5" fill="none" stroke="var(--accent)" strokeWidth="1.4" opacity=".9" />
      <path d="M76 29 C100 29 90 47 80 47" stroke="var(--accent)" strokeWidth="1.3" fill="none" opacity=".6" />
      <path d="M122 47 C140 47 136 65 122 65" stroke="var(--accent)" strokeWidth="1.3" fill="none" opacity=".6" />
    </svg>
  );
}

export function ChartThumb({ cacheKey, source }: { cacheKey: string; source: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null | undefined>(() => cache.get(cacheKey));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (cache.has(cacheKey)) { setSvg(cache.get(cacheKey)); return; }
    if (!visible) return;
    if (!source.trim()) { cache.set(cacheKey, null); setSvg(null); return; }
    let cancelled = false;
    void (async () => {
      let out: string | null = null;
      try {
        const mermaid = (await import('mermaid')).default;
        if (cancelled) return;
        out = await renderMermaidSvg(mermaid, nextMermaidGraphId('thumb'), prepareMermaidSource(source), 'elk');
      } catch { /* invalid source: keep the placeholder */ }
      cache.set(cacheKey, out);
      if (!cancelled) setSvg(out);
    })();
    return () => { cancelled = true; };
  }, [cacheKey, source, visible]);

  useEffect(() => {
    const el = hostRef.current?.querySelector('.thumb-render svg') as SVGSVGElement | null;
    if (!el) return;
    el.removeAttribute('height');
    el.setAttribute('width', '100%');
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    el.style.cssText = 'display:block;width:100%;height:100%;max-width:100%;';
  }, [svg]);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {svg ? (
        <div className="thumb-render" style={{ width: '100%', height: '100%', padding: 10, boxSizing: 'border-box' }}
          dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <Placeholder faded={svg === undefined} />
      )}
    </div>
  );
}
