; test09.asm
; Purpose : median of an array. Sorts in place, then selects the middle
;           element, so it exercises sorting plus div.
; Input   : arr = 7 2 9 1 5   (n = 5)
; Expected: after HALT arr reads 1 2 5 7 9 and A = 5 (the median).
;           The middle index is computed as n / 2 = 2 using div.

        br start

i:      data 0
j:      data 0
temp:   data 0
n:      data 5
arr:    data 7
        data 2
        data 9
        data 1
        data 5

start:
        ldc n           ; i = n - 1
        ldnl 0
        adc -1
        ldc i
        stnl 0

outer:
        ldc i           ; while i - 1 >= 0
        ldnl 0
        ldc 1
        sub
        brlz odone

        ldc 0           ; j = 0
        ldc j
        stnl 0

inner:
        ldc j           ; while j - i < 0
        ldnl 0
        ldc i
        ldnl 0
        sub
        brlz ibody
        br idone

ibody:
        ldc j           ; compare arr[j] with arr[j+1]
        ldnl 0
        adc arr
        ldnl 0
        ldc j
        ldnl 0
        adc arr
        ldnl 1
        sub
        brz noswap
        brlz noswap

        ldc j           ; temp = arr[j]
        ldnl 0
        adc arr
        ldnl 0
        ldc temp
        stnl 0

        ldc j           ; arr[j] = arr[j+1]
        ldnl 0
        adc arr
        ldnl 1
        ldc j
        ldnl 0
        adc arr
        stnl 0

        ldc temp        ; arr[j+1] = temp
        ldnl 0
        ldc j
        ldnl 0
        adc arr
        stnl 1

noswap:
        ldc j           ; j = j + 1
        ldnl 0
        adc 1
        ldc j
        stnl 0
        br inner

idone:
        ldc i           ; i = i - 1
        ldnl 0
        adc -1
        ldc i
        stnl 0
        br outer

odone:
        ldc n           ; median = arr[n / 2]
        ldnl 0
        ldc 2
        div
        adc arr
        ldnl 0
        HALT
