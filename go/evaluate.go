package flags

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/vercel/flags/go/internal/js"
	"github.com/vercel/flags/go/internal/xxh32"
)

// This file is the Go port of packages/vercel-flags-core/src/evaluate.ts. The
// two files must give the same result for the same input. Change both files
// together.

// maxSegmentDepth stops a segment that refers to itself.
const maxSegmentDepth = 64

// errEvaluation marks the errors for which the Node.js evaluator throws.
var errEvaluation = errors.New("flags: evaluation failed")

func evalErrorf(format string, args ...any) error {
	return fmt.Errorf("%w: %s", errEvaluation, fmt.Sprintf(format, args...))
}

type evalInput struct {
	definition  *definition
	environment string
	segments    map[string]*segment
	entities    any
	// now is the time of the evaluation as Unix epoch milliseconds.
	now float64
	// location is the time zone of a date string that has no offset.
	location *time.Location
	// cache holds converted entities. It can be nil. Evaluations of many
	// flags for the same entities share one cache.
	cache entityCache
}

// entityCache holds the entities that needed a conversion to the JSON data
// model, by entity kind. A struct is then converted one time for an
// evaluation call, not one time for each condition.
type entityCache map[string]any

// evalResult is the result of the pure evaluator. It has the same fields as
// the EvaluationResult type of the Node.js client.
type evalResult struct {
	value        any
	variantID    *string
	reason       Reason
	outcomeType  OutcomeType
	experiment   *ExperimentAssignment
	errorMessage string
}

type evaluator struct {
	*evalInput
	segmentDepth int
}

// evaluate evaluates one flag definition. It returns an error for a
// definition that must not exist, such as a variant index out of range. In
// those cases the Node.js evaluator throws.
func evaluate(in *evalInput) (evalResult, error) {
	e := &evaluator{evalInput: in}
	environment := in.environment
	var visited map[string]struct{}

	for {
		// The config is nil when the environment is missing or null.
		env := in.definition.environments[environment]
		if env == nil {
			return evalResult{
				reason:       ReasonError,
				errorMessage: fmt.Sprintf("Could not find envConfig for %q", environment),
			}, nil
		}

		switch env.kind {
		case envPaused:
			return e.handleOutcome(env.paused, "", ReasonPaused)

		case envReuse:
			if _, ok := in.definition.environments[env.reuse]; !ok {
				return evalResult{}, evalErrorf("could not find environment %q when reusing", env.reuse)
			}
			if _, seen := visited[env.reuse]; seen {
				return evalResult{
					reason:       ReasonError,
					errorMessage: fmt.Sprintf("Circular environment reuse detected: %q", env.reuse),
				}, nil
			}
			if visited == nil {
				visited = map[string]struct{}{}
			}
			visited[environment] = struct{}{}
			environment = env.reuse
			continue
		}

		for index, targets := range env.targets {
			matched, err := e.matchTargetList(targets)
			if err != nil {
				return evalResult{}, err
			}
			if matched {
				variant := &outcome{kind: outcomeVariant, variant: float64(index)}
				return e.handleOutcome(variant, AssignmentTargeted, ReasonTargetMatch)
			}
		}

		for i := range env.rules {
			matched, err := e.matchConditions(env.rules[i].conditions)
			if err != nil {
				return evalResult{}, err
			}
			if matched {
				return e.handleOutcome(env.rules[i].outcome, "", ReasonRuleMatch)
			}
		}

		return e.handleOutcome(env.fallthroughOutcome, "", ReasonFallthrough)
	}
}

