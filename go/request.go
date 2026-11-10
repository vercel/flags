package flags

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
)

// The client reports one read of the flag definitions for each request, as
// the Node.js client does inside a Vercel request context. A Go program has
// no global request context, so the program marks each request with
// Middleware or NewRequestContext. An evaluation with a context that has no
// mark reports no read.

type requestKey struct{}

// requestScope identifies one request.
type requestScope struct {
	vercelID string
	host     string

	// first is the first client that reported a read for this request. Most
	// programs have one client, so this is the only field in use.
	first atomic.Pointer[Client]
	mu    sync.Mutex
	more  []*Client
}

// NewRequestContext returns a context that identifies one incoming request.
// Pass it to the evaluations of that request. The client then reports one
// read of the flag definitions for the request, which is how Vercel counts
// flag requests. The request r can be nil.
//
// A context that already identifies a request is returned as it is.
func NewRequestContext(ctx context.Context, r *http.Request) context.Context {
	if _, ok := ctx.Value(requestKey{}).(*requestScope); ok {
		return ctx
	}
	scope := &requestScope{}
	if r != nil {
		scope.vercelID = r.Header.Get("x-vercel-id")
		scope.host = r.Host
	}
	return context.WithValue(ctx, requestKey{}, scope)
}

// Middleware marks the context of each request with NewRequestContext.
//
//	http.ListenAndServe(":8080", flags.Middleware(mux))
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(NewRequestContext(r.Context(), r)))
	})
}

// claimRead returns the scope of the request in ctx when c did not report a
// read for that request yet. It returns nil in all other cases.
func (c *Client) claimRead(ctx context.Context) *requestScope {
	scope, _ := ctx.Value(requestKey{}).(*requestScope)
	if scope == nil {
		return nil
	}
	if first := scope.first.Load(); first == c {
		return nil
	} else if first == nil && scope.first.CompareAndSwap(nil, c) {
		return scope
	}
	if scope.first.Load() == c {
		return nil
	}

	// A second client in the same request.
	scope.mu.Lock()
	defer scope.mu.Unlock()
	for _, client := range scope.more {
		if client == c {
			return nil
		}
	}
	scope.more = append(scope.more, c)
	return scope
}
