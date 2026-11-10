package flags

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/dlclark/regexp2"
)

// This file converts the packed JSON form of a flag definition into Go types
// that the evaluator can run without more parsing. The packed form is defined
// in packages/vercel-flags-core/src/types.ts (namespace Packed).
//
// A definition with an unknown comparator or an unknown outcome type is still
// valid. The evaluator reports the unknown part only when an evaluation
// reaches it, as the Node.js client does. A newer server can then add a
// feature without breaking flags that do not use it.

const (
	hashSpace     = 1 << 32
	promilleScale = 100_000

	// maxRegexInputLength is the largest input, in UTF-16 code units, that a
	// regex comparator accepts.
	maxRegexInputLength = 10_000

	// regexMatchTimeout stops a pattern with catastrophic backtracking. The
	// condition then does not match.
	regexMatchTimeout = time.Second
)

// boundaryFor maps the fraction numerator/denominator to a cut point in the
// hash space. A hash is below the fraction if hash < boundaryFor(...). A zero
// denominator gives NaN, which no hash is below.
func boundaryFor(numerator, denominator float64) float64 {
	return math.Floor(numerator / denominator * hashSpace)
}

type definition struct {
	variants     []any
	variantIDs   []*string
	seed         float64 // 0 when the definition has no seed.
	experiment   *experiment
	environments map[string]*envConfig // A nil config is a JSON null.
}

type envKind int

const (
	envPaused envKind = iota
	envReuse
	envActive
)

type envConfig struct {
	kind               envKind
	paused             *outcome
	reuse              string
	targets            []targetList
	rules              []rule
	fallthroughOutcome *outcome
}

type outcomeKind int

const (
	outcomeVariant outcomeKind = iota
	outcomeSplit
	outcomeRollout
	outcomeExperiment
	outcomeUnknown
)

type outcome struct {
	kind    outcomeKind
	variant float64

	// split and rollout
	base           []string
	defaultVariant float64

	// split
	boundaries []float64

	// rollout
	startTimestamp  float64
	rollFromVariant float64
	rollToVariant   float64
	slots           [][2]float64
	finalPromille   float64
}

type experiment struct {
	id             string
	base           []string
	rawBase        []any
	boundaries     []float64
	defaultVariant float64
	enrollmentSeed float64
	rampID         *string
	rampPercentage *float64
}

type rule struct {
	conditions []condition
	outcome    *outcome
}

// targetList keeps the order of the JSON object, because the Node.js client
// reads the entity attributes in that order.
type targetList []targetAttribute

type targetAttribute struct {
	path   [2]string
	values map[string]struct{}
}

type segment struct {
	// invalid is set when the segment does not have the packed form. A
	// condition that reads the segment then fails.
	invalid error
	include targetList
	exclude targetList
	rules   []segmentRule
}

type segmentRule struct {
	conditions []condition
	outcome    segmentOutcome
}

type segmentOutcomeKind int

const (
	segmentAll segmentOutcomeKind = iota
	segmentSplit
	segmentUnknown
)

type segmentOutcome struct {
	kind         segmentOutcomeKind
	base         []string
	passPromille float64
}

type comparator string

const (
	cmpEq             comparator = "eq"
	cmpNotEq          comparator = "!eq"
	cmpOneOf          comparator = "oneOf"
	cmpNotOneOf       comparator = "!oneOf"
	cmpContainsAllOf  comparator = "containsAllOf"
	cmpContainsAnyOf  comparator = "containsAnyOf"
	cmpContainsNoneOf comparator = "containsNoneOf"
	cmpStartsWith     comparator = "startsWith"
	cmpNotStartsWith  comparator = "!startsWith"
	cmpEndsWith       comparator = "endsWith"
	cmpNotEndsWith    comparator = "!endsWith"
	cmpContains       comparator = "contains"
	cmpNotContains    comparator = "!contains"
	cmpExists         comparator = "ex"
	cmpNotExists      comparator = "!ex"
	cmpGt             comparator = "gt"
	cmpGte            comparator = "gte"
	cmpLt             comparator = "lt"
	cmpLte            comparator = "lte"
	cmpRegex          comparator = "regex"
	cmpNotRegex       comparator = "!regex"
	cmpBefore         comparator = "before"
	cmpAfter          comparator = "after"
)

