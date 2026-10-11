# ==========================================================================
# Makefile - CS2102 MiniProject 2026, IITPSx assembler and emulator
# --------------------------------------------------------------------------
# Name    : Goutam Kumar Ghosal
# Roll No.: 2501CS84
#
# Targets:
#   make            build both tools into bin/
#   make test       assemble and run every test, writing listings/ and logs/
#   make strict     rebuild with every required warning flag (must be silent)
#   make sanitize   rebuild with the address and UB sanitizers and run tests
#   make submission assemble the flat submission/ folder for upload
#   make clean      remove all build products and generated evidence
# ==========================================================================

CC      = gcc
CFLAGS  = -std=c89 -pedantic -W -Wall -Wpointer-arith -Wwrite-strings \
          -Wstrict-prototypes

SRCDIR  = src
BINDIR  = bin
TESTDIR = tests
LSTDIR  = listings
LOGDIR  = logs
SUBDIR  = submission

ASM     = $(BINDIR)/asm
EMU     = $(BINDIR)/emu

.PHONY: all test strict sanitize submission clean dirs

all: dirs $(ASM) $(EMU)

dirs:
	@mkdir -p $(BINDIR) $(LSTDIR) $(LOGDIR)

$(ASM): $(SRCDIR)/asm.c
	$(CC) $(CFLAGS) $(SRCDIR)/asm.c -o $@

$(EMU): $(SRCDIR)/emu.c
	$(CC) $(CFLAGS) $(SRCDIR)/emu.c -o $@

# Rebuild from scratch with the strict flag set. Any output is a failure.
strict: clean dirs
	$(CC) $(CFLAGS) $(SRCDIR)/asm.c -o $(ASM)
	$(CC) $(CFLAGS) $(SRCDIR)/emu.c -o $(EMU)
	@echo "strict build completed with no diagnostics"

# Development check only. The submitted code is compiled normally.
sanitize: dirs
	$(CC) $(CFLAGS) -fsanitize=address,undefined -g $(SRCDIR)/asm.c -o $(BINDIR)/asm_san
	$(CC) $(CFLAGS) -fsanitize=address,undefined -g $(SRCDIR)/emu.c -o $(BINDIR)/emu_san
	@sh scripts/run_tests.sh --sanitize

test: all
	@sh scripts/run_tests.sh

submission: test
	@mkdir -p $(SUBDIR)
	@cp $(SRCDIR)/asm.c $(SRCDIR)/emu.c claims README.md $(SUBDIR)/
	@cp scripts/Makefile.flat $(SUBDIR)/Makefile
	@cp $(TESTDIR)/*.asm $(SUBDIR)/
	@cp $(LSTDIR)/*.lst $(SUBDIR)/ 2>/dev/null || true
	@cp $(LOGDIR)/*.log $(SUBDIR)/
	@mkdir -p $(SUBDIR)/web/server/src $(SUBDIR)/web/server/test $(SUBDIR)/web/client
	@cp -r web/server/src/* $(SUBDIR)/web/server/src/
	@cp -r web/server/test/* $(SUBDIR)/web/server/test/ 2>/dev/null || true
	@cp web/server/package.json web/server/package-lock.json web/server/.env.example $(SUBDIR)/web/server/ 2>/dev/null || true
	@cp -r web/client/src web/client/dist web/client/index.html web/client/package.json web/client/package-lock.json web/client/vite.config.js $(SUBDIR)/web/client/ 2>/dev/null || true
	@cp web/package.json web/package-lock.json $(SUBDIR)/web/ 2>/dev/null || true
	@echo "submission/ is ready for upload:"
	@ls $(SUBDIR)

clean:
	rm -rf $(BINDIR) $(LSTDIR) $(LOGDIR) $(SUBDIR)
	rm -f $(TESTDIR)/*.o $(TESTDIR)/*.lst
