module.exports = HTMLParser;

var Document = require('./Document');
var DocumentType = require('./DocumentType');
var Node = require('./Node');
var NAMESPACE = require('./utils').NAMESPACE;
var html = require('./htmlelts');
var impl = html.elements;

var pushAll = Function.prototype.apply.bind(Array.prototype.push);

/*
 * This file contains an implementation of the HTML parsing algorithm.
 * The algorithm and the implementation are complex because HTML
 * explicitly defines how the parser should behave for all possible
 * valid and invalid inputs.
 *
 * Usage:
 *
 * The file defines a single HTMLParser() function, which dom.js exposes
 * publicly as document.implementation.mozHTMLParser(). This is a
 * factory function, not a constructor.
 *
 * When you call document.implementation.mozHTMLParser(), it returns
 * an object that has parse() and document() methods. To parse HTML text,
 * pass the text (in one or more chunks) to the parse() method.  When
 * you've passed all the text (on the last chunk, or afterward) pass
 * true as the second argument to parse() to tell the parser that there
 * is no more coming. Call document() to get the document object that
 * the parser is parsing into.  You can call this at any time, before
 * or after calling parse().
 *
 * The first argument to mozHTMLParser is the absolute URL of the document.
 *
 * The second argument is optional and is for internal use only.  Pass an
 * element as the fragmentContext to do innerHTML parsing for the
 * element.  To do innerHTML parsing on a document, pass null. Otherwise,
 * omit the 2nd argument. See HTMLElement.innerHTML for an example.  Note
 * that if you pass a context element, the end() method will return an
 * unwrapped document instead of a wrapped one.
 *
 * Implementation details:
 *
 * This is a long file of almost 7000 lines. It is structured as one
 * big function nested within another big function.  The outer
 * function defines a bunch of constant data, utility functions
 * that use that data, and a couple of classes used by the parser.
 * The outer function also defines and returns the
 * inner function. This inner function is the HTMLParser factory
 * function that implements the parser and holds all the parser state
 * as local variables.  The HTMLParser function is quite big because
 * it defines many nested functions that use those local variables.
 *
 * There are three tightly coupled parser stages: a scanner, a
 * tokenizer and a tree builder. In a (possibly misguided) attempt at
 * efficiency, the stages are not implemented as separate classes:
 * everything shares state and is (mostly) implemented in imperative
 * (rather than OO) style.
 *
 * The stages of the parser work like this: When the client code calls
 * the parser's parse() method, the specified string is passed to
 * scanChars(). The scanner loops through that string and passes characters
 * (sometimes one at a time, sometimes in chunks) to the tokenizer stage.
 * The tokenizer groups the characters into tokens: tags, endtags, runs
 * of text, comments, doctype declarations, and the end-of-file (EOF)
 * token.  These tokens are then passed to the tree building stage via
 * the insertToken() function.  The tree building stage builds up the
 * document tree.
 *
 * The tokenizer stage is a finite state machine.  Each state is
 * implemented as a function with a name that ends in "_state".  The
 * initial state is data_state(). The current tokenizer state is stored
 * in the variable 'tokenizer'.  Most state functions expect a single
 * integer argument which represents a single UTF-16 codepoint.  Some
 * states want more characters and set a lookahead property on
 * themselves.  The scanChars() function in the scanner checks for this
 * lookahead property.  If it doesn't exist, then scanChars() just passes
 * the next input character to the current tokenizer state function.
 * Otherwise, scanChars() looks ahead (a given # of characters, or for a
 * matching string, or for a matching regexp) and passes a string of
 * characters to the current tokenizer state function.
 *
 * As a shortcut, certain states of the tokenizer use regular expressions
 * to look ahead in the scanner's input buffer for runs of text, simple
 * tags and attributes.  For well-formed input, these shortcuts skip a
 * lot of state transitions and speed things up a bit.
 *
 * When a tokenizer state function has consumed a complete token, it
 * emits that token, by calling insertToken(), or by calling a utility
 * function that itself calls insertToken().  These tokens are passed to
 * the tree building stage, which is also a state machine.  Like the
 * tokenizer, the tree building states are implemented as functions, and
 * these functions have names that end with _mode (because the HTML spec
 * refers to them as insertion modes). The current insertion mode is held
 * by the 'parser' variable.  Each insertion mode function takes up to 4
 * arguments.  The first is a token type, represented by the constants
 * TAG, ENDTAG, TEXT, COMMENT, DOCTYPE and EOF.  The second argument is
 * the value of the token: the text or comment data, or tagname or
 * doctype.  For tags, the 3rd argument is an array of attributes.  For
 * DOCTYPES it is the optional public id.  For tags, the 4th argument is
 * true if the tag is self-closing. For doctypes, the 4th argument is the
 * optional system id.
 *
 * Search for "***" to find the major sub-divisions in the code.
 */


/***
 * Data prolog.  Lots of constants declared here, including some
 * very large objects.  They're used throughout the code that follows
 */
// Token types for the tree builder.
var EOF = -1;
var TEXT = 1;
var TAG = 2;
var ENDTAG = 3;
var COMMENT = 4;
var DOCTYPE = 5;

// A re-usable empty array
var NOATTRS = [];

// These DTD public ids put the browser in quirks mode
var quirkyPublicIds = /^HTML$|^-\/\/W3O\/\/DTD W3 HTML Strict 3\.0\/\/EN\/\/$|^-\/W3C\/DTD HTML 4\.0 Transitional\/EN$|^\+\/\/Silmaril\/\/dtd html Pro v0r11 19970101\/\/|^-\/\/AdvaSoft Ltd\/\/DTD HTML 3\.0 asWedit \+ extensions\/\/|^-\/\/AS\/\/DTD HTML 3\.0 asWedit \+ extensions\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Level 1\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Level 2\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict Level 1\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict Level 2\/\/|^-\/\/IETF\/\/DTD HTML 2\.0 Strict\/\/|^-\/\/IETF\/\/DTD HTML 2\.0\/\/|^-\/\/IETF\/\/DTD HTML 2\.1E\/\/|^-\/\/IETF\/\/DTD HTML 3\.0\/\/|^-\/\/IETF\/\/DTD HTML 3\.2 Final\/\/|^-\/\/IETF\/\/DTD HTML 3\.2\/\/|^-\/\/IETF\/\/DTD HTML 3\/\/|^-\/\/IETF\/\/DTD HTML Level 0\/\/|^-\/\/IETF\/\/DTD HTML Level 1\/\/|^-\/\/IETF\/\/DTD HTML Level 2\/\/|^-\/\/IETF\/\/DTD HTML Level 3\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 0\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 1\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 2\/\/|^-\/\/IETF\/\/DTD HTML Strict Level 3\/\/|^-\/\/IETF\/\/DTD HTML Strict\/\/|^-\/\/IETF\/\/DTD HTML\/\/|^-\/\/Metrius\/\/DTD Metrius Presentational\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 HTML Strict\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 HTML\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 2\.0 Tables\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 HTML Strict\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 HTML\/\/|^-\/\/Microsoft\/\/DTD Internet Explorer 3\.0 Tables\/\/|^-\/\/Netscape Comm\. Corp\.\/\/DTD HTML\/\/|^-\/\/Netscape Comm\. Corp\.\/\/DTD Strict HTML\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML 2\.0\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML Extended 1\.0\/\/|^-\/\/O'Reilly and Associates\/\/DTD HTML Extended Relaxed 1\.0\/\/|^-\/\/SoftQuad Software\/\/DTD HoTMetaL PRO 6\.0::19990601::extensions to HTML 4\.0\/\/|^-\/\/SoftQuad\/\/DTD HoTMetaL PRO 4\.0::19971010::extensions to HTML 4\.0\/\/|^-\/\/Spyglass\/\/DTD HTML 2\.0 Extended\/\/|^-\/\/SQ\/\/DTD HTML 2\.0 HoTMetaL \+ extensions\/\/|^-\/\/Sun Microsystems Corp\.\/\/DTD HotJava HTML\/\/|^-\/\/Sun Microsystems Corp\.\/\/DTD HotJava Strict HTML\/\/|^-\/\/W3C\/\/DTD HTML 3 1995-03-24\/\/|^-\/\/W3C\/\/DTD HTML 3\.2 Draft\/\/|^-\/\/W3C\/\/DTD HTML 3\.2 Final\/\/|^-\/\/W3C\/\/DTD HTML 3\.2\/\/|^-\/\/W3C\/\/DTD HTML 3\.2S Draft\/\/|^-\/\/W3C\/\/DTD HTML 4\.0 Frameset\/\/|^-\/\/W3C\/\/DTD HTML 4\.0 Transitional\/\/|^-\/\/W3C\/\/DTD HTML Experimental 19960712\/\/|^-\/\/W3C\/\/DTD HTML Experimental 970421\/\/|^-\/\/W3C\/\/DTD W3 HTML\/\/|^-\/\/W3O\/\/DTD W3 HTML 3\.0\/\/|^-\/\/WebTechs\/\/DTD Mozilla HTML 2\.0\/\/|^-\/\/WebTechs\/\/DTD Mozilla HTML\/\//i;

var quirkySystemId = "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd";

var conditionallyQuirkyPublicIds = /^-\/\/W3C\/\/DTD HTML 4\.01 Frameset\/\/|^-\/\/W3C\/\/DTD HTML 4\.01 Transitional\/\//i;

// These DTD public ids put the browser in limited quirks mode
var limitedQuirkyPublicIds = /^-\/\/W3C\/\/DTD XHTML 1\.0 Frameset\/\/|^-\/\/W3C\/\/DTD XHTML 1\.0 Transitional\/\//i;


// Element sets below. See the isA() function for a way to test
// whether an element is a member of a set
var specialSet = {};
specialSet[NAMESPACE.HTML] = {
  "address":true, "applet":true, "area":true, "article":true,
  "aside":true, "base":true, "basefont":true, "bgsound":true,
  "blockquote":true, "body":true, "br":true, "button":true,
  "caption":true, "center":true, "col":true, "colgroup":true,
  "command":true, "dd":true, "details":true, "dir":true,
  "div":true, "dl":true, "dt":true, "embed":true,
  "fieldset":true, "figcaption":true, "figure":true, "footer":true,
  "form":true, "frame":true, "frameset":true, "h1":true,
  "h2":true, "h3":true, "h4":true, "h5":true,
  "h6":true, "head":true, "header":true, "hgroup":true,
  "hr":true, "html":true, "iframe":true, "img":true,
  "input":true, "isindex":true, "li":true, "link":true,
  "listing":true, "marquee":true, "menu":true, "meta":true,
  "nav":true, "noembed":true, "noframes":true, "noscript":true,
  "object":true, "ol":true, "p":true, "param":true,
  "plaintext":true, "pre":true, "script":true, "section":true,
  "select":true, "style":true, "summary":true, "table":true,
  "tbody":true, "td":true, "textarea":true, "tfoot":true,
  "th":true, "thead":true, "title":true, "tr":true,
  "ul":true, "wbr":true, "xmp":true
};
specialSet[NAMESPACE.SVG] = {
  "foreignObject": true, "desc": true, "title": true
};
specialSet[NAMESPACE.MATHML] = {
  "mi":true, "mo":true, "mn":true, "ms":true,
  "mtext":true, "annotation-xml":true
};

// The set of address, div, and p HTML tags
var addressdivpSet = {};
addressdivpSet[NAMESPACE.HTML] = {
  "address":true, "div":true, "p":true
};

var dddtSet = {};
dddtSet[NAMESPACE.HTML] = {
  "dd":true, "dt":true
};

var tablesectionrowSet = {};
tablesectionrowSet[NAMESPACE.HTML] = {
  "table":true, "thead":true, "tbody":true, "tfoot":true, "tr":true
};

var impliedEndTagsSet = {};
impliedEndTagsSet[NAMESPACE.HTML] = {
  "dd": true, "dt": true, "li": true, "option": true,
  "optgroup": true, "p": true, "rp": true, "rt": true
};

// See http://www.w3.org/TR/html5/forms.html#form-associated-element
var formassociatedSet = {};
formassociatedSet[NAMESPACE.HTML] = {
  "button": true, "fieldset": true, "input": true, "keygen": true,
  "label": true, "meter": true, "object": true, "output": true,
  "progress": true, "select": true, "textarea": true
};

var inScopeSet = {};
inScopeSet[NAMESPACE.HTML]= {
  "applet":true, "caption":true, "html":true, "table":true,
  "td":true, "th":true, "marquee":true, "object":true
};
inScopeSet[NAMESPACE.MATHML] = {
  "mi":true, "mo":true, "mn":true, "ms":true,
  "mtext":true, "annotation-xml":true
};
inScopeSet[NAMESPACE.SVG] = {
  "foreignObject":true, "desc":true, "title":true
};

var inListItemScopeSet = Object.create(inScopeSet);
inListItemScopeSet[NAMESPACE.HTML] =
  Object.create(inScopeSet[NAMESPACE.HTML]);
inListItemScopeSet[NAMESPACE.HTML].ol = true;
inListItemScopeSet[NAMESPACE.HTML].ul = true;

var inButtonScopeSet = Object.create(inScopeSet);
inButtonScopeSet[NAMESPACE.HTML] =
  Object.create(inScopeSet[NAMESPACE.HTML]);
inButtonScopeSet[NAMESPACE.HTML].button = true;

var inTableScopeSet = {};
inTableScopeSet[NAMESPACE.HTML] = {
  "html":true, "table":true
};

// The set of elements for select scope is the everything *except* these
var invertedSelectScopeSet = {};
invertedSelectScopeSet[NAMESPACE.HTML] = {
  "optgroup":true, "option":true
};

var mathmlTextIntegrationPointSet = {};
mathmlTextIntegrationPointSet[NAMESPACE.MATHML] = {
  mi: true,
  mo: true,
  mn: true,
  ms: true,
  mtext: true
};

var htmlIntegrationPointSet = {};
htmlIntegrationPointSet[NAMESPACE.SVG] = {
  foreignObject: true,
  desc: true,
  title: true
};

var foreignAttributes = {
  "xlink:actuate": NAMESPACE.XLINK, "xlink:arcrole": NAMESPACE.XLINK,
  "xlink:href":   NAMESPACE.XLINK,  "xlink:role":    NAMESPACE.XLINK,
  "xlink:show":   NAMESPACE.XLINK,  "xlink:title":   NAMESPACE.XLINK,
  "xlink:type":   NAMESPACE.XLINK,  "xml:base":      NAMESPACE.XML,
  "xml:lang":     NAMESPACE.XML,    "xml:space":     NAMESPACE.XML,
  "xmlns":        NAMESPACE.XMLNS,  "xmlns:xlink":   NAMESPACE.XMLNS
};


// Lowercase to mixed case mapping for SVG attributes and tagnames
var svgAttrAdjustments = {
  attributename: "attributeName", attributetype: "attributeType",
  basefrequency: "baseFrequency", baseprofile: "baseProfile",
  calcmode: "calcMode", clippathunits: "clipPathUnits",
  contentscripttype: "contentScriptType",
  contentstyletype: "contentStyleType",
  diffuseconstant: "diffuseConstant",
  edgemode: "edgeMode",
  externalresourcesrequired: "externalResourcesRequired",
  filterres: "filterRes", filterunits: "filterUnits",
  glyphref: "glyphRef", gradienttransform: "gradientTransform",
  gradientunits: "gradientUnits", kernelmatrix: "kernelMatrix",
  kernelunitlength: "kernelUnitLength", keypoints: "keyPoints",
  keysplines: "keySplines", keytimes: "keyTimes",
  lengthadjust: "lengthAdjust", limitingconeangle: "limitingConeAngle",
  markerheight: "markerHeight", markerunits: "markerUnits",
  markerwidth: "markerWidth", maskcontentunits: "maskContentUnits",
  maskunits: "maskUnits", numoctaves: "numOctaves",
  pathlength: "pathLength", patterncontentunits: "patternContentUnits",
  patterntransform: "patternTransform", patternunits: "patternUnits",
  pointsatx: "pointsAtX", pointsaty: "pointsAtY",
  pointsatz: "pointsAtZ", preservealpha: "preserveAlpha",
  preserveaspectratio: "preserveAspectRatio",
  primitiveunits: "primitiveUnits", refx: "refX",
  refy: "refY", repeatcount: "repeatCount",
  repeatdur: "repeatDur", requiredextensions: "requiredExtensions",
  requiredfeatures: "requiredFeatures",
  specularconstant: "specularConstant",
  specularexponent: "specularExponent", spreadmethod: "spreadMethod",
  startoffset: "startOffset", stddeviation: "stdDeviation",
  stitchtiles: "stitchTiles", surfacescale: "surfaceScale",
  systemlanguage: "systemLanguage", tablevalues: "tableValues",
  targetx: "targetX", targety: "targetY",
  textlength: "textLength", viewbox: "viewBox",
  viewtarget: "viewTarget", xchannelselector: "xChannelSelector",
  ychannelselector: "yChannelSelector", zoomandpan: "zoomAndPan"
};

var svgTagNameAdjustments = {
  altglyph: "altGlyph", altglyphdef: "altGlyphDef",
  altglyphitem: "altGlyphItem", animatecolor: "animateColor",
  animatemotion: "animateMotion", animatetransform: "animateTransform",
  clippath: "clipPath", feblend: "feBlend",
  fecolormatrix: "feColorMatrix",
  fecomponenttransfer: "feComponentTransfer", fecomposite: "feComposite",
  feconvolvematrix: "feConvolveMatrix",
  fediffuselighting: "feDiffuseLighting",
  fedisplacementmap: "feDisplacementMap",
  fedistantlight: "feDistantLight", feflood: "feFlood",
  fefunca: "feFuncA", fefuncb: "feFuncB",
  fefuncg: "feFuncG", fefuncr: "feFuncR",
  fegaussianblur: "feGaussianBlur", feimage: "feImage",
  femerge: "feMerge", femergenode: "feMergeNode",
  femorphology: "feMorphology", feoffset: "feOffset",
  fepointlight: "fePointLight", fespecularlighting: "feSpecularLighting",
  fespotlight: "feSpotLight", fetile: "feTile",
  feturbulence: "feTurbulence", foreignobject: "foreignObject",
  glyphref: "glyphRef", lineargradient: "linearGradient",
  radialgradient: "radialGradient", textpath: "textPath"
};


// Data for parsing numeric and named character references
// These next 3 objects are direct translations of tables
// in the HTML spec into JavaScript object format
var numericCharRefReplacements = {
  0x00:0xFFFD, 0x80:0x20AC, 0x82:0x201A, 0x83:0x0192, 0x84:0x201E,
  0x85:0x2026, 0x86:0x2020, 0x87:0x2021, 0x88:0x02C6, 0x89:0x2030,
  0x8A:0x0160, 0x8B:0x2039, 0x8C:0x0152, 0x8E:0x017D, 0x91:0x2018,
  0x92:0x2019, 0x93:0x201C, 0x94:0x201D, 0x95:0x2022, 0x96:0x2013,
  0x97:0x2014, 0x98:0x02DC, 0x99:0x2122, 0x9A:0x0161, 0x9B:0x203A,
  0x9C:0x0153, 0x9E:0x017E, 0x9F:0x0178
};

// These named character references work even without the semicolon
var namedCharRefsNoSemi = {
  "AElig":0xC6, "AMP":0x26, "Aacute":0xC1, "Acirc":0xC2,
  "Agrave":0xC0, "Aring":0xC5, "Atilde":0xC3, "Auml":0xC4,
  "COPY":0xA9, "Ccedil":0xC7, "ETH":0xD0, "Eacute":0xC9,
  "Ecirc":0xCA, "Egrave":0xC8, "Euml":0xCB, "GT":0x3E,
  "Iacute":0xCD, "Icirc":0xCE, "Igrave":0xCC, "Iuml":0xCF,
  "LT":0x3C, "Ntilde":0xD1, "Oacute":0xD3, "Ocirc":0xD4,
  "Ograve":0xD2, "Oslash":0xD8, "Otilde":0xD5, "Ouml":0xD6,
  "QUOT":0x22, "REG":0xAE, "THORN":0xDE, "Uacute":0xDA,
  "Ucirc":0xDB, "Ugrave":0xD9, "Uuml":0xDC, "Yacute":0xDD,
  "aacute":0xE1, "acirc":0xE2, "acute":0xB4, "aelig":0xE6,
  "agrave":0xE0, "amp":0x26, "aring":0xE5, "atilde":0xE3,
  "auml":0xE4, "brvbar":0xA6, "ccedil":0xE7, "cedil":0xB8,
  "cent":0xA2, "copy":0xA9, "curren":0xA4, "deg":0xB0,
  "divide":0xF7, "eacute":0xE9, "ecirc":0xEA, "egrave":0xE8,
  "eth":0xF0, "euml":0xEB, "frac12":0xBD, "frac14":0xBC,
  "frac34":0xBE, "gt":0x3E, "iacute":0xED, "icirc":0xEE,
  "iexcl":0xA1, "igrave":0xEC, "iquest":0xBF, "iuml":0xEF,
  "laquo":0xAB, "lt":0x3C, "macr":0xAF, "micro":0xB5,
  "middot":0xB7, "nbsp":0xA0, "not":0xAC, "ntilde":0xF1,
  "oacute":0xF3, "ocirc":0xF4, "ograve":0xF2, "ordf":0xAA,
  "ordm":0xBA, "oslash":0xF8, "otilde":0xF5, "ouml":0xF6,
  "para":0xB6, "plusmn":0xB1, "pound":0xA3, "quot":0x22,
  "raquo":0xBB, "reg":0xAE, "sect":0xA7, "shy":0xAD,
  "sup1":0xB9, "sup2":0xB2, "sup3":0xB3, "szlig":0xDF,
  "thorn":0xFE, "times":0xD7, "uacute":0xFA, "ucirc":0xFB,
  "ugrave":0xF9, "uml":0xA8, "uuml":0xFC, "yacute":0xFD,
  "yen":0xA5, "yuml":0xFF
};

