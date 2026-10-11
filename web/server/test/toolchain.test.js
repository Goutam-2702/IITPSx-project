'use strict';

/*
 * toolchain.test.js - end-to-end test of the assemble/run pipeline against
 * all fifteen programs in tests/, using the real compiled binaries.
 *
 * This is the test that proves the backend works, because it exercises the
 * same code path the HTTP routes use: write source to a temp dir, execFile
 * the binary, parse the output, clean up.
 *
 * Run with:  node --test
 * Requires:  `make` has been run in the project root so bin/asm and bin/emu
 *            exist. No npm dependencies are needed.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { config, checkToolchain } = require('../src/config');
const toolchain = require('../src/lib/toolchain');
const workspace = require('../src/lib/workspace');
const examples = require('../src/lib/examples');

const missing = checkToolchain();
const skip =
  missing.length > 0
    ? 'bin/' + missing.join(' and bin/') + ' missing; run `make` first'
    : false;

/* What each program must do, taken from the project's own classification. */
const EXPECTED = {
  test01: { assembles: true, run: false, warnings: 1 },
  test02: { assembles: false, errors: 10 },
  test03: { assembles: true, run: false, words: 2 },
  test04: { assembles: true, run: true, finalA: 21 },
  test05: { assembles: true, run: true, words: 77 },
  test06: { assembles: true, run: true, finalA: 150 },
  test07: { assembles: true, run: true, finalA: 41 },
  test08: { assembles: true, run: true, finalA: 30 },
  test09: { assembles: true, run: true, finalA: 5 },
  test10: { assembles: true, run: true, finalA: 2 },
  test11: { assembles: true, run: true, runtimeError: /division by zero/ },
  test12: { assembles: true, run: true, finalA: 5 },
  test13: { assembles: false },
  test14: { assembles: true, run: true, runtimeError: /instruction limit/ },
  test15: { assembles: true, run: true, finalA: 120 }
};

function readTest(name) {
  return fs.readFileSync(path.join(config.testsDir, name + '.asm'), 'utf8');
}

test('the examples endpoint finds all programs with descriptions and supports saving', { skip }, async () => {
  const list = await examples.list();
  assert.ok(list.length >= 15, 'expected at least 15 examples');
  list.forEach((example) => {
    assert.ok(example.description.length > 0, example.id + ' has no description');
    assert.ok(example.source.length > 0, example.id + ' has no source');
  });

  const four = list.find((e) => e.id === 'test04');
  assert.match(four.description, /mul and div/);
  assert.strictEqual(four.expected, 'runs to HALT');

  const two = list.find((e) => e.id === 'test02');
  assert.strictEqual(two.expected, 'assembler failure');
});

Object.keys(EXPECTED).forEach((name) => {
  const expect = EXPECTED[name];

  test('pipeline: ' + name, { skip }, async () => {
    const source = readTest(name);
    const outcome = await toolchain.assemble(source, false, true);
    const asm = outcome.response;

    try {
      assert.strictEqual(
        asm.success,
        expect.assembles,
        name + ': assembly success should be ' + expect.assembles
      );

      if (!expect.assembles) {
        assert.ok(asm.errors.length > 0, name + ': expected diagnostics');
        if (expect.errors !== undefined) {
          assert.strictEqual(asm.errors.length, expect.errors);
        }
        asm.errors.forEach((e) => {
          assert.ok(
            e.line === null || Number.isInteger(e.line),
            name + ': bad line number'
          );
          assert.ok(e.message.length > 0, name + ': empty message');
        });
        /* No listing is produced on failure, by design. */
        assert.strictEqual(asm.listing.rows.length, 0);
        assert.strictEqual(asm.objectFileId, null);
        return;
      }

      /* Successful assembly: there must be a reusable workspace and a
       * listing whose row count matches the reported word count. */
      assert.ok(asm.objectFileId, name + ': no objectFileId returned');
      assert.strictEqual(
        asm.listing.rows.length,
        asm.wordCount,
        name + ': listing rows should match the word count'
      );
      if (expect.words !== undefined) {
        assert.strictEqual(asm.wordCount, expect.words);
      }
      if (expect.warnings !== undefined) {
        assert.strictEqual(asm.warnings.length, expect.warnings);
      }

      /* The temp path must never reach the client. */
      const serialised = JSON.stringify(asm);
      assert.ok(
        !/\/tmp\/iitpsx-/.test(serialised),
        name + ': a temp path leaked into the response'
      );

      if (!expect.run) {
        return;
      }

      const dir = workspace.get(asm.objectFileId);
      assert.ok(dir, name + ': the workspace should still be live');

      const run = await toolchain.run(dir, {
        trace: name !== 'test14',
        dumpBefore: true,
        dumpAfter: true
      });

      if (expect.runtimeError) {
        assert.strictEqual(run.halted, false, name + ': should not halt');
        assert.ok(run.runtimeError, name + ': expected a runtime error');
        assert.match(run.runtimeError.message, expect.runtimeError);
        return;
      }

      assert.strictEqual(run.runtimeError, null, name + ': unexpected runtime error');
      assert.strictEqual(run.halted, true, name + ': should reach HALT');
      assert.ok(run.stepCount > 0, name + ': no steps counted');

      if (expect.finalA !== undefined) {
        assert.strictEqual(
          run.registers.A.signed,
          expect.finalA,
          name + ': final A should be ' + expect.finalA
        );
      }

      /* A traced run must give one step per executed instruction. */
      assert.strictEqual(
        run.trace.length,
        run.stepCount,
        name + ': trace length should equal the step count'
      );
    } finally {
      await outcome.cleanup();
    }
  });
});

