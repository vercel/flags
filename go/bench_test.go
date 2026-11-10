package flags

import (
	"context"
	"testing"
	"time"
)

func benchmarkClient(b *testing.B, opts ...Option) *Client {
	b.Helper()
	df, err := ParseDatafile([]byte(testDatafile(1, true)))
	if err != nil {
		b.Fatal(err)
	}
	client, err := NewClient(testSDKKey, append([]Option{WithDatafile(df), WithLogger(nil)}, opts...)...)
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()
		_ = client.Shutdown(ctx)
	})
	return client
}

var benchEntities = Entities{"user": map[string]any{"id": "u_123", "plan": "pro"}}

// BenchmarkEvaluate is the pure evaluator with no client.
func BenchmarkEvaluate(b *testing.B) {
	df, _ := ParseDatafile([]byte(testDatafile(1, true)))
	now := time.Now()
	b.ReportAllocs()
	for b.Loop() {
		_, _ = df.Evaluate("color", benchEntities, now)
	}
}

// BenchmarkClient is one evaluation through the client, with usage reporting.
// The base URL is not reachable, so the benchmark sends nothing.
func BenchmarkClient(b *testing.B) {
	client := benchmarkClient(b, WithoutStreaming(), WithoutPolling(), WithBaseURL("http://127.0.0.1:1"))
	ctx := context.Background()
	b.ReportAllocs()
	for b.Loop() {
		_, _ = client.String(ctx, "color", "", benchEntities)
	}
}

// BenchmarkClientParallel shows that evaluations on many cores do not wait
// for each other.
func BenchmarkClientParallel(b *testing.B) {
	client := benchmarkClient(b, WithoutStreaming(), WithoutPolling(), WithBaseURL("http://127.0.0.1:1"))
	ctx := context.Background()
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = client.String(ctx, "color", "", benchEntities)
		}
	})
}

// BenchmarkClientRequest is one request with a read event and five
// evaluations.
func BenchmarkClientRequest(b *testing.B) {
	client := benchmarkClient(b, WithoutStreaming(), WithoutPolling(), WithBaseURL("http://127.0.0.1:1"))
	b.ReportAllocs()
	for b.Loop() {
		ctx := NewRequestContext(context.Background(), nil)
		for range 5 {
			_, _ = client.String(ctx, "color", "", benchEntities)
		}
	}
}
