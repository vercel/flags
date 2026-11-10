package js

import (
	"math"
	"testing"
	"time"
)

func TestNumberToString(t *testing.T) {
	cases := map[float64]string{
		0: "0", 1: "1", -1: "-1", 1.5: "1.5", 0.1: "0.1", 100: "100", 1e21: "1e+21", 1e20: "100000000000000000000",
		1.5e21: "1.5e+21", 1e-6: "0.000001", 1e-7: "1e-7", 1.5e-7: "1.5e-7", 123456789.125: "123456789.125",
		math.Inf(1): "Infinity", math.Inf(-1): "-Infinity", -0.5: "-0.5",
	}
	for in, want := range cases {
		if got := NumberToString(in); got != want {
			t.Errorf("NumberToString(%v) = %q, want %q", in, got, want)
		}
	}
	if got := NumberToString(math.NaN()); got != "NaN" {
		t.Errorf("NumberToString(NaN) = %q", got)
	}
}

func TestStringToNumber(t *testing.T) {
	cases := map[string]float64{
		"": 0, "  ": 0, "5": 5, " 12 ": 12, "-5": -5, "+7": 7, ".5": 0.5, "5.": 5, "1e3": 1000, "1E-2": 0.01,
		"0x10": 16, "0X1f": 31, "0b11": 3, "0o17": 15, "Infinity": math.Inf(1), "-Infinity": math.Inf(-1),
		"1e999": math.Inf(1), " 5\ufeff": 5, "0x1fffffffffffffffff": 0x1fffffffffffffffff,
	}
	for in, want := range cases {
		if got := StringToNumber(in); got != want {
			t.Errorf("StringToNumber(%q) = %v, want %v", in, got, want)
		}
	}
	for _, in := range []string{"abc", "1_000", "-0x10", "0x", "inf", "nan", "NaN", "1e", ".", "+", "5 5", "0x1p4", "infinity", "1,5"} {
		if got := StringToNumber(in); !math.IsNaN(got) {
			t.Errorf("StringToNumber(%q) = %v, want NaN", in, got)
		}
	}
}

func TestCompareStrings(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"a", "b", -1}, {"b", "a", 1}, {"a", "a", 0}, {"a", "ab", -1}, {"", "", 0}, {"B", "a", -1},
		// U+1F600 is the surrogate pair D83D DE00, which is below U+FFFF in UTF-16.
		{"\U0001F600", "￿", -1}, {"￿", "\U0001F600", 1}, {"\U0001F600", "퟿", 1},
		{"\U0001F600", "\U0001F601", -1}, {"x\U0001F600", "x", -1},
	}
	for _, tc := range cases {
		if got := CompareStrings(tc.a, tc.b); got != tc.want {
			t.Errorf("CompareStrings(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestToLower(t *testing.T) {
	cases := map[string]string{
		"ABC": "abc", "abc": "abc", "": "", "İ": "i̇", "ΟΔΟΣ": "οδος", "Σ": "σ", "ΑΣΑ": "ασα", "ΑΣ.": "ας.",
		"STRASSE": "strasse", "ẞ": "ß", "ÀÉ": "àé", "A1": "a1",
	}
	for in, want := range cases {
		if got := ToLower(in); got != want {
			t.Errorf("ToLower(%q) = %q, want %q", in, got, want)
		}
	}
	if got := UTF16Len("a\U0001F600é"); got != 4 {
		t.Errorf("UTF16Len = %d, want 4", got)
	}
}

func TestParseDateLocalTime(t *testing.T) {
	newYork, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("no time zone database")
	}
	cases := []struct {
		in   string
		loc  *time.Location
		want time.Time
	}{
		// A date and time with no offset is local time.
		{"2024-06-15T12:00:00", newYork, time.Date(2024, 6, 15, 12, 0, 0, 0, newYork)},
		{"2024-01-15T12:00", newYork, time.Date(2024, 1, 15, 12, 0, 0, 0, newYork)},
		// A date with no time is UTC in each location.
		{"2024-06-15", newYork, time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)},
		{"2024-06-15T12:00:00Z", newYork, time.Date(2024, 6, 15, 12, 0, 0, 0, time.UTC)},
		{"2024-06-15T12:00:00.250+02:00", time.UTC, time.Date(2024, 6, 15, 10, 0, 0, 250e6, time.UTC)},
	}
	for _, tc := range cases {
		got, ok := ParseDate(tc.in, tc.loc)
		if !ok || got != float64(tc.want.UnixMilli()) {
			t.Errorf("ParseDate(%q) = %v, %v, want %d", tc.in, got, ok, tc.want.UnixMilli())
		}
	}
	for _, in := range []string{"", "2024-6-15", "2024-06-15T12", "Jan 1, 2020", "10", "2024-06-15T12:00:00+0200"} {
		if _, ok := ParseDate(in, time.UTC); ok {
			t.Errorf("ParseDate(%q) is valid, want invalid", in)
		}
	}
}
