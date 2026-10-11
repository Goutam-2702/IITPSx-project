<!-- Source: README.md -->
# CS2102 MiniProject 2026 - IITPSx Processor

A two-pass assembler and an emulator for the IITPSx 32-bit stack processor,
written in ISO C89.

## Layout

```
.
├── Makefile              build, test and submission targets
├── claims                claims against the marking scheme
├── README.md             this file
├── src/
│   ├── asm.c             two-pass assembler
│   └── emu.c             emulator
├── tests/
│   └── test01.asm ..     fifteen test programs, each with a header comment
├── listings/             generated .lst files   (make test)
├── logs/                 generated .log files   (make test)
├── scripts/
│   ├── run_tests.sh      test runner, writes listings/ and logs/
│   └── Makefile.flat     the Makefile copied into submission/
├── docs/
│   ├── DESIGN.md         how both programs work, and why
│   └── INSTRUCTION_SET.md  the instruction table reference
├── web/                  optional web UI for live demos (see web/README.md)
└── submission/           flat folder for upload   (make submission)
```

## Build

```
make              # builds bin/asm and bin/emu
make strict       # clean rebuild with every required warning flag
make test         # assembles and runs all fifteen tests
make sanitize     # development check with the address and UB sanitizers
make submission   # assembles the flat submission/ folder
make clean
```

The compile flags are the ones the marking scheme requires:

```
gcc -std=c89 -pedantic -W -Wall -Wpointer-arith -Wwrite-strings \
    -Wstrict-prototypes
```

Both programs build with zero errors and zero warnings under those flags.

## Running the assembler

```
bin/asm [-dump] <source.asm> [object.o] [listing.lst]
```

If the object and listing names are omitted they are derived from the
source name, so `test01.asm` gives `test01.o` and `test01.lst`.
`-dump` selects the plain memory-dump listing format instead of the
advanced format.

Errors go to standard error as `file:line: error: message`. The assembler
continues after an error so that all of them are reported in one run, then
exits non-zero. Neither the object file nor the listing is written when the
source contains an error.

## Running the emulator

```
bin/emu [-trace] [-dump] [-isa] [-before] [-after] <prog.o>
```

| Option    | Effect                                                    |
|-----------|-----------------------------------------------------------|
| `-trace`  | print PC, A, B, SP and the decoded instruction each step  |
| `-before` | memory dump immediately after loading                     |
| `-after`  | memory dump after execution finishes                      |
| `-dump`   | synonym for `-after`                                      |
| `-isa`    | print the instruction set table                           |

## Test suite

| File     | Purpose                                      | Expected        |
|----------|----------------------------------------------|-----------------|
| test01   | spec example, valid but nonsense             | asm success     |
| test02   | spec example, ten distinct errors            | asm failure     |
| test03   | SET pseudo-instruction                       | asm success     |
| test04   | mul and div                                  | runs, A = 21    |
| test05   | bubble sort                                  | runs, sorted    |
| test06   | sum of n numbers                             | runs, A = 150   |
| test07   | polynomial by Horner, uses mul               | runs, A = 41    |
| test08   | mean, uses div                                | runs, A = 30    |
| test09   | median, sorts then selects                   | runs, A = 5     |
| test10   | standard deviation, uses mul and div          | runs, A = 2     |
| test11   | division by zero                             | runtime error   |
| test12   | hex, octal, signed and boundary operands      | runs, A = 5     |
| test13   | lexical and range edge cases                 | asm failure     |
| test14   | infinite loop                                | runtime error   |
| test15   | call, return, adj, ldl, stl; factorial        | runs, A = 120   |

`make test` runs all of them and reports whether each behaved as expected.
Every run writes `logs/testNN.log`, which contains the source, the exact
commands, the unedited output and the exit status, so the logs are the
evidence the marking scheme asks for.

## Before submitting

