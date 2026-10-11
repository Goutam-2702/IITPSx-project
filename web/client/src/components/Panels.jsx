import { useMemo, useState, Fragment } from 'react';
import { INSTRUCTIONS } from '../isa';

/*
 * Panels.jsx - the four read-out panels plus Help.
 * Kept in one file because each is small and they share helpers.
 */

function hex8(value) {
  const unsigned = value < 0 ? value + 0x100000000 : value;
  return unsigned.toString(16).toUpperCase().padStart(8, '0');
}

function Empty({ title, hint }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {hint}
    </div>
  );
}

/* --------------------------------------------------------------- listing -- */

export function ListingPanel({ listing, dumpFormat, onToggleFormat }) {
  if (!listing || listing.rows.length === 0) {
    return (
      <Empty
        title="No listing"
        hint="Assemble a program to see the machine code it produces."
      />
    );
  }

  /* Label lines are printed above the word at their address, exactly as the
   * assembler's own advanced listing does. */
  const labelsAt = new Map();
  (listing.labels || []).forEach((label) => {
    if (!labelsAt.has(label.address)) {
      labelsAt.set(label.address, []);
    }
    labelsAt.get(label.address).push(label.name);
  });

  return (
    <>
      <div className="stepper">
        <span className="step-readout">
          format <b>{dumpFormat ? 'memory dump' : 'advanced'}</b>
        </span>
        <button className="btn" onClick={onToggleFormat}>
          {dumpFormat ? 'Show advanced' : 'Show memory dump'}
        </button>
        <span className="masthead-spacer" />
        <span className="step-readout">
          <b>{listing.rows.length}</b> words
        </span>
      </div>

      <div className="panel-body">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 96 }}>Address</th>
              <th style={{ width: 104 }}>Word</th>
              <th style={{ width: 92, textAlign: 'right' }}>Signed</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {listing.rows.map((row) => (
              <Fragment key={row.address}>
                {(labelsAt.get(row.address) || []).map((name) => (
                  <tr key={'L' + name} className="label-row">
                    <td className="c-addr">{hex8(row.address)}</td>
                    <td colSpan={3} className="c-label">
                      {name}:
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="c-addr">{hex8(row.address)}</td>
                  <td className="c-word">{row.hex}</td>
                  <td className="c-dec">{row.signed}</td>
                  <td className="c-text">{row.text}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>

        {listing.symbols && listing.symbols.length > 0 ? (
          <>
            <div className="pane-label" style={{ marginTop: 8 }}>
              Symbol table<span className="rule" />
            </div>
            <table className="grid">
              <thead>
                <tr>
                  <th>Label</th>
                  <th style={{ width: 104 }}>Value</th>
                  <th style={{ width: 92, textAlign: 'right' }}>Decimal</th>
                  <th style={{ width: 70 }}>Kind</th>
                </tr>
              </thead>
              <tbody>
                {listing.symbols.map((symbol) => (
                  <tr key={symbol.name}>
                    <td className="c-label">{symbol.name}</td>
                    <td className="c-word">{symbol.hex}</td>
                    <td className="c-dec">{symbol.address}</td>
                    <td className="c-addr">{symbol.isSet ? 'SET' : 'address'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- registers -- */

const REGISTER_ORDER = ['A', 'B', 'PC', 'SP'];

export function RegistersPanel({ registers, previous, stepInfo }) {
  if (!registers) {
    return (
      <Empty
        title="No run yet"
        hint="Press Run, or Ctrl+Enter, to execute the program."
      />
    );
  }

  return (
    <>
      {stepInfo ? (
        <div className="stepper">
          <span className="step-readout">
            step <b>{stepInfo.index + 1}</b> of {stepInfo.total}
          </span>
          <span className="masthead-spacer" />
          <span className="step-readout">
            about to execute <b>{stepInfo.instruction}</b>
          </span>
        </div>
      ) : null}

      <div className="panel-body">
        <div className="reg-wrap">
          {REGISTER_ORDER.map((name) => {
            const current = registers[name];
            const before = previous ? previous[name] : null;
            const changed = Boolean(before && before.hex !== current.hex);
            const bits = parseInt(current.hex, 16);
            return (
              <div key={name} className={'reg-row' + (changed ? ' changed' : '')}>
                <div className="reg-name">{name}</div>
                <div className="reg-hex">{current.hex}</div>
                <div className="reg-dec">{current.signed}</div>
                <div className="bits" aria-hidden="true">
                  {Array.from({ length: 32 }, (_, i) => (
                    <span
                      key={i}
                      className={'bit' + ((bits >>> (31 - i)) & 1 ? ' set' : '')}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- memory -- */

export function MemoryPanel({ memory, labels, which, onWhichChange, hasBefore }) {
  const [marked, setMarked] = useState('');

  /* Highlight from the chosen label up to the next label, which makes an
   * array such as 'arr' light up exactly as far as it extends. */
  const span = useMemo(() => {
    if (!marked || !labels || labels.length === 0) {
      return null;
    }
    const sorted = labels.slice().sort((a, b) => a.address - b.address);
    const index = sorted.findIndex((l) => l.name === marked);
    if (index < 0) {
      return null;
    }
    const start = sorted[index].address;
    const next = sorted[index + 1];
    const end = next ? next.address - 1 : start + 7;
    return { start, end };
  }, [marked, labels]);

  if (!memory || memory.length === 0) {
    return (
      <Empty
        title="No memory snapshot"
        hint="Run a program with a memory dump to inspect what it wrote."
      />
    );
  }

  return (
    <>
      <div className="stepper">
        <span className="step-readout">snapshot</span>
        <button
          className={'btn' + (which === 'before' ? ' on' : '')}
          onClick={() => onWhichChange('before')}
          disabled={!hasBefore}
        >
          Before
        </button>
        <button
          className={'btn' + (which === 'after' ? ' on' : '')}
          onClick={() => onWhichChange('after')}
        >
          After
        </button>
        <span className="toolbar-sep" />
        <span className="step-readout">highlight</span>
        <select
          className="select"
          value={marked}
          onChange={(event) => setMarked(event.target.value)}
        >
          <option value="">none</option>
          {(labels || [])
            .slice()
            .sort((a, b) => a.address - b.address)
            .map((label) => (
              <option key={label.name} value={label.name}>
                {label.name} @ {hex8(label.address)}
              </option>
            ))}
        </select>
        {span ? (
          <span className="chip warn">
            {hex8(span.start)} to {hex8(span.end)}
          </span>
        ) : null}
      </div>

      <div className="panel-body">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 96 }}>Address</th>
              <th style={{ width: 104 }}>Word</th>
              <th style={{ width: 110, textAlign: 'right' }}>Signed</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {memory.map((word) => {
              const inSpan =
                span && word.address >= span.start && word.address <= span.end;
              const here = (labels || []).filter((l) => l.address === word.address);
              return (
                <tr key={word.address} className={inSpan ? 'marked' : ''}>
                  <td className="c-addr">{hex8(word.address)}</td>
                  <td className="c-word">{word.hex}</td>
                  <td className="c-dec">{word.signed}</td>
                  <td className="c-label">
                    {here.map((l) => l.name).join(', ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- trace -- */

export function TracePanel({ trace, index, onSelect, truncated }) {
  if (!trace || trace.length === 0) {
    return (
      <Empty
        title="No trace"
        hint="Run with the trace enabled to record every executed instruction."
      />
    );
  }

  return (
    <>
      {truncated ? (
        <div className="banner">
          The trace was cut to the first {trace.length.toLocaleString()} steps so
          the browser stays responsive.
        </div>
      ) : null}
      <div className="panel-body">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 62 }}>Step</th>
              <th style={{ width: 84 }}>PC</th>
              <th style={{ width: 96 }}>A</th>
              <th style={{ width: 96 }}>B</th>
              <th style={{ width: 96 }}>SP</th>
              <th>Instruction</th>
            </tr>
          </thead>
          <tbody>
            {trace.map((step) => (
              <tr
                key={step.index}
                className={step.index === index ? 'active' : ''}
                onClick={() => onSelect(step.index)}
                style={{ cursor: 'pointer' }}
              >
                <td className="c-addr">{step.index + 1}</td>
                <td className="c-addr">{step.pc}</td>
                <td className="c-word">{step.a}</td>
                <td className="c-word">{step.b}</td>
                <td className="c-addr">{step.sp}</td>
                <td className="c-text">{step.instruction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ help -- */

export function HelpPanel() {
  return (
    <div className="panel-body">
      <div className="help">
        <h3>What this is</h3>
        <p>
          A front end for a two-pass assembler and an emulator written in ISO
          C89 for the IITPSx 32-bit stack processor. The browser does no
          assembling or emulating of its own: it posts your source to the
          backend, which runs the compiled <code>bin/asm</code> and{' '}
          <code>bin/emu</code> and parses their real output.
        </p>

        <h3>Machine model</h3>
        <p>
          Registers A and B form a two-deep internal stack. PC and SP count
          words, not bytes. An instruction word holds the opcode in bits 7 to 0
          and a signed 24-bit operand in bits 31 to 8, so the operand range is
          -8388608 to 8388607. The PC advances before an instruction's actions
          take effect, which is why a branch target is{' '}
          <code>PC_after_increment + offset</code>.
        </p>

        <h3>Keys</h3>
        <p>
          <span className="kbd">Ctrl</span> <span className="kbd">Enter</span>{' '}
          assembles and runs. <span className="kbd">Tab</span> inserts a tab.
          Click any diagnostic to jump to its line, or any trace row to step to
          it.
        </p>

        <h3>Instruction set</h3>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 78 }}>Mnemonic</th>
              <th style={{ width: 66 }}>Opcode</th>
              <th style={{ width: 70 }}>Operand</th>
              <th>Semantics</th>
            </tr>
          </thead>
          <tbody>
            {INSTRUCTIONS.map((instruction) => (
              <tr key={instruction.m}>
                <td
                  className={
                    instruction.kind === 'pseudo' ? 'tk-pseudo' : 'tk-mnemonic'
                  }
                >
                  {instruction.m}
                </td>
                <td className="c-word">
                  {instruction.op === null ? 'pseudo' : instruction.op}
                </td>
                <td className="c-addr">{instruction.operand}</td>
                <td className="c-text">{instruction.sem}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Notes</h3>
        <p>
          Mnemonics match case-insensitively; label names are case-sensitive.
          Only <code>call</code>, <code>brz</code>, <code>brlz</code> and{' '}
          <code>br</code> turn a label into a PC-relative offset, computed as{' '}
          <code>target - (address + 1)</code>. Every other instruction uses the
          label's value directly, which is why <code>ldc arr</code> loads the
          address of <code>arr</code> rather than its contents.
        </p>
        <p>
          <code>data</code> emits one word holding the full 32-bit value.{' '}
          <code>SET</code> emits no word and does not advance the PC. An unused
          label is a warning, not an error.
        </p>
      </div>
    </div>
  );
}
