import { useState, useCallback, useEffect } from 'react';
import Editor from './Editor';
import { api } from '../api';

export default function NewTestModal({
  isOpen,
  onClose,
  examplesCount,
  onSaveSuccess,
  onOpenInWorkbench
}) {
  const nextNumber = String(examplesCount + 1).padStart(2, '0');
  const defaultTestName = `test${nextNumber}`;

  const [testName, setTestName] = useState(defaultTestName);
  const [purpose, setPurpose] = useState('find maximum value or compute result');
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [warning, setWarning] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [assembleResult, setAssembleResult] = useState(null);
  const [runResult, setRunResult] = useState(null);

  const initialCode = `; ${defaultTestName}.asm
; Purpose : find maximum value or compute result
; Expected: runs to HALT

br start

; Data declarations
val:    data 0

start:
        ; Instructions
        ldc 42
        ldc val
        stnl 0
        ldc val
        ldnl 0
        HALT
`;

  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    if (isOpen) {
      const num = String(examplesCount + 1).padStart(2, '0');
      const name = `test${num}`;
      setTestName(name);
      setPurpose('find maximum value or compute result');
      setSaved(false);
      setIsDirty(false);
      setWarning(null);
      setStatusMessage(null);
      setAssembleResult(null);
      setRunResult(null);
      setCode(`; ${name}.asm
; Purpose : compute test result
; Expected: runs to HALT

br start

; Data definitions:
val:    data 0

start:
        ; Write assembly instructions here:
        ldc 42
        ldc val
        stnl 0
        ldc val
        ldnl 0
        HALT
`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    setIsDirty(true);
    setWarning(null);
  };

  const handleSave = useCallback(async () => {
    if (!testName.trim()) {
      setWarning('Please enter a valid test name (e.g. test17).');
      return;
    }
    setBusy(true);
    setWarning(null);
    try {
      const cleanName = testName.trim().replace(/\.asm$/i, '');
      const created = await api.saveExample(cleanName, code);
      setSaved(true);
      setIsDirty(false);
      setStatusMessage(`Saved successfully as tests/${created.file}`);
      if (onSaveSuccess) {
        onSaveSuccess(created);
      }
    } catch (err) {
      setWarning(`Save error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, [testName, code, onSaveSuccess]);

  const handleAssemble = useCallback(async () => {
    /* If the user has not saved or modified the file without saving, require saving first! */
    if (!saved || isDirty) {
      setWarning('Please save it! You must save the file before assembling.');
      return;
    }

    setBusy(true);
    setWarning(null);
    try {
      const res = await api.assemble(code, 'dump');
      setAssembleResult(res);
      if (res.success) {
        setStatusMessage(`Assembled successfully: ${res.words.length} word(s), ${res.warnings.length} warning(s).`);
      } else {
        setWarning(`Assembly failed with ${res.errors.length} error(s). Review code below.`);
      }
    } catch (err) {
      setWarning(`Assembly request error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, [saved, isDirty, code]);

  const handleRun = useCallback(async () => {
    /* If the user has not saved or modified the file without saving, require saving first! */
    if (!saved || isDirty) {
      setWarning('Please save it! You must save the file before running.');
      return;
    }

    setBusy(true);
    setWarning(null);
    try {
      const res = await api.runSource(code, {
        dumpFormat: 'dump',
        trace: true,
        dumpBefore: true,
        dumpAfter: true
      });
      setAssembleResult(res.assemble);
      setRunResult(res.run);
      if (!res.assemble.success) {
        setWarning(`Assembly failed with ${res.assemble.errors.length} error(s). Cannot run.`);
      } else if (res.run && res.run.runtimeError) {
        setWarning(`Runtime Error: ${res.run.runtimeError} (at PC=${res.run.registers ? res.run.registers.PC : '?'})`);
      } else if (res.run) {
        setStatusMessage(
          `HALTED successfully after ${res.run.stepCount} instructions. A=${res.run.registers.A} (${res.run.registers.signedA}), B=${res.run.registers.B}, PC=${res.run.registers.PC}`
        );
      }
    } catch (err) {
      setWarning(`Run error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, [saved, isDirty, code]);

  const handleOpenWorkbench = () => {
    if (onOpenInWorkbench) {
      onOpenInWorkbench(testName, code);
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Window Title Bar */}
        <div className="modal-header">
          <div className="modal-title-left">
            <span className="modal-title-badge">NEW TEST CASE</span>
            <span className="modal-title-file">tests/{testName.trim().replace(/\.asm$/i, '') || 'test'}.asm</span>
          </div>

          <div className="modal-status-badge">
            {!saved || isDirty ? (
              <span className="badge-unsaved">● UNSAVED (Save required before assembly)</span>
            ) : (
              <span className="badge-saved">✔ SAVED (tests/{testName}.asm)</span>
            )}
          </div>

          <button className="btn btn-icon modal-close-btn" onClick={onClose} title="Close window">
            ✕
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="modal-config-bar">
          <div className="config-field">
            <label htmlFor="test-name-input">Test Identifier:</label>
            <input
              id="test-name-input"
              type="text"
              className="text-input mono-input"
              value={testName}
              onChange={(e) => {
                setTestName(e.target.value);
                setIsDirty(true);
              }}
              placeholder="e.g. test17"
            />
            <span className="file-ext">.asm</span>
          </div>

          <div className="config-field flex-grow">
            <label htmlFor="test-purpose-input">Purpose / Description:</label>
            <input
              id="test-purpose-input"
              type="text"
              className="text-input"
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Short description of this test case"
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="modal-toolbar">
          <button
            id="modal-btn-save"
            className={`btn ${(!saved || isDirty) ? 'btn-save-glow' : ''}`}
            onClick={handleSave}
            disabled={busy}
            title="Save code to tests/ directory"
          >
            💾 Save File
          </button>

          <span className="toolbar-sep" />

          <button
            id="modal-btn-assemble"
            className="btn"
            onClick={handleAssemble}
            disabled={busy}
            title={(!saved || isDirty) ? 'Please save the file first' : 'Assemble this test'}
          >
            Assemble
          </button>

          <button
            id="modal-btn-run"
            className="btn btn-primary"
            onClick={handleRun}
            disabled={busy}
            title={(!saved || isDirty) ? 'Please save the file first' : 'Run this test in emulator'}
          >
            ▶ Run
          </button>

          <span className="toolbar-sep" />

          <button
            id="modal-btn-workbench"
            className="btn"
            onClick={handleOpenWorkbench}
            title="Open in full Workbench editor to inspect memory and step through"
          >
            Open in Full Workbench
          </button>

          <div className="flex-spacer" />

          <button id="modal-btn-cancel" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>

        {/* Warning Alert (Shown if Assemble or Run is clicked before saving) */}
        {warning && (
          <div className="modal-alert-warning" role="alert">
            <span className="alert-icon">⚠️</span>
            <div className="alert-text">
              <strong>{warning}</strong>
              {(!saved || isDirty) && (
                <button id="modal-btn-save-inline" className="btn btn-save-inline" onClick={handleSave}>
                  Click here to Save File now
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success Alert */}
        {statusMessage && !warning && (
          <div className="modal-alert-success">
            <span className="alert-icon">✔</span>
            <div className="alert-text">{statusMessage}</div>
          </div>
        )}

        {/* Main Code Editor Area */}
        <div className="modal-editor-body">
          <div className="editor-pane-label">
            <span>ASSEMBLY SOURCE (IITPSx ARCHITECTURE)</span>
            <span className="rule" />
            <span className="editor-lines-count">{code.split('\n').length} lines</span>
          </div>
          <div className="modal-editor-container">
            <Editor
              source={code}
              onChange={handleCodeChange}
              errors={assembleResult ? assembleResult.errors : []}
              warnings={assembleResult ? assembleResult.warnings : []}
            />
          </div>
        </div>

        {/* Execution Output Panel (if assembled or run) */}
        {(assembleResult || runResult) && (
          <div className="modal-results-pane">
            <div className="results-header">
              <span>OUTPUT & REGISTERS</span>
              <span className="rule" />
            </div>
            <div className="results-content">
              {assembleResult && (
                <div className="results-item">
                  <span className="res-tag">ASM:</span>
                  {assembleResult.success ? (
                    <span className="res-success">
                      SUCCESS ({assembleResult.words.length} words, {assembleResult.warnings.length} warnings)
                    </span>
                  ) : (
                    <span className="res-error">
                      FAILED ({assembleResult.errors.length} errors)
                    </span>
                  )}
                </div>
              )}
              {runResult && (
                <div className="results-item">
                  <span className="res-tag">EMU:</span>
                  {runResult.runtimeError ? (
                    <span className="res-error">RUNTIME ERROR: {runResult.runtimeError}</span>
                  ) : (
                    <span className="res-success">
                      HALTED ({runResult.stepCount} steps) | A={runResult.registers.A} ({runResult.registers.signedA}) | B={runResult.registers.B} | PC={runResult.registers.PC} | SP={runResult.registers.SP}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
