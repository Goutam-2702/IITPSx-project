'use strict';

/*
 * parseAsm.js - parse the real output of bin/asm.
 *
 * Every pattern below was written against output actually captured from the
 * compiled binary, not from the specification. The captured samples are in
 * test/fixtures.js and are asserted in test/parsers.test.js.
 *
 * Diagnostics arrive on stderr in two shapes:
 *
 *   tests/test02.asm:8: error: duplicate label 'label' (first defined on line 7)
 *   tests/test02.asm:7: warning: unused label 'label'
 *
 * followed by a summary line that has no line number and must NOT be treated
 * as a diagnostic:
 *
 *   tests/test02.asm: 10 error(s), 1 warning(s); no output written
 *
 * On success stdout carries:
 *
 *   tests/test04.asm: assembled 6 word(s), 0 warning(s)
 *     object  : /tmp/x/test04.o
 *     listing : /tmp/x/test04.lst
 */

/* path:line: error|warning: message */
const DIAGNOSTIC_RE = /^(.*?):(\d+):\s+(error|warning):\s+(.*)$/;

/* path: N error(s), M warning(s); no output written */
const FAIL_SUMMARY_RE =
  /^(.*?):\s+(\d+)\s+error\(s\),\s+(\d+)\s+warning\(s\)/;

/* path: assembled N word(s), M warning(s) */
const OK_SUMMARY_RE =
  /^(.*?):\s+assembled\s+(\d+)\s+word\(s\),\s+(\d+)\s+warning\(s\)/;

/* Internal errors the assembler reports without a line number. */
const BARE_ERROR_RE = /^(?:.*?:\s*)?error:\s+(.*)$/;

function splitLines(text) {
  if (!text) {
    return [];
  }
  return String(text).split(/\r?\n/).filter((line) => line.length > 0);
}

/**
 * Parse the assembler's stdout, stderr and exit code.
 *
 * @param {object} result
 * @param {string} result.stdout
 * @param {string} result.stderr
 * @param {number} result.code      process exit code (0 means success)
 * @returns {{
 *   success: boolean,
 *   errors: Array<{line: number|null, message: string}>,
 *   warnings: Array<{line: number|null, message: string}>,
 *   wordCount: number|null,
 *   summary: string
 * }}
 */
function parseAsmOutput(result) {
  const errors = [];
  const warnings = [];
  let wordCount = null;
  let summary = '';

  const lines = splitLines(result.stderr).concat(splitLines(result.stdout));

  lines.forEach((line) => {
    const diagnostic = DIAGNOSTIC_RE.exec(line);
    if (diagnostic) {
      const entry = {
        line: parseInt(diagnostic[2], 10),
        message: diagnostic[4].trim()
      };
      if (diagnostic[3] === 'error') {
        errors.push(entry);
      } else {
        warnings.push(entry);
      }
      return;
    }

    const failSummary = FAIL_SUMMARY_RE.exec(line);
    if (failSummary) {
      summary = line.slice(failSummary[1].length + 1).trim();
      return;
    }

    const okSummary = OK_SUMMARY_RE.exec(line);
    if (okSummary) {
      wordCount = parseInt(okSummary[2], 10);
      summary = line.slice(okSummary[1].length + 1).trim();
      return;
    }

    /* An error with no line number, for example a file it could not open. */
    const bare = BARE_ERROR_RE.exec(line);
    if (bare) {
      errors.push({ line: null, message: bare[1].trim() });
    }
  });

  /* The exit code is authoritative. If it is non-zero but nothing was
   * recognised, surface something useful rather than claiming success. */
  const success = result.code === 0;
  if (!success && errors.length === 0) {
    errors.push({
      line: null,
      message: summary || 'the assembler reported a failure with no detail'
    });
  }

  /* Sort by line so the editor gutter reads top to bottom. The assembler
   * emits pass-1 diagnostics before pass-2 ones, so line 9 can appear after
   * line 16 in the raw output. */
  const byLine = (a, b) => (a.line || 0) - (b.line || 0);
  errors.sort(byLine);
  warnings.sort(byLine);

  return { success, errors, warnings, wordCount, summary };
}

module.exports = { parseAsmOutput };