var namedCharRefs = {
  "AElig;":0xc6, "AMP;":0x26,
  "Aacute;":0xc1, "Abreve;":0x102,
  "Acirc;":0xc2, "Acy;":0x410,
  "Afr;":[0xd835,0xdd04], "Agrave;":0xc0,
  "Alpha;":0x391, "Amacr;":0x100,
  "And;":0x2a53, "Aogon;":0x104,
  "Aopf;":[0xd835,0xdd38], "ApplyFunction;":0x2061,
  "Aring;":0xc5, "Ascr;":[0xd835,0xdc9c],
  "Assign;":0x2254, "Atilde;":0xc3,
  "Auml;":0xc4, "Backslash;":0x2216,
  "Barv;":0x2ae7, "Barwed;":0x2306,
  "Bcy;":0x411, "Because;":0x2235,
  "Bernoullis;":0x212c, "Beta;":0x392,
  "Bfr;":[0xd835,0xdd05], "Bopf;":[0xd835,0xdd39],
  "Breve;":0x2d8, "Bscr;":0x212c,
  "Bumpeq;":0x224e, "CHcy;":0x427,
  "COPY;":0xa9, "Cacute;":0x106,
  "Cap;":0x22d2, "CapitalDifferentialD;":0x2145,
  "Cayleys;":0x212d, "Ccaron;":0x10c,
  "Ccedil;":0xc7, "Ccirc;":0x108,
  "Cconint;":0x2230, "Cdot;":0x10a,
  "Cedilla;":0xb8, "CenterDot;":0xb7,
  "Cfr;":0x212d, "Chi;":0x3a7,
  "CircleDot;":0x2299, "CircleMinus;":0x2296,
  "CirclePlus;":0x2295, "CircleTimes;":0x2297,
  "ClockwiseContourIntegral;":0x2232, "CloseCurlyDoubleQuote;":0x201d,
  "CloseCurlyQuote;":0x2019, "Colon;":0x2237,
  "Colone;":0x2a74, "Congruent;":0x2261,
  "Conint;":0x222f, "ContourIntegral;":0x222e,
  "Copf;":0x2102, "Coproduct;":0x2210,
  "CounterClockwiseContourIntegral;":0x2233, "Cross;":0x2a2f,
  "Cscr;":[0xd835,0xdc9e], "Cup;":0x22d3,
  "CupCap;":0x224d, "DD;":0x2145,
  "DDotrahd;":0x2911, "DJcy;":0x402,
  "DScy;":0x405, "DZcy;":0x40f,
  "Dagger;":0x2021, "Darr;":0x21a1,
  "Dashv;":0x2ae4, "Dcaron;":0x10e,
  "Dcy;":0x414, "Del;":0x2207,
  "Delta;":0x394, "Dfr;":[0xd835,0xdd07],
  "DiacriticalAcute;":0xb4, "DiacriticalDot;":0x2d9,
  "DiacriticalDoubleAcute;":0x2dd, "DiacriticalGrave;":0x60,
  "DiacriticalTilde;":0x2dc, "Diamond;":0x22c4,
  "DifferentialD;":0x2146, "Dopf;":[0xd835,0xdd3b],
  "Dot;":0xa8, "DotDot;":0x20dc,
  "DotEqual;":0x2250, "DoubleContourIntegral;":0x222f,
  "DoubleDot;":0xa8, "DoubleDownArrow;":0x21d3,
  "DoubleLeftArrow;":0x21d0, "DoubleLeftRightArrow;":0x21d4,
  "DoubleLeftTee;":0x2ae4, "DoubleLongLeftArrow;":0x27f8,
  "DoubleLongLeftRightArrow;":0x27fa, "DoubleLongRightArrow;":0x27f9,
  "DoubleRightArrow;":0x21d2, "DoubleRightTee;":0x22a8,
  "DoubleUpArrow;":0x21d1, "DoubleUpDownArrow;":0x21d5,
  "DoubleVerticalBar;":0x2225, "DownArrow;":0x2193,
  "DownArrowBar;":0x2913, "DownArrowUpArrow;":0x21f5,
  "DownBreve;":0x311, "DownLeftRightVector;":0x2950,
  "DownLeftTeeVector;":0x295e, "DownLeftVector;":0x21bd,
  "DownLeftVectorBar;":0x2956, "DownRightTeeVector;":0x295f,
  "DownRightVector;":0x21c1, "DownRightVectorBar;":0x2957,
  "DownTee;":0x22a4, "DownTeeArrow;":0x21a7,
  "Downarrow;":0x21d3, "Dscr;":[0xd835,0xdc9f],
  "Dstrok;":0x110, "ENG;":0x14a,
  "ETH;":0xd0, "Eacute;":0xc9,
  "Ecaron;":0x11a, "Ecirc;":0xca,
  "Ecy;":0x42d, "Edot;":0x116,
  "Efr;":[0xd835,0xdd08], "Egrave;":0xc8,
  "Element;":0x2208, "Emacr;":0x112,
  "EmptySmallSquare;":0x25fb, "EmptyVerySmallSquare;":0x25ab,
  "Eogon;":0x118, "Eopf;":[0xd835,0xdd3c],
  "Epsilon;":0x395, "Equal;":0x2a75,
  "EqualTilde;":0x2242, "Equilibrium;":0x21cc,
  "Escr;":0x2130, "Esim;":0x2a73,
  "Eta;":0x397, "Euml;":0xcb,
  "Exists;":0x2203, "ExponentialE;":0x2147,
  "Fcy;":0x424, "Ffr;":[0xd835,0xdd09],
  "FilledSmallSquare;":0x25fc, "FilledVerySmallSquare;":0x25aa,
  "Fopf;":[0xd835,0xdd3d], "ForAll;":0x2200,
  "Fouriertrf;":0x2131, "Fscr;":0x2131,
  "GJcy;":0x403, "GT;":0x3e,
  "Gamma;":0x393, "Gammad;":0x3dc,
  "Gbreve;":0x11e, "Gcedil;":0x122,
  "Gcirc;":0x11c, "Gcy;":0x413,
  "Gdot;":0x120, "Gfr;":[0xd835,0xdd0a],
  "Gg;":0x22d9, "Gopf;":[0xd835,0xdd3e],
  "GreaterEqual;":0x2265, "GreaterEqualLess;":0x22db,
  "GreaterFullEqual;":0x2267, "GreaterGreater;":0x2aa2,
  "GreaterLess;":0x2277, "GreaterSlantEqual;":0x2a7e,
  "GreaterTilde;":0x2273, "Gscr;":[0xd835,0xdca2],
  "Gt;":0x226b, "HARDcy;":0x42a,
  "Hacek;":0x2c7, "Hat;":0x5e,
  "Hcirc;":0x124, "Hfr;":0x210c,
  "HilbertSpace;":0x210b, "Hopf;":0x210d,
  "HorizontalLine;":0x2500, "Hscr;":0x210b,
  "Hstrok;":0x126, "HumpDownHump;":0x224e,
  "HumpEqual;":0x224f, "IEcy;":0x415,
  "IJlig;":0x132, "IOcy;":0x401,
  "Iacute;":0xcd, "Icirc;":0xce,
  "Icy;":0x418, "Idot;":0x130,
  "Ifr;":0x2111, "Igrave;":0xcc,
  "Im;":0x2111, "Imacr;":0x12a,
  "ImaginaryI;":0x2148, "Implies;":0x21d2,
  "Int;":0x222c, "Integral;":0x222b,
  "Intersection;":0x22c2, "InvisibleComma;":0x2063,
  "InvisibleTimes;":0x2062, "Iogon;":0x12e,
  "Iopf;":[0xd835,0xdd40], "Iota;":0x399,
  "Iscr;":0x2110, "Itilde;":0x128,
  "Iukcy;":0x406, "Iuml;":0xcf,
  "Jcirc;":0x134, "Jcy;":0x419,
  "Jfr;":[0xd835,0xdd0d], "Jopf;":[0xd835,0xdd41],
  "Jscr;":[0xd835,0xdca5], "Jsercy;":0x408,
  "Jukcy;":0x404, "KHcy;":0x425,
  "KJcy;":0x40c, "Kappa;":0x39a,
  "Kcedil;":0x136, "Kcy;":0x41a,
  "Kfr;":[0xd835,0xdd0e], "Kopf;":[0xd835,0xdd42],
  "Kscr;":[0xd835,0xdca6], "LJcy;":0x409,
  "LT;":0x3c, "Lacute;":0x139,
  "Lambda;":0x39b, "Lang;":0x27ea,
  "Laplacetrf;":0x2112, "Larr;":0x219e,
  "Lcaron;":0x13d, "Lcedil;":0x13b,
  "Lcy;":0x41b, "LeftAngleBracket;":0x27e8,
  "LeftArrow;":0x2190, "LeftArrowBar;":0x21e4,
  "LeftArrowRightArrow;":0x21c6, "LeftCeiling;":0x2308,
  "LeftDoubleBracket;":0x27e6, "LeftDownTeeVector;":0x2961,
  "LeftDownVector;":0x21c3, "LeftDownVectorBar;":0x2959,
  "LeftFloor;":0x230a, "LeftRightArrow;":0x2194,
  "LeftRightVector;":0x294e, "LeftTee;":0x22a3,
  "LeftTeeArrow;":0x21a4, "LeftTeeVector;":0x295a,
  "LeftTriangle;":0x22b2, "LeftTriangleBar;":0x29cf,
  "LeftTriangleEqual;":0x22b4, "LeftUpDownVector;":0x2951,
  "LeftUpTeeVector;":0x2960, "LeftUpVector;":0x21bf,
  "LeftUpVectorBar;":0x2958, "LeftVector;":0x21bc,
  "LeftVectorBar;":0x2952, "Leftarrow;":0x21d0,
  "Leftrightarrow;":0x21d4, "LessEqualGreater;":0x22da,
  "LessFullEqual;":0x2266, "LessGreater;":0x2276,
  "LessLess;":0x2aa1, "LessSlantEqual;":0x2a7d,
  "LessTilde;":0x2272, "Lfr;":[0xd835,0xdd0f],
  "Ll;":0x22d8, "Lleftarrow;":0x21da,
  "Lmidot;":0x13f, "LongLeftArrow;":0x27f5,
  "LongLeftRightArrow;":0x27f7, "LongRightArrow;":0x27f6,
  "Longleftarrow;":0x27f8, "Longleftrightarrow;":0x27fa,
  "Longrightarrow;":0x27f9, "Lopf;":[0xd835,0xdd43],
  "LowerLeftArrow;":0x2199, "LowerRightArrow;":0x2198,
  "Lscr;":0x2112, "Lsh;":0x21b0,
  "Lstrok;":0x141, "Lt;":0x226a,
  "Map;":0x2905, "Mcy;":0x41c,
  "MediumSpace;":0x205f, "Mellintrf;":0x2133,
  "Mfr;":[0xd835,0xdd10], "MinusPlus;":0x2213,
  "Mopf;":[0xd835,0xdd44], "Mscr;":0x2133,
  "Mu;":0x39c, "NJcy;":0x40a,
  "Nacute;":0x143, "Ncaron;":0x147,
  "Ncedil;":0x145, "Ncy;":0x41d,
  "NegativeMediumSpace;":0x200b, "NegativeThickSpace;":0x200b,
  "NegativeThinSpace;":0x200b, "NegativeVeryThinSpace;":0x200b,
  "NestedGreaterGreater;":0x226b, "NestedLessLess;":0x226a,
  "NewLine;":0xa, "Nfr;":[0xd835,0xdd11],
  "NoBreak;":0x2060, "NonBreakingSpace;":0xa0,
  "Nopf;":0x2115, "Not;":0x2aec,
  "NotCongruent;":0x2262, "NotCupCap;":0x226d,
  "NotDoubleVerticalBar;":0x2226, "NotElement;":0x2209,
  "NotEqual;":0x2260, "NotEqualTilde;":[0x2242,0x338],
  "NotExists;":0x2204, "NotGreater;":0x226f,
  "NotGreaterEqual;":0x2271, "NotGreaterFullEqual;":[0x2267,0x338],
  "NotGreaterGreater;":[0x226b,0x338], "NotGreaterLess;":0x2279,
  "NotGreaterSlantEqual;":[0x2a7e,0x338], "NotGreaterTilde;":0x2275,
  "NotHumpDownHump;":[0x224e,0x338], "NotHumpEqual;":[0x224f,0x338],
  "NotLeftTriangle;":0x22ea, "NotLeftTriangleBar;":[0x29cf,0x338],
  "NotLeftTriangleEqual;":0x22ec, "NotLess;":0x226e,
  "NotLessEqual;":0x2270, "NotLessGreater;":0x2278,
  "NotLessLess;":[0x226a,0x338], "NotLessSlantEqual;":[0x2a7d,0x338],
  "NotLessTilde;":0x2274, "NotNestedGreaterGreater;":[0x2aa2,0x338],
  "NotNestedLessLess;":[0x2aa1,0x338], "NotPrecedes;":0x2280,
  "NotPrecedesEqual;":[0x2aaf,0x338], "NotPrecedesSlantEqual;":0x22e0,
  "NotReverseElement;":0x220c, "NotRightTriangle;":0x22eb,
  "NotRightTriangleBar;":[0x29d0,0x338], "NotRightTriangleEqual;":0x22ed,
  "NotSquareSubset;":[0x228f,0x338], "NotSquareSubsetEqual;":0x22e2,
  "NotSquareSuperset;":[0x2290,0x338], "NotSquareSupersetEqual;":0x22e3,
  "NotSubset;":[0x2282,0x20d2], "NotSubsetEqual;":0x2288,
  "NotSucceeds;":0x2281, "NotSucceedsEqual;":[0x2ab0,0x338],
  "NotSucceedsSlantEqual;":0x22e1, "NotSucceedsTilde;":[0x227f,0x338],
  "NotSuperset;":[0x2283,0x20d2], "NotSupersetEqual;":0x2289,
  "NotTilde;":0x2241, "NotTildeEqual;":0x2244,
  "NotTildeFullEqual;":0x2247, "NotTildeTilde;":0x2249,
  "NotVerticalBar;":0x2224, "Nscr;":[0xd835,0xdca9],
  "Ntilde;":0xd1, "Nu;":0x39d,
  "OElig;":0x152, "Oacute;":0xd3,
  "Ocirc;":0xd4, "Ocy;":0x41e,
  "Odblac;":0x150, "Ofr;":[0xd835,0xdd12],
  "Ograve;":0xd2, "Omacr;":0x14c,
  "Omega;":0x3a9, "Omicron;":0x39f,
  "Oopf;":[0xd835,0xdd46], "OpenCurlyDoubleQuote;":0x201c,
  "OpenCurlyQuote;":0x2018, "Or;":0x2a54,
  "Oscr;":[0xd835,0xdcaa], "Oslash;":0xd8,
  "Otilde;":0xd5, "Otimes;":0x2a37,
  "Ouml;":0xd6, "OverBar;":0x203e,
  "OverBrace;":0x23de, "OverBracket;":0x23b4,
  "OverParenthesis;":0x23dc, "PartialD;":0x2202,
  "Pcy;":0x41f, "Pfr;":[0xd835,0xdd13],
  "Phi;":0x3a6, "Pi;":0x3a0,
  "PlusMinus;":0xb1, "Poincareplane;":0x210c,
  "Popf;":0x2119, "Pr;":0x2abb,
  "Precedes;":0x227a, "PrecedesEqual;":0x2aaf,
  "PrecedesSlantEqual;":0x227c, "PrecedesTilde;":0x227e,
  "Prime;":0x2033, "Product;":0x220f,
  "Proportion;":0x2237, "Proportional;":0x221d,
  "Pscr;":[0xd835,0xdcab], "Psi;":0x3a8,
  "QUOT;":0x22, "Qfr;":[0xd835,0xdd14],
  "Qopf;":0x211a, "Qscr;":[0xd835,0xdcac],
  "RBarr;":0x2910, "REG;":0xae,
  "Racute;":0x154, "Rang;":0x27eb,
  "Rarr;":0x21a0, "Rarrtl;":0x2916,
  "Rcaron;":0x158, "Rcedil;":0x156,
  "Rcy;":0x420, "Re;":0x211c,
  "ReverseElement;":0x220b, "ReverseEquilibrium;":0x21cb,
  "ReverseUpEquilibrium;":0x296f, "Rfr;":0x211c,
  "Rho;":0x3a1, "RightAngleBracket;":0x27e9,
  "RightArrow;":0x2192, "RightArrowBar;":0x21e5,
  "RightArrowLeftArrow;":0x21c4, "RightCeiling;":0x2309,
  "RightDoubleBracket;":0x27e7, "RightDownTeeVector;":0x295d,
  "RightDownVector;":0x21c2, "RightDownVectorBar;":0x2955,
  "RightFloor;":0x230b, "RightTee;":0x22a2,
  "RightTeeArrow;":0x21a6, "RightTeeVector;":0x295b,
  "RightTriangle;":0x22b3, "RightTriangleBar;":0x29d0,
  "RightTriangleEqual;":0x22b5, "RightUpDownVector;":0x294f,
  "RightUpTeeVector;":0x295c, "RightUpVector;":0x21be,
  "RightUpVectorBar;":0x2954, "RightVector;":0x21c0,
  "RightVectorBar;":0x2953, "Rightarrow;":0x21d2,
  "Ropf;":0x211d, "RoundImplies;":0x2970,
  "Rrightarrow;":0x21db, "Rscr;":0x211b,
  "Rsh;":0x21b1, "RuleDelayed;":0x29f4,
  "SHCHcy;":0x429, "SHcy;":0x428,
  "SOFTcy;":0x42c, "Sacute;":0x15a,
  "Sc;":0x2abc, "Scaron;":0x160,
  "Scedil;":0x15e, "Scirc;":0x15c,
  "Scy;":0x421, "Sfr;":[0xd835,0xdd16],
  "ShortDownArrow;":0x2193, "ShortLeftArrow;":0x2190,
  "ShortRightArrow;":0x2192, "ShortUpArrow;":0x2191,
  "Sigma;":0x3a3, "SmallCircle;":0x2218,
  "Sopf;":[0xd835,0xdd4a], "Sqrt;":0x221a,
  "Square;":0x25a1, "SquareIntersection;":0x2293,
  "SquareSubset;":0x228f, "SquareSubsetEqual;":0x2291,
  "SquareSuperset;":0x2290, "SquareSupersetEqual;":0x2292,
  "SquareUnion;":0x2294, "Sscr;":[0xd835,0xdcae],
  "Star;":0x22c6, "Sub;":0x22d0,
  "Subset;":0x22d0, "SubsetEqual;":0x2286,
  "Succeeds;":0x227b, "SucceedsEqual;":0x2ab0,
  "SucceedsSlantEqual;":0x227d, "SucceedsTilde;":0x227f,
  "SuchThat;":0x220b, "Sum;":0x2211,
  "Sup;":0x22d1, "Superset;":0x2283,
  "SupersetEqual;":0x2287, "Supset;":0x22d1,
  "THORN;":0xde, "TRADE;":0x2122,
  "TSHcy;":0x40b, "TScy;":0x426,
  "Tab;":0x9, "Tau;":0x3a4,
  "Tcaron;":0x164, "Tcedil;":0x162,
  "Tcy;":0x422, "Tfr;":[0xd835,0xdd17],
  "Therefore;":0x2234, "Theta;":0x398,
  "ThickSpace;":[0x205f,0x200a], "ThinSpace;":0x2009,
  "Tilde;":0x223c, "TildeEqual;":0x2243,
  "TildeFullEqual;":0x2245, "TildeTilde;":0x2248,
  "Topf;":[0xd835,0xdd4b], "TripleDot;":0x20db,
  "Tscr;":[0xd835,0xdcaf], "Tstrok;":0x166,
  "Uacute;":0xda, "Uarr;":0x219f,
  "Uarrocir;":0x2949, "Ubrcy;":0x40e,
  "Ubreve;":0x16c, "Ucirc;":0xdb,
  "Ucy;":0x423, "Udblac;":0x170,
  "Ufr;":[0xd835,0xdd18], "Ugrave;":0xd9,
  "Umacr;":0x16a, "UnderBar;":0x5f,
  "UnderBrace;":0x23df, "UnderBracket;":0x23b5,
  "UnderParenthesis;":0x23dd, "Union;":0x22c3,
  "UnionPlus;":0x228e, "Uogon;":0x172,
  "Uopf;":[0xd835,0xdd4c], "UpArrow;":0x2191,
  "UpArrowBar;":0x2912, "UpArrowDownArrow;":0x21c5,
  "UpDownArrow;":0x2195, "UpEquilibrium;":0x296e,
  "UpTee;":0x22a5, "UpTeeArrow;":0x21a5,
  "Uparrow;":0x21d1, "Updownarrow;":0x21d5,
  "UpperLeftArrow;":0x2196, "UpperRightArrow;":0x2197,
  "Upsi;":0x3d2, "Upsilon;":0x3a5,
  "Uring;":0x16e, "Uscr;":[0xd835,0xdcb0],
  "Utilde;":0x168, "Uuml;":0xdc,
  "VDash;":0x22ab, "Vbar;":0x2aeb,
  "Vcy;":0x412, "Vdash;":0x22a9,
  "Vdashl;":0x2ae6, "Vee;":0x22c1,
  "Verbar;":0x2016, "Vert;":0x2016,
  "VerticalBar;":0x2223, "VerticalLine;":0x7c,
  "VerticalSeparator;":0x2758, "VerticalTilde;":0x2240,
  "VeryThinSpace;":0x200a, "Vfr;":[0xd835,0xdd19],
  "Vopf;":[0xd835,0xdd4d], "Vscr;":[0xd835,0xdcb1],
  "Vvdash;":0x22aa, "Wcirc;":0x174,
  "Wedge;":0x22c0, "Wfr;":[0xd835,0xdd1a],
  "Wopf;":[0xd835,0xdd4e], "Wscr;":[0xd835,0xdcb2],
  "Xfr;":[0xd835,0xdd1b], "Xi;":0x39e,
  "Xopf;":[0xd835,0xdd4f], "Xscr;":[0xd835,0xdcb3],
  "YAcy;":0x42f, "YIcy;":0x407,
  "YUcy;":0x42e, "Yacute;":0xdd,
  "Ycirc;":0x176, "Ycy;":0x42b,
  "Yfr;":[0xd835,0xdd1c], "Yopf;":[0xd835,0xdd50],
  "Yscr;":[0xd835,0xdcb4], "Yuml;":0x178,
  "ZHcy;":0x416, "Zacute;":0x179,
  "Zcaron;":0x17d, "Zcy;":0x417,
  "Zdot;":0x17b, "ZeroWidthSpace;":0x200b,
  "Zeta;":0x396, "Zfr;":0x2128,
  "Zopf;":0x2124, "Zscr;":[0xd835,0xdcb5],
  "aacute;":0xe1, "abreve;":0x103,
  "ac;":0x223e, "acE;":[0x223e,0x333],
  "acd;":0x223f, "acirc;":0xe2,
  "acute;":0xb4, "acy;":0x430,
  "aelig;":0xe6, "af;":0x2061,
  "afr;":[0xd835,0xdd1e], "agrave;":0xe0,
  "alefsym;":0x2135, "aleph;":0x2135,
  "alpha;":0x3b1, "amacr;":0x101,
  "amalg;":0x2a3f, "amp;":0x26,
  "and;":0x2227, "andand;":0x2a55,
  "andd;":0x2a5c, "andslope;":0x2a58,
  "andv;":0x2a5a, "ang;":0x2220,
  "ange;":0x29a4, "angle;":0x2220,
  "angmsd;":0x2221, "angmsdaa;":0x29a8,
  "angmsdab;":0x29a9, "angmsdac;":0x29aa,
  "angmsdad;":0x29ab, "angmsdae;":0x29ac,
  "angmsdaf;":0x29ad, "angmsdag;":0x29ae,
  "angmsdah;":0x29af, "angrt;":0x221f,
  "angrtvb;":0x22be, "angrtvbd;":0x299d,
  "angsph;":0x2222, "angst;":0xc5,
  "angzarr;":0x237c, "aogon;":0x105,
  "aopf;":[0xd835,0xdd52], "ap;":0x2248,
  "apE;":0x2a70, "apacir;":0x2a6f,
  "ape;":0x224a, "apid;":0x224b,
  "apos;":0x27, "approx;":0x2248,
  "approxeq;":0x224a, "aring;":0xe5,
  "ascr;":[0xd835,0xdcb6], "ast;":0x2a,
  "asymp;":0x2248, "asympeq;":0x224d,
  "atilde;":0xe3, "auml;":0xe4,
  "awconint;":0x2233, "awint;":0x2a11,
  "bNot;":0x2aed, "backcong;":0x224c,
  "backepsilon;":0x3f6, "backprime;":0x2035,
  "backsim;":0x223d, "backsimeq;":0x22cd,
  "barvee;":0x22bd, "barwed;":0x2305,
  "barwedge;":0x2305, "bbrk;":0x23b5,
  "bbrktbrk;":0x23b6, "bcong;":0x224c,
  "bcy;":0x431, "bdquo;":0x201e,
  "becaus;":0x2235, "because;":0x2235,
  "bemptyv;":0x29b0, "bepsi;":0x3f6,
  "bernou;":0x212c, "beta;":0x3b2,
  "beth;":0x2136, "between;":0x226c,
  "bfr;":[0xd835,0xdd1f], "bigcap;":0x22c2,
  "bigcirc;":0x25ef, "bigcup;":0x22c3,
  "bigodot;":0x2a00, "bigoplus;":0x2a01,
  "bigotimes;":0x2a02, "bigsqcup;":0x2a06,
  "bigstar;":0x2605, "bigtriangledown;":0x25bd,
  "bigtriangleup;":0x25b3, "biguplus;":0x2a04,
  "bigvee;":0x22c1, "bigwedge;":0x22c0,
  "bkarow;":0x290d, "blacklozenge;":0x29eb,
  "blacksquare;":0x25aa, "blacktriangle;":0x25b4,
  "blacktriangledown;":0x25be, "blacktriangleleft;":0x25c2,
  "blacktriangleright;":0x25b8, "blank;":0x2423,
  "blk12;":0x2592, "blk14;":0x2591,
  "blk34;":0x2593, "block;":0x2588,
  "bne;":[0x3d,0x20e5], "bnequiv;":[0x2261,0x20e5],
  "bnot;":0x2310, "bopf;":[0xd835,0xdd53],
  "bot;":0x22a5, "bottom;":0x22a5,
  "bowtie;":0x22c8, "boxDL;":0x2557,
  "boxDR;":0x2554, "boxDl;":0x2556,
  "boxDr;":0x2553, "boxH;":0x2550,
  "boxHD;":0x2566, "boxHU;":0x2569,
  "boxHd;":0x2564, "boxHu;":0x2567,
  "boxUL;":0x255d, "boxUR;":0x255a,
  "boxUl;":0x255c, "boxUr;":0x2559,
  "boxV;":0x2551, "boxVH;":0x256c,
  "boxVL;":0x2563, "boxVR;":0x2560,
  "boxVh;":0x256b, "boxVl;":0x2562,
  "boxVr;":0x255f, "boxbox;":0x29c9,
  "boxdL;":0x2555, "boxdR;":0x2552,
  "boxdl;":0x2510, "boxdr;":0x250c,
  "boxh;":0x2500, "boxhD;":0x2565,
  "boxhU;":0x2568, "boxhd;":0x252c,
  "boxhu;":0x2534, "boxminus;":0x229f,
  "boxplus;":0x229e, "boxtimes;":0x22a0,
  "boxuL;":0x255b, "boxuR;":0x2558,
  "boxul;":0x2518, "boxur;":0x2514,
  "boxv;":0x2502, "boxvH;":0x256a,
  "boxvL;":0x2561, "boxvR;":0x255e,
  "boxvh;":0x253c, "boxvl;":0x2524,
  "boxvr;":0x251c, "bprime;":0x2035,
  "breve;":0x2d8, "brvbar;":0xa6,
  "bscr;":[0xd835,0xdcb7], "bsemi;":0x204f,
  "bsim;":0x223d, "bsime;":0x22cd,
  "bsol;":0x5c, "bsolb;":0x29c5,
  "bsolhsub;":0x27c8, "bull;":0x2022,
  "bullet;":0x2022, "bump;":0x224e,
  "bumpE;":0x2aae, "bumpe;":0x224f,
  "bumpeq;":0x224f, "cacute;":0x107,
  "cap;":0x2229, "capand;":0x2a44,
  "capbrcup;":0x2a49, "capcap;":0x2a4b,
  "capcup;":0x2a47, "capdot;":0x2a40,
  "caps;":[0x2229,0xfe00], "caret;":0x2041,
  "caron;":0x2c7, "ccaps;":0x2a4d,
  "ccaron;":0x10d, "ccedil;":0xe7,
  "ccirc;":0x109, "ccups;":0x2a4c,
  "ccupssm;":0x2a50, "cdot;":0x10b,
  "cedil;":0xb8, "cemptyv;":0x29b2,
  "cent;":0xa2, "centerdot;":0xb7,
  "cfr;":[0xd835,0xdd20], "chcy;":0x447,
  "check;":0x2713, "checkmark;":0x2713,
  "chi;":0x3c7, "cir;":0x25cb,
  "cirE;":0x29c3, "circ;":0x2c6,
  "circeq;":0x2257, "circlearrowleft;":0x21ba,
  "circlearrowright;":0x21bb, "circledR;":0xae,
  "circledS;":0x24c8, "circledast;":0x229b,
  "circledcirc;":0x229a, "circleddash;":0x229d,
  "cire;":0x2257, "cirfnint;":0x2a10,
  "cirmid;":0x2aef, "cirscir;":0x29c2,
  "clubs;":0x2663, "clubsuit;":0x2663,
  "colon;":0x3a, "colone;":0x2254,
  "coloneq;":0x2254, "comma;":0x2c,
  "commat;":0x40, "comp;":0x2201,
  "compfn;":0x2218, "complement;":0x2201,
  "complexes;":0x2102, "cong;":0x2245,
  "congdot;":0x2a6d, "conint;":0x222e,
  "copf;":[0xd835,0xdd54], "coprod;":0x2210,
  "copy;":0xa9, "copysr;":0x2117,
  "crarr;":0x21b5, "cross;":0x2717,
  "cscr;":[0xd835,0xdcb8], "csub;":0x2acf,
  "csube;":0x2ad1, "csup;":0x2ad0,
  "csupe;":0x2ad2, "ctdot;":0x22ef,
  "cudarrl;":0x2938, "cudarrr;":0x2935,
  "cuepr;":0x22de, "cuesc;":0x22df,
  "cularr;":0x21b6, "cularrp;":0x293d,
  "cup;":0x222a, "cupbrcap;":0x2a48,
  "cupcap;":0x2a46, "cupcup;":0x2a4a,
  "cupdot;":0x228d, "cupor;":0x2a45,
  "cups;":[0x222a,0xfe00], "curarr;":0x21b7,
  "curarrm;":0x293c, "curlyeqprec;":0x22de,
  "curlyeqsucc;":0x22df, "curlyvee;":0x22ce,
  "curlywedge;":0x22cf, "curren;":0xa4,
  "curvearrowleft;":0x21b6, "curvearrowright;":0x21b7,
  "cuvee;":0x22ce, "cuwed;":0x22cf,
  "cwconint;":0x2232, "cwint;":0x2231,
  "cylcty;":0x232d, "dArr;":0x21d3,
  "dHar;":0x2965, "dagger;":0x2020,
  "daleth;":0x2138, "darr;":0x2193,
  "dash;":0x2010, "dashv;":0x22a3,
  "dbkarow;":0x290f, "dblac;":0x2dd,
  "dcaron;":0x10f, "dcy;":0x434,
  "dd;":0x2146, "ddagger;":0x2021,
  "ddarr;":0x21ca, "ddotseq;":0x2a77,
  "deg;":0xb0, "delta;":0x3b4,
  "demptyv;":0x29b1, "dfisht;":0x297f,
  "dfr;":[0xd835,0xdd21], "dharl;":0x21c3,
  "dharr;":0x21c2, "diam;":0x22c4,
  "diamond;":0x22c4, "diamondsuit;":0x2666,
  "diams;":0x2666, "die;":0xa8,
  "digamma;":0x3dd, "disin;":0x22f2,
  "div;":0xf7, "divide;":0xf7,
  "divideontimes;":0x22c7, "divonx;":0x22c7,
  "djcy;":0x452, "dlcorn;":0x231e,
  "dlcrop;":0x230d, "dollar;":0x24,
  "dopf;":[0xd835,0xdd55], "dot;":0x2d9,
  "doteq;":0x2250, "doteqdot;":0x2251,
  "dotminus;":0x2238, "dotplus;":0x2214,
  "dotsquare;":0x22a1, "doublebarwedge;":0x2306,
  "downarrow;":0x2193, "downdownarrows;":0x21ca,
  "downharpoonleft;":0x21c3, "downharpoonright;":0x21c2,
  "drbkarow;":0x2910, "drcorn;":0x231f,
  "drcrop;":0x230c, "dscr;":[0xd835,0xdcb9],
  "dscy;":0x455, "dsol;":0x29f6,
  "dstrok;":0x111, "dtdot;":0x22f1,
  "dtri;":0x25bf, "dtrif;":0x25be,
  "duarr;":0x21f5, "duhar;":0x296f,
  "dwangle;":0x29a6, "dzcy;":0x45f,
  "dzigrarr;":0x27ff, "eDDot;":0x2a77,
  "eDot;":0x2251, "eacute;":0xe9,
  "easter;":0x2a6e, "ecaron;":0x11b,
  "ecir;":0x2256, "ecirc;":0xea,
  "ecolon;":0x2255, "ecy;":0x44d,
  "edot;":0x117, "ee;":0x2147,
  "efDot;":0x2252, "efr;":[0xd835,0xdd22],
  "eg;":0x2a9a, "egrave;":0xe8,
  "egs;":0x2a96, "egsdot;":0x2a98,
  "el;":0x2a99, "elinters;":0x23e7,
  "ell;":0x2113, "els;":0x2a95,
  "elsdot;":0x2a97, "emacr;":0x113,
  "empty;":0x2205, "emptyset;":0x2205,
  "emptyv;":0x2205, "emsp;":0x2003,
  "emsp13;":0x2004, "emsp14;":0x2005,
  "eng;":0x14b, "ensp;":0x2002,
  "eogon;":0x119, "eopf;":[0xd835,0xdd56],
  "epar;":0x22d5, "eparsl;":0x29e3,
  "eplus;":0x2a71, "epsi;":0x3b5,
  "epsilon;":0x3b5, "epsiv;":0x3f5,
  "eqcirc;":0x2256, "eqcolon;":0x2255,
  "eqsim;":0x2242, "eqslantgtr;":0x2a96,
  "eqslantless;":0x2a95, "equals;":0x3d,
  "equest;":0x225f, "equiv;":0x2261,
  "equivDD;":0x2a78, "eqvparsl;":0x29e5,
  "erDot;":0x2253, "erarr;":0x2971,
  "escr;":0x212f, "esdot;":0x2250,
  "esim;":0x2242, "eta;":0x3b7,
  "eth;":0xf0, "euml;":0xeb,
  "euro;":0x20ac, "excl;":0x21,
  "exist;":0x2203, "expectation;":0x2130,
  "exponentiale;":0x2147, "fallingdotseq;":0x2252,
  "fcy;":0x444, "female;":0x2640,
  "ffilig;":0xfb03, "fflig;":0xfb00,
  "ffllig;":0xfb04, "ffr;":[0xd835,0xdd23],
  "filig;":0xfb01, "fjlig;":[0x66,0x6a],
  "flat;":0x266d, "fllig;":0xfb02,
  "fltns;":0x25b1, "fnof;":0x192,
  "fopf;":[0xd835,0xdd57], "forall;":0x2200,
  "fork;":0x22d4, "forkv;":0x2ad9,
  "fpartint;":0x2a0d, "frac12;":0xbd,
  "frac13;":0x2153, "frac14;":0xbc,
  "frac15;":0x2155, "frac16;":0x2159,
  "frac18;":0x215b, "frac23;":0x2154,
  "frac25;":0x2156, "frac34;":0xbe,
  "frac35;":0x2157, "frac38;":0x215c,
  "frac45;":0x2158, "frac56;":0x215a,
  "frac58;":0x215d, "frac78;":0x215e,
  "frasl;":0x2044, "frown;":0x2322,
  "fscr;":[0xd835,0xdcbb], "gE;":0x2267,
  "gEl;":0x2a8c, "gacute;":0x1f5,
  "gamma;":0x3b3, "gammad;":0x3dd,
  "gap;":0x2a86, "gbreve;":0x11f,
  "gcirc;":0x11d, "gcy;":0x433,
  "gdot;":0x121, "ge;":0x2265,
  "gel;":0x22db, "geq;":0x2265,
  "geqq;":0x2267, "geqslant;":0x2a7e,
  "ges;":0x2a7e, "gescc;":0x2aa9,
  "gesdot;":0x2a80, "gesdoto;":0x2a82,
  "gesdotol;":0x2a84, "gesl;":[0x22db,0xfe00],
  "gesles;":0x2a94, "gfr;":[0xd835,0xdd24],
  "gg;":0x226b, "ggg;":0x22d9,
  "gimel;":0x2137, "gjcy;":0x453,
  "gl;":0x2277, "glE;":0x2a92,
  "gla;":0x2aa5, "glj;":0x2aa4,
  "gnE;":0x2269, "gnap;":0x2a8a,
  "gnapprox;":0x2a8a, "gne;":0x2a88,
  "gneq;":0x2a88, "gneqq;":0x2269,
  "gnsim;":0x22e7, "gopf;":[0xd835,0xdd58],
  "grave;":0x60, "gscr;":0x210a,
  "gsim;":0x2273, "gsime;":0x2a8e,
  "gsiml;":0x2a90, "gt;":0x3e,
  "gtcc;":0x2aa7, "gtcir;":0x2a7a,
  "gtdot;":0x22d7, "gtlPar;":0x2995,
  "gtquest;":0x2a7c, "gtrapprox;":0x2a86,
  "gtrarr;":0x2978, "gtrdot;":0x22d7,
  "gtreqless;":0x22db, "gtreqqless;":0x2a8c,
  "gtrless;":0x2277, "gtrsim;":0x2273,
  "gvertneqq;":[0x2269,0xfe00], "gvnE;":[0x2269,0xfe00],
  "hArr;":0x21d4, "hairsp;":0x200a,
  "half;":0xbd, "hamilt;":0x210b,
  "hardcy;":0x44a, "harr;":0x2194,
  "harrcir;":0x2948, "harrw;":0x21ad,
  "hbar;":0x210f, "hcirc;":0x125,
  "hearts;":0x2665, "heartsuit;":0x2665,
  "hellip;":0x2026, "hercon;":0x22b9,
  "hfr;":[0xd835,0xdd25], "hksearow;":0x2925,
  "hkswarow;":0x2926, "hoarr;":0x21ff,
  "homtht;":0x223b, "hookleftarrow;":0x21a9,
  "hookrightarrow;":0x21aa, "hopf;":[0xd835,0xdd59],
  "horbar;":0x2015, "hscr;":[0xd835,0xdcbd],
  "hslash;":0x210f, "hstrok;":0x127,
  "hybull;":0x2043, "hyphen;":0x2010,
  "iacute;":0xed, "ic;":0x2063,
  "icirc;":0xee, "icy;":0x438,
  "iecy;":0x435, "iexcl;":0xa1,
  "iff;":0x21d4, "ifr;":[0xd835,0xdd26],
  "igrave;":0xec, "ii;":0x2148,
  "iiiint;":0x2a0c, "iiint;":0x222d,
  "iinfin;":0x29dc, "iiota;":0x2129,
  "ijlig;":0x133, "imacr;":0x12b,
  "image;":0x2111, "imagline;":0x2110,
  "imagpart;":0x2111, "imath;":0x131,
  "imof;":0x22b7, "imped;":0x1b5,
  "in;":0x2208, "incare;":0x2105,
  "infin;":0x221e, "infintie;":0x29dd,
  "inodot;":0x131, "int;":0x222b,
  "intcal;":0x22ba, "integers;":0x2124,
  "intercal;":0x22ba, "intlarhk;":0x2a17,
  "intprod;":0x2a3c, "iocy;":0x451,
  "iogon;":0x12f, "iopf;":[0xd835,0xdd5a],
  "iota;":0x3b9, "iprod;":0x2a3c,
  "iquest;":0xbf, "iscr;":[0xd835,0xdcbe],
  "isin;":0x2208, "isinE;":0x22f9,
  "isindot;":0x22f5, "isins;":0x22f4,
  "isinsv;":0x22f3, "isinv;":0x2208,
  "it;":0x2062, "itilde;":0x129,
  "iukcy;":0x456, "iuml;":0xef,
  "jcirc;":0x135, "jcy;":0x439,
  "jfr;":[0xd835,0xdd27], "jmath;":0x237,
  "jopf;":[0xd835,0xdd5b], "jscr;":[0xd835,0xdcbf],
  "jsercy;":0x458, "jukcy;":0x454,
  "kappa;":0x3ba, "kappav;":0x3f0,
  "kcedil;":0x137, "kcy;":0x43a,
  "kfr;":[0xd835,0xdd28], "kgreen;":0x138,
  "khcy;":0x445, "kjcy;":0x45c,
  "kopf;":[0xd835,0xdd5c], "kscr;":[0xd835,0xdcc0],
  "lAarr;":0x21da, "lArr;":0x21d0,
  "lAtail;":0x291b, "lBarr;":0x290e,
  "lE;":0x2266, "lEg;":0x2a8b,
  "lHar;":0x2962, "lacute;":0x13a,
  "laemptyv;":0x29b4, "lagran;":0x2112,
  "lambda;":0x3bb, "lang;":0x27e8,
  "langd;":0x2991, "langle;":0x27e8,
  "lap;":0x2a85, "laquo;":0xab,
  "larr;":0x2190, "larrb;":0x21e4,
  "larrbfs;":0x291f, "larrfs;":0x291d,
  "larrhk;":0x21a9, "larrlp;":0x21ab,
  "larrpl;":0x2939, "larrsim;":0x2973,
  "larrtl;":0x21a2, "lat;":0x2aab,
  "latail;":0x2919, "late;":0x2aad,
  "lates;":[0x2aad,0xfe00], "lbarr;":0x290c,
  "lbbrk;":0x2772, "lbrace;":0x7b,
  "lbrack;":0x5b, "lbrke;":0x298b,
  "lbrksld;":0x298f, "lbrkslu;":0x298d,
  "lcaron;":0x13e, "lcedil;":0x13c,
  "lceil;":0x2308, "lcub;":0x7b,
  "lcy;":0x43b, "ldca;":0x2936,
  "ldquo;":0x201c, "ldquor;":0x201e,
  "ldrdhar;":0x2967, "ldrushar;":0x294b,
  "ldsh;":0x21b2, "le;":0x2264,
  "leftarrow;":0x2190, "leftarrowtail;":0x21a2,
  "leftharpoondown;":0x21bd, "leftharpoonup;":0x21bc,
  "leftleftarrows;":0x21c7, "leftrightarrow;":0x2194,
  "leftrightarrows;":0x21c6, "leftrightharpoons;":0x21cb,
  "leftrightsquigarrow;":0x21ad, "leftthreetimes;":0x22cb,
  "leg;":0x22da, "leq;":0x2264,
  "leqq;":0x2266, "leqslant;":0x2a7d,
  "les;":0x2a7d, "lescc;":0x2aa8,
  "lesdot;":0x2a7f, "lesdoto;":0x2a81,
  "lesdotor;":0x2a83, "lesg;":[0x22da,0xfe00],
  "lesges;":0x2a93, "lessapprox;":0x2a85,
  "lessdot;":0x22d6, "lesseqgtr;":0x22da,
  "lesseqqgtr;":0x2a8b, "lessgtr;":0x2276,
  "lesssim;":0x2272, "lfisht;":0x297c,
  "lfloor;":0x230a, "lfr;":[0xd835,0xdd29],
  "lg;":0x2276, "lgE;":0x2a91,
  "lhard;":0x21bd, "lharu;":0x21bc,
  "lharul;":0x296a, "lhblk;":0x2584,
  "ljcy;":0x459, "ll;":0x226a,
  "llarr;":0x21c7, "llcorner;":0x231e,
  "llhard;":0x296b, "lltri;":0x25fa,
  "lmidot;":0x140, "lmoust;":0x23b0,
  "lmoustache;":0x23b0, "lnE;":0x2268,
  "lnap;":0x2a89, "lnapprox;":0x2a89,
  "lne;":0x2a87, "lneq;":0x2a87,
  "lneqq;":0x2268, "lnsim;":0x22e6,
  "loang;":0x27ec, "loarr;":0x21fd,
  "lobrk;":0x27e6, "longleftarrow;":0x27f5,
  "longleftrightarrow;":0x27f7, "longmapsto;":0x27fc,
  "longrightarrow;":0x27f6, "looparrowleft;":0x21ab,
  "looparrowright;":0x21ac, "lopar;":0x2985,
  "lopf;":[0xd835,0xdd5d], "loplus;":0x2a2d,
  "lotimes;":0x2a34, "lowast;":0x2217,
  "lowbar;":0x5f, "loz;":0x25ca,
  "lozenge;":0x25ca, "lozf;":0x29eb,
  "lpar;":0x28, "lparlt;":0x2993,
  "lrarr;":0x21c6, "lrcorner;":0x231f,
  "lrhar;":0x21cb, "lrhard;":0x296d,
  "lrm;":0x200e, "lrtri;":0x22bf,
  "lsaquo;":0x2039, "lscr;":[0xd835,0xdcc1],
  "lsh;":0x21b0, "lsim;":0x2272,
  "lsime;":0x2a8d, "lsimg;":0x2a8f,
  "lsqb;":0x5b, "lsquo;":0x2018,
  "lsquor;":0x201a, "lstrok;":0x142,
  "lt;":0x3c, "ltcc;":0x2aa6,
  "ltcir;":0x2a79, "ltdot;":0x22d6,
  "lthree;":0x22cb, "ltimes;":0x22c9,
  "ltlarr;":0x2976, "ltquest;":0x2a7b,
  "ltrPar;":0x2996, "ltri;":0x25c3,
  "ltrie;":0x22b4, "ltrif;":0x25c2,
  "lurdshar;":0x294a, "luruhar;":0x2966,
  "lvertneqq;":[0x2268,0xfe00], "lvnE;":[0x2268,0xfe00],
  "mDDot;":0x223a, "macr;":0xaf,
  "male;":0x2642, "malt;":0x2720,
  "maltese;":0x2720, "map;":0x21a6,
  "mapsto;":0x21a6, "mapstodown;":0x21a7,
  "mapstoleft;":0x21a4, "mapstoup;":0x21a5,
  "marker;":0x25ae, "mcomma;":0x2a29,
  "mcy;":0x43c, "mdash;":0x2014,
  "measuredangle;":0x2221, "mfr;":[0xd835,0xdd2a],
  "mho;":0x2127, "micro;":0xb5,
  "mid;":0x2223, "midast;":0x2a,
  "midcir;":0x2af0, "middot;":0xb7,
  "minus;":0x2212, "minusb;":0x229f,
  "minusd;":0x2238, "minusdu;":0x2a2a,
  "mlcp;":0x2adb, "mldr;":0x2026,
  "mnplus;":0x2213, "models;":0x22a7,
  "mopf;":[0xd835,0xdd5e], "mp;":0x2213,
  "mscr;":[0xd835,0xdcc2], "mstpos;":0x223e,
  "mu;":0x3bc, "multimap;":0x22b8,
  "mumap;":0x22b8, "nGg;":[0x22d9,0x338],
  "nGt;":[0x226b,0x20d2], "nGtv;":[0x226b,0x338],
  "nLeftarrow;":0x21cd, "nLeftrightarrow;":0x21ce,
  "nLl;":[0x22d8,0x338], "nLt;":[0x226a,0x20d2],
  "nLtv;":[0x226a,0x338], "nRightarrow;":0x21cf,
  "nVDash;":0x22af, "nVdash;":0x22ae,
  "nabla;":0x2207, "nacute;":0x144,
  "nang;":[0x2220,0x20d2], "nap;":0x2249,
  "napE;":[0x2a70,0x338], "napid;":[0x224b,0x338],
  "napos;":0x149, "napprox;":0x2249,
  "natur;":0x266e, "natural;":0x266e,
  "naturals;":0x2115, "nbsp;":0xa0,
  "nbump;":[0x224e,0x338], "nbumpe;":[0x224f,0x338],
  "ncap;":0x2a43, "ncaron;":0x148,
  "ncedil;":0x146, "ncong;":0x2247,
  "ncongdot;":[0x2a6d,0x338], "ncup;":0x2a42,
  "ncy;":0x43d, "ndash;":0x2013,
  "ne;":0x2260, "neArr;":0x21d7,
  "nearhk;":0x2924, "nearr;":0x2197,
  "nearrow;":0x2197, "nedot;":[0x2250,0x338],
  "nequiv;":0x2262, "nesear;":0x2928,
  "nesim;":[0x2242,0x338], "nexist;":0x2204,
  "nexists;":0x2204, "nfr;":[0xd835,0xdd2b],
  "ngE;":[0x2267,0x338], "nge;":0x2271,
  "ngeq;":0x2271, "ngeqq;":[0x2267,0x338],
  "ngeqslant;":[0x2a7e,0x338], "nges;":[0x2a7e,0x338],
  "ngsim;":0x2275, "ngt;":0x226f,
  "ngtr;":0x226f, "nhArr;":0x21ce,
  "nharr;":0x21ae, "nhpar;":0x2af2,
  "ni;":0x220b, "nis;":0x22fc,
  "nisd;":0x22fa, "niv;":0x220b,
  "njcy;":0x45a, "nlArr;":0x21cd,
  "nlE;":[0x2266,0x338], "nlarr;":0x219a,
  "nldr;":0x2025, "nle;":0x2270,
  "nleftarrow;":0x219a, "nleftrightarrow;":0x21ae,
  "nleq;":0x2270, "nleqq;":[0x2266,0x338],
  "nleqslant;":[0x2a7d,0x338], "nles;":[0x2a7d,0x338],
  "nless;":0x226e, "nlsim;":0x2274,
  "nlt;":0x226e, "nltri;":0x22ea,
  "nltrie;":0x22ec, "nmid;":0x2224,
  "nopf;":[0xd835,0xdd5f], "not;":0xac,
  "notin;":0x2209, "notinE;":[0x22f9,0x338],
  "notindot;":[0x22f5,0x338], "notinva;":0x2209,
  "notinvb;":0x22f7, "notinvc;":0x22f6,
  "notni;":0x220c, "notniva;":0x220c,
  "notnivb;":0x22fe, "notnivc;":0x22fd,
  "npar;":0x2226, "nparallel;":0x2226,
  "nparsl;":[0x2afd,0x20e5], "npart;":[0x2202,0x338],
  "npolint;":0x2a14, "npr;":0x2280,
  "nprcue;":0x22e0, "npre;":[0x2aaf,0x338],
  "nprec;":0x2280, "npreceq;":[0x2aaf,0x338],
  "nrArr;":0x21cf, "nrarr;":0x219b,
  "nrarrc;":[0x2933,0x338], "nrarrw;":[0x219d,0x338],
  "nrightarrow;":0x219b, "nrtri;":0x22eb,
  "nrtrie;":0x22ed, "nsc;":0x2281,
  "nsccue;":0x22e1, "nsce;":[0x2ab0,0x338],
  "nscr;":[0xd835,0xdcc3], "nshortmid;":0x2224,
  "nshortparallel;":0x2226, "nsim;":0x2241,
  "nsime;":0x2244, "nsimeq;":0x2244,
  "nsmid;":0x2224, "nspar;":0x2226,
  "nsqsube;":0x22e2, "nsqsupe;":0x22e3,
  "nsub;":0x2284, "nsubE;":[0x2ac5,0x338],
  "nsube;":0x2288, "nsubset;":[0x2282,0x20d2],
  "nsubseteq;":0x2288, "nsubseteqq;":[0x2ac5,0x338],
  "nsucc;":0x2281, "nsucceq;":[0x2ab0,0x338],
  "nsup;":0x2285, "nsupE;":[0x2ac6,0x338],
  "nsupe;":0x2289, "nsupset;":[0x2283,0x20d2],
  "nsupseteq;":0x2289, "nsupseteqq;":[0x2ac6,0x338],
  "ntgl;":0x2279, "ntilde;":0xf1,
  "ntlg;":0x2278, "ntriangleleft;":0x22ea,
  "ntrianglelefteq;":0x22ec, "ntriangleright;":0x22eb,
  "ntrianglerighteq;":0x22ed, "nu;":0x3bd,
  "num;":0x23, "numero;":0x2116,
  "numsp;":0x2007, "nvDash;":0x22ad,
  "nvHarr;":0x2904, "nvap;":[0x224d,0x20d2],
  "nvdash;":0x22ac, "nvge;":[0x2265,0x20d2],
  "nvgt;":[0x3e,0x20d2], "nvinfin;":0x29de,
  "nvlArr;":0x2902, "nvle;":[0x2264,0x20d2],
  "nvlt;":[0x3c,0x20d2], "nvltrie;":[0x22b4,0x20d2],
  "nvrArr;":0x2903, "nvrtrie;":[0x22b5,0x20d2],
  "nvsim;":[0x223c,0x20d2], "nwArr;":0x21d6,
  "nwarhk;":0x2923, "nwarr;":0x2196,
  "nwarrow;":0x2196, "nwnear;":0x2927,
  "oS;":0x24c8, "oacute;":0xf3,
  "oast;":0x229b, "ocir;":0x229a,
  "ocirc;":0xf4, "ocy;":0x43e,
  "odash;":0x229d, "odblac;":0x151,
  "odiv;":0x2a38, "odot;":0x2299,
  "odsold;":0x29bc, "oelig;":0x153,
  "ofcir;":0x29bf, "ofr;":[0xd835,0xdd2c],
  "ogon;":0x2db, "ograve;":0xf2,
  "ogt;":0x29c1, "ohbar;":0x29b5,
  "ohm;":0x3a9, "oint;":0x222e,
  "olarr;":0x21ba, "olcir;":0x29be,
  "olcross;":0x29bb, "oline;":0x203e,
  "olt;":0x29c0, "omacr;":0x14d,
  "omega;":0x3c9, "omicron;":0x3bf,
  "omid;":0x29b6, "ominus;":0x2296,
  "oopf;":[0xd835,0xdd60], "opar;":0x29b7,
  "operp;":0x29b9, "oplus;":0x2295,
  "or;":0x2228, "orarr;":0x21bb,
  "ord;":0x2a5d, "order;":0x2134,
  "orderof;":0x2134, "ordf;":0xaa,
  "ordm;":0xba, "origof;":0x22b6,
  "oror;":0x2a56, "orslope;":0x2a57,
  "orv;":0x2a5b, "oscr;":0x2134,
  "oslash;":0xf8, "osol;":0x2298,
  "otilde;":0xf5, "otimes;":0x2297,
  "otimesas;":0x2a36, "ouml;":0xf6,
  "ovbar;":0x233d, "par;":0x2225,
  "para;":0xb6, "parallel;":0x2225,
  "parsim;":0x2af3, "parsl;":0x2afd,
  "part;":0x2202, "pcy;":0x43f,
  "percnt;":0x25, "period;":0x2e,
  "permil;":0x2030, "perp;":0x22a5,
  "pertenk;":0x2031, "pfr;":[0xd835,0xdd2d],
  "phi;":0x3c6, "phiv;":0x3d5,
  "phmmat;":0x2133, "phone;":0x260e,
  "pi;":0x3c0, "pitchfork;":0x22d4,
  "piv;":0x3d6, "planck;":0x210f,
  "planckh;":0x210e, "plankv;":0x210f,
  "plus;":0x2b, "plusacir;":0x2a23,
  "plusb;":0x229e, "pluscir;":0x2a22,
  "plusdo;":0x2214, "plusdu;":0x2a25,
  "pluse;":0x2a72, "plusmn;":0xb1,
  "plussim;":0x2a26, "plustwo;":0x2a27,
  "pm;":0xb1, "pointint;":0x2a15,
  "popf;":[0xd835,0xdd61], "pound;":0xa3,
  "pr;":0x227a, "prE;":0x2ab3,
  "prap;":0x2ab7, "prcue;":0x227c,
  "pre;":0x2aaf, "prec;":0x227a,
  "precapprox;":0x2ab7, "preccurlyeq;":0x227c,
  "preceq;":0x2aaf, "precnapprox;":0x2ab9,
  "precneqq;":0x2ab5, "precnsim;":0x22e8,
  "precsim;":0x227e, "prime;":0x2032,
  "primes;":0x2119, "prnE;":0x2ab5,
  "prnap;":0x2ab9, "prnsim;":0x22e8,
  "prod;":0x220f, "profalar;":0x232e,
  "profline;":0x2312, "profsurf;":0x2313,
  "prop;":0x221d, "propto;":0x221d,
  "prsim;":0x227e, "prurel;":0x22b0,
  "pscr;":[0xd835,0xdcc5], "psi;":0x3c8,
  "puncsp;":0x2008, "qfr;":[0xd835,0xdd2e],
  "qint;":0x2a0c, "qopf;":[0xd835,0xdd62],
  "qprime;":0x2057, "qscr;":[0xd835,0xdcc6],
  "quaternions;":0x210d, "quatint;":0x2a16,
  "quest;":0x3f, "questeq;":0x225f,
  "quot;":0x22, "rAarr;":0x21db,
  "rArr;":0x21d2, "rAtail;":0x291c,
  "rBarr;":0x290f, "rHar;":0x2964,
  "race;":[0x223d,0x331], "racute;":0x155,
  "radic;":0x221a, "raemptyv;":0x29b3,
  "rang;":0x27e9, "rangd;":0x2992,
  "range;":0x29a5, "rangle;":0x27e9,
  "raquo;":0xbb, "rarr;":0x2192,
  "rarrap;":0x2975, "rarrb;":0x21e5,
  "rarrbfs;":0x2920, "rarrc;":0x2933,
  "rarrfs;":0x291e, "rarrhk;":0x21aa,
  "rarrlp;":0x21ac, "rarrpl;":0x2945,
  "rarrsim;":0x2974, "rarrtl;":0x21a3,
  "rarrw;":0x219d, "ratail;":0x291a,
  "ratio;":0x2236, "rationals;":0x211a,
  "rbarr;":0x290d, "rbbrk;":0x2773,
  "rbrace;":0x7d, "rbrack;":0x5d,
  "rbrke;":0x298c, "rbrksld;":0x298e,
  "rbrkslu;":0x2990, "rcaron;":0x159,
  "rcedil;":0x157, "rceil;":0x2309,
  "rcub;":0x7d, "rcy;":0x440,
  "rdca;":0x2937, "rdldhar;":0x2969,
  "rdquo;":0x201d, "rdquor;":0x201d,
  "rdsh;":0x21b3, "real;":0x211c,
  "realine;":0x211b, "realpart;":0x211c,
  "reals;":0x211d, "rect;":0x25ad,
  "reg;":0xae, "rfisht;":0x297d,
  "rfloor;":0x230b, "rfr;":[0xd835,0xdd2f],
  "rhard;":0x21c1, "rharu;":0x21c0,
  "rharul;":0x296c, "rho;":0x3c1,
  "rhov;":0x3f1, "rightarrow;":0x2192,
  "rightarrowtail;":0x21a3, "rightharpoondown;":0x21c1,
  "rightharpoonup;":0x21c0, "rightleftarrows;":0x21c4,
  "rightleftharpoons;":0x21cc, "rightrightarrows;":0x21c9,
  "rightsquigarrow;":0x219d, "rightthreetimes;":0x22cc,
  "ring;":0x2da, "risingdotseq;":0x2253,
  "rlarr;":0x21c4, "rlhar;":0x21cc,
  "rlm;":0x200f, "rmoust;":0x23b1,
  "rmoustache;":0x23b1, "rnmid;":0x2aee,
  "roang;":0x27ed, "roarr;":0x21fe,
  "robrk;":0x27e7, "ropar;":0x2986,
  "ropf;":[0xd835,0xdd63], "roplus;":0x2a2e,
  "rotimes;":0x2a35, "rpar;":0x29,
  "rpargt;":0x2994, "rppolint;":0x2a12,
  "rrarr;":0x21c9, "rsaquo;":0x203a,
  "rscr;":[0xd835,0xdcc7], "rsh;":0x21b1,
  "rsqb;":0x5d, "rsquo;":0x2019,
  "rsquor;":0x2019, "rthree;":0x22cc,
  "rtimes;":0x22ca, "rtri;":0x25b9,
  "rtrie;":0x22b5, "rtrif;":0x25b8,
  "rtriltri;":0x29ce, "ruluhar;":0x2968,
  "rx;":0x211e, "sacute;":0x15b,
  "sbquo;":0x201a, "sc;":0x227b,
  "scE;":0x2ab4, "scap;":0x2ab8,
  "scaron;":0x161, "sccue;":0x227d,
  "sce;":0x2ab0, "scedil;":0x15f,
  "scirc;":0x15d, "scnE;":0x2ab6,
  "scnap;":0x2aba, "scnsim;":0x22e9,
  "scpolint;":0x2a13, "scsim;":0x227f,
  "scy;":0x441, "sdot;":0x22c5,
  "sdotb;":0x22a1, "sdote;":0x2a66,
  "seArr;":0x21d8, "searhk;":0x2925,
  "searr;":0x2198, "searrow;":0x2198,
  "sect;":0xa7, "semi;":0x3b,
  "seswar;":0x2929, "setminus;":0x2216,
  "setmn;":0x2216, "sext;":0x2736,
  "sfr;":[0xd835,0xdd30], "sfrown;":0x2322,
  "sharp;":0x266f, "shchcy;":0x449,
  "shcy;":0x448, "shortmid;":0x2223,
  "shortparallel;":0x2225, "shy;":0xad,
  "sigma;":0x3c3, "sigmaf;":0x3c2,
  "sigmav;":0x3c2, "sim;":0x223c,
  "simdot;":0x2a6a, "sime;":0x2243,
  "simeq;":0x2243, "simg;":0x2a9e,
  "simgE;":0x2aa0, "siml;":0x2a9d,
  "simlE;":0x2a9f, "simne;":0x2246,
  "simplus;":0x2a24, "simrarr;":0x2972,
  "slarr;":0x2190, "smallsetminus;":0x2216,
  "smashp;":0x2a33, "smeparsl;":0x29e4,
  "smid;":0x2223, "smile;":0x2323,
  "smt;":0x2aaa, "smte;":0x2aac,
  "smtes;":[0x2aac,0xfe00], "softcy;":0x44c,
  "sol;":0x2f, "solb;":0x29c4,
  "solbar;":0x233f, "sopf;":[0xd835,0xdd64],
  "spades;":0x2660, "spadesuit;":0x2660,
  "spar;":0x2225, "sqcap;":0x2293,
  "sqcaps;":[0x2293,0xfe00], "sqcup;":0x2294,
  "sqcups;":[0x2294,0xfe00], "sqsub;":0x228f,
  "sqsube;":0x2291, "sqsubset;":0x228f,
  "sqsubseteq;":0x2291, "sqsup;":0x2290,
  "sqsupe;":0x2292, "sqsupset;":0x2290,
  "sqsupseteq;":0x2292, "squ;":0x25a1,
  "square;":0x25a1, "squarf;":0x25aa,
  "squf;":0x25aa, "srarr;":0x2192,
  "sscr;":[0xd835,0xdcc8], "ssetmn;":0x2216,
  "ssmile;":0x2323, "sstarf;":0x22c6,
  "star;":0x2606, "starf;":0x2605,
  "straightepsilon;":0x3f5, "straightphi;":0x3d5,
  "strns;":0xaf, "sub;":0x2282,
  "subE;":0x2ac5, "subdot;":0x2abd,
  "sube;":0x2286, "subedot;":0x2ac3,
  "submult;":0x2ac1, "subnE;":0x2acb,
  "subne;":0x228a, "subplus;":0x2abf,
  "subrarr;":0x2979, "subset;":0x2282,
  "subseteq;":0x2286, "subseteqq;":0x2ac5,
  "subsetneq;":0x228a, "subsetneqq;":0x2acb,
  "subsim;":0x2ac7, "subsub;":0x2ad5,
  "subsup;":0x2ad3, "succ;":0x227b,
  "succapprox;":0x2ab8, "succcurlyeq;":0x227d,
  "succeq;":0x2ab0, "succnapprox;":0x2aba,
  "succneqq;":0x2ab6, "succnsim;":0x22e9,
  "succsim;":0x227f, "sum;":0x2211,
  "sung;":0x266a, "sup;":0x2283,
  "sup1;":0xb9, "sup2;":0xb2,
  "sup3;":0xb3, "supE;":0x2ac6,
  "supdot;":0x2abe, "supdsub;":0x2ad8,
  "supe;":0x2287, "supedot;":0x2ac4,
  "suphsol;":0x27c9, "suphsub;":0x2ad7,
  "suplarr;":0x297b, "supmult;":0x2ac2,
  "supnE;":0x2acc, "supne;":0x228b,
  "supplus;":0x2ac0, "supset;":0x2283,
  "supseteq;":0x2287, "supseteqq;":0x2ac6,
  "supsetneq;":0x228b, "supsetneqq;":0x2acc,
  "supsim;":0x2ac8, "supsub;":0x2ad4,
  "supsup;":0x2ad6, "swArr;":0x21d9,
  "swarhk;":0x2926, "swarr;":0x2199,
  "swarrow;":0x2199, "swnwar;":0x292a,
  "szlig;":0xdf, "target;":0x2316,
  "tau;":0x3c4, "tbrk;":0x23b4,
  "tcaron;":0x165, "tcedil;":0x163,
  "tcy;":0x442, "tdot;":0x20db,
  "telrec;":0x2315, "tfr;":[0xd835,0xdd31],
  "there4;":0x2234, "therefore;":0x2234,
  "theta;":0x3b8, "thetasym;":0x3d1,
  "thetav;":0x3d1, "thickapprox;":0x2248,
  "thicksim;":0x223c, "thinsp;":0x2009,
  "thkap;":0x2248, "thksim;":0x223c,
  "thorn;":0xfe, "tilde;":0x2dc,
  "times;":0xd7, "timesb;":0x22a0,
  "timesbar;":0x2a31, "timesd;":0x2a30,
  "tint;":0x222d, "toea;":0x2928,
  "top;":0x22a4, "topbot;":0x2336,
  "topcir;":0x2af1, "topf;":[0xd835,0xdd65],
  "topfork;":0x2ada, "tosa;":0x2929,
  "tprime;":0x2034, "trade;":0x2122,
  "triangle;":0x25b5, "triangledown;":0x25bf,
  "triangleleft;":0x25c3, "trianglelefteq;":0x22b4,
  "triangleq;":0x225c, "triangleright;":0x25b9,
  "trianglerighteq;":0x22b5, "tridot;":0x25ec,
  "trie;":0x225c, "triminus;":0x2a3a,
  "triplus;":0x2a39, "trisb;":0x29cd,
  "tritime;":0x2a3b, "trpezium;":0x23e2,
  "tscr;":[0xd835,0xdcc9], "tscy;":0x446,
  "tshcy;":0x45b, "tstrok;":0x167,
  "twixt;":0x226c, "twoheadleftarrow;":0x219e,
  "twoheadrightarrow;":0x21a0, "uArr;":0x21d1,
  "uHar;":0x2963, "uacute;":0xfa,
  "uarr;":0x2191, "ubrcy;":0x45e,
  "ubreve;":0x16d, "ucirc;":0xfb,
  "ucy;":0x443, "udarr;":0x21c5,
  "udblac;":0x171, "udhar;":0x296e,
  "ufisht;":0x297e, "ufr;":[0xd835,0xdd32],
  "ugrave;":0xf9, "uharl;":0x21bf,
  "uharr;":0x21be, "uhblk;":0x2580,
  "ulcorn;":0x231c, "ulcorner;":0x231c,
  "ulcrop;":0x230f, "ultri;":0x25f8,
  "umacr;":0x16b, "uml;":0xa8,
  "uogon;":0x173, "uopf;":[0xd835,0xdd66],
  "uparrow;":0x2191, "updownarrow;":0x2195,
  "upharpoonleft;":0x21bf, "upharpoonright;":0x21be,
  "uplus;":0x228e, "upsi;":0x3c5,
  "upsih;":0x3d2, "upsilon;":0x3c5,
  "upuparrows;":0x21c8, "urcorn;":0x231d,
  "urcorner;":0x231d, "urcrop;":0x230e,
  "uring;":0x16f, "urtri;":0x25f9,
  "uscr;":[0xd835,0xdcca], "utdot;":0x22f0,
  "utilde;":0x169, "utri;":0x25b5,
  "utrif;":0x25b4, "uuarr;":0x21c8,
  "uuml;":0xfc, "uwangle;":0x29a7,
  "vArr;":0x21d5, "vBar;":0x2ae8,
  "vBarv;":0x2ae9, "vDash;":0x22a8,
  "vangrt;":0x299c, "varepsilon;":0x3f5,
  "varkappa;":0x3f0, "varnothing;":0x2205,
  "varphi;":0x3d5, "varpi;":0x3d6,
  "varpropto;":0x221d, "varr;":0x2195,
  "varrho;":0x3f1, "varsigma;":0x3c2,
  "varsubsetneq;":[0x228a,0xfe00], "varsubsetneqq;":[0x2acb,0xfe00],
  "varsupsetneq;":[0x228b,0xfe00], "varsupsetneqq;":[0x2acc,0xfe00],
  "vartheta;":0x3d1, "vartriangleleft;":0x22b2,
  "vartriangleright;":0x22b3, "vcy;":0x432,
  "vdash;":0x22a2, "vee;":0x2228,
  "veebar;":0x22bb, "veeeq;":0x225a,
  "vellip;":0x22ee, "verbar;":0x7c,
  "vert;":0x7c, "vfr;":[0xd835,0xdd33],
  "vltri;":0x22b2, "vnsub;":[0x2282,0x20d2],
  "vnsup;":[0x2283,0x20d2], "vopf;":[0xd835,0xdd67],
  "vprop;":0x221d, "vrtri;":0x22b3,
  "vscr;":[0xd835,0xdccb], "vsubnE;":[0x2acb,0xfe00],
  "vsubne;":[0x228a,0xfe00], "vsupnE;":[0x2acc,0xfe00],
  "vsupne;":[0x228b,0xfe00], "vzigzag;":0x299a,
  "wcirc;":0x175, "wedbar;":0x2a5f,
  "wedge;":0x2227, "wedgeq;":0x2259,
  "weierp;":0x2118, "wfr;":[0xd835,0xdd34],
  "wopf;":[0xd835,0xdd68], "wp;":0x2118,
  "wr;":0x2240, "wreath;":0x2240,
  "wscr;":[0xd835,0xdccc], "xcap;":0x22c2,
  "xcirc;":0x25ef, "xcup;":0x22c3,
  "xdtri;":0x25bd, "xfr;":[0xd835,0xdd35],
  "xhArr;":0x27fa, "xharr;":0x27f7,
  "xi;":0x3be, "xlArr;":0x27f8,
  "xlarr;":0x27f5, "xmap;":0x27fc,
  "xnis;":0x22fb, "xodot;":0x2a00,
  "xopf;":[0xd835,0xdd69], "xoplus;":0x2a01,
  "xotime;":0x2a02, "xrArr;":0x27f9,
  "xrarr;":0x27f6, "xscr;":[0xd835,0xdccd],
  "xsqcup;":0x2a06, "xuplus;":0x2a04,
  "xutri;":0x25b3, "xvee;":0x22c1,
  "xwedge;":0x22c0, "yacute;":0xfd,
  "yacy;":0x44f, "ycirc;":0x177,
  "ycy;":0x44b, "yen;":0xa5,
  "yfr;":[0xd835,0xdd36], "yicy;":0x457,
  "yopf;":[0xd835,0xdd6a], "yscr;":[0xd835,0xdcce],
  "yucy;":0x44e, "yuml;":0xff,
  "zacute;":0x17a, "zcaron;":0x17e,
  "zcy;":0x437, "zdot;":0x17c,
  "zeetrf;":0x2128, "zeta;":0x3b6,
  "zfr;":[0xd835,0xdd37], "zhcy;":0x436,
  "zigrarr;":0x21dd, "zopf;":[0xd835,0xdd6b],
  "zscr;":[0xd835,0xdccf], "zwj;":0x200d,
  "zwnj;":0x200c
};