func (c comparator) supportsIgnoreCase() bool {
	switch c {
	case cmpEq, cmpNotEq, cmpOneOf, cmpNotOneOf, cmpContainsAllOf, cmpContainsAnyOf,
		cmpContainsNoneOf, cmpStartsWith, cmpNotStartsWith, cmpEndsWith, cmpNotEndsWith,
		cmpContains, cmpNotContains:
		return true
	}
	return false
}

type lhsKind int

const (
	lhsEntity lhsKind = iota
	lhsSegment
	lhsUnknown
)

type condition struct {
	lhs        lhsKind
	path       []string
	cmp        comparator
	rhs        any // In lower case when ignoreCase is set.
	ignoreCase bool

	// rhsStrings holds the items of a list rhs when each item is a different
	// string. The list comparators then use it as a set.
	rhsStrings map[string]struct{}
	// regex is the compiled pattern of a regex comparator. It is nil when the
	// rhs is not a valid regex.
	regex *regexp2.Regexp
}

// -----------------------------------------------------------------------------
// JSON decoding that keeps the order of object keys
// -----------------------------------------------------------------------------

type object struct {
	keys   []string
	values map[string]any
}

func (o *object) get(key string) any {
	if o == nil {
		return undefined
	}
	v, ok := o.values[key]
	if !ok {
		return undefined
	}
	return v
}

// orderedKeys returns the keys in the order of a JavaScript `for...in` loop:
// first the array-index keys in ascending order, then the other keys in the
// order of the document.
func (o *object) orderedKeys() []string {
	var indexKeys, otherKeys []string
	for _, key := range o.keys {
		if _, ok := arrayIndex(key, math.MaxInt32); ok {
			indexKeys = append(indexKeys, key)
		} else {
			otherKeys = append(otherKeys, key)
		}
	}
	if len(indexKeys) == 0 {
		return otherKeys
	}
	sort.Slice(indexKeys, func(i, j int) bool {
		a, _ := arrayIndex(indexKeys[i], math.MaxInt32)
		b, _ := arrayIndex(indexKeys[j], math.MaxInt32)
		return a < b
	})
	return append(indexKeys, otherKeys...)
}

// decodeJSON decodes one JSON document. An object becomes an *object.
func decodeJSON(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	v, err := decodeValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, errors.New("unexpected data after the JSON document")
	}
	return v, nil
}

func decodeValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	delim, ok := tok.(json.Delim)
	if !ok {
		return tok, nil
	}
	switch delim {
	case '[':
		list := []any{}
		for dec.More() {
			item, err := decodeValue(dec)
			if err != nil {
				return nil, err
			}
			list = append(list, item)
		}
		_, err := dec.Token()
		return list, err
	case '{':
		obj := &object{values: map[string]any{}}
		for dec.More() {
			keyTok, err := dec.Token()
			if err != nil {
				return nil, err
			}
			key := keyTok.(string)
			value, err := decodeValue(dec)
			if err != nil {
				return nil, err
			}
			if _, exists := obj.values[key]; !exists {
				obj.keys = append(obj.keys, key)
			}
			obj.values[key] = value
		}
		_, err := dec.Token()
		return obj, err
	}
	return nil, fmt.Errorf("unexpected delimiter %q", delim)
}

// plain converts a decoded value to the usual encoding/json types.
func plain(v any) any {
	switch x := v.(type) {
	case *object:
		out := make(map[string]any, len(x.values))
		for k, item := range x.values {
			out[k] = plain(item)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = plain(item)
		}
		return out
	}
	return v
}

// -----------------------------------------------------------------------------
// Compilation
// -----------------------------------------------------------------------------

