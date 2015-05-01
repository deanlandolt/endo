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
    result = yield api.request(contexts[i]);

    assert.equal(result.status, 200);
    assert.deepEqual(result.headers, { 'content-type': 'application/json' });
    assert.deepEqual(result.body, { foo: 'a' });
  }


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
