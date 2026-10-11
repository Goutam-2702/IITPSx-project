; test07.asm
; Purpose : evaluate a polynomial by Horner's method, exercising mul.
; Poly    : p(x) = 2x^3 + 3x^2 + 4x + 5, evaluated at x = 2.
; Method  : acc = coef[0]; then acc = acc * x + coef[k] for k = 1 .. cnt-1.
; Expected: runs to HALT with A = 41 (0x29).
;           Hand check: 2 -> 2*2+3=7 -> 7*2+4=18 -> 18*2+5=41.

        br start

acc:    data 0
k:      data 1
x:      data 2
cnt:    data 4
coef:   data 2
        data 3
        data 4
        data 5

start:
        ldc coef        ; acc = coef[0]
        ldnl 0
        ldc acc
        stnl 0

loop:
        ldc k           ; while k - cnt < 0
        ldnl 0
        ldc cnt
        ldnl 0
        sub
        brlz body
        br done

body:
        ldc acc         ; acc = acc * x + coef[k]
        ldnl 0
        ldc x
        ldnl 0
        mul
        ldc k
        ldnl 0
        adc coef
        ldnl 0
        add
        ldc acc
        stnl 0

        ldc k           ; k = k + 1
        ldnl 0
        adc 1
        ldc k
        stnl 0
        br loop

done:
        ldc acc
        ldnl 0
        HALT
