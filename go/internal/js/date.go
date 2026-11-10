package js

import (
	"math"
	"time"
)

// maxTime is the largest ECMAScript time value in milliseconds.
const maxTime = 8.64e15

// ParseDate parses a string in the ECMAScript date-time string format and
// returns the time as Unix epoch milliseconds.
//
//	YYYY[-MM[-DD]][THH:mm[:ss[.fraction]][Z|±HH:mm]]
//
// The year has four digits, or a sign and six digits. A string with no time
// is UTC. A string with a time and no offset is in the location loc.
//
// The Node.js client uses `new Date(string)`. V8 first applies this format and
// then tries other, undocumented formats. This function supports only the
// documented format, with the V8 rules for it: a day from 29 to 31 that the
// month does not have moves into the next month, the hour 24 is midnight, and
// the fraction keeps three digits.
func ParseDate(s string, loc *time.Location) (ms float64, ok bool) {
	p := dateParser{s: s}

	year, ok := p.year()
	if !ok {
		return 0, false
	}
	month, day := 1, 1
	if p.eat('-') {
		if month, ok = p.digits(2); !ok || month < 1 || month > 12 {
			return 0, false
		}
		if p.eat('-') {
			if day, ok = p.digits(2); !ok || day < 1 || day > 31 {
				return 0, false
			}
		}
	}

	hour, minute, second, milli := 0, 0, 0, 0
	hasTime := false
	if p.eat('T') {
		hasTime = true
		if hour, ok = p.digits(2); !ok || hour > 24 || !p.eat(':') {
			return 0, false
		}
		if minute, ok = p.digits(2); !ok || minute > 59 {
			return 0, false
		}
		if p.eat(':') {
			if second, ok = p.digits(2); !ok || second > 59 {
				return 0, false
			}
			if p.eat('.') {
				if milli, ok = p.fraction(); !ok {
					return 0, false
				}
			}
		}
		if hour == 24 && (minute != 0 || second != 0 || milli != 0) {
			return 0, false
		}
	}

	// A date with no time is UTC. A date with a time and no offset is local.
	local := hasTime
	offsetMinutes := 0
	if p.eat('Z') {
		local = false
	} else if hasTime && (p.peek() == '+' || p.peek() == '-') {
		sign := 1
		if p.next() == '-' {
			sign = -1
		}
		oh, ok1 := p.digits(2)
		if !ok1 || oh > 23 || !p.eat(':') {
			return 0, false
		}
		om, ok2 := p.digits(2)
		if !ok2 || om > 59 {
			return 0, false
		}
		local = false
		offsetMinutes = sign * (oh*60 + om)
	}
	if !p.done() {
		return 0, false
	}

	// The time as if the fields were UTC. time.Date accepts a day and an hour
	// that are out of range and moves them into the next month or day.
	utc := time.Date(year, time.Month(month), day, hour, minute, second, 0, time.UTC)
	wall := float64(utc.Unix())*1000 + float64(milli)

	if local {
		wall -= float64(localOffsetSeconds(wall, loc)) * 1000
	} else {
		wall -= float64(offsetMinutes) * 60_000
	}
	if math.Abs(wall) > maxTime {
		return 0, false
	}
	return wall, true
}

// localOffsetSeconds returns the UTC offset of loc for the local wall time
// wallMs, which is in milliseconds.
func localOffsetSeconds(wallMs float64, loc *time.Location) int {
	if loc == nil || loc == time.UTC {
		return 0
	}
	// Go time cannot represent the full ECMAScript range in nanoseconds, but
	// time.Unix accepts the seconds directly.
	sec := int64(math.Floor(wallMs / 1000))
	_, guess := time.Unix(sec, 0).In(loc).Zone()
	_, offset := time.Unix(sec-int64(guess), 0).In(loc).Zone()
	return offset
}

type dateParser struct {
	s string
	i int
}

func (p *dateParser) done() bool { return p.i == len(p.s) }

func (p *dateParser) peek() byte {
	if p.i < len(p.s) {
		return p.s[p.i]
	}
	return 0
}

func (p *dateParser) next() byte {
	c := p.peek()
	p.i++
	return c
}

func (p *dateParser) eat(c byte) bool {
	if p.peek() == c {
		p.i++
		return true
	}
	return false
}

// digits reads exactly n decimal digits.
func (p *dateParser) digits(n int) (int, bool) {
	if p.i+n > len(p.s) {
		return 0, false
	}
	v := 0
	for _, c := range []byte(p.s[p.i : p.i+n]) {
		if c < '0' || c > '9' {
			return 0, false
		}
		v = v*10 + int(c-'0')
	}
	p.i += n
	return v, true
}

func (p *dateParser) year() (int, bool) {
	switch p.peek() {
	case '+', '-':
		negative := p.next() == '-'
		y, ok := p.digits(6)
		if !ok || (negative && y == 0) {
			return 0, false
		}
		if negative {
			y = -y
		}
		return y, true
	}
	return p.digits(4)
}

// fraction reads one or more digits and returns the first three as
// milliseconds.
func (p *dateParser) fraction() (int, bool) {
	start := p.i
	milli, scale := 0, 100
	for c := p.peek(); c >= '0' && c <= '9'; c = p.peek() {
		milli += int(c-'0') * scale
		scale /= 10
		p.i++
	}
	return milli, p.i > start
}