// access reads the value at path from the entities. A missing step gives
// undefined. A step through a string, a number or true is an error, because
// the JavaScript `in` operator throws for those values.
func (e *evaluator) access(path []string) (any, error) {
	acc := normalize(e.entities)
	for depth, key := range path {
		if !truthy(acc) {
			acc = undefined
			continue
		}
		switch x := acc.(type) {
		case map[string]any:
			value, ok := x[key]
			if !ok {
				acc = undefined
				continue
			}
			if depth == 0 {
				acc = e.entity(key, value)
			} else {
				acc = normalize(value)
			}
		case []any:
			if index, ok := arrayIndex(key, len(x)); ok {
				acc = normalize(x[index])
			} else if key == "length" {
				acc = float64(len(x))
			} else {
				acc = undefined
			}
		default:
			return nil, evalErrorf("cannot read %q of a %T entity value", key, acc)
		}
	}
	return normalizeDeep(acc), nil
}

// entity returns the entity of one kind in the JSON data model.
func (e *evaluator) entity(kind string, value any) any {
	switch value.(type) {
	case nil, map[string]any, string, bool, float64, []any:
		return value
	}
	if converted, ok := e.cache[kind]; ok {
		return converted
	}
	converted := normalize(value)
	if e.cache == nil {
		e.cache = entityCache{}
	}
	e.cache[kind] = converted
	return converted
}

func (e *evaluator) matchTargetList(targets targetList) (bool, error) {
	for i := range targets {
		value, err := e.access(targets[i].path[:])
		if err != nil {
			return false, err
		}
		if s, ok := value.(string); ok {
			if _, found := targets[i].values[s]; found {
				return true, nil
			}
		}
	}
	return false, nil
}

func (e *evaluator) matchSegment(seg *segment) (bool, error) {
	if seg.invalid != nil {
		return false, evalErrorf("invalid segment: %v", seg.invalid)
	}
	if e.segmentDepth >= maxSegmentDepth {
		return false, evalErrorf("segments are nested more than %d levels", maxSegmentDepth)
	}
	e.segmentDepth++
	defer func() { e.segmentDepth-- }()

	if matched, err := e.matchTargetList(seg.include); matched || err != nil {
		return matched, err
	}
	if matched, err := e.matchTargetList(seg.exclude); matched || err != nil {
		return false, err
	}
	for i := range seg.rules {
		matched, err := e.matchConditions(seg.rules[i].conditions)
		if err != nil {
			return false, err
		}
		if matched {
			return e.handleSegmentOutcome(seg.rules[i].outcome)
		}
	}
	return false, nil
}

func (e *evaluator) handleSegmentOutcome(out segmentOutcome) (bool, error) {
	switch out.kind {
	case segmentAll:
		return true, nil
	case segmentSplit:
		lhs, err := e.access(out.base)
		if err != nil {
			return false, err
		}
		unit, ok := lhs.(string)
		if !ok {
			return false, nil
		}
		if out.passPromille <= 0 {
			return false, nil
		}
		if out.passPromille >= promilleScale {
			return true, nil
		}
		bucket := float64(xxh32.StringJS(unit, e.definition.seed))
		return bucket < boundaryFor(out.passPromille, promilleScale), nil
	}
	return false, evalErrorf("segment outcome type is not supported")
}

func (e *evaluator) matchSegmentCondition(cond *condition) (bool, error) {
	lookup := func(id any) (*segment, bool) {
		seg, ok := e.segments[toString(id)]
		return seg, ok && seg != nil
	}

	switch cond.cmp {
	case cmpEq, cmpNotEq:
		seg, ok := lookup(cond.rhs)
		if !ok {
			return false, nil
		}
		matched, err := e.matchSegment(seg)
		if err != nil {
			return false, err
		}
		return matched == (cond.cmp == cmpEq), nil

	case cmpOneOf:
		ids, ok := cond.rhs.([]any)
		if !ok {
			return false, nil
		}
		for _, id := range ids {
			seg, ok := lookup(id)
			if !ok {
				continue
			}
			matched, err := e.matchSegment(seg)
			if matched || err != nil {
				return matched, err
			}
		}
		return false, nil

	case cmpNotOneOf:
		ids, ok := cond.rhs.([]any)
		if !ok {
			return false, evalErrorf("segment condition %q needs a list", cond.cmp)
		}
		for _, id := range ids {
			seg, ok := lookup(id)
			if !ok {
				return false, nil
			}
			matched, err := e.matchSegment(seg)
			if matched || err != nil {
				return false, err
			}
		}
		return true, nil
	}
	return false, evalErrorf("comparator %q is not implemented for segments", cond.cmp)
}

