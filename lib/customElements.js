"use strict";
module.exports.preventNotify = false;

module.exports.notifyCustomElementsSetAttrCallback = function(node, name, oldValue, newValue, ns) {
  if (node.constructor.observedAttributes && node.constructor.observedAttributes.indexOf(name) > -1) {
    if (node.attributeChangedCallback) {
      if (oldValue === undefined) oldValue = null;
      if (newValue === undefined) newValue = null;
      node.attributeChangedCallback(name, oldValue, newValue, ns || null);
    }
  }
};

module.exports.notifyCloned = function(n) {
  //nyi();
};

module.exports.notifyRooted = function(n) {
  if (!exports.preventNotify) {
    // CEv1
    if (n.adoptedCallback && n._lastDocument && (n._lastDocument !== n.ownerDocument)) {
      n.adoptedCallback(n._lastDocument, n.ownerDocument);
      delete n._lastDocument;
    }
    // CEv1
    if (n.connectedCallback) {
      n.connectedCallback();
    }
  }
};

module.exports.notifyUpRooted = function(n) {
  if (!exports.preventNotify) {
    // CEv1
    if (n.adoptedCallback) {
      n._lastDocument = n.ownerDocument;
    }
    // CEv1
    if (n.disconnectedCallback) {
      n.disconnectedCallback();
    }
  }
};

