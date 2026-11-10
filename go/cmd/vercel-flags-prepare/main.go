// Command vercel-flags-prepare fetches the flag definitions of a project at
// build time and writes them to a file. The program embeds the file and
// passes it to flags.WithEmbeddedDefinitions. The client then has definitions
// when Vercel Flags is not reachable at the start.
//
// It is the Go equivalent of the @vercel/prepare-flags-definitions package.
//
// Usage:
//
//	go run github.com/vercel/flags/go/cmd/vercel-flags-prepare [-o flags-definitions.json] [-v]
//
// The command reads the SDK keys and the VERCEL_OIDC_TOKEN from the
// environment.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
)

func main() {
	opts := defaultOptions()
	flag.StringVar(&opts.output, "o", defaultOutput, "path of the definitions file")
	verbose := flag.Bool("v", false, "print progress messages")
	flag.Parse()
	if *verbose {
		opts.logf = func(format string, args ...any) {
			fmt.Fprintf(os.Stderr, "vercel-flags-prepare: "+format+"\n", args...)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	entries, err := run(ctx, opts)
	if err != nil {
		fmt.Fprintln(os.Stderr, "vercel-flags-prepare:", err)
		os.Exit(1)
	}
	fmt.Printf("vercel-flags-prepare: wrote %d definitions to %s\n", entries, opts.output)
}
