; test15.asm
; Purpose : procedure call and return, plus stack-frame locals.
;           Exercises call, return, adj, ldl and stl, which the other
;           tests do not reach.
; Method  : factorial(n) computed iteratively inside a called procedure.
;           'call' leaves the return address in A, so the procedure saves it
;           in a one-word stack frame (adj -1 / stl 0) and restores it with
;           ldl 0 / adj 1 before returning.
; Input   : n = 5
; Expected: runs to HALT with A = 120 (0x78), the value left in 'res'.

        br start

n:      data 5
res:    data 1

start:
        call fact
        ldc res
        ldnl 0
        HALT

fact:
        adj -1          ; allocate a one-word frame
        stl 0           ; save the return address held in A

floop:
        ldc n           ; while n != 0
        ldnl 0
        brz fdone

        ldc res         ; res = res * n
        ldnl 0
        ldc n
        ldnl 0
        mul
        ldc res
        stnl 0

        ldc n           ; n = n - 1
        ldnl 0
        adc -1
        ldc n
        stnl 0
        br floop

fdone:
        ldl 0           ; recover the return address
        adj 1           ; release the frame
        return
