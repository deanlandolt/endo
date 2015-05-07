# endo

Light-weight server for authoring simple self-documenting HTTP and WebSocket APIs.


## Endpoint Handlers

We assume handlers deal explicitly in JSON unless otherwise noted. Endpoint "handlers" are function which take an HTTP request object and return a stream or an object with a JSON-able `body`.

Handlers may provide top level `status` and/or `headers` keys in returned responses to extend or override default values.

Handlers returning JSON-serialized values are analogous to RPC calls. When defining the API, the "arguments" of this call can be defined by a request body schema, and the return value defined by a response body schema. The request and response schemas could have any structure, and the handler should adhere to them (we could even verify this at runtime in development environments).

Response values for JSON serialization may optionally be returned as promises. Alternatively, handlers may return a stream object directly that can be piped to the WebSocket or HTTP response stream. This stream object may also provide custom `status` or `headers` keys, but these keys must be `own` properties of the stream object -- values on the stream's prototype are ignored to avoid possible conflicts.


## Transports

All endpoints can be exposed over HTTP, WebSockets with line-separated JSON, or both. Interaction over WebSockets is symmetrical with HTTP, and handlers should be transport-agnostic. The same handler logic is invoked in the same way regardless of the underlying protocol.


## Error handling

Outputs errors to `stderr` unless NODE_ENV is set to `test`. If a response head not been written, an appropriate HTTP error will be written -- with a `500` status cdoe unless the error contains a `status` property.

An `error` event will be raised on the application instance for all errors.


## Subscriptions


## Semver Endpoint Paths

The leading path component represents API version. It is parsed as a semver range, which allows detailed control over the range of acceptable versions for endpoint requests. The below paths are just some examples of valid ranges which would include the `1.0.0` version of an API:

```
/v1/some/endpoint
/1.0.0/some/endpoint
/v1.0.0/some/endpoint
/1.x/some/endpoint
/v1.x/some/endpoint
/~1.0.0/some/endpiont
/^1.0/some/endpiont
```

The last path includes a `^` character which may be percent-encoded. The version path component is decoded before comparing semver ranges, so this shouldn't be a problem.


## Middleware

Middleware functionality can be written as higher-order functions which wrap handlers. A middleware function may inspect or alter the request object before passing it to the provided handler. It may also inspect or alter the response returned from the handler. No magical non-linear middleware conventions are necessary -- just function composition.

### Logging

A `log` function can be provided in the `config`. A truthy non-function value for the `log` attribute gets the default logger, `console.log`.
