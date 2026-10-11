/*
 * asm.c - IITPSx assembler
 * Name: Goutam Kumar Ghosal
 * Roll No: 2501CS84
 * Course: CS2102
 * Declaration: I declare that this source file is my own work.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <limits.h>

#define MAX_LINE        512
#define MAX_LABEL       64
#define MAX_SYMBOLS     4096
#define MAX_CODE        65536
#define MAX_TOKEN       128

#define WORD_MASK       0xFFFFFFFFUL
#define OPERAND_MASK    0x00FFFFFFUL
#define OPCODE_MASK     0x000000FFUL
#define OPERAND_SHIFT   8

#define OPERAND_MAX     8388607L
#define OPERAND_MIN     (-8388608L)

#define OPCODE_PSEUDO_DATA  (-1)
#define OPCODE_PSEUDO_SET   (-2)

#define PASS_ONE        1
#define PASS_TWO        2

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
} InstrDef;

static const InstrDef instruction_table[] = {
    { "data",   OPCODE_PSEUDO_DATA, OPD_VALUE  },
    { "ldc",    0,                  OPD_VALUE  },
    { "adc",    1,                  OPD_VALUE  },
    { "ldl",    2,                  OPD_VALUE  },
    { "stl",    3,                  OPD_VALUE  },
    { "ldnl",   4,                  OPD_VALUE  },
    { "stnl",   5,                  OPD_VALUE  },
    { "add",    6,                  OPD_NONE   },
    { "sub",    7,                  OPD_NONE   },
    { "shl",    8,                  OPD_NONE   },
    { "shr",    9,                  OPD_NONE   },
    { "adj",    10,                 OPD_VALUE  },
    { "a2sp",   11,                 OPD_NONE   },
    { "sp2a",   12,                 OPD_NONE   },
    { "call",   13,                 OPD_OFFSET },
    { "return", 14,                 OPD_NONE   },
    { "brz",    15,                 OPD_OFFSET },
    { "brlz",   16,                 OPD_OFFSET },
    { "br",     17,                 OPD_OFFSET },
    { "HALT",   18,                 OPD_NONE   },
    { "mul",    19,                 OPD_NONE   },
    { "div",    20,                 OPD_NONE   },
    { "SET",    OPCODE_PSEUDO_SET,  OPD_VALUE  }
};

#define INSTRUCTION_COUNT \
    ((int)(sizeof instruction_table / sizeof instruction_table[0]))

typedef struct {
    char  name[MAX_LABEL + 1];
    long  value;
    int   defined_line;
    int   is_set;
    int   used;
} Symbol;

static Symbol symbol_table[MAX_SYMBOLS];
static int    symbol_count = 0;

typedef struct {
    unsigned long word;
    int           instr_index;
    long          operand;
    int           has_operand;
} CodeWord;

static CodeWord code[MAX_CODE];
static long     code_length = 0;

static const char *source_name = "";
static long  error_count   = 0;
static long  warning_count = 0;

static void report_error(int line_no, const char *text)
{
    fprintf(stderr, "%s:%d: error: %s\n", source_name, line_no, text);
    error_count++;
}

static void report_error_1(int line_no, const char *prefix, const char *arg)
{
    fprintf(stderr, "%s:%d: error: %s '%s'\n",
            source_name, line_no, prefix, arg);
    error_count++;
}

static void report_warning(int line_no, const char *prefix, const char *arg)
{
    fprintf(stderr, "%s:%d: warning: %s '%s'\n",
            source_name, line_no, prefix, arg);
    warning_count++;
}

static int ci_compare(const char *a, const char *b)
{
    while (*a != '\0' && *b != '\0') {
        int ca = tolower((unsigned char)*a);
        int cb = tolower((unsigned char)*b);
        if (ca != cb) {
            return ca - cb;
        }
        a++;
        b++;
    }
    return (int)((unsigned char)*a) - (int)((unsigned char)*b);
}

static char *skip_space(char *p)
{
    while (*p == ' ' || *p == '\t') {
        p++;
    }
    return p;
}

static void trim_trailing(char *s)
{
    size_t len = strlen(s);
    while (len > 0 && (s[len - 1] == ' ' || s[len - 1] == '\t')) {
        len--;
    }
    s[len] = '\0';
}

static void copy_bounded(char *dst, const char *src, size_t limit)
{
    size_t i = 0;
    while (i < limit && src[i] != '\0') {
        dst[i] = src[i];
        i++;
    }
    dst[i] = '\0';
}

static int is_valid_label(const char *s)
{
    int i;

    if (s[0] == '\0' || !isalpha((unsigned char)s[0])) {
        return 0;
    }
    for (i = 1; s[i] != '\0'; i++) {
        if (!isalnum((unsigned char)s[i])) {
            return 0;
        }
    }
    return 1;
}

static int parse_number(const char *token, long *out)
{
    char *end = NULL;
    long  value;

    if (token[0] == '\0') {
        return 0;
    }
    errno = 0;
    value = strtol(token, &end, 0);
    if (end == token || *end != '\0') {
        return 0;
    }
    if (errno == ERANGE) {
        return 0;
    }
    *out = value;
    return 1;
}

static int symtab_find(const char *name)
{
    int i;

    for (i = 0; i < symbol_count; i++) {
        if (strcmp(symbol_table[i].name, name) == 0) {
            return i;
        }
    }
    return -1;
}

static int symtab_add(const char *name, long value, int line_no, int is_set)
{
    int index = symtab_find(name);

    if (index >= 0) {
        char message[MAX_LABEL + 64];
        sprintf(message, "duplicate label '%s' (first defined on line %d)",
                name, symbol_table[index].defined_line);
        report_error(line_no, message);
        return index;
    }
    if (symbol_count >= MAX_SYMBOLS) {
        report_error(line_no, "symbol table full, too many labels");
        return -1;
    }
    index = symbol_count++;
    copy_bounded(symbol_table[index].name, name, MAX_LABEL);
    symbol_table[index].value        = value;
    symbol_table[index].defined_line = line_no;
    symbol_table[index].is_set       = is_set;
    symbol_table[index].used         = 0;
    return index;
}

static int symtab_find_by_address(long address)
{
    int i;

    for (i = 0; i < symbol_count; i++) {
        if (!symbol_table[i].is_set && symbol_table[i].value == address) {
            return i;
        }
    }
    return -1;
}

static int find_instruction(const char *mnemonic)
{
    int i;

    for (i = 0; i < INSTRUCTION_COUNT; i++) {
        if (ci_compare(instruction_table[i].mnemonic, mnemonic) == 0) {
            return i;
        }
    }
    return -1;
}

static unsigned long encode(int opcode, long operand)
{
    unsigned long field = ((unsigned long)operand) & OPERAND_MASK;
    unsigned long op    = ((unsigned long)opcode)  & OPCODE_MASK;

    return ((field << OPERAND_SHIFT) | op) & WORD_MASK;
}

static void emit(long address, unsigned long word, int instr_index,
                 long operand, int has_operand, int line_no)
{
    if (address < 0 || address >= MAX_CODE) {
        report_error(line_no, "program too large for the code buffer");
        return;
    }
    code[address].word        = word;
    code[address].instr_index = instr_index;
    code[address].operand     = operand;
    code[address].has_operand = has_operand;
}

static int split_tokens(char *statement, char *out_mnemonic, char *out_operand)
{
    char *p;
    char *start;
    size_t length;

    out_mnemonic[0] = '\0';
    out_operand[0]  = '\0';

    p = skip_space(statement);
    if (*p == '\0') {
        return 0;
    }

    start = p;
    while (*p != '\0' && *p != ' ' && *p != '\t') {
        p++;
    }
    length = (size_t)(p - start);
    if (length > MAX_TOKEN) {
        length = MAX_TOKEN;
    }
    copy_bounded(out_mnemonic, start, length);

    p = skip_space(p);
    if (*p == '\0') {
        return 0;
    }
    start = p;
    while (*p != '\0' && *p != ' ' && *p != '\t') {
        p++;
    }
    length = (size_t)(p - start);
    if (length > MAX_TOKEN) {
        length = MAX_TOKEN;
    }
    copy_bounded(out_operand, start, length);

    p = skip_space(p);
    if (*p != '\0') {
        return -1;
    }
    return 0;
}

static int resolve_operand(int pass, long address, OperandKind kind,
                           const char *token, int line_no, long *out_value)
{
    long value;

    if (isalpha((unsigned char)token[0])) {
        int index = symtab_find(token);

        if (index < 0) {
            if (pass == PASS_TWO) {
                report_error_1(line_no, "no such label", token);
                return 0;
            }
            *out_value = 0;
            return 1;
        }
        symbol_table[index].used = 1;
        value = symbol_table[index].value;

        if (kind == OPD_OFFSET) {
            value = value - (address + 1);
        }
        *out_value = value;
        return 1;
    }

    if (!parse_number(token, &value)) {
        if (pass == PASS_ONE) {
            report_error_1(line_no, "invalid number", token);
        }
        return 0;
    }
    *out_value = value;
    return 1;
}

static int process_line(char *line, int line_no, int pass, long address)
{
    char  label[MAX_LABEL + 1];
    char  mnemonic[MAX_TOKEN + 1];
    char  operand[MAX_TOKEN + 1];
    char *p;
    char *colon;
    int   have_label = 0;
    int   instr_index;
    long  value = 0;
    const InstrDef *def;

    p = strchr(line, ';');
    if (p != NULL) {
        *p = '\0';
    }
    trim_trailing(line);

    p = skip_space(line);
    if (*p == '\0') {
        return 0;
    }

    colon = strchr(p, ':');
    if (colon != NULL) {
        size_t length = (size_t)(colon - p);

        if (length > MAX_LABEL) {
            length = MAX_LABEL;
        }
        copy_bounded(label, p, length);
        trim_trailing(label);

        if (strchr(label, ' ') != NULL || strchr(label, '\t') != NULL) {
            if (pass == PASS_ONE) {
                report_error(line_no, "unexpected ':' in statement");
            }
            return 0;
        }
        if (!is_valid_label(label)) {
            if (pass == PASS_ONE) {
                report_error_1(line_no, "invalid label name", label);
            }
            return 0;
        }
        have_label = 1;

        p = skip_space(colon + 1);
        if (strchr(p, ':') != NULL) {
            if (pass == PASS_ONE) {
                report_error(line_no, "more than one label on a line");
            }
            return 0;
        }
    }

    if (split_tokens(p, mnemonic, operand) != 0) {
        if (pass == PASS_ONE) {
            report_error(line_no, "extra text at end of line");
        }
        if (have_label && pass == PASS_ONE) {
            (void)symtab_add(label, address, line_no, 0);
        }
        return 0;
    }

    if (mnemonic[0] == '\0') {
        if (have_label && pass == PASS_ONE) {
            (void)symtab_add(label, address, line_no, 0);
        }
        return 0;
    }

    instr_index = find_instruction(mnemonic);
    if (instr_index < 0) {
        if (pass == PASS_ONE) {
            report_error_1(line_no, "unknown mnemonic", mnemonic);
            if (have_label) {
                (void)symtab_add(label, address, line_no, 0);
            }
        }
        return 0;
    }
    def = &instruction_table[instr_index];

    if (def->kind == OPD_NONE && operand[0] != '\0') {
        if (pass == PASS_ONE) {
            report_error_1(line_no, "unexpected operand for", def->mnemonic);
            if (have_label) {
                (void)symtab_add(label, address, line_no, 0);
            }
        }
        return 0;
    }
    if (def->kind != OPD_NONE && operand[0] == '\0') {
        if (pass == PASS_ONE) {
            report_error_1(line_no, "missing operand for", def->mnemonic);
            if (have_label) {
                (void)symtab_add(label, address, line_no, 0);
            }
        }
        return 0;
    }

    if (def->opcode == OPCODE_PSEUDO_SET) {
        if (!have_label) {
            if (pass == PASS_ONE) {
                report_error(line_no, "SET requires a label on the same line");
            }
            return 0;
        }
        if (pass == PASS_ONE) {
            if (isalpha((unsigned char)operand[0])) {
                int index = symtab_find(operand);
                if (index < 0) {
                    report_error_1(line_no,
                                   "SET operand must already be defined",
                                   operand);
                    return 0;
                }
                symbol_table[index].used = 1;
                value = symbol_table[index].value;
            } else if (!parse_number(operand, &value)) {
                report_error_1(line_no, "invalid number", operand);
                return 0;
            }
            (void)symtab_add(label, value, line_no, 1);
        }
        return 0;
    }

    if (have_label && pass == PASS_ONE) {
        (void)symtab_add(label, address, line_no, 0);
    }

    if (def->kind == OPD_NONE) {
        if (pass == PASS_TWO) {
            emit(address, encode(def->opcode, 0L), instr_index, 0L, 0,
                 line_no);
        }
        return 1;
    }

    if (!resolve_operand(pass, address, def->kind, operand, line_no, &value)) {
        if (pass == PASS_TWO) {
            emit(address, 0UL, instr_index, 0L, 1, line_no);
        }
        return 1;
    }

    if (def->opcode == OPCODE_PSEUDO_DATA) {
        if (pass == PASS_TWO) {
            emit(address, ((unsigned long)value) & WORD_MASK, instr_index,
                 value, 1, line_no);
        }
        return 1;
    }

    if (value < OPERAND_MIN || value > OPERAND_MAX) {
        if (pass == PASS_TWO) {
            char message[96];
            sprintf(message,
                    "operand %ld out of 24-bit range (%ld..%ld)",
                    value, OPERAND_MIN, OPERAND_MAX);
            report_error(line_no, message);
        }
        if (pass == PASS_TWO) {
            emit(address, 0UL, instr_index, value, 1, line_no);
        }
        return 1;
    }

    if (pass == PASS_TWO) {
        emit(address, encode(def->opcode, value), instr_index, value, 1,
             line_no);
    }
    return 1;
}

static void process_file(FILE *fp, int pass)
{
    char line[MAX_LINE];
    long address = 0;
    int  line_no = 0;

    rewind(fp);
    while (fgets(line, (int)sizeof line, fp) != NULL) {
        size_t length;

        line_no++;
        length = strlen(line);

        if (length == sizeof line - 1 && line[length - 1] != '\n') {
            int c;
            if (pass == PASS_ONE) {
                report_error(line_no, "source line too long");
            }
            while ((c = fgetc(fp)) != EOF && c != '\n') {
            }
            continue;
        }

        while (length > 0 &&
               (line[length - 1] == '\n' || line[length - 1] == '\r')) {
            line[--length] = '\0';
        }

        address += process_line(line, line_no, pass, address);
    }

    if (pass == PASS_ONE) {
        code_length = address;
    } else if (address != code_length) {
        fprintf(stderr, "%s: error: internal pass mismatch (%ld vs %ld)\n",
                source_name, address, code_length);
        error_count++;
    }
}

static int write_object(const char *path)
{
    FILE *fp;
    long  i;

    fp = fopen(path, "wb");
    if (fp == NULL) {
        fprintf(stderr, "error: cannot create object file '%s'\n", path);
        return 0;
    }
    for (i = 0; i < code_length; i++) {
        unsigned long word = code[i].word & WORD_MASK;
        unsigned char bytes[4];

        bytes[0] = (unsigned char)( word        & 0xFFUL);
        bytes[1] = (unsigned char)((word >> 8)  & 0xFFUL);
        bytes[2] = (unsigned char)((word >> 16) & 0xFFUL);
        bytes[3] = (unsigned char)((word >> 24) & 0xFFUL);

        if (fwrite(bytes, 1, 4, fp) != 4) {
            fprintf(stderr, "error: write failed on '%s'\n", path);
            fclose(fp);
            return 0;
        }
    }
    if (fclose(fp) != 0) {
        fprintf(stderr, "error: close failed on '%s'\n", path);
        return 0;
    }
    return 1;
}

static void write_listing_dump(FILE *fp)
{
    long i;

    for (i = 0; i < code_length; i += 4) {
        long j;
        fprintf(fp, "%08lX", i);
        for (j = i; j < i + 4 && j < code_length; j++) {
            fprintf(fp, " %08lX", code[j].word & WORD_MASK);
        }
        fputc('\n', fp);
    }
}

static void write_listing_advanced(FILE *fp)
{
    long i;

    for (i = 0; i < code_length; i++) {
        const InstrDef *def;
        int   label_index;
        int   instr_index;

        label_index = symtab_find_by_address(i);
        if (label_index >= 0) {
            fprintf(fp, "%08lX %s:\n", i, symbol_table[label_index].name);
        }

        instr_index = code[i].instr_index;
        if (instr_index < 0 || instr_index >= INSTRUCTION_COUNT) {
            fprintf(fp, "%08lX %08lX\n", i, code[i].word & WORD_MASK);
            continue;
        }
        def = &instruction_table[instr_index];

        fprintf(fp, "%08lX %08lX %s", i, code[i].word & WORD_MASK,
                def->mnemonic);

        if (code[i].has_operand) {
            if (def->kind == OPD_OFFSET) {
                long target = i + 1 + code[i].operand;
                int  target_index = symtab_find_by_address(target);

                if (target_index >= 0) {
                    fprintf(fp, " %s", symbol_table[target_index].name);
                } else {
                    fprintf(fp, " %ld", code[i].operand);
                }
            } else if (code[i].operand < 0) {
                fprintf(fp, " %ld", code[i].operand);
            } else {
                fprintf(fp, " 0x%lX", (unsigned long)code[i].operand);
            }
        }
        fputc('\n', fp);
    }
}

static void write_symbol_section(FILE *fp)
{
    int i;

    if (symbol_count == 0) {
        return;
    }
    fputs("\nSymbol table\n", fp);
    for (i = 0; i < symbol_count; i++) {
        fprintf(fp, "  %-24s %08lX %s\n",
                symbol_table[i].name,
                ((unsigned long)symbol_table[i].value) & WORD_MASK,
                symbol_table[i].is_set ? "(SET)" : "");
    }
}

static int write_listing(const char *path, int dump_mode)
{
    FILE *fp;

    fp = fopen(path, "w");
    if (fp == NULL) {
        fprintf(stderr, "error: cannot create listing file '%s'\n", path);
        return 0;
    }
    if (dump_mode) {
        write_listing_dump(fp);
    } else {
        write_listing_advanced(fp);
        write_symbol_section(fp);
    }
    if (fclose(fp) != 0) {
        fprintf(stderr, "error: close failed on '%s'\n", path);
        return 0;
    }
    return 1;
}

static void derive_name(char *out, const char *source, const char *extension)
{
    const char *dot;
    size_t      base_length;

    dot = strrchr(source, '.');
    if (dot == NULL) {
        base_length = strlen(source);
    } else {
        base_length = (size_t)(dot - source);
    }
    if (base_length > MAX_LINE - 8) {
        base_length = MAX_LINE - 8;
    }
    copy_bounded(out, source, base_length);
    strcat(out, extension);
}

static void warn_unused_labels(void)
{
    int i;

    for (i = 0; i < symbol_count; i++) {
        if (!symbol_table[i].used) {
            report_warning(symbol_table[i].defined_line, "unused label",
                           symbol_table[i].name);
        }
    }
}

static void print_usage(void)
{
    fputs("usage: asm [-dump] <source.asm> [object.o] [listing.lst]\n",
          stderr);
}

int main(int argc, char **argv)
{
    FILE *fp;
    char  object_path[MAX_LINE];
    char  listing_path[MAX_LINE];
    int   dump_mode = 0;
    int   arg = 1;
    int   positional = 0;
    const char *source_path  = NULL;
    const char *object_arg   = NULL;
    const char *listing_arg  = NULL;

    while (arg < argc) {
        if (strcmp(argv[arg], "-dump") == 0) {
            dump_mode = 1;
        } else if (argv[arg][0] == '-' && argv[arg][1] != '\0') {
            fprintf(stderr, "error: unknown option '%s'\n", argv[arg]);
            print_usage();
            return EXIT_FAIL;
        } else {
            switch (positional) {
            case 0:  source_path = argv[arg]; break;
            case 1:  object_arg  = argv[arg]; break;
            case 2:  listing_arg = argv[arg]; break;
            default:
                fprintf(stderr, "error: too many arguments\n");
                print_usage();
                return EXIT_FAIL;
            }
            positional++;
        }
        arg++;
    }

    if (source_path == NULL) {
        print_usage();
        return EXIT_FAIL;
    }
    source_name = source_path;

    if (object_arg != NULL) {
        copy_bounded(object_path, object_arg, MAX_LINE - 1);
    } else {
        derive_name(object_path, source_path, ".o");
    }
    if (listing_arg != NULL) {
        copy_bounded(listing_path, listing_arg, MAX_LINE - 1);
    } else {
        derive_name(listing_path, source_path, ".lst");
    }

    fp = fopen(source_path, "r");
    if (fp == NULL) {
        fprintf(stderr, "error: cannot open source file '%s'\n", source_path);
        return EXIT_FAIL;
    }

    process_file(fp, PASS_ONE);
    process_file(fp, PASS_TWO);
    fclose(fp);

    warn_unused_labels();

    if (error_count > 0) {
        fprintf(stderr, "%s: %ld error(s), %ld warning(s); no output written\n",
                source_name, error_count, warning_count);
        return EXIT_FAIL;
    }

    if (!write_object(object_path)) {
        return EXIT_FAIL;
    }
    if (!write_listing(listing_path, dump_mode)) {
        return EXIT_FAIL;
    }

    printf("%s: assembled %ld word(s), %ld warning(s)\n",
           source_name, code_length, warning_count);
    printf("  object  : %s\n", object_path);
    printf("  listing : %s\n", listing_path);
    return EXIT_OK;
}
