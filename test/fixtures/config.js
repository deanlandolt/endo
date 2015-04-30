var assert = require('assert');
var highland = require('highland');
var spigot = require('stream-spigot');


function literalHandler(options) {
  options || (options = {});

  var expectedHeaders = {};
  if (!Buffer.isBuffer(options && options.body)) {
    expectedHeaders['content-type'] = 'application/json';
  }

  var handler = function (req) {
    return { body: options.body };
  };

  handler.verify = function (res) {
    assert.strictEqual(res.status, 200);
    assert.deepEqual(res.headers, expectedHeaders);

    assert.deepEqual(res.body, options.body);
  };

  return handler;
}

function streamHandler(options) {
  options || (options = {});

  var expectedHeaders = {};
  if (options.objectMode) {
    expectedHeaders['content-type'] = 'application/json';
  }

  var handler = function (req) {
    return { body: spigot(options, options.data) };
  };

  handler.verify = function (res) {
    assert.strictEqual(res.status, 200);
    assert.deepEqual(res.headers, expectedHeaders);

    return new Promise(function (resolve, reject) {
      highland(res.body).errors(function (error) {
        reject(error);
      }).toArray(function (array) {
        assert.deepEqual(array, options.data);
        resolve();
      });
    });
  };

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
          // empty: {
          //   path: '/body/empty',
          //   handler: literalHandler({ body: undefined })
          // },
          nullLiteral: {
            path: '/body/literal/null',
            handler: literalHandler({ body: null })
          },
          booleanLiteral: {
            path: '/body/literal/boolean',
            handler: literalHandler({ body: true })
          },
          numberLiteral: {
            path: '/body/literal/number',
            handler: literalHandler({ body: -12.345 })
          },
          // dateLiteral
          bufferLiteral: {
            path: '/body/literal/buffer',
            handler: literalHandler({
              body: Buffer('hello buffer', 'utf8')
            })
          },
          stringLiteral: {
            path: '/body/literal/string',
            handler: literalHandler({
              body: 'hello there'
            })
          },
          arrayLiteral: {
            path: '/body/literal/array',
            handler: literalHandler({
              body: [ 'foo', 'array', 1, 2, '3' ]
            })
          },
          objectLiteral: {
            path: '/body/literal/object',
            handler: literalHandler({
              body: { foo: 'object' }
            })
          },
          // bufferStream: {
          //   path: '/body/stream/buffer',
          //   handler: streamHandler({
          //     body: [ Buffer('hell', 'utf8'), Buffer('o...', 'utf8') ]
          //   })
          // },
          // stringStream: {
          //   path: '/body/stream/string',
          //   handler: streamHandler({
          //     body: [
          //       'hell',
          //       'o ',
          //       'world'
          //     ]
          //   })
          // },
          arrayStream: {
            path: '/body/stream/array',
            handler: streamHandler({
              objectMode: true,
              data: [
                [ 'temp', -2.2 ],
                [ 'temp', -40 ],
                [ 'temp', 212 ],
                [ 'temp', 22 ],
              ]
            })
          },
          objectStream: {
            path: '/body/stream/object',
            handler: streamHandler({
              objectMode: true,
              data: [
                { temp: -2.2, unit: 'F' },
                { temp: -40, unit: 'F' },
                { temp: 212, unit: 'F' },
                { temp: 22, unit: 'C' },
              ]
            })
          }
        }
      },

      failTests: {
        endpoints: {
          noHandler: {
            path: '/fail/no-handler'
          }
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
          }
        }
      }
    }
  },
  auth: {
    secret: '...'
  }
};
