module.exports = Leaf;

var HierarchyRequestError = require('./utils').HierarchyRequestError;
var Node = require('./Node');
var NodeList = require('./NodeList');

// This class defines common functionality for node subtypes that
// can never have children
function Leaf() {
}

Leaf.prototype = Object.create(Node.prototype, {
  hasChildNodes: { value: function() { return false; }},
  firstChild: { value: null },
  lastChild: { value: null },
  insertBefore: { value: HierarchyRequestError },
  replaceChild: { value: HierarchyRequestError },
  removeChild: { value: HierarchyRequestError },
  appendChild: { value: HierarchyRequestError },
  childNodes: { get: function() {
    if (!this._childNodes) this._childNodes = [];
    return this._childNodes;
  }}
});
