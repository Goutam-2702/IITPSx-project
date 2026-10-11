#!/bin/sh
# ==========================================================================
# run_tests.sh - assemble and run every test, producing the evidence files
# --------------------------------------------------------------------------
# Name    : Goutam Kumar Ghosal
# Roll No.: 2501CS84
#
# For each test it writes:
#   listings/testNN.lst   the assembler listing   (successful tests only)
#   logs/testNN.log       the full transcript: commands, output, exit codes
#
# Pass --sanitize to use the sanitizer builds in bin/ instead.
# ==========================================================================

set -e

ROOT=$(dirname "$0")/..
cd "$ROOT"

ASM=bin/asm
EMU=bin/emu
if [ "$1" = "--sanitize" ]; then
    ASM=bin/asm_san
    EMU=bin/emu_san
    echo "running the test suite against the sanitizer builds"
fi

mkdir -p listings logs

# --------------------------------------------------------------------------
# Test classification
#   asmfail : assembly must fail; no object or listing is produced
#   asmonly : assembles cleanly but is not executed (no HALT, or loops)
#   run     : assembles and runs to HALT successfully
#   rundump : as 'run', and the memory dump is part of the evidence
#   runfail : assembles cleanly but must stop with a runtime error
# --------------------------------------------------------------------------
classify() {
    case "$1" in
        test02|test13)                   echo asmfail ;;
        test01|test03)                   echo asmonly ;;
        test05|test09)                   echo rundump ;;
        test11|test14)                   echo runfail ;;
        *)                               echo run ;;
    esac
}

PASSED=0
FAILED=0

for SRC in tests/test*.asm; do
    NAME=$(basename "$SRC" .asm)
    KIND=$(classify "$NAME")
    LOG=logs/$NAME.log
    LST=listings/$NAME.lst
    OBJ=tests/$NAME.o
    OK=1

    {
        echo "=========================================================="
        echo " $NAME.log  -  evidence for $NAME.asm"
        echo " classification: $KIND"
        echo "=========================================================="
        echo
        echo "----- source -----"
        cat "$SRC"
        echo
        echo "----- assembler -----"
        echo "\$ $ASM $SRC $OBJ $LST"
    } > "$LOG"

    set +e
    "$ASM" "$SRC" "$OBJ" "$LST" >> "$LOG" 2>&1
    ASM_STATUS=$?
    set -e
    echo "exit status: $ASM_STATUS" >> "$LOG"

    case "$KIND" in
    asmfail)
        if [ "$ASM_STATUS" -eq 0 ]; then
            echo "RESULT: UNEXPECTED SUCCESS (this test must fail)" >> "$LOG"
            OK=0
        else
            echo "RESULT: assembly failed as required" >> "$LOG"
        fi
        ;;
    *)
        if [ "$ASM_STATUS" -ne 0 ]; then
            echo "RESULT: UNEXPECTED ASSEMBLY FAILURE" >> "$LOG"
            OK=0
        else
            {
                echo
                echo "----- listing ($LST) -----"
                cat "$LST"
            } >> "$LOG"
        fi
        ;;
    esac

    if [ "$OK" -eq 1 ] && [ "$ASM_STATUS" -eq 0 ]; then
        case "$KIND" in
        run|rundump|runfail)
            EMUFLAGS=""
            if [ "$KIND" = "rundump" ]; then
                EMUFLAGS="-after"
            fi
            {
                echo
                echo "----- emulator -----"
                echo "\$ $EMU $EMUFLAGS $OBJ"
            } >> "$LOG"
            set +e
            "$EMU" $EMUFLAGS "$OBJ" >> "$LOG" 2>&1
            EMU_STATUS=$?
            set -e
            echo "exit status: $EMU_STATUS" >> "$LOG"

            if [ "$KIND" = "runfail" ]; then
                if [ "$EMU_STATUS" -eq 0 ]; then
                    echo "RESULT: UNEXPECTED CLEAN RUN (a runtime error was required)" >> "$LOG"
                    OK=0
                else
                    echo "RESULT: runtime error reported as required" >> "$LOG"
                fi
            else
                if [ "$EMU_STATUS" -ne 0 ]; then
                    echo "RESULT: UNEXPECTED RUNTIME FAILURE" >> "$LOG"
                    OK=0
                else
                    echo "RESULT: ran to HALT successfully" >> "$LOG"
                fi
            fi
            ;;
        asmonly)
            {
                echo
                echo "----- emulator -----"
                echo "not executed: this program has no HALT or loops forever,"
                echo "so it is an assembler test only."
            } >> "$LOG"
            echo "RESULT: assembled successfully" >> "$LOG"
            ;;
        esac
    fi

    if [ "$OK" -eq 1 ]; then
        PASSED=$((PASSED + 1))
        printf '%-10s %-8s ok\n' "$NAME" "$KIND"
    else
        FAILED=$((FAILED + 1))
        printf '%-10s %-8s FAILED (see %s)\n' "$NAME" "$KIND" "$LOG"
    fi
done

echo
echo "$PASSED test(s) behaved as expected, $FAILED unexpected"
[ "$FAILED" -eq 0 ]
