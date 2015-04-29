var http = require('http');
var JSONStream = require('JSONStream');
var xtend = require('xtend');
var multiplex = require('multiplex');

var docs = require('endoc');
var endpoints = require('./endpoints');
var errors = require('./errors');
var logs = require('./logs');


exports.serve = function serve(config) {
  //
  // bottom out with a 404
  //
  var notFound = function (request) {
    throw new errors.NotFound(request.url);
  };

  //
  // invoke default base handler or one provided with config
  //
  var handler = (config.handler || exports.handler)(notFound, config);

  //
  // routing logic for identifying the correct endpoint
  //
  handler = endpoints.handler(handler, config);

  //
  // serve api docs, if requested
  //
  if (config.docs) {
    handler = docs.handler(handler, config);
  }

  //
  // add loggging, if requested
  //
  if (config.log) {
    handler = logs.handler(handler, config);
  }

  //
  // add error handler
  //
  // TODO: cluster so we can fail hard
  handler = errors.handler(handler, config);

  function handleRequest(request, response) {

    function writeResponse(data) {
      //
      // set default content-type
      //
      var body = data.body;
      var headers = xtend(data.headers, config.headers);

      //
      // return values encoded as buffers bypass JSON encoding
      //
      if (body !== void 0 && !Buffer.isBuffer(body)) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(body, null, '  ');
      }
      //
      // only write headers if they haven't already been sent
      //
      if (!response.headersSent) {
        response.writeHead(data.status || 200, headers);
      }
      response.end(body);
    }

    function writeError(error) {
      errors.log('RESPONSE STREAM ERROR', error.stack)
      writeResponse(errors.response(error));
    }

    //
    // look up handler for request
    //
    return Promise.resolve(handler(request)).then(function (data) {
      var body = data.body;

      if (body && typeof body.pipe === 'function') {
        //
        // write headers and pipe body to response stream
        //
        response.writeHead(data.status || 200, data.headers);
        var transform = JSONStream.stringifyObject();
        return body.pipe(transform).pipe(response);
      }

      //
      // write data with non-stream bodiy as plain response
      //
      writeResponse(data);

    }).catch(writeError);
  }

  function createStream(){
    var plex = multiplex(function(stream){
      var request = { url: stream.meta };
      Promise.resolve(handler(request)).then(function(data){
        var body = data.body;
        if (body && typeof body.pipe == 'function') {
          if (body.readable) body.pipe(stream);
          if (body.writable) stream.pipe(body);
          body.on('error', plex.emit.bind(plex, 'error'));
        } else {
          stream.end(data);
        }
      })
      .catch(plex.emit.bind(plex, 'error'));
    });
    return plex;
  }

  return {
    handleRequest: handleRequest,
    createStream: createStream
  };
}

exports.handler = function (next) {
  return function (request) {
    if (request.endpoint && typeof request.endpoint.handler === 'function') {
      return request.endpoint.handler(request);
    }
    return next(request);
  }
}
