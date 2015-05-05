var jwt = require('jsonwebtoken');
var util = require('./util');

//
// pattern for extracting BEARER token from auhorization header
//
var BEARER_RE = /^bearer\s+(.+)$/i;

//
// wrapper to add JWT-based bearer auth to an endo instance
//
function auth(endo, options) {
  options || (options = {});

  //
  // add token utility methods, binding first options arg
  //
  endo.createToken = auth.createToken.bind(null, options.sign);
  endo.verifyToken = auth.verifyToken.bind(null, options.verify);

  //
  // verify provided credentials are valid and set user auth on request
  //
  var _parseRequest = endo.parseRequest;
  endo.parseRequest = function() {
    var request = _parseRequest.apply(this, arguments);
    return Promise.resolve(request).then(this.authenticate.bind(this));
  };

  endo.authenticate = function (request) {
    //
    // no auth if request already contains user auth data
    //
    if (request.user !== undefined) {
      return;
    }

    //
    // parse authorization header for JWT token
    //
    request.headers || (request.headers || {});
    var header = request.headers && request.headers.authorization || '';
    var match = header.match(BEARER_RE);
    if (!match) {
      throw new util.UnauthorizedError('Token required');
    }

    return auth.verifyToken(match[1])
      .then(endo.handleAuthentication.bind(endo, request))
  };

  //
  // implementations may wrap this method perform additional verification
  //
  endo.handleAuthentication = function (request, data) {
    request.user = data || null;
  };

  return endo;
}

auth.createToken = function (options, data) {
  options || (options = {});
  return jwt.sign(data, options.secret, options.sign);
};

auth.verifyToken = function (options, token) {
  options || (options = {});

  // TODO: warn on empty secret?
  return new Promise(function (resolve, reject) {
    jwt.verify(token, options.secret, options.verify, function (error, data) {
      if (error) {
        //
        // lift verification errors into 401 Unauthorized responses
        //
        error.status = 401
        reject(error)
      }
      else {
        resolve(data);
      }
    });
  });
};

module.exports = auth;