func compileDefinition(v any) (*definition, error) {
	obj, ok := v.(*object)
	if !ok {
		return nil, errors.New("definition is not an object")
	}

	def := &definition{}

	variants, ok := obj.get("variants").([]any)
	if !ok {
		return nil, errors.New("variants is not a list")
	}
	def.variants = make([]any, len(variants))
	for i, variant := range variants {
		def.variants[i] = plain(variant)
	}

	switch ids := obj.get("variantIds").(type) {
	case undefinedValue, nil:
	case []any:
		def.variantIDs = make([]*string, len(ids))
		for i, id := range ids {
			switch s := id.(type) {
			case string:
				def.variantIDs[i] = &s
			case nil:
			default:
				return nil, errors.New("variantIds has an item that is not a string")
			}
		}
	default:
		return nil, errors.New("variantIds is not a list")
	}

	switch seed := obj.get("seed").(type) {
	case undefinedValue:
	case float64:
		def.seed = seed
	default:
		return nil, errors.New("seed is not a number")
	}

	switch exp := obj.get("experiment").(type) {
	case undefinedValue, nil:
	default:
		compiled, err := compileExperiment(exp)
		if err != nil {
			return nil, fmt.Errorf("experiment: %w", err)
		}
		def.experiment = compiled
	}

	environments, ok := obj.get("environments").(*object)
	if !ok {
		return nil, errors.New("environments is not an object")
	}
	def.environments = make(map[string]*envConfig, len(environments.keys))
	for _, name := range environments.keys {
		env, err := compileEnvConfig(environments.values[name])
		if err != nil {
			return nil, fmt.Errorf("environment %q: %w", name, err)
		}
		def.environments[name] = env
	}
	return def, nil
}

func compileEnvConfig(v any) (*envConfig, error) {
	switch x := v.(type) {
	case nil:
		return nil, nil
	case float64:
		return &envConfig{kind: envPaused, paused: &outcome{kind: outcomeVariant, variant: x}}, nil
	case *object:
		if reuse := x.get("reuse"); reuse != any(undefined) {
			name, ok := reuse.(string)
			if !ok {
				return nil, errors.New("reuse is not a string")
			}
			return &envConfig{kind: envReuse, reuse: name}, nil
		}

		env := &envConfig{kind: envActive}
		switch targets := x.get("targets").(type) {
		case undefinedValue, nil:
		case []any:
			for _, item := range targets {
				list, err := compileTargetList(item)
				if err != nil {
					return nil, fmt.Errorf("targets: %w", err)
				}
				env.targets = append(env.targets, list)
			}
		default:
			return nil, errors.New("targets is not a list")
		}

		rules, err := compileRules(x.get("rules"), func(conditions []condition, out any) (rule, error) {
			compiled, err := compileOutcome(out)
			return rule{conditions: conditions, outcome: compiled}, err
		})
		if err != nil {
			return nil, err
		}
		env.rules = rules

		if env.fallthroughOutcome, err = compileOutcome(x.get("fallthrough")); err != nil {
			return nil, fmt.Errorf("fallthrough: %w", err)
		}
		return env, nil
	}
	return nil, errors.New("environment config is not a number or an object")
}

func compileRules[R any](v any, build func([]condition, any) (R, error)) ([]R, error) {
	var list []any
	switch x := v.(type) {
	case undefinedValue, nil:
		return nil, nil
	case []any:
		list = x
	default:
		return nil, errors.New("rules is not a list")
	}

	rules := make([]R, 0, len(list))
	for i, item := range list {
		obj, ok := item.(*object)
		if !ok {
			return nil, fmt.Errorf("rule %d is not an object", i)
		}
		rawConditions, ok := obj.get("conditions").([]any)
		if !ok {
			return nil, fmt.Errorf("rule %d: conditions is not a list", i)
		}
		conditions := make([]condition, len(rawConditions))
		for j, raw := range rawConditions {
			cond, err := compileCondition(raw)
			if err != nil {
				return nil, fmt.Errorf("rule %d: condition %d: %w", i, j, err)
			}
			conditions[j] = cond
		}
		r, err := build(conditions, obj.get("outcome"))
		if err != nil {
			return nil, fmt.Errorf("rule %d: outcome: %w", i, err)
		}
		rules = append(rules, r)
	}
	return rules, nil
}