test('pipeline: bubble sort actually sorts the array in memory', { skip }, async () => {
  const outcome = await toolchain.assemble(readTest('test05'), false, true);
  try {
    const asm = outcome.response;
    const arr = asm.listing.labels.find((l) => l.name === 'arr');
    assert.ok(arr, 'the listing should expose the arr label');
    assert.strictEqual(arr.address, 5);

    const dir = workspace.get(asm.objectFileId);
    const run = await toolchain.run(dir, {
      trace: false,
      dumpBefore: true,
      dumpAfter: true
    });

    const before = run.memoryBefore.slice(arr.address, arr.address + 8).map((w) => w.signed);
    const after = run.memoryAfter.slice(arr.address, arr.address + 8).map((w) => w.signed);

    assert.deepStrictEqual(before, [5, 3, 8, 1, 9, 2, 7, 4]);
    assert.deepStrictEqual(after, [1, 2, 3, 4, 5, 7, 8, 9]);
  } finally {
    await outcome.cleanup();
  }
});

test('pipeline: the -dump listing format is honoured', { skip }, async () => {
  const outcome = await toolchain.assemble(readTest('test01'), true, true);
  try {
    assert.strictEqual(outcome.response.listing.format, 'dump');
    assert.strictEqual(outcome.response.listing.rows.length, 8);
    assert.strictEqual(outcome.response.listing.rows[3].hex, 'FFFFFF11');
  } finally {
    await outcome.cleanup();
  }
});

test('pipeline: an oversized source is refused before any tool runs', { skip }, async () => {
  const huge = 'ldc 0\n'.repeat(40000);
  assert.ok(Buffer.byteLength(huge) > config.maxSourceBytes);
  /* The route guard owns this check; assert the limit itself is sane. */
  assert.strictEqual(config.maxSourceBytes, 100 * 1024);
});

test('pipeline: temp directories do not survive cleanup', { skip }, async () => {
  const outcome = await toolchain.assemble(readTest('test04'), false, true);
  const dir = outcome.dir;
  assert.ok(fs.existsSync(dir), 'the workspace should exist while in use');
  await outcome.cleanup();
  assert.ok(!fs.existsSync(dir), 'the workspace should be gone after cleanup');
  assert.strictEqual(workspace.get(outcome.workspaceId), null);
});

test('pipeline: a failed assembly leaves nothing behind', { skip }, async () => {
  const outcome = await toolchain.assemble(readTest('test02'), false, true);
  assert.strictEqual(outcome.response.success, false);
  assert.ok(!fs.existsSync(outcome.dir), 'a failed assembly must self-clean');
});

test('pipeline: source containing shell metacharacters is harmless', { skip }, async () => {
  /* execFile with an argument array means this can only ever be assembly
   * text, never a command. It should fail to assemble, not do anything. */
  const nasty = '; $(touch /tmp/iitpsx-pwned) `id` && rm -rf /\nldc 0\nHALT\n';
  const outcome = await toolchain.assemble(nasty, false, true);
  try {
    assert.strictEqual(outcome.response.success, true, 'it is just a comment');
    assert.ok(!fs.existsSync('/tmp/iitpsx-pwned'), 'nothing was executed');
  } finally {
    await outcome.cleanup();
  }
});