1. Replace `<YOUR NAME>` and `<YOUR ROLL NO.>` in `src/asm.c`, `src/emu.c`,
   `Makefile`, `scripts/Makefile.flat`, `scripts/run_tests.sh` and `claims`.
2. Run `make strict` and confirm there is no compiler output.
3. Run `make test` and confirm all fifteen tests behave as expected.
4. Run `make submission` and upload the contents of `submission/`.
5. Re-read `claims` and delete anything you have not personally verified.

## Optional: the web demo bench

`web/` holds a small MERN app for demonstrating the toolchain in a browser.
It is **not** part of the marked submission and it never modifies or
recompiles `src/asm.c` or `src/emu.c` — it runs the compiled `bin/asm` and
`bin/emu` as separate processes and parses their output.

```bash
make                    # build the C tools first
cd web
npm run install:all
npm run dev             # then open http://localhost:5173
```

See `web/README.md` for setup detail and `web/DEMO.md` for a five-step demo
script. MongoDB is optional; without it only the Save button is disabled.


---
<!-- Source: docs/DESIGN.md -->
# Design notes

This document explains how the assembler and the emulator work, and records
every decision the specification left open. The marker may ask about any of
it, so each choice has a reason attached.

## 1. Machine model

| Item       | Value                                                     |
|------------|-----------------------------------------------------------|
| Registers  | A and B (a two-deep internal stack), PC, SP, all 32 bits  |
| Memory     | Word-addressed, each word 32 bits. Code starts at 0       |
| Encoding   | Bits 7..0 opcode, bits 31..8 signed 24-bit operand         |
| PC         | Counts words, not bytes, and advances before execution     |

Encoding and decoding:

```
word    = ((unsigned long)operand << 8) | opcode
opcode  = word & 0xFF
operand = sign_extend_24(word >> 8)
```

The operand field holds -8388608 .. 8388607. A value outside that range is
an assembler error, not a warning, because silently truncating it would
produce a program that runs but computes the wrong thing.

## 2. Assembler

### 2.1 One routine, two passes

`process_file(FILE *fp, int pass)` is called twice from `main()`:

```
process_file(fp, PASS_ONE);   /* assign label values, report syntax errors */
process_file(fp, PASS_TWO);   /* resolve operands, emit words              */
```

It rewinds the file itself, so the caller does not have to. There is no
separate routine for either pass, and no second parse of an internal form.
The specification allows either that design or the read-into-internal-form
design, but not both, and this submission uses the two-pass-over-the-file
design throughout.

Dividing the work between the passes:

| Reported in | Diagnostics                                              |
|-------------|----------------------------------------------------------|
| Pass 1      | invalid label name, colon inside a statement, two labels on one line, unknown mnemonic, missing operand, unexpected operand, extra text at end of line, invalid number, duplicate label, line too long, SET problems |
| Pass 2      | no such label, operand out of 24-bit range                |

Syntax errors are suppressed in pass 2 so that no problem is reported twice.
Unresolved labels are tolerated in pass 1 (that is the whole point of a
second pass) and fatal in pass 2. Operand range is checked in pass 2 because
a label's value is not necessarily known in pass 1.

A defensive cross-check at the end of pass 2 confirms that both passes
agreed on the program size. If they ever disagreed the assembler would say
so rather than emit a silently misaligned object file.

### 2.2 Line parsing

```
strip comment at the first ';'
trim trailing whitespace
skip leading spaces and tabs
if a ':' is present:
    text before it, trimmed, is the candidate label
    if it contains whitespace     -> error: unexpected ':' in statement
    if it is not a valid label    -> error: invalid label name
    if another ':' follows        -> error: more than one label on a line
split the remainder into a mnemonic token and an operand token
anything after the operand except whitespace -> error: extra text
```

Taking the text before the colon as the label is what makes
`label3:ldc label3` work with no space, and it is also what catches
`ldc a:b`, where the candidate label would be `ldc a` and contains a space.