func compileOutcome(v any) (*outcome, error) {
	switch x := v.(type) {
	case float64:
		return &outcome{kind: outcomeVariant, variant: x}, nil
	case *object:
		kind, _ := x.get("type").(string)
		switch kind {
		case "split":
			base, err := compilePath(x.get("base"))
			if err != nil {
				return nil, err
			}
			weights, err := numbers(x.get("weights"), "weights")
			if err != nil {
				return nil, err
			}
			defaultVariant, err := number(x.get("defaultVariant"), "defaultVariant")
			if err != nil {
				return nil, err
			}
			return &outcome{
				kind:           outcomeSplit,
				base:           base,
				boundaries:     splitBoundaries(weights),
				defaultVariant: defaultVariant,
			}, nil
		case "rollout":
			return compileRollout(x)
		case "experiment":
			return &outcome{kind: outcomeExperiment}, nil
		}
		return &outcome{kind: outcomeUnknown}, nil
	}
	return nil, errors.New("outcome is not a number or an object")
}

func compileRollout(x *object) (*outcome, error) {
	out := &outcome{kind: outcomeRollout, finalPromille: promilleScale}
	var err error
	if out.base, err = compilePath(x.get("base")); err != nil {
		return nil, err
	}
	fields := []struct {
		name string
		dst  *float64
	}{
		{"startTimestamp", &out.startTimestamp},
		{"rollFromVariant", &out.rollFromVariant},
		{"rollToVariant", &out.rollToVariant},
		{"defaultVariant", &out.defaultVariant},
	}
	for _, field := range fields {
		if *field.dst, err = number(x.get(field.name), field.name); err != nil {
			return nil, err
		}
	}

	slots, ok := x.get("slots").([]any)
	if !ok {
		return nil, errors.New("slots is not a list")
	}
	for _, item := range slots {
		pair, err := numbers(item, "slot")
		if err != nil || len(pair) != 2 {
			return nil, errors.New("slot is not a pair of numbers")
		}
		out.slots = append(out.slots, [2]float64{pair[0], pair[1]})
	}

	switch final := x.get("finalPromille").(type) {
	case undefinedValue, nil:
	case float64:
		out.finalPromille = final
	default:
		return nil, errors.New("finalPromille is not a number")
	}
	return out, nil
}

func compileExperiment(v any) (*experiment, error) {
	x, ok := v.(*object)
	if !ok {
		return nil, errors.New("not an object")
	}
	exp := &experiment{}
	if exp.id, ok = x.get("id").(string); !ok {
		return nil, errors.New("id is not a string")
	}
	var err error
	if exp.base, err = compilePath(x.get("base")); err != nil {
		return nil, err
	}
	exp.rawBase, _ = plain(x.get("base")).([]any)
	weights, err := numbers(x.get("weights"), "weights")
	if err != nil {
		return nil, err
	}
	exp.boundaries = splitBoundaries(weights)
	if exp.defaultVariant, err = number(x.get("defaultVariant"), "defaultVariant"); err != nil {
		return nil, err
	}
	if exp.enrollmentSeed, err = number(x.get("enrollmentSeed"), "enrollmentSeed"); err != nil {
		return nil, err
	}
	switch id := x.get("rampId").(type) {
	case undefinedValue, nil:
	case string:
		exp.rampID = &id
	default:
		return nil, errors.New("rampId is not a string")
	}
	switch pct := x.get("rampPercentage").(type) {
	case undefinedValue, nil:
	case float64:
		exp.rampPercentage = &pct
	default:
		return nil, errors.New("rampPercentage is not a number")
	}
	return exp, nil
}

