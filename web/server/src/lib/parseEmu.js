'use strict';

/*
 * parseEmu.js - parse the real output of bin/emu.
 *
 * Captured from the compiled binary. Plain run:
 *
 *   loaded 6 word(s) from /tmp/x/test04.o
 *   halted after 6 instruction(s)
 *     A  = 00000015 (21)
 *     B  = 0000002A (42)
 *     PC = 00000006 (6)
 *     SP = 000FFFFF (1048575)
 *
 * With -trace, one line per step before the halt block:
 *
 *   PC=00000000 A=00000000 B=00000000 SP=000FFFFF  ldc 6
 *
 * With -before / -after, a dump block whose heading names which it is. Note
 * that "memory after execution" is printed BEFORE the halt block:
 *
 *   memory after execution (77 word(s))
 *   00000000 00000C11 00000000 00000001 00000005
 *
 * Runtime errors go to stderr in two shapes, one with a PC and one without:
 *
 *   runtime error at PC=00000002 (step 3): division by zero
 *   runtime error: instruction limit of 10000000 exceeded, the program is ...
 */

const { toSigned } = require('./parseListing');

const HEX8 = '[0-9A-Fa-f]{8}';

const TRACE_RE = new RegExp(
  '^PC=(' + HEX8 + ')\\s+A=(' + HEX8 + ')\\s+B=(' + HEX8 + ')\\s+SP=(' +
    HEX8 + ')\\s+(.*)$'
);
const REGISTER_RE = new RegExp(
  '^\\s*(A|B|PC|SP)\\s*=\\s*(' + HEX8 + ')\\s*\\((-?\\d+)\\)\\s*$'
);
const DUMP_HEADING_RE = /^memory (before|after) execution\s*\((\d+) word\(s\)\)\s*$/;
const DUMP_ROW_RE = new RegExp('^(' + HEX8 + ')((?:\\s+' + HEX8 + ')+)\\s*$');
const LOADED_RE = /^loaded\s+(\d+)\s+word\(s\)\s+from\s+(.*)$/;
const HALTED_RE = /^halted after\s+(\d+)\s+instruction\(s\)\s*$/;
const RUNTIME_WITH_PC_RE =
  new RegExp('^runtime error at PC=(' + HEX8 + ')\\s*\\(step\\s+(\\d+)\\):\\s*(.*)$');
const RUNTIME_PLAIN_RE = /^runtime error:\s*(.*)$/;
const EMU_ERROR_RE = /^error:\s*(.*)$/;

function emptyRegisters() {
  return {
    A: { hex: '00000000', signed: 0 },
    B: { hex: '00000000', signed: 0 },
    PC: { hex: '00000000', signed: 0 },
    SP: { hex: '00000000', signed: 0 }
  };
}

function parseDumpRow(line, into) {
  const match = DUMP_ROW_RE.exec(line);
  if (!match) {
    return false;
  }
  const base = parseInt(match[1], 16);
  match[2]
    .trim()
    .split(/\s+/)
    .forEach((word, index) => {
      into.push({
        address: base + index,
        hex: word.toUpperCase(),
        signed: toSigned(word)
      });
    });
  return true;
}

/**
 * Parse the emulator's stdout, stderr and exit code.
 *
 * @param {object} result
 * @param {string} result.stdout
 * @param {string} result.stderr
 * @param {number} result.code
 * @returns {{
 *   halted: boolean,
 *   loadedWords: number|null,
 *   stepCount: number|null,
 *   registers: object,
 *   trace: Array<object>,
 *   memoryBefore: Array<object>,
 *   memoryAfter: Array<object>,
 *   runtimeError: {message: string, pc: string|null, step: number|null}|null,
 *   stdout: string,
 *   stderr: string
 * }}
 */
function parseEmuOutput(result) {
  const stdout = result.stdout == null ? '' : String(result.stdout);
  const stderr = result.stderr == null ? '' : String(result.stderr);

  const registers = emptyRegisters();
  const trace = [];
  const memoryBefore = [];
  const memoryAfter = [];

  let halted = false;
  let loadedWords = null;
  let stepCount = null;
  let runtimeError = null;
  let currentDump = null;

  stdout.split(/\r?\n/).forEach((line) => {
    if (line.length === 0) {
      return;
    }

    const heading = DUMP_HEADING_RE.exec(line);
    if (heading) {
      currentDump = heading[1] === 'before' ? memoryBefore : memoryAfter;
      return;
    }

    const loaded = LOADED_RE.exec(line);
    if (loaded) {
      loadedWords = parseInt(loaded[1], 10);
      currentDump = null;
      return;
    }

    const halt = HALTED_RE.exec(line);
    if (halt) {
      halted = true;
      stepCount = parseInt(halt[1], 10);
      currentDump = null;
      return;
    }

    const register = REGISTER_RE.exec(line);
    if (register) {
      registers[register[1]] = {
        hex: register[2].toUpperCase(),
        signed: parseInt(register[3], 10)
      };
      currentDump = null;
      return;
    }

    const step = TRACE_RE.exec(line);
    if (step) {
      trace.push({
        index: trace.length,
        pc: step[1].toUpperCase(),
        pcValue: parseInt(step[1], 16),
        a: step[2].toUpperCase(),
        aSigned: toSigned(step[2]),
        b: step[3].toUpperCase(),
        bSigned: toSigned(step[3]),
        sp: step[4].toUpperCase(),
        spSigned: toSigned(step[4]),
        instruction: step[5].trim()
      });
      currentDump = null;
      return;
    }

    /* A dump row is only a dump row while a dump heading is in effect, which
     * stops a trace or register line from ever being read as memory. */
    if (currentDump) {
      parseDumpRow(line, currentDump);
    }
  });

  stderr.split(/\r?\n/).forEach((line) => {
    if (line.length === 0 || runtimeError) {
      return;
    }
    const withPc = RUNTIME_WITH_PC_RE.exec(line);
    if (withPc) {
      runtimeError = {
        message: withPc[3].trim(),
        pc: withPc[1].toUpperCase(),
        step: parseInt(withPc[2], 10)
      };
      return;
    }
    const plain = RUNTIME_PLAIN_RE.exec(line);
    if (plain) {
      runtimeError = { message: plain[1].trim(), pc: null, step: null };
      return;
    }
    const failure = EMU_ERROR_RE.exec(line);
    if (failure) {
      runtimeError = { message: failure[1].trim(), pc: null, step: null };
    }
  });

  if (result.code !== 0 && !runtimeError) {
    runtimeError = {
      message: 'the emulator exited with status ' + result.code,
      pc: null,
      step: null
    };
  }

  return {
    halted,
    loadedWords,
    stepCount,
    registers,
    trace,
    memoryBefore,
    memoryAfter,
    runtimeError,
    stdout,
    stderr
  };
}

module.exports = { parseEmuOutput };
