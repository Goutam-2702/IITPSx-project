/*
 * isa.js - the IITPSx instruction set, used for syntax highlighting and the
 * Help panel. Mirrors instruction_table[] in src/asm.c.
 */

export const INSTRUCTIONS = [
  { m: 'data',   op: null, operand: 'value',  kind: 'pseudo', sem: 'Reserve one word holding the value' },
  { m: 'ldc',    op: 0,    operand: 'value',  kind: 'value',  sem: 'B := A; A := value' },
  { m: 'adc',    op: 1,    operand: 'value',  kind: 'value',  sem: 'A := A + value' },
  { m: 'ldl',    op: 2,    operand: 'offset', kind: 'value',  sem: 'B := A; A := mem[SP + offset]' },
  { m: 'stl',    op: 3,    operand: 'offset', kind: 'value',  sem: 'mem[SP + offset] := A; A := B' },
  { m: 'ldnl',   op: 4,    operand: 'offset', kind: 'value',  sem: 'A := mem[A + offset]' },
  { m: 'stnl',   op: 5,    operand: 'offset', kind: 'value',  sem: 'mem[A + offset] := B' },
  { m: 'add',    op: 6,    operand: 'none',   kind: 'none',   sem: 'A := B + A' },
  { m: 'sub',    op: 7,    operand: 'none',   kind: 'none',   sem: 'A := B - A' },
  { m: 'shl',    op: 8,    operand: 'none',   kind: 'none',   sem: 'A := B << A' },
  { m: 'shr',    op: 9,    operand: 'none',   kind: 'none',   sem: 'A := B >> A (arithmetic)' },
  { m: 'adj',    op: 10,   operand: 'value',  kind: 'value',  sem: 'SP := SP + value' },
  { m: 'a2sp',   op: 11,   operand: 'none',   kind: 'none',   sem: 'SP := A; A := B' },
  { m: 'sp2a',   op: 12,   operand: 'none',   kind: 'none',   sem: 'B := A; A := SP' },
  { m: 'call',   op: 13,   operand: 'offset', kind: 'branch', sem: 'B := A; A := PC; PC := PC + offset' },
  { m: 'return', op: 14,   operand: 'none',   kind: 'none',   sem: 'PC := A; A := B' },
  { m: 'brz',    op: 15,   operand: 'offset', kind: 'branch', sem: 'if A == 0 then PC := PC + offset' },
  { m: 'brlz',   op: 16,   operand: 'offset', kind: 'branch', sem: 'if A < 0 then PC := PC + offset' },
  { m: 'br',     op: 17,   operand: 'offset', kind: 'branch', sem: 'PC := PC + offset' },
  { m: 'HALT',   op: 18,   operand: 'none',   kind: 'none',   sem: 'Stop the emulator' },
  { m: 'mul',    op: 19,   operand: 'none',   kind: 'none',   sem: 'A := B * A' },
  { m: 'div',    op: 20,   operand: 'none',   kind: 'none',   sem: 'A := B / A signed; zero divisor is a runtime error' },
  { m: 'SET',    op: null, operand: 'value',  kind: 'pseudo', sem: 'The label on this line takes the operand value instead of the PC' }
];

/* Lower-cased lookup, because the assembler matches case-insensitively. */
export const MNEMONICS = new Set(INSTRUCTIONS.map((i) => i.m.toLowerCase()));
export const PSEUDO = new Set(['data', 'set']);