func (e *evaluator) matchConditions(conditions []condition) (bool, error) {
	for i := range conditions {
		matched, err := e.matchCondition(&conditions[i])
		if !matched || err != nil {
			return false, err
		}
	}
	return true, nil
}

func (e *evaluator) matchCondition(cond *condition) (bool, error) {
	switch cond.lhs {
	case lhsSegment:
		if !truthy(cond.rhs) {
			return false, nil
		}
		return e.matchSegmentCondition(cond)
	case lhsUnknown:
		return false, evalErrorf("condition accessor is not implemented")
	}

	lhs, err := e.access(cond.path)
	if err != nil {
		return false, err
	}
	if cond.ignoreCase {
		lhs = lower(lhs)
	}
	return e.compare(cond, lhs), nil
}

// compare applies the comparator of cond to the entity value lhs. It never
// fails: a value of the wrong type does not match.
func (e *evaluator) compare(cond *condition, lhs any) bool {
	rhs := cond.rhs

	switch cond.cmp {
	case cmpEq:
		return strictEquals(lhs, rhs)
	case cmpNotEq:
		return !strictEquals(lhs, rhs)

	case cmpOneOf:
		list, ok := rhs.([]any)
		return ok && includes(list, lhs)
	case cmpNotOneOf:
		// A missing value does not match the rule.
		list, ok := rhs.([]any)
		return ok && lhs != any(undefined) && !includes(list, lhs)

	case cmpContainsAllOf:
		return containsAllOf(lhs, rhs)
	case cmpContainsAnyOf:
		lhsList, lok := lhs.([]any)
		rhsList, rok := rhs.([]any)
		if !lok || !rok {
			return false
		}
		for _, item := range lhsList {
			if cond.rhsContains(rhsList, item) {
				return true
			}
		}
		return false
	case cmpContainsNoneOf:
		rhsList, ok := rhs.([]any)
		if !ok {
			return false
		}
		// A value that is not a list contains none of the values.
		lhsList, ok := lhs.([]any)
		if !ok {
			return true
		}
		for _, item := range lhsList {
			if cond.rhsContains(rhsList, item) {
				return false
			}
		}
		return true

	case cmpStartsWith, cmpNotStartsWith, cmpEndsWith, cmpNotEndsWith, cmpContains, cmpNotContains:
		l, lok := lhs.(string)
		r, rok := rhs.(string)
		if !lok || !rok {
			return false
		}
		switch cond.cmp {
		case cmpStartsWith:
			return strings.HasPrefix(l, r)
		case cmpNotStartsWith:
			return !strings.HasPrefix(l, r)
		case cmpEndsWith:
			return strings.HasSuffix(l, r)
		case cmpNotEndsWith:
			return !strings.HasSuffix(l, r)
		case cmpContains:
			return strings.Contains(l, r)
		default:
			return !strings.Contains(l, r)
		}

	case cmpExists:
		return lhs != any(undefined) && lhs != nil
	case cmpNotExists:
		return lhs == any(undefined) || lhs == nil

	case cmpGt, cmpGte, cmpLt, cmpLte:
		if lhs == any(undefined) || lhs == nil {
			return false
		}
		switch rhs.(type) {
		case float64, string:
		default:
			return false
		}
		rel := compare(lhs, rhs)
		switch cond.cmp {
		case cmpGt:
			return rel == greater
		case cmpGte:
			return rel == greater || rel == equal
		case cmpLt:
			return rel == less
		default:
			return rel == less || rel == equal
		}

	case cmpRegex, cmpNotRegex:
		input, ok := lhs.(string)
		if !ok || cond.regex == nil || js.UTF16Len(input) > maxRegexInputLength {
			return false
		}
		matched, err := cond.regex.MatchString(input)
		if err != nil {
			return false
		}
		return matched == (cond.cmp == cmpRegex)

	case cmpBefore, cmpAfter:
		l, lok := lhs.(string)
		r, rok := rhs.(string)
		if !lok || !rok {
			return false
		}
		a, aok := js.ParseDate(l, e.location)
		b, bok := js.ParseDate(r, e.location)
		if !aok || !bok {
			return false
		}
		if cond.cmp == cmpBefore {
			return a < b
		}
		return a > b
	}

	// An unknown comparator does not match.
	return false
}

