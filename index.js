var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var inherits = require('util').inherits;
var JSONStream = require('JSONStream');
var multiplex = require('multiplex');
var now = require('performance-now');
var split2 = require('split2');
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

Endo.prototype.request = function (request) {
  //
  // allow string url argument form
  //
  if (typeof request === 'string') {
    request = { url: request };
  }

  return this.processRequest(request);
}

//
// process endpoint with provided request context
//
Endo.prototype.processRequest = function (request) {
  var endo = this;

  function preprocess(request) {
    return endo.parseRequest(request);
  }

  function process(request) {
    //
    // look up endpoint baesd on request context
    //
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
    request.endpointHandlerProcessingStart = now();

    return endpoint.handler(request);
  }

  function postprocess(result) {
    request.endpointHandlerProcessingEnd = now();

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
      var streamParam = util.isStream(result.body) ? ';parse' : '';
      result.headers['content-type'] = 'application/json' + streamParam;
    }

    return result;
  }

  //
  // resolve to set up a promise chain for error trapping
  //
  return Promise.resolve(request)
    .then(preprocess)
    .then(process)
    .then(postprocess);
};

//
// gets semver range from request url, override to modify version range lookup
//
Endo.prototype.parseRequest = function (request) {
  //
  // bypass lookup if endpoint path already provided
  //
  if (request.endpointPath) {
    return request;
  }
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
// default request handler
//
Endo.prototype.handleRequest = function (request, response) {
  //
  // invoke endpoint handler with request context
  //
  return this.processRequest(request)
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

//
// transform object mode bodies appropriately
//
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
// creates a multiplexed stream for fielding requests over sockets
//
Endo.prototype.createStream = function (options) {
  options || (options = {});

  var endo = this;
  var source = multiplex(options, function (stream, id) {
    //
    // create a response stream and pipe to socket client
    //
    var response = new SocketResponse();
    response.pipe(stream);

    // TODO: request.pipe(MetadataStream()).on('meta', function (meta) { ... 
    var headersReceived;
    stream.pipe(split2(/(\r?\n)/)).on('data', function (data) {
      //
      // we only care about the first line (analogous to HTTP headers)
      //
      if (!headersReceived) {
        headersReceived = true;

        //
        // first line should be JSON-encoded request metadta
        //
        try {
          var context = JSON.parse(data);  
        }
        catch (error) {
          return endo.handleResponseError(response, error);
        }

        //
        // socket stream is used as the request context, copy on relevant keys
        //
        // TODO: clean this up
        stream.url = context.url;
        stream.method = context.method;
        stream.headers = context.headers;
        stream.endpointPath = context.endpointPath;
        stream.endpointRange = context.endpointRange;

        //
        // auth could be checked at handshake-time and persisted
        //
        stream.user = options.user;

        //
        // run through standard request processing
        //
        endo.handleRequest(stream, response);
      }
    });
  });

  var errors = source.createStream('error');

  return source;
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
