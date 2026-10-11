; test04.asm
; Purpose : the two IITPSx arithmetic extensions, mul and div.
; Expected: assembles and runs. 6 * 7 = 42, then 42 / 2 = 21,
;           so the final value of register A is 21 (0x15).

        ldc 6
        ldc 7
        mul             ; A = 42
        ldc 2
        div             ; A = 21
        HALT
