var fs = require('fs');
var assert = require('assert');
var Path = require('path');
var domino = require('../../../lib');

// These are the tests we currently fail.
// Some of these failures are bugs we ought to fix.
var blacklist = [
  /apis-in-html-documents Element\.getElementsByTagName-foreign-02/,
  /dom-tree-accessors document\.body-getter-frameset-and-body/,
  /dom-tree-accessors document\.body-setter-01/,
  /dom-tree-accessors document\.embeds-document\.plugins-01/,
  /dom-tree-accessors nameditem-01/,
  /dom-tree-accessors document\.getElementsByName document\.getElementsByName-namespace/,
  /dynamic-markup-insertion document\.close-01/,
  /dynamic-markup-insertion document\.open-0[12]/,
  /dynamic-markup-insertion document\.write-0[12]/,
  /dynamic-markup-insertion document\.writeln-0[12]/,
  /general interfaces/,
  /global-attributes dataset/,
  /obsolete-features requirements-for-implementations other-elements-attributes-and-apis document-color-0[1234]/,
  /obsolete-features requirements-for-implementations other-elements-attributes-and-apis document\.all-0[12345]/,
  /obsolete-features requirements-for-implementations other-elements-attributes-and-apis heading-obsolete-attributes-01/,
  /obsolete-features requirements-for-implementations other-elements-attributes-and-apis script-IDL-event-htmlfor/,
  /resource-metadata-management document-compatmode-06/,
  /the-elements-of-html document-metadata the-link-element link-rellist/,
  /the-elements-of-html document-metadata the-title-element title\.text-0[12]/,
  /the-elements-of-html forms the-form-element form-elements-interfaces-01/,
  /the-elements-of-html forms the-form-element form-elements-matches/,
  /the-elements-of-html forms the-form-element form-elements-nameditem-0[12]/,
  /the-elements-of-html forms the-input-element input-textselection-01/,
  /the-elements-of-html forms the-textarea-element textarea-type/,
  /the-elements-of-html scripting the-script-element script-languages-01/,
  /the-elements-of-html scripting the-script-element script-noembed-noframes-iframe/,
  /the-elements-of-html tabular-data the-table-element insertRow-method-0[12]/,
  /the-elements-of-html text-level-semantics the-a-element a\.text-setter-01/,
  /the-elements-of-html text-level-semantics the-a-element a\.text-getter-01/,
];

var onBlacklist = function(name) {
  name = name.replace(/\//g, ' ');
  for (var i=0; i<blacklist.length; i++) {
    if (blacklist[i].test(name)) { return true; }
  }
  return false;
};

function read(file) {
  return fs.readFileSync(Path.resolve(__dirname, '..', file), 'utf8');
}

var testharness = read(__dirname + '/testharness.js');

function list(base, dir, fn) {
  var result = {};
  var fulldir = Path.resolve(__dirname, '..', base, dir);
  fs.readdirSync(fulldir).forEach(function(file) {
    var path = Path.join(dir, file);
    var stat = fs.statSync(Path.join(fulldir, file));
    if (stat.isDirectory()) {
      result[file] = list(base, path, fn);
    }
    else if (file.match(/\.x?html$/)) {
      var test = fn(path, Path.join(fulldir, file));
      if (test) result[file] = test;
    }
  });
  return result;
}

module.exports = function(path) {
  return list(path, '', function(name, file) {
    var html = read(file);
    var window = domino.createWindow(html);
    window._run(testharness);
    var scripts = window.document.getElementsByTagName('script');
    scripts = [].slice.call(scripts);

    return function() {
      function listenForFailures() {
        add_result_callback(function(result) {
          if (result.status === result.FAIL) {
            throw new Error(result.message);
          }
        });
      }
      window._run("(" + listenForFailures.toString() + ")();");

      var concatenatedScripts = scripts.map(function(script) {
        return script.textContent;
      }).join("\n");

      var go = function() {
        window._run(concatenatedScripts);
      };
      if (onBlacklist(name)) {
        assert.throws(go, 'Expected test to fail.');
      } else {
        go();
      }
    };
  });
};