A valid label is a letter followed by letters and digits. Underscores are
**not** accepted, which follows the specification's wording strictly.
Label names are **case-sensitive**, so `Loop` and `loop` are different
labels. Mnemonics are matched **case-insensitively**, so `HALT`, `halt` and
`Halt` are the same instruction. A label may be spelled like a mnemonic
(`add:` is legal) because label detection depends only on the colon.

Numbers go through `strtol(token, &end, 0)`, which picks decimal, hex
(`0x` prefix) or octal (leading `0`) automatically. The whole token must be
consumed (`*end == '\0'`) and `errno` must not be `ERANGE`. That one rule
rejects `08ge`, `08`, `0x`, `5x` and `99999999999999999999` without any
special cases.

Lines are read with `fgets` into a 512-byte buffer. `gets` is never used.
A line that fills the buffer without a newline is reported as too long and
the remainder is discarded so later line numbers stay correct. Both `\n` and
`\r\n` endings are handled, and a file with no trailing newline is fine.

### 2.3 Symbol table

A fixed array of 4096 entries with an overflow check. Each entry holds the
name, the value, the line it was defined on, an `is_set` flag and a `used`
flag.

A duplicate definition is an error and the **first** definition is kept, so
later references resolve to something sensible and the error count is not
inflated by knock-on failures.

An unused label is a **warning**, not an error. It is legal but suspicious,
usually a misspelling somewhere else. `test01` relies on this: it has an
unused label and must still assemble.

### 2.4 Branch offsets

```
offset = target_label_address - (address_of_this_instruction + 1)
```

The `+ 1` is there because the PC has already advanced past the instruction
by the time the branch takes effect.

Only `call`, `brz`, `brlz` and `br` are declared `OPD_OFFSET` in the
instruction table, so only those four turn a label into a displacement.
Every other instruction uses the label's value directly, which is why
`ldc var1` loads the *address* of `var1` and `ldnl` is then used to read
through it.

A **numeric** operand on a branch is used as a raw displacement, so `br 7`
means offset 7 and the assembler does not check where it lands. That is the
assembly programmer's responsibility.

Verified against `test01`:

| Source    | Address | Target | Offset | Word       |
|-----------|---------|--------|--------|------------|
| `br loop` | 3       | 3      | -1     | `FFFFFF11` |
| `br next` | 4       | 5      | 0      | `00000011` |

### 2.5 The two pseudo-instructions

`data value` emits one word holding the **full 32-bit value**, not an
encoded instruction, so the operand is not shifted and the 24-bit range
check does not apply. The operand is mandatory. A label operand is allowed
and contributes the label's value.

`SET value` gives the label on its line the operand value instead of the PC,
emits no word and does not advance the PC. It is processed in **pass 1**,
because `test03` uses `adc val2` on a line *above* `val2: SET 66` and the
value must be in the table before pass 2 resolves that reference.

A consequence, documented in `asm.c`: a `SET` whose operand is itself a
label requires that label to be defined **above** the `SET` line, since pass
1 fills the table top to bottom. A numeric operand has no such restriction.
`SET` with no label on the line, and `SET` with no operand, are both errors.

Because a `SET` label is not an address, it is excluded from the search that
prints symbolic branch targets, and branching to one is meaningless. The
listing shows `SET` labels with their values in a trailing symbol table
section instead of inline, since they occupy no memory address.

### 2.6 Output

**Object file.** Opened `"wb"`. Four bytes per word, written **explicitly
little-endian** (byte 0 is the low byte) rather than by dumping the
in-memory representation, so the file is byte-identical on every machine and
`emu.c` can read it back the same way everywhere.

**Listing, advanced format (default).** Address and word as eight uppercase
hex digits. A label line carries an address and no data word, printed before
the instruction at that address. For a branch, the target label at
`addr + 1 + offset` is printed if one exists, otherwise the raw offset.

```
00000000 label:
00000000 00000000 ldc 0x0
00000001 FFFFFB00 ldc -5
00000003 loop:
00000003 FFFFFF11 br loop
00000004 00000011 br next
```

