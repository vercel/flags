// Package embedded defines the file of embedded flag definitions. The client
// reads the file and the prepare package writes it.
package embedded

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
)

// Version is the version of the file format.
const Version = "1.0.1"

// File is the content of an embedded definitions file.
type File struct {
	Version string `json:"version"`
	// Definitions maps a key to a datafile. The key is the SHA-256 hash of an
	// SDK key in hexadecimal, or a project ID.
	Definitions map[string]json.RawMessage `json:"definitions"`
}

var (
	sdkKeyPattern    = regexp.MustCompile(`^vf_(?:server|client)_`)
	projectIDPattern = regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`)
)

// ParseSDKKey returns the SDK key in text. The text is an SDK key or a
// connection string such as "flags:edgeConfigId=...&sdkKey=vf_server_...".
func ParseSDKKey(text string) (string, bool) {
	if sdkKeyPattern.MatchString(text) {
		return text, true
	}
	query, found := strings.CutPrefix(text, "flags:")
	if !found {
		return "", false
	}
	params, err := url.ParseQuery(query)
	if err != nil {
		return "", false
	}
	if key := params.Get("sdkKey"); sdkKeyPattern.MatchString(key) {
		return key, true
	}
	return "", false
}

// IsProjectID reports whether id has the form of a Vercel project ID.
func IsProjectID(id string) bool {
	return projectIDPattern.MatchString(id)
}

// HashSDKKey returns the key of an SDK key in the file. The file does not
// contain the SDK key itself.
func HashSDKKey(sdkKey string) string {
	sum := sha256.Sum256([]byte(sdkKey))
	return hex.EncodeToString(sum[:])
}

// ProjectIDFromOIDCToken returns the project_id claim of a Vercel OIDC token.
// It does not verify the token.
func ProjectIDFromOIDCToken(token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[1] == "" {
		return "", errors.New("flags: invalid OIDC token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return "", errors.New("flags: invalid OIDC token")
	}
	var claims struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil || claims.ProjectID == "" {
		return "", errors.New("flags: missing project_id claim in OIDC token")
	}
	return claims.ProjectID, nil
}
