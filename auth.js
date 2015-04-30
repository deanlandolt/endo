var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var xtend = require('xtend');

//
// pattern for extracting BEARER token from auhorization header
//
var BEARER_RE = /^bearer\s+(.+)$/i;

//
// wrapper to add JWT-based bearer auth to an endo instance
//
function auth(endo, options) {
  //
  // mix in provided options to any existing auth config
  //
  var options = endo.auth = xtend(endo.auth, options);

  //
  // add token utility methods, binding first options arg
  //
  endo.createToken = auth.createToken.bind(null, options);
  endo.verifyToken = auth.verifyToken.bind(null, options);

  //
  // verify provided credentials are valid and return auth context
  //
  endo.authenticate = function(request) {
    //
    // parse auth header for JWT token
    //
    var header = request.headers.authorization || '';
    var match = header.match(BEARER_RE);
    if (!match) {
      return endo.unauthorized('Token required');
    }

    //
    // users may wrap authenticate method to perform additional verifications
    //
    return auth.verifyToken(match[1], endo.auth).then(function (token) {
      
    }).catch(function (error) {
      return endo.unauthorized(error.message);
    });
  };

  return endo;
};

auth.createToken = function (options, data) {
  options || (options = {});
  return jwt.sign(data, options.secret, options.sign);
};

auth.verifyToken = function (options, token) {
  options || (options = {});
  // TODO: warn on empty secret?
  return new Promise(function (resolve, reject) {
    jwt.verify(token, options.secret, options.verify, function (error, data) {
      error ? reject(error) : resolve(data);
    });
  });
};

module.exports = auth;
