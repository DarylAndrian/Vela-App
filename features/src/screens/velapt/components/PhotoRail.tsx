/* Photo rail — ported from renderStrip in VelaPTP/js/app.js:141-223. */
import { state, emit } from '../state';
import { getPreview } from '../lib/imaging';
import { Icon } from './icons';
import type { Page } from '../types';

export function thumbImg(page: Page) {
  const pv = getPreview(page);
  const c = document.createElement('canvas');
  const long = Math.max(pv.width, pv.height), s = 200 / long;
  c.width = Math.max(1, Math.round(pv.width * s)); c.height = Math.max(1, Math.round(pv.height * s));
  const context = c.getContext('2d');
  if (!context) return page.thumb;
  context.drawImage(pv, 0, 0, c.width, c.height);
  page.thumb = c.toDataURL('image/jpeg', 0.72);
  return page.thumb;
}

export function movePage(id: string, dir: number) {
  const i = state.pages.findIndex((p) => p.id === id), j = i + dir;
  if (j < 0 || j >= state.pages.length) return;
  [state.pages[i], state.pages[j]] = [state.pages[j], state.pages[i]];
  emit('pages');
}

export function PhotoRail({ onAdd, onSelect, onRemove }: {
  onAdd: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <aside className="rail">
      <div className="rail-head">
        <h2>Photos</h2>
        <span className="rail-count">{String(state.pages.length).padStart(2, '0')}</span>
      </div>
      {state.pages.map((page, i) => (
        <div
          key={page.id}
          className={'thumb' + (page.id === state.activeId ? ' active' : '')}
          draggable
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest('.del')) { onRemove(page.id); return; }
            if (t.closest('.mv')) { movePage(page.id, -1); return; }
            onSelect(page.id);
          }}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', page.id);
            e.dataTransfer.effectAllowed = 'move';
            (e.currentTarget as HTMLElement).classList.add('dragging');
          }}
          onDragEnd={(e) => {
            (e.currentTarget as HTMLElement).classList.remove('dragging');
            document.querySelectorAll('.thumb').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
          }}
          onDragOver={(e) => {
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const before = e.clientY - r.top < r.height / 2;
            (e.currentTarget as HTMLElement).classList.toggle('drop-before', before);
            (e.currentTarget as HTMLElement).classList.toggle('drop-after', !before);
          }}
          onDragLeave={(e) => {
            (e.currentTarget as HTMLElement).classList.remove('drop-before', 'drop-after');
          }}
          onDrop={(e) => {
            e.preventDefault();
            const el = e.currentTarget as HTMLElement;
            el.classList.remove('drop-before', 'drop-after');
            const id = e.dataTransfer.getData('text/plain');
            if (!id || id === page.id) return;
            const from = state.pages.findIndex((p) => p.id === id);
            const r = el.getBoundingClientRect();
            const before = e.clientY - r.top < r.height / 2;
            let to = state.pages.findIndex((p) => p.id === page.id) + (before ? 0 : 1);
            const [moved] = state.pages.splice(from, 1);
            if (from < to) to--;
            state.pages.splice(to, 0, moved);
            emit('pages');
          }}
        >
          <span className="num">{String(i + 1).padStart(2, '0')}</span>
          <div className="tools">
            <button className="mv" title="Move earlier"><Icon name="left" /></button>
            <button className="del" title="Remove"><Icon name="trash" /></button>
          </div>
          <div className="thumb-media">
            <img alt={page.name} src={page.thumb || thumbImg(page) || undefined} />
            <span className={'status' + (page.confirmed ? ' show' : '')}><Icon name="check" /></span>
          </div>
          <div className="tname">{page.name}</div>
        </div>
      ))}
      <button className="add-tile" title="Add photos" onClick={onAdd}>
        <Icon name="plus" />Add
      </button>
    </aside>
  );
}
