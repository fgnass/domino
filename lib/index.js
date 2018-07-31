"use strict";
var DOMImplementation = require('./DOMImplementation');
var HTMLParser = require('./HTMLParser');
var Window = require('./Window');

exports.createDOMImplementation = function() {
  return new DOMImplementation(null);
};

exports.createDocument = function(html, force) {
  // Previous API couldn't let you pass '' as a document, and that
  // yields a slightly different document than createHTMLDocument('')
  // does.  The new `force` parameter lets you pass '' if you want to.
  if (html || force) {
    var parser = new HTMLParser();
    parser.parse(html || '', true);
    return parser.document();
  }
  return new DOMImplementation(null).createHTMLDocument("");
};

exports.createWindow = function(html, address) {
  var document = exports.createDocument(html);
  if (address !== undefined) { document._address = address; }
  return new Window(document);
};

exports.impl = require('./impl');
