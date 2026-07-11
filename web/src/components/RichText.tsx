import { useRef, useEffect, type CSSProperties } from 'react';

// Minimal sanitizer: strip <script> blocks and inline event handlers so stored
// HTML can be rendered back with dangerouslySetInnerHTML safely enough for our
// own-authored rich text. (Not a general-purpose XSS filter.)
export function sanitizeHtml(html: string): string {
  return (html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

type Props = {
  value: string;
  onCommit: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  style?: CSSProperties;
};

// Lightweight rich-text editor: a contentEditable div + a tiny Bold/Italic/List
// toolbar driven by document.execCommand. Persists HTML on blur via onCommit.
export default function RichText({ value, onCommit, readOnly, placeholder = 'Add a description…', style }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Push external value into the DOM only when we are not actively editing, so
  // the caret is never reset mid-typing.
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const clean = sanitizeHtml(value);
    if (el.innerHTML !== clean) el.innerHTML = clean;
  }, [value]);

  const exec = (cmd: string) => (e: React.MouseEvent) => {
    e.preventDefault(); // keep focus/selection inside the editor
    if (readOnly) return;
    document.execCommand(cmd, false);
    ref.current?.focus();
    commit();
  };

  const commit = () => {
    if (readOnly) return;
    onCommit(sanitizeHtml(ref.current?.innerHTML || ''));
  };

  if (readOnly) {
    const clean = sanitizeHtml(value);
    return (
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: clean ? 'var(--txt)' : 'var(--txt3)', ...style }}
        dangerouslySetInnerHTML={{ __html: clean || placeholder }} />
    );
  }

  const btn: CSSProperties = { display: 'grid', placeItems: 'center', width: 24, height: 22, borderRadius: 6, cursor: 'pointer', color: 'var(--txt2)', fontSize: 12, fontWeight: 800, userSelect: 'none' };

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--inputBg)', overflow: 'hidden', ...style }}>
      <style>{'.vrt-ed:empty:before{content:attr(data-ph);color:var(--txt3);pointer-events:none;}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', borderBottom: '1px solid var(--line2)' }}>
        <span title="Bold" onMouseDown={exec('bold')} style={btn}>B</span>
        <span title="Italic" onMouseDown={exec('italic')} style={{ ...btn, fontStyle: 'italic', fontWeight: 600 }}>I</span>
        <span title="Bulleted list" onMouseDown={exec('insertUnorderedList')} style={btn}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></svg>
        </span>
      </div>
      <div
        ref={ref}
        className="vrt-ed"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onBlur={commit}
        style={{ minHeight: 64, padding: '9px 11px', fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.55, outline: 'none' }}
      />
    </div>
  );
}
