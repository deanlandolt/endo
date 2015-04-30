var lodash = require('lodash');

//
// process and normalize api endpoints
//
exports.parse = function(api) {

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

  function process(api, parsed) {
    var version = api.version = api.version || '*';
    var routes = parsed[version] = parsed[version] = {};
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
          // add endpoint descriptor to route map
          //
          routes[endpoint.path] = endpoint;

          //
          // normalize method names
          //
          endpoint.method = (endpoint.method || 'GET').toUpperCase();
        }
      }

      //
      // parse previous api routes if provided
      //
      if (api.previous) {
        process(api.previous, parsed);
      }
    }
  }

  return process(api || {}, {});
};
