import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMermaidInteractivity, findMermaidNodeGroup, type MermaidInteractivityHandle,
} from '../../lib/useMermaidInteractive';
import { prepareMermaidSource } from '../../lib/mermaidSource';
import { nextMermaidGraphId, renderMermaidSvg } from '../../lib/mermaidRuntime';
import { parseNodeStyle, type NodeStyle } from '../../lib/chartCodeStyles';
import { applyStyleToSvg } from '../../lib/mermaidViewerUtils';
import { NodeStyleToolbar } from './NodeStyleToolbar';
import { Spinner } from './Spinner';

interface ToolbarNode { id: string; x: number; y: number }

export function MermaidViewer({ source, layout, renderKey, onStyleChange, onToggleLayout }: {
  source: string;
  layout: 'elk' | 'dagre';
  renderKey: number;
  onStyleChange: (nodeId: string, style: NodeStyle) => void;
  onToggleLayout: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const interactivityRef = useRef<MermaidInteractivityHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [svgRenderTs, setSvgRenderTs] = useState(0);
  const [sourceSnapshot, setSourceSnapshot] = useState('');
  const [toolbarNode, setToolbarNode] = useState<ToolbarNode | null>(null);
  const [toolbarStyle, setToolbarStyle] = useState<NodeStyle>({});
  const toolbarNodeRef = useRef(toolbarNode);
  const toolbarStyleRef = useRef(toolbarStyle);
  const prevToolbarNodeIdRef = useRef<string | null>(null);
  toolbarNodeRef.current = toolbarNode;
  toolbarStyleRef.current = toolbarStyle;

  const preparedSource = prepareMermaidSource(source);

  useEffect(() => { setSourceSnapshot(preparedSource); }, [preparedSource]);

  const handleNodeClick = useCallback((nodeId: string, element: SVGGElement) => {
    setToolbarStyle(parseNodeStyle(sourceSnapshot, nodeId));
    const rect = element.getBoundingClientRect();
    const containerRect = scrollContainerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setToolbarNode({
        id: nodeId,
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 10,
      });
    }
  }, [sourceSnapshot]);

  const handleClearClick = useCallback(() => {
    setToolbarNode(null);
    setToolbarStyle({});
    prevToolbarNodeIdRef.current = null;
    interactivityRef.current?.clearSelection();
  }, []);

  // Live style overlay for the selected node; re-sync prior node from source
  useEffect(() => {
    if (!hostRef.current) return;
    const svg = hostRef.current.querySelector('svg');
    if (!svg) return;
    const prevId = prevToolbarNodeIdRef.current;
    if (prevId && prevId !== toolbarNode?.id) {
      const restored = parseNodeStyle(sourceSnapshot, prevId);
      if (Object.keys(restored).length > 0) applyStyleToSvg(svg, prevId, restored);
    }
    if (toolbarNode && Object.keys(toolbarStyle).length > 0) {
      applyStyleToSvg(svg, toolbarNode.id, toolbarStyle);
    }
    prevToolbarNodeIdRef.current = toolbarNode ? toolbarNode.id : null;
  }, [toolbarStyle, toolbarNode, sourceSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const el = hostRef.current;
    if (!el) return;
    setError(null);
    setRendering(true);

    const run = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        if (cancelled || !hostRef.current) return;
        const graphId = nextMermaidGraphId(`chart-${layout}-${renderKey}`);
        const svg = await renderMermaidSvg(mermaid, graphId, preparedSource, layout);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;

        const selected = toolbarNodeRef.current;
        const selectedStyle = toolbarStyleRef.current;
        const renderedSvg = hostRef.current.querySelector('svg');
        if (selected && renderedSvg) applyStyleToSvg(renderedSvg, selected.id, selectedStyle);

        if (interactivityRef.current) interactivityRef.current.destroy();
        interactivityRef.current = applyMermaidInteractivity(hostRef.current, {
          onNodeClick: handleNodeClick,
          onClearClick: handleClearClick,
          initialSelectedNodeId: selected?.id ?? null,
        });

        if (selected && renderedSvg) {
          const nodeEl = findMermaidNodeGroup(renderedSvg, selected.id);
          const containerRect = scrollContainerRef.current?.getBoundingClientRect();
          if (nodeEl && containerRect) {
            const rect = nodeEl.getBoundingClientRect();
            setToolbarNode({
              id: selected.id,
              x: rect.left - containerRect.left + rect.width / 2,
              y: rect.top - containerRect.top - 10,
            });
          }
        }
        setSvgRenderTs(Date.now());
        setRendering(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        if (hostRef.current) hostRef.current.innerHTML = '';
        setRendering(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (interactivityRef.current) {
        interactivityRef.current.destroy();
        interactivityRef.current = null;
      }
    };
  }, [renderKey, layout, preparedSource, handleNodeClick, handleClearClick]);

  // Zoom
  useEffect(() => {
    const svg = hostRef.current?.querySelector('svg');
    if (!svg) return;
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[ ,]+/).map(Number);
      if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3])) {
        svg.style.width = `${parts[2] * zoom}px`;
        svg.style.height = `${parts[3] * zoom}px`;
        svg.style.maxWidth = 'none';
      }
    }
  }, [zoom, svgRenderTs]);

  const autoFit = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    const svg = hostRef.current?.querySelector('svg');
    if (!scrollContainer || !svg) return;
    const viewBox = svg.getAttribute('viewBox');
    if (!viewBox) return;
    const parts = viewBox.split(/[ ,]+/).map(Number);
    if (parts.length !== 4) return;
    const availableW = scrollContainer.clientWidth - 48;
    const availableH = scrollContainer.clientHeight - 48;
    const fit = Math.min(availableW / parts[2], availableH / parts[3], 3);
    setZoom(Math.max(0.1, fit));
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await containerRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  };

  const onToolbarChange = (patch: Partial<NodeStyle>) => {
    if (!toolbarNode) return;
    const merged = { ...toolbarStyle, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v === undefined) delete (merged as Record<string, unknown>)[k];
    setToolbarStyle(merged);
    onStyleChange(toolbarNode.id, merged);
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
      <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.7px', color: 'var(--text-3)', textTransform: 'uppercase', marginRight: 4 }}>Preview</span>
        <div className="chip" style={{ padding: '4.5px 11px', fontSize: 12 }} onClick={autoFit}>Auto Fit</div>
        <select
          value={zoom >= 2.5 ? 3 : zoom >= 1.75 ? 2 : zoom >= 1.25 ? 1.5 : 1}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ height: 27, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font)', padding: '0 7px' }}
        >
          <option value={1}>100%</option>
          <option value={1.5}>150%</option>
          <option value={2}>200%</option>
          <option value={3}>300%</option>
        </select>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
          ELK
          <div
            onClick={onToggleLayout}
            style={{
              width: 34, height: 19, borderRadius: 99, cursor: 'pointer', position: 'relative',
              background: layout === 'dagre' ? 'var(--bar)' : 'var(--accent)',
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2.5,
              left: layout === 'dagre' ? 2.5 : 17, transition: 'left .15s ease',
            }} />
          </div>
          dagre
        </div>
        <button className="icon-btn" style={{ width: 29, height: 29 }} title="Fullscreen" onClick={toggleFullscreen}>
          <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
        </button>
      </div>

      {error && (
        <div style={{
          margin: '10px 13px 0', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12,
          color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--red) 32%, transparent)',
        }}>Could not render: {error}</div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div ref={scrollContainerRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div ref={hostRef} className="mermaid-host" />
        </div>
        {rendering && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--surface) 72%, transparent)', backdropFilter: 'blur(2px)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--accent-text)', display: 'inline-flex' }}><Spinner size={26} /></span>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Rendering diagram…</div>
            </div>
          </div>
        )}
      </div>

      {toolbarNode && (
        <NodeStyleToolbar
          nodeId={toolbarNode.id}
          style={toolbarStyle}
          onChange={onToolbarChange}
          onClose={handleClearClick}
        />
      )}
    </div>
  );
}
