'use strict';

/*
 * parsers.test.js - asserts the parsers against REAL output captured from the
 * compiled bin/asm and bin/emu (see fixtures.js).
 *
 * Run with:  node --test
 * No dependencies are needed, so this works before npm install.
 */

const test = require('node:test');
const assert = require('node:assert');

const fx = require('./fixtures');
const { parseAsmOutput } = require('../src/lib/parseAsm');
const { parseListing } = require('../src/lib/parseListing');
const { parseEmuOutput } = require('../src/lib/parseEmu');

/* ------------------------------------------------------------------ asm --- */

test('asm: a clean assembly reports success and the word count', () => {
  const parsed = parseAsmOutput(fx.asm_test04);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.wordCount, 6);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.warnings.length, 0);
});

test('asm: bubble sort assembles to 77 words', () => {
  const parsed = parseAsmOutput(fx.asm_test05);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.wordCount, 77);
});

test('asm: test02 yields all ten errors and one warning, correctly split', () => {
  const parsed = parseAsmOutput(fx.asm_test02);
  assert.strictEqual(parsed.success, false);
  assert.strictEqual(parsed.errors.length, 10);
  assert.strictEqual(parsed.warnings.length, 1);

  /* The summary line must not have been counted as a diagnostic. */
  parsed.errors.concat(parsed.warnings).forEach((d) => {
    assert.ok(!/error\(s\)/.test(d.message), 'summary leaked: ' + d.message);
  });
});

test('asm: errors carry the exact line numbers the binary reported', () => {
  const parsed = parseAsmOutput(fx.asm_test02);
  const lines = parsed.errors.map((e) => e.line);
  assert.deepStrictEqual(lines, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.strictEqual(parsed.warnings[0].line, 7);
});

test('asm: the duplicate-label message survives intact', () => {
  const parsed = parseAsmOutput(fx.asm_test02);
  const duplicate = parsed.errors.find((e) => e.line === 8);
  assert.strictEqual(
    duplicate.message,
    "duplicate label 'label' (first defined on line 7)"
  );
});

test('asm: an unused label is a warning, and assembly still succeeds', () => {
  const parsed = parseAsmOutput(fx.asm_test01_dump);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.warnings.length, 1);
  assert.strictEqual(parsed.warnings[0].line, 7);
  assert.match(parsed.warnings[0].message, /unused label/);
});

/* -------------------------------------------------------------- listing --- */

test('listing: advanced format gives one row per word with its mnemonic', () => {
  const parsed = parseListing(fx.lst_test04, false);
  assert.strictEqual(parsed.format, 'advanced');
  assert.strictEqual(parsed.rows.length, 6);
  assert.deepStrictEqual(parsed.rows[0], {
    address: 0,
    hex: '00000600',
    signed: 0x00000600,
    text: 'ldc 0x6'
  });
  assert.strictEqual(parsed.rows[2].text, 'mul');
  assert.strictEqual(parsed.rows[4].text, 'div');
  assert.strictEqual(parsed.rows[5].text, 'HALT');
});

test('listing: label lines are separated from code lines', () => {
  const parsed = parseListing(fx.lst_test05, false);
  assert.strictEqual(parsed.rows.length, 77, 'one row per emitted word');

  const arr = parsed.labels.find((l) => l.name === 'arr');
  assert.strictEqual(arr.address, 5, 'arr is at address 5');

  const start = parsed.labels.find((l) => l.name === 'start');
  assert.strictEqual(start.address, 0x0d);
});

test('listing: a branch prints its target label, not a raw offset', () => {
  const parsed = parseListing(fx.lst_test05, false);
  assert.strictEqual(parsed.rows[0].text, 'br start');
});

test('listing: the symbol table is parsed, including SET entries', () => {
  const advanced = parseListing(fx.lst_test05, false);
  const arr = advanced.symbols.find((s) => s.name === 'arr');
  assert.strictEqual(arr.address, 5);
  assert.strictEqual(arr.isSet, false);

  const set = parseListing(fx.lst_test03, false);
  const val = set.symbols.find((s) => s.name === 'val');
  assert.strictEqual(val.address, 75, 'val: SET 75');
  assert.strictEqual(val.isSet, true);
  const val2 = set.symbols.find((s) => s.name === 'val2');
  assert.strictEqual(val2.address, 66, 'val2: SET 66');
  assert.strictEqual(val2.isSet, true);
});

