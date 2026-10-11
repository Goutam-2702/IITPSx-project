'use strict';

/*
 * parseListing.js - parse the .lst files that bin/asm writes.
 *
 * Advanced format (the default). Captured from tests/test05.asm:
 *
 *   00000000 00000C11 br start
 *   00000001 i:
 *   00000001 00000000 data 0x0
 *
 *   Symbol table
 *     i                        00000001
 *     arr                      00000005
 *     val                      0000004B (SET)
 *
 * Dump format (-dump). Captured from tests/test01.asm:
 *
 *   00000000 00000000 FFFFFB00 00000500 FFFFFF11
 *   00000004 00000011 00000300 00000700 00000000
 *
 * A label line and a code line both begin with eight hex digits, so they are
 * told apart by what follows: another hex word means code, a name ending in
 * ':' means a label.
 */

const HEX8 = '[0-9A-Fa-f]{8}';
const LABEL_LINE_RE = new RegExp('^(' + HEX8 + ')\\s+([A-Za-z][A-Za-z0-9]*):\\s*$');
const CODE_LINE_RE = new RegExp('^(' + HEX8 + ')\\s+(' + HEX8 + ')(?:\\s+(.*))?$');
const DUMP_LINE_RE = new RegExp('^(' + HEX8 + ')((?:\\s+' + HEX8 + ')+)\\s*$');
const SYMBOL_RE = new RegExp('^\\s+(\\S+)\\s+(' + HEX8 + ')\\s*(\\(SET\\))?\\s*$');
const SYMBOL_HEADING = /^Symbol table\s*$/;

/* Convert a 32-bit hex word to its signed decimal value. */
function toSigned(hex) {
  const unsigned = parseInt(hex, 16);
  return unsigned >= 0x80000000 ? unsigned - 0x100000000 : unsigned;
}

/**
 * Parse a listing file.
 *
 * @param {string} text        the file contents
 * @param {boolean} dumpFormat true when the file was produced with -dump
 * @returns {{
 *   format: 'advanced'|'dump',
 *   raw: string,
 *   rows: Array<{address: number, hex: string, signed: number, text: string}>,
 *   labels: Array<{name: string, address: number}>,
 *   symbols: Array<{name: string, address: number, hex: string, isSet: boolean}>
 * }}
 */
function parseListing(text, dumpFormat) {
  const raw = text == null ? '' : String(text);
  const lines = raw.split(/\r?\n/);
  const rows = [];
  const labels = [];
  const symbols = [];
  let inSymbolTable = false;

  lines.forEach((line) => {
    if (line.trim().length === 0) {
      return;
    }
    if (SYMBOL_HEADING.test(line.trim())) {
      inSymbolTable = true;
      return;
    }

    if (inSymbolTable) {
      const symbol = SYMBOL_RE.exec(line);
      if (symbol) {
        symbols.push({
          name: symbol[1],
          address: parseInt(symbol[2], 16),
          hex: symbol[2].toUpperCase(),
          isSet: Boolean(symbol[3])
        });
      }
      return;
    }

    if (dumpFormat) {
      const dump = DUMP_LINE_RE.exec(line);
      if (dump) {
        const base = parseInt(dump[1], 16);
        const words = dump[2].trim().split(/\s+/);
        words.forEach((word, index) => {
          rows.push({
            address: base + index,
            hex: word.toUpperCase(),
            signed: toSigned(word),
            text: ''
          });
        });
      }
      return;
    }

    const label = LABEL_LINE_RE.exec(line);
    if (label) {
      labels.push({ name: label[2], address: parseInt(label[1], 16) });
      return;
    }

    const code = CODE_LINE_RE.exec(line);
    if (code) {
      rows.push({
        address: parseInt(code[1], 16),
        hex: code[2].toUpperCase(),
        signed: toSigned(code[2]),
        text: (code[3] || '').trim()
      });
    }
  });

  return {
    format: dumpFormat ? 'dump' : 'advanced',
    raw,
    rows,
    labels,
    symbols
  };
}

module.exports = { parseListing, toSigned };
