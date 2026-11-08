/** SVG sprite + icon helper for the VelaPTP screens (from VelaPTP/index.html:15-29). */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v11m0 0l-4-4m4 4l4-4M4 19h16" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-rotate" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3.5v5.5H15.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-reset" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.3M3 3.5v5.5h5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.7 4.8L18.5 9.5 13.7 11 12 16l-1.7-5L5.5 9.5l4.8-1.7L12 3zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></symbol>
        <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.9"/><circle cx="8.5" cy="9.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M4 17l5-5 3 3 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-left" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-right" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ name }: { name: string }) {
  return <svg><use href={'#i-' + name} /></svg>;
}