test('listing: SET emits no word, so the program is two words long', () => {
  const parsed = parseListing(fx.lst_test03, false);
  assert.strictEqual(parsed.rows.length, 2);
});

test('listing: dump format expands four words per line', () => {
  const parsed = parseListing(fx.lst_test01_dump, true);
  assert.strictEqual(parsed.format, 'dump');
  assert.strictEqual(parsed.rows.length, 8);
  assert.strictEqual(parsed.rows[0].address, 0);
  assert.strictEqual(parsed.rows[3].hex, 'FFFFFF11', 'br loop, offset -1');
  assert.strictEqual(parsed.rows[3].signed, -239);
  assert.strictEqual(parsed.rows[4].address, 4);
  assert.strictEqual(parsed.rows[4].hex, '00000011', 'br next, offset 0');
});

/* ------------------------------------------------------------------ emu --- */

test('emu: a clean run reports halted, the step count and all registers', () => {
  const parsed = parseEmuOutput(fx.emu_test04);
  assert.strictEqual(parsed.halted, true);
  assert.strictEqual(parsed.runtimeError, null);
  assert.strictEqual(parsed.loadedWords, 6);
  assert.strictEqual(parsed.stepCount, 6);
  assert.strictEqual(parsed.registers.A.hex, '00000015');
  assert.strictEqual(parsed.registers.A.signed, 21, 'mul then div gives 21');
  assert.strictEqual(parsed.registers.B.signed, 42);
  assert.strictEqual(parsed.registers.PC.signed, 6);
  assert.strictEqual(parsed.registers.SP.signed, 1048575);
});

test('emu: -trace gives one parsed step per instruction', () => {
  const parsed = parseEmuOutput(fx.emu_test04_trace);
  assert.strictEqual(parsed.trace.length, 6);
  assert.deepStrictEqual(
    parsed.trace.map((s) => s.instruction),
    ['ldc 6', 'ldc 7', 'mul', 'ldc 2', 'div', 'HALT']
  );
  assert.strictEqual(parsed.trace[0].pcValue, 0);
  assert.strictEqual(parsed.trace[2].aSigned, 7, 'A is 7 before mul runs');
  assert.strictEqual(parsed.trace[2].bSigned, 6, 'B is 6 before mul runs');
  assert.strictEqual(parsed.trace[3].aSigned, 42, 'A is 42 after mul');
  assert.strictEqual(parsed.trace[5].aSigned, 21, 'A is 21 after div');
});

test('emu: trace lines are never mistaken for memory rows', () => {
  const parsed = parseEmuOutput(fx.emu_test04_trace);
  assert.strictEqual(parsed.memoryBefore.length, 0);
  assert.strictEqual(parsed.memoryAfter.length, 0);
});

test('emu: -before and -after produce two separate memory snapshots', () => {
  const parsed = parseEmuOutput(fx.emu_test05_dumps);
  assert.strictEqual(parsed.memoryBefore.length, 77);
  assert.strictEqual(parsed.memoryAfter.length, 77);

  /* arr is at address 5 and holds eight elements. */
  const before = parsed.memoryBefore.slice(5, 13).map((w) => w.signed);
  const after = parsed.memoryAfter.slice(5, 13).map((w) => w.signed);
  assert.deepStrictEqual(before, [5, 3, 8, 1, 9, 2, 7, 4], 'unsorted input');
  assert.deepStrictEqual(after, [1, 2, 3, 4, 5, 7, 8, 9], 'sorted output');
});

test('emu: division by zero is reported with its PC and step', () => {
  const parsed = parseEmuOutput(fx.emu_test11);
  assert.strictEqual(parsed.halted, false);
  assert.ok(parsed.runtimeError, 'a runtime error must be reported');
  assert.strictEqual(parsed.runtimeError.message, 'division by zero');
  assert.strictEqual(parsed.runtimeError.pc, '00000002');
  assert.strictEqual(parsed.runtimeError.step, 3);
});

test('emu: the instruction limit is reported even with no PC in the message', () => {
  const parsed = parseEmuOutput(fx.emu_test14);
  assert.strictEqual(parsed.halted, false);
  assert.ok(parsed.runtimeError);
  assert.match(parsed.runtimeError.message, /instruction limit/);
  assert.strictEqual(parsed.runtimeError.pc, null);
});
