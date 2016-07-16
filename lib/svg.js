"use strict";
var Element = require('./Element');
var attributes = require('./attributes');
var CSSStyleDeclaration = require('./CSSStyleDeclaration');

var impl = exports.elements = {};
var tagNameToImpl = Object.create(null);

exports.createElement = function(doc, localName, namespaceURI, prefix) {
  var elementImpl = tagNameToImpl[localName] || SVGElement;
  return new elementImpl(doc, localName, namespaceURI, prefix);
};

function define(spec) {
  var c = spec.ctor;
  if (c) {
    var props = spec.props || {};
    if (spec.attributes) {
      for (var n in spec.attributes) {
        var attr = spec.attributes[n];
        if (typeof attr !== 'object' || Array.isArray(attr)) attr = {type: attr};
        if (!attr.name) attr.name = n.toLowerCase();
        props[n] = attributes.property(attr);
      }
    }
    props.constructor = { value : c };
    c.prototype = Object.create((spec.superclass || SVGElement).prototype, props);
    impl[c.name] = c;
  }
  else {
    c = SVGElement;
  }
  (spec.tags || spec.tag && [spec.tag] || []).forEach(function(tag) {
    tagNameToImpl[tag] = c;
  });
  return c;
}

var SVGElement = exports.SVGElement = define({
  superclass: Element,
  ctor: function SVGElement(doc, localName, namespaceURI, prefix) {
    Element.call(this, doc, localName, namespaceURI, prefix);
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
  ctor: function SVGSVGElement(doc, localName, namespaceURI, prefix) {
    SVGElement.call(this, doc, localName, namespaceURI, prefix);
  },
  tag: 'svg',
  props: {
    createSVGRect: { value: function () {
      return new SVGElement(this.ownerDocument, 'rect', this.namespaceURI, this.prefix);
    } }
  }
});
