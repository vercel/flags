# openfeature-client example

Shows how to use Vercel Flags client-side with the OpenFeature SDK.

### Architecture

App sets up a OpenFeature Remote Evaluation Protocol (OFREP) endpoint at `/ofrep` using hono. This endpoint returns fully evaluated feature flags for the provided evaluation context from the server.

The client uses the `@openfeature/ofrep-web-provider` package to connect to the app's OFREP endpoint. In this example it is using React with `@openfeature/react-sdk`, but this is optional.

This means your application provides its own flag evaluation endpoint.

### Tradeoffs

- **same domain**: the `/ofrep` endpoint is implemented within the application
  - leads to fast DNS resolution as it's the same domain
  - avoids CORS issues
  - avoids potential ad blocker issues
- **waterfalls**
  - the client first loads the page before sending a request to the OFREP endpoint, leading to waterfalls
  - the example app uses Suspense boundaries to display a loading state
  - these loading spinners could be avoided if using the feature flags server side
- **no live updates**
  - the `@openfeature/ofrep-web-provider` does not support streaming updates, so it relies on polling
