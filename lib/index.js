var DOMImplementation = require('./DOMImplementation');
var HTMLParser = require('./HTMLParser');
var Window = require('./Window');
var events = require('events');

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

exports.Parser = function() {
  events.EventEmitter.apply(this);
  var parser = new HTMLParser();
  this.parse = function(input) {
    // TODO: Check if input is EventEmitter or String
    input.on('data', function(chunk) {
      parser.parse(chunk.toString());
    });
    input.on('end', function() {
      parser.parse('', true);
      this.emit('end');
    }.bind(this));
  }
  this.document = function() {
    return parser.document();
  }
}
exports.Parser.prototype = new events.EventEmitter();