// Regular expression constants used by the tokenizer and parser

// This regular expression matches the portion of a character reference
// (decimal, hex, or named) that comes after the ampersand. I'd like to
// use the y modifier to make it match at lastIndex, but for compatability
// with Node, I can't.
var CHARREF = /^#[0-9]+[^0-9]|^#[xX][0-9a-fA-F]+[^0-9a-fA-F]|^[a-zA-Z][a-zA-Z0-9]*[^a-zA-Z0-9]/;

// Like the above, but for named char refs, the last char can't be =
var ATTRCHARREF = /^#[0-9]+[^0-9]|^#[xX][0-9a-fA-F]+[^0-9a-fA-F]|^[a-zA-Z][a-zA-Z0-9]*[^=a-zA-Z0-9]/;

// note that \r is included in all of these regexps because it will need
// to be converted to LF by the scanChars() function.
var DBLQUOTEATTRVAL = /[^\r"&\u0000]+/g;
var SINGLEQUOTEATTRVAL = /[^\r'&\u0000]+/g;
var UNQUOTEDATTRVAL = /[^\r\t\n\f &>\u0000]+/g;
var TAGNAME = /[^\r\t\n\f \/>A-Z\u0000]+/g;
var ATTRNAME = /[^\r\t\n\f \/=>A-Z\u0000]+/g;

var DATATEXT = /[^&<\r\u0000\uffff]*/g;
var RAWTEXT = /[^<\r\u0000\uffff]*/g;
var PLAINTEXT = /[^\r\u0000\uffff]*/g;
// Since we don't have the 'sticky tag', add '|.' to the end of SIMPLETAG
// and SIMPLEATTR so that we are guaranteed to always match.  This prevents
// us from scanning past the lastIndex set. (Note that the desired matches
// are always greater than 1 char long, so longest-match will ensure that .
// is not matched unless the desired match fails.)
var SIMPLETAG = /(?:(\/)?([a-z]+)>)|[\s\S]/g;
var SIMPLEATTR = /(?:([-a-z]+)[ \t\n\f]*=[ \t\n\f]*('[^'&\r\u0000]*'|"[^"&\r\u0000]*"|[^\t\n\r\f "&'\u0000>][^&> \t\n\r\f\u0000]*[ \t\n\f]))|[\s\S]/g;

