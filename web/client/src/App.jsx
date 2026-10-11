import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api';
import Editor from './components/Editor';
import {
  ListingPanel,
  RegistersPanel,
  MemoryPanel,
  TracePanel,
  HelpPanel
} from './components/Panels';

const STARTER = `; Press Run, or Ctrl+Enter.
; Pick a program from the Examples menu to load one of the fifteen tests.

        ldc 6
        ldc 7
        mul             ; A = 42
        ldc 2
        div             ; A = 21
        HALT
`;

const TABS = [
  { id: 'listing', label: 'Listing' },
  { id: 'registers', label: 'Registers' },
  { id: 'memory', label: 'Memory' },
  { id: 'trace', label: 'Trace' },
  { id: 'help', label: 'Help' }
];

export default function App() {
  const [theme, setTheme] = useState('dark');
  const [source, setSource] = useState(STARTER);
  const [tab, setTab] = useState('listing');

  const [assembleResult, setAssembleResult] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [fault, setFault] = useState(null);

  const [dumpFormat, setDumpFormat] = useState(false);
  const [memoryWhich, setMemoryWhich] = useState('after');

  const [examples, setExamples] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [dbAvailable, setDbAvailable] = useState(false);
  const [dbReason, setDbReason] = useState('');

  /* step-through state: null means not stepping */
  const [stepIndex, setStepIndex] = useState(null);
  /* focusRequest pairs a line with a counter so clicking the same
   * diagnostic twice still re-triggers the scroll. */
  const [focusRequest, setFocusRequest] = useState({ line: null, tick: 0 });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    api
      .health()
      .then((info) => {
        setDbAvailable(info.database.available);
        setDbReason(info.database.reason);
        if (info.database.available) {
          api.listPrograms().then(setPrograms).catch(() => {});
        }
      })
      .catch((err) => setFault(err.message));

    api.examples().then(setExamples).catch((err) => setFault(err.message));
  }, []);

  /* ------------------------------------------------------------ actions -- */

  const clearRun = () => {
    setRunResult(null);
    setStepIndex(null);
  };

  const doAssemble = useCallback(
    async (overrideFormat) => {
      setBusy('assembling');
      setFault(null);
      clearRun();
      try {
        const format = overrideFormat === undefined ? dumpFormat : overrideFormat;
        const result = await api.assemble(source, format);
        setAssembleResult(result);
        setTab(result.success ? 'listing' : 'listing');
        return result;
      } catch (err) {
        setFault(err.message);
        setAssembleResult(null);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [source, dumpFormat]
  );

  const doRun = useCallback(async () => {
    setBusy('running');
    setFault(null);
    setStepIndex(null);
    try {
      const result = await api.runSource(source, {
        dumpFormat,
        trace: true,
        dumpBefore: true,
        dumpAfter: true
      });
      setAssembleResult(result.assemble);
      setRunResult(result.run);

      if (!result.assemble.success) {
        setTab('listing');
      } else if (result.run && result.run.runtimeError) {
        setTab('registers');
      } else {
        setTab('registers');
      }
      setMemoryWhich('after');
      return result;
    } catch (err) {
      setFault(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  }, [source, dumpFormat]);

  const loadExample = useCallback((id) => {
    const example = examples.find((e) => e.id === id);
    if (!example) {
      return;
    }
    setSource(example.source);
    setAssembleResult(null);
    clearRun();
    setFault(null);
  }, [examples]);

  const loadSaved = useCallback(
    (id) => {
      const program = programs.find((p) => p.id === id);
      if (!program) {
        return;
      }
      setSource(program.source);
      setAssembleResult(null);
      clearRun();
    },
    [programs]
  );

  const doSave = useCallback(async () => {
    if (!dbAvailable) {
      return;
    }
    const title = window.prompt('Save this program as:', 'my program');
    if (!title) {
      return;
    }
    setBusy('saving');
    try {
      await api.savePrograms(title, source);
      const list = await api.listPrograms();
      setPrograms(list);
    } catch (err) {
      setFault(err.message);
    } finally {
      setBusy(null);
    }
  }, [dbAvailable, source]);

  const download = useCallback(
    (kind) => {
      if (!assembleResult || !assembleResult.objectFileId) {
        return;
      }
      window.location.href = api.downloadUrl(assembleResult.objectFileId, kind);
    },
    [assembleResult]
  );

  const toggleListingFormat = useCallback(() => {
    const next = !dumpFormat;
    setDumpFormat(next);
    if (assembleResult && assembleResult.success) {
      doAssemble(next);
    }
  }, [dumpFormat, assembleResult, doAssemble]);

  /* ------------------------------------------------------- step-through -- */

  const trace = (runResult && runResult.trace) || [];

  const startStepping = useCallback(async () => {
    let current = runResult;
    if (!current || current.trace.length === 0) {
      const fresh = await doRun();
      current = fresh && fresh.run;
    }
    if (current && current.trace && current.trace.length > 0) {
      setStepIndex(0);
      setTab('registers');
    }
  }, [runResult, doRun]);

  /* Registers as they stood at the chosen step, taken straight from the
   * emulator's own trace line rather than re-simulating anything. */
  const steppedRegisters = useMemo(() => {
    if (stepIndex === null || !trace[stepIndex]) {
      return null;
    }
    const step = trace[stepIndex];
    return {
      A: { hex: step.a, signed: step.aSigned },
      B: { hex: step.b, signed: step.bSigned },
      PC: { hex: step.pc, signed: step.pcValue },
      SP: { hex: step.sp, signed: step.spSigned }
    };
  }, [stepIndex, trace]);

  const previousRegisters = useMemo(() => {
    if (stepIndex === null || stepIndex === 0 || !trace[stepIndex - 1]) {
      return null;
    }
    const step = trace[stepIndex - 1];
    return {
      A: { hex: step.a, signed: step.aSigned },
      B: { hex: step.b, signed: step.bSigned },
      PC: { hex: step.pc, signed: step.pcValue },
      SP: { hex: step.sp, signed: step.spSigned }
    };
  }, [stepIndex, trace]);

  /* Map the current step's PC back to a source line via the listing, so the
   * editor can highlight the instruction about to execute. */
  const pcToLine = useMemo(() => {
    const map = new Map();
    if (!assembleResult || !assembleResult.listing) {
      return map;
    }
    /* Walk the source and the listing rows together: every line that
     * produced a word corresponds to the next row in address order. */
    const rows = assembleResult.listing.rows;
    const lines = source.split('\n');
    let row = 0;
    for (let i = 0; i < lines.length && row < rows.length; i += 1) {
      const stripped = lines[i].replace(/;.*$/, '').trim();
      if (stripped.length === 0) {
        continue;
      }
      const afterLabel = stripped.replace(/^[A-Za-z][A-Za-z0-9]*\s*:/, '').trim();
      if (afterLabel.length === 0) {
        continue;
      }
      if (/^set\b/i.test(afterLabel)) {
        continue;
      }
      map.set(rows[row].address, i + 1);
      row += 1;
    }
    return map;
  }, [assembleResult, source]);

  const stepLine =
    stepIndex !== null && trace[stepIndex]
      ? pcToLine.get(trace[stepIndex].pcValue) || null
      : null;

  /* -------------------------------------------------------- status line -- */

  const status = useMemo(() => {
    if (busy) {
      return { tone: 'busy', text: busy === 'running' ? 'Running' : busy === 'saving' ? 'Saving' : 'Assembling' };
    }
    if (fault) {
      return { tone: 'err', text: fault };
    }
    if (runResult && runResult.runtimeError) {
      const e = runResult.runtimeError;
      return {
        tone: 'err',
        text: e.pc
          ? 'Runtime error: ' + e.message + ' at PC=' + parseInt(e.pc, 16)
          : 'Runtime error: ' + e.message
      };
    }
    if (assembleResult && !assembleResult.success) {
      const n = assembleResult.errors.length;
      return { tone: 'err', text: n + (n === 1 ? ' error' : ' errors') + '; no output written' };
    }
    if (assembleResult && assembleResult.success) {
      const words = assembleResult.wordCount;
      const warnings = assembleResult.warnings.length;
      let text = 'Assembled ' + words + ' word' + (words === 1 ? '' : 's') + ', ' + warnings + ' warning' + (warnings === 1 ? '' : 's');
      if (runResult && runResult.halted) {
        text += '  |  halted after ' + runResult.stepCount + ' instructions, A = ' + runResult.registers.A.signed;
      }
      return { tone: warnings > 0 ? 'warn' : 'ok', text };
    }
    return { tone: 'idle', text: 'Ready' };
  }, [busy, fault, assembleResult, runResult]);

  /* -------------------------------------------------------------- render -- */

  const errors = (assembleResult && assembleResult.errors) || [];
  const warnings = (assembleResult && assembleResult.warnings) || [];
  const diagnostics = errors
    .map((e) => ({ ...e, kind: 'error' }))
    .concat(warnings.map((w) => ({ ...w, kind: 'warning' })))
    .sort((a, b) => (a.line || 0) - (b.line || 0));

  const memory =
    runResult
      ? memoryWhich === 'before'
        ? runResult.memoryBefore
        : runResult.memoryAfter
      : [];

  const canDownload = Boolean(assembleResult && assembleResult.objectFileId);

  return (
    <div className="shell">
      <header className="masthead">
        <div className="wordmark">
          <b>IITPSx</b>
          <span>assembler / emulator bench</span>
        </div>
        <span className="masthead-spacer" />
        <span className="status-meta">
          {dbAvailable ? 'db online' : 'db offline'}
        </span>
        <button
          className="btn btn-icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle theme"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>
      <div className="tickstrip" />

      <div className="toolbar">
        <button
          className="btn"
          onClick={() => doAssemble()}
          disabled={Boolean(busy)}
        >
          Assemble
        </button>
        <button
          className="btn btn-primary"
          onClick={doRun}
          disabled={Boolean(busy)}
          title="Ctrl+Enter"
        >
          Run
        </button>
        <button className="btn" onClick={startStepping} disabled={Boolean(busy)}>
          Step through
        </button>

        <span className="toolbar-sep" />

        <select
          className="select"
          value=""
          onChange={(event) => loadExample(event.target.value)}
        >
          <option value="">Examples ({examples.length})</option>
          {examples.map((example) => (
            <option key={example.id} value={example.id}>
              {example.id} — {example.expected} — {example.description.slice(0, 54)}
            </option>
          ))}
        </select>

        <span className="toolbar-sep" />

        <button
          className="btn"
          onClick={doSave}
          disabled={!dbAvailable || Boolean(busy)}
          title={dbAvailable ? 'Save to MongoDB' : dbReason}
        >
          Save
        </button>
        <select
          className="select"
          value=""
          onChange={(event) => loadSaved(event.target.value)}
          disabled={!dbAvailable || programs.length === 0}
          title={dbAvailable ? 'Load a saved program' : dbReason}
        >
          <option value="">Load ({programs.length})</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.title}
            </option>
          ))}
        </select>

        <span className="toolbar-sep" />

        <button className="btn" onClick={() => download('object')} disabled={!canDownload}>
          .o
        </button>
        <button className="btn" onClick={() => download('listing')} disabled={!canDownload}>
          .lst
        </button>

        <span className="masthead-spacer" />
        {busy ? <span className="spinner" /> : null}
      </div>

      {!dbAvailable && dbReason ? (
        <div className="banner">Save is disabled: {dbReason}</div>
      ) : null}

      <div className="workspace">
        <div className="pane-left">
          <div className="pane-label">
            Source<span className="rule" />
            <span>{source.split('\n').length} lines</span>
          </div>

          <Editor
            source={source}
            onChange={(next) => {
              setSource(next);
              setStepIndex(null);
            }}
            errors={errors}
            warnings={warnings}
            stepLine={stepLine}
            onRun={doRun}
            focusRequest={focusRequest}
          />

          {diagnostics.length > 0 ? (
            <div className="diagnostics">
              {diagnostics.map((diagnostic, index) => (
                <div
                  key={index}
                  className={'diag ' + (diagnostic.kind === 'error' ? 'err' : 'warn')}
                  onClick={() =>
                    setFocusRequest((previous) => ({
                      line: diagnostic.line,
                      tick: previous.tick + 1
                    }))
                  }
                >
                  <span className="diag-kind">
                    {diagnostic.kind === 'error' ? 'err' : 'warn'}
                  </span>
                  <span className="diag-line">
                    {diagnostic.line === null ? '--' : 'line ' + diagnostic.line}
                  </span>
                  <span className="diag-msg">{diagnostic.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pane-right">
          <div className="tabstrip">
            {TABS.map((entry) => {
              let count = null;
              if (entry.id === 'listing' && assembleResult && assembleResult.success) {
                count = assembleResult.listing.rows.length;
              }
              if (entry.id === 'trace' && trace.length > 0) {
                count = trace.length;
              }
              if (entry.id === 'memory' && memory.length > 0) {
                count = memory.length;
              }
              return (
                <button
                  key={entry.id}
                  className={'tab' + (tab === entry.id ? ' active' : '')}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                  {count !== null ? <span className="count">{count}</span> : null}
                </button>
              );
            })}
          </div>

          {stepIndex !== null && trace.length > 0 ? (
            <div className="stepper">
              <button
                className="btn"
                onClick={() => setStepIndex(0)}
                disabled={stepIndex === 0}
              >
                Reset
              </button>
              <button
                className="btn"
                onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
                disabled={stepIndex === 0}
              >
                Prev
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setStepIndex(Math.min(trace.length - 1, stepIndex + 1))}
                disabled={stepIndex >= trace.length - 1}
              >
                Next
              </button>
              <input
                className="step-slider"
                type="range"
                min={0}
                max={trace.length - 1}
                value={stepIndex}
                onChange={(event) => setStepIndex(Number(event.target.value))}
              />
              <span className="step-readout">
                <b>{stepIndex + 1}</b> / {trace.length}
              </span>
              <button className="btn" onClick={() => setStepIndex(null)}>
                Exit
              </button>
            </div>
          ) : null}

          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
            {busy ? (
              <div className="scrim">
                <span className="spinner" />
                {busy}
              </div>
            ) : null}

            {tab === 'listing' ? (
              <ListingPanel
                listing={assembleResult && assembleResult.success ? assembleResult.listing : null}
                dumpFormat={dumpFormat}
                onToggleFormat={toggleListingFormat}
              />
            ) : null}

            {tab === 'registers' ? (
              <RegistersPanel
                registers={steppedRegisters || (runResult ? runResult.registers : null)}
                previous={previousRegisters}
                stepInfo={
                  stepIndex !== null && trace[stepIndex]
                    ? {
                        index: stepIndex,
                        total: trace.length,
                        instruction: trace[stepIndex].instruction
                      }
                    : null
                }
              />
            ) : null}

            {tab === 'memory' ? (
              <MemoryPanel
                memory={memory}
                labels={
                  assembleResult && assembleResult.listing
                    ? assembleResult.listing.labels
                    : []
                }
                which={memoryWhich}
                onWhichChange={setMemoryWhich}
                hasBefore={Boolean(runResult && runResult.memoryBefore.length > 0)}
              />
            ) : null}

            {tab === 'trace' ? (
              <TracePanel
                trace={trace}
                index={stepIndex}
                onSelect={(index) => {
                  setStepIndex(index);
                  setTab('trace');
                }}
                truncated={Boolean(runResult && runResult.traceTruncated)}
              />
            ) : null}

            {tab === 'help' ? <HelpPanel /> : null}
          </div>
        </div>
      </div>

      <footer className="statusbar">
        <span className={'lamp ' + status.tone} />
        <span className={'status-text ' + status.tone}>{status.text}</span>
        {fault ? (
          <button
            type="button"
            className="chip err"
            onClick={() => setFault(null)}
            title="Dismiss error"
            style={{ marginLeft: 8, cursor: 'pointer', background: 'transparent', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px' }}
          >
            ✕ clear
          </button>
        ) : null}
        {runResult && runResult.halted ? (
          <span className="chip ok">halted</span>
        ) : null}
        {runResult && runResult.runtimeError ? (
          <span className="chip err">faulted</span>
        ) : null}
        <span className="status-meta">Ctrl+Enter to run</span>
      </footer>
    </div>
  );
}
