import { useMemo, useState, type ChangeEvent } from 'react';

const MINGUO_OFFSET = 1911;

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
    <main className="page desktop-workspace year-workspace">
      <div className="card-panel year-fields">
        <div className="field">
          <label htmlFor="gregorianInput">Gregorian year</label>
          <input id="gregorianInput" type="text" inputMode="numeric" autoComplete="off"
            placeholder="2025" value={gregorianInput} onChange={handleGregorianChange} />
          <div className="year-result">
            <span>Minguo (民國)</span>
            <output id="minguoResult" htmlFor="gregorianInput">
              {convertedMinguo !== null ? `Year ${convertedMinguo}` : '—'}
            </output>
          </div>
          {gregorianYear !== null && convertedMinguo === null && (
            <p className="year-hint">Enter a Gregorian year of 1912 or later.</p>
          )}
        </div>
        <div className="field">
          <label htmlFor="minguoInput">Minguo (民國) year</label>
          <input id="minguoInput" type="text" inputMode="numeric" autoComplete="off"
            placeholder="114" value={minguoInput} onChange={handleMinguoChange} />
          <div className="year-result">
            <span>Gregorian</span>
            <output id="gregorianResult" htmlFor="minguoInput">
              {convertedGregorian !== null ? `Year ${convertedGregorian}` : '—'}
            </output>
          </div>
        </div>
      </div>
      <p className="year-hint">Gregorian year = Minguo year + 1911</p>
    </main>
  );
}
