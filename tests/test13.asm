; test13.asm
; Purpose : lexical and range edge cases that must all be REJECTED.
; Expected: assembly FAILS with one diagnostic per bad line below and no
;           object or listing file written.

        ldc a:b         ; a colon in the middle of a statement
a: b:   ldc 1           ; two labels on one line
        ldc 8388608     ; one past the largest 24-bit operand
        ldc -8388609    ; one past the smallest 24-bit operand
        ldc 0x          ; a hex prefix with no digits
        ldc 5x          ; trailing junk after the number
        ldc 08          ; 8 is not a valid octal digit
        SET 10          ; SET with no label on the line
