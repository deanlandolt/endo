var JSONStream = require('JSONStream');
var multiplex = require('multiplex');
var now = require('performance-now');
var paramify = require('paramify');
var semver = require('semver');
var split = require('split');
var url = require('url');
var xtend = require('xtend');
var endpoints = require('./endpoints');

//
// endpoint handler
//
function Endo(config) {
  if (!(this instanceof Endo)) {
    return new Endo(config);
  }

  this.conifg = config;
  this.endpoints = endpoints.parse(config.api);
}

//
// process endpoint with provided context
//
Endo.prototype.process = function (context) {
  //
  // resolve to set up a promise chain for error trapping
  //
  var endo = this;
  return Promise.resolve(context).then(function (context) {
    var endpoint = endo.resolve(context);
    //
    // invoke endpoint handler
    //
    return endpoint.handler(context);
  });
};

//
// override to control processing behavior when no endpoint handler is found
//
Endo.prototype.notFound = function (message) {
  var error = new Error('Not Found: ' + message);
  error.status = 404;
  throw error;
};

//
// override to control processing behavior for unauthored requests
//
Endo.prototype.unauthorized = function (message) {
  var error = new Error('Unauthorized: ' + message);
  error.status = 401;
  throw error;
};

//
// find semver version range from request, override to change or disable
//
Endo.prototype.setRequestContext = function (request) {
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
  request.endpointPath: '/' + components.join('/');

  return request;
};

//
// HTTP request handler
//
Endo.prototype.handleRequest = function (request, response) {
  var handleResponse = this.handleResponse.bind(this, response);
  try {
    //
    // invoke endpoint handler with request context
    //
    return this.process(this.getRequestContext(request));
  });

  try {
    return this.process(request).then(handleResponse, handleResponse);
  }
  catch (error) {
    handleResponse(error);
  }
};

Endo.prototype.defaultResponseHeaders = { 'content-type': 'application/json' };

//
// HTTP response writer
//
Endo.prototype.handleResponse = function (response, data) {
  //
  // allow error to be transformed before writing response data
  //
  if (data instanceof Error) {
    data = this.formatError(data);
  }

  //
  // set up response defaults, extending provided headers with any defaults
  //
  var status = data.status || 200;
  var headers = xtend(this.defaultResponseHeaders, data.headers);
  var body = data.body;

  //
  // add json content-type if body is going to be transformed to json
  //
  if (body !== undefined && !Buffer.isBuffer(body)) {
    headers['content-type'] = 'application/json';
  }

  response.writeHead(status, headers);

  this.writeResponse(response, body);
};

//
// endpoint response body handling
//
Endo.prototype.writeReesponse = function (output, body) {
  if (body && body._readableState && typeof body.pipe === 'function') {
    //
    // pipe objectMode streams through JSONStream
    //
    if (body._readableState.objectMode) {
      body = body.pipe(JSONStream.stringify());
    }
    return body.pipe(output);
  }

  //
  // transform body if JSON
  //
  if (body !== undefined && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body, null, '  ');
  }

  response.end(body);
};


Endo.prototype.setStreamRequestContext = function (context) {
  context.method || (context.method = 'GET');
  context.url = '/' + context.endpointVersion + '/' + context.endpointPath;
  context.headers = {};
  return context;
}

//
// creates a multiplexed stream for fielding requests over sockets
//
Endo.prototype.createStream = function (options) {
  var endo = this;

  multiplex(function (stream, id) {

    function writeError(error) {
      return stream.end(endo.formatError(error));
    }

    function writeResponse(response) {
      return endo.writeResponse.bind(endo, stream);
    }

    var chunkCount = 0;
    stream
      .on('error', endo.error.bind(endo, 'STREAM ERROR'))
      .pipe(split(JSON.parse))
      .on('data', function (data) {

        if (!chunkCount++) {
          //
          // first chunk initiates request by providing context object
          //
          try {
            var context = this.setStreamRequestContext(data);
            Promise.resolve(endo.process(context))
              .then(writeResponse)
              .catch(writeError);
          }
          catch (error) {
            writeError(error);
          }
        }

        //
        // ignore any additionals stream writes from client for now
        //
      });
  });
};

Endo.prototype.writeSocketResponse = function (stream, response) {
  var body = response.body;
  if (body && response.body.)
};

//
// look up an endpoint from provided context: path, method, and version range
//
Endo.prototype.resolve = function (context) {
  var path = context.endpointPath;
  if (!path) {
    return this.notFound('No path provided');
  }

  var range = semver.validRange(context.range || '*');
  if (range == null) {
    return this.notFound('Invalid range: ' + context.range);
  }

  var parsed = this.endpoints;
  var match = paramify(path);
  var method = context.method || 'GET';

  //
  // find a candidate set of allowable versions for route matching
  //
  var canddiates = {};
  Object.keys(parsed).forEach(function (version) {
    if (version === '*' || semver.satisfies(version, range)) {
      candidates[version] = parsed[version];
    }
  });

  //
  // iterate over available routes for all candidate versions (descending)
  //
  for (var version in candidates) {
    var candidate = candidates[version];
    for (var route in candidate) {
      endpoint = candidate[route];

      //
      // match route by provided path and optional method
      //
      // TODO: cache transform or replace with route matcher that does curlies
      var mungedRoute = route.replace(/\{(.*)\}/g, ':$1');
      if (method == endpoint.method && match(mungedRoute)) {
        //
        // add endpoint and match params to context and return endpoint
        //
        context.endpont = endpoint;
        context.params = match.params;
        return endpoint;
      }
    }
  }

  //
  // no endpoint found
  //
  return this.notFound(path + ' @' + range);
};

//
// noop auth implementations, overide to add auth support
//
var NOOP_AUTH = Endo.prototype.authenticate = function(request) {
};

//
// verify endpoint permissions for provided auth scope
//
Endo.prototype.authorize = function (endpoint, data) {
  //
  // bypass if authentication is not implemented, or authorization is unneeded
  //
  var required = endpoint.permissions;
  if (this.authentication === NOOP_AUTH || !required || !required.length) {
    return;
  }

  //
  // resolve any included permissions for permissions list
  //
  console.log(this.endpoints)
  var roles = this.endpoints[endpoint.version].roles;
  function resolvePerms(perms) {
    return lodash.compact(lodash.union(perms.map(function (perm) {
      return [ perm ].concat(roles[perm].includes);
    })));
  }

  required = resolvePerms(required);

  var scopes = data && data.scopes || {};
  var available = resolvePerms(scopes.permissions || []);

  //
  // required permissions should be fully subsumed by available permissions
  //
  if (lodash.intersection(required, available).length < required.length) {
    return endo.unauthorized('Insufficient permissions');
  }
};

//
// transform an error into response with a JSON objeect body
//
Endo.prototype.formatError = function (error) {
  this.error('RESPONSE ERROR', error.stack);

  var body = {
    error: true,
    name: error.name,
    message: error.message
  };

  if (this.verboseErrors) {
    body.stack = error.stack;
  }
  return {
    status: error.status || 500,
    body: body
  };
};

//
// invoked when a server error occurs, override for better logging
//
Endo.prototype.error = console.error;

//
// invoked when an endpoint handler is complete, override for better logging
//
Endo.prototype.log = console.log;

module.exports = Endo;
