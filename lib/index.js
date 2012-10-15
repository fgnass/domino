var DOMImplementation = require('./DOMImplementation');
var HTMLParser = require('./HTMLParser');
var Window = require('./Window');

exports.createDOMImplementation = function() {
  return new DOMImplementation();
};

exports.createDocument = function(html) {
  if (html) {
    var parser = new HTMLParser();
    parser.parse(html, true);
    return parser.document();
  }
  return new DOMImplementation().createHTMLDocument("");
};

exports.createWindow = function(html) {
  var document = exports.createDocument(html);
  return new Window(document);
};

exports.impl = require('./impl');
