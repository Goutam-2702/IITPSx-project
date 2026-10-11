/*
 * emu.c - IITPSx emulator
 * Name: Goutam Kumar Ghosal
 * Roll No: 2501CS84
 * Course: CS2102
 * Declaration: I declare that this source file is my own work.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MEM_SIZE        (1L << 20)
#define MAX_STEPS       10000000L
#define BYTES_PER_WORD  4

#define WORD_MASK       0xFFFFFFFFUL
#define OPCODE_MASK     0x000000FFUL
#define OPERAND_SHIFT   8
#define SIGN_BIT_32     0x80000000UL

#define WORD_MIN        (-2147483647L - 1L)

#define OPERAND_SIGN_24 0x00800000UL
#define OPERAND_SPAN_24 0x01000000UL

#define DUMP_PER_LINE   4

#define EXIT_OK         0
#define EXIT_FAIL       1

typedef enum {
    OPD_NONE,
    OPD_VALUE,
    OPD_OFFSET
} OperandKind;

typedef struct {
    const char  *mnemonic;
    int          opcode;
    OperandKind  kind;
    const char  *semantics;
} InstrDef;

static const InstrDef instruction_table[] = {
    { "ldc",    0,  OPD_VALUE,  "B := A; A := value"            },
    { "adc",    1,  OPD_VALUE,  "A := A + value"                },
    { "ldl",    2,  OPD_VALUE,  "B := A; A := mem[SP + offset]"  },
    { "stl",    3,  OPD_VALUE,  "mem[SP + offset] := A; A := B"  },
    { "ldnl",   4,  OPD_VALUE,  "A := mem[A + offset]"           },
    { "stnl",   5,  OPD_VALUE,  "mem[A + offset] := B"           },
    { "add",    6,  OPD_NONE,   "A := B + A"                     },
    { "sub",    7,  OPD_NONE,   "A := B - A"                     },
    { "shl",    8,  OPD_NONE,   "A := B << A"                    },
    { "shr",    9,  OPD_NONE,   "A := B >> A"                    },
    { "adj",    10, OPD_VALUE,  "SP := SP + value"               },
    { "a2sp",   11, OPD_NONE,   "SP := A; A := B"                },
    { "sp2a",   12, OPD_NONE,   "B := A; A := SP"                },
    { "call",   13, OPD_OFFSET, "B := A; A := PC; PC := PC + offset" },
    { "return", 14, OPD_NONE,   "PC := A; A := B"                },
    { "brz",    15, OPD_OFFSET, "if A == 0: PC := PC + offset"   },
    { "brlz",   16, OPD_OFFSET, "if A < 0: PC := PC + offset"    },
    { "br",     17, OPD_OFFSET, "PC := PC + offset"              },
    { "HALT",   18, OPD_NONE,   "stop the emulator"              },
    { "mul",    19, OPD_NONE,   "A := B * A"                     },
    { "div",    20, OPD_NONE,   "A := B / A (signed)"            }
};

#define INSTRUCTION_COUNT \
    ((int)(sizeof instruction_table / sizeof instruction_table[0]))

static unsigned long memory[MEM_SIZE];
static long          loaded_words = 0;

static unsigned long  reg_a = 0;
static unsigned long  reg_b = 0;
static long           reg_pc = 0;
static long           reg_sp = 0;

static long           step_count = 0;
static int            halted = 0;
static int            runtime_error = 0;

static long to_signed(unsigned long raw)
{
    unsigned long value = raw & WORD_MASK;

    if ((value & SIGN_BIT_32) == 0) {
        return (long)value;
    }
    if (value == SIGN_BIT_32) {
        return WORD_MIN;
    }
    return -(long)((~value + 1UL) & WORD_MASK);
}

static unsigned long to_raw(long value)
{
    return ((unsigned long)value) & WORD_MASK;
}

static long decode_operand(unsigned long word)
{
    unsigned long field = (word >> OPERAND_SHIFT) & 0x00FFFFFFUL;

    if ((field & OPERAND_SIGN_24) != 0) {
        return (long)field - (long)OPERAND_SPAN_24;
    }
    return (long)field;
}

static int decode_opcode(unsigned long word)
{
    return (int)(word & OPCODE_MASK);
}

static void fail_runtime(const char *message)
{
    fprintf(stderr, "runtime error at PC=%08lX (step %ld): %s\n",
            (unsigned long)(reg_pc - 1), step_count, message);
    runtime_error = 1;
}

static const InstrDef *find_opcode(int opcode)
{
    int i;

    for (i = 0; i < INSTRUCTION_COUNT; i++) {
        if (instruction_table[i].opcode == opcode) {
            return &instruction_table[i];
        }
    }
    return NULL;
}

static int memory_read(long address, unsigned long *out)
{
    if (address < 0 || address >= MEM_SIZE) {
        char message[80];
        sprintf(message, "memory read out of range at address %ld", address);
        fail_runtime(message);
        return 0;
    }
    *out = memory[address];
    return 1;
}

static int memory_write(long address, unsigned long value)
{
    if (address < 0 || address >= MEM_SIZE) {
        char message[80];
        sprintf(message, "memory write out of range at address %ld", address);
        fail_runtime(message);
        return 0;
    }
    memory[address] = value & WORD_MASK;
    return 1;
}

static int load_object(const char *path)
{
    FILE *fp;
    unsigned char bytes[BYTES_PER_WORD];
    long  index = 0;
    size_t got;

    fp = fopen(path, "rb");
    if (fp == NULL) {
        fprintf(stderr, "error: cannot open object file '%s'\n", path);
        return 0;
    }

    while ((got = fread(bytes, 1, BYTES_PER_WORD, fp)) == BYTES_PER_WORD) {
        if (index >= MEM_SIZE) {
            fprintf(stderr, "error: object file larger than memory\n");
            fclose(fp);
            return 0;
        }
        memory[index] = ((unsigned long)bytes[0])
                      | ((unsigned long)bytes[1] << 8)
                      | ((unsigned long)bytes[2] << 16)
                      | ((unsigned long)bytes[3] << 24);
        index++;
    }

    if (got != 0) {
        fprintf(stderr,
                "error: object file length is not a multiple of %d bytes\n",
                BYTES_PER_WORD);
        fclose(fp);
        return 0;
    }
    if (ferror(fp)) {
        fprintf(stderr, "error: read failed on '%s'\n", path);
        fclose(fp);
        return 0;
    }
    fclose(fp);

    loaded_words = index;
    return 1;
}

static void dump_memory(const char *caption)
{
    long i;

    printf("%s (%ld word(s))\n", caption, loaded_words);
    for (i = 0; i < loaded_words; i += DUMP_PER_LINE) {
        long j;
        printf("%08lX", (unsigned long)i);
        for (j = i; j < i + DUMP_PER_LINE && j < loaded_words; j++) {
            printf(" %08lX", memory[j] & WORD_MASK);
        }
        putchar('\n');
    }
}

static void print_isa(void)
{
    int i;

    printf("%-8s %-7s %-8s %s\n", "Mnemonic", "Opcode", "Operand",
           "Semantics");
    for (i = 0; i < INSTRUCTION_COUNT; i++) {
        const char *kind;

        switch (instruction_table[i].kind) {
        case OPD_NONE:   kind = "none";   break;
        case OPD_OFFSET: kind = "offset"; break;
        default:         kind = "value";  break;
        }
        printf("%-8s %-7d %-8s %s\n",
               instruction_table[i].mnemonic,
               instruction_table[i].opcode,
               kind,
               instruction_table[i].semantics);
    }
}

static void trace_step(long address, const InstrDef *def, long operand)
{
    printf("PC=%08lX A=%08lX B=%08lX SP=%08lX  ",
           (unsigned long)address, reg_a & WORD_MASK, reg_b & WORD_MASK,
           (unsigned long)reg_sp);
    if (def == NULL) {
        printf("<unknown opcode>\n");
        return;
    }
    if (def->kind == OPD_NONE) {
        printf("%s\n", def->mnemonic);
    } else {
        printf("%s %ld\n", def->mnemonic, operand);
    }
}

static void print_final_state(void)
{
    printf("halted after %ld instruction(s)\n", step_count);
    printf("  A  = %08lX (%ld)\n", reg_a & WORD_MASK, to_signed(reg_a));
    printf("  B  = %08lX (%ld)\n", reg_b & WORD_MASK, to_signed(reg_b));
    printf("  PC = %08lX (%ld)\n", (unsigned long)reg_pc, reg_pc);
    printf("  SP = %08lX (%ld)\n", (unsigned long)reg_sp, reg_sp);
}

static void execute(const InstrDef *def, long operand)
{
    unsigned long value;
    long          signed_a;
    long          signed_b;

    switch (def->opcode) {

    case 0:
        reg_b = reg_a;
        reg_a = to_raw(operand);
        break;

    case 1:
        reg_a = (reg_a + to_raw(operand)) & WORD_MASK;
        break;

    case 2:
        if (!memory_read(reg_sp + operand, &value)) {
            return;
        }
        reg_b = reg_a;
        reg_a = value;
        break;

    case 3:
        if (!memory_write(reg_sp + operand, reg_a)) {
            return;
        }
        reg_a = reg_b;
        break;

    case 4:
        if (!memory_read(to_signed(reg_a) + operand, &value)) {
            return;
        }
        reg_a = value;
        break;

    case 5:
        if (!memory_write(to_signed(reg_a) + operand, reg_b)) {
            return;
        }
        break;

    case 6:
        reg_a = (reg_b + reg_a) & WORD_MASK;
        break;

    case 7:
        reg_a = (reg_b - reg_a) & WORD_MASK;
        break;

    case 8:
        signed_a = to_signed(reg_a);
        if (signed_a < 0 || signed_a >= 32) {
            fail_runtime("shift count out of range for shl");
            return;
        }
        reg_a = (reg_b << (int)signed_a) & WORD_MASK;
        break;

    case 9:
        signed_a = to_signed(reg_a);
        if (signed_a < 0 || signed_a >= 32) {
            fail_runtime("shift count out of range for shr");
            return;
        }
        signed_b = to_signed(reg_b);
        if (signed_b < 0) {
            unsigned long shifted = (reg_b & WORD_MASK) >> (int)signed_a;
            unsigned long sign_fill;

            if (signed_a == 0) {
                sign_fill = 0UL;
            } else {
                sign_fill = (WORD_MASK << (32 - (int)signed_a)) & WORD_MASK;
            }
            reg_a = (shifted | sign_fill) & WORD_MASK;
        } else {
            reg_a = (reg_b & WORD_MASK) >> (int)signed_a;
        }
        break;

    case 10:
        reg_sp = reg_sp + operand;
        break;

    case 11:
        reg_sp = to_signed(reg_a);
        reg_a = reg_b;
        break;

    case 12:
        reg_b = reg_a;
        reg_a = to_raw(reg_sp);
        break;

    case 13:
        reg_b = reg_a;
        reg_a = to_raw(reg_pc);
        reg_pc = reg_pc + operand;
        break;

    case 14:
        reg_pc = to_signed(reg_a);
        reg_a = reg_b;
        break;

    case 15:
        if ((reg_a & WORD_MASK) == 0) {
            reg_pc = reg_pc + operand;
        }
        break;

    case 16:
        if (to_signed(reg_a) < 0) {
            reg_pc = reg_pc + operand;
        }
        break;

    case 17:
        reg_pc = reg_pc + operand;
        break;

    case 18:
        halted = 1;
        break;

    case 19:
        reg_a = (reg_b * reg_a) & WORD_MASK;
        break;

    case 20:
        signed_a = to_signed(reg_a);
        if (signed_a == 0) {
            fail_runtime("division by zero");
            return;
        }
        signed_b = to_signed(reg_b);
        if (signed_b == WORD_MIN && signed_a == -1L) {
            reg_a = to_raw(WORD_MIN);
        } else {
            reg_a = to_raw(signed_b / signed_a);
        }
        break;

    default:
        fail_runtime("unknown opcode");
        break;
    }
}

static void run(int trace)
{
    while (!halted && !runtime_error) {
        unsigned long   word;
        long            address;
        int             opcode;
        long            operand;
        const InstrDef *def;

        if (step_count >= MAX_STEPS) {
            fprintf(stderr,
                    "runtime error: instruction limit of %ld exceeded, "
                    "the program is probably looping forever\n", MAX_STEPS);
            runtime_error = 1;
            return;
        }
        if (reg_pc < 0 || reg_pc >= MEM_SIZE) {
            fprintf(stderr,
                    "runtime error: PC out of range (%ld) at step %ld\n",
                    reg_pc, step_count);
            runtime_error = 1;
            return;
        }

        address = reg_pc;
        word    = memory[address];
        reg_pc  = reg_pc + 1;
        step_count++;

        opcode  = decode_opcode(word);
        operand = decode_operand(word);
        def     = find_opcode(opcode);

        if (trace) {
            trace_step(address, def, operand);
        }
        if (def == NULL) {
            char message[64];
            sprintf(message, "unknown opcode %d", opcode);
            fail_runtime(message);
            return;
        }
        execute(def, operand);
    }
}

static void print_usage(void)
{
    fputs("usage: emu [-trace] [-dump] [-isa] [-before] [-after] <prog.o>\n",
          stderr);
}

int main(int argc, char **argv)
{
    const char *object_path = NULL;
    int trace       = 0;
    int dump_before = 0;
    int dump_after  = 0;
    int show_isa    = 0;
    int arg;

    for (arg = 1; arg < argc; arg++) {
        if (strcmp(argv[arg], "-trace") == 0) {
            trace = 1;
        } else if (strcmp(argv[arg], "-dump") == 0) {
            dump_after = 1;
        } else if (strcmp(argv[arg], "-before") == 0) {
            dump_before = 1;
        } else if (strcmp(argv[arg], "-after") == 0) {
            dump_after = 1;
        } else if (strcmp(argv[arg], "-isa") == 0) {
            show_isa = 1;
        } else if (argv[arg][0] == '-' && argv[arg][1] != '\0') {
            fprintf(stderr, "error: unknown option '%s'\n", argv[arg]);
            print_usage();
            return EXIT_FAIL;
        } else if (object_path == NULL) {
            object_path = argv[arg];
        } else {
            fprintf(stderr, "error: more than one object file given\n");
            print_usage();
            return EXIT_FAIL;
        }
    }

    if (show_isa) {
        print_isa();
        if (object_path == NULL) {
            return EXIT_OK;
        }
        putchar('\n');
    }

    if (object_path == NULL) {
        print_usage();
        return EXIT_FAIL;
    }

    if (!load_object(object_path)) {
        return EXIT_FAIL;
    }
    printf("loaded %ld word(s) from %s\n", loaded_words, object_path);

    if (dump_before) {
        dump_memory("memory before execution");
    }

    reg_sp = MEM_SIZE - 1;
    reg_pc = 0;

    run(trace);

    if (dump_after) {
        dump_memory("memory after execution");
    }

    if (runtime_error) {
        return EXIT_FAIL;
    }
    print_final_state();
    return EXIT_OK;
}
