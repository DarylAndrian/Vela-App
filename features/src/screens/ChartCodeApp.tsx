import { useCallback, useEffect, useState } from 'react';
import { vela, type ChartChanges, type ChartCode, type Product } from '../lib/ipc';
import { ChartCodeList } from './chart/ChartCodeList';
import { ChartCodeEditor } from './chart/ChartCodeEditor';

export function ChartCodeApp() {
  const [charts, setCharts] = useState<ChartCode[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openChart, setOpenChart] = useState<ChartCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDark = document.documentElement.dataset.theme !== 'light';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vela().charts.list();
      if (res.ok) {
        setCharts(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    } catch {
      setError('Could not load your charts. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Products are optional: without them the picker just offers "No product".
    vela().products.list().then((res) => { if (res.ok) setProducts(res.data); }).catch(() => {});
    vela().onAuthExpired(() => {
      // Session lost — send the user back to the connect screen.
      (window as any).launcher.openNative('connect.html');
    });
  }, [load]);

  // Editor navigation uses history so the toolbar Back button works.
  useEffect(() => {
    const onPop = () => setOpenChart(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = (chart: ChartCode) => {
    history.pushState({ chartId: chart.id }, '');
    setOpenChart(chart);
  };

  const back = () => history.back();

  const create = async (title: string) => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await vela().charts.create(title, 'flowchart TD\n  A[Start] --> B[End]\n');
      if (res.ok) {
        setCharts((prev) => [res.data, ...prev]);
        open(res.data);
      } else {
        setError(res.error);
      }
    } catch {
      setError('Could not create the chart. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  };

  const save = async (changes: ChartChanges) => {
    if (!openChart || saving) return;
    setSaving(true);
    try {
      const res = await vela().charts.update(openChart.id, changes);
      if (res.ok) {
        setOpenChart(res.data);
        setCharts((prev) => prev.map((c) => (c.id === res.data.id ? res.data : c)));
      } else {
        setError(res.error);
      }
    } catch {
      setError('Could not save your changes. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (chart: ChartCode) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await vela().charts.delete(chart.id);
      if (res.ok) {
        setCharts((prev) => prev.filter((c) => c.id !== chart.id));
      } else {
        setError(res.error);
      }
    } catch {
      setError('Could not delete the chart. Check your connection and try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      {!openChart && (
        <p className="page-note">
          <b>Chart Code</b> — Mermaid diagrams synced to your Vela account. Changes save to the cloud and appear on
          Vela web and mobile too. Click a chart to edit.
        </p>
      )}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 13, fontSize: 12,
          color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--red) 32%, transparent)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          {!openChart && !loading && charts.length === 0 && (
            <button className="btn" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => void load()}>Retry</button>
          )}
        </div>
      )}
      {openChart ? (
        <ChartCodeEditor
          chart={openChart}
          products={products}
          saving={saving}
          onSave={save}
          onBack={back}
          isDark={isDark}
        />
      ) : (
        <ChartCodeList
          charts={charts}
          products={products}
          loading={loading}
          creating={creating}
          deleting={deleting}
          onOpen={open}
          onCreate={create}
          onDelete={remove}
        />
      )}
    </div>
  );
}
