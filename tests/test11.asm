; test11.asm
; Purpose : division by zero must be reported by the emulator, not ignored.
; Expected: assembles cleanly, then the emulator stops with a
;           "division by zero" runtime error and a non-zero exit status.
;           The HALT below is never reached.

        ldc 10          ; B becomes 10 after the next ldc
        ldc 0           ; A = 0, the divisor
        div             ; must raise a runtime error
        HALT
