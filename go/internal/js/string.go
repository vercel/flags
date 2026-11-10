// Package js implements the JavaScript value semantics that the Vercel Flags
// evaluator depends on.
//
// The Node.js client is the reference implementation. Its evaluator uses
// JavaScript operators such as `>` and methods such as `toLowerCase`. The Go
// evaluator must give the same result, so this package copies those
// operations from the ECMAScript specification.
package js

import (
	"unicode"
	"unicode/utf8"
)

// UTF16Len returns the number of UTF-16 code units in s. This is the value of
// the JavaScript `length` property of the string.
func UTF16Len(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// CompareStrings compares two strings by their UTF-16 code units, as the
// JavaScript relational operators do. The result is -1, 0 or +1.
//
// Go compares strings by bytes, which is the code point order. The two orders
// are different for a character above U+FFFF against a character in the range
// U+E000 to U+FFFF.
func CompareStrings(a, b string) int {
	for len(a) > 0 && len(b) > 0 {
		ra, sizeA := utf8.DecodeRuneInString(a)
		rb, sizeB := utf8.DecodeRuneInString(b)
		if ra != rb {
			ua, ub := leadUnit(ra), leadUnit(rb)
			if ua != ub {
				if ua < ub {
					return -1
				}
				return 1
			}
			// Both are above U+FFFF with the same lead surrogate.
			if ra < rb {
				return -1
			}
			return 1
		}
		a, b = a[sizeA:], b[sizeB:]
	}
	switch {
	case len(a) > 0:
		return 1
	case len(b) > 0:
		return -1
	default:
		return 0
	}
}

// leadUnit returns the first UTF-16 code unit of r.
func leadUnit(r rune) rune {
	if r >= 0x10000 {
		return 0xD800 + (r-0x10000)>>10
	}
	return r
}

// ToLower is the JavaScript `String.prototype.toLowerCase` conversion.
//
// It uses the full Unicode case mapping without a locale. This is different
// from strings.ToLower for two characters: U+0130 becomes two code points, and
// U+03A3 becomes the final sigma at the end of a word.
func ToLower(s string) string {
	// Most strings are ASCII. Do not allocate when there is nothing to do.
	needsWork := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= utf8.RuneSelf || ('A' <= c && c <= 'Z') {
			needsWork = true
			break
		}
	}
	if !needsWork {
		return s
	}

	out := make([]byte, 0, len(s)+2)
	for i, r := range s {
		switch r {
		case 0x0130:
			out = append(out, "i̇"...)
		case 0x03A3:
			if isFinalSigma(s, i) {
				out = utf8.AppendRune(out, 0x03C2)
			} else {
				out = utf8.AppendRune(out, 0x03C3)
			}
		case utf8.RuneError:
			// Keep invalid bytes as the replacement character.
			out = utf8.AppendRune(out, r)
		default:
			out = utf8.AppendRune(out, unicode.ToLower(r))
		}
	}
	return string(out)
}

// isFinalSigma reports whether the sigma at byte offset i of s is in the
// Final_Sigma context of the Unicode standard: a cased letter is before it,
// and no cased letter is after it. Case-ignorable characters are skipped.
func isFinalSigma(s string, i int) bool {
	before := false
	for j := i; j > 0; {
		r, size := utf8.DecodeLastRuneInString(s[:j])
		j -= size
		if isCaseIgnorable(r) {
			continue
		}
		before = isCased(r)
		break
	}
	if !before {
		return false
	}
	for _, r := range s[i+len("Σ"):] {
		if isCaseIgnorable(r) {
			continue
		}
		return !isCased(r)
	}
	return true
}

func isCased(r rune) bool {
	return unicode.IsUpper(r) || unicode.IsLower(r) || unicode.IsTitle(r) ||
		unicode.Is(unicode.Other_Lowercase, r) || unicode.Is(unicode.Other_Uppercase, r)
}

func isCaseIgnorable(r rune) bool {
	switch r {
	// Word_Break values MidLetter, MidNumLet and Single_Quote.
	case '\'', '.', ':', 0x00B7, 0x0387, 0x055F, 0x05F4, 0x2018, 0x2019, 0x2024,
		0x2027, 0xFE13, 0xFE52, 0xFE55, 0xFF07, 0xFF0E, 0xFF1A:
		return true
	}
	return unicode.In(r, unicode.Mn, unicode.Me, unicode.Cf, unicode.Lm, unicode.Sk)
}
