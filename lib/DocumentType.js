module.exports = DocumentType;

var Node = require('./Node');
var Leaf = require('./Leaf');
var utils = require('./utils');

function DocumentType(name, publicId, systemId) {
  // Unlike other nodes, doctype nodes always start off unowned
  // until inserted
  this.nodeType = Node.DOCUMENT_TYPE_NODE;
  this.ownerDocument = null;
  this.name = name;
  this.publicId = publicId || "";
  this.systemId = systemId || "";
}

DocumentType.prototype = Object.create(Leaf.prototype, {
  nodeName: { get: function() { return this.name; }},
  nodeValue: {
    get: function() { return null; },
    set: function() {}
  },

  // Utility methods
  clone: { value: function clone() {
    utils.DataCloneError();
  }},

  isEqual: { value: function isEqual(n) {
    return this.name === n.name &&
      this.publicId === n.publicId &&
      this.systemId === n.systemId;
  }}
});
