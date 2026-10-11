; test05.asm
; Purpose : bubble sort (deliverable 4). Sorts the array at 'arr' ascending,
;           in place, using only IITPSx instructions.
; Method  : classic bubble sort.
;             for i = n-1 down to 1
;               for j = 0 to i-1
;                 if arr[j] > arr[j+1] then swap
;           Variables i, j and temp live in 'data' words. A variable is read
;           with "ldc var / ldnl 0" and written with "ldc value / ldc var /
;           stnl 0", because stnl stores B into mem[A+offset].
; Input   : arr = 5 3 8 1 9 2 7 4   (n = 8)
; Expected: after HALT the eight words at 'arr' read 1 2 3 4 5 7 8 9.

        br start

i:      data 0          ; outer loop counter
j:      data 0          ; inner loop counter
temp:   data 0          ; swap scratch
n:      data 8          ; number of elements
arr:    data 5          ; the array itself
        data 3
        data 8
        data 1
        data 9
        data 2
        data 7
        data 4

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
        ldc j           ; A = arr[j]
        ldnl 0
        adc arr
        ldnl 0
        ldc j           ; B = arr[j], A = arr[j+1]
        ldnl 0
        adc arr
        ldnl 1
        sub             ; A = arr[j] - arr[j+1]
        brz noswap      ; equal, nothing to do
        brlz noswap     ; already in order

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
        HALT
