var path = require('path');
var xtend = require('xtend');
var ecstatic = require('ecstatic');

function parsePermission(endpoint) {
  var annotations = endpoint.handler && endpoint.handler.annotations || {};
  return annotations.permission ? [ annotations.permission ] : []
}

function parseExamples(examples) {
  var results = [];
  for (var title in examples) {
    var example = examples[title];
    results.push({
      title: title,
      type: example.syntax || 'string',
      content: typeof example === 'string' ? example : example.content
    });
  }
  return results;
}

function parseFieldGroup(fields, group) {
  var results = [];

  for (var key in fields) {
    var field = fields[key];
    var result = {
      group: group,
      type: field.type,
      field: key,
      optional: field.required === false,
      description: field.description || ''
    };
    results.push(result);
  }

  return results;
}

function parseFields(fields, prefix) {
  fields || (fields = {});
  var value = { fields: {} };

  for (var name in fields) {
    var group = prefix + name;
    value.fields[group] = parseFieldGroup(fields[name], group);
  }

  return value;
}

function parseParams(params) {
  var result = parseFields({ '': params }, 'Parameter');
  var fields = result.fields && result.fields.Parameter || [];
  return fields.length ? result : {};
}

function parseEndpoint(source, context) {
  var value = {};

  value.name = context.name;
  value.version = context.version;

  value.group = context.groupName || '';
  value.groupTitle = context.group && context.group.title || value.group;

  value.permission = parsePermission(source);

  value.title = source.title;
  value.description = source.description;
  value.type = context.type || (source.method || 'GET').toUpperCase();
  value.url = context.path || source.path;

  value.parameter = parseParams(source.params);
  value.success = parseFields(source.success, 'Success ');
  value.error = parseFields(source.error, 'Error ');

  value.examples = parseExamples(source.examples || {});

  return value;
}

function parseApi(api, results) {
  results || (results = []);

  var context = { version: api.version };

  //
  // endpoints organized by group
  //
  var name, endpoints;
  for (var groupName in api.groups) {
    context.groupName = groupName;
    var group = context.group = api.groups[groupName] || {};

    // clear any context values that may have been written
    context.path = '';
    context.type = '';

    endpoints = group.endpoints || {};
    for (name in endpoints) {
      context.name = name;
      results.push(parseEndpoint(endpoints[name], context));
    }
  }

  //
  // parse previous api data if present
  //
  if (api.previous) {
    parseApi(api.previous, results);
  }

  return results;
}

function parseProfile(config) {
  //
  // conservatively remap properties manually for apidocjs config
  //
  var api = config.api || {};
  var profile = xtend({}, api, config);

  profile.name || (profile.name = '');
  profile.title = config.doc.title || profile.title || profile.name;

  var basePath = (config.prefix || '') + (api.prefix || '');
  profile.url = (config.doc.url || '') + basePath;

  profile.header = config.doc.header;
  profile.footer = config.doc.footer;
  profile.template = {
    withCompare: !!api.previous,
    withGenerator: false
  };

  return profile;
}

//
// creates handlers to docs for a provided api definition
//
module.exports = function (config) {
  config || (config = {});
  var api = config.api = config.api || {};
  var doc = config.doc = config.doc || {};

  var docPath = (config.prefix || '') + (doc.prefix || '');
  var API_DATA = 'define(' + JSON.stringify({ api: parseApi(api) }) + ')';
  var API_PROJECT = 'define(' + JSON.stringify(parseProfile(config)) + ')';

  //
  // static asset server for map doc template
  //
  var templateAssets = ecstatic({
    root: path.join(__dirname, 'template'),
    cache: 0
  });

  return {
    test: function (req, res) {
      return req.url.indexOf(docPath) === 0;
    },
    handler: function (req, res) {
      var url = req.url.substring(docPath.length);

      if (url.indexOf('/api_data.js') === 0) {
        res.statusCode = 200;
        res.end(API_DATA);
      }
      else if (url.indexOf('/api_project.js') === 0) {
        res.statusCode = 200;
        res.end(API_PROJECT);
      }
      else {
        req.url = url;
        templateAssets(req, res);
      }
    }
  }
}