module.exports =  DocumentFragment;

var Node = require('./Node');
var Element = require('./Element');

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
