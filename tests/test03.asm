; test03.asm
; Purpose : the SET pseudo-instruction.
; Expected: assembles cleanly. 'ldc val' encodes 75 (0x4B). 'adc val2' uses a
;           label that is SET on a later line, which is why SET is resolved
;           in pass 1 and its operand must already be known.
;           Neither SET line emits a word, so the program is two words long.

val:    SET 75
        ldc val
        adc val2
val2:   SET 66
