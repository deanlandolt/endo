module.exports = {
  api: {
    roles: {
      foo: {},
      zzz: {},
      root: {
        includes: [ 'foo', 'zzz' ]
      }
    },
    sections: {
      foo: {
        endpoints: {
          a: {
            path: '/foo/a',
            permissions: 'foo',
            handler: function () {
              return { foo: 'a' }
            }
          },
          b: {
            path: '/foo/b',
            permissions: 'root',
            method: 'PoSt',
            handler: function () {
              return { foo: 'b' }
            }
          },
          c: {
            path: '/foo/c',
            permissions: 'root',
            method: 'PaTcH',
            handler: function () {
              return { foo: 'b' }
            }
          }
        }
      }
    }
  },
  auth: {
    secret: '...'
  }
}