"use strict";
var HTMLParser = require("./HTMLParser");
var utils = require("./utils");

// https://www.w3.org/TR/DOM-Parsing/#the-domparser-interface

var supportedTypes = [
  "text/html",
  "text/xml",
  "application/xml",
  "application/xhtml+xml",
  "image/svg+xml"
];

function DOMParserWrapper(win) {
  function DOMParser() {}

  DOMParser.prototype = {
    parseFromString: function(str, type) {
      if (arguments.length < 2) {
        throw new TypeError(
          "Not enough arguments to DOMParser.parseFromString."
        );
      }

      if (supportedTypes.indexOf(type) === -1) {
        throw new TypeError(
          "Argument 2 of DOMParser.parseFromString '" + type +
          "' is not a valid value for enumeration SupportedType."
        );
      }

      var isHTML = /html$/.test(type);
      var doc = null;
      var address = win.document._address;
      var parserOptions = {scripting_enabled: false};

      if (isHTML) {
        // As per spec, set the address to the active document URL and disable
        // the scripting flag, so "noscript" tags are parsed correctly.
        var parser = new HTMLParser(address, undefined, parserOptions);

        parser.parse(str || "", true);

        doc = parser.document();
      } else {
        // TODO: XML parsing code
        utils.nyi();
      }

      if (doc) {
        // Set the correct content type:
        doc._contentType = type;

        // Set the location to null:
        // (currently it throws, because the location setter is not yet
        // implemented, however, by default, it should already be null)
        /*doc.location = null;*/
      } else {
        throw new Error("This should never happen");
      }

      return doc;
    }
  };

  return DOMParser;
}

module.exports = DOMParserWrapper;
