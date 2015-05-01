var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var inherits = require('util').inherits;
var JSONStream = require('JSONStream');
var multiplex = require('multiplex');
var now = require('performance-now');
var split = require('split');
var through2 = require('through2');
var url = require('url');
var xtend = require('xtend');
var pkg = require('./package.json');
var util = require('./util');

//
// endpoint handler
//
function Endo(api) {
  if (!(this instanceof Endo)) {
    return new Endo(api);
  }

  this.api = api;
  this.endpoints = util.parse(api);

  //
  // copy default resposne headers for each instance
  //
  this.responseHeaders = xtend(this.responseHeaders);
}

inherits(Endo, EventEmitter);

//
// process endpoint with provided request context
//
Endo.prototype.request = function (request) {

  //
  // resolve to set up a promise chain for error trapping
  //
  var endo = this;
  return Promise.resolve(request).then(function (context) {
    request = context;

    var endpoint = util.getEndpoint(endo.endpoints, request);

    //
    // ensure endpoint has a valid handler
    //
    var NYI_MESSAGE = 'Endpoint not implemented: ' + endpoint.path;
    assert.equal(typeof endpoint.handler, 'function', NYI_MESSAGE);

    //
    // check authorization
    //
    endo.authorize(endpoint, request.user);

    //
    // invoke endpoint handler
    //
    request.endpointProcessingStarted = now();
    return endpoint.handler(request);

  }).then(function (result) {
    request.endpointProcessingEnded = now();

    //
    // reject empty responses
    //
    var body = result && result.body;
    if (body === undefined) {
      throw new Error('Empty response');
    }

    //
    // normalize response metadata and set default values
    //
    result.status || (result.status = 200);
    result.headers = xtend(result.headers);

    //
    // add content-type for object mode bodies (whic are to be written as JSON)
    //
    if (util.isObjectMode(result.body)) {
      var type = 'application/json';
      if (util.isStream(result.body)) {
        type += ';parse';
      }
      result.headers['content-type'] = type;
    }

    return result;
  });
};

//
// Default request handler
//
Endo.prototype.handleRequest = function (request, response) {
  //
  // invoke endpoint handler with request context
  //
  return Promise.resolve(request)
    .then(this.initRequest.bind(this))
    .then(this.request.bind(this))
    .then(this.handleResponse.bind(this, response))
    .catch(this.handleResponseError.bind(this, response));
};

//
// default response processing
//
Endo.prototype.handleResponse = function (response, result) {
  this.writeResponseHead(response, result);
  this.writeResponseBody(response, result);
};

Endo.prototype.writeResponseHead = function (response, result) {
  if (!response.headersSent) {
    result.headers = xtend(this.responseHeaders, result.headers);
    response.writeHead(result.status, result.headers);
  }
};

Endo.prototype.writeResponseBody = function (response, result) {
  //
  // run object mode body through body formatting
  //
  var body = result.body;

  if (util.isObjectMode(body)) {
    body = this.formatBodyObject(body);
  }

  util.isStream(body) ? body.pipe(response) : response.end(body);
};

Endo.prototype.formatBodyObject = function (body) {
  //
  // pipe objectMode streams through JSONStream
  //
  if (util.isStream(body)) {
    return body.pipe(JSONStream.stringify());
  }

  return JSON.stringify(body, null, '  ');
}

//
// default error handling just runs error through formatter
//
Endo.prototype.handleResponseError = function (response, error) {
  return this.handleResponse(response, this.formatErrorObject(error));
};

//
// transform an error into response with a JSON objeect body
//
Endo.prototype.formatErrorObject = function (error) {
  var body = {
    error: true,
    name: error.name,
    message: error.message
  };

  if (this.includeErrorStack) {
    body.stack = error.stack;
  }
  return {
    status: error.status || 500,
    headers: {
      'content-type': 'application/json'
    },
    body: body
  };
};

//
// default response headers
//
Endo.prototype.responseHeaders = { server: 'Endo/' + pkg.version };

//
// authorization based on endpoint permissions list by default
//
Endo.prototype.authorize = function (endpoint, user) {
  //
  // bypass is user is undefined (implies no authentication scheme)
  //
  if (user === undefined) {
    return;
  }

  //
  // bypass auth if no permissions associated with endpoint
  //
  var required = endpoint.permissions;
  if (!required || !required.length) {
    return;
  }

  //
  // get permissions associated with user
  //
  var available = user && user.scope && user.scope.permissions;
  if (!available || !available.length) {
    throw new util.UnauthorizedError('Insufficient permissions');
  }

  //
  // resolve complete permissions for permission lists given version's roles
  //
  var roles = this.endpoints[endpoint.version].roles;
  available = util.resolvePermissions(available, roles);
  required = util.resolvePermissions(required, roles);

  //
  // authorize using required and available permissions
  //
  if (util.hasPermissions(required, available)) {
    throw new util.UnauthorizedError('Insufficient permissions');
  }
};

//
// gets semver range from request url, override to modify version range lookup
//
Endo.prototype.initRequest = function (request) {
  //
  // parse url into path components, slicing off the first (empty) element
  //
  var components = url.parse(request.url).pathname.split('/').slice(1);

  //
  // shift off first element for version range, so specifiers like `^` work
  //
  request.endpointRange = decodeURIComponent(components.shift());

  //
  // serialize path components, sans version range, into endpoint path
  //
  request.endpointPath = '/' + components.join('/');

  return request;
};

//
// normalize and copy relevant request context values onto source stream
//
Endo.prototype.initSocketRequest = function (stream, context, options) {
  options || (options = {});
  stream.method = context.headers || 'GET';
  stream.headers = context.headers || {};
  stream.user = options.user;
  stream.url = context.url || '/*/';
  return this.initRequest(stream);
};

//
// creates a multiplexed stream for fielding requests over sockets
//
Endo.prototype.createStream = function (options) {
  options || (options = {});

  var endo = this;
  return multiplex(options, function (stream, id) {

    var headersReceived;
    stream.pipe(split(/(\r?\n)/)).on('data', function (data) {
      //
      // we only care about the first line (analogous to HTTP headers)
      //
      if (!headersReceived) {
        headersReceived = true;

        //
        // first line should be JSON-encoded request metadta
        //
        var request = endo.initSocketRequest(stream, JSON.parse(data));

        //
        // create a response stream and pipe to client
        //
        var response = new SocketResponse();
        response.pipe(stream);

        //
        // run through standard request processing
        //
        endo.handleRequest(request, response);
      }
    });
  });
};

//
// through stream for socket response
//
var SocketResponse = through2.ctor();

//
// support writeHead method to allow us to reuse http response processing
//
SocketResponse.prototype.writeHead = function (status, headers) {
  assert(!this.headersSent, 'Socket response headers already written');
  this.headersSent = true;
  this.write(JSON.stringify({ status: status, headers: headers }) + '\n');
};

module.exports = Endo;
