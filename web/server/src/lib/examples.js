'use strict';

const fs = require('fs/promises');
const path = require('path');

const { config } = require('../config');

function parseHeader(source) {
  const lines = source.split(/\r?\n/);
  const header = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) {
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

  return examples;
}

async function saveExample(name, source) {
  let cleanName = (name || '').trim();
  if (cleanName.toLowerCase().endsWith('.asm')) {
    cleanName = cleanName.slice(0, -4);
  }
  if (!cleanName || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
    throw new Error('Test case name must contain only letters, numbers, hyphens, and underscores (e.g. test16)');
  }

  const filename = cleanName + '.asm';
  const filePath = path.join(config.testsDir, filename);
  await fs.writeFile(filePath, source, 'utf8');

  const meta = parseHeader(source);
  return {
    id: cleanName,
    file: filename,
    title: cleanName,
    description: meta.purpose,
    header: meta.header,
    expected: classify(cleanName),
    lineCount: source.split(/\r?\n/).length,
    source: source
  };
}

module.exports = { list, saveExample };
