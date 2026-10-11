'use strict';

const fs = require('fs/promises');
const path = require('path');

const { config } = require('../config');

/*
 * examples.js - reads tests/*.asm and turns the header comment block into a
 * description.
 *
 * Each test file opens with a block like:
 *
 *   ; test04.asm
 *   ; Purpose : the two IITPSx arithmetic extensions, mul and div.
 *   ; Expected: assembles and runs. 6 * 7 = 42, then 42 / 2 = 21,
 *   ;           so the final value of register A is 21 (0x15).
 *
 * The 'Purpose' text becomes the short description shown in the dropdown and
 * the whole block is kept as the long description.
 */

let cache = null;

function parseHeader(source) {
  const lines = source.split(/\r?\n/);
  const header = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) {
      /* A blank line inside the header block is allowed only before it
       * starts; once comments have begun, a blank line ends the block. */
      if (header.length > 0) {
        break;
      }
      continue;
    }
    if (line.charAt(0) !== ';') {
      break;
    }
    header.push(line.replace(/^;\s?/, ''));
  }

  const joined = header.join('\n');

  /* Pull out "Purpose : ..." including any continuation lines, which are the
   * ones indented under it rather than starting a new "Key :" field. */
  let purpose = '';
  const fieldStart = /^([A-Z][A-Za-z]*)\s*:\s*(.*)$/;
  let collecting = false;
  header.forEach((line) => {
    const field = fieldStart.exec(line);
    if (field) {
      if (field[1] === 'Purpose') {
        purpose = field[2].trim();
        collecting = true;
      } else if (collecting) {
        collecting = false;
      }
      return;
    }
    if (collecting) {
      purpose = (purpose + ' ' + line.trim()).trim();
    }
  });

  if (!purpose && header.length > 1) {
    purpose = header[1];
  }
  return { purpose: purpose, header: joined };
}

/* Expected outcome, taken from the project's own test classification. */
function classify(name) {
  if (name === 'test02' || name === 'test13') {
    return 'assembler failure';
  }
  if (name === 'test01' || name === 'test03') {
    return 'assembler only';
  }
  if (name === 'test11' || name === 'test14') {
    return 'runtime error';
  }
  return 'runs to HALT';
}

async function list() {
  if (cache) {
    return cache;
  }
  let names;
  try {
    names = await fs.readdir(config.testsDir);
  } catch (err) {
    throw new Error(
      'could not read the tests directory at ' +
        config.testsDir +
        '. Check IITPSX_ROOT.'
    );
  }

  const asmFiles = names
    .filter((n) => /\.asm$/i.test(n))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const examples = [];
  for (let i = 0; i < asmFiles.length; i += 1) {
    const file = asmFiles[i];
    const source = await fs.readFile(path.join(config.testsDir, file), 'utf8');
    const meta = parseHeader(source);
    const id = file.replace(/\.asm$/i, '');
    examples.push({
      id: id,
      file: file,
      title: id,
      description: meta.purpose,
      header: meta.header,
      expected: classify(id),
      lineCount: source.split(/\r?\n/).length,
      source: source
    });
  }

  cache = examples;
  return examples;
}

module.exports = { list: list };