**Listing, memory-dump format (`-dump`).** The guaranteed-minimum format,
four words per line:

```
00000000 00000000 FFFFFB00 00000500 FFFFFF11
00000004 00000011 00000300 00000700 00000000
```

**Diagnostics.** To standard error as `file:line: error: message` and
`file:line: warning: message`.

Neither output file is written when any error occurred. The specification
permits producing the listing anyway; this implementation deliberately does
not, so a stale or partial output can never be mistaken for a successful
assembly. The exit status is 0 on success and non-zero on any error.

## 3. Emulator

### 3.1 Arithmetic without undefined behaviour

C89 has no `<stdint.h>`, and signed overflow is undefined, so all arithmetic
is done in `unsigned long` masked to 32 bits and converted to signed only
when a comparison or a division needs it.

```c
static long to_signed(unsigned long raw);   /* 32-bit pattern -> value */
static unsigned long to_raw(long value);    /* value -> 32-bit pattern */
```

`to_signed` handles `0x80000000` as a special case and returns
`-2147483647L - 1L`, which is correct whether `long` is 32 or 64 bits wide.
Writing the constant that way avoids a literal that would not fit in a
32-bit `long`.

`add`, `sub` and `mul` are computed in unsigned arithmetic and masked, so
they wrap around modulo 2^32 with no undefined behaviour at any input.

### 3.2 Decisions the specification left open

