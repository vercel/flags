package flags

import (
	"errors"
	"sync"
	"sync/atomic"
	"time"
)

// ErrStale means the sources of the client failed for longer than the
// stale-if-error time, so the client no longer serves its last definitions.
var ErrStale = errors.New("flags: flag definitions are stale")

// origin tells how the client received a datafile.
type origin int

const (
	originProvided origin = iota // WithDatafile
	originEmbedded               // WithEmbeddedDefinitions
	originStream
	originPoll
	originFetched // A fetch that is not part of polling.
)

// source returns the public name of the origin.
func (o origin) source() Source {
	switch o {
	case originEmbedded:
		return SourceEmbedded
	case originFetched:
		return SourceRemote
	}
	return SourceInMemory
}

// snapshot is the current datafile and what the client knows about its
// freshness. A snapshot does not change: each update makes a new one.
type snapshot struct {
	// datafile is nil before the first data.
	datafile *Datafile
	origin   origin
	// confirmedAt is the last time a source delivered or confirmed the
	// datafile. It is zero for a datafile whose age is unknown.
	confirmedAt time.Time
	// failingSince is the time of the first source failure after the last
	// success. It is zero when the sources work.
	failingSince time.Time
}

// store holds the current snapshot. A read is one atomic load, so evaluations
// on many cores do not wait for each other.
type store struct {
	// staleIfError is negative when there is no limit.
	staleIfError time.Duration

	mu      sync.Mutex // Serializes the writers.
	current atomic.Pointer[snapshot]
}

func newStore(staleIfError time.Duration) *store {
	s := &store{staleIfError: staleIfError}
	s.current.Store(&snapshot{})
	return s
}

func (s *store) load() *snapshot { return s.current.Load() }

func (s *store) change(fn func(*snapshot)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := *s.current.Load()
	fn(&next)
	s.current.Store(&next)
}

// seed sets the first datafile when the store is empty. Its age comes from
// the fetch time in the datafile, and is unknown when there is none. A seed
// is not evidence that a source works.
func (s *store) seed(df *Datafile, from origin) {
	s.change(func(snap *snapshot) {
		if snap.datafile == nil {
			snap.datafile, snap.origin, snap.confirmedAt = df, from, df.FetchedAt
		}
	})
}

// update stores a datafile from a source. It keeps the current datafile when
// that one is as new or newer. Each response of a source shows that the source
// works, so it resets the age and the failure in the two cases.
func (s *store) update(df *Datafile, now time.Time, from origin) (accepted bool) {
	s.change(func(snap *snapshot) {
		snap.confirmedAt, snap.failingSince = now, time.Time{}
		cur := snap.datafile
		if cur != nil && cur.ConfigUpdatedAt != 0 && df.ConfigUpdatedAt != 0 &&
			df.ConfigUpdatedAt <= cur.ConfigUpdatedAt {
			return
		}
		snap.datafile, snap.origin = df, from
		accepted = true
	})
	return accepted
}

// confirm records that a source confirmed the current datafile.
func (s *store) confirm(now time.Time) {
	s.change(func(snap *snapshot) {
		snap.confirmedAt, snap.failingSince = now, time.Time{}
	})
}

// fail records a source failure. Only the first failure after a success
// starts the stale-if-error time.
func (s *store) fail(now time.Time) {
	if !s.load().failingSince.IsZero() {
		return
	}
	s.change(func(snap *snapshot) {
		if snap.failingSince.IsZero() {
			snap.failingSince = now
		}
	})
}

// read returns the snapshot for an evaluation.
func (s *store) read(now time.Time) (*snapshot, error) {
	snap := s.load()
	if snap.datafile == nil {
		return nil, ErrNoData
	}
	if s.staleIfError >= 0 && !snap.failingSince.IsZero() && now.Sub(snap.failingSince) > s.staleIfError {
		return nil, ErrStale
	}
	return snap, nil
}
