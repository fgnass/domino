var parserlib = require('./cssparser');

module.exports = CSSStyleDeclaration;

function CSSStyleDeclaration(elt) {
  this._element = elt;
}

// Utility function for parsing style declarations
// Pass in a string like "margin-left: 5px; border-style: solid"
// and this function returns an object like
// {"margin-left":"5px", "border-style":"solid"}
function parseStyles(s) {
  var parser = new parserlib.css.Parser();
  var result = {};
  parser.addListener("property", function(e) {
    if (e.invalid) return; // Skip errors
    result[e.property.text] = e.value.text;
    if (e.important) result.important[name] = e.important;
  });
  s = (''+s).replace(/^;/, '');
  parser.parseStyleAttribute(s);
  return result;
}

CSSStyleDeclaration.prototype = Object.create(Object.prototype, {

  // Return the parsed form of the element's style attribute.
  // If the element's style attribute has never been parsed
  // or if it has changed since the last parse, then reparse it
  // Note that the styles don't get parsed until they're actually needed
  _parsed: { get: function() {
    if (!this._parsedStyles || this.cssText !== this._lastParsedText) {
      var text = this.cssText;
      this._parsedStyles = parseStyles(text);
      this._lastParsedText = text;
      delete this._names;
    }
    return this._parsedStyles;
  }},

  // Call this method any time the parsed representation of the
  // style changes.  It converts the style properties to a string and
  // sets cssText and the element's style attribute
  _serialize: { value: function() {
    var styles = this._parsed;
    var s = "";

    for(var name in styles) {
      if (s) s += "; ";
      s += name + ":" + styles[name]
    }

    this.cssText = s;      // also sets the style attribute
    this._lastParsedText = s;  // so we don't reparse
    delete this._names;
  }},

  cssText: {
    get: function() {
      // XXX: this is a CSSStyleDeclaration for an element.
      // A different impl might be necessary for a set of styles
      // associated returned by getComputedStyle(), e.g.
      return this._element.getAttribute("style");
    },
    set: function(value) {
      // XXX: I should parse and serialize the value to
      // normalize it and remove errors. FF and chrome do that.
      this._element.setAttribute("style", value);
    }
  },

  length: { get: function() {
    if (!this._names)
      this._names = Object.getOwnPropertyNames(this._parsed);
    return this._names.length;
  }},

  item: { value: function(n) {
    if (!this._names)
      this._names = Object.getOwnPropertyNames(this._parsed);
    return this._names[n];
  }},

  getPropertyValue: { value: function(property) {
    return this._parsed[property.toLowerCase()];
  }},

  // XXX: for now we ignore !important declarations
  getPropertyPriority: { value: function(property) {
    return "";
  }},

  // XXX the priority argument is ignored for now
  setProperty: { value: function(property, value, priority) {
    property = property.toLowerCase();
    if (value === null || value === undefined) {
      value = "";
    }

    // String coercion
    value = "" + value;

    // XXX are there other legal priority values?
    if (priority !== undefined && priority !== "important")
      return;

    // We don't just accept the property value.  Instead
    // we parse it to ensure that it is something valid.
    // If it contains a semicolon it is invalid
    if (value.indexOf(";") !== -1) return;

    var newvalue = value;
    if (value.length) {
      var props = parseStyles(property + ":" + value);
      newvalue = props[property];
      // If there is no value now, it wasn't valid
      if (!newvalue) return;
    }

    var styles = this._parsed;

    // If the value didn't change, return without doing anything.
    var oldvalue = styles[property];
    if (newvalue === oldvalue) return;

    styles[property] = value;

    // Serialize and update cssText and element.style!
    this._serialize();
  }},

  removeProperty: { value: function(property) {
    property = property.toLowerCase();
    var styles = this._parsed;
    if (property in styles) {
      delete styles[property];

      // Serialize and update cssText and element.style!
      this._serialize();
    }
  }},
});

var cssProperties = {
  background: "background",
  backgroundAttachment: "background-attachment",
  backgroundColor: "background-color",
  backgroundImage: "background-image",
  backgroundPosition: "background-position",
  backgroundRepeat: "background-repeat",
  border: "border",
  borderCollapse: "border-collapse",
  borderColor: "border-color",
  borderSpacing: "border-spacing",
  borderStyle: "border-style",
  borderTop: "border-top",
  borderRight: "border-right",
  borderBottom: "border-bottom",
  borderLeft: "border-left",
  borderTopColor: "border-top-color",
  borderRightColor: "border-right-color",
  borderBottomColor: "border-bottom-color",
  borderLeftColor: "border-left-color",
  borderTopStyle:	"border-top-style",
  borderRightStyle: "border-right-style",
  borderBottomStyle: "border-bottom-style",
  borderLeftStyle: "border-left-style",
  borderTopWidth: "border-top-width",
  borderRightWidth: "border-right-width",
  borderBottomWidth: "border-bottom-width",
  borderLeftWidth: "border-left-width",
  borderWidth: "border-width",
  bottom: "bottom",
  captionSide: "caption-side",
  clear: "clear",
  clip: "clip",
  color: "color",
  content: "content",
  counterIncrement: "counter-increment",
  counterReset: "counter-reset",
  cursor: "cursor",
  direction: "direction",
  display: "display",
  emptyCells: "empty-cells",
  cssFloat: "float",
  font: "font",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontSizeAdjust: "font-size-adjust",
  fontStretch: "font-stretch",
  fontStyle: "font-style",
  fontVariant: "font-variant",
  fontWeight: "font-weight",
  height: "height",
  left: "left",
  letterSpacing: "letter-spacing",
  lineHeight: "line-height",
  listStyle: "list-style",
  listStyleImage: "list-style-image",
  listStylePosition: "list-style-position",
  listStyleType: "list-style-type",
  margin: "margin",
  marginTop: "margin-top",
  marginRight: "margin-right",
  marginBottom: "margin-bottom",
  marginLeft: "margin-left",
  markerOffset: "marker-offset",
  marks: "marks",
  maxHeight: "max-height",
  maxWidth: "max-width",
  minHeight: "min-height",
  minWidth: "min-width",
  opacity: "opacity",
  orphans: "orphans",
  outline: "outline",
  outlineColor: "outline-color",
  outlineStyle: "outline-style",
  outlineWidth: "outline-width",
  overflow: "overflow",
  padding: "padding",
  paddingTop: "padding-top",
  paddingRight: "padding-right",
  paddingBottom: "padding-bottom",
  paddingLeft: "padding-left",
  page: "page",
  pageBreakAfter: "page-break-after",
  pageBreakBefore: "page-break-before",
  pageBreakInside: "page-break-inside",
  position: "position",
  quotes: "quotes",
  right: "right",
  size: "size",
  tableLayout: "table-layout",
  textAlign: "text-align",
  textDecoration: "text-decoration",
  textIndent: "text-indent",
  textShadow: "text-shadow",
  textTransform: "text-transform",
  top: "top",
  unicodeBidi: "unicode-bidi",
  verticalAlign: "vertical-align",
  visibility: "visibility",
  whiteSpace: "white-space",
  widows: "widows",
  width: "width",
  wordSpacing: "word-spacing",
  zIndex: "z-index",
};

for(var prop in cssProperties) defineStyleProperty(prop);

function defineStyleProperty(jsname) {
  var cssname = cssProperties[jsname];
  Object.defineProperty(CSSStyleDeclaration.prototype, jsname, {
    get: function() {
      return this.getPropertyValue(cssname);
    },
    set: function(value) {
      // XXX Handle important declarations here!
      this.setProperty(cssname, value);
    }
  });
}
