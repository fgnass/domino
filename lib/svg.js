"use strict";
var Element = require('./Element');
var defineElement = require('./defineElement');
var utils = require('./utils');
var CSSStyleDeclaration = require('./CSSStyleDeclaration');

var svgElements = exports.elements = {};
var svgNameToImpl = Object.create(null);

exports.createElement = function(doc, localName, prefix) {
  var impl = svgNameToImpl[localName] || SVGElement;
  return new impl(doc, localName, prefix);
};

function define(spec) {
  return defineElement(spec, SVGElement, svgElements, svgNameToImpl);
}

var SVGElement = define({
  superclass: Element,
  ctor: function SVGElement(doc, localName, prefix) {
    Element.call(this, doc, localName, utils.NAMESPACE.SVG, prefix);
  },
  props: {
    style: { get: function() {
      if (!this._style)
        this._style = new CSSStyleDeclaration(this);
      return this._style;
    }}
  }
});

define({
  ctor: function SVGSVGElement(doc, localName, prefix) {
    SVGElement.call(this, doc, localName, prefix);
  },
  tag: 'svg',
  props: {
    createSVGRect: { value: function () {
      return new SVGElement(this.ownerDocument, 'rect', this.prefix);
    } }
  }
});
