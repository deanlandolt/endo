var assert = require('assert');
var inherits = require('util').inherits;
var lodash = require('lodash');
var paramify = require('paramify');
var semver = require('semver');

var util = exports;

//
// process and normalize api endpoints
//
util.parse = function(api) {

  function resolveRoles(roles) {
    for (var key in roles) {
      var role = roles[key];
      role.includes = lodash.compact(lodash.unique(role.includes));
    }

    return roles;
  }

  function resolvePerms(perms, parent) {
    if (perms === 'string') {
      perms = [ perms ];
    }

    return lodash.union(lodash.compact(perms), parent);
  }

  function parse(api, parsed) {
    var version = api.version = semver.valid(api.version);
    assert(version, 'Invalid API version specified: ' + api.version);

    var routes = parsed[version] = {};
    var roles = api.roles = resolveRoles(api.roles || {});

    //
    // endpoints are organized into sections
    //
    for (var sectionName in api.sections) {
      var section = api.sections[sectionName];
      var perms = section.permissions = resolvePerms(section.permissions);
      var endpoints = section.endpoints || {};

      for (var name in endpoints) {
        var endpoint = endpoints[name];
        endpoint.version = version;
        endpoint.permissions = resolvePerms(endpoint.permissions, perms);

        if (endpoint.path) {
          //
          // normalize method names
          //
          endpoint.method = (endpoint.method || 'GET').toUpperCase();

          //
          // add endpoint descriptor to route map
          //
          routes[endpoint.method + ':' + endpoint.path] = endpoint;
        }
      }

      //
      // parse previous api routes if provided
      //
      if (api.previous) {
        parse(api.previous, parsed);
      }
    }

    return parsed;
  }

  return parse(api || {}, {});
};

util.validRange = semver.validRange;

//
// look up an endpoint from provided context:
// requires endpointPath value, with optional method and endpointRange
//
util.getEndpoint = function (endpoints, context) {
  var path = context.endpointPath;
  if (!path) {
    throw new util.NotFoundError('No path provided');
  }

  var range = util.validRange(context.endpointRange || '*');
  if (range == null) {
    throw new util.NotFoundError('Invalid range: ' + context.endpointRange);
  }

  var match = paramify(path);
  var method = (context.method || 'GET').toUpperCase();

  //
  // return default discovery/index endpoint
  //
  if (path === '/') {
    // TODO: filter results by range, if provided, or other visibility filters
    return {
      handler: function () {
        return endpoints;
      }
    }
  }

  //
  // iterate over available routes for all versions (naturally descending)
  //
  for (var version in endpoints) {
    if (!semver.satisfies(version, range)) {
      continue;
    }

    var candidates = endpoints[version];
    for (var route in candidates) {
      endpoint = candidates[route];
      if (endpoint.method === method) {

        //
        // match route by provided path and optional method
        //
        // TODO: cache transform or replace with route matcher that does curlies
        var mungedPath = endpoint.path.replace(/\{(.*)\}/g, ':$1');
        if (match(mungedPath)) {
          //
          // add endpoint and match params to context and return endpoint
          //
          context.endpoint = endpoint;
          context.endpointParams = match.params;
          return endpoint;
        }
      }
    }
  }

  //
  // no endpoint found
  //
  throw new util.NotFoundError(method + ' ' + path + ' @ ' + range);
};

//
// helper to look up a complete set of permissions given available roles
//
util.resolvePermissions = function (permissions, roles) {
  var perms = lodash.compact(permissions).map(function (perm) {
    return [ perm ].concat(roles[perm].includes);
  });
  return lodash.compact(lodash.union(perms));
};

//
// verify a set of avilable permissions against a required set
//
util.hasPermissions = function (required, available) {
  //
  // required permissions should be fully subsumed by available permissions
  //
  return lodash.intersection(required, available).length === required.length;
};

util.isStream = function (body) {
  return !!(body && typeof body.pipe === 'function');
}

util.isObjectMode = function (body) {
  if (util.isStream(body)) {
    return !!(body._readableState && body._readableState.objectMode);
  }

  return !Buffer.isBuffer(body);
}

//
// thrown when endpoint authorization fails
//
function UnauthorizedError(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.status = 401;
  this.message = 'Unauthorized: ' + message;
  this.name = this.constructor.name;
}

inherits(UnauthorizedError, Error);
util.UnauthorizedError = UnauthorizedError;

//
// thrown when endpoint resolution fails
//
function NotFoundError(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.status = 404;
  this.message = 'Not Found: ' + message;
  this.name = this.constructor.name;
}

inherits(NotFoundError, Error);
util.NotFoundError = NotFoundError;