// splitBoundaries returns the cumulative hash boundaries of a split, one for
// each variant. Variant i is served for a hash in [boundaries[i-1], boundaries[i]).
func splitBoundaries(weights []float64) []float64 {
	total := 0.0
	for _, w := range weights {
		total += w
	}
	boundaries := make([]float64, len(weights))
	cumulative := 0.0
	for i, w := range weights {
		cumulative += w
		boundaries[i] = boundaryFor(cumulative, total)
	}
	return boundaries
}

func compileTargetList(v any) (targetList, error) {
	kinds, ok := v.(*object)
	if !ok {
		return nil, errors.New("target list is not an object")
	}
	var list targetList
	for _, kind := range kinds.orderedKeys() {
		attributes, ok := kinds.values[kind].(*object)
		if !ok {
			return nil, fmt.Errorf("targets for %q is not an object", kind)
		}
		for _, attribute := range attributes.orderedKeys() {
			items, ok := attributes.values[attribute].([]any)
			if !ok {
				return nil, fmt.Errorf("targets for %q.%q is not a list", kind, attribute)
			}
			values := make(map[string]struct{}, len(items))
			for _, item := range items {
				// Only a string entity value can match, so other items have no effect.
				if s, ok := item.(string); ok {
					values[s] = struct{}{}
				}
			}
			list = append(list, targetAttribute{path: [2]string{kind, attribute}, values: values})
		}
	}
	return list, nil
}

func compileSegment(v any) (*segment, error) {
	x, ok := v.(*object)
	if !ok {
		return nil, errors.New("segment is not an object")
	}
	seg := &segment{}
	for name, dst := range map[string]*targetList{"include": &seg.include, "exclude": &seg.exclude} {
		switch raw := x.get(name).(type) {
		case undefinedValue, nil:
		default:
			list, err := compileTargetList(raw)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", name, err)
			}
			*dst = list
		}
	}
	rules, err := compileRules(x.get("rules"), func(conditions []condition, out any) (segmentRule, error) {
		compiled, err := compileSegmentOutcome(out)
		return segmentRule{conditions: conditions, outcome: compiled}, err
	})
	if err != nil {
		return nil, err
	}
	seg.rules = rules
	return seg, nil
}

func compileSegmentOutcome(v any) (segmentOutcome, error) {
	switch x := v.(type) {
	case float64:
		if x == 1 {
			return segmentOutcome{kind: segmentAll}, nil
		}
	case *object:
		if kind, _ := x.get("type").(string); kind != "split" {
			return segmentOutcome{kind: segmentUnknown}, nil
		}
		base, err := compilePath(x.get("base"))
		if err != nil {
			return segmentOutcome{}, err
		}
		passPromille, err := number(x.get("passPromille"), "passPromille")
		if err != nil {
			return segmentOutcome{}, err
		}
		return segmentOutcome{kind: segmentSplit, base: base, passPromille: passPromille}, nil
	}
	return segmentOutcome{kind: segmentUnknown}, nil
}

