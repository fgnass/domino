var fs = require('fs');
var assert = require('assert');
var Path = require('path');
var domino = require('../../../lib');

function read(file) {
  return fs.readFileSync(Path.resolve(__dirname, '..', file), 'utf8');
}

var testharness = read(__dirname + '/testharness.js');

function list(dir, fn) {
  var result = {};
  dir = Path.resolve(__dirname, '..', dir);
  fs.readdirSync(dir).forEach(function(file) {
    var path = Path.join(dir, file);
    var stat = fs.statSync(path);
    if (stat.isDirectory()) {
      result[file] = list(path, fn);
    }
    else if (file.match(/\.x?html$/)) {
      result[file] = fn(path);
    }
  });
  return result;
}

module.exports = function(path) {
  return list(path, function(file) {
    return function() {
      var html = read(file);
      var window = domino.createWindow(html);
      window._run(testharness);
      var scripts = window.document.getElementsByTagName('script');
      if (scripts.length) {
        var script = scripts[scripts.length-1];
        window._run(script.textContent);
      }
    };
  });
};
