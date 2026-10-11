; test16.asm
; Purpose : find the maximum value in an array
; Input   : arr = 12, -7, 34, 18, 9
; Expected: runs to HALT with A = 34

br start
maxVal: data 0
idx:    data 0
n:      data 5
arr:    data 12
        data -7
        data 34
        data 18
        data 9

start:
        ldc arr
        ldnl 0
        ldc maxVal
        stnl 0

        ldc 1
        ldc idx
        stnl 0

loop:
        ; if (idx == n) goto done
        ldc idx
        ldnl 0
        ldc n
        ldnl 0
        sub
        brz done

        ; test: arr[idx] - maxVal
        ldc arr
        ldc idx
        ldnl 0
        add
        ldnl 0
        ldc maxVal
        ldnl 0
        sub
        brlz next

        ; maxVal = arr[idx]
        ldc arr
        ldc idx
        ldnl 0
        add
        ldnl 0
        ldc maxVal
        stnl 0

next:
        ; idx++
        ldc idx
        ldnl 0
        adc 1
        ldc idx
        stnl 0
        br loop

done:
        ldc maxVal
        ldnl 0
        HALT
