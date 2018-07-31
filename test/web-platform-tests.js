/* globals add_completion_callback */
'use strict';
var fs = require('fs');
var Path = require('path');
var domino = require('../lib');
var Window = require('../lib/Window');

var BLACKLIST_PATH = Path.resolve(__dirname, 'web-platform-blacklist.json');
// Set to true and delete the existing blacklist file to regenerate the
// blacklist from currently-failing tests.
var WRITE_BLACKLIST = false;

// These are the tests we currently fail.
// Some of these failures are bugs we ought to fix.
var blacklist = {};
try {
  blacklist = require(BLACKLIST_PATH);
} catch(e) {
  // We expect that you deleted the old blacklist before using WRITE_BLACKLIST
  if (!WRITE_BLACKLIST) { throw e; }
}

var escapeRegExp = function(s) {
  // Note that JSON is not a subset of JavaScript: it allows \u2028 and \u2029
  // to be embedded as literals.  Escape them in the regexp to prevent this
  // from causing a syntax error when we eval() this regexp.
  return s.replace(/[\^\\$*+?.()|{}\[\]\/]/g, '\\$&')
    .replace(/[\u2028\u2029]/, function(c) {
      var cp = c.codePointAt(0).toString(16);
      while (cp.length < 4) { cp = '0' + cp; }
      return '\\u' + cp;
    });
};

var onBlacklist = function(name) {
  if (WRITE_BLACKLIST) { return 0; }
  if (!Array.isArray(blacklist[name])) { return 0; }
  // convert strings to huge regexp
  return '^(' + blacklist[name].map(escapeRegExp).join('|') + ')$';
};

// Test suite requires Array.includes(); polyfill from
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
/* jshint bitwise: false */
if (!Array.prototype.includes) {
  Object.defineProperty(Array.prototype, 'includes', {
    value: function(searchElement, fromIndex) {
      if (this === null || this === undefined) {
        throw new TypeError('"this" is null or not defined');
      }
      var o = Object(this);
      var len = o.length >>> 0;
      if (len === 0) {
        return false;
      }
      var n = fromIndex | 0;
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);

      function sameValueZero(x, y) {
        return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y));
      }

      while (k < len) {
        if (sameValueZero(o[k], searchElement)) {
          return true;
        }
        k++;
      }
      return false;
    }
  });
}
// Test suite requires Array.values() as well
if (global.Symbol && global.Symbol.iterator && !Array.prototype.values) {
  Object.defineProperty(
    Array.prototype, 'values',
    Object.getOwnPropertyDescriptor(Array.prototype, global.Symbol.iterator)
  );
}

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

