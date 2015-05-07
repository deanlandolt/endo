var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var inherits = require('util').inherits;
var JSONStream = require('JSONStream');
var multiplex = require('multiplex');
var now = require('performance-now');
var Promise = require('bluebird');
var through2 = require('through2');
var url = require('url');
var xtend = require('xtend');

var metadata = require('./package.json');
var util = require('./util');

//
// endpoint handler
//
function Endo(api) {
  if (api instanceof Endo) {
    return api;
  }

  if (!(this instanceof Endo)) {
    return new Endo(api);
  }

  this.endpoints = util.parse(api);
  this.source = api;
  this.version = api.version;

  //
  // copy default resposne headers for each instance
  //
  this.responseHeaders = xtend(this.responseHeaders);
}

inherits(Endo, EventEmitter);

Endo.COMPLETE_RESPONSE = Symbol('Symbolizes a complete Endo response object');

//
// test request to determine if it contains has a valid range component in url
//
Endo.prototype.test = function (request, response) {
  var range = request.url.split('/')[1];
  return range && util.validRange(range);
};

//
// default request handler
//
Endo.prototype.handle = function (request, response) {
  //
  // invoke endpoint handler with request context
  //
  var app = this;
  return this.processRequest(request)
    .then(app.handleResponse.bind(app, response))
    .catch(app.handleResponseError.bind(app, response))
    .catch(function (error) {
      app.emit('error', error);
    });
};

Endo.prototype.request = function (request) {
  //
  // allow string url argument form
  //
  if (typeof request === 'string') {
    request = { url: request };
  }

  return this.processRequest(request);
};

//
// process endpoint with provided request context
//
Endo.prototype.processRequest = function (context) {
  var app = this;
  var request;

  function preprocess(context) {
    //
    // keep a reference to parsed request context
    //
    request = context;

    //
    // add endo response symbols to request and emit request event
    //
    request.endo = {
      COMPLETE_RESPONSE: Endo.COMPLETE_RESPONSE
    };

    return request;
  }

  function process(request) {
    //
    // look up endpoint baesd on request context
    //
    var endpoint = util.getEndpoint(app.endpoints, request);
    //
    // ensure endpoint has a valid handler
    //
    var NYI_MESSAGE = 'Endpoint not implemented: ' + endpoint.path;
    assert.equal(typeof endpoint.handler, 'function', NYI_MESSAGE);

    //
    // check authorization
    //
    app.authorize(endpoint, request.user);

    //
    // invoke endpoint and force a promise to dezalgo
    //

    app.emit('request', request);
    return Promise.resolve(endpoint.handler(request));
  }

  function postprocess(result) {
    assert(result !== undefined, 'Invalid response');

    //
    // result is just the response body unless it contains endo response symbol
    //
    var response = result;
    if (result && result[Endo.COMPLETE_RESPONSE]) {
      //
      // verify completeness of complete response
      //
      response.status || (response.status = 200);
      response.headers || (response.headers = {});
      assert(util.isStream(result.body), 'Invalid response body');
    }
    else {
      //
      // JSON object or stream response
      //
      response = {
        status: 200,
        headers: { 'content-type': 'application/json;' },
        body: result
      };

      response.headers['content-type'] += util.isStream(result) ? 'stream' : 'parse';
    }

    return response;
  }

  function success(response) {
    //
    // emit response event and return
    //
    app.emit('response', response, request);
    return response;
  }

  function failure(error) {
    //
    // emit error event and rethrow
    //
    app.emit('failure', error, request);
    throw error;
  }

  //
  // resolve to set up a promise chain for error trapping
  //
  return Promise.resolve(context)
    .then(app.parseRequest.bind(app))
    .then(preprocess)
    .then(process)
    .then(postprocess)
    .then(success, failure);
};

//
// gets semver range from request url, override to modify version range lookup
//
Endo.prototype.parseRequest = function (request) {
  //
  // bypass version lookup if endpoint path already provided
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
// default response processing
//
Endo.prototype.handleResponse = function (stream, response) {
  //
  // add any default headers
  //
  var status = response.status || 200;
  var headers = xtend(this.responseHeaders, response.headers);
  var body = response.body;

  //
  // write response head
  //
  stream.writeHead(status, headers);

  //
  // pipe response body streams
  //
  if (util.isStream(body)) {
    //
    // run object mode streams through JSONStream
    //
    if (util.isObjectMode(body)) {
      body = body.pipe(JSONStream.stringify());
    }
    body.pipe(stream);
  }
  else {
    //
    // serialize body as JSON
    //
    stream.end(JSON.stringify(body, null, '  '));
  }
};

//
// default error handling just runs error through formatter
//
Endo.prototype.handleResponseError = function (stream, error) {
  return this.handleResponse(stream, this.formatErrorObject(error));
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
      'content-type': 'application/json',
      'x-endo-error': error.message
    },
    body: body
  };
};

//
// default response headers
//
Endo.prototype.responseHeaders = { server: 'Endo/' + metadata.version };

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
  var available = user && user.role;
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
  var app = this;

  function onRequest(dup, meta) {

    function cleanup(error) {
      dup.destroy(error);
    }

    var context, resMeta
    try {
      context = JSON.parse(meta);
    }
    catch (error) {
      return cleanup(error);
    }

    var req = through2()
    .on('error', cleanup)
    .once('data', function (chunk) {
      //
      // run through standard endpoint request handling logic
      //
      app.processRequest(context)
        .then(app.handleResponse.bind(app, res))
        .catch(cleanup)
    })
    .on('data', function (chunk) {
      // TODO cullect up rest of req body and pass it along as stream
    });

    var res = through2(function (chunk, enc, cb) {
      if (resMeta) {
        this.push(Buffer(resMeta, 'utf8'));
        resMeta = false;
      }

      cb(null, chunk);
    })
    .on('error', cleanup);

    //
    // support writeHead method to allow us to reuse http response processing
    //
    res.writeHead = function writeHead(status, headers) {
      console.warn('writing head', status, headers)
      if (resMeta === false) {
        console.warn('Metadata already written', resMeta.id, status, headers);
      }

      resMeta = JSON.stringify({
        id: context.id,
        status: status,
        headers: headers
      });
    };

    res.pipe(dup).pipe(req)

  }

  return multiplex({ error: true }, onRequest)
  .on('error', function (error) {
    this.destroy(error);
  });
};



module.exports = Endo;
