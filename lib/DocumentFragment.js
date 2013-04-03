module.exports =  DocumentFragment;

var Node = require('./Node');
var NodeList = require('./NodeList');
var Element = require('./Element');
var select = require('./select');

function DocumentFragment(doc) {
  this.nodeType = Node.DOCUMENT_FRAGMENT_NODE;
  this.ownerDocument = doc;
  this.childNodes = [];
}

DocumentFragment.prototype = Object.create(Node.prototype, {
  nodeName: { value: '#document-fragment' },
  nodeValue: { 
    get: function() { 
      return null;
    },
    set: function() {}
  },
  // Copy the text content getter/setter from Element
  textContent: Object.getOwnPropertyDescriptor(Element.prototype, 'textContent'),

  querySelector: { value: function(selector) {
    // implement in terms of querySelectorAll
    var nodes = this.querySelectorAll(selector);
    return nodes.length ? nodes[0] : null;
  }},
  querySelectorAll: { value: function(selector) {
    // create a context
    var context = Object.create(this);
    // add some methods to the context for zest implementation, without
    // adding them to the public DocumentFragment API
    context.isHTML = true; // in HTML namespace (case-insensitive match)
    context.getElementsByTagName = Element.prototype.getElementsByTagName;
    context.nextElement =
      Object.getOwnPropertyDescriptor(Element.prototype, 'firstElementChild').
      get;
    // invoke zest
    var nodes = select(selector, context);
    return nodes.item ? nodes : new NodeList(nodes);
  }},

  // Utility methods
  clone: { value: function clone() {
      return new DocumentFragment(this.ownerDocument);
  }},
  isEqual: { value: function isEqual(n) {
      // Any two document fragments are shallowly equal.
      // Node.isEqualNode() will test their children for equality
      return true;
  }},

});
