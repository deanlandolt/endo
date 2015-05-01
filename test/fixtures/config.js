var assert = require('assert');
var concat = require('concat-stream');
var spigot = require('stream-spigot');
var through2 = require('through2');
var xtend = require('xtend');
var util = require('../../util');

function verifyResponse(opts, response) {
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
}

function successHandler(opts) {
  //
  // set up handler response and expected values
  //
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

  handler.verify = verifyResponse.bind(null, opts);

  return handler;
}


module.exports = {
  api: {
    version: '1.0.0',
    roles: {
      foo: {},
      zzz: {},
      root: {
        includes: [ 'foo', 'zzz' ]
      }
    },
    sections: {
      bodyTests: {
        endpoints: {
          nullLiteral: {
            path: '/body/literal/null',
            handler: successHandler({ body: null })
          },
          booleanLiteral: {
            path: '/body/literal/boolean',
            handler: successHandler({ body: true })
          },
          numberLiteral: {
            path: '/body/literal/number',
            handler: successHandler({ body: -12.345 })
          },
          // dateLiteral
          bufferLiteral: {
            path: '/body/literal/buffer',
            handler: successHandler({
              body: Buffer('hello buffer', 'utf8')
            })
          },
          stringLiteral: {
            path: '/body/literal/string',
            handler: successHandler({
              body: 'hello there'
            })
          },
          arrayLiteral: {
            path: '/body/literal/array',
            handler: successHandler({
              body: [ 'foo', 'array', 1, 2, '3' ]
            })
          },
          objectLiteral: {
            path: '/body/literal/object',
            handler: successHandler({
              body: { foo: 'object' }
            })
          },
          bufferStream: {
            path: '/body/stream/buffer',
            handler: successHandler({
              chunks: [
                Buffer('hell', 'utf8'),
                Buffer('o...', 'utf8')
              ]
            })
          },
          stringStream: {
            path: '/body/stream/string',
            handler: successHandler({
              chunks: [
                'hell',
                'o ',
                'world'
              ]
            })
          },
          arrayStream: {
            path: '/body/stream/array',
            handler: successHandler({
              items: [
                [ 'temp', -2.2 ],
                [ 'temp', -40 ],
                [ 'temp', 212 ],
                [ 'temp', 22 ],
              ]
            })
          },
          objectStream: {
            path: '/body/stream/object',
            handler: successHandler({
              items: [
                { temp: -2.2, unit: 'F' },
                { temp: -40, unit: 'F' },
                { temp: 212, unit: 'F' },
                { temp: 22, unit: 'C' },
              ]
            })
          },
        }
      },

      exceptionTests: {
        endpoints: {
          noHandler: {
            path: '/fail/on/no-handler'
          },
          emptyResponse: {
            path: '/fail/on/empty/response',
            handler: function () {
              return undefined;
            }
          },
          invalidResponse: {
            path: '/fail/on/invalid/body',
            handler: function () {
              return 123;
            }
          },
          emptyBody: {
            path: '/fail/on/empty/body',
            handler: function () {
              return { body: undefined };
            }
          },
          circularBody: {
            path: '/fail/on/circular/body',
            handler: function () {
              var a = {};
              var b = { a: a };
              return a.b = b;
            }
          },
          throw: {
            path: '/fail/on/throw',
            handler: function () {
              throw new Error('Expected');
            }
          },
          promiseReject: {
            path: '/fail/on/promise/reject',
            handler: function () {
              return new Promise(function (resolve, reject) {
                reject(new Error('Expected'));
              });
            }
          },
        }
      },

      foo: {
        endpoints: {
          a: {
            path: '/foo/a',
            permissions: 'foo',
            handler: function () {
              return { body: { foo: 'a' } }
            }
          },
          b: {
            path: '/foo/b',
            permissions: 'root',
            method: 'PoSt',
            handler: function () {
              return { body: { foo: 'b' } }
            }
          },
          c: {
            path: '/foo/c',
            permissions: 'root',
            method: 'PaTcH',
            handler: function () {
              return { body: { foo: 'b' } }
            }
          },
        }
      }
    }
  },
  auth: {
    secret: '...'
  }
};
