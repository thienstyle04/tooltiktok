import { useRef } from 'react';

// Drag the empty space or field labels, never steal editing/selection from inputs.
export default function InspectorScrollArea({ children }) {
  const drag = useRef(null);
  const end = (event) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div id="pageInspector" className="page-inspector"
    onPointerDown={(event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('input, textarea, select, button, a, [contenteditable]')) return;
      // Leave the native scrollbar usable.
      if (event.clientX >= event.currentTarget.getBoundingClientRect().left + event.currentTarget.clientWidth) return;
      drag.current = { y: event.clientY, top: event.currentTarget.scrollTop };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
    onPointerMove={(event) => {
      if (drag.current) event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
    }}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; }}
  >{children}</div>;
}
