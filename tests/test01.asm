; test01.asm
; Purpose : the valid-but-nonsense program from the assignment specification.
; Expected: assembles with no errors; one warning for the unused label 'label'.
;           Verifies branch offsets: 'br next' gives offset 0 and
;           'br loop' on the loop line gives offset -1 (FFFFFF11).

label:                  ; an unused label
        ldc 0
        ldc -5
        ldc +5
loop:   br loop         ; an infinite loop
        br next         ; offset should be zero
next:
        ldc loop        ; load code address
        ldc var1        ; forward reference
var1:   data 0          ; a variable
