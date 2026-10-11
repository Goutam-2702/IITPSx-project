; test12.asm
; Purpose : valid lexical edge cases that must all assemble.
;           - a label and a statement with no space between them
;           - a label on a line of its own
;           - a comment immediately after the operand with no space
;           - hex and octal literals, signed operands
;           - the extreme operand values +8388607 and -8388608
; Expected: assembles with no errors and no warnings.
;           0x1F + 017 = 31 + 15 = 46, then 8388607 + (-8388608) = -1.
;           The final 'ldc 5' pushes 5, so at HALT A = 5 and B = -1
;           (FFFFFFFF), which is what proves the boundary operands encoded
;           and executed correctly.

label3:ldc label3       ; no space between the label and the mnemonic
onlylabel:              ; a label on a line of its own
        ldc onlylabel   ; keeps the label above referenced
        ldc 0x1F        ; hexadecimal literal, 31
        ldc 017         ; octal literal, 15
        add             ; A = 46
        ldc 8388607     ; largest signed 24-bit operand
        ldc -8388608    ; smallest signed 24-bit operand
        add             ; A = -1
        ldc 5;comment with no space before the semicolon
        HALT