var NONWS = /[^\x09\x0A\x0C\x0D\x20]/;
var ALLNONWS = /[^\x09\x0A\x0C\x0D\x20]/g; // like above, with g flag
var NONWSNONNUL = /[^\x00\x09\x0A\x0C\x0D\x20]/; // don't allow NUL either
var LEADINGWS = /^[\x09\x0A\x0C\x0D\x20]+/;
var NULCHARS = /\x00/g;

/***
 * These are utility functions that don't use any of the parser's
 * internal state.
 */
function buf2str(buf) {
  var CHUNKSIZE=16384;
  if (buf.length < CHUNKSIZE) {
    return String.fromCharCode.apply(String, buf);
  }
  // special case for large strings, to avoid busting the stack.
  var result = '';
  for (var i = 0; i < buf.length; i += CHUNKSIZE) {
    result += String.fromCharCode.apply(String, buf.slice(i, i+CHUNKSIZE));
  }
  return result;
}

// Determine whether the element is a member of the set.
// The set is an object that maps namespaces to objects. The objects
// then map local tagnames to the value true if that tag is part of the set
function isA(elt, set) {
  var tagnames = set[elt.namespaceURI];
  return tagnames && tagnames[elt.localName];
}

function isMathmlTextIntegrationPoint(n) {
  return isA(n, mathmlTextIntegrationPointSet);
}

function isHTMLIntegrationPoint(n) {
  if (isA(n, htmlIntegrationPointSet)) return true;
  if (n.namespaceURI === NAMESPACE.MATHML &&
    n.localName === "annotation-xml") {
    var encoding = n.getAttribute("encoding");
    if (encoding) encoding = encoding.toLowerCase();
    if (encoding === "text/html" ||
      encoding === "application/xhtml+xml")
      return true;
  }
  return false;
}

function adjustSVGTagName(name) {
  if (name in svgTagNameAdjustments)
    return svgTagNameAdjustments[name];
  else
    return name;
}

function adjustSVGAttributes(attrs) {
  for(var i = 0, n = attrs.length; i < n; i++) {
    if (attrs[i][0] in svgAttrAdjustments) {
      attrs[i][0] = svgAttrAdjustments[attrs[i][0]];
    }
  }
}

function adjustMathMLAttributes(attrs) {
  for(var i = 0, n = attrs.length; i < n; i++) {
    if (attrs[i][0] === "definitionurl") {
      attrs[i][0] = "definitionURL";
      break;
    }
  }
}

function adjustForeignAttributes(attrs) {
  for(var i = 0, n = attrs.length; i < n; i++) {
    if (attrs[i][0] in foreignAttributes) {
      // Attributes with namespaces get a 3rd element:
      // [Qname, value, namespace]
      attrs[i].push(foreignAttributes[attrs[i][0]]);
    }
  }
}

// For each attribute in attrs, if elt doesn't have an attribute
// by that name, add the attribute to elt
// XXX: I'm ignoring namespaces for now
function transferAttributes(attrs, elt) {
  for(var i = 0, n = attrs.length; i < n; i++) {
    var name = attrs[i][0], value = attrs[i][1];
    if (elt.hasAttribute(name)) continue;
    elt._setAttribute(name, value);
  }
}

/***
 * The ElementStack class
 */
HTMLParser.ElementStack = function ElementStack() {
  this.elements = [];
  this.top = null; // stack.top is the "current node" in the spec
};

/*
// This is for debugging only
HTMLParser.ElementStack.prototype.toString = function(e) {
  return "STACK: " +
  this.elements.map(function(e) {return e.localName;}).join("-");
}
*/

HTMLParser.ElementStack.prototype.push = function(e) {
  this.elements.push(e);
  this.top = e;
};

HTMLParser.ElementStack.prototype.pop = function(e) {
  this.elements.pop();
  this.top = this.elements[this.elements.length-1];
};

// Pop elements off the stack up to and including the first
// element with the specified (HTML) tagname
HTMLParser.ElementStack.prototype.popTag = function(tag) {
  for(var i = this.elements.length-1; i >= 0; i--) {
    var e = this.elements[i];
    if (e.namespaceURI !== NAMESPACE.HTML) continue;
    if (e.localName === tag) break;
  }
  this.elements.length = i;
  this.top = this.elements[i-1];
};

// Pop elements off the stack up to and including the first
// element that is an instance of the specified type
HTMLParser.ElementStack.prototype.popElementType = function(type) {
  for(var i = this.elements.length-1; i >= 0; i--) {
    if (this.elements[i] instanceof type) break;
  }
  this.elements.length = i;
  this.top = this.elements[i-1];
};

// Pop elements off the stack up to and including the element e.
// Note that this is very different from removeElement()
// This requires that e is on the stack.
HTMLParser.ElementStack.prototype.popElement = function(e) {
  for(var i = this.elements.length-1; i >= 0; i--) {
    if (this.elements[i] === e) break;
  }
  this.elements.length = i;
  this.top = this.elements[i-1];
};

// Remove a specific element from the stack.
// Do nothing if the element is not on the stack
HTMLParser.ElementStack.prototype.removeElement = function(e) {
  if (this.top === e) this.pop();
  else {
    var idx = this.elements.lastIndexOf(e);
    if (idx !== -1)
      this.elements.splice(idx, 1);
  }
};

HTMLParser.ElementStack.prototype.clearToContext = function(type) {
  // Note that we don't loop to 0. Never pop the <html> elt off.
  for(var i = this.elements.length-1; i > 0; i--) {
    if (this.elements[i] instanceof type) break;
  }
  this.elements.length = i+1;
  this.top = this.elements[i];
};

HTMLParser.ElementStack.prototype.inSpecificScope = function(tag, set) {
  for(var i = this.elements.length-1; i >= 0; i--) {
    var elt = this.elements[i];
    var ns = elt.namespaceURI;
    var localname = elt.localName;
    if (ns === NAMESPACE.HTML && localname === tag) return true;
    var tags = set[ns];
    if (tags && localname in tags) return false;
  }
  return false;
};

// Like the above, but for a specific element, not a tagname
HTMLParser.ElementStack.prototype.elementInSpecificScope = function(target, set) {
  for(var i = this.elements.length-1; i >= 0; i--) {
    var elt = this.elements[i];
    if (elt === target) return true;
    var tags = set[elt.namespaceURI];
    if (tags && elt.localName in tags) return false;
  }
  return false;
};

// Like the above, but for an element interface, not a tagname
HTMLParser.ElementStack.prototype.elementTypeInSpecificScope = function(target, set) {
  for(var i = this.elements.length-1; i >= 0; i--) {
    var elt = this.elements[i];
    if (elt instanceof target) return true;
    var tags = set[elt.namespaceURI];
    if (tags && elt.localName in tags) return false;
  }
  return false;
};

HTMLParser.ElementStack.prototype.inScope = function(tag) {
  return this.inSpecificScope(tag, inScopeSet);
};

HTMLParser.ElementStack.prototype.elementInScope = function(e) {
  return this.elementInSpecificScope(e, inScopeSet);
};

HTMLParser.ElementStack.prototype.elementTypeInScope = function(type) {
  return this.elementTypeInSpecificScope(type, inScopeSet);
};

HTMLParser.ElementStack.prototype.inButtonScope = function(tag) {
  return this.inSpecificScope(tag, inButtonScopeSet);
};

HTMLParser.ElementStack.prototype.inListItemScope = function(tag) {
  return this.inSpecificScope(tag, inListItemScopeSet);
};

HTMLParser.ElementStack.prototype.inTableScope = function(tag) {
  return this.inSpecificScope(tag, inTableScopeSet);
};

HTMLParser.ElementStack.prototype.inSelectScope = function(tag) {
  // Can't implement this one with inSpecificScope, since it involves
  // a set defined by inverting another set. So implement manually.
  for(var i = this.elements.length-1; i >= 0; i--) {
    var elt = this.elements[i];
    if (elt.namespaceURI !== NAMESPACE.HTML) return false;
    var localname = elt.localName;
    if (localname === tag) return true;
    if (localname !== "optgroup" && localname !== "option")
      return false;
  }
  return false;
};

HTMLParser.ElementStack.prototype.generateImpliedEndTags = function(butnot) {
  for(var i = this.elements.length-1; i >= 0; i--) {
    var e = this.elements[i];
    if (butnot && e.localName === butnot) break;
    if (!isA(this.elements[i], impliedEndTagsSet)) break;
  }

  this.elements.length = i+1;
  this.top = this.elements[i];
};

/***
 * The ActiveFormattingElements class
 */
HTMLParser.ActiveFormattingElements = function AFE() {
  this.list = []; // elements
  this.attrs = []; // attribute tokens for cloning
};

HTMLParser.ActiveFormattingElements.prototype.MARKER = { localName: "|" };

/*
// For debugging
HTMLParser.ActiveFormattingElements.prototype.toString = function() {
  return "AFE: " +
  this.list.map(function(e) { return e.localName; }).join("-");
}
*/

HTMLParser.ActiveFormattingElements.prototype.insertMarker = function() {
  this.list.push(this.MARKER);
  this.attrs.push(this.MARKER);
};

HTMLParser.ActiveFormattingElements.prototype.push = function(elt, attrs) {
  // Scan backwards: if there are already 3 copies of this element
  // before we encounter a marker, then drop the last one
  var count = 0;
  for(var i = this.list.length-1; i >= 0; i--) {
    if (this.list[i] === this.MARKER) break;
    // equal() is defined below
    if (equal(elt, this.list[i], this.attrs[i])) {
      count++;
      if (count === 3) {
        this.list.splice(i, 1);
        this.attrs.splice(i, 1);
        break;
      }
    }
  }


  // Now push the element onto the list
  this.list.push(elt);

  // Copy the attributes and push those on, too
  var attrcopy = [];
  for(var i = 0; i < attrs.length; i++) {
    attrcopy[i] = attrs[i];
  }

  this.attrs.push(attrcopy);

  // This function defines equality of two elements for the purposes
  // of the AFE list.  Note that it compares the new elements
  // attributes to the saved array of attributes associated with
  // the old element because a script could have changed the
  // old element's set of attributes
  function equal(newelt, oldelt, oldattrs) {
    if (newelt.localName !== oldelt.localName) return false;
    if (newelt._numattrs !== oldattrs.length) return false;
    for(var i = 0, n = oldattrs.length; i < n; i++) {
      var oldname = oldattrs[i][0];
      var oldval = oldattrs[i][1];
      if (!newelt.hasAttribute(oldname)) return false;
      if (newelt.getAttribute(oldname) !== oldval) return false;
    }
    return true;
  }
};

HTMLParser.ActiveFormattingElements.prototype.clearToMarker = function() {
  for(var i = this.list.length-1; i >= 0; i--) {
    if (this.list[i] === this.MARKER) break;
  }
  if (i < 0) i = 0;
  this.list.length = i;
  this.attrs.length = i;
};

// Find and return the last element with the specified tag between the
// end of the list and the last marker on the list.
// Used when parsing <a> in_body_mode()
HTMLParser.ActiveFormattingElements.prototype.findElementByTag = function(tag) {
  for(var i = this.list.length-1; i >= 0; i--) {
    var elt = this.list[i];
    if (elt === this.MARKER) break;
    if (elt.localName === tag) return elt;
  }
  return null;
};

HTMLParser.ActiveFormattingElements.prototype.indexOf = function(e) {
  return this.list.lastIndexOf(e);
};

// Find the element e in the list and remove it
// Used when parsing <a> in_body()
HTMLParser.ActiveFormattingElements.prototype.remove = function(e) {
  var idx = this.list.lastIndexOf(e);
  if (idx !== -1) {
    this.list.splice(idx, 1);
    this.attrs.splice(idx, 1);
  }
};

// Find element a in the list and replace it with element b
// XXX: Do I need to handle attributes here?
HTMLParser.ActiveFormattingElements.prototype.replace = function(a, b, attrs) {
  var idx = this.list.lastIndexOf(a);
  if (idx !== -1) {
    this.list[idx] = b;
    if (attrs) this.attrs[idx] = attrs;
  }
};

// Find a in the list and insert b after it
// This is only used for insert a bookmark object, so the
// attrs array doesn't really matter
HTMLParser.ActiveFormattingElements.prototype.insertAfter = function(a,b) {
  var idx = this.list.lastIndexOf(a);
  if (idx !== -1) {
    this.list.splice(idx, 0, b);
    this.attrs.splice(idx, 0, b);
  }
};




/***
 * This is the parser factory function. It is the return value of
 * the outer closure that it is defined within.  Most of the parser
 * implementation details are inside this function.
 */
