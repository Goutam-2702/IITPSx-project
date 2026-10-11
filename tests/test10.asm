; test10.asm
; Purpose : integer standard deviation, exercising mul, div and a loop.
; Method  : 1) sum  = sum of x
;           2) mean = sum / n
;           3) ssq  = sum of (x - mean)^2
;           4) var  = ssq / n
;           5) sd   = largest r such that r*r <= var (integer square root)
; Input   : arr = 2 4 4 4 5 5 7 9   (n = 8)
; Expected: sum = 40, mean = 5, ssq = 32, var = 4, so A = 2 at HALT.

        br start

sum:    data 0
ssq:    data 0
mean:   data 0
var:    data 0
diff:   data 0
sq:     data 0
r:      data 0
k:      data 0
n:      data 8
arr:    data 2
        data 4
        data 4
        data 4
        data 5
        data 5
        data 7
        data 9

start:
sloop:
        ldc k           ; phase 1: sum = sum + arr[k]
        ldnl 0
        ldc n
        ldnl 0
        sub
        brlz sbody
        br sdone

sbody:
        ldc sum
        ldnl 0
        ldc k
        ldnl 0
        adc arr
        ldnl 0
        add
        ldc sum
        stnl 0

        ldc k
        ldnl 0
        adc 1
        ldc k
        stnl 0
        br sloop

sdone:
        ldc sum         ; phase 2: mean = sum / n
        ldnl 0
        ldc n
        ldnl 0
        div
        ldc mean
        stnl 0

        ldc 0           ; reset the index for phase 3
        ldc k
        stnl 0

vloop:
        ldc k           ; phase 3: ssq = ssq + (arr[k] - mean)^2
        ldnl 0
        ldc n
        ldnl 0
        sub
        brlz vbody
        br vdone

vbody:
        ldc k           ; diff = arr[k] - mean
        ldnl 0
        adc arr
        ldnl 0
        ldc mean
        ldnl 0
        sub
        ldc diff
        stnl 0

        ldc diff        ; sq = diff * diff
        ldnl 0
        ldc diff
        ldnl 0
        mul
        ldc sq
        stnl 0

        ldc ssq         ; ssq = ssq + sq
        ldnl 0
        ldc sq
        ldnl 0
        add
        ldc ssq
        stnl 0

        ldc k
        ldnl 0
        adc 1
        ldc k
        stnl 0
        br vloop

vdone:
        ldc ssq         ; phase 4: var = ssq / n
        ldnl 0
        ldc n
        ldnl 0
        div
        ldc var
        stnl 0

qloop:
        ldc r           ; phase 5: sq = (r + 1)^2
        ldnl 0
        adc 1
        ldc r
        ldnl 0
        adc 1
        mul
        ldc sq
        stnl 0

        ldc var         ; stop when var - (r+1)^2 < 0
        ldnl 0
        ldc sq
        ldnl 0
        sub
        brlz qdone

        ldc r           ; r = r + 1
        ldnl 0
        adc 1
        ldc r
        stnl 0
        br qloop

qdone:
        ldc r
        ldnl 0
        HALT
