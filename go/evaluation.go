package flags

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Errors that an evaluation can return. Use errors.Is to test for them.
var (
	// ErrFlagNotFound means the datafile has no flag with the given key.
	ErrFlagNotFound = errors.New("flags: flag not found")
	// ErrInvalidDefinition means the definition of the flag in the datafile
	// does not have the expected form.
	ErrInvalidDefinition = errors.New("flags: invalid flag definition")
	// ErrTypeMismatch means the value of the flag does not have the type that
	// the caller asked for.
	ErrTypeMismatch = errors.New("flags: flag value has a different type")
	// ErrNoData means the client has no flag definitions: no source gave a
	// datafile, and no fallback datafile is configured.
	ErrNoData = errors.New("flags: no flag definitions available")
	// ErrFallbackNotFound means the client has no embedded definitions: the
	// option WithEmbeddedDefinitions is not set.
	ErrFallbackNotFound = errors.New("flags: embedded definitions not found")
	// ErrFallbackEntryNotFound means the embedded definitions have no entry
	// for the SDK key or the project of the client.
	ErrFallbackEntryNotFound = errors.New("flags: no embedded definitions for this SDK key or project")
	// ErrClosed means the client is closed.
	ErrClosed = errors.New("flags: client is closed")
)

// Evaluation is the detailed result of the evaluation of one flag.
type Evaluation struct {
	// Key is the key of the flag.
	Key string
	// Value is the value of the selected variant in the JSON data model:
	// nil, bool, float64, string, []any or map[string]any. It is nil when the
	// evaluation failed. A map or a list is a copy that the caller owns.
	Value any
	// VariantID is the identifier of the selected variant. It is empty when
	// the variant has no identifier or the evaluation failed.
	VariantID string
	// Reason tells why the evaluation gave this value.
	Reason Reason
	// OutcomeType tells how the variant was selected. It is empty when the
	// evaluation failed.
	OutcomeType OutcomeType
	// Experiment describes the experiment linked to the flag. It is nil when
	// the flag has no experiment.
	Experiment *ExperimentAssignment
	// Err is the error of a failed evaluation. Reason is then ReasonError.
	Err error
	// Metrics tells how the client got the definitions for this evaluation.
	// It is the zero value for an evaluation with no client.
	Metrics Metrics
}

// Source tells where the definitions of an evaluation came from.
type Source string

const (
	// SourceInMemory means the stream, a poll or WithDatafile.
	SourceInMemory Source = "in-memory"
	// SourceEmbedded means the embedded definitions.
	SourceEmbedded Source = "embedded"
	// SourceRemote means a fetch for this read.
	SourceRemote Source = "remote"
)

// CacheStatus tells the state of the definitions at the time of a read.
type CacheStatus string

const (
	// CacheHit means the client had the definitions in memory.
	CacheHit CacheStatus = "HIT"
	// CacheMiss means the client had no definitions and loaded them.
	CacheMiss CacheStatus = "MISS"
	// CacheStale means the sources fail and the definitions are a fallback.
	CacheStale CacheStatus = "STALE"
)

// Metrics tells how the client got the definitions for one evaluation.
type Metrics struct {
	// ReadDuration is the time to get the definitions.
	ReadDuration time.Duration
	// EvaluationDuration is the time of the evaluation logic.
	EvaluationDuration time.Duration
	// Source tells where the definitions came from.
	Source Source
	// CacheStatus tells the state of the definitions.
	CacheStatus CacheStatus
	// Connected tells whether the stream was connected.
	Connected bool
	// Mode is the active source of the client.
	Mode Mode
}

// Decode stores the value in the value that target points to, with the rules
// of encoding/json. Use it for a flag with a JSON object or a list as value.
// When the value does not fit the target, the error wraps ErrTypeMismatch and
// the target can be partly written.
func (e Evaluation) Decode(target any) error {
	if e.Err != nil {
		return e.Err
	}
	data, err := json.Marshal(e.Value)
	if err != nil {
		return fmt.Errorf("%w: %q: %v", ErrTypeMismatch, e.Key, err)
	}
	if err := json.Unmarshal(data, target); err != nil {
		return fmt.Errorf("%w: %q: %v", ErrTypeMismatch, e.Key, err)
	}
	return nil
}

// describe names the JSON type of a value for an error message.
func describe(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case bool:
		return "a boolean"
	case float64:
		return "a number"
	case string:
		return "a string"
	case []any:
		return "a list"
	}
	return "an object"
}

// Entities is the evaluation context: the things that a flag is evaluated
// for. The keys are entity kinds such as "user" or "team". Each value is a map
// of the attributes of that entity.
//
//	flags.Entities{
//		"user": map[string]any{"id": "u_123", "plan": "pro"},
//		"team": map[string]any{"id": "t_456"},
//	}
//
// Attribute values can be strings, numbers, booleans, lists, maps and
// time.Time values. Other values, such as structs, take the form that
// encoding/json gives them.
type Entities map[string]any

// Reason tells why an evaluation gave its value.
type Reason string

const (
	// ReasonPaused means the flag is paused in the environment.
	ReasonPaused Reason = "paused"
	// ReasonTargetMatch means an entity is an explicit target of a variant.
	ReasonTargetMatch Reason = "target_match"
	// ReasonRuleMatch means the conditions of a rule matched.
	ReasonRuleMatch Reason = "rule_match"
	// ReasonFallthrough means no target and no rule matched.
	ReasonFallthrough Reason = "fallthrough"
	// ReasonError means the evaluation failed. The value is the default value.
	ReasonError Reason = "error"
)

// OutcomeType tells how the evaluation selected the variant.
type OutcomeType string

const (
	// OutcomeValue is one fixed variant.
	OutcomeValue OutcomeType = "value"
	// OutcomeSplit is a weighted split between variants.
	OutcomeSplit OutcomeType = "split"
	// OutcomeRollout is a progressive rollout from one variant to another.
	OutcomeRollout OutcomeType = "rollout"
	// OutcomeExperiment is an assignment by the experiment of the flag.
	OutcomeExperiment OutcomeType = "experiment"
)

// AssignmentReason tells how an evaluation of a flag with an experiment
// received its value.
type AssignmentReason string

const (
	AssignmentExperiment  AssignmentReason = "experiment"
	AssignmentNotEnrolled AssignmentReason = "not-enrolled"
	AssignmentTargeted    AssignmentReason = "targeted"
	AssignmentSplit       AssignmentReason = "split"
	AssignmentVariant     AssignmentReason = "variant"
	AssignmentRollout     AssignmentReason = "rollout"
)

// ExperimentAssignment describes the experiment that is linked to an
// evaluated flag.
type ExperimentAssignment struct {
	// ID is the experiment identifier.
	ID string
	// VariantID is the identifier of the selected variant.
	VariantID string
	// Base is the entity path that the assignment is based on, for example
	// ["user", "id"].
	Base []string
	// RampID is the identifier of the active ramp. It can be empty.
	RampID string
	// RampPercentage is the percentage of units in the ramp, from 0 to 100.
	// It is nil when the experiment has no ramp percentage.
	RampPercentage *float64
	// AssignmentReason tells how the evaluation received its value.
	AssignmentReason AssignmentReason

	// rawBase is Base as it is in the datafile. A step can be a number there.
	rawBase []any
}