func compileCondition(v any) (condition, error) {
	tuple, ok := v.([]any)
	if !ok || len(tuple) < 2 {
		return condition{}, errors.New("condition is not a list of two or more items")
	}

	var cond condition
	switch lhs := tuple[0].(type) {
	case []any:
		cond.lhs = lhsEntity
		cond.path = make([]string, len(lhs))
		for i, step := range lhs {
			cond.path[i] = toString(plain(step))
		}
	case string:
		if lhs == "segment" {
			cond.lhs = lhsSegment
		} else {
			cond.lhs = lhsUnknown
		}
	default:
		cond.lhs = lhsUnknown
	}

	cmp, ok := tuple[1].(string)
	if !ok {
		return condition{}, errors.New("comparator is not a string")
	}
	cond.cmp = comparator(cmp)

	var rhs any = undefined
	if len(tuple) > 2 {
		rhs = plain(tuple[2])
	}
	if len(tuple) > 3 && cond.cmp.supportsIgnoreCase() {
		switch options := tuple[3].(type) {
		case string:
			cond.ignoreCase = strings.Contains(options, "i")
		case *object:
			cond.ignoreCase = options.get("i") == any(true)
		}
	}
	// Segment ids are internal ids. The ignore-case option does not apply.
	if cond.ignoreCase && cond.lhs != lhsSegment {
		rhs = lower(rhs)
	}
	cond.rhs = rhs

	if list, ok := rhs.([]any); ok {
		set := make(map[string]struct{}, len(list))
		for _, item := range list {
			if s, ok := item.(string); ok {
				set[s] = struct{}{}
			}
		}
		if len(set) == len(list) {
			cond.rhsStrings = set
		}
	}

	if cond.cmp == cmpRegex || cond.cmp == cmpNotRegex {
		cond.regex = compileRegex(rhs)
	}
	return cond, nil
}

// compileRegex compiles a regex rhs with ECMAScript syntax. It returns nil
// when the rhs is not a regex or the pattern is not valid. The condition then
// never matches, as in the Node.js client.
func compileRegex(rhs any) *regexp2.Regexp {
	obj, ok := rhs.(map[string]any)
	if !ok || obj["type"] != "regex" {
		return nil
	}
	pattern, ok := obj["pattern"].(string)
	if !ok {
		return nil
	}
	flags, ok := obj["flags"].(string)
	if !ok {
		return nil
	}

	options := regexp2.RegexOptions(regexp2.ECMAScript)
	seen := map[rune]bool{}
	for _, flag := range flags {
		// The global and sticky flags only change where a search starts. A
		// condition always searches the full input.
		if flag == 'g' || flag == 'y' {
			continue
		}
		if seen[flag] {
			return nil
		}
		seen[flag] = true
		switch flag {
		case 'i':
			options |= regexp2.IgnoreCase
		case 'm':
			options |= regexp2.Multiline
		case 's':
			options |= regexp2.Singleline
		case 'u':
			options |= regexp2.Unicode
		case 'd':
		default:
			return nil
		}
	}

	if !seen['u'] {
		pattern = dropPropertyEscapes(pattern)
	}
	re, err := regexp2.Compile(pattern, options)
	if err != nil {
		return nil
	}
	re.MatchTimeout = regexMatchTimeout
	return re
}

// dropPropertyEscapes changes `\p` to `p` and `\P` to `P`. Without the unicode
// flag, ECMAScript reads these escapes as the letters, not as a Unicode
// property class.
func dropPropertyEscapes(pattern string) string {
	if !strings.Contains(pattern, `\p`) && !strings.Contains(pattern, `\P`) {
		return pattern
	}
	var out strings.Builder
	for i := 0; i < len(pattern); i++ {
		if pattern[i] == '\\' && i+1 < len(pattern) {
			i++
			if pattern[i] != 'p' && pattern[i] != 'P' {
				out.WriteByte('\\')
			}
		}
		out.WriteByte(pattern[i])
	}
	return out.String()
}

func compilePath(v any) ([]string, error) {
	list, ok := v.([]any)
	if !ok {
		return nil, errors.New("base is not a list")
	}
	path := make([]string, len(list))
	for i, step := range list {
		path[i] = toString(plain(step))
	}
	return path, nil
}

func number(v any, name string) (float64, error) {
	f, ok := v.(float64)
	if !ok {
		return 0, fmt.Errorf("%s is not a number", name)
	}
	return f, nil
}

func numbers(v any, name string) ([]float64, error) {
	list, ok := v.([]any)
	if !ok {
		return nil, fmt.Errorf("%s is not a list", name)
	}
	out := make([]float64, len(list))
	for i, item := range list {
		f, ok := item.(float64)
		if !ok {
			return nil, fmt.Errorf("%s has an item that is not a number", name)
		}
		out[i] = f
	}
	return out, nil
}
