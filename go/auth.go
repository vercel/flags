package flags

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"

	"github.com/vercel/flags/go/internal/embedded"
)

// ErrUnauthorized means Vercel Flags rejected the credentials, or no
// credentials are available. The client does not retry such a request.
var ErrUnauthorized = errors.New("flags: unauthorized")

// TokenSource returns a Vercel OIDC token. The client calls it before each
// request, so it can return a new token when the old one expires.
type TokenSource func(ctx context.Context) (string, error)

const (
	// sourceProjectHeader names the project whose flags are read when it is
	// not the project that the OIDC token belongs to.
	sourceProjectHeader = "X-Vercel-Flags-Project-Id"
	// evaluatingTokenHeader carries the OIDC token of the project that
	// evaluates flags with the SDK key of another project.
	evaluatingTokenHeader = "X-Vercel-Flags-OIDC-Token"

	oidcTokenEnv = "VERCEL_OIDC_TOKEN"
)

// credentials authenticate the requests of a client. A client uses an SDK
// key, or an OIDC token when it has no SDK key.
type credentials struct {
	sdkKey string
	// oidc returns the OIDC token of this deployment. It is never nil.
	oidc TokenSource
	// projectID is set to read the flags of another project with the OIDC
	// token of this project.
	projectID string
}

func newCredentials(sdkKey string, cfg *config) (*credentials, error) {
	if cfg.projectID != "" {
		if !embedded.IsProjectID(cfg.projectID) {
			return nil, fmt.Errorf("flags: invalid project id %q: expected an id like \"prj_...\" (letters, digits and underscores, up to 64 characters)", cfg.projectID)
		}
		if sdkKey != "" {
			return nil, errors.New("flags: a project id cannot be combined with an SDK key: connected projects are read with the OIDC token of this deployment")
		}
	}

	creds := &credentials{oidc: cfg.tokenSource, projectID: cfg.projectID}
	hasTokenSource := creds.oidc != nil
	if !hasTokenSource {
		creds.oidc = envTokenSource
	}

	if sdkKey == "" && cfg.projectID == "" && !hasTokenSource {
		sdkKey = os.Getenv("FLAGS")
	}
	if sdkKey != "" {
		key, ok := embedded.ParseSDKKey(sdkKey)
		if !ok {
			return nil, errors.New("flags: invalid SDK key: expected \"vf_server_...\" or a \"flags:\" connection string")
		}
		creds.sdkKey = key
		return creds, nil
	}

	// An offline client makes no request, so it needs no credentials.
	if !cfg.offline && !hasTokenSource && os.Getenv(oidcTokenEnv) == "" {
		return nil, fmt.Errorf("%w: no SDK key and no OIDC token: pass an SDK key, set the FLAGS environment variable, or use WithTokenSource", ErrUnauthorized)
	}
	return creds, nil
}

func envTokenSource(context.Context) (string, error) {
	if token := os.Getenv(oidcTokenEnv); token != "" {
		return token, nil
	}
	return "", fmt.Errorf("%w: the %s environment variable is not set", ErrUnauthorized, oidcTokenEnv)
}

// token returns the bearer token for a request.
func (c *credentials) token(ctx context.Context) (string, error) {
	if c.sdkKey != "" {
		return c.sdkKey, nil
	}
	token, err := c.oidc(ctx)
	if err != nil {
		return "", err
	}
	if token == "" {
		return "", fmt.Errorf("%w: the token source returned an empty token", ErrUnauthorized)
	}
	return token, nil
}

// authorize adds the authentication headers to a request.
func (c *credentials) authorize(ctx context.Context, req *http.Request) error {
	token, err := c.token(ctx)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if c.projectID != "" {
		req.Header.Set(sourceProjectHeader, c.projectID)
	}
	return nil
}

func (c *credentials) unauthorizedError() error {
	if c.projectID == "" {
		return fmt.Errorf("%w (401)", ErrUnauthorized)
	}
	return fmt.Errorf("%w (401): this deployment is not allowed to read the flags of project %q. Check that the project is connected. See https://vercel.com/docs/flags/vercel-flags/project-connections", ErrUnauthorized, c.projectID)
}
