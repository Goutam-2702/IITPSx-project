; test14.asm
; Purpose : an errant program that never terminates.
; Expected: assembles cleanly, then the emulator stops with an
;           "instruction limit exceeded" runtime error rather than hanging
;           forever, and exits with a non-zero status.

spin:   br spin         ; branch to self, offset -1
