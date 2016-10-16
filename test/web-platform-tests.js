var fs = require('fs');
var assert = require('assert');
var Path = require('path');
var domino = require('../lib');

// These are the tests we currently fail.
// Some of these failures are bugs we ought to fix.
var blacklist = [
  'interfaces',
  'documents dom-tree-accessors Document.body',
  'documents dom-tree-accessors Document.currentScript.sub',
  'documents dom-tree-accessors document.embeds-document.plugins-01',
  'documents dom-tree-accessors document.forms',
  'documents dom-tree-accessors document.images',
  'documents dom-tree-accessors document.title-05',
  'documents dom-tree-accessors document.title-07',
  'documents dom-tree-accessors document.title-09',
  'documents dom-tree-accessors nameditem-01',
  'documents dom-tree-accessors nameditem-02',
  'documents dom-tree-accessors nameditem-03',
  'documents dom-tree-accessors nameditem-04',
  'documents dom-tree-accessors nameditem-05',
  'documents dom-tree-accessors nameditem-06',
  'documents dom-tree-accessors document.getElementsByName document.getElementsByName-interface',
  'documents dom-tree-accessors document.getElementsByName document.getElementsByName-namespace-xhtml',
  'documents dom-tree-accessors document.getElementsByName document.getElementsByName-namespace',
  'documents resource-metadata-management document-compatmode-06',
  'documents resource-metadata-management document-cookie',
  'documents resource-metadata-management document-lastModified-01',
  'documents resource-metadata-management document-lastModified',
  'dynamic-markup-insertion closing-the-input-stream document.close-01',
  'dynamic-markup-insertion document-write 001',
  'dynamic-markup-insertion document-write 002',
  'dynamic-markup-insertion document-write 003',
  'dynamic-markup-insertion document-write 004',
  'dynamic-markup-insertion document-write 005',
  'dynamic-markup-insertion document-write 006',
  'dynamic-markup-insertion document-write 007',
  'dynamic-markup-insertion document-write 008',
  'dynamic-markup-insertion document-write 009',
  'dynamic-markup-insertion document-write 010',
  'dynamic-markup-insertion document-write 011',
  'dynamic-markup-insertion document-write 012',
  'dynamic-markup-insertion document-write 013',
  'dynamic-markup-insertion document-write 014',
  'dynamic-markup-insertion document-write 015',
  'dynamic-markup-insertion document-write 016',
  'dynamic-markup-insertion document-write 017',
  'dynamic-markup-insertion document-write 018',
  'dynamic-markup-insertion document-write 019',
  'dynamic-markup-insertion document-write 020',
  'dynamic-markup-insertion document-write 021',
  'dynamic-markup-insertion document-write 022',
  'dynamic-markup-insertion document-write 023',
  'dynamic-markup-insertion document-write 024',
  'dynamic-markup-insertion document-write 025',
  'dynamic-markup-insertion document-write 026',
  'dynamic-markup-insertion document-write 027',
  'dynamic-markup-insertion document-write 028',
  'dynamic-markup-insertion document-write 029',
  'dynamic-markup-insertion document-write 030',
  'dynamic-markup-insertion document-write 031',
  'dynamic-markup-insertion document-write 032',
  'dynamic-markup-insertion document-write 033',
  'dynamic-markup-insertion document-write 034',
  'dynamic-markup-insertion document-write 035',
  'dynamic-markup-insertion document-write 036',
  'dynamic-markup-insertion document-write 037',
  'dynamic-markup-insertion document-write 038',
  'dynamic-markup-insertion document-write 039',
  'dynamic-markup-insertion document-write 040',
  'dynamic-markup-insertion document-write 041',
  'dynamic-markup-insertion document-write 042',
  'dynamic-markup-insertion document-write 043',
  'dynamic-markup-insertion document-write 044',
  'dynamic-markup-insertion document-write 045',
  'dynamic-markup-insertion document-write 046',
  'dynamic-markup-insertion document-write 049',
  'dynamic-markup-insertion document-write 050',
  'dynamic-markup-insertion document-write document.write-01',
  'dynamic-markup-insertion document-write document.write-02',
  'dynamic-markup-insertion document-write iframe_001',
  'dynamic-markup-insertion document-write iframe_002',
  'dynamic-markup-insertion document-write iframe_003',
  'dynamic-markup-insertion document-write iframe_004',
  'dynamic-markup-insertion document-write iframe_006',
  'dynamic-markup-insertion document-write iframe_007',
  'dynamic-markup-insertion document-write iframe_008',
  'dynamic-markup-insertion document-write iframe_009',
  'dynamic-markup-insertion document-write script_002',
  'dynamic-markup-insertion document-write script_004',
  'dynamic-markup-insertion document-write script_005',
  'dynamic-markup-insertion document-write script_006',
  'dynamic-markup-insertion document-write script_007',
  'dynamic-markup-insertion document-write script_008',
  'dynamic-markup-insertion document-write script_009',
  'dynamic-markup-insertion document-write script_010',
  'dynamic-markup-insertion document-write script_011',
  'dynamic-markup-insertion document-write script_012',
  'dynamic-markup-insertion document-write script_013',
  'dynamic-markup-insertion document-writeln document.writeln-01',
  'dynamic-markup-insertion document-writeln document.writeln-02',
  'dynamic-markup-insertion document-writeln document.writeln-03',
  'dynamic-markup-insertion opening-the-input-stream 011-1',
  'dynamic-markup-insertion opening-the-input-stream 012-1',
  'dynamic-markup-insertion opening-the-input-stream 013-1',
  'dynamic-markup-insertion opening-the-input-stream 014-1',
  'dynamic-markup-insertion opening-the-input-stream document.open-01',
  'dynamic-markup-insertion opening-the-input-stream document.open-02',
  'elements global-attributes custom-attrs',
  'elements global-attributes data_unicode_attr',
  'elements global-attributes dataset-delete',
  'elements global-attributes dataset-enumeration',
  'elements global-attributes dataset-get',
  'elements global-attributes dataset-prototype',
  'elements global-attributes dataset-set',
  'elements global-attributes dataset',
  'elements global-attributes dir_auto-contained-script-L-ref',
  'elements global-attributes dir_auto-contained-script-L',
  'elements global-attributes id-attribute',
  'elements global-attributes the-lang-attribute-001',
  'elements global-attributes the-lang-attribute-002',
  'elements global-attributes the-lang-attribute-003',
  'elements global-attributes the-lang-attribute-004',
  'elements global-attributes the-lang-attribute-005',
  'elements global-attributes the-lang-attribute-006',
  'elements global-attributes the-lang-attribute-007',
  'elements global-attributes the-lang-attribute-008',
  'elements global-attributes the-lang-attribute-009',
  'elements global-attributes the-lang-attribute-010',
  'elements global-attributes the-translate-attribute-007',
  'elements global-attributes the-translate-attribute-008',
  'elements global-attributes the-translate-attribute-009',
  'elements global-attributes the-translate-attribute-010',
  'elements global-attributes the-translate-attribute-011',
  'elements global-attributes the-translate-attribute-012',
].map(function(s) {
  // Convert strings to equivalent regular expression matchers.
  if (typeof s === 'string') {
    return new RegExp('^' + s.replace(/[\^\\$*+?.()|{}\[\]\/]/g, '\\$&') + '$');
  } else {
    return s;
  }
});

var onBlacklist = function(name) {
  name = name.replace(/\//g, ' ').replace(/\.x?html$/, '');
  for (var i=0; i<blacklist.length; i++) {
    if (blacklist[i].test(name)) { return true; }
  }
  return false;
};

function read(file) {
  return fs.readFileSync(Path.resolve(__dirname, '..', file), 'utf8');
}

var testharness = read(__dirname + '/web-platform-tests/resources/testharness.js');

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

var harness = function(path) {
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
      // Workaround for https://github.com/w3c/web-platform-tests/pull/3984
      concatenatedScripts = 'var x;\n' + concatenatedScripts;

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

module.exports = harness(__dirname + '/web-platform-tests/html/dom');
