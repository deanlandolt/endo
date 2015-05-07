var Promise = require('bluebird');
Promise.longStackTraces();


var coro = require('copromise');
coro.Promise = Promise;

require('./auth');

var assert = require('assert');
var auth = require('../auth');
var endo = require('../');
var API_FIXTURE = require('./fixtures/api');
var api = endo(API_FIXTURE);

//
// the `run` method rethrows exceptions in next turn, failing loudly
//
coro.run(function* () {
  var result;

  //
  // equivalent requests on various ranges
  //
  var ranges = [
    'v1.0.0',
    'v1.0',
    'v1',
    '1.0.0',
    '1.0',
    '1',
    '=1.0',
    '>=1.0',
    '<=1.0',
    '^1.0',
    '~1.0',
  ]

  //
  // various endo request call forms
  //
  var path = '/foo/a';
  var url = '/*' + path;
  var contexts = [
    url,
    { url: url },
    { url: url, method: 'gEt' },
    { endpointPath: path },
    { endpointPath: path, endpointRange: '*' }
  ];

  ranges.forEach(function (range) {
    url = '/' + range + path;
    contexts.push(url);
    contexts.push({ url: url });
    contexts.push({ url: url, method: 'GeT' });
    contexts.push({ endpointPath: path });
    contexts.push({ endpointPath: path, endpointRange: range });
  });

  for (var i in contexts) {
    response = yield api.request(contexts[i]);

    assert.equal(response.status, 200);
    assert.deepEqual(response.headers, { 'content-type': 'application/json;parse' });
    assert.deepEqual(response.body, { foo: 'a' });
  }

  //
  // body tests
  //
  var endpoints, endpoint, name;
  endpoints = API_FIXTURE.sections.bodyTests.endpoints;
  for (name in endpoints) {
    endpoint = endpoints[name];
    console.warn(endpoint.path);

    result = yield api.request({ endpointPath: endpoint.path });
    yield endpoint.handler.verify(result);
  }

  //
  // exception tests
  //
  endpoints = API_FIXTURE.sections.exceptionTests.endpoints;
  for (name in endpoints) {
    endpoint = endpoints[name];
    console.warn(endpoint.path);

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
