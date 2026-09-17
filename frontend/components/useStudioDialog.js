import { useEffect, useRef } from 'react';

export default function useStudioDialog(open, onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const element = ref.current;
    const controls = () => [...element.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(node => node.getClientRects().length);
    controls()[0]?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const nodes = controls(), first = nodes[0], last = nodes.at(-1);
        if (!nodes.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
      }
    };
    element.addEventListener('keydown', keydown);
    return () => {element.removeEventListener('keydown', keydown);if(previous?.isConnected)previous.focus();};
  }, [open]);
  return ref;
}