// rhsContains reports whether the rhs list contains item.
func (c *condition) rhsContains(rhsList []any, item any) bool {
	if c.rhsStrings != nil {
		s, ok := item.(string)
		if !ok {
			return false
		}
		_, found := c.rhsStrings[s]
		return found
	}
	return includes(rhsList, item)
}

func containsAllOf(lhs, rhs any) bool {
	lhsList, lok := lhs.([]any)
	rhsList, rok := rhs.([]any)
	if !lok || !rok {
		return false
	}

	// When each item of lhs is a different string, the items of rhs that are
	// not strings are ignored. The Node.js client has this behavior.
	set := make(map[string]struct{}, len(lhsList))
	for _, item := range lhsList {
		if s, ok := item.(string); ok {
			set[s] = struct{}{}
		}
	}
	if len(set) == len(lhsList) {
		for _, item := range rhsList {
			if s, ok := item.(string); ok {
				if _, found := set[s]; !found {
					return false
				}
			}
		}
		return true
	}

	for _, item := range rhsList {
		if !includes(lhsList, item) {
			return false
		}
	}
	return true
}

type variant struct {
	value any
	id    *string
}

func (e *evaluator) variant(index float64) (variant, error) {
	variants := e.definition.variants
	i := int(index)
	if index < 0 || index >= float64(len(variants)) || float64(i) != index {
		return variant{}, evalErrorf("invalid variant index %v, the definition has %d variants", index, len(variants))
	}
	v := variant{value: variants[i]}
	if i < len(e.definition.variantIDs) {
		v.id = e.definition.variantIDs[i]
	}
	return v, nil
}

// weightedVariantIndex returns the variant of a split for the unit at base.
func (e *evaluator) weightedVariantIndex(base []string, boundaries []float64, defaultVariant float64) (float64, error) {
	lhs, err := e.access(base)
	if err != nil {
		return 0, err
	}
	unit, ok := lhs.(string)
	if !ok {
		return defaultVariant, nil
	}
	bucket := float64(xxh32.StringJS(unit, e.definition.seed))
	for index, boundary := range boundaries {
		if bucket < boundary {
			return float64(index), nil
		}
	}
	// Only when the weights sum to 0.
	return defaultVariant, nil
}

func (e *evaluator) resolveOutcome(out *outcome) (variant, OutcomeType, AssignmentReason, error) {
	switch out.kind {
	case outcomeVariant:
		v, err := e.variant(out.variant)
		return v, OutcomeValue, AssignmentVariant, err

	case outcomeSplit:
		index, err := e.weightedVariantIndex(out.base, out.boundaries, out.defaultVariant)
		if err != nil {
			return variant{}, "", "", err
		}
		v, err := e.variant(index)
		return v, OutcomeSplit, AssignmentSplit, err

	case outcomeExperiment:
		v, reason, err := e.resolveExperiment()
		return v, OutcomeExperiment, reason, err

	case outcomeRollout:
		v, err := e.resolveRollout(out)
		return v, OutcomeRollout, AssignmentRollout, err
	}
	return variant{}, "", "", evalErrorf("outcome type is not supported")
}

