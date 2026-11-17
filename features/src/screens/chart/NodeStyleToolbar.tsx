import type { NodeStyle } from '../../lib/chartCodeStyles';

function ColorField({ label, value, onChange }: {
  label: string; value: string | undefined; onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.5px', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 26, padding: '0 7px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7 }}>
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 13, height: 13, padding: 0, border: '1px solid var(--border-strong)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
        />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)' }}>{value || 'auto'}</span>
        {value !== undefined && (
          <span onClick={() => onChange(undefined)}
            style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>×</span>
        )}
      </div>
    </div>
  );
}

export function NodeStyleToolbar({ nodeId, style, onChange, onClose }: {
  nodeId: string;
  style: NodeStyle;
  onChange: (patch: Partial<NodeStyle>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="node-style-toolbar"
      data-export-ignore
      style={{
        position: 'absolute', right: 18, bottom: 18, width: 252, zIndex: 20,
        background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lift)', padding: '14px 15px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: 'var(--text-2)' }}>
          STYLE — NODE <span style={{ color: 'var(--accent-text)', fontFamily: 'var(--mono)' }}>{nodeId}</span>
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        <ColorField label="FILL" value={style.fill} onChange={(v) => onChange({ fill: v })} />
        <ColorField label="STROKE" value={style.stroke} onChange={(v) => onChange({ stroke: v })} />
        <ColorField label="TEXT" value={style.color} onChange={(v) => onChange({ color: v })} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.5px', marginBottom: 5 }}>FONT</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <div
              onClick={() => onChange({ fontWeight: style.fontWeight === 'bold' ? undefined : 'bold' })}
              style={{
                width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: style.fontWeight === 'bold' ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--surface)',
                border: `1px solid ${style.fontWeight === 'bold' ? 'var(--accent)' : 'var(--border)'}`,
                color: style.fontWeight === 'bold' ? 'var(--accent)' : 'var(--text-2)',
              }}
            >B</div>
            <div
              onClick={() => onChange({ fontStyle: style.fontStyle === 'italic' ? undefined : 'italic' })}
              style={{
                width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontStyle: 'italic',
                background: style.fontStyle === 'italic' ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--surface)',
                border: `1px solid ${style.fontStyle === 'italic' ? 'var(--accent)' : 'var(--border)'}`,
                color: style.fontStyle === 'italic' ? 'var(--accent)' : 'var(--text-2)',
              }}
            >I</div>
            <input
              type="number"
              min={8}
              max={48}
              placeholder="px"
              value={style.fontSize ?? ''}
              onChange={(e) => onChange({ fontSize: e.target.value ? e.target.value : undefined })}
              style={{
                flex: 1, width: '100%', height: 26, borderRadius: 7, padding: '0 6px',
                fontSize: 12, fontFamily: 'var(--mono)',
              }}
            />
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.5 }}>
        Writes a <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent-text)' }}>style {nodeId} …</code> line into the source — saved with the chart.
      </div>
    </div>
  );
}
