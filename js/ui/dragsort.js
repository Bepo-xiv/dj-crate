// Réordonnancement par glisser-déposer (doigt, Apple Pencil ou souris) via Pointer Events.
// La ligne saisie ne quitte jamais le DOM : ce sont ses voisines qui passent au-dessus / en dessous.
export function makeSortable(listEl, { item, handle, onDrop }) {
  listEl.addEventListener('pointerdown', (e) => {
    const h = e.target.closest(handle);
    if (!h || !listEl.contains(h)) return;
    const row = h.closest(item);
    if (!row) return;
    e.preventDefault();
    const rows = () => [...listEl.children].filter(el => el.matches(item));
    const from = rows().indexOf(row);
    const scroller = listEl.closest('[data-scroll]');
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    row.classList.add('dragging');
    listEl.classList.add('sorting');
    try { h.setPointerCapture(e.pointerId); } catch { /* sans capture : on écoute quand même le document */ }

    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      const y = ev.clientY;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (y < r.top + 70) scroller.scrollTop -= 14; else if (y > r.bottom - 70) scroller.scrollTop += 14;
      }
      let prev = row.previousElementSibling;
      while (prev && y < mid(prev)) { listEl.insertBefore(prev, row.nextSibling); prev = row.previousElementSibling; }
      let next = row.nextElementSibling;
      while (next && y > mid(next)) { listEl.insertBefore(next, row); next = row.nextElementSibling; }
    };
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      row.classList.remove('dragging');
      listEl.classList.remove('sorting');
      const to = rows().indexOf(row);
      onDrop(from, to);
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  });
}

/** Déplace un élément d'un tableau (renvoie une copie). */
export function moveItem(arr, from, to) {
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
