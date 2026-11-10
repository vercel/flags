package flags

import (
	"encoding/json"
	"math"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/vercel/flags/go/internal/js"
)

// The evaluator works on the JSON data model, as the Node.js client does:
// nil, bool, float64, string, []any and map[string]any. The additional value
// `undefined` is a property that does not exist. JavaScript makes a difference
// between a missing value and null, and some comparators depend on it.

type undefinedValue struct{}

var undefined = undefinedValue{}

// normalize converts one Go value to the JSON data model. It does not convert
// the elements of a list or the values of a map.
func normalize(v any) any {
	switch x := v.(type) {
	case nil, undefinedValue, bool, string, float64, []any, map[string]any:
		return x
	case Entities:
		return map[string]any(x)
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case int32:
		return float64(x)
	case float32:
		return float64(x)
	case uint:
		return float64(x)
	case uint64:
		return float64(x)
	case uint32:
		return float64(x)
	case []string:
		out := make([]any, len(x))
		for i, s := range x {
			out[i] = s
		}
		return out
	case map[string]string:
		out := make(map[string]any, len(x))
		for k, s := range x {
			out[k] = s
		}
		return out
	case json.Number:
		f, err := x.Float64()
		if err != nil {
			return undefined
		}
		return f
	case time.Time:
		// The same text that encoding/json writes for a time.
		return x.Format(time.RFC3339Nano)
	}
	return normalizeReflect(reflect.ValueOf(v))
}

func normalizeReflect(rv reflect.Value) any {
	switch rv.Kind() {
	case reflect.Pointer, reflect.Interface:
		if rv.IsNil() {
			return nil
		}
		return normalize(rv.Elem().Interface())
	case reflect.String:
		return rv.String()
	case reflect.Bool:
		return rv.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(rv.Int())
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return float64(rv.Uint())
	case reflect.Float32, reflect.Float64:
		return rv.Float()
	case reflect.Map:
		if rv.IsNil() {
			return nil
		}
		if rv.Type().Key().Kind() == reflect.String {
			out := make(map[string]any, rv.Len())
			iter := rv.MapRange()
			for iter.Next() {
				out[iter.Key().String()] = iter.Value().Interface()
			}
			return out
		}
	case reflect.Slice, reflect.Array:
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return nil
		}
		if rv.Type().Elem().Kind() != reflect.Uint8 {
			out := make([]any, rv.Len())
			for i := range out {
				out[i] = rv.Index(i).Interface()
			}
			return out
		}
	}

	// Structs and all other values take the form that encoding/json gives them.
	data, err := json.Marshal(rv.Interface())
	if err != nil {
		return undefined
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		return undefined
	}
	return out
}

// normalizeDeep converts a value and the elements of its lists to the JSON
// data model. It does not look into maps, because no comparator reads them.
func normalizeDeep(v any) any {
	v = normalize(v)
	list, ok := v.([]any)
	if !ok {
		return v
	}
	for i, item := range list {
		switch item.(type) {
		case nil, bool, string, float64, map[string]any:
			continue
		}
		// Copy on the first element that needs a conversion.
		out := make([]any, len(list))
		copy(out, list[:i])
		for j := i; j < len(list); j++ {
			out[j] = normalizeDeep(list[j])
		}
		return out
	}
	return list
}

// truthy is the JavaScript ToBoolean conversion.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil, undefinedValue:
		return false
	case bool:
		return x
	case float64:
		return x != 0 && !math.IsNaN(x)
	case string:
		return x != ""
	}
	return true
}

// strictEquals is the JavaScript `===` operator for values that come from two
// different JSON documents. Two lists or two objects are never equal.
func strictEquals(a, b any) bool {
	switch x := a.(type) {
	case nil:
		return b == nil
	case undefinedValue:
		_, ok := b.(undefinedValue)
		return ok
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	}
	return false
}

// includes is the JavaScript `Array.prototype.includes` method for a list
// and a value of which one comes from JSON. JSON has no NaN, so the method is
// the same as strictEquals for each item.
func includes(list []any, v any) bool {
	for _, item := range list {
		if strictEquals(item, v) {
			return true
		}
	}
	return false
}

// lower converts strings, and strings in lists, to lower case.
func lower(v any) any {
	switch x := v.(type) {
	case string:
		return js.ToLower(x)
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = lower(item)
		}
		return out
	}
	return v
}

// toString is the JavaScript ToString conversion.
func toString(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case undefinedValue:
		return "undefined"
	case bool:
		return strconv.FormatBool(x)
	case float64:
		return js.NumberToString(x)
	case string:
		return x
	case []any:
		parts := make([]string, len(x))
		for i, item := range x {
			// Array.prototype.join writes null and undefined as empty strings.
			if item != nil && item != any(undefined) {
				parts[i] = toString(item)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

// toNumber is the JavaScript ToNumber conversion of a primitive value.
func toNumber(v any) float64 {
	switch x := v.(type) {
	case nil:
		return 0
	case bool:
		if x {
			return 1
		}
		return 0
	case float64:
		return x
	case string:
		return js.StringToNumber(x)
	}
	return math.NaN()
}

// relation is the result of a JavaScript relational comparison.
type relation int

const (
	unordered relation = iota // One side is NaN. Each operator gives false.
	less
	equal
	greater
)

// compare is the JavaScript relational comparison of lhs and rhs. Two strings
// compare by UTF-16 code units. All other pairs compare as numbers.
func compare(lhs, rhs any) relation {
	// ToPrimitive: a list or an object becomes a string.
	switch lhs.(type) {
	case []any, map[string]any:
		lhs = toString(lhs)
	}

	ls, lIsString := lhs.(string)
	rs, rIsString := rhs.(string)
	if lIsString && rIsString {
		switch js.CompareStrings(ls, rs) {
		case -1:
			return less
		case 1:
			return greater
		}
		return equal
	}

	l, r := toNumber(lhs), toNumber(rhs)
	switch {
	case math.IsNaN(l) || math.IsNaN(r):
		return unordered
	case l < r:
		return less
	case l > r:
		return greater
	}
	return equal
}

// arrayIndex returns the index that key names in a list of length n. A key is
// an index only in its canonical form: "1" is an index, "01" is not.
func arrayIndex(key string, n int) (int, bool) {
	if key == "" || len(key) > 10 || (len(key) > 1 && key[0] == '0') {
		return 0, false
	}
	var i int64
	for _, c := range []byte(key) {
		if c < '0' || c > '9' {
			return 0, false
		}
		i = i*10 + int64(c-'0')
	}
	return int(i), i < int64(n)
}
