package js

import (
	"errors"
	"math"
	"math/big"
	"strconv"
	"strings"
)

// NumberToString is the ECMAScript Number::toString conversion in base 10.
func NumberToString(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		return "0"
	}
	// JavaScript writes numbers from 1e-6 up to 1e21 with no exponent.
	if abs := math.Abs(f); abs >= 1e-6 && abs < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	// Go writes "1e-07" and JavaScript writes "1e-7".
	s := strconv.FormatFloat(f, 'e', -1, 64)
	mantissa, exponent, _ := strings.Cut(s, "e")
	return mantissa + "e" + exponent[:1] + strings.TrimLeft(exponent[1:], "0")
}

// StringToNumber is the ECMAScript StringToNumber conversion. A string that is
// not a numeric literal gives NaN.
func StringToNumber(s string) float64 {
	s = strings.TrimFunc(s, isWhiteSpace)
	if s == "" {
		return 0
	}

	if len(s) > 2 && s[0] == '0' {
		switch s[1] {
		case 'x', 'X':
			return parseRadix(s[2:], 16)
		case 'o', 'O':
			return parseRadix(s[2:], 8)
		case 'b', 'B':
			return parseRadix(s[2:], 2)
		}
	}

	switch s {
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	// ParseFloat also accepts hexadecimal floats, underscores, "inf" and
	// "nan", which are not ECMAScript decimal literals.
	if strings.ContainsAny(s, "xXnNiIpP_") {
		return math.NaN()
	}
	f, err := strconv.ParseFloat(s, 64)
	// A range error gives ±Inf, as in JavaScript.
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return math.NaN()
	}
	return f
}

// parseRadix parses the digits of a binary, octal or hexadecimal literal.
func parseRadix(digits string, base int) float64 {
	// SetString accepts a sign, which a literal with a prefix cannot have.
	if digits[0] == '+' || digits[0] == '-' {
		return math.NaN()
	}
	v, ok := new(big.Int).SetString(digits, base)
	if !ok {
		return math.NaN()
	}
	f, _ := v.Float64()
	return f
}

// isWhiteSpace reports whether r is an ECMAScript WhiteSpace or LineTerminator
// code point.
func isWhiteSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0x00A0, 0x1680, 0x2028, 0x2029,
		0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}
