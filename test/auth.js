var assert = require('assert');
var coro = require('copromise');
var auth = require('../auth');
var endo = require('../');
var config = require('./fixtures/config')

coro.run(function* () {
  //
  // verify round JWT round trip works as expected
  //
  var data = { foo: 'bar', bar: null, baz: [ 1, 2, '3'] };
  var options = { secret: '...' };
  var encoded = auth.createToken(options, data);
  var decoded = yield auth.verifyToken(options, encoded);
  assert.deepEqual(decoded, data, 'JWT payload should round trip');

  var api = endo(config.api);

  //
  // no authenticate method by default
  //
  assert(!api.authenticate, 'No authentication by default');



  //
  // test auth wrappper
  //
  api = auth(api, config.auth);
  var context = {};

  //
  // when enabling auth, bad authenticate invocations should throw Unauthorized
  //
  // TODO: move this into a loop
  try {
    yield api.authenticate(context);
    assert(false, 'Should have thrown');
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }

  context.headers = {};
  context.headers.authorization = 'Bearer';
  try {
    yield api.authenticate(context);
    assert(false, 'Should have thrown');
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }

  context.headers.authorization = 'Bearer XXX';
  try {
    yield api.authenticate(context);
    assert(false, 'Should have thrown');
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }

  context.headers.authorization = 'Bearer ' + encoded;
  try {
    yield api.authenticate(context);
    assert(false, 'Should have thrown');
  }
  catch (e) {
    assert.equal(e.status, 401, 'Should be a 401 Unauthorized error');
  }
});
