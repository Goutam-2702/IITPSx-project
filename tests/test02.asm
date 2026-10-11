; test02.asm
; Purpose : the error-handling program from the assignment specification,
;           extended with an out-of-range operand.
; Expected: assembly FAILS. Every line below must produce exactly one
;           diagnostic, and no object or listing file may be written.

label:
label:                  ; duplicate label definition
        br nonesuch     ; no such label
        ldc 08ge        ; not a number (08 is also a bad octal literal)
        ldc             ; missing operand
        add 5           ; unexpected operand
        ldc 5, 6        ; extra text on end of line
0def:                   ; bogus label name
        fibble          ; bogus mnemonic
        0def            ; bogus mnemonic
        ldc 99999999    ; operand out of 24-bit range
