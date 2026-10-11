import { useRef, useEffect, useMemo, useCallback } from 'react';
import { MNEMONICS, PSEUDO } from '../isa';

/*
 * Editor.jsx
 *
 * A transparent <textarea> sits exactly on top of a highlighted backdrop.
 * Both use the same font, size and line height, so the caret lands where the
 * coloured text appears. The backdrop is where errors, warnings and the
 * current step line are drawn, which keeps the textarea's own layout
 * untouched and therefore keeps the alignment exact.
 */

/* Split one source line into coloured spans. */
function tokenize(line) {
  const out = [];
  let rest = line;
  let key = 0;

  /* A comment swallows the remainder of the line. */
  const hash = rest.indexOf(';');
  let comment = null;
  if (hash >= 0) {
    comment = rest.slice(hash);
    rest = rest.slice(0, hash);
  }

  /* A label definition is the text before a colon. */
  const colon = rest.indexOf(':');
  if (colon >= 0) {
    const head = rest.slice(0, colon + 1);
    if (/^\s*[A-Za-z][A-Za-z0-9]*\s*:$/.test(head)) {
      out.push(
        <span key={key++} className="tk-label">
          {head}
        </span>
      );
      rest = rest.slice(colon + 1);
    }
  }

  /* Then whitespace-delimited words. */
  const parts = rest.split(/(\s+)/);
  let sawMnemonic = false;
  parts.forEach((part) => {
    if (part.length === 0) {
      return;
    }
    if (/^\s+$/.test(part)) {
      out.push(<span key={key++}>{part}</span>);
      return;
    }
    const lower = part.toLowerCase();
    if (!sawMnemonic && MNEMONICS.has(lower)) {
      sawMnemonic = true;
      out.push(
        <span key={key++} className={PSEUDO.has(lower) ? 'tk-pseudo' : 'tk-mnemonic'}>
          {part}
        </span>
      );
      return;
    }
    if (/^[+-]?(0[xX][0-9a-fA-F]+|\d+)$/.test(part)) {
      out.push(
        <span key={key++} className="tk-number">
          {part}
        </span>
      );
      return;
    }
    if (/^[A-Za-z][A-Za-z0-9]*$/.test(part)) {
      out.push(
        <span key={key++} className="tk-ident">
          {part}
        </span>
      );
      return;
    }
    out.push(
      <span key={key++} className="tk-plain">
        {part}
      </span>
    );
  });

  if (comment !== null) {
    out.push(
      <span key={key++} className="tk-comment">
        {comment}
      </span>
    );
  }
  return out;
}

export default function Editor({
  source,
  onChange,
  errors,
  warnings,
  stepLine,
  onRun,
  focusRequest
}) {
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);

  const lines = useMemo(() => source.split('\n'), [source]);

  /* line number -> first diagnostic on that line */
  const errorByLine = useMemo(() => {
    const map = new Map();
    (errors || []).forEach((e) => {
      if (e.line && !map.has(e.line)) {
        map.set(e.line, e.message);
      }
    });
    return map;
  }, [errors]);

  const warningByLine = useMemo(() => {
    const map = new Map();
    (warnings || []).forEach((w) => {
      if (w.line && !map.has(w.line)) {
        map.set(w.line, w.message);
      }
    });
    return map;
  }, [warnings]);

  /* Grow the textarea so the outer container owns all scrolling, which keeps
   * the backdrop and the input in lockstep without a scroll listener. */
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [source]);

  /* Scroll a diagnostic into view when one is clicked in the list below.
   * The tick in focusRequest makes a repeat click on the same line work. */
  useEffect(() => {
    const focusLine = focusRequest && focusRequest.line;
    if (!focusLine || !scrollRef.current) {
      return;
    }
    const rowHeight = 20;
    const target = (focusLine - 1) * rowHeight - scrollRef.current.clientHeight / 2;
    scrollRef.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });

    const el = textareaRef.current;
    if (el) {
      let offset = 0;
      for (let i = 0; i < focusLine - 1 && i < lines.length; i += 1) {
        offset += lines[i].length + 1;
      }
      el.focus();
      el.setSelectionRange(offset, offset + (lines[focusLine - 1] || '').length);
    }
    /* lines is intentionally read fresh here, not tracked, so editing text
     * does not re-trigger a scroll. */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [focusRequest]);

  const handleKeyDown = useCallback(
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        onRun();
        return;
      }
      /* Tab inserts a tab rather than leaving the editor, which matters when
       * the house style for this assembly language is tab-indented. */
      if (event.key === 'Tab') {
        event.preventDefault();
        const el = event.target;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = source.slice(0, start) + '\t' + source.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          el.selectionStart = start + 1;
          el.selectionEnd = start + 1;
        });
      }
    },
    [onRun, onChange, source]
  );

  return (
    <div className="editor">
      <div className="editor-scroll" ref={scrollRef}>
        <div className="editor-grid">
          <div className="gutter" aria-hidden="true">
            {lines.map((_, index) => {
              const number = index + 1;
              const isError = errorByLine.has(number);
              const isWarning = !isError && warningByLine.has(number);
              const isCurrent = stepLine === number;
              const classes = ['gutter-line'];
              if (isError) classes.push('has-error');
              if (isWarning) classes.push('has-warning');
              if (isCurrent) classes.push('current');
              return (
                <div
                  key={number}
                  className={classes.join(' ')}
                  title={errorByLine.get(number) || warningByLine.get(number) || ''}
                >
                  {isError ? <span className="flag">&#9679;</span> : null}
                  {isWarning ? <span className="flag">&#9671;</span> : null}
                  {isCurrent ? <span className="flag">&#9656;</span> : null}
                  {number}
                </div>
              );
            })}
          </div>

          <div className="code-area">
            <div className="code-backdrop" aria-hidden="true">
              {lines.map((line, index) => {
                const number = index + 1;
                const error = errorByLine.get(number);
                const warning = warningByLine.get(number);
                const classes = ['code-line'];
                if (error) classes.push('err-line');
                else if (warning) classes.push('warn-line');
                if (stepLine === number) classes.push('step-line');
                return (
                  <div key={number} className={classes.join(' ')}>
                    {tokenize(line)}
                    {error ? <span className="inline-msg err">{error}</span> : null}
                    {!error && warning ? (
                      <span className="inline-msg warn">{warning}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <textarea
              ref={textareaRef}
              className="code-input"
              value={source}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              rows={Math.max(lines.length, 1)}
              aria-label="IITPSx assembly source"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
