var assert = require('assert');
var concat = require('concat-stream');
var spigot = require('stream-spigot');
var through2 = require('through2');
var xtend = require('xtend');
var util = require('../../util');

//
// creates a test handler that can be verified for expected values
//
exports.success = function(opts) {
  var res = {};

  if (opts.status) {
    res.status = opts.status;
  }
  else {
    opts.status = 200;
  }

  if (opts.headers) {
    res.headers = xtend(opts.headers);
  }
  opts.headers = xtend(opts.headers);

  //
  // determine stream and object mode
  //
  opts.stream = !!(opts.items || opts.chunks);
  opts.objectMode = opts.stream ? !!opts.items : util.isObjectMode(opts.body);

  //
  // object stream response
  //
  if (opts.objectMode) {
    opts.headers['content-type'] = 'application/json' + (opts.stream ? ';parse' : '');
  }

  var handler = function (request) {
    //
    // defensively copy all the things
    //
    var response = xtend(res);

    if (response.headers) {
      response.headers = xtend(response.headers);
    }

    if (opts.objectMode) {
      if (opts.stream) {
        response.body = spigot({ objectMode: true }, opts.items.slice());
      }
      else {
        response.body = JSON.parse(JSON.stringify(opts.body));
      }
    }
    else {
      if (opts.stream) {
        response.body = spigot(opts.chunks.slice());
      }
      else {
        // TODO: copy buffer instance
        response.body = opts.body;
      }
    }

    return response;
  };

  handler.verify = exports.verifyResponse.bind(null, opts);

  return handler;
};

exports.verifyResponse = function (opts, response) {
  return Promise.resolve(response).then(function (response) {
    //
    // verify response metadata
    //
    assert.strictEqual(response.status, opts.status);
    assert.deepEqual(response.headers, opts.headers);

    //
    // verify we got the right kind of body
    //
    var body = response.body;
    var stream = util.isStream(body);
    assert.equal(opts.stream, stream, 'Incorrect response stream type');

    var objMode = util.isObjectMode(body);
    assert.equal(opts.objectMode, objMode, 'Incorrect object mode');

    //
    // validate stream response body
    //
    if (stream) {
      return new Promise(function (resolve, reject) {

        //
        // figure out encoding for concat-stream
        //
        var encoding;
        if (objMode) {
          encoding = 'array';

          //
          // unbreak concat-stream behavior for object mode streams
          //
          body = body.pipe(through2.obj(function (chunk, enc, cb) {
            cb(null, [ chunk ]);
          }));
        }

        //
        // sniff for string streams
        //
        else if (typeof opts.chunks[0] === 'string') {
          encoding = 'string';
        }

        //
        // concat stream and test results
        //
        body.pipe(concat({ encoding: encoding }, function (result) {
          var expected = opts.items;

          if (objMode) {
            assert.deepEqual(result, expected, 'Invalid objectMode stream');
          }
          else if (encoding === 'string') {
            expected = String.prototype.concat.apply('', opts.chunks);
            assert.strictEqual(result, expected, 'Invalid string stream');
          }
          else {
            expected = Buffer.concat(opts.chunks);
            assert.deepEqual(result, expected, 'Invalid buffer stream');
          }

          resolve(response);

        }));

      });
    }

    //
    // validate value response body
    //
    assert.deepEqual(body, opts.body, 'Invalid body value');
    return response;

  });
};
