; test06.asm
; Purpose : add n numbers held in an array.
; Method  : accumulate sum = sum + arr[k] for k = 0 .. n-1.
; Input   : arr = 10 20 30 40 50   (n = 5)
; Expected: runs to HALT with A = 150 (0x96); 'sum' in memory also reads 150.

        br start

sum:    data 0
k:      data 0
n:      data 5
arr:    data 10
        data 20
        data 30
        data 40
        data 50

start:
loop:
        ldc k           ; while k - n < 0
        ldnl 0
        ldc n
        ldnl 0
        sub
        brlz body
        br done

body:
        ldc sum         ; sum = sum + arr[k]
        ldnl 0
        ldc k
        ldnl 0
        adc arr
        ldnl 0
        add
        ldc sum
        stnl 0

        ldc k           ; k = k + 1
        ldnl 0
        adc 1
        ldc k
        stnl 0
        br loop

done:
        ldc sum
        ldnl 0
        HALT
