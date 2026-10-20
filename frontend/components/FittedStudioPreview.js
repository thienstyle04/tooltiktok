import { useLayoutEffect, useRef } from 'react';

// Scale the preview wrapper only; leave slide typography and export markup intact.
// reserve: khoảng chừa dưới preview (V2 đặt dải trang ngay bên dưới).
export default function FittedStudioPreview({ children, reserve = 24 }) {
  const viewport = useRef(null);
  const content = useRef(null);
  useLayoutEffect(() => {
    const host = viewport.current, node = content.current;
    let frame;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = node.offsetWidth, height = node.offsetHeight;
        if (!width || !height) return;
        const available = Math.max(180, window.innerHeight - host.getBoundingClientRect().top - reserve);
        const scale = Math.min(1, host.clientWidth / width, available / height);
        node.style.transform = `scale(${scale})`;
        host.style.height = `${Math.ceil(height * scale)}px`;
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host); observer.observe(node);
    window.addEventListener('resize', fit);
    fit();
    return () => {cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize', fit);};
  }, [reserve]);
  return <div className="studio-fit-viewport" ref={viewport}><div className="studio-fit-content" ref={content}>{children}</div></div>;
}
