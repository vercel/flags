package flags

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"time"
)

// Datafile is one immutable version of the flag definitions of a project
// environment. The client receives datafiles from Vercel Flags and evaluates
// flags against the newest one.
//
// A Datafile is safe for concurrent use.
type Datafile struct {
	// ProjectID is the Vercel project that owns the flags.
	ProjectID string
	// Environment is the environment that the flags are evaluated for.
	Environment string
	// Revision is the version number of the data. It is 0 when unknown.
	Revision int64
	// ConfigUpdatedAt is the time of the last change to the flags, as Unix
	// epoch milliseconds. It is 0 when unknown.
	ConfigUpdatedAt int64
	// Digest is a hash of the data. It can be empty.
	Digest string
	// FetchedAt is the time at which the client received the data. It is the
	// zero time when unknown.
	FetchedAt time.Time

	hasRevision bool
	definitions map[string]*definition
	invalid     map[string]error
	segments    map[string]*segment
	raw         json.RawMessage
}

// ParseDatafile parses the JSON form of a datafile, as the endpoint
// GET /v1/datafile returns it.
//
// A flag definition that does not have the expected form does not make the
// datafile invalid. Only the evaluation of that flag fails.
func ParseDatafile(data []byte) (*Datafile, error) {
	root, err := decodeJSON(data)
	if err != nil {
		return nil, fmt.Errorf("flags: parse datafile: %w", err)
	}
	obj, ok := root.(*object)
	if !ok {
		return nil, errors.New("flags: parse datafile: not a JSON object")
	}

	df := &Datafile{
		definitions: map[string]*definition{},
		invalid:     map[string]error{},
		segments:    map[string]*segment{},
		raw:         append(json.RawMessage(nil), data...),
	}
	df.ProjectID, _ = obj.get("projectId").(string)
	df.Environment, _ = obj.get("environment").(string)
	df.Digest, _ = obj.get("digest").(string)
	if revision, ok := obj.get("revision").(float64); ok {
		df.Revision = int64(revision)
		df.hasRevision = true
	}
	// Some older responses have a string here.
	switch updatedAt := obj.get("configUpdatedAt").(type) {
	case float64:
		df.ConfigUpdatedAt = int64(updatedAt)
	case string:
		df.ConfigUpdatedAt, _ = strconv.ParseInt(updatedAt, 10, 64)
	}
	if fetchedAt, ok := obj.get("fetchedAt").(float64); ok && fetchedAt > 0 {
		df.FetchedAt = time.UnixMilli(int64(fetchedAt))
	}

	definitions, ok := obj.get("definitions").(*object)
	if !ok {
		return nil, errors.New("flags: parse datafile: definitions is not an object")
	}
	for _, key := range definitions.keys {
		def, err := compileDefinition(definitions.values[key])
		if err != nil {
			df.invalid[key] = err
			continue
		}
		df.definitions[key] = def
	}

	switch segments := obj.get("segments").(type) {
	case undefinedValue, nil:
	case *object:
		df.segments = compileSegments(segments)
	default:
		return nil, errors.New("flags: parse datafile: segments is not an object")
	}
	return df, nil
}

func compileSegments(obj *object) map[string]*segment {
	segments := make(map[string]*segment, len(obj.keys))
	for _, id := range obj.keys {
		seg, err := compileSegment(obj.values[id])
		if err != nil {
			seg = &segment{invalid: err}
		}
		segments[id] = seg
	}
	return segments
}

// Keys returns the keys of all flags in the datafile, in sorted order.
func (d *Datafile) Keys() []string {
	keys := make([]string, 0, len(d.definitions)+len(d.invalid))
	for key := range d.definitions {
		keys = append(keys, key)
	}
	for key := range d.invalid {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// MarshalJSON returns the JSON that the datafile was parsed from. Use it to
// store a datafile, for example as a fallback for the next start.
func (d Datafile) MarshalJSON() ([]byte, error) {
	if d.raw == nil {
		return []byte("null"), nil
	}
	return d.raw, nil
}

// UnmarshalJSON parses the JSON form of a datafile.
func (d *Datafile) UnmarshalJSON(data []byte) error {
	parsed, err := ParseDatafile(data)
	if err != nil {
		return err
	}
	*d = *parsed
	return nil
}

// Evaluate evaluates one flag for the given entities at the given time. It
// needs no client and no network.
//
// The error is not nil when the flag does not exist or the evaluation failed.
// The Evaluation then has ReasonError and no value.
func (d *Datafile) Evaluate(key string, entities Entities, now time.Time) (Evaluation, error) {
	return d.evaluate(key, entities, now, time.Local, nil)
}

func (d *Datafile) evaluate(key string, entities Entities, now time.Time, location *time.Location, cache entityCache) (Evaluation, error) {
	def, ok := d.definitions[key]
	if !ok {
		if err, invalid := d.invalid[key]; invalid {
			return errorEvaluation(key, fmt.Errorf("%w: %q: %v", ErrInvalidDefinition, key, err))
		}
		return errorEvaluation(key, fmt.Errorf("%w: %q", ErrFlagNotFound, key))
	}

	var input any
	if entities != nil {
		input = map[string]any(entities)
	}
	result, err := evaluate(&evalInput{
		definition:  def,
		environment: d.Environment,
		segments:    d.segments,
		entities:    input,
		now:         float64(now.UnixMilli()),
		location:    location,
		cache:       cache,
	})
	if err != nil {
		return errorEvaluation(key, err)
	}
	if result.reason == ReasonError {
		return errorEvaluation(key, fmt.Errorf("%w: %s", errEvaluation, result.errorMessage))
	}

	evaluation := Evaluation{
		Key:         key,
		Value:       cloneValue(result.value),
		Reason:      result.reason,
		OutcomeType: result.outcomeType,
		Experiment:  result.experiment,
	}
	if result.variantID != nil {
		evaluation.VariantID = *result.variantID
	}
	return evaluation, nil
}

// cloneValue returns a copy of a variant value. All evaluations share the
// datafile, so a caller must not get a map or a list that belongs to it.
func cloneValue(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for key, item := range x {
			out[key] = cloneValue(item)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = cloneValue(item)
		}
		return out
	}
	return v
}

func errorEvaluation(key string, err error) (Evaluation, error) {
	return Evaluation{Key: key, Reason: ReasonError, Err: err}, err
}