var harness = function() {
  var paths = [].slice.call(arguments);
  return paths.map(function (path) {
    return list(path, '', function(name, file) {
      if (/\/html\/dom\/reflection-original.html$/.test(file)) {
        // This is a compilation file & not a test suite.
        return; // skip
      }
      var html = read(file);
      var window = domino.createWindow(html, 'http://example.com/');
      Array.from(window.document.getElementsByTagName('iframe')).forEach(function(iframe) {
        if (iframe.src === 'http://example.com/common/dummy.xml') {
          var dummyXmlDoc = domino.createDOMImplementation().createDocument(
            'http://www.w3.org/1999/xhtml', 'html', null
          );
          dummyXmlDoc._contentType = 'application/xml';
          iframe._contentWindow = new Window(dummyXmlDoc);
          var foo = dummyXmlDoc.createElement('foo');
          foo.textContent = 'Dummy XML document';
          dummyXmlDoc.documentElement.appendChild(foo);
        }
        if (iframe.src === 'http://example.com/common/dummy.xhtml') {
          var dummyXhtml = read('test/web-platform-tests/common/dummy.xhtml');
          var dummyXhtmlAsHtml = domino.createDocument(dummyXhtml);
          // Tweak this a tiny bit, since we actually used an HTML parser not
          // an XML parser.
          dummyXhtmlAsHtml.body.textContent = '';
          // Create a proper XML document, and copy the HTML contents into it
          var dummyXhtmlDoc = domino.createDOMImplementation().createDocument(
            'http://www.w3.org/1999/xhtml', 'html', null
          );
          dummyXhtmlDoc._contentType = 'application/xhtml+xml';
          dummyXhtmlDoc.insertBefore(
            dummyXhtmlDoc.adoptNode(dummyXhtmlAsHtml.doctype),
            dummyXhtmlDoc.documentElement
          );
          dummyXhtmlDoc.documentElement.appendChild(
            dummyXhtmlDoc.adoptNode(dummyXhtmlAsHtml.head)
          );
          dummyXhtmlDoc.documentElement.appendChild(
            dummyXhtmlDoc.adoptNode(dummyXhtmlAsHtml.body)
          );
          iframe._contentWindow = new Window(dummyXhtmlDoc);
        }
      });
      window._run(testharness);
      var scripts = window.document.getElementsByTagName('script');
      scripts = [].slice.call(scripts);

      return function() {
        var listen = function listen(expectedFailures) {
          add_completion_callback(function(tests, status) {
            var failed = tests.filter(function(t) {
              if (t.status === t.TIMEOUT) { return true; /* never ok */ }
              var expectFail =
                  (typeof expectedFailures === 'string') ?
                  new RegExp(expectedFailures).test(t.name) : false;
              var actualFail = (t.status === t.FAIL);
              return expectFail !== actualFail;
            });
            if (failed.length) {
              var report = failed.map(function(t) {
                var item = { name: t.name, message: t.message };
                if (t.status===t.TIMEOUT) { item.status = 'TIMEOUT'; }
                else if (t.status!==t.FAIL) { item.status = 'EXPECT FAIL'; }
                return item;
              });
              var e = new Error("Unexpected results");
              e.report = report;
              throw e;
            }
          });
        };
        window._run("(" + listen.toString() + ")("+JSON.stringify(onBlacklist(name))+");");

        var concatenatedScripts = scripts.map(function(script) {
          if (/^text\/plain$/.test(script.getAttribute('type')||'')) {
            return '';
          }
          if (/^(\w+|..)/.test(script.getAttribute('src')||'')) {
            var f = Path.resolve(path, script.getAttribute('src'));
            if (fs.existsSync(f)) { return read(f); }
          }
          var textContent = script.textContent;
          if (/\.xhtml$/.test(file)) {
            // hacky way to expand entities
            var txt = window.document.createElement('textarea');
            txt.innerHTML = textContent;
            textContent = txt.value;
          }
          return textContent + '\n';
        }).join("\n");
        concatenatedScripts =
          concatenatedScripts.replace(/\.attributes\[(\w+)\]/g,
                                      '.attributes.item($1)');
        // Some tests use [...foo] syntax for `Array.from(foo)`
        concatenatedScripts =
          concatenatedScripts.replace(/\[\.\.\.(\w+)\]/g,
                                      'Array.from($1)');
        // Workaround for https://github.com/w3c/web-platform-tests/pull/3984
        concatenatedScripts =
          '"use strict";\n' +
          'var x, doc, ReflectionTests;\n' +
          // Hack in globals on window object
          '"String|Boolean|Number".split("|").forEach(function(x){' +
            'window[x] = global[x];})\n' +
          // Hack in frames on window object
          'Array.prototype.forEach.call(document.getElementsByTagName("iframe"),' +
            'function(f,i){window[i]=f.contentWindow;});\n' +
          'window.setup = function(f) { f(); };\n' +
          concatenatedScripts +
          '\nwindow.dispatchEvent(new Event("load"));';

        var go = function() {
          window._run(concatenatedScripts);
        };
        try {
          go();
        } catch (e) {
          if (WRITE_BLACKLIST) {
            var bl = {};
            try {
              bl = JSON.parse(fs.readFileSync(BLACKLIST_PATH, 'utf-8'));
            } catch (e) { /* ignore */ }
            if (e.message === 'Unexpected results') {
              bl[name] = e.report.map(function(item) { return item.name; });
            } else {
              bl[name] = e.message;
            }
            fs.writeFileSync(
              BLACKLIST_PATH, JSON.stringify(bl, null, 2), 'utf-8'
            );
          } else {
            if (e.message === 'Unexpected results') {
              var str = e.report.map(function(item) {
                var s = item.name;
                if (item.message) s += ': ' + item.message;
                if (item.status) s += ' ['+item.status+']';
                return s;
              }).join('\n\n');
              throw new Error(str);
            } else if (e.message !== blacklist[name]) {
              throw e;
            }
          }
        }
      };
    });
  });
};

module.exports = harness(__dirname + '/web-platform-tests/html/dom',
                         __dirname + '/web-platform-tests/dom/nodes');