| Case                     | Decision                                      |
|--------------------------|-----------------------------------------------|
| Initial SP               | `MEM_SIZE - 1`, the highest valid word address, so a program that never calls `adj` can still use `ldl 0`. A program may still set SP itself with `a2sp`. |
| `shl` / `shr` count < 0 or >= 32 | Runtime error. C leaves such shifts undefined, and masking the count to five bits would hide a program bug behind a plausible-looking result. |
| `shr`                    | Arithmetic, sign-propagating. The sign fill is computed explicitly rather than relying on implementation-defined signed right shift. |
| `div` rounding           | Truncation toward zero, matching C. So `-42 / 2` is `-21` and `7 / -2` is `-3`. |
| `INT32_MIN / -1`         | Yields `INT32_MIN` (two's complement wraparound). Defined behaviour, not an error, and it cannot crash. |
| `div` by zero            | Runtime error, as the specification requires. |
| `stnl`                   | Implemented exactly as the specification's table states: `mem[A + offset] := B`, leaving both A and B unchanged. It does not pop. |
| Step limit               | 10,000,000 instructions, which catches a program that loops forever. |

### 3.3 Loading

`load_object` reads the file in four-byte groups and reassembles each word
little-endian, matching what `asm.c` wrote. It rejects a file whose length
is not a multiple of four and one that would not fit in memory, and it
checks `ferror` after the loop.

### 3.4 The execution cycle

```
check the step limit
check that PC is in range
word = memory[PC]
PC = PC + 1                 /* the PC advances before execution */
decode the opcode and the 24-bit operand
look the opcode up in the instruction table
execute
```

Incrementing the PC before executing is what makes a branch target
`PC_after_increment + offset`, which is why the assembler's offset formula
has its `+ 1`.

Every memory access goes through `memory_read` or `memory_write`, which
bounds-check the address and raise a runtime error with the offending
address rather than reading or writing out of the array.

Runtime errors print a message naming the failing PC and step, and the
emulator exits non-zero. On `HALT` it prints the final A, B, PC, SP and the
instruction count.

## 4. Shared instruction table

Both programs are driven by one table of `{ mnemonic, opcode, operand kind }`.
The assembler uses it to validate operands and encode words; the emulator
uses it to decode and to print traces and the `-isa` listing. No instruction
is special-cased in the parser or the fetch loop, which is why adding `mul`
and `div` meant adding two rows rather than editing any logic.

## 5. Writing IITPSx assembly

Two idioms recur throughout the test programs and are worth stating plainly,
because the register discipline is easy to get wrong.

**Read a variable.** `ldc var` loads the *address*; `ldnl 0` then reads
through it.

```
        ldc sum
        ldnl 0          ; A = the value of sum
```

**Write a variable.** `stnl` stores **B** into `mem[A + offset]`, so the
value must be pushed first and the address second.

```
        ldc 0           ; A = 0, the value to store
        ldc flag        ; B = 0, A = address of flag
        stnl 0          ; mem[flag] = 0
```

**Array element.** Compute `arr + index` in A, then read or write through it.

```
        ldc k
        ldnl 0          ; A = k
        adc arr         ; A = arr + k     (adc uses the label value directly)
        ldnl 0          ; A = arr[k]
```

**Compare.** `sub` computes `A := B - A`, so push the left operand first.
`brlz` then branches when the left was smaller, and `brz` when they were
equal.

```
        ldc k
        ldnl 0          ; A = k
        ldc n
        ldnl 0          ; B = k, A = n
        sub             ; A = k - n
        brlz body       ; taken while k < n
```


---
<!-- Source: docs/INSTRUCTION_SET.md -->
# IITPSx instruction set

Registers are 32 bits. A and B form a two-deep internal stack, PC counts
words, SP counts words. Instruction encoding: bits 7..0 opcode, bits 31..8
signed 24-bit operand.

| Mnemonic | Opcode | Operand | Kind   | Semantics                           |
|----------|--------|---------|--------|-------------------------------------|
| `data`   | n/a    | value   | pseudo | Reserve one word holding the value  |
| `ldc`    | 0      | value   | value  | `B := A; A := value`                |
| `adc`    | 1      | value   | value  | `A := A + value`                    |
| `ldl`    | 2      | offset  | value  | `B := A; A := mem[SP + offset]`     |
| `stl`    | 3      | offset  | value  | `mem[SP + offset] := A; A := B`     |
| `ldnl`   | 4      | offset  | value  | `A := mem[A + offset]`              |
| `stnl`   | 5      | offset  | value  | `mem[A + offset] := B`              |
| `add`    | 6      | none    | none   | `A := B + A`                        |
| `sub`    | 7      | none    | none   | `A := B - A`                        |
| `shl`    | 8      | none    | none   | `A := B << A`                       |
| `shr`    | 9      | none    | none   | `A := B >> A` (arithmetic)          |
| `adj`    | 10     | value   | value  | `SP := SP + value`                  |
| `a2sp`   | 11     | none    | none   | `SP := A; A := B`                   |
| `sp2a`   | 12     | none    | none   | `B := A; A := SP`                   |
| `call`   | 13     | offset  | branch | `B := A; A := PC; PC := PC + offset`|
| `return` | 14     | none    | none   | `PC := A; A := B`                   |
| `brz`    | 15     | offset  | branch | `if A == 0: PC := PC + offset`      |
| `brlz`   | 16     | offset  | branch | `if A < 0: PC := PC + offset`       |
| `br`     | 17     | offset  | branch | `PC := PC + offset`                 |
| `HALT`   | 18     | none    | none   | Stop the emulator                   |
| `mul`    | 19     | none    | none   | `A := B * A`                        |
| `div`    | 20     | none    | none   | `A := B / A`, signed; zero divisor is a runtime error |
| `SET`    | n/a    | value   | pseudo | The label on this line takes the operand value instead of the PC |

## Notes

- Mnemonics match case-insensitively. Label names are case-sensitive.
- `data` and `SET` are pseudo-instructions. `data` emits one word holding
  the full 32-bit value. `SET` emits nothing and does not advance the PC.
- Only the four branch instructions turn a label operand into a PC-relative
  displacement, computed as `target - (instruction_address + 1)`. Every
  other instruction uses the label's value directly.
- A numeric operand on a branch is a raw displacement, so `br 7` means
  offset 7.
- The operand field holds -8388608 .. 8388607. Anything outside that range
  is an assembler error.
- The PC advances past the instruction word before the instruction's actions
  take effect, which is why the offset formula includes the `+ 1`.

## Source syntax

```
; a comment
                ; a comment on an indented line
label1:         ; a label on its own
        ldc 5   ; an instruction
label2: ldc 5   ; a label and an instruction
label3:ldc label3   ; no space needed between the label and the mnemonic
        ldc 0x1F    ; hexadecimal
        ldc 017     ; octal
        ldc -5      ; signed decimal
        ldc 5;comment with no space before the semicolon
```

One statement per line. `;` starts a comment that runs to the end of the
line. Leading spaces and tabs are ignored. Blank lines and comment-only
lines are ignored. At most one label per line. A valid label is a letter
followed by letters and digits; underscores are not accepted.


---
<!-- Source: web/README.md -->
# IITPSx bench

A web front end for the CS2102 mini-project: a two-pass assembler and an
emulator for the IITPSx 32-bit stack processor, both written in ISO C89.

The browser does no assembling or emulating. It posts your source to a small
Express backend, which runs the compiled `bin/asm` and `bin/emu` and parses
their real output. **`src/asm.c` and `src/emu.c` are never modified or
recompiled by this app.**

```
iitpsx/
├── src/asm.c, src/emu.c     the marked deliverables, untouched
├── bin/asm, bin/emu         built by `make`
├── tests/test01-15.asm      loaded by the Examples menu
└── web/                     this app
    ├── package.json         the root `npm run dev`
    ├── server/              Express
    └── client/              React, built with Vite
```

---

## Setup on WSL or Ubuntu

Run these from the project root (the directory holding the `Makefile`).

**1. Check you have the tools.**

```bash
gcc --version      # any gcc will do
node --version     # must be 18 or newer
npm --version
```

If Node is missing or older than 18:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Build the C tools.** This is required; the web app only drives them.

```bash
make
ls -l bin/asm bin/emu     # both must exist and be executable
```

**3. Install the web dependencies.**

```bash
cd web
npm run install:all
```

That installs the root, server and client packages in one go. It takes a
minute or two the first time.

**4. Start everything with one command.**

```bash
npm run dev
```

You should see both processes start:

```
[api]   IITPSx server listening on http://localhost:4000
[api]   project root : /home/you/iitpsx
[api]   database     : MONGODB_URI is not set, so saving programs is disabled
[web]   VITE v5.4.0  ready in 420 ms
[web]   ➜  Local:   http://localhost:5173/
```

**5. Open the app.**

<http://localhost:5173>

Stop both with `Ctrl+C`.

---

## MongoDB is optional

The app runs completely without it. Saving is the only feature that needs a
database, and if there is none the Save button is disabled with a note
explaining why. Nothing else changes and nothing crashes.

To enable saving:

```bash
sudo apt-get install -y mongodb
sudo systemctl start mongodb        # or: mongod --dbpath ~/mongo-data

cd web/server
cp .env.example .env
# then uncomment this line in .env:
#   MONGODB_URI=mongodb://127.0.0.1:27017/iitpsx
```

Restart `npm run dev`. The masthead now reads `db online` and the status line
says `connected, saving enabled`.

---

## If something does not work

| Symptom | Cause and fix |
|---|---|
| `bin/asm not found or not executable` on startup | Run `make` in the project root. |
| `cannot reach the backend` in the browser | The API did not start. Look at the `[api]` lines in the terminal. |
| Port 4000 already in use | `PORT=4001 npm run dev`, then set `VITE_API_BASE=http://localhost:4001` in `client/.env`. |
| The app is not at the project root | Set the path explicitly: `IITPSX_ROOT=/path/to/iitpsx npm run dev`. |
| Examples menu is empty | The backend could not read `tests/`. Check `IITPSX_ROOT`. |

---

## Running the tests

The backend has a test suite that uses **no npm dependencies**, so it works
even before `npm install`. It runs the real binaries against all fifteen
programs in `tests/` and asserts the parsers against output captured from
those binaries.

```bash
cd web/server
node --test
```

Expected: `# pass 41`, `# fail 0`.

---

## What the UI does

**Left pane.** The editor, with line numbers, syntax highlighting for
mnemonics, labels, numbers and comments, and assembler diagnostics drawn on
the exact line that caused them with the message inline to the right. Errors
are red, warnings yellow. The list underneath is clickable: it jumps to and
selects the offending line.

**Right pane, five tabs.**

- **Listing** — the advanced listing, with label lines and the symbol table,
  exactly as `bin/asm` produces it. A toggle switches to the plain memory-dump
  format, which re-assembles with `-dump`.
- **Registers** — A, B, PC and SP in hex and signed decimal, with a 32-bit
  ruler under each. While stepping, the registers that changed on that step
  are flagged in amber.
- **Memory** — address, hex word and signed decimal. Switch between the
  before and after snapshots, and highlight any label to light up the words
  it covers. Picking `arr` in the bubble-sort test highlights exactly the
  eight array elements.
- **Trace** — every executed instruction with the register state before it
  ran. Click any row to step to it.
- **Help** — all 21 instructions with opcodes and semantics, plus the notes
  that matter (branch offset formula, which instructions use offsets, how
  `data` and `SET` differ).

**Toolbar.** Assemble, Run, Step through, Examples (the 15 tests, each
labelled with what it should do), Save, Load, and downloads for the `.o` and
`.lst` files.

**Step through** replays the emulator's own trace one instruction at a time
with Reset, Prev, Next and a scrub slider. It does not re-simulate anything:
every value shown came from `bin/emu`.

`Ctrl+Enter` assembles and runs from anywhere in the editor.

---

## Notes on the backend

- Every tool invocation uses `child_process.execFile` with an **argument
  array**. No shell is ever involved, so nothing in your source can be
  interpreted as a command. There is a test for this.
- Each request gets its own `mkdtemp` directory, removed in a `finally`
  block. A sweeper clears anything a client abandoned after five minutes.
- Sources over 100 KB are rejected before any work starts. Tools are killed
  after 5 seconds and output is capped.
- Errors return a plain message. A stack trace is never sent to the browser.
- The parsers in `server/src/lib` were written against output captured from
  the compiled binaries, not from the specification. The captures are in
  `server/test/fixtures.js` and are asserted in `server/test/parsers.test.js`.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Project root and whether the database is up |
| `POST /api/assemble` | `{ source, dumpFormat }` |
| `POST /api/run` | `{ objectFileId, trace, dumpBefore, dumpAfter }` |
| `POST /api/run-source` | assemble and run in one call |
| `GET /api/examples` | the 15 test programs with their header comments |
| `GET /api/download/:id/object` | the `.o` file |
| `GET /api/download/:id/listing` | the `.lst` file |
| `GET POST DELETE /api/programs` | saved programs, needs MongoDB |


---
<!-- Source: web/DEMO.md -->
# Demo script

Five steps, about four minutes. Everything below has been run and produces
the stated result.

**Before you start**

```bash
cd ~/iitpsx && make && cd web && npm run dev
```

Open <http://localhost:5173>. Have the **Help** tab ready in case you are
asked about an instruction.

---

## 1. mul and div — the two required extensions

**Do:** Examples -> `test04`. Press **Run**.

**Say:** these are the two instructions the assignment asked me to add,
opcodes 19 and 20. The program computes 6 times 7, then divides by 2.

**Point at:**

- Status bar, green: `Assembled 6 words, 0 warnings | halted after 6 instructions, A = 21`
- Registers tab: **A = 00000015 (21)**, which is the value the specification
  says this program must leave in A.
- Listing tab: `mul` encodes to `00000013` and `div` to `00000014` — opcode in
  the low byte, exactly as the encoding requires.

---

## 2. Bubble sort — the array really is sorted

**Do:** Examples -> `test05`. Press **Run**. Go to the **Memory** tab. In the
highlight dropdown pick **`arr`**.

**Say:** this is deliverable four, bubble sort in IITPSx assembly. The array
lives in `data` words, and the highlight is following the `arr` label from
the assembler's own symbol table.

**Point at:**

- Eight highlighted rows starting at address `00000005`.
- Click **Before**: `5 3 8 1 9 2 7 4`.
- Click **After**: `1 2 3 4 5 7 8 9`.
- 77 words assembled, halted after 1083 instructions.

---

## 3. Error handling — all ten diagnostics on the right lines

**Do:** Examples -> `test02`. Press **Assemble**.

**Say:** this is the error-handling program from the specification. The
assembler continues after each error so it reports all of them in one run,
then exits non-zero and writes neither the object file nor the listing.

**Point at:**

- Status bar, red: `10 errors; no output written`.
- Red dots in the gutter on lines 8 to 17, each with its message inline.
- Line 8: duplicate label, naming the line of the first definition.
- Line 7 is **yellow**, not red: an unused label is a warning, and a program
  with only warnings still assembles.
- Click any diagnostic in the list to jump to its line.
- The Listing tab is empty, which is the point: no output on error.

---

## 4. Division by zero — the emulator catches it

**Do:** Examples -> `test11`. Press **Run**.

**Say:** the specification requires division by zero to be reported by the
emulator. It assembles cleanly, so this is a run-time fault, not a
compile-time one.

**Point at:**

- Status bar, red: `Runtime error: division by zero at PC=2`.
- The `faulted` chip beside it, and no `halted` chip.
- The emulator exited non-zero rather than crashing or returning a wrong
  answer.

**Optional:** `test14` is the same idea for an infinite loop — the emulator
stops it at the ten-million instruction limit instead of hanging.

---

## 5. Step through — watch the stack machine work

**Do:** Examples -> `test04` again. Press **Step through**. Press **Next**
five times.

**Say:** this is replaying the emulator's own `-trace` output. Nothing is
being re-simulated in the browser; every number came from `bin/emu`.

**Point at:**

- The amber marker in the editor moving down the source as you step.
- The registers that changed on each step flagged in amber with an arrow.
- Step 3 is `mul` with **B = 6** and **A = 7** — showing that A and B are a
  two-deep stack and `mul` computes `A := B * A`.
- Step 4: A has become `0000002A`, which is 42.
- Step 6: A is `00000015`, which is 21.
- The slider scrubs the whole run; the Trace tab lists every step and
  clicking a row jumps to it.

---

## Likely questions, with short answers

**Does the web app change your submitted code?**
No. It runs the compiled `bin/asm` and `bin/emu` as separate processes and
parses their text output. `src/asm.c` and `src/emu.c` are untouched, and the
UI is not part of the marked deliverables.

**How do you know the parsers are right?**
They were written against output captured from the binaries, not from the
specification. Those captures are checked into
`web/server/test/fixtures.js`. `cd web/server && node --test` runs 41 tests,
including the full assemble-and-run pipeline for all fifteen programs.

**Is running a compiler from a web request safe?**
Every invocation uses `execFile` with an argument array, so no shell is
involved and nothing in the source can become a command. There is a test
that feeds in shell metacharacters and confirms nothing executes. Each
request gets its own temp directory which is deleted afterwards, sources over
100 KB are refused, and the tools are killed after 5 seconds.

**Why is the Save button greyed out?**
MongoDB is not running. It is only used for saving programs, so the app
disables that one feature and everything else works normally.

**Show me the listing format.**
Listing tab, then the format toggle. The advanced format prints label lines
with no data word and resolves a branch to its target label; the toggle
re-assembles with `-dump` for the plain four-words-per-line memory dump.

