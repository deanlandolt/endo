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


  //
  // body tests
  //
  var endpoints, endpoint, name;
  endpoints = config.api.sections.bodyTests.endpoints;
  for (name in endpoints) {
    endpoint = endpoints[name];
    console.log(endpoint.path);

    result = yield api.request({ endpointPath: endpoint.path });
    yield endpoint.handler.verify(result);
  }

  //
  // exception tests
  //
  endpoints = config.api.sections.exceptionTests.endpoints;
  for (name in endpoints) {
    endpoint = endpoints[name];
    console.log(endpoint.path);

    try {
      result = yield api.request({ endpointPath: endpoint.path });
      assert(false, 'Should have thrown');
    }
    catch (e) {
      assert(e.message !== 'Should have thrown', e.message);
      if (endpoint.__errorMessage__) {
        assert.equal(e.message, endpoint.__errorMessage__, 'Bad error message');
      }
    }
  }

});