function HTMLParser(address, fragmentContext, options) {
  /***
   * These are the parser's state variables
   */
  // Scanner state
  var chars = null;
  var numchars = 0; // Length of chars
  var nextchar = 0; // Index of next char
  var input_complete = false; // Becomes true when end() called.
  var scanner_skip_newline = false; // If previous char was CR
  var reentrant_invocations = 0;
  var saved_scanner_state = [];
  var leftovers = "";
  var first_batch = true;
  var paused = 0; // Becomes non-zero while loading scripts


  // Tokenizer state
  var tokenizer = data_state; // Current tokenizer state
  var savedTokenizerStates = []; // Stack of saved states
  var tagnamebuf = "";
  var lasttagname = ""; // holds the target end tag for text states
  var tempbuf = [];
  var attrnamebuf = "";
  var attrvaluebuf = "";
  var commentbuf = [];
  var doctypenamebuf = [];
  var doctypepublicbuf = [];
  var doctypesystembuf = [];
  var attributes = [];
  var is_end_tag = false;

  // Tree builder state
  var parser = initial_mode; // Current insertion mode
  var originalInsertionMode = null; // A saved insertion mode
  var stack = new HTMLParser.ElementStack(); // Stack of open elements
  var afe = new HTMLParser.ActiveFormattingElements(); // mis-nested tags
  var fragment = (fragmentContext!==undefined); // For innerHTML, etc.
  var script_nesting_level = 0;
  var parser_pause_flag = false;
  var head_element_pointer = null;
  var form_element_pointer = null;
  var scripting_enabled = true;
  if (options && options.scripting_enabled === false)
    scripting_enabled = false;
  var frameset_ok = true;
  var force_quirks = false;
  var pending_table_text;
  var text_integration_mode; // XXX a spec bug workaround?

  // A single run of characters, buffered up to be sent to
  // the parser as a single string.
  var textrun = [];
  var textIncludesNUL = false;
  var ignore_linefeed = false;

  /***
   * This is the parser object that will be the return value of this
   * factory function, which is some 5000 lines below.
   * Note that the variable "parser" is the current state of the
   * parser's state machine.  This variable "htmlparser" is the
   * return value and defines the public API of the parser
   */
  var htmlparser = {
    document: function() {
      return doc;
    },

    // Internal function used from HTMLScriptElement to pause the
    // parser while a script is being loaded from the network
    pause: function() {
      // print("pausing parser");
      paused++;
    },

    // Called when a script finishes loading
    resume: function() {
      // print("resuming parser");
      paused--;
      // XXX: added this to force a resumption.
      // Is this the right thing to do?
      this.parse("");
    },

    // Parse the HTML text s.
    // The second argument should be true if there is no more
    // text to be parsed, and should be false or omitted otherwise.
    // The second argument must not be set for recursive invocations
    // from document.write()
    parse: function(s, end) {

      // If we're paused, remember the text to parse, but
      // don't parse it now.
      if (paused > 0) {
        leftovers += s;
        return;
      }


      if (reentrant_invocations === 0) {
        // A normal, top-level invocation
        if (leftovers) {
          s = leftovers + s;
          leftovers = "";
        }

        // Add a special marker character to the end of
        // the buffer.  If the scanner is at the end of
        // the buffer and input_complete is set, then this
        // character will transform into an EOF token.
        // Having an actual character that represents EOF
        // in the character buffer makes lookahead regexp
        // matching work more easily, and this is
        // important for character references.
        if (end) {
          s += "\uFFFF";
          input_complete = true; // Makes scanChars() send EOF
        }

        chars = s;
        numchars = s.length;
        nextchar = 0;

        if (first_batch) {
          // We skip a leading Byte Order Mark (\uFEFF)
          // on first batch of text we're given
          first_batch = false;
          if (chars.charCodeAt(0) === 0xFEFF) nextchar = 1;
        }

        reentrant_invocations++;
        scanChars();
        leftovers = chars.substring(nextchar, numchars);
        reentrant_invocations--;
      }
      else {
        // This is the re-entrant case, which we have to
        // handle a little differently.
        reentrant_invocations++;

        // Save current scanner state
        saved_scanner_state.push(chars, numchars, nextchar);

        // Set new scanner state
        chars = s;
        numchars = s.length;
        nextchar = 0;

        // Now scan as many of these new chars as we can
        scanChars();

        leftovers = chars.substring(nextchar, numchars);

        // restore old scanner state
        nextchar = saved_scanner_state.pop();
        numchars = saved_scanner_state.pop();
        chars = saved_scanner_state.pop();

        // If there were leftover chars from this invocation
        // insert them into the pending invocation's buffer
        // and trim already processed chars at the same time
        if (leftovers) {
          chars = leftovers + chars.substring(nextchar);
          numchars = chars.length;
          nextchar = 0;
          leftovers = "";
        }

        // Decrement the counter
        reentrant_invocations--;
      }
    }
  };


  // This is the document we'll be building up
  var doc = new Document(true, address);

  // The document needs to know about the parser, for document.write().
  // This _parser property will be deleted when we're done parsing.
  doc._parser = htmlparser;

  // XXX I think that any document we use this parser on should support
  // scripts. But I may need to configure that through a parser parameter
  // Only documents with windows ("browsing contexts" to be precise)
  // allow scripting.
  doc._scripting_enabled = scripting_enabled;


  /***
   * The actual code of the HTMLParser() factory function begins here.
   */

  if (fragmentContext) { // for innerHTML parsing
    if (fragmentContext.ownerDocument._quirks)
      doc._quirks = true;
    if (fragmentContext.ownerDocument._limitedQuirks)
      doc._limitedQuirks = true;

    // Set the initial tokenizer state
    if (fragmentContext.namespaceURI === NAMESPACE.HTML) {
      switch(fragmentContext.localName) {
      case "title":
      case "textarea":
        tokenizer = rcdata_state;
        break;
      case "style":
      case "xmp":
      case "iframe":
      case "noembed":
      case "noframes":
      case "script":
      case "plaintext":
        tokenizer = plaintext_state;
        break;
      case "noscript":
        if (scripting_enabled)
          tokenizer = plaintext_state;
      }
    }

    var root = doc.createElement("html");
    doc._appendChild(root);
    stack.push(root);
    resetInsertionMode();

    for(var e = fragmentContext; e !== null; e = e.parentElement) {
      if (e instanceof impl.HTMLFormElement) {
        form_element_pointer = e;
        break;
      }
    }
  }

  /***
   * Scanner functions
   */
  // Loop through the characters in chars, and pass them one at a time
  // to the tokenizer FSM. Return when no more characters can be processed
  // (This may leave 1 or more characters in the buffer: like a CR
  // waiting to see if the next char is LF, or for states that require
  // lookahead...)
  function scanChars() {
    var codepoint, s, pattern, eof, matched;

    while(nextchar < numchars) {

      // If we just tokenized a </script> tag, then the paused flag
      // may have been set to tell us to stop tokenizing while
      // the script is loading
      if (paused > 0) {
        return;
      }


      switch(typeof tokenizer.lookahead) {
      case 'undefined':
        codepoint = chars.charCodeAt(nextchar++);
        if (scanner_skip_newline) {
          scanner_skip_newline = false;
          if (codepoint === 0x000A) {
            nextchar++;
            continue;
          }
        }
        switch(codepoint) {
        case 0x000D:
          // CR always turns into LF, but if the next character
          // is LF, then that second LF is skipped.
          if (nextchar < numchars) {
            if (chars.charCodeAt(nextchar) === 0x000A)
              nextchar++;
          }
          else {
            // We don't know the next char right now, so we
            // can't check if it is a LF.  So set a flag
            scanner_skip_newline = true;
          }

          // In either case, emit a LF
          tokenizer(0x000A);

          break;
        case 0xFFFF:
          if (input_complete && nextchar === numchars) {
            tokenizer(EOF); // codepoint will be 0xFFFF here
            break;
          }
          /* falls through */
        default:
          tokenizer(codepoint);
          break;
        }
        break;

      case 'number':
        codepoint = chars.charCodeAt(nextchar);

        // The only tokenizer states that require fixed lookahead
        // only consume alphanum characters, so we don't have
        // to worry about CR and LF in this case

        // tokenizer wants n chars of lookahead
        var n = tokenizer.lookahead;

        if (n < numchars - nextchar) {
          // If we can look ahead that far
          s = chars.substring(nextchar, nextchar+n);
          eof = false;
        }
        else { // if we don't have that many characters
          if (input_complete) { // If no more are coming
            // Just return what we have
            s = chars.substring(nextchar, numchars);
            eof = true;
            if (codepoint === 0xFFFF && nextchar === numchars-1)
              codepoint = EOF;
          }
          else {
            // Return now and wait for more chars later
            return;
          }
        }
        tokenizer(codepoint, s, eof);
        break;
      case 'string':
        codepoint = chars.charCodeAt(nextchar);

        // tokenizer wants characters up to a matching string
        pattern = tokenizer.lookahead;
        var pos = chars.indexOf(pattern, nextchar);
        if (pos !== -1) {
          s = chars.substring(nextchar, pos + pattern.length);
          eof = false;
        }
        else {  // No match
          // If more characters coming, wait for them
          if (!input_complete) return;

          // Otherwise, we've got to return what we've got
          s = chars.substring(nextchar, numchars);
          if (codepoint === 0xFFFF && nextchar === numchars-1)
            codepoint = EOF;
          eof = true;
        }

        // The tokenizer states that require this kind of
        // lookahead have to be careful to handle CR characters
        // correctly
        tokenizer(codepoint, s, eof);
        break;
      case 'object':
      case 'function':
        codepoint = chars.charCodeAt(nextchar);

        // tokenizer wants characters that match a regexp
        // The only tokenizer states that use regexp lookahead
        // are for character entities, and the patterns never
        // match CR or LF, so we don't need to worry about that
        // here.

        // XXX
        // Ideally, I'd use the non-standard y modifier on
        // these regexps and set pattern.lastIndex to nextchar.
        // But v8 and Node don't support /y, so I have to do
        // the substring below
        pattern = tokenizer.lookahead;
        matched = chars.substring(nextchar).match(pattern);
        if (matched) {
          // Found a match.
          // lastIndex now points to the first char after it
          s = matched[0];
          eof = false;
        }
        else {
          // No match.  If we're not at the end of input, then
          // wait for more chars
          if (!input_complete) return;

          // Otherwise, pass an empty string.  This is
          // different than the string-based lookahead
          // above. Regexp-based lookahead is only used
          // for character references, and a partial one
          // will not parse.  Also, a char ref
          // terminated with EOF will parse in the if
          // branch above, so here we're dealing with
          // things that really aren't char refs
          s = "";
          eof = true;
        }

        tokenizer(codepoint, s, eof);
        break;
      }
    }
  }


  /***
   * Tokenizer utility functions
   */
  function addAttribute(name,value) {
    // Make sure there isn't already an attribute with this name
    // If there is, ignore this one.
    for(var i = 0; i < attributes.length; i++) {
      if (attributes[i][0] === name) return;
    }

    if (value !== undefined) {
      attributes.push([name, value]);
    }
    else {
      attributes.push([name]);
    }
  }

  // Shortcut for simple attributes
  function handleSimpleAttribute() {
    SIMPLEATTR.lastIndex = nextchar-1;
    var matched = SIMPLEATTR.exec(chars);
    if (!matched) throw new Error("should never happen");
    var name = matched[1];
    if (!name) return false;
    var value = matched[2];
    var len = value.length;
    switch(value[0]) {
    case '"':
    case "'":
      value = value.substring(1, len-1);
      nextchar += (matched[0].length-1);
      tokenizer = after_attribute_value_quoted_state;
      break;
    default:
      tokenizer = before_attribute_name_state;
      nextchar += (matched[0].length-1);
      value = value.substring(0, len-1);
      break;
    }

    // Make sure there isn't already an attribute with this name
    // If there is, ignore this one.
    for(var i = 0; i < attributes.length; i++) {
      if (attributes[i][0] === name) return true;
    }

    attributes.push([name, value]);
    return true;
  }


  function pushState() { savedTokenizerStates.push(tokenizer); }
  function popState() { tokenizer = savedTokenizerStates.pop(); }
  function beginTagName() {
    is_end_tag = false;
    tagnamebuf = "";
    attributes.length = 0;
  }
  function beginEndTagName() {
    is_end_tag = true;
    tagnamebuf = "";
    attributes.length = 0;
  }

  function beginTempBuf() { tempbuf.length = 0; }
  function beginAttrName() { attrnamebuf = ""; }
  function beginAttrValue() { attrvaluebuf = ""; }
  function beginComment() { commentbuf.length = 0; }
  function beginDoctype() {
    doctypenamebuf.length = 0;
    doctypepublicbuf = null;
    doctypesystembuf = null;
  }
  function beginDoctypePublicId() { doctypepublicbuf = []; }
  function beginDoctypeSystemId() { doctypesystembuf = []; }
  function forcequirks() { force_quirks = true; }
  function cdataAllowed() {
    return stack.top &&
      stack.top.namespaceURI !== "http://www.w3.org/1999/xhtml";
  }

  // Return true if the codepoints in the specified buffer match the
  // characters of lasttagname
  function appropriateEndTag(buf) {
    return lasttagname === buf;
  }

  function flushText() {
    if (textrun.length > 0) {
      var s = buf2str(textrun);
      textrun.length = 0;

      if (ignore_linefeed) {
        ignore_linefeed = false;
        if (s[0] === "\n") s = s.substring(1);
        if (s.length === 0) return;
      }

      insertToken(TEXT, s);
      textIncludesNUL = false;
    }
    ignore_linefeed = false;
  }

  // Consume chars matched by the pattern and return them as a string. Starts
  // matching at the current position, so users should drop the current char
  // otherwise.
  function getMatchingChars(pattern) {
      pattern.lastIndex = nextchar - 1;
      var match = pattern.exec(chars);
      if (match && match.index === nextchar - 1) {
          match = match[0];
          nextchar += match.length - 1;
          return match;
      } else {
          throw new Error("should never happen");
      }
  }

  // emit a string of chars that match a regexp
  // Returns false if no chars matched.
  function emitCharsWhile(pattern) {
    pattern.lastIndex = nextchar-1;
    var match = pattern.exec(chars)[0];
    if (!match) return false;
    emitCharString(match);
    nextchar += match.length - 1;
    return true;
  }

  // This is used by CDATA sections
  function emitCharString(s) {
    if (textrun.length > 0) flushText();

    if (ignore_linefeed) {
      ignore_linefeed = false;
      if (s[0] === "\n") s = s.substring(1);
      if (s.length === 0) return;
    }

    insertToken(TEXT, s);
  }

  function emitTag() {
    if (is_end_tag) insertToken(ENDTAG, tagnamebuf);
    else {
      // Remember the last open tag we emitted
      var tagname = tagnamebuf;
      tagnamebuf = "";
      lasttagname = tagname;
      insertToken(TAG, tagname, attributes);
    }
  }


  // A shortcut: look ahead and if this is a open or close tag
  // in lowercase with no spaces and no attributes, just emit it now.
  function emitSimpleTag() {
    SIMPLETAG.lastIndex = nextchar;
    var matched = SIMPLETAG.exec(chars);
    if (!matched) throw new Error("should never happen");
    var tagname = matched[2];
    if (!tagname) return false;
    var endtag = matched[1];
    if (endtag) {
      nextchar += (tagname.length+2);
      insertToken(ENDTAG, tagname);
    }
    else {
      nextchar += (tagname.length+1);
      lasttagname = tagname;
      insertToken(TAG, tagname, NOATTRS);
    }
    return true;
  }

  function emitSelfClosingTag() {
    if (is_end_tag) insertToken(ENDTAG, tagnamebuf, null, true);
    else {
      insertToken(TAG, tagnamebuf, attributes, true);
    }
  }

  function emitDoctype() {
    insertToken(DOCTYPE,
          buf2str(doctypenamebuf),
          doctypepublicbuf ? buf2str(doctypepublicbuf) : undefined,
          doctypesystembuf ? buf2str(doctypesystembuf) : undefined);
  }

  function emitEOF() {
    flushText();
    parser(EOF); // EOF never goes to insertForeignContent()
    doc.modclock = 1; // Start tracking modifications
  }

  // Insert a token, either using the current parser insertion mode
  // (for HTML stuff) or using the insertForeignToken() method.
  function insertToken(t, value, arg3, arg4) {
    flushText();
    var current = stack.top;

    if (!current || current.namespaceURI === NAMESPACE.HTML) {
      // This is the common case
      parser(t, value, arg3, arg4);
    }
    else {
      // Otherwise we may need to insert this token as foreign content
      if (t !== TAG && t !== TEXT) {
        insertForeignToken(t, value, arg3, arg4);
      }
      else {
        // But in some cases we treat it as regular content
        if ((isMathmlTextIntegrationPoint(current) &&
           (t === TEXT ||
            (t === TAG &&
             value !== "mglyph" && value !== "malignmark"))) ||
          (t === TAG &&
           value === "svg" &&
           current.namespaceURI === NAMESPACE.MATHML &&
           current.localName === "annotation-xml") ||
          isHTMLIntegrationPoint(current)) {

          // XXX: the text_integration_mode stuff is an
          // attempted bug workaround of mine
          text_integration_mode = true;
          parser(t, value, arg3, arg4);
          text_integration_mode = false;
        }
        // Otherwise it is foreign content
        else {
          insertForeignToken(t, value, arg3, arg4);
        }
      }
    }
  }


  /***
   * Tree building utility functions
   */
  function insertComment(data) {
    stack.top._appendChild(doc.createComment(data));
  }

  function insertText(s) {
    if (foster_parent_mode && isA(stack.top, tablesectionrowSet)) {
      fosterParent(doc.createTextNode(s));
    }
    else {
      var lastChild = stack.top.lastChild;
      if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
        lastChild.appendData(s);
      }
      else {
        stack.top._appendChild(doc.createTextNode(s));
      }
    }
  }

  function createHTMLElt(name, attrs) {
    // Create the element this way, rather than with
    // doc.createElement because createElement() does error
    // checking on the element name that we need to avoid here.
    var elt = html.createElement(doc, name, null);

    if (attrs) {
      for(var i = 0, n = attrs.length; i < n; i++) {
        // Use the _ version to avoid testing the validity
        // of the attribute name
        elt._setAttribute(attrs[i][0], attrs[i][1]);
      }
    }
    // XXX
    // If the element is a resettable form element,
    // run its reset algorithm now
    return elt;
  }

  // The in_table insertion mode turns on this flag, and that makes
  // insertHTMLElement use the foster parenting algorithm for elements
  // tags inside a table
  var foster_parent_mode = false;

  function insertHTMLElement(name, attrs) {
    var elt = createHTMLElt(name, attrs);
    insertElement(elt);

    // XXX
    // If this is a form element, set its form attribute property here
    if (isA(elt, formassociatedSet)) {
      elt._form = form_element_pointer;
    }

    return elt;
  }

  // Insert the element into the open element or foster parent it
  function insertElement(elt) {
    if (foster_parent_mode && isA(stack.top, tablesectionrowSet)) {
      fosterParent(elt);
    }
    else {
      stack.top._appendChild(elt);
    }

    stack.push(elt);
  }

  function insertForeignElement(name, attrs, ns) {
    var elt = doc.createElementNS(ns, name);
    if (attrs) {
      for(var i = 0, n = attrs.length; i < n; i++) {
        var attr = attrs[i];
        if (attr.length == 2)
          elt._setAttribute(attr[0], attr[1]);
        else {
          elt._setAttributeNS(attr[2], attr[0], attr[1]);
        }
      }
    }

    insertElement(elt);
  }

  function fosterParent(elt) {
    var parent, before;

    for(var i = stack.elements.length-1; i >= 0; i--) {
      if (stack.elements[i] instanceof impl.HTMLTableElement) {
        parent = stack.elements[i].parentElement;
        if (parent)
          before = stack.elements[i];
        else
          parent = stack.elements[i-1];

        break;
      }
    }
    if (!parent) parent = stack.elements[0];

    if (elt.nodeType === Node.TEXT_NODE) {
      var prev;
      if (before) prev = before.previousSibling;
      else prev = parent.lastChild;
      if (prev && prev.nodeType === Node.TEXT_NODE) {
        prev.appendData(elt.data);
        return;
      }
    }
    if (before)
      parent.insertBefore(elt, before);
    else
      parent._appendChild(elt);
  }


  function resetInsertionMode() {
    var last = false;
    for(var i = stack.elements.length-1; i >= 0; i--) {
      var node = stack.elements[i];
      if (i === 0) {
        last = true;
        node = fragmentContext;
      }
      if (node.namespaceURI === NAMESPACE.HTML) {
        var tag = node.localName;
        switch(tag) {
        case "select":
          parser = in_select_mode;
          return;
        case "tr":
          parser = in_row_mode;
          return;
        case "tbody":
        case "tfoot":
        case "thead":
          parser = in_table_body_mode;
          return;
        case "caption":
          parser = in_caption_mode;
          return;
        case "colgroup":
          parser = in_column_group_mode;
          return;
        case "table":
          parser = in_table_mode;
          return;
        case "head": // Not in_head_mode!
        case "body":
          parser = in_body_mode;
          return;
        case "frameset":
          parser = in_frameset_mode;
          return;
        case "html":
          parser = before_head_mode;
          return;
        default:
          if (!last && (tag === "td" || tag === "th")) {
            parser = in_cell_mode;
            return;
          }
        }
      }
      if (last) {
        parser = in_body_mode;
        return;
      }
    }
  }


  function parseRawText(name, attrs) {
    insertHTMLElement(name, attrs);
    tokenizer = rawtext_state;
    originalInsertionMode = parser;
    parser = text_mode;
  }

  function parseRCDATA(name, attrs) {
    insertHTMLElement(name, attrs);
    tokenizer = rcdata_state;
    originalInsertionMode = parser;
    parser = text_mode;
  }

  // Make a copy of element i on the list of active formatting
  // elements, using its original attributes, not current
  // attributes (which may have been modified by a script)
  function afeclone(i) {
    return createHTMLElt(afe.list[i].localName, afe.attrs[i]);
  }


  function afereconstruct() {
    if (afe.list.length === 0) return;
    var entry = afe.list[afe.list.length-1];
    // If the last is a marker , do nothing
    if (entry === afe.MARKER) return;
    // Or if it is an open element, do nothing
    if (stack.elements.lastIndexOf(entry) !== -1) return;

    // Loop backward through the list until we find a marker or an
    // open element, and then move forward one from there.
    for(var i = afe.list.length-2; i >= 0; i--) {
      entry = afe.list[i];
      if (entry === afe.MARKER) break;
      if (stack.elements.lastIndexOf(entry) !== -1) break;
    }

    // Now loop forward, starting from the element after the current
    // one, recreating formatting elements and pushing them back onto
    // the list of open elements
    for(i = i+1; i < afe.list.length; i++) {
      var newelt = afeclone(i);
      insertElement(newelt);
      afe.list[i] = newelt;
    }
  }

  // Used by the adoptionAgency() function
  var BOOKMARK = {localName:"BM"};

  function adoptionAgency(tag) {
    // Let outer loop counter be zero.
    var outer = 0;

    // Outer loop: If outer loop counter is greater than or
    // equal to eight, then abort these steps.
    while(outer < 8) {
      // Increment outer loop counter by one.
      outer++;

      // Let the formatting element be the last element in the list
      // of active formatting elements that: is between the end of
      // the list and the last scope marker in the list, if any, or
      // the start of the list otherwise, and has the same tag name
      // as the token.
      var fmtelt = afe.findElementByTag(tag);

      // If there is no such node, then abort these steps and instead
      // act as described in the "any other end tag" entry below.
      if (!fmtelt) {
        return false; // false means handle by the default case
      }

      // Otherwise, if there is such a node, but that node is not in
      // the stack of open elements, then this is a parse error;
      // remove the element from the list, and abort these steps.
      var index = stack.elements.lastIndexOf(fmtelt);
      if (index === -1) {
        afe.remove(fmtelt);
        return true;   // true means no more handling required
      }

      // Otherwise, if there is such a node, and that node is also in
      // the stack of open elements, but the element is not in scope,
      // then this is a parse error; ignore the token, and abort
      // these steps.
      if (!stack.elementInScope(fmtelt)) {
        return true;
      }

      // Let the furthest block be the topmost node in the stack of
      // open elements that is lower in the stack than the formatting
      // element, and is an element in the special category. There
      // might not be one.
      var furthestblock = null, furthestblockindex;
      for(var i = index+1; i < stack.elements.length; i++) {
        if (isA(stack.elements[i], specialSet)) {
          furthestblock = stack.elements[i];
          furthestblockindex = i;
          break;
        }
      }

      // If there is no furthest block, then the UA must skip the
      // subsequent steps and instead just pop all the nodes from the
      // bottom of the stack of open elements, from the current node
      // up to and including the formatting element, and remove the
      // formatting element from the list of active formatting
      // elements.
      if (!furthestblock) {
        stack.popElement(fmtelt);
        afe.remove(fmtelt);
        return true;
      }
      else {
        // Let the common ancestor be the element immediately above
        // the formatting element in the stack of open elements.
        var ancestor = stack.elements[index-1];

        // Let a bookmark note the position of the formatting
        // element in the list of active formatting elements
        // relative to the elements on either side of it in the
        // list.
        afe.insertAfter(fmtelt, BOOKMARK);

        // Let node and last node be the furthest block.
        var node = furthestblock;
        var lastnode = furthestblock;
        var nodeindex = furthestblockindex;
        var nodeafeindex;

        // Let inner loop counter be zero.
        var inner = 0;

        // Inner loop: If inner loop counter is greater than
        // or equal to three, then abort these steps.
        while(inner < 3) {

          // Increment inner loop counter by one.
          inner++;

          // Let node be the element immediately above node in
          // the stack of open elements, or if node is no longer
          // in the stack of open elements (e.g. because it got
          // removed by the next step), the element that was
          // immediately above node in the stack of open elements
          // before node was removed.
          node = stack.elements[--nodeindex];

          // If node is not in the list of active formatting
          // elements, then remove node from the stack of open
          // elements and then go back to the step labeled inner
          // loop.
          nodeafeindex = afe.indexOf(node);
          if (nodeafeindex === -1) {
            stack.removeElement(node);
            continue;
          }

          // Otherwise, if node is the formatting element, then go
          // to the next step in the overall algorithm.
          if (node === fmtelt) break;

          // Create an element for the token for which the
          // element node was created, replace the entry for node
          // in the list of active formatting elements with an
          // entry for the new element, replace the entry for
          // node in the stack of open elements with an entry for
          // the new element, and let node be the new element.
          var newelt = afeclone(nodeafeindex);
          afe.replace(node, newelt);
          stack.elements[nodeindex] = newelt;
          node = newelt;

          // If last node is the furthest block, then move the
          // aforementioned bookmark to be immediately after the
          // new node in the list of active formatting elements.
          if (lastnode === furthestblock) {
            afe.remove(BOOKMARK);
            afe.insertAfter(newelt, BOOKMARK);
          }

          // Insert last node into node, first removing it from
          // its previous parent node if any.
          node._appendChild(lastnode);

          // Let last node be node.
          lastnode = node;
        }

        // If the common ancestor node is a table, tbody, tfoot,
        // thead, or tr element, then, foster parent whatever last
        // node ended up being in the previous step, first removing
        // it from its previous parent node if any.
        if (isA(ancestor, tablesectionrowSet)) {
          fosterParent(lastnode);
        }
        // Otherwise, append whatever last node ended up being in
        // the previous step to the common ancestor node, first
        // removing it from its previous parent node if any.
        else {
          ancestor._appendChild(lastnode);
        }

        // Create an element for the token for which the
        // formatting element was created.
        var newelt2 = afeclone(afe.indexOf(fmtelt));

        // Take all of the child nodes of the furthest block and
        // append them to the element created in the last step.
        while(furthestblock.hasChildNodes()) {
          newelt2._appendChild(furthestblock.firstChild);
        }

        // Append that new element to the furthest block.
        furthestblock._appendChild(newelt2);

        // Remove the formatting element from the list of active
        // formatting elements, and insert the new element into the
        // list of active formatting elements at the position of
        // the aforementioned bookmark.
        afe.remove(fmtelt);
        afe.replace(BOOKMARK, newelt2);

        // Remove the formatting element from the stack of open
        // elements, and insert the new element into the stack of
        // open elements immediately below the position of the
        // furthest block in that stack.
        stack.removeElement(fmtelt);
        var pos = stack.elements.lastIndexOf(furthestblock);
        stack.elements.splice(pos+1, 0, newelt2);
      }
    }

    return true;
  }

  // We do this when we get /script in in_text_mode
  function handleScriptEnd() {
    // XXX:
    // This is just a stub implementation right now and doesn't run scripts.
    // Getting this method right involves the event loop, URL resolution
    // script fetching etc. For now I just want to be able to parse
    // documents and test the parser.

    var script = stack.top;
    stack.pop();
    parser = originalInsertionMode;
    //script._prepare();
    return;

    // XXX: here is what this method is supposed to do

    // Provide a stable state.

    // Let script be the current node (which will be a script
    // element).

    // Pop the current node off the stack of open elements.

    // Switch the insertion mode to the original insertion mode.

    // Let the old insertion point have the same value as the current
    // insertion point. Let the insertion point be just before the
    // next input character.

    // Increment the parser's script nesting level by one.

    // Prepare the script. This might cause some script to execute,
    // which might cause new characters to be inserted into the
    // tokenizer, and might cause the tokenizer to output more tokens,
    // resulting in a reentrant invocation of the parser.

    // Decrement the parser's script nesting level by one. If the
    // parser's script nesting level is zero, then set the parser
    // pause flag to false.

    // Let the insertion point have the value of the old insertion
    // point. (In other words, restore the insertion point to its
    // previous value. This value might be the "undefined" value.)

    // At this stage, if there is a pending parsing-blocking script,
    // then:

    // If the script nesting level is not zero:

    //   Set the parser pause flag to true, and abort the processing
    //   of any nested invocations of the tokenizer, yielding
    //   control back to the caller. (Tokenization will resume when
    //   the caller returns to the "outer" tree construction stage.)

    //   The tree construction stage of this particular parser is
    //   being called reentrantly, say from a call to
    //   document.write().

    // Otherwise:

    //     Run these steps:

    //       Let the script be the pending parsing-blocking
    //       script. There is no longer a pending
    //       parsing-blocking script.

    //       Block the tokenizer for this instance of the HTML
    //       parser, such that the event loop will not run tasks
    //       that invoke the tokenizer.

    //       If the parser's Document has a style sheet that is
    //       blocking scripts or the script's "ready to be
    //       parser-executed" flag is not set: spin the event
    //       loop until the parser's Document has no style sheet
    //       that is blocking scripts and the script's "ready to
    //       be parser-executed" flag is set.

    //       Unblock the tokenizer for this instance of the HTML
    //       parser, such that tasks that invoke the tokenizer
    //       can again be run.

    //       Let the insertion point be just before the next
    //       input character.

    //       Increment the parser's script nesting level by one
    //       (it should be zero before this step, so this sets
    //       it to one).

    //       Execute the script.

    //       Decrement the parser's script nesting level by
    //       one. If the parser's script nesting level is zero
    //       (which it always should be at this point), then set
    //       the parser pause flag to false.

    //       Let the insertion point be undefined again.

    //       If there is once again a pending parsing-blocking
    //       script, then repeat these steps from step 1.


  }

  function stopParsing() {
    // XXX This is just a temporary implementation to get the parser working.
    // A full implementation involves scripts and events and the event loop.

    // Remove the link from document to parser.
    // This is instead of "set the insertion point to undefined".
    // It means that document.write() can't write into the doc anymore.
    delete doc._parser;

    stack.elements.length = 0; // pop everything off

    // If there is a window object associated with the document
    // then trigger an load event on it
    if (doc.defaultView) {
      doc.defaultView.dispatchEvent(new impl.Event("load",{}));
    }

  }

  /****
   * Tokenizer states
   */

  /**
   * This file was partially mechanically generated from
   * http://www.whatwg.org/specs/web-apps/current-work/multipage/tokenization.html
   *
   * After mechanical conversion, it was further converted from
   * prose to JS by hand, but the intent is that it is a very
   * faithful rendering of the HTML tokenization spec in
   * JavaScript.
   *
   * It is not a goal of this tokenizer to detect or report
   * parse errors.
   *
   * XXX The tokenizer is supposed to work with straight UTF32
   * codepoints. But I don't think it has any dependencies on
   * any character outside of the BMP so I think it is safe to
   * pass it UTF16 characters. I don't think it will ever change
   * state in the middle of a surrogate pair.
   */

  /*
   * Each state is represented by a function.  For most states, the
   * scanner simply passes the next character (as an integer
   * codepoint) to the current state function and automatically
   * consumes the character.  If the state function can't process
   * the character it can call pushback() to push it back to the
   * scanner.
   *
   * Some states require lookahead, though.  If a state function has
   * a lookahead property, then it is invoked differently.  In this
   * case, the scanner invokes the function with 3 arguments: 1) the
   * next codepoint 2) a string of lookahead text 3) a boolean that
   * is true if the lookahead goes all the way to the EOF. (XXX
   * actually maybe this third is not necessary... the lookahead
   * could just include \uFFFF?)
   *
   * If the lookahead property of a state function is an integer, it
   * specifies the number of characters required. If it is a string,
   * then the scanner will scan for that string and return all
   * characters up to and including that sequence, or up to EOF.  If
   * the lookahead property is a regexp, then the scanner will match
   * the regexp at the current point and return the matching string.
   *
   * States that require lookahead are responsible for explicitly
   * consuming the characters they process. They do this by
   * incrementing nextchar by the number of processed characters.
   */

  function data_state(c) {
    switch(c) {
    case 0x0026: // AMPERSAND
      tokenizer = character_reference_in_data_state;
      break;
    case 0x003C: // LESS-THAN SIGN
      if (emitSimpleTag()) // Shortcut for <p>, <dl>, </div> etc.
        break;
      tokenizer = tag_open_state;
      break;
    case 0x0000: // NULL
      // Usually null characters emitted by the tokenizer will be
      // ignored by the tree builder, but sometimes they'll be
      // converted to \uFFFD.  I don't want to have the search every
      // string emitted to replace NULs, so I'll set a flag
      // if I've emitted a NUL.
      textrun.push(c);
      textIncludesNUL = true;
      break;
    case -1: // EOF
      emitEOF();
      break;
    default:
      // Instead of just pushing a single character and then
      // coming back to the very same place, lookahead and
      // emit everything we can at once.
      emitCharsWhile(DATATEXT) || textrun.push(c);
      break;
    }
  }

  function character_reference_in_data_state(c, lookahead, eof) {
    var char = parseCharRef(lookahead, false);
    if (char !== null) {
      if (typeof char === "number") textrun.push(char);
      else pushAll(textrun, char); // An array of characters
    }
    else
      textrun.push(0x0026); // AMPERSAND;

    tokenizer = data_state;
  }
  character_reference_in_data_state.lookahead = CHARREF;

  function rcdata_state(c) {
    // Save the open tag so we can find a matching close tag
    switch(c) {
    case 0x0026: // AMPERSAND
      tokenizer = character_reference_in_rcdata_state;
      break;
    case 0x003C: // LESS-THAN SIGN
      tokenizer = rcdata_less_than_sign_state;
      break;
    case 0x0000: // NULL
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      textIncludesNUL = true;
      break;
    case -1: // EOF
      emitEOF();
      break;
    default:
      textrun.push(c);
      break;
    }
  }

  function character_reference_in_rcdata_state(c, lookahead, eof) {
    var char = parseCharRef(lookahead, false);
    if (char !== null) {
      if (typeof char === "number") textrun.push(char);
      else pushAll(textrun, char); // An array of characters
    }
    else
      textrun.push(0x0026); // AMPERSAND;

    tokenizer = rcdata_state;
  }
  character_reference_in_rcdata_state.lookahead = CHARREF;

  function rawtext_state(c) {
    switch(c) {
    case 0x003C: // LESS-THAN SIGN
      tokenizer = rawtext_less_than_sign_state;
      break;
    case 0x0000: // NULL
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      emitEOF();
      break;
    default:
      emitCharsWhile(RAWTEXT) || textrun.push(c);
      break;
    }
  }

  function script_data_state(c) {
    switch(c) {
    case 0x003C: // LESS-THAN SIGN
      tokenizer = script_data_less_than_sign_state;
      break;
    case 0x0000: // NULL
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      emitEOF();
      break;
    default:
      emitCharsWhile(RAWTEXT) || textrun.push(c);
      break;
    }
  }

  function plaintext_state(c) {
    switch(c) {
    case 0x0000: // NULL
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      emitEOF();
      break;
    default:
      emitCharsWhile(PLAINTEXT) || textrun.push(c);
      break;
    }
  }

  function tag_open_state(c) {
    switch(c) {
    case 0x0021: // EXCLAMATION MARK
      tokenizer = markup_declaration_open_state;
      break;
    case 0x002F: // SOLIDUS
      tokenizer = end_tag_open_state;
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginTagName();
      tagnamebuf += String.fromCharCode(c + 0x0020 /* to lowercase */);
      tokenizer = tag_name_state;
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      beginTagName();
      tagnamebuf += getMatchingChars(TAGNAME);
      tokenizer = tag_name_state;
      break;
    case 0x003F: // QUESTION MARK
      nextchar--; // pushback
      tokenizer = bogus_comment_state;
      break;
    default:
      textrun.push(0x003C); // LESS-THAN SIGN
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    }
  }

  function end_tag_open_state(c) {
    switch(c) {
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c + 0x0020 /* to lowercase */);
      tokenizer = tag_name_state;
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      beginEndTagName();
      tagnamebuf += getMatchingChars(TAGNAME);
      tokenizer = tag_name_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      break;
    case -1: // EOF
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(0x002F); // SOLIDUS
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      nextchar--; // pushback
      tokenizer = bogus_comment_state;
      break;
    }
  }

  function tag_name_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = before_attribute_name_state;
      break;
    case 0x002F: // SOLIDUS
      tokenizer = self_closing_start_tag_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitTag();
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      tagnamebuf += String.fromCharCode(c + 0x0020);
      break;
    case 0x0000: // NULL
      tagnamebuf += String.fromCharCode(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      tagnamebuf += getMatchingChars(TAGNAME);
      break;
    }
  }

  function rcdata_less_than_sign_state(c) {
    /* identical to the RAWTEXT less-than sign state, except s/RAWTEXT/RCDATA/g */
    if (c === 0x002F) {  // SOLIDUS
      beginTempBuf();
      tokenizer = rcdata_end_tag_open_state;
    }
    else {
      textrun.push(0x003C); // LESS-THAN SIGN
      nextchar--; // pushback
      tokenizer = rcdata_state;
    }
  }

  function rcdata_end_tag_open_state(c) {
    /* identical to the RAWTEXT (and Script data) end tag open state, except s/RAWTEXT/RCDATA/g */
    switch(c) {
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      tokenizer = rcdata_end_tag_name_state;
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      tokenizer = rcdata_end_tag_name_state;
      break;
    default:
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(0x002F); // SOLIDUS
      nextchar--; // pushback
      tokenizer = rcdata_state;
      break;
    }
  }

  function rcdata_end_tag_name_state(c) {
    /* identical to the RAWTEXT (and Script data) end tag name state, except s/RAWTEXT/RCDATA/g */
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = before_attribute_name_state;
        return;
      }
      break;
    case 0x002F: // SOLIDUS
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = self_closing_start_tag_state;
        return;
      }
      break;
    case 0x003E: // GREATER-THAN SIGN
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = data_state;
        emitTag();
        return;
      }
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:

      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      return;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:

      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      return;
    default:
      break;
    }

    // If we don't return in one of the cases above, then this was not
    // an appropriately matching close tag, so back out by emitting all
    // the characters as text
    textrun.push(0x003C); // LESS-THAN SIGN
    textrun.push(0x002F); // SOLIDUS
    pushAll(textrun, tempbuf);
    nextchar--; // pushback
    tokenizer = rcdata_state;
  }

  function rawtext_less_than_sign_state(c) {
    /* identical to the RCDATA less-than sign state, except s/RCDATA/RAWTEXT/g
     */
    if (c === 0x002F) { // SOLIDUS
      beginTempBuf();
      tokenizer = rawtext_end_tag_open_state;
    }
    else {
      textrun.push(0x003C); // LESS-THAN SIGN
      nextchar--; // pushback
      tokenizer = rawtext_state;
    }
  }

  function rawtext_end_tag_open_state(c) {
    /* identical to the RCDATA (and Script data) end tag open state, except s/RCDATA/RAWTEXT/g */
    switch(c) {
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      tokenizer = rawtext_end_tag_name_state;
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      tokenizer = rawtext_end_tag_name_state;
      break;
    default:
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(0x002F); // SOLIDUS
      nextchar--; // pushback
      tokenizer = rawtext_state;
      break;
    }
  }

  function rawtext_end_tag_name_state(c) {
    /* identical to the RCDATA (and Script data) end tag name state, except s/RCDATA/RAWTEXT/g */
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = before_attribute_name_state;
        return;
      }
      break;
    case 0x002F: // SOLIDUS
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = self_closing_start_tag_state;
        return;
      }
      break;
    case 0x003E: // GREATER-THAN SIGN
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = data_state;
        emitTag();
        return;
      }
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      return;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      return;
    default:
      break;
    }

    // If we don't return in one of the cases above, then this was not
    // an appropriately matching close tag, so back out by emitting all
    // the characters as text
    textrun.push(0x003C); // LESS-THAN SIGN
    textrun.push(0x002F); // SOLIDUS
    pushAll(textrun,tempbuf);
    nextchar--; // pushback
    tokenizer = rawtext_state;
  }

  function script_data_less_than_sign_state(c) {
    switch(c) {
    case 0x002F: // SOLIDUS
      beginTempBuf();
      tokenizer = script_data_end_tag_open_state;
      break;
    case 0x0021: // EXCLAMATION MARK
      tokenizer = script_data_escape_start_state;
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(0x0021); // EXCLAMATION MARK
      break;
    default:
      textrun.push(0x003C); // LESS-THAN SIGN
      nextchar--; // pushback
      tokenizer = script_data_state;
      break;
    }
  }

  function script_data_end_tag_open_state(c) {
    /* identical to the RCDATA (and RAWTEXT) end tag open state, except s/RCDATA/Script data/g */
    switch(c) {
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      tokenizer = script_data_end_tag_name_state;
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      tokenizer = script_data_end_tag_name_state;
      break;
    default:
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(0x002F); // SOLIDUS
      nextchar--; // pushback
      tokenizer = script_data_state;
      break;
    }
  }

  function script_data_end_tag_name_state(c) {
    /* identical to the RCDATA (and RAWTEXT) end tag name state, except s/RCDATA/Script data/g */
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = before_attribute_name_state;
        return;
      }
      break;
    case 0x002F: // SOLIDUS
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = self_closing_start_tag_state;
        return;
      }
      break;
    case 0x003E: // GREATER-THAN SIGN
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = data_state;
        emitTag();
        return;
      }
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:

      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      return;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:

      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      return;
    default:
      break;
    }

    // If we don't return in one of the cases above, then this was not
    // an appropriately matching close tag, so back out by emitting all
    // the characters as text
    textrun.push(0x003C); // LESS-THAN SIGN
    textrun.push(0x002F); // SOLIDUS
    pushAll(textrun,tempbuf);
    nextchar--; // pushback
    tokenizer = script_data_state;
  }

  function script_data_escape_start_state(c) {
    if (c === 0x002D) { // HYPHEN-MINUS
      tokenizer = script_data_escape_start_dash_state;
      textrun.push(0x002D); // HYPHEN-MINUS
    }
    else {
      nextchar--; // pushback
      tokenizer = script_data_state;
    }
  }

  function script_data_escape_start_dash_state(c) {
    if (c === 0x002D) { // HYPHEN-MINUS
      tokenizer = script_data_escaped_dash_dash_state;
      textrun.push(0x002D); // HYPHEN-MINUS
    }
    else {
      nextchar--; // pushback
      tokenizer = script_data_state;
    }
  }

  function script_data_escaped_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = script_data_escaped_dash_state;
      textrun.push(0x002D); // HYPHEN-MINUS
      break;
    case 0x003C: // LESS-THAN SIGN
      tokenizer = script_data_escaped_less_than_sign_state;
      break;
    case 0x0000: // NULL
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      textrun.push(c);
      break;
    }
  }

  function script_data_escaped_dash_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = script_data_escaped_dash_dash_state;
      textrun.push(0x002D); // HYPHEN-MINUS
      break;
    case 0x003C: // LESS-THAN SIGN
      tokenizer = script_data_escaped_less_than_sign_state;
      break;
    case 0x0000: // NULL
      tokenizer = script_data_escaped_state;
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      tokenizer = script_data_escaped_state;
      textrun.push(c);
      break;
    }
  }

  function script_data_escaped_dash_dash_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      textrun.push(0x002D); // HYPHEN-MINUS
      break;
    case 0x003C: // LESS-THAN SIGN
      tokenizer = script_data_escaped_less_than_sign_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = script_data_state;
      textrun.push(0x003E); // GREATER-THAN SIGN
      break;
    case 0x0000: // NULL
      tokenizer = script_data_escaped_state;
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      tokenizer = script_data_escaped_state;
      textrun.push(c);
      break;
    }
  }

  function script_data_escaped_less_than_sign_state(c) {
    switch(c) {
    case 0x002F: // SOLIDUS
      beginTempBuf();
      tokenizer = script_data_escaped_end_tag_open_state;
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginTempBuf();
      tempbuf.push(c + 0x0020);
      tokenizer = script_data_double_escape_start_state;
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(c);
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      beginTempBuf();
      tempbuf.push(c);
      tokenizer = script_data_double_escape_start_state;
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(c);
      break;
    default:
      textrun.push(0x003C); // LESS-THAN SIGN
      nextchar--; // pushback
      tokenizer = script_data_escaped_state;
      break;
    }
  }

  function script_data_escaped_end_tag_open_state(c) {
    switch(c) {
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      tokenizer = script_data_escaped_end_tag_name_state;
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      beginEndTagName();
      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      tokenizer = script_data_escaped_end_tag_name_state;
      break;
    default:
      textrun.push(0x003C); // LESS-THAN SIGN
      textrun.push(0x002F); // SOLIDUS
      nextchar--; // pushback
      tokenizer = script_data_escaped_state;
      break;
    }
  }

  function script_data_escaped_end_tag_name_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = before_attribute_name_state;
        return;
      }
      break;
    case 0x002F: // SOLIDUS
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = self_closing_start_tag_state;
        return;
      }
      break;
    case 0x003E: // GREATER-THAN SIGN
      if (appropriateEndTag(tagnamebuf)) {
        tokenizer = data_state;
        emitTag();
        return;
      }
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      tagnamebuf += String.fromCharCode(c + 0x0020);
      tempbuf.push(c);
      return;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      tagnamebuf += String.fromCharCode(c);
      tempbuf.push(c);
      return;
    default:
      break;
    }

    // We get here in the default case, and if the closing tagname
    // is not an appropriate tagname.
    textrun.push(0x003C); // LESS-THAN SIGN
    textrun.push(0x002F); // SOLIDUS
    pushAll(textrun,tempbuf);
    nextchar--; // pushback
    tokenizer = script_data_escaped_state;
  }

  function script_data_double_escape_start_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
    case 0x002F: // SOLIDUS
    case 0x003E: // GREATER-THAN SIGN
      if (buf2str(tempbuf) === "script") {
        tokenizer = script_data_double_escaped_state;
      }
      else {
        tokenizer = script_data_escaped_state;
      }
      textrun.push(c);
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      tempbuf.push(c + 0x0020);
      textrun.push(c);
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      tempbuf.push(c);
      textrun.push(c);
      break;
    default:
      nextchar--; // pushback
      tokenizer = script_data_escaped_state;
      break;
    }
  }

  function script_data_double_escaped_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = script_data_double_escaped_dash_state;
      textrun.push(0x002D); // HYPHEN-MINUS
      break;
    case 0x003C: // LESS-THAN SIGN
      tokenizer = script_data_double_escaped_less_than_sign_state;
      textrun.push(0x003C); // LESS-THAN SIGN
      break;
    case 0x0000: // NULL
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      textrun.push(c);
      break;
    }
  }

  function script_data_double_escaped_dash_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = script_data_double_escaped_dash_dash_state;
      textrun.push(0x002D); // HYPHEN-MINUS
      break;
    case 0x003C: // LESS-THAN SIGN
      tokenizer = script_data_double_escaped_less_than_sign_state;
      textrun.push(0x003C); // LESS-THAN SIGN
      break;
    case 0x0000: // NULL
      tokenizer = script_data_double_escaped_state;
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      tokenizer = script_data_double_escaped_state;
      textrun.push(c);
      break;
    }
  }

  function script_data_double_escaped_dash_dash_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      textrun.push(0x002D); // HYPHEN-MINUS
      break;
    case 0x003C: // LESS-THAN SIGN
      tokenizer = script_data_double_escaped_less_than_sign_state;
      textrun.push(0x003C); // LESS-THAN SIGN
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = script_data_state;
      textrun.push(0x003E); // GREATER-THAN SIGN
      break;
    case 0x0000: // NULL
      tokenizer = script_data_double_escaped_state;
      textrun.push(0xFFFD); // REPLACEMENT CHARACTER
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      tokenizer = script_data_double_escaped_state;
      textrun.push(c);
      break;
    }
  }

  function script_data_double_escaped_less_than_sign_state(c) {
    if (c === 0x002F) { // SOLIDUS
      beginTempBuf();
      tokenizer = script_data_double_escape_end_state;
      textrun.push(0x002F); // SOLIDUS
    }
    else {
      nextchar--; // pushback
      tokenizer = script_data_double_escaped_state;
    }
  }

  function script_data_double_escape_end_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
    case 0x002F: // SOLIDUS
    case 0x003E: // GREATER-THAN SIGN
      if (buf2str(tempbuf) === "script") {
        tokenizer = script_data_escaped_state;
      }
      else {
        tokenizer = script_data_double_escaped_state;
      }
      textrun.push(c);
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      tempbuf.push(c + 0x0020);
      textrun.push(c);
      break;
    case 0x0061:  // [a-z]
    case 0x0062:case 0x0063:case 0x0064:case 0x0065:case 0x0066:
    case 0x0067:case 0x0068:case 0x0069:case 0x006A:case 0x006B:
    case 0x006C:case 0x006D:case 0x006E:case 0x006F:case 0x0070:
    case 0x0071:case 0x0072:case 0x0073:case 0x0074:case 0x0075:
    case 0x0076:case 0x0077:case 0x0078:case 0x0079:case 0x007A:
      tempbuf.push(c);
      textrun.push(c);
      break;
    default:
      nextchar--; // pushback
      tokenizer = script_data_double_escaped_state;
      break;
    }
  }

  function before_attribute_name_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      /* Ignore the character. */
      break;
    case 0x002F: // SOLIDUS
      tokenizer = self_closing_start_tag_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitTag();
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginAttrName();
      attrnamebuf += String.fromCharCode(c + 0x0020);
      tokenizer = attribute_name_state;
      break;
    case 0x0000: // NULL
      beginAttrName();
      attrnamebuf += String.fromCharCode(0xFFFD);
      tokenizer = attribute_name_state;
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    case 0x0022: // QUOTATION MARK
    case 0x0027: // APOSTROPHE
    case 0x003C: // LESS-THAN SIGN
    case 0x003D: // EQUALS SIGN
      /* falls through */
    default:
      if (handleSimpleAttribute()) break;
      beginAttrName();
      if (c === 0x003D) {
        attrnamebuf += '='; // not valid elsewhere in attribute_name_state!
      } else {
        attrnamebuf += getMatchingChars(ATTRNAME);
      }
      tokenizer = attribute_name_state;
      break;
    }
  }

  function attribute_name_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = after_attribute_name_state;
      break;
    case 0x002F: // SOLIDUS
      addAttribute(attrnamebuf);
      tokenizer = self_closing_start_tag_state;
      break;
    case 0x003D: // EQUALS SIGN
      beginAttrValue();
      tokenizer = before_attribute_value_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      addAttribute(attrnamebuf);
      tokenizer = data_state;
      emitTag();
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      attrnamebuf += String.fromCharCode(c + 0x0020);
      break;
    case 0x0000: // NULL
      attrnamebuf += String.fromCharCode(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    case 0x0022: // QUOTATION MARK
    case 0x0027: // APOSTROPHE
    case 0x003C: // LESS-THAN SIGN
      /* falls through */
    default:
      attrnamebuf += getMatchingChars(ATTRNAME);
      break;
    }
  }

  function after_attribute_name_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      /* Ignore the character. */
      break;
    case 0x002F: // SOLIDUS
      addAttribute(attrnamebuf);
      tokenizer = self_closing_start_tag_state;
      break;
    case 0x003D: // EQUALS SIGN
      beginAttrValue();
      tokenizer = before_attribute_value_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      addAttribute(attrnamebuf);
      emitTag();
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      addAttribute(attrnamebuf);
      beginAttrName();
      attrnamebuf += String.fromCharCode(c + 0x0020);
      tokenizer = attribute_name_state;
      break;
    case 0x0000: // NULL
      addAttribute(attrnamebuf);
      beginAttrName();
      attrnamebuf += String.fromCharCode(0xFFFD);
      tokenizer = attribute_name_state;
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    case 0x0022: // QUOTATION MARK
    case 0x0027: // APOSTROPHE
    case 0x003C: // LESS-THAN SIGN
      /* falls through */
    default:
      addAttribute(attrnamebuf);
      beginAttrName();
      attrnamebuf += getMatchingChars(ATTRNAME);
      tokenizer = attribute_name_state;
      break;
    }
  }

  function before_attribute_value_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      /* Ignore the character. */
      break;
    case 0x0022: // QUOTATION MARK
      tokenizer = attribute_value_double_quoted_state;
      break;
    case 0x0026: // AMPERSAND
      nextchar--; // pushback
      tokenizer = attribute_value_unquoted_state;
      break;
    case 0x0027: // APOSTROPHE
      tokenizer = attribute_value_single_quoted_state;
      break;
    case 0x0000: // NULL
      attrvaluebuf += String.fromCharCode(0xFFFD /* REPLACEMENT CHARACTER */);
      tokenizer = attribute_value_unquoted_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      addAttribute(attrnamebuf);
      emitTag();
      tokenizer = data_state;
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    case 0x003C: // LESS-THAN SIGN
    case 0x003D: // EQUALS SIGN
    case 0x0060: // GRAVE ACCENT
      /* falls through */
    default:
      attrvaluebuf += getMatchingChars(UNQUOTEDATTRVAL);
      tokenizer = attribute_value_unquoted_state;
      break;
    }
  }

  function attribute_value_double_quoted_state(c) {
    switch(c) {
    case 0x0022: // QUOTATION MARK
      addAttribute(attrnamebuf, attrvaluebuf);
      tokenizer = after_attribute_value_quoted_state;
      break;
    case 0x0026: // AMPERSAND
      pushState();
      tokenizer = character_reference_in_attribute_value_state;
      break;
    case 0x0000: // NULL
      attrvaluebuf += String.fromCharCode(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    case 0x000A: // LF
      // this could be a converted \r, so don't use getMatchingChars
      attrvaluebuf += String.fromCharCode(c);
      break;
    default:
      attrvaluebuf += getMatchingChars(DBLQUOTEATTRVAL);
      break;
    }
  }

  function attribute_value_single_quoted_state(c) {
    switch(c) {
    case 0x0027: // APOSTROPHE
      addAttribute(attrnamebuf, attrvaluebuf);
      tokenizer = after_attribute_value_quoted_state;
      break;
    case 0x0026: // AMPERSAND
      pushState();
      tokenizer = character_reference_in_attribute_value_state;
      break;
    case 0x0000: // NULL
      attrvaluebuf += String.fromCharCode(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    case 0x000A: // LF
      // this could be a converted \r, so don't use getMatchingChars
      attrvaluebuf += String.fromCharCode(c);
      break;
    default:
      attrvaluebuf += getMatchingChars(SINGLEQUOTEATTRVAL);
      break;
    }
  }

  function attribute_value_unquoted_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      addAttribute(attrnamebuf, attrvaluebuf);
      tokenizer = before_attribute_name_state;
      break;
    case 0x0026: // AMPERSAND
      pushState();
      tokenizer = character_reference_in_attribute_value_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      addAttribute(attrnamebuf, attrvaluebuf);
      tokenizer = data_state;
      emitTag();
      break;
    case 0x0000: // NULL
      attrvaluebuf += String.fromCharCode(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    case 0x0022: // QUOTATION MARK
    case 0x0027: // APOSTROPHE
    case 0x003C: // LESS-THAN SIGN
    case 0x003D: // EQUALS SIGN
    case 0x0060: // GRAVE ACCENT
      /* falls through */
    default:
      attrvaluebuf += getMatchingChars(UNQUOTEDATTRVAL);
      break;
    }
  }

  function character_reference_in_attribute_value_state(c, lookahead, eof) {
    var char = parseCharRef(lookahead, true);
    if (char !== null) {
      if (typeof char === "number")
        attrvaluebuf += String.fromCharCode(char);
      else {
        // An array of numbers
        attrvaluebuf += String.fromCharCode.apply(String, char);
      }
    }
    else {
      attrvaluebuf += '&'; // AMPERSAND;
    }

    popState();
  }
  character_reference_in_attribute_value_state.lookahead = ATTRCHARREF;

  function after_attribute_value_quoted_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = before_attribute_name_state;
      break;
    case 0x002F: // SOLIDUS
      tokenizer = self_closing_start_tag_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitTag();
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      nextchar--; // pushback
      tokenizer = before_attribute_name_state;
      break;
    }
  }

  function self_closing_start_tag_state(c) {
    switch(c) {
    case 0x003E: // GREATER-THAN SIGN
      // Set the <i>self-closing flag</i> of the current tag token.
      tokenizer = data_state;
      emitSelfClosingTag(true);
      break;
    case -1: // EOF
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      nextchar--; // pushback
      tokenizer = before_attribute_name_state;
      break;
    }
  }

  function bogus_comment_state(c, lookahead, eof) {
    var len = lookahead.length;

    if (eof) {
      nextchar += len-1; // don't consume the eof
    }
    else {
      nextchar += len;
    }

    var comment = lookahead.substring(0, len-1);

    comment = comment.replace(/\u0000/g,"\uFFFD");
    comment = comment.replace(/\u000D\u000A/g,"\u000A");
    comment = comment.replace(/\u000D/g,"\u000A");

    insertToken(COMMENT, comment);
    tokenizer = data_state;
  }
  bogus_comment_state.lookahead = ">";

  function markup_declaration_open_state(c, lookahead, eof) {
    if (lookahead[0] === "-" && lookahead[1] === "-") {
      nextchar += 2;
      beginComment();
      tokenizer = comment_start_state;
      return;
    }

    if (lookahead.toUpperCase() === "DOCTYPE") {
      nextchar += 7;
      tokenizer = doctype_state;
    }
    else if (lookahead === "[CDATA[" && cdataAllowed()) {
      nextchar += 7;
      tokenizer = cdata_section_state;
    }
    else {
      tokenizer = bogus_comment_state;
    }
  }
  markup_declaration_open_state.lookahead = 7;

  function comment_start_state(c) {
    beginComment();
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = comment_start_dash_state;
      break;
    case 0x0000: // NULL
      commentbuf.push(0xFFFD /* REPLACEMENT CHARACTER */);
      tokenizer = comment_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      insertToken(COMMENT, buf2str(commentbuf));
      break; /* see comment in comment end state */
    case -1: // EOF
      insertToken(COMMENT, buf2str(commentbuf));
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      commentbuf.push(c);
      tokenizer = comment_state;
      break;
    }
  }

  function comment_start_dash_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = comment_end_state;
      break;
    case 0x0000: // NULL
      commentbuf.push(0x002D /* HYPHEN-MINUS */);
      commentbuf.push(0xFFFD);
      tokenizer = comment_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      insertToken(COMMENT, buf2str(commentbuf));
      break;
    case -1: // EOF
      insertToken(COMMENT, buf2str(commentbuf));
      nextchar--; // pushback
      tokenizer = data_state;
      break; /* see comment in comment end state */
    default:
      commentbuf.push(0x002D /* HYPHEN-MINUS */);
      commentbuf.push(c);
      tokenizer = comment_state;
      break;
    }
  }

  function comment_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = comment_end_dash_state;
      break;
    case 0x0000: // NULL
      commentbuf.push(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case -1: // EOF
      insertToken(COMMENT, buf2str(commentbuf));
      nextchar--; // pushback
      tokenizer = data_state;
      break; /* see comment in comment end state */
    default:
      commentbuf.push(c);
      break;
    }
  }

  function comment_end_dash_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      tokenizer = comment_end_state;
      break;
    case 0x0000: // NULL
      commentbuf.push(0x002D /* HYPHEN-MINUS */);
      commentbuf.push(0xFFFD);
      tokenizer = comment_state;
      break;
    case -1: // EOF
      insertToken(COMMENT, buf2str(commentbuf));
      nextchar--; // pushback
      tokenizer = data_state;
      break; /* see comment in comment end state */
    default:
      commentbuf.push(0x002D /* HYPHEN-MINUS */);
      commentbuf.push(c);
      tokenizer = comment_state;
      break;
    }
  }

  function comment_end_state(c) {
    switch(c) {
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      insertToken(COMMENT, buf2str(commentbuf));
      break;
    case 0x0000: // NULL
      commentbuf.push(0x002D);
      commentbuf.push(0x002D);
      commentbuf.push(0xFFFD);
      tokenizer = comment_state;
      break;
    case 0x0021: // EXCLAMATION MARK
      tokenizer = comment_end_bang_state;
      break;
    case 0x002D: // HYPHEN-MINUS
      commentbuf.push(0x002D);
      break;
    case -1: // EOF
      insertToken(COMMENT, buf2str(commentbuf));
      nextchar--; // pushback
      tokenizer = data_state;
      break; /* For security reasons: otherwise, hostile user could put a script in a comment e.g. in a blog comment and then DOS the server so that the end tag isn't read, and then the commented script tag would be treated as live code */
    default:
      commentbuf.push(0x002D);
      commentbuf.push(0x002D);
      commentbuf.push(c);
      tokenizer = comment_state;
      break;
    }
  }

  function comment_end_bang_state(c) {
    switch(c) {
    case 0x002D: // HYPHEN-MINUS
      commentbuf.push(0x002D);
      commentbuf.push(0x002D);
      commentbuf.push(0x0021);
      tokenizer = comment_end_dash_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      insertToken(COMMENT, buf2str(commentbuf));
      break;
    case 0x0000: // NULL
      commentbuf.push(0x002D);
      commentbuf.push(0x002D);
      commentbuf.push(0x0021);
      commentbuf.push(0xFFFD);
      tokenizer = comment_state;
      break;
    case -1: // EOF
      insertToken(COMMENT, buf2str(commentbuf));
      nextchar--; // pushback
      tokenizer = data_state;
      break; /* see comment in comment end state */
    default:
      commentbuf.push(0x002D);
      commentbuf.push(0x002D);
      commentbuf.push(0x0021);
      commentbuf.push(c);
      tokenizer = comment_state;
      break;
    }
  }

  function doctype_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = before_doctype_name_state;
      break;
    case -1: // EOF
      beginDoctype();
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      nextchar--; // pushback
      tokenizer = before_doctype_name_state;
      break;
    }
  }

  function before_doctype_name_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      /* Ignore the character. */
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      beginDoctype();
      doctypenamebuf.push(c + 0x0020);
      tokenizer = doctype_name_state;
      break;
    case 0x0000: // NULL
      beginDoctype();
      doctypenamebuf.push(0xFFFD);
      tokenizer = doctype_name_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      beginDoctype();
      tokenizer = data_state;
      forcequirks();
      emitDoctype();
      break;
    case -1: // EOF
      beginDoctype();
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      beginDoctype();
      doctypenamebuf.push(c);
      tokenizer = doctype_name_state;
      break;
    }
  }

  function doctype_name_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = after_doctype_name_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitDoctype();
      break;
    case 0x0041:  // [A-Z]
    case 0x0042:case 0x0043:case 0x0044:case 0x0045:case 0x0046:
    case 0x0047:case 0x0048:case 0x0049:case 0x004A:case 0x004B:
    case 0x004C:case 0x004D:case 0x004E:case 0x004F:case 0x0050:
    case 0x0051:case 0x0052:case 0x0053:case 0x0054:case 0x0055:
    case 0x0056:case 0x0057:case 0x0058:case 0x0059:case 0x005A:
      doctypenamebuf.push(c + 0x0020);
      break;
    case 0x0000: // NULL
      doctypenamebuf.push(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      doctypenamebuf.push(c);
      break;
    }
  }

  function after_doctype_name_state(c, lookahead, eof) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      /* Ignore the character. */
      nextchar += 1;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      nextchar += 1;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      tokenizer = data_state;
      break;
    default:
      lookahead = lookahead.toUpperCase();
      if (lookahead === "PUBLIC") {
        nextchar += 6;
        tokenizer = after_doctype_public_keyword_state;
      }
      else if (lookahead === "SYSTEM") {
        nextchar += 6;
        tokenizer = after_doctype_system_keyword_state;
      }
      else {
        forcequirks();
        tokenizer = bogus_doctype_state;
      }
      break;
    }
  }
  after_doctype_name_state.lookahead = 6;

  function after_doctype_public_keyword_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = before_doctype_public_identifier_state;
      break;
    case 0x0022: // QUOTATION MARK
      beginDoctypePublicId();
      tokenizer = doctype_public_identifier_double_quoted_state;
      break;
    case 0x0027: // APOSTROPHE
      beginDoctypePublicId();
      tokenizer = doctype_public_identifier_single_quoted_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      forcequirks();
      tokenizer = bogus_doctype_state;
      break;
    }
  }

  function before_doctype_public_identifier_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      /* Ignore the character. */
      break;
    case 0x0022: // QUOTATION MARK
      beginDoctypePublicId();
      tokenizer = doctype_public_identifier_double_quoted_state;
      break;
    case 0x0027: // APOSTROPHE
      beginDoctypePublicId();
      tokenizer = doctype_public_identifier_single_quoted_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      forcequirks();
      tokenizer = bogus_doctype_state;
      break;
    }
  }

  function doctype_public_identifier_double_quoted_state(c) {
    switch(c) {
    case 0x0022: // QUOTATION MARK
      tokenizer = after_doctype_public_identifier_state;
      break;
    case 0x0000: // NULL
      doctypepublicbuf.push(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      doctypepublicbuf.push(c);
      break;
    }
  }

  function doctype_public_identifier_single_quoted_state(c) {
    switch(c) {
    case 0x0027: // APOSTROPHE
      tokenizer = after_doctype_public_identifier_state;
      break;
    case 0x0000: // NULL
      doctypepublicbuf.push(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      doctypepublicbuf.push(c);
      break;
    }
  }

  function after_doctype_public_identifier_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = between_doctype_public_and_system_identifiers_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitDoctype();
      break;
    case 0x0022: // QUOTATION MARK
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_double_quoted_state;
      break;
    case 0x0027: // APOSTROPHE
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_single_quoted_state;
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      forcequirks();
      tokenizer = bogus_doctype_state;
      break;
    }
  }

  function between_doctype_public_and_system_identifiers_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE Ignore the character.
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitDoctype();
      break;
    case 0x0022: // QUOTATION MARK
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_double_quoted_state;
      break;
    case 0x0027: // APOSTROPHE
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_single_quoted_state;
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      forcequirks();
      tokenizer = bogus_doctype_state;
      break;
    }
  }

  function after_doctype_system_keyword_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      tokenizer = before_doctype_system_identifier_state;
      break;
    case 0x0022: // QUOTATION MARK
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_double_quoted_state;
      break;
    case 0x0027: // APOSTROPHE
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_single_quoted_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      forcequirks();
      tokenizer = bogus_doctype_state;
      break;
    }
  }

  function before_doctype_system_identifier_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE Ignore the character.
      break;
    case 0x0022: // QUOTATION MARK
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_double_quoted_state;
      break;
    case 0x0027: // APOSTROPHE
      beginDoctypeSystemId();
      tokenizer = doctype_system_identifier_single_quoted_state;
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      forcequirks();
      tokenizer = bogus_doctype_state;
      break;
    }
  }

  function doctype_system_identifier_double_quoted_state(c) {
    switch(c) {
    case 0x0022: // QUOTATION MARK
      tokenizer = after_doctype_system_identifier_state;
      break;
    case 0x0000: // NULL
      doctypesystembuf.push(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      doctypesystembuf.push(c);
      break;
    }
  }

  function doctype_system_identifier_single_quoted_state(c) {
    switch(c) {
    case 0x0027: // APOSTROPHE
      tokenizer = after_doctype_system_identifier_state;
      break;
    case 0x0000: // NULL
      doctypesystembuf.push(0xFFFD /* REPLACEMENT CHARACTER */);
      break;
    case 0x003E: // GREATER-THAN SIGN
      forcequirks();
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      doctypesystembuf.push(c);
      break;
    }
  }

  function after_doctype_system_identifier_state(c) {
    switch(c) {
    case 0x0009: // CHARACTER TABULATION (tab)
    case 0x000A: // LINE FEED (LF)
    case 0x000C: // FORM FEED (FF)
    case 0x0020: // SPACE
      /* Ignore the character. */
      break;
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      forcequirks();
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      tokenizer = bogus_doctype_state;
      /* This does *not* set the DOCTYPE token's force-quirks flag. */
      break;
    }
  }

  function bogus_doctype_state(c) {
    switch(c) {
    case 0x003E: // GREATER-THAN SIGN
      tokenizer = data_state;
      emitDoctype();
      break;
    case -1: // EOF
      emitDoctype();
      nextchar--; // pushback
      tokenizer = data_state;
      break;
    default:
      /* Ignore the character. */
      break;
    }
  }

  function cdata_section_state(c, lookahead, eof) {
    var len = lookahead.length;
    var output;
    if (eof) {
      nextchar += len-1; // leave the EOF in the scanner
      output = lookahead.substring(0, len-1); // don't include the EOF
    }
    else {
      nextchar += len;
      output = lookahead.substring(0,len-3); // don't emit the ]]>
    }

    if (output.length > 0) {
      if (output.indexOf("\u0000") !== -1)
        textIncludesNUL = true;

      // XXX Have to deal with CR and CRLF here?
      if (output.indexOf("\r") !== -1) {
        output = output.replace(/\r\n/, "\n").replace(/\r/, "\n");
      }

      emitCharString(output);
    }

    tokenizer = data_state;
  }
  cdata_section_state.lookahead = "]]>";


  /***
   * The tree builder insertion modes
   */

  // 11.2.5.4.1 The "initial" insertion mode
  function initial_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      value = value.replace(LEADINGWS, ""); // Ignore spaces
      if (value.length === 0) return; // Are we done?
      break; // Handle anything non-space text below
    case 4: // COMMENT
      doc._appendChild(doc.createComment(value));
      return;
    case 5: // DOCTYPE
      var name = value;
      var publicid = arg3;
      var systemid = arg4;
      // Use the constructor directly instead of
      // implementation.createDocumentType because the create
      // function throws errors on invalid characters, and
      // we don't want the parser to throw them.
      doc.appendChild(new DocumentType(name,publicid, systemid));

      // Note that there is no public API for setting quirks mode We can
      // do this here because we have access to implementation details
      if (force_quirks ||
        name.toLowerCase() !== "html" ||
        quirkyPublicIds.test(publicid) ||
        (systemid && systemid.toLowerCase() === quirkySystemId) ||
        (systemid === undefined &&
         conditionallyQuirkyPublicIds.test(publicid)))
        doc._quirks = true;
      else if (limitedQuirkyPublicIds.test(publicid) ||
           (systemid !== undefined &&
            conditionallyQuirkyPublicIds.test(publicid)))
        doc._limitedQuirks = true;
      parser = before_html_mode;
      return;
    }

    // tags or non-whitespace text
    doc._quirks = true;
    parser = before_html_mode;
    parser(t,value,arg3,arg4);
  }

  // 11.2.5.4.2 The "before html" insertion mode
  function before_html_mode(t,value,arg3,arg4) {
    var elt;
    switch(t) {
    case 1: // TEXT
      value = value.replace(LEADINGWS, ""); // Ignore spaces
      if (value.length === 0) return; // Are we done?
      break; // Handle anything non-space text below
    case 5: // DOCTYPE
      /* ignore the token */
      return;
    case 4: // COMMENT
      doc._appendChild(doc.createComment(value));
      return;
    case 2: // TAG
      if (value === "html") {
        elt = createHTMLElt(value, arg3);
        stack.push(elt);
        doc.appendChild(elt);
        // XXX: handle application cache here
        parser = before_head_mode;
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "html":
      case "head":
      case "body":
      case "br":
        break;  // fall through on these
      default:
        return; // ignore most end tags
      }
    }

    // Anything that didn't get handled above is handled like this:
    elt = createHTMLElt("html", null);
    stack.push(elt);
    doc.appendChild(elt);
    // XXX: handle application cache here
    parser = before_head_mode;
    parser(t,value,arg3,arg4);
  }

  // 11.2.5.4.3 The "before head" insertion mode
  function before_head_mode(t,value,arg3,arg4) {
    switch(t) {
    case 1: // TEXT
      value = value.replace(LEADINGWS, "");  // Ignore spaces
      if (value.length === 0) return; // Are we done?
      break;  // Handle anything non-space text below
    case 5: // DOCTYPE
      /* ignore the token */
      return;
    case 4: // COMMENT
      insertComment(value);
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t,value,arg3,arg4);
        return;
      case "head":
        var elt = insertHTMLElement(value, arg3);
        head_element_pointer = elt;
        parser = in_head_mode;
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "html":
      case "head":
      case "body":
      case "br":
        break;
      default:
        return; // ignore most end tags
      }
    }

    // If not handled explicitly above
    before_head_mode(TAG, "head", null); // create a head tag
    parser(t, value, arg3, arg4); // then try again with this token
  }

  function in_head_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      var ws = value.match(LEADINGWS);
      if (ws) {
        insertText(ws[0]);
        value = value.substring(ws[0].length);
      }
      if (value.length === 0) return;
      break; // Handle non-whitespace below
    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "meta":
        // XXX:
        // May need to change the encoding based on this tag
        /* falls through */
      case "base":
      case "basefont":
      case "bgsound":
      case "command":
      case "link":
        insertHTMLElement(value, arg3);
        stack.pop();
        return;
      case "title":
        parseRCDATA(value, arg3);
        return;
      case "noscript":
        if (!scripting_enabled) {
          insertHTMLElement(value, arg3);
          parser = in_head_noscript_mode;
          return;
        }
        // Otherwise, if scripting is enabled...
        /* falls through */
      case "noframes":
      case "style":
        parseRawText(value,arg3);
        return;
      case "script":
        var elt = createHTMLElt(value, arg3);
        elt._parser_inserted = true;
        elt._force_async = false;
        if (fragment) elt._already_started = true;
        flushText();
        stack.top._appendChild(elt);
        stack.push(elt);
        tokenizer = script_data_state;
        originalInsertionMode = parser;
        parser = text_mode;
        return;
      case "head":
        return; // ignore it
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "head":
        stack.pop();
        parser = after_head_mode;
        return;
      case "body":
      case "html":
      case "br":
        break; // handle these at the bottom of the function
      default:
        // ignore any other end tag
        return;
      }
      break;
    }

    // If not handled above
    in_head_mode(ENDTAG, "head", null);   // synthetic </head>
    parser(t, value, arg3, arg4);   // Then redo this one
  }

  // 13.2.5.4.5 The "in head noscript" insertion mode
  function in_head_noscript_mode(t, value, arg3, arg4) {
    switch(t) {
    case 5: // DOCTYPE
      return;
    case 4: // COMMENT
      in_head_mode(t, value);
      return;
    case 1: // TEXT
      var ws = value.match(LEADINGWS);
      if (ws) {
        in_head_mode(t, ws[0]);
        value = value.substring(ws[0].length);
      }
      if (value.length === 0) return; // no more text
      break; // Handle non-whitespace below
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "basefont":
      case "bgsound":
      case "link":
      case "meta":
      case "noframes":
      case "style":
        in_head_mode(t, value, arg3);
        return;
      case "head":
      case "noscript":
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "noscript":
        stack.pop();
        parser = in_head_mode;
        return;
      case "br":
        break;  // goes to the outer default
      default:
        return; // ignore other end tags
      }
      break;
    }

    // If not handled above
    in_head_noscript_mode(ENDTAG, "noscript", null);
    parser(t, value, arg3, arg4);
  }

  function after_head_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      var ws = value.match(LEADINGWS);
      if (ws) {
        insertText(ws[0]);
        value = value.substring(ws[0].length);
      }
      if (value.length === 0) return;
      break; // Handle non-whitespace below
    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "body":
        insertHTMLElement(value, arg3);
        frameset_ok = false;
        parser = in_body_mode;
        return;
      case "frameset":
        insertHTMLElement(value, arg3);
        parser = in_frameset_mode;
        return;
      case "base":
      case "basefont":
      case "bgsound":
      case "link":
      case "meta":
      case "noframes":
      case "script":
      case "style":
      case "title":
        stack.push(head_element_pointer);
        in_head_mode(TAG, value, arg3);
        stack.removeElement(head_element_pointer);
        return;
      case "head":
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "body":
      case "html":
      case "br":
        break;
      default:
        return;  // ignore any other end tag
      }
      break;
    }

    after_head_mode(TAG, "body", null);
    frameset_ok = true;
    parser(t, value, arg3, arg4);
  }

  // 13.2.5.4.7 The "in body" insertion mode
  function in_body_mode(t,value,arg3,arg4) {
    var body, i, node;
    switch(t) {
    case 1: // TEXT
      if (textIncludesNUL) {
        value = value.replace(NULCHARS, "");
        if (value.length === 0) return;
      }
      // If any non-space characters
      if (frameset_ok && NONWS.test(value))
        frameset_ok = false;
      afereconstruct();
      insertText(value);
      return;
    case 5: // DOCTYPE
      return;
    case 4: // COMMENT
      insertComment(value);
      return;
    case -1: // EOF
      stopParsing();
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        transferAttributes(arg3, stack.elements[0]);
        return;
      case "base":
      case "basefont":
      case "bgsound":
      case "command":
      case "link":
      case "meta":
      case "noframes":
      case "script":
      case "style":
      case "title":
        in_head_mode(TAG, value, arg3);
        return;
      case "body":
        body = stack.elements[1];
        if (!body || !(body instanceof impl.HTMLBodyElement))
          return;
        frameset_ok = false;
        transferAttributes(arg3, body);
        return;
      case "frameset":
        if (!frameset_ok) return;
        body = stack.elements[1];
        if (!body || !(body instanceof impl.HTMLBodyElement))
          return;
        if (body.parentNode) body.parentNode.removeChild(body);
        while(!(stack.top instanceof impl.HTMLHtmlElement))
          stack.pop();
        insertHTMLElement(value, arg3);
        parser = in_frameset_mode;
        return;

      case "address":
      case "article":
      case "aside":
      case "blockquote":
      case "center":
      case "details":
      case "dir":
      case "div":
      case "dl":
      case "fieldset":
      case "figcaption":
      case "figure":
      case "footer":
      case "header":
      case "hgroup":
      case "menu":
      case "nav":
      case "ol":
      case "p":
      case "section":
      case "summary":
      case "ul":
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        insertHTMLElement(value, arg3);
        return;

      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        if (stack.top instanceof impl.HTMLHeadingElement)
          stack.pop();
        insertHTMLElement(value, arg3);
        return;

      case "pre":
      case "listing":
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        insertHTMLElement(value, arg3);
        ignore_linefeed = true;
        frameset_ok = false;
        return;

      case "form":
        if (form_element_pointer) return;
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        form_element_pointer = insertHTMLElement(value, arg3);
        return;

      case "li":
        frameset_ok = false;
        for(i = stack.elements.length-1; i >= 0; i--) {
          node = stack.elements[i];
          if (node instanceof impl.HTMLLIElement) {
            in_body_mode(ENDTAG, "li");
            break;
          }
          if (isA(node, specialSet) && !isA(node, addressdivpSet))
            break;
        }
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        insertHTMLElement(value, arg3);
        return;

      case "dd":
      case "dt":
        frameset_ok = false;
        for(i = stack.elements.length-1; i >= 0; i--) {
          node = stack.elements[i];
          if (isA(node, dddtSet)) {
            in_body_mode(ENDTAG, node.localName);
            break;
          }
          if (isA(node, specialSet) && !isA(node, addressdivpSet))
            break;
        }
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        insertHTMLElement(value, arg3);
        return;

      case "plaintext":
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        insertHTMLElement(value, arg3);
        tokenizer = plaintext_state;
        return;

      case "button":
        if (stack.inScope("button")) {
          in_body_mode(ENDTAG, "button");
          parser(t, value, arg3, arg4);
        }
        else {
          afereconstruct();
          insertHTMLElement(value, arg3);
          frameset_ok = false;
        }
        return;

      case "a":
        var activeElement = afe.findElementByTag("a");
        if (activeElement) {
          in_body_mode(ENDTAG, value);
          afe.remove(activeElement);
          stack.removeElement(activeElement);
        }
        /* falls through */

      case "b":
      case "big":
      case "code":
      case "em":
      case "font":
      case "i":
      case "s":
      case "small":
      case "strike":
      case "strong":
      case "tt":
      case "u":
        afereconstruct();
        afe.push(insertHTMLElement(value,arg3), arg3);
        return;

      case "nobr":
        afereconstruct();

        if (stack.inScope(value)) {
          in_body_mode(ENDTAG, value);
          afereconstruct();
        }
        afe.push(insertHTMLElement(value,arg3), arg3);
        return;

      case "applet":
      case "marquee":
      case "object":
        afereconstruct();
        insertHTMLElement(value,arg3);
        afe.insertMarker();
        frameset_ok = false;
        return;

      case "table":
        if (!doc._quirks && stack.inButtonScope("p")) {
          in_body_mode(ENDTAG, "p");
        }
        insertHTMLElement(value,arg3);
        frameset_ok = false;
        parser = in_table_mode;
        return;

      case "area":
      case "br":
      case "embed":
      case "img":
      case "keygen":
      case "wbr":
        afereconstruct();
        insertHTMLElement(value,arg3);
        stack.pop();
        frameset_ok = false;
        return;

      case "input":
        afereconstruct();
        var elt = insertHTMLElement(value,arg3);
        stack.pop();
        var type = elt.getAttribute("type");
        if (!type || type.toLowerCase() !== "hidden")
          frameset_ok = false;
        return;

      case "param":
      case "source":
      case "track":
        insertHTMLElement(value,arg3);
        stack.pop();
        return;

      case "hr":
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        insertHTMLElement(value,arg3);
        stack.pop();
        frameset_ok = false;
        return;

      case "image":
        in_body_mode(TAG, "img", arg3, arg4);
        return;

      case "isindex":
        if (form_element_pointer) return;
        (function handleIsIndexTag(attrs) {
          var prompt = null;
          var formattrs = [];
          var newattrs = [["name", "isindex"]];
          for(var i = 0; i < attrs.length; i++) {
            var a = attrs[i];
            if (a[0] === "action") {
              formattrs.push(a);
            }
            else if (a[0] === "prompt") {
              prompt = a[1];
            }
            else if (a[0] !== "name") {
              newattrs.push(a);
            }
          }

          // This default prompt presumably needs localization.
          // The space after the colon in this prompt is required
          // by the html5lib test cases
          if (!prompt)
            prompt = "This is a searchable index. " +
            "Enter search keywords: ";

          parser(TAG, "form", formattrs);
          parser(TAG, "hr", null);
          parser(TAG, "label", null);
          parser(TEXT, prompt);
          parser(TAG, "input", newattrs);
          parser(ENDTAG, "label");
          parser(TAG, "hr", null);
          parser(ENDTAG, "form");
        }(arg3));
        return;

      case "textarea":
        insertHTMLElement(value,arg3);
        ignore_linefeed = true;
        frameset_ok = false;
        tokenizer = rcdata_state;
        originalInsertionMode = parser;
        parser = text_mode;
        return;

      case "xmp":
        if (stack.inButtonScope("p")) in_body_mode(ENDTAG, "p");
        afereconstruct();
        frameset_ok = false;
        parseRawText(value, arg3);
        return;

      case "iframe":
        frameset_ok = false;
        parseRawText(value, arg3);
        return;

      case "noembed":
        parseRawText(value,arg3);
        return;

      case "noscript":
        if (scripting_enabled) {
          parseRawText(value,arg3);
          return;
        }
        break;  // XXX Otherwise treat it as any other open tag?

      case "select":
        afereconstruct();
        insertHTMLElement(value,arg3);
        frameset_ok = false;
        if (parser === in_table_mode ||
          parser === in_caption_mode ||
          parser === in_table_body_mode ||
          parser === in_row_mode ||
          parser === in_cell_mode)
          parser = in_select_in_table_mode;
        else
          parser = in_select_mode;
        return;

      case "optgroup":
      case "option":
        if (stack.top instanceof impl.HTMLOptionElement) {
          in_body_mode(ENDTAG, "option");
        }
        afereconstruct();
        insertHTMLElement(value,arg3);
        return;

      case "rp":
      case "rt":
        if (stack.inScope("ruby")) {
          stack.generateImpliedEndTags();
        }
        insertHTMLElement(value,arg3);
        return;

      case "math":
        afereconstruct();
        adjustMathMLAttributes(arg3);
        adjustForeignAttributes(arg3);
        insertForeignElement(value, arg3, NAMESPACE.MATHML);
        if (arg4) // self-closing flag
          stack.pop();
        return;

      case "svg":
        afereconstruct();
        adjustSVGAttributes(arg3);
        adjustForeignAttributes(arg3);
        insertForeignElement(value, arg3, NAMESPACE.SVG);
        if (arg4) // self-closing flag
          stack.pop();
        return;

      case "caption":
      case "col":
      case "colgroup":
      case "frame":
      case "head":
      case "tbody":
      case "td":
      case "tfoot":
      case "th":
      case "thead":
      case "tr":
        // Ignore table tags if we're not in_table mode
        return;
      }

      // Handle any other start tag here
      // (and also noscript tags when scripting is disabled)
      afereconstruct();
      insertHTMLElement(value,arg3);
      return;

    case 3: // ENDTAG
      switch(value) {
      case "body":
        if (!stack.inScope("body")) return;
        parser = after_body_mode;
        return;
      case "html":
        if (!stack.inScope("body")) return;
        parser = after_body_mode;
        parser(t, value, arg3);
        return;

      case "address":
      case "article":
      case "aside":
      case "blockquote":
      case "button":
      case "center":
      case "details":
      case "dir":
      case "div":
      case "dl":
      case "fieldset":
      case "figcaption":
      case "figure":
      case "footer":
      case "header":
      case "hgroup":
      case "listing":
      case "menu":
      case "nav":
      case "ol":
      case "pre":
      case "section":
      case "summary":
      case "ul":
        // Ignore if there is not a matching open tag
        if (!stack.inScope(value)) return;
        stack.generateImpliedEndTags();
        stack.popTag(value);
        return;

      case "form":
        var openform = form_element_pointer;
        form_element_pointer = null;
        if (!openform || !stack.elementInScope(openform)) return;
        stack.generateImpliedEndTags();
        stack.removeElement(openform);
        return;

      case "p":
        if (!stack.inButtonScope(value)) {
          in_body_mode(TAG, value, null);
          parser(t, value, arg3, arg4);
        }
        else {
          stack.generateImpliedEndTags(value);
          stack.popTag(value);
        }
        return;

      case "li":
        if (!stack.inListItemScope(value)) return;
        stack.generateImpliedEndTags(value);
        stack.popTag(value);
        return;

      case "dd":
      case "dt":
        if (!stack.inScope(value)) return;
        stack.generateImpliedEndTags(value);
        stack.popTag(value);
        return;

      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        if (!stack.elementTypeInScope(impl.HTMLHeadingElement)) return;
        stack.generateImpliedEndTags();
        stack.popElementType(impl.HTMLHeadingElement);
        return;

      case "a":
      case "b":
      case "big":
      case "code":
      case "em":
      case "font":
      case "i":
      case "nobr":
      case "s":
      case "small":
      case "strike":
      case "strong":
      case "tt":
      case "u":
        var result = adoptionAgency(value);
        if (result) return;  // If we did something we're done
        break;         // Go to the "any other end tag" case

      case "applet":
      case "marquee":
      case "object":
        if (!stack.inScope(value)) return;
        stack.generateImpliedEndTags();
        stack.popTag(value);
        afe.clearToMarker();
        return;

      case "br":
        in_body_mode(TAG, value, null);  // Turn </br> into <br>
        return;
      }

      // Any other end tag goes here
      for(i = stack.elements.length-1; i >= 0; i--) {
        node = stack.elements[i];
        if (node.localName === value) {
          stack.generateImpliedEndTags(value);
          stack.popElement(node);
          break;
        }
        else if (isA(node, specialSet)) {
          return;
        }
      }

      return;
    }
  }

  function text_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      insertText(value);
      return;
    case -1: // EOF
      if (stack.top instanceof impl.HTMLScriptElement)
        stack.top._already_started = true;
      stack.pop();
      parser = originalInsertionMode;
      parser(t);
      return;
    case 3: // ENDTAG
      if (value === "script") {
        handleScriptEnd();
      }
      else {
        stack.pop();
        parser = originalInsertionMode;
      }
      return;
    default:
      // We should never get any other token types
      return;
    }
  }

  function in_table_mode(t, value, arg3, arg4) {
    function getTypeAttr(attrs) {
      for(var i = 0, n = attrs.length; i < n; i++) {
        if (attrs[i][0] === "type")
          return attrs[i][1].toLowerCase();
      }
      return null;
    }

    switch(t) {
    case 1: // TEXT
      // XXX the text_integration_mode stuff is
      // just a hack I made up
      if (text_integration_mode) {
        in_body_mode(t, value, arg3, arg4);
      }
      else {
        pending_table_text = [];
        originalInsertionMode = parser;
        parser = in_table_text_mode;
        parser(t, value, arg3, arg4);
      }
      return;
    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      return;
    case 2: // TAG
      switch(value) {
      case "caption":
        stack.clearToContext(impl.HTMLTableElement);
        afe.insertMarker();
        insertHTMLElement(value,arg3);
        parser = in_caption_mode;
        return;
      case "colgroup":
        stack.clearToContext(impl.HTMLTableElement);
        insertHTMLElement(value,arg3);
        parser = in_column_group_mode;
        return;
      case "col":
        in_table_mode(TAG, "colgroup", null);
        parser(t, value, arg3, arg4);
        return;
      case "tbody":
      case "tfoot":
      case "thead":
        stack.clearToContext(impl.HTMLTableElement);
        insertHTMLElement(value,arg3);
        parser = in_table_body_mode;
        return;
      case "td":
      case "th":
      case "tr":
        in_table_mode(TAG, "tbody", null);
        parser(t, value, arg3, arg4);
        return;

      case "table":
        var repro = stack.inTableScope(value);
        in_table_mode(ENDTAG, value);
        if (repro) parser(t, value, arg3, arg4);
        return;

      case "style":
      case "script":
        in_head_mode(t, value, arg3, arg4);
        return;

      case "input":
        var type = getTypeAttr(arg3);
        if (type !== "hidden") break;  // to the anything else case
        insertHTMLElement(value,arg3);
        stack.pop();
        return;

      case "form":
        if (form_element_pointer) return;
        form_element_pointer = insertHTMLElement(value, arg3);
        stack.pop();
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "table":
        if (!stack.inTableScope(value)) return;
        stack.popTag(value);
        resetInsertionMode();
        return;
      case "body":
      case "caption":
      case "col":
      case "colgroup":
      case "html":
      case "tbody":
      case "td":
      case "tfoot":
      case "th":
      case "thead":
      case "tr":
        return;
      }

      break;
    case -1: // EOF
      stopParsing();
      return;
    }

    // This is the anything else case
    foster_parent_mode = true;
    in_body_mode(t, value, arg3, arg4);
    foster_parent_mode = false;
  }

  function in_table_text_mode(t, value, arg3, arg4) {
    if (t === TEXT) {
      if (textIncludesNUL) {
        value = value.replace(NULCHARS, "");
        if (value.length === 0) return;
      }
      pending_table_text.push(value);
    }
    else {
      var s = pending_table_text.join("");
      pending_table_text.length = 0;
      if (NONWS.test(s)) { // If any non-whitespace characters
        // This must be the same code as the "anything else"
        // case of the in_table mode above.
        foster_parent_mode = true;
        in_body_mode(TEXT, s);
        foster_parent_mode = false;
      }
      else {
        insertText(s);
      }
      parser = originalInsertionMode;
      parser(t, value, arg3, arg4);
    }
  }


  function in_caption_mode(t, value, arg3, arg4) {
    function end_caption() {
      if (!stack.inTableScope("caption")) return false;
      stack.generateImpliedEndTags();
      stack.popTag("caption");
      afe.clearToMarker();
      parser = in_table_mode;
      return true;
    }

    switch(t) {
    case 2: // TAG
      switch(value) {
      case "caption":
      case "col":
      case "colgroup":
      case "tbody":
      case "td":
      case "tfoot":
      case "th":
      case "thead":
      case "tr":
        if (end_caption()) parser(t, value, arg3, arg4);
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "caption":
        end_caption();
        return;
      case "table":
        if (end_caption()) parser(t, value, arg3, arg4);
        return;
      case "body":
      case "col":
      case "colgroup":
      case "html":
      case "tbody":
      case "td":
      case "tfoot":
      case "th":
      case "thead":
      case "tr":
        return;
      }
      break;
    }

    // The Anything Else case
    in_body_mode(t, value, arg3, arg4);
  }

  function in_column_group_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      var ws = value.match(LEADINGWS);
      if (ws) {
        insertText(ws[0]);
        value = value.substring(ws[0].length);
      }
      if (value.length === 0) return;
      break; // Handle non-whitespace below

    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "col":
        insertHTMLElement(value, arg3);
        stack.pop();
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "colgroup":
        if (stack.top instanceof impl.HTMLHtmlElement) return;
        stack.pop();
        parser = in_table_mode;
        return;
      case "col":
        return;
      }
      break;
    case -1: // EOF
      if (stack.top instanceof impl.HTMLHtmlElement) {
        stopParsing();
        return;
      }
      break;
    }

    // Anything else
    if (!(stack.top instanceof impl.HTMLHtmlElement)) {
      in_column_group_mode(ENDTAG, "colgroup");
      parser(t, value, arg3, arg4);
    }
  }

  function in_table_body_mode(t, value, arg3, arg4) {
    function endsect() {
      if (!stack.inTableScope("tbody") &&
        !stack.inTableScope("thead") &&
        !stack.inTableScope("tfoot"))
        return;
      stack.clearToContext(impl.HTMLTableSectionElement);
      in_table_body_mode(ENDTAG, stack.top.localName, null);
      parser(t, value, arg3, arg4);
    }

    switch(t) {
    case 2: // TAG
      switch(value) {
      case "tr":
        stack.clearToContext(impl.HTMLTableSectionElement);
        insertHTMLElement(value, arg3);
        parser = in_row_mode;
        return;
      case "th":
      case "td":
        in_table_body_mode(TAG, "tr", null);
        parser(t, value, arg3, arg4);
        return;
      case "caption":
      case "col":
      case "colgroup":
      case "tbody":
      case "tfoot":
      case "thead":
        endsect();
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "table":
        endsect();
        return;
      case "tbody":
      case "tfoot":
      case "thead":
        if (stack.inTableScope(value)) {
          stack.clearToContext(impl.HTMLTableSectionElement);
          stack.pop();
          parser = in_table_mode;
        }
        return;
      case "body":
      case "caption":
      case "col":
      case "colgroup":
      case "html":
      case "td":
      case "th":
      case "tr":
        return;
      }
      break;
    }

    // Anything else:
    in_table_mode(t, value, arg3, arg4);
  }

  function in_row_mode(t, value, arg3, arg4) {
    function endrow() {
      if (!stack.inTableScope("tr")) return false;
      stack.clearToContext(impl.HTMLTableRowElement);
      stack.pop();
      parser = in_table_body_mode;
      return true;
    }

    switch(t) {
    case 2: // TAG
      switch(value) {
      case "th":
      case "td":
        stack.clearToContext(impl.HTMLTableRowElement);
        insertHTMLElement(value, arg3);
        parser = in_cell_mode;
        afe.insertMarker();
        return;
      case "caption":
      case "col":
      case "colgroup":
      case "tbody":
      case "tfoot":
      case "thead":
      case "tr":
        if (endrow()) parser(t, value, arg3, arg4);
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "tr":
        endrow();
        return;
      case "table":
        if (endrow()) parser(t, value, arg3, arg4);
        return;
      case "tbody":
      case "tfoot":
      case "thead":
        if (stack.inTableScope(value)) {
          in_row_mode(ENDTAG, "tr");
          parser(t, value, arg3, arg4);
        }
        return;
      case "body":
      case "caption":
      case "col":
      case "colgroup":
      case "html":
      case "td":
      case "th":
        return;
      }
      break;
    }

    // anything else
    in_table_mode(t, value, arg3, arg4);
  }

  function in_cell_mode(t, value, arg3, arg4) {
    switch(t) {
    case 2: // TAG
      switch(value) {
      case "caption":
      case "col":
      case "colgroup":
      case "tbody":
      case "td":
      case "tfoot":
      case "th":
      case "thead":
      case "tr":
        if (stack.inTableScope("td")) {
          in_cell_mode(ENDTAG, "td");
          parser(t, value, arg3, arg4);
        }
        else if (stack.inTableScope("th")) {
          in_cell_mode(ENDTAG, "th");
          parser(t, value, arg3, arg4);
        }
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "td":
      case "th":
        if (!stack.inTableScope(value)) return;
        stack.generateImpliedEndTags();
        stack.popTag(value);
        afe.clearToMarker();
        parser = in_row_mode;
        return;

      case "body":
      case "caption":
      case "col":
      case "colgroup":
      case "html":
        return;

      case "table":
      case "tbody":
      case "tfoot":
      case "thead":
      case "tr":
        if (!stack.inTableScope(value)) return;
        in_cell_mode(ENDTAG, stack.inTableScope("td") ? "td" : "th");
        parser(t, value, arg3, arg4);
        return;
      }
      break;
    }

    // anything else
    in_body_mode(t, value, arg3, arg4);
  }

  function in_select_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      if (textIncludesNUL) {
        value = value.replace(NULCHARS, "");
        if (value.length === 0) return;
      }
      insertText(value);
      return;
    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      return;
    case -1: // EOF
      stopParsing();
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "option":
        if (stack.top instanceof impl.HTMLOptionElement)
          in_select_mode(ENDTAG, value);
        insertHTMLElement(value, arg3);
        return;
      case "optgroup":
        if (stack.top instanceof impl.HTMLOptionElement)
          in_select_mode(ENDTAG, "option");
        if (stack.top instanceof impl.HTMLOptGroupElement)
          in_select_mode(ENDTAG, value);
        insertHTMLElement(value, arg3);
        return;
      case "select":
        in_select_mode(ENDTAG, value); // treat it as a close tag
        return;

      case "input":
      case "keygen":
      case "textarea":
        if (!stack.inSelectScope("select")) return;
        in_select_mode(ENDTAG, "select");
        parser(t, value, arg3, arg4);
        return;

      case "script":
        in_head_mode(t, value, arg3, arg4);
        return;
      }
      break;
    case 3: // ENDTAG
      switch(value) {
      case "optgroup":
        if (stack.top instanceof impl.HTMLOptionElement &&
          stack.elements[stack.elements.length-2] instanceof
          impl.HTMLOptGroupElement) {
          in_select_mode(ENDTAG, "option");
        }
        if (stack.top instanceof impl.HTMLOptGroupElement)
          stack.pop();

        return;

      case "option":
        if (stack.top instanceof impl.HTMLOptionElement)
          stack.pop();
        return;

      case "select":
        if (!stack.inSelectScope(value)) return;
        stack.popTag(value);
        resetInsertionMode();
        return;
      }

      break;
    }

    // anything else: just ignore the token
  }

  function in_select_in_table_mode(t, value, arg3, arg4) {
    switch(value) {
    case "caption":
    case "table":
    case "tbody":
    case "tfoot":
    case "thead":
    case "tr":
    case "td":
    case "th":
      switch(t) {
      case 2: // TAG
        in_select_in_table_mode(ENDTAG, "select");
        parser(t, value, arg3, arg4);
        return;
      case 3: // ENDTAG
        if (stack.inTableScope(value)) {
          in_select_in_table_mode(ENDTAG, "select");
          parser(t, value, arg3, arg4);
        }
        return;
      }
    }

    // anything else
    in_select_mode(t, value, arg3, arg4);
  }

  function after_body_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      // If any non-space chars, handle below
      if (NONWS.test(value)) break;
      in_body_mode(t, value);
      return;
    case 4: // COMMENT
      // Append it to the <html> element
      stack.elements[0]._appendChild(doc.createComment(value));
      return;
    case 5: // DOCTYPE
      return;
    case -1: // EOF
      stopParsing();
      return;
    case 2: // TAG
      if (value === "html") {
        in_body_mode(t, value, arg3, arg4);
        return;
      }
      break; // for any other tags
    case 3: // ENDTAG
      if (value === "html") {
        if (fragment) return;
        parser = after_after_body_mode;
        return;
      }
      break; // for any other tags
    }

    // anything else
    parser = in_body_mode;
    parser(t, value, arg3, arg4);
  }

  function in_frameset_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      // Ignore any non-space characters
      value = value.replace(ALLNONWS, "");
      if (value.length > 0) insertText(value);
      return;
    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      return;
    case -1: // EOF
      stopParsing();
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "frameset":
        insertHTMLElement(value, arg3);
        return;
      case "frame":
        insertHTMLElement(value, arg3);
        stack.pop();
        return;
      case "noframes":
        in_head_mode(t, value, arg3, arg4);
        return;
      }
      break;
    case 3: // ENDTAG
      if (value === "frameset") {
        if (fragment && stack.top instanceof impl.HTMLHtmlElement)
          return;
        stack.pop();
        if (!fragment &&
          !(stack.top instanceof impl.HTMLFrameSetElement))
          parser = after_frameset_mode;
        return;
      }
      break;
    }

    // ignore anything else
  }

  function after_frameset_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      // Ignore any non-space characters
      value = value.replace(ALLNONWS, "");
      if (value.length > 0) insertText(value);
      return;
    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      return;
    case -1: // EOF
      stopParsing();
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "noframes":
        in_head_mode(t, value, arg3, arg4);
        return;
      }
      break;
    case 3: // ENDTAG
      if (value === "html") {
        parser = after_after_frameset_mode;
        return;
      }
      break;
    }

    // ignore anything else
  }

  function after_after_body_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      // If any non-space chars, handle below
      if (NONWS.test(value)) break;
      in_body_mode(t, value, arg3, arg4);
      return;
    case 4: // COMMENT
      doc._appendChild(doc.createComment(value));
      return;
    case 5: // DOCTYPE
      in_body_mode(t, value, arg3, arg4);
      return;
    case -1: // EOF
      stopParsing();
      return;
    case 2: // TAG
      if (value === "html") {
        in_body_mode(t, value, arg3, arg4);
        return;
      }
      break;
    }

    // anything else
    parser = in_body_mode;
    parser(t, value, arg3, arg4);
  }

  function after_after_frameset_mode(t, value, arg3, arg4) {
    switch(t) {
    case 1: // TEXT
      // Ignore any non-space characters
      value = value.replace(ALLNONWS, "");
      if (value.length > 0)
        in_body_mode(t, value, arg3, arg4);
      return;
    case 4: // COMMENT
      doc._appendChild(doc.createComment(value));
      return;
    case 5: // DOCTYPE
      in_body_mode(t, value, arg3, arg4);
      return;
    case -1: // EOF
      stopParsing();
      return;
    case 2: // TAG
      switch(value) {
      case "html":
        in_body_mode(t, value, arg3, arg4);
        return;
      case "noframes":
        in_head_mode(t, value, arg3, arg4);
        return;
      }
      break;
    }

    // ignore anything else
  }


  // 13.2.5.5 The rules for parsing tokens in foreign content
  //
  // This is like one of the insertion modes above, but is
  // invoked somewhat differently when the current token is not HTML.
  // See the insertToken() function.
  function insertForeignToken(t, value, arg3, arg4) {
    // A <font> tag is an HTML font tag if it has a color, font, or size
    // attribute.  Otherwise we assume it is foreign content
    function isHTMLFont(attrs) {
      for(var i = 0, n = attrs.length; i < n; i++) {
        switch(attrs[i][0]) {
        case "color":
        case "font":
        case "size":
          return true;
        }
      }
      return false;
    }

    var current;

    switch(t) {
    case 1: // TEXT
      // If any non-space, non-nul characters
      if (frameset_ok && NONWSNONNUL.test(value))
        frameset_ok = false;
      if (textIncludesNUL) {
        value = value.replace(NULCHARS, "\uFFFD");
      }
      insertText(value);
      return;
    case 4: // COMMENT
      insertComment(value);
      return;
    case 5: // DOCTYPE
      // ignore it
      return;
    case 2: // TAG
      switch(value) {
      case "font":
        if (!isHTMLFont(arg3)) break;
        /* falls through */
      case "b":
      case "big":
      case "blockquote":
      case "body":
      case "br":
      case "center":
      case "code":
      case "dd":
      case "div":
      case "dl":
      case "dt":
      case "em":
      case "embed":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
      case "head":
      case "hr":
      case "i":
      case "img":
      case "li":
      case "listing":
      case "menu":
      case "meta":
      case "nobr":
      case "ol":
      case "p":
      case "pre":
      case "ruby":
      case "s":
      case "small":
      case "span":
      case "strong":
      case "strike":
      case "sub":
      case "sup":
      case "table":
      case "tt":
      case "u":
      case "ul":
      case "var":
        do {
          stack.pop();
          current = stack.top;
        } while(current.namespaceURI !== NAMESPACE.HTML &&
            !isMathmlTextIntegrationPoint(current) &&
            !isHTMLIntegrationPoint(current));

        insertToken(t, value, arg3, arg4);  // reprocess
        return;
      }

      // Any other start tag case goes here
      current = stack.top;
      if (current.namespaceURI === NAMESPACE.MATHML) {
        adjustMathMLAttributes(arg3);
      }
      else if (current.namespaceURI === NAMESPACE.SVG) {
        value = adjustSVGTagName(value);
        adjustSVGAttributes(arg3);
      }
      adjustForeignAttributes(arg3);

      insertForeignElement(value, arg3, current.namespaceURI);
      if (arg4) // the self-closing flag
        stack.pop();
      return;

    case 3: // ENDTAG
      current = stack.top;
      if (value === "script" &&
        current.namespaceURI === NAMESPACE.SVG &&
        current.localName === "script") {

        stack.pop();

        // XXX
        // Deal with SVG scripts here
      }
      else {
        // The any other end tag case
        var i = stack.elements.length-1;
        var node = stack.elements[i];
        for(;;) {
          if (node.localName.toLowerCase() === value) {
            stack.popElement(node);
            break;
          }
          node = stack.elements[--i];
          // If non-html, keep looping
          if (node.namespaceURI !== NAMESPACE.HTML)
            continue;
          // Otherwise process the end tag as html
          parser(t, value, arg3, arg4);
          break;
        }
      }
      return;
    }
  }


  /***
   * parsing code for character references
   */

  // Parse a character reference from s and return a codepoint or an
  // array of codepoints or null if there is no valid char ref in s.
  function parseCharRef(s, isattr) {
    var len = s.length;
    var rv;
    if (len === 0) return null; // No character reference matched

    if (s[0] === "#") {         // Numeric character reference
      var codepoint;

      if (s[1] === "x" || s[1] === "X") {
        // Hex
        codepoint = parseInt(s.substring(2), 16);
      }
      else {
        // Decimal
        codepoint = parseInt(s.substring(1), 10);
      }

      if (s[len-1] === ";") // If the string ends with a semicolon
        nextchar += len;    // Consume all the chars
      else
        nextchar += len-1;  // Otherwise, all but the last character

      if (codepoint in numericCharRefReplacements) {
        codepoint = numericCharRefReplacements[codepoint];
      }
      else if (codepoint > 0x10FFFF || (codepoint >= 0xD800 && codepoint < 0xE000)) {
        codepoint = 0xFFFD;
      }

      if (codepoint <= 0xFFFF) return codepoint;

      codepoint = codepoint - 0x10000;
      return [0xD800 + (codepoint >> 10),
          0xDC00 + (codepoint & 0x03FF)];
    }
    else {
      // Named character reference
      // We have to be able to parse some named char refs even when
      // the semicolon is omitted, but have to match the longest one
      // possible.  So if the lookahead doesn't end with semicolon
      // then we have to loop backward looking for longest to shortest
      // matches.  Fortunately, the names that don't require semis
      // are all between 2 and 6 characters long.

      if (s[len-1] === ";") {
        rv = namedCharRefs[s];
        if (rv !== undefined) {
          nextchar += len;  // consume all the characters
          return rv;
        }
      }

      // If it didn't end with a semicolon, see if we can match
      // everything but the terminating character
      len--; // Ignore whatever the terminating character is
      rv = namedCharRefsNoSemi[s.substring(0, len)];
      if (rv !== undefined) {
        nextchar += len;
        return rv;
      }

      // If it still didn't match, and we're not parsing a
      // character reference in an attribute value, then try
      // matching shorter substrings.
      if (!isattr) {
        len--;
        if (len > 6) len = 6; // Maximum possible match length
        while(len >= 2) {
          rv = namedCharRefsNoSemi[s.substring(0, len)];
          if (rv !== undefined) {
            nextchar += len;
            return rv;
          }
          len--;
        }
      }

      // Couldn't find any match
      return null;
    }
  }


  /***
   * Finally, this is the end of the HTMLParser() factory function.
   * It returns the htmlparser object with the append() and end() methods.
   */

  // Sneak another method into the htmlparser object to allow us to run
  // tokenizer tests.  This can be commented out in production code.
  // This is a hook for testing the tokenizer. It has to be here
  // because the tokenizer details are all hidden away within the closure.
  // It should return an array of tokens generated while parsing the
  // input string.
  htmlparser.testTokenizer = function(input, initialState, lastStartTag, charbychar) {
    var tokens = [];

    switch(initialState) {
    case "PCDATA state":
      tokenizer = data_state;
      break;
    case "RCDATA state":
      tokenizer = rcdata_state;
      break;
    case "RAWTEXT state":
      tokenizer = rawtext_state;
      break;
    case "PLAINTEXT state":
      tokenizer = plaintext_state;
      break;
    }

    if (lastStartTag) {
      lasttagname = lastStartTag;
    }

    insertToken = function(t, value, arg3, arg4) {
      flushText();
      switch(t) {
      case 1: // TEXT
        if (tokens.length > 0 &&
          tokens[tokens.length-1][0] === "Character") {
          tokens[tokens.length-1][1] += value;
        }
        else push(tokens, ["Character", value]);
        break;
      case 4: // COMMENT
        push(tokens,["Comment", value]);
        break;
      case 5: // DOCTYPE
        push(tokens,["DOCTYPE", value,
               arg3 === undefined ? null : arg3,
               arg4 === undefined ? null : arg4,
               !force_quirks]);
        break;
      case 2: // TAG
        var attrs = {};
        for(var i = 0; i < arg3.length; i++) {
          // XXX: does attribute order matter?
          var a = arg3[i];
          if (a.length === 1) {
            attrs[a[0]] = "";
          }
          else {
            attrs[a[0]] = a[1];
          }
        }
        var token = ["StartTag", value, attrs];
        if (arg4) token.push(true);
        tokens.push(token);
        break;
      case 3: // ENDTAG
        tokens.push(["EndTag", value]);
        break;
      case -1: // EOF
        break;
      }
    };

    if (!charbychar) {
      this.parse(input, true);
    }
    else {
      for(var i = 0; i < input.length; i++) {
        this.parse(input[i]);
      }
      this.parse("", true);
    }
    return tokens;
  };

  // Return the parser object from the HTMLParser() factory function
  return htmlparser;
}
