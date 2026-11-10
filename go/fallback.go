package flags

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/vercel/flags/go/internal/embedded"
)

// Embedded definitions are the fallback for a start with no network. The
// vercel-flags-prepare command fetches the definitions at build time and
// writes them to a file, and the program embeds the file. The Node.js client
// has the same mechanism with the @vercel/flags-definitions module.

// FallbackDatafile returns the embedded definitions for this client.
//
// The error is ErrFallbackNotFound when the client has no embedded
// definitions, and ErrFallbackEntryNotFound when they have no entry for the
// SDK key or the project of the client.
func (c *Client) FallbackDatafile(ctx context.Context) (*Datafile, error) {
	c.fallbackOnce.Do(func() {
		c.fallback, c.fallbackErr = c.readFallback(ctx)
	})
	return c.fallback, c.fallbackErr
}

func (c *Client) readFallback(ctx context.Context) (*Datafile, error) {
	if len(c.cfg.embedded) == 0 {
		return nil, ErrFallbackNotFound
	}
	var file embedded.File
	if err := json.Unmarshal(c.cfg.embedded, &file); err != nil {
		return nil, fmt.Errorf("flags: read embedded definitions: %w", err)
	}

	keys, err := c.fallbackKeys(ctx)
	if err != nil {
		return nil, fmt.Errorf("flags: read embedded definitions: %w", err)
	}
	for _, key := range keys {
		if raw, ok := file.Definitions[key]; ok {
			return ParseDatafile(raw)
		}
	}
	return nil, ErrFallbackEntryNotFound
}

// fallbackKeys returns the keys under which the embedded definitions can
// hold the datafile of this client.
func (c *Client) fallbackKeys(ctx context.Context) ([]string, error) {
	if c.creds.sdkKey != "" {
		return []string{embedded.HashSDKKey(c.creds.sdkKey), c.creds.sdkKey}, nil
	}
	if c.creds.projectID != "" {
		return []string{c.creds.projectID}, nil
	}
	// The OIDC token belongs to the project of this deployment.
	if projectID := os.Getenv("VERCEL_PROJECT_ID"); projectID != "" {
		return []string{projectID}, nil
	}
	token, err := c.creds.token(ctx)
	if err != nil {
		return nil, err
	}
	projectID, err := embedded.ProjectIDFromOIDCToken(token)
	if err != nil {
		return nil, err
	}
	return []string{projectID}, nil
}
