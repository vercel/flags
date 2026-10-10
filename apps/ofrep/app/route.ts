const introduction = String.raw`OFREP for Vercel Flags

This service evaluates Vercel Flags through the OpenFeature Remote Evaluation
Protocol (OFREP). Use it with an OFREP provider in your OpenFeature SDK.
Set the provider's base URL to this site's origin, without a path.

Send a Vercel Flags SDK key or Vercel OIDC token in Authorization: Bearer <token>.
You can also use the X-API-Key header. Your credentials select the project and
environment. Keep server credentials on the server.

Endpoints:
  POST /ofrep/v1/evaluate/flags/{key}  Evaluate one flag.
  POST /ofrep/v1/evaluate/flags        Evaluate all flags.

Examples: replace <base-url> and banner with your values.

SDK key authentication:
Set FLAGS_SDK_KEY to your raw Vercel Flags SDK key.

curl '<base-url>/ofrep/v1/evaluate/flags/banner' \
  -H "Authorization: Bearer $FLAGS_SDK_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"context":{"targetingKey":"user-123","user":{"id":"user-123"}}}'

Vercel OIDC authentication:
Use a current Vercel OIDC token in VERCEL_OIDC_TOKEN.

curl '<base-url>/ofrep/v1/evaluate/flags/banner' \
  -H "Authorization: Bearer $VERCEL_OIDC_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"context":{"targetingKey":"user-123","user":{"id":"user-123"}}}'

To read another project's flags with OIDC, also add:
  -H 'X-Vercel-Flags-Project-Id: prj_...'
The caller must have permission to access that project.

The body must contain a context object. Use {"context":{}} if no context is needed.
For rules that use user.id, supply context.user.id. targetingKey is not copied
to user.id. Responses contain the flag key, value, reason, and optional variant.

Specification:
https://openfeature.dev/docs/reference/other-technologies/ofrep/
`;

export function GET() {
  return new Response(introduction, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