func (e *evaluator) resolveExperiment() (variant, AssignmentReason, error) {
	exp := e.definition.experiment
	if exp == nil {
		return variant{}, "", evalErrorf("experiment not found")
	}

	lhs, err := e.access(exp.base)
	if err != nil {
		return variant{}, "", err
	}
	defaultVariant, err := e.variant(exp.defaultVariant)
	if err != nil {
		return variant{}, "", err
	}
	unit, ok := lhs.(string)
	if !ok {
		return defaultVariant, AssignmentNotEnrolled, nil
	}

	ramp := 100.0
	if exp.rampPercentage != nil {
		ramp = *exp.rampPercentage
	}
	enrolled := ramp >= 100 ||
		(ramp > 0 && float64(xxh32.StringJS(unit, exp.enrollmentSeed)) < boundaryFor(ramp, 100))
	if !enrolled {
		return defaultVariant, AssignmentNotEnrolled, nil
	}

	index, err := e.weightedVariantIndex(exp.base, exp.boundaries, exp.defaultVariant)
	if err != nil {
		return variant{}, "", err
	}
	v, err := e.variant(index)
	return v, AssignmentExperiment, err
}

func (e *evaluator) resolveRollout(out *outcome) (variant, error) {
	lhs, err := e.access(out.base)
	if err != nil {
		return variant{}, err
	}
	defaultVariant, err := e.variant(out.defaultVariant)
	if err != nil {
		return variant{}, err
	}
	unit, ok := lhs.(string)
	if !ok {
		return defaultVariant, nil
	}

	rollFrom, err := e.variant(out.rollFromVariant)
	if err != nil {
		return variant{}, err
	}
	elapsed := e.now - out.startTimestamp
	if elapsed < 0 || len(out.slots) == 0 {
		return rollFrom, nil
	}

	// Each slot is served for its duration. After the last slot, the rollout
	// stays at finalPromille.
	promille := out.finalPromille
	cumulative := 0.0
	for _, slot := range out.slots {
		cumulative += slot[1]
		if cumulative > elapsed {
			promille = slot[0]
			break
		}
	}

	if promille <= 0 {
		return rollFrom, nil
	}
	rollTo, err := e.variant(out.rollToVariant)
	if err != nil {
		return variant{}, err
	}
	if promille >= promilleScale {
		return rollTo, nil
	}

	// The variant with the lower index takes the low buckets. This is the
	// same assignment as the split {rollFrom: scale - p, rollTo: p}, so a flag
	// can change between a split and a rollout and keep each unit in place.
	bucket := float64(xxh32.StringJS(unit, e.definition.seed))
	if out.rollToVariant < out.rollFromVariant {
		if bucket < boundaryFor(promille, promilleScale) {
			return rollTo, nil
		}
		return rollFrom, nil
	}
	if bucket < boundaryFor(promilleScale-promille, promilleScale) {
		return rollFrom, nil
	}
	return rollTo, nil
}

// handleOutcome resolves an outcome and adds the experiment data. A non-empty
// assignmentReason replaces the reason that the outcome type gives.
func (e *evaluator) handleOutcome(out *outcome, assignmentReason AssignmentReason, reason Reason) (evalResult, error) {
	v, outcomeType, outcomeReason, err := e.resolveOutcome(out)
	if err != nil {
		return evalResult{}, err
	}
	result := evalResult{
		value:       v.value,
		variantID:   v.id,
		reason:      reason,
		outcomeType: outcomeType,
	}

	exp := e.definition.experiment
	if exp == nil || v.id == nil {
		return result, nil
	}
	if assignmentReason == "" || out.kind == outcomeExperiment {
		assignmentReason = outcomeReason
	}
	result.experiment = &ExperimentAssignment{
		ID:               exp.id,
		VariantID:        *v.id,
		Base:             slices.Clone(exp.base),
		AssignmentReason: assignmentReason,
		rawBase:          exp.rawBase,
	}
	if exp.rampID != nil {
		result.experiment.RampID = *exp.rampID
	}
	if exp.rampPercentage != nil {
		pct := *exp.rampPercentage
		result.experiment.RampPercentage = &pct
	}
	return result, nil
}
