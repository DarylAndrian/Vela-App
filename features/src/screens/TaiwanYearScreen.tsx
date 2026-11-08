import { useMemo, useState, type ChangeEvent, type CSSProperties } from 'react';

const MINGUO_OFFSET = 1911;

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow)',
  padding: '40px 32px 32px',
  textAlign: 'center',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '13px 16px 13px 42px',
  border: '2px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'inherit',
  fontSize: '1.1rem',
  fontWeight: 500,
  color: 'var(--text)',
  background: 'var(--surface-2)',
  outline: 'none',
};

const labelStyle: CSSProperties = {
  display: 'block',
  textAlign: 'left',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-2)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const resultBox = (visible: boolean): CSSProperties => ({
  marginTop: visible ? 24 : 0,
  padding: visible ? '20px' : 0,
  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  border: visible ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : 'none',
  borderRadius: 'var(--radius-md)',
  height: visible ? 'auto' : 0,
  overflow: 'hidden',
  opacity: visible ? 1 : 0,
  transition: 'opacity .25s, transform .25s',
});

function YearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

function FieldIcon({ kind }: { kind: 'gregorian' | 'minguo' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'gregorian' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
        </>
      ) : (
        <>
          <path d="M5 21V4M5 4h12l-2.5 4L17 12H5" />
        </>
      )}
    </svg>
  );
}

export function TaiwanYearScreen() {
  const [gregorianInput, setGregorianInput] = useState('');
  const [minguoInput, setMinguoInput] = useState('');

  const gregorianYear = useMemo(() => {
    const num = parseInt(gregorianInput, 10);
    return isNaN(num) ? null : num;
  }, [gregorianInput]);

  const minguoYear = useMemo(() => {
    const num = parseInt(minguoInput, 10);
    return isNaN(num) ? null : num;
  }, [minguoInput]);

  const convertedMinguo = useMemo(() => {
    if (gregorianYear === null) return null;
    const result = gregorianYear - MINGUO_OFFSET;
    return result >= 1 ? result : null;
  }, [gregorianYear]);

  const convertedGregorian = useMemo(() => {
    if (minguoYear === null) return null;
    return minguoYear + MINGUO_OFFSET;
  }, [minguoYear]);

  const handleGregorianChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setGregorianInput(val);
    if (val !== '') setMinguoInput('');
  };

  const handleMinguoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setMinguoInput(val);
    if (val !== '') setGregorianInput('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={card}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 20px',
            background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          }}>
            <YearIcon />
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, marginBottom: 6, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Taiwan Year Calculator
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.5 }}>
            Convert between Minguo (民國) and Gregorian calendar years
          </p>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle} htmlFor="gregorianInput">Gregorian Year</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', display: 'flex', pointerEvents: 'none' }}>
                <FieldIcon kind="gregorian" />
              </span>
              <input
                id="gregorianInput"
                type="text"
                inputMode="numeric"
                style={inputStyle}
                placeholder="e.g. 2025"
                value={gregorianInput}
                onChange={handleGregorianChange}
                autoComplete="off"
              />
            </div>
          </div>

          <div id="minguoResult" style={resultBox(convertedMinguo !== null)}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
              Minguo (民國) Year
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {convertedMinguo !== null ? `Year ${convertedMinguo}` : ' '}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0', color: 'var(--text-3)', fontSize: '0.75rem' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            or
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle} htmlFor="minguoInput">Minguo (民國) Year</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', display: 'flex', pointerEvents: 'none' }}>
                <FieldIcon kind="minguo" />
              </span>
              <input
                id="minguoInput"
                type="text"
                inputMode="numeric"
                style={inputStyle}
                placeholder="e.g. 114"
                value={minguoInput}
                onChange={handleMinguoChange}
                autoComplete="off"
              />
            </div>
          </div>

          <div id="gregorianResult" style={resultBox(convertedGregorian !== null)}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
              Gregorian Year
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {convertedGregorian !== null ? `Year ${convertedGregorian}` : ' '}
            </div>
          </div>

          <p style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: 1.6 }}>
            Formula: <code style={{ background: 'var(--surface-2)', padding: '0.15em 0.4em', borderRadius: 4, fontFamily: 'var(--mono)', fontSize: '0.8em', color: 'var(--text-2)' }}>Gregorian = Minguo + 1911</code>
            <br />
            The Minguo calendar starts from 1912, the founding of the Republic of China.
          </p>
        </div>
      </div>
    </div>
  );
}
