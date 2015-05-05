var handlerUtil = require('../util/handler');

module.exports = {
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
          handler: handlerUtil.success({ body: null })
        },
        booleanLiteral: {
          path: '/body/literal/boolean',
          handler: handlerUtil.success({ body: true })
        },
        numberLiteral: {
          path: '/body/literal/number',
          handler: handlerUtil.success({ body: -12.345 })
        },
        // dateLiteral
        bufferLiteral: {
          path: '/body/literal/buffer',
          handler: handlerUtil.success({
            body: Buffer('hello buffer', 'utf8')
          })
        },
        stringLiteral: {
          path: '/body/literal/string',
          handler: handlerUtil.success({
            body: 'hello there'
          })
        },
        arrayLiteral: {
          path: '/body/literal/array',
          handler: handlerUtil.success({
            body: [ 'foo', 'array', 1, 2, '3' ]
          })
        },
        objectLiteral: {
          path: '/body/literal/object',
          handler: handlerUtil.success({
            body: { foo: 'object' }
          })
        },
        bufferStream: {
          path: '/body/stream/buffer',
          handler: handlerUtil.success({
            chunks: [
              Buffer('hell', 'utf8'),
              Buffer('o...', 'utf8')
            ]
          })
        },
        stringStream: {
          path: '/body/stream/string',
          handler: handlerUtil.success({
            chunks: [
              'hell',
              'o ',
              'world'
            ]
          })
        },
        arrayStream: {
          path: '/body/stream/array',
          handler: handlerUtil.success({
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
          handler: handlerUtil.success({
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
};
