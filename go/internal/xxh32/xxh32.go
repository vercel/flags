// Package xxh32 implements the 32-bit xxHash algorithm.
//
// Vercel Flags uses xxHash32 to assign a unit to a bucket. The Node.js client
// uses the js-xxhash package. This package gives the same result for each
// input and seed, which includes seeds that are not unsigned 32-bit integers.
package xxh32

import (
	"math"
	"math/bits"
)

const (
	prime1 uint32 = 2654435761
	prime2 uint32 = 2246822519
	prime3 uint32 = 3266489917
	prime4 uint32 = 668265263
	prime5 uint32 = 374761393
)

// state holds the initial accumulators. The seed sets them.
type state struct {
	small          uint32
	v1, v2, v3, v4 uint32
}

// String returns the xxHash32 of the bytes of s.
func String(s string, seed uint32) uint32 {
	return sum(s, state{
		small: seed + prime5,
		v1:    seed + prime1 + prime2,
		v2:    seed + prime2,
		v3:    seed,
		v4:    seed - prime1,
	})
}

// StringJS returns the xxHash32 of the bytes of s for a seed that is a
// JavaScript number.
//
// js-xxhash adds the seed to each prime as a double and then keeps the low 32
// bits. For an integer seed the result is the standard xxHash32 of the seed
// modulo 2^32. For other seeds the accumulators are different, and this
// function does the same arithmetic.
func StringJS(s string, seed float64) uint32 {
	if seed >= 0 && seed <= math.MaxUint32 && seed == math.Trunc(seed) {
		return String(s, uint32(seed))
	}
	p1, p2, p5 := float64(prime1), float64(prime2), float64(prime5)
	return sum(s, state{
		small: toUint32(seed + p5),
		v1:    toUint32(seed + p1 + p2),
		v2:    toUint32(seed + p2),
		v3:    toUint32(seed + 0),
		v4:    toUint32(seed - p1),
	})
}

// toUint32 is the ECMAScript ToUint32 conversion.
func toUint32(f float64) uint32 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	f = math.Mod(math.Trunc(f), 1<<32)
	if f < 0 {
		f += 1 << 32
	}
	return uint32(f)
}

func sum(s string, init state) uint32 {
	n := len(s)
	i := 0
	var h uint32

	if n >= 16 {
		v1, v2, v3, v4 := init.v1, init.v2, init.v3, init.v4
		for ; i+16 <= n; i += 16 {
			v1 = round(v1, le32(s, i))
			v2 = round(v2, le32(s, i+4))
			v3 = round(v3, le32(s, i+8))
			v4 = round(v4, le32(s, i+12))
		}
		h = bits.RotateLeft32(v1, 1) + bits.RotateLeft32(v2, 7) +
			bits.RotateLeft32(v3, 12) + bits.RotateLeft32(v4, 18)
	} else {
		h = init.small
	}

	h += uint32(n)

	for ; i+4 <= n; i += 4 {
		h += le32(s, i) * prime3
		h = bits.RotateLeft32(h, 17) * prime4
	}
	for ; i < n; i++ {
		h += uint32(s[i]) * prime5
		h = bits.RotateLeft32(h, 11) * prime1
	}

	h ^= h >> 15
	h *= prime2
	h ^= h >> 13
	h *= prime3
	h ^= h >> 16
	return h
}

func round(acc, lane uint32) uint32 {
	acc += lane * prime2
	return bits.RotateLeft32(acc, 13) * prime1
}

func le32(s string, i int) uint32 {
	return uint32(s[i]) | uint32(s[i+1])<<8 | uint32(s[i+2])<<16 | uint32(s[i+3])<<24
}
