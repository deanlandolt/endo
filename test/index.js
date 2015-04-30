require('./auth');

var assert = require('assert');
var coro = require('copromise');
var auth = require('../auth');
var endo = require('../');
var config = require('./fixtures/config')

//
// the `run` method rethrows exceptions in next turn, failing loudly
//
coro.run(function* () {
  var api = endo(config.api);
  var result;

  result = yield api.request({ endpointPath: '/foo/a' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.headers, { 'content-type': 'application/json' });
  assert.deepEqual(result.body, { foo: 'a' });


  var endpoints = config.api.sections.bodyTests.endpoints;
  var endpoint;
  for (var name in endpoints) {
    endpoint = endpoints[name];
    console.log(endpoint.path)
    result = yield api.request({ endpointPath: endpoint.path });
    yield endpoint.handler.verify(result);
  }

});
