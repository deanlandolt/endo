var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var util = require('./util');

//
// pattern for extracting BEARER token from auhorization header
//
var BEARER_RE = /^bearer\s+(.+)$/i;

//
// wrapper to add JWT-based bearer auth to an endo instance
//
function auth(endo, options) {
  //
  // add token utility methods, binding first options arg
  //
  endo.createToken = auth.createToken.bind(null, options.sign);
  endo.verifyToken = auth.verifyToken.bind(null, options.verify);

  //
  // verify provided credentials are valid and return auth context
  //
  var _handleRequest = endo.handleRequest;
  endo.handleRequest = function(request) {
    var args = arguments;

    return Promise.resolve(endo.authenticate(request)).then(function () {
      return _handleRequest.apply(endo, args);
    });
  };

  endo.authenticate = function (request) {
    //
    // no auth if request already contains user auth data
    //
    if (request.user !== undefined) {
      return;
    }

    //
    // parse auth header for JWT token
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
