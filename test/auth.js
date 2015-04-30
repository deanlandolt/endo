var assert = require('assert');
var co = require('copromise');
var auth = require('../auth');
var endo = require('../');
var config = require('./fixtures/config')

//
// rethrow exceptions to fail the test
//
co.run(function* () {
  //
  // verify round JWT round trip works as expected
  //
  var data = { foo: 'bar', bar: null, baz: [ 1, 2, '3'] };
  var options = { secret: '...' };
  var encoded = auth.createToken(options, data);
  var decoded = yield auth.verifyToken(options, encoded);
  assert.deepEqual(decoded, data, 'JWT payload should round trip');

  var handler = endo(config);
  var request = {
    headers: {},
    endpoint: {}
  };

  //
  // default handler should noop on authenticate
  //
  assert.equal(handler.authenticate(request), undefined);

  handler = auth(handler);
  //
  // when enabling auth, bad authenticate invocations should throw Unauthorized
  //
  try {
    yield handler.authenticate(request);
    assert(false);
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }

  request.headers.authorization = 'Bearer';
  try {
    yield handler.authenticate(request);
    assert(false);
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }

  request.headers.authorization = 'Bearer XXX';
  try {
    yield handler.authenticate(request);
    assert(false);
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }

  request.headers.authorization = 'Bearer ' + encoded;
  try {
    yield handler.authenticate(request);
    assert(false);
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }
});
