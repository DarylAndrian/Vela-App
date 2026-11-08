import type { ConnectorSettings } from './types';

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field" style={{ marginBottom: 13 }}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((opt) => (
        <div
          key={opt}
          className={`chip${opt === value ? ' active' : ''}`}
          style={{ flex: 1, textAlign: 'center' }}
          onClick={() => onChange(opt)}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 34, height: 19, borderRadius: 99, flex: 'none', cursor: 'pointer', position: 'relative',
        background: on ? 'var(--accent)' : 'var(--bar)', transition: 'background .15s ease',
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2.5,
        left: on ? 17 : 2.5, transition: 'left .15s ease',
      }} />
    </div>
  );
}

function Range({ label, unit, min, max, step, value, onChange }: {
  label: string; unit: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <Field label={<span>{label} — <span style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{value}{unit}</span></span>}>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        style={{ padding: 0, accentColor: 'var(--accent)' }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

export function SettingsPanel({ settings, onChange }: {
  settings: ConnectorSettings;
  onChange: (partial: Partial<ConnectorSettings>) => void;
}) {
  return (
    <div className="card-panel" style={{ padding: '17px 18px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.7px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 13 }}>Layout</div>

      <Field label="Mode">
        <Chips options={['Row', 'Wrap']} value={settings.mode === 'row' ? 'Row' : 'Wrap'}
          onChange={(v) => onChange({ mode: v === 'Row' ? 'row' : 'wrap' })} />
      </Field>

      <Range label="Images per row" unit="" min={2} max={8} value={settings.perRow}
        onChange={(v) => onChange({ perRow: v })} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-2)' }}>Match heights</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Scale to row's shortest image</div>
        </div>
        <Toggle on={settings.matchHeights} onChange={(v) => onChange({ matchHeights: v })} />
      </div>

      <Range label="Gap (arrow space)" unit="px" min={0} max={160} value={settings.gap}
        onChange={(v) => onChange({ gap: v })} />
      <Range label="Padding" unit="px" min={0} max={100} value={settings.padding}
        onChange={(v) => onChange({ padding: v })} />

      <div style={{ height: 1, background: 'var(--border)', margin: '15px 0' }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.7px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 13 }}>Arrows</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        <Field label="Color">
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 32, padding: '0 9px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <input type="color" value={settings.arrowColor}
              onChange={(e) => onChange({ arrowColor: e.target.value })}
              style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)' }}>{settings.arrowColor}</span>
          </div>
        </Field>
        <Field label="Thickness">
          <input type="number" min={1} max={20} value={settings.arrowThickness}
            onChange={(e) => onChange({ arrowThickness: Number(e.target.value) })} />
        </Field>
      </div>
      <Range label="Arrowhead size" unit="px" min={8} max={48} value={settings.arrowHeadSize}
        onChange={(v) => onChange({ arrowHeadSize: v })} />

      <div style={{ height: 1, background: 'var(--border)', margin: '15px 0' }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.7px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 13 }}>Export</div>

      <Field label="Format">
        <Chips options={['PNG', 'JPEG']} value={settings.format === 'png' ? 'PNG' : 'JPEG'}
          onChange={(v) => onChange({ format: v === 'PNG' ? 'png' : 'jpeg' })} />
      </Field>

      {settings.format === 'jpeg' && (
        <Range label="JPEG quality" unit="%" min={60} max={95} value={Math.round(settings.quality * 100)}
          onChange={(v) => onChange({ quality: v / 100 })} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <Field label="Background">
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 32, padding: '0 9px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <input type="color" value={settings.background === 'transparent' ? '#ffffff' : settings.background}
              onChange={(e) => onChange({ background: e.target.value })}
              style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)' }}>{settings.background}</span>
          </div>
        </Field>
        <div className="chip" style={{ marginBottom: 15 }}
          onClick={() => onChange({ background: settings.background === 'transparent' ? '#ffffff' : 'transparent' })}>
          {settings.background === 'transparent' ? 'Use color' : 'Transparent'}
        </div>
      </div>
    </div>
  );
}
