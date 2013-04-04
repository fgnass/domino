module.exports = Node;

var EventTarget = require('./EventTarget');
var utils = require('./utils');
var NAMESPACE = utils.NAMESPACE;

// All nodes have a nodeType and an ownerDocument.
// Once inserted, they also have a parentNode.
// This is an abstract class; all nodes in a document are instances
// of a subtype, so all the properties are defined by more specific
// constructors.
function Node() {
}

var ELEMENT_NODE                = Node.ELEMENT_NODE = 1;
var ATTRIBUTE_NODE              = Node.ATTRIBUTE_NODE = 2;
var TEXT_NODE                   = Node.TEXT_NODE = 3;
var CDATA_SECTION_NODE          = Node.CDATA_SECTION_NODE = 4;
var ENTITY_REFERENCE_NODE       = Node.ENTITY_REFERENCE_NODE = 5;
var ENTITY_NODE                 = Node.ENTITY_NODE = 6;
var PROCESSING_INSTRUCTION_NODE = Node.PROCESSING_INSTRUCTION_NODE = 7;
var COMMENT_NODE                = Node.COMMENT_NODE = 8;
var DOCUMENT_NODE               = Node.DOCUMENT_NODE = 9;
var DOCUMENT_TYPE_NODE          = Node.DOCUMENT_TYPE_NODE = 10;
var DOCUMENT_FRAGMENT_NODE      = Node.DOCUMENT_FRAGMENT_NODE = 11;
var NOTATION_NODE               = Node.NOTATION_NODE = 12;

var DOCUMENT_POSITION_DISCONNECTED            = Node.DOCUMENT_POSITION_DISCONNECTED = 0x01;
var DOCUMENT_POSITION_PRECEDING               = Node.DOCUMENT_POSITION_PRECEDING = 0x02;
var DOCUMENT_POSITION_FOLLOWING               = Node.DOCUMENT_POSITION_FOLLOWING = 0x04;
var DOCUMENT_POSITION_CONTAINS                = Node.DOCUMENT_POSITION_CONTAINS = 0x08;
var DOCUMENT_POSITION_CONTAINED_BY            = Node.DOCUMENT_POSITION_CONTAINED_BY = 0x10;
var DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 0x20;

var hasRawContent = {
  STYLE: true,
  SCRIPT: true,
  XMP: true,
  IFRAME: true,
  NOEMBED: true,
  NOFRAMES: true,
  PLAINTEXT: true,
  NOSCRIPT: true
};

var emptyElements = {
  area: true,
  base: true,
  basefont: true,
  bgsound: true,
  br: true,
  col: true,
  command: true,
  embed: true,
  frame: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true
};

var extraNewLine = {
  pre: true,
  textarea: true,
  listing: true
};

Node.prototype = Object.create(EventTarget.prototype, {

  // Node that are not inserted into the tree inherit a null parent
  parentNode: { value: null, writable: true },

  // XXX: the baseURI attribute is defined by dom core, but
  // a correct implementation of it requires HTML features, so
  // we'll come back to this later.
  baseURI: { get: utils.nyi },

  parentElement: { get: function() {
    return (this.parentNode && this.parentNode.nodeType===ELEMENT_NODE) ? this.parentNode : null;
  }},

  hasChildNodes: { value: function() {  // Overridden in leaf.js
    return this.childNodes.length > 0;
  }},

  firstChild: { get: function() {
    return this.childNodes.length === 0 ? null : this.childNodes[0];
  }},

  lastChild: { get: function() {
    return this.childNodes.length === 0 ? null : this.childNodes[this.childNodes.length-1];
  }},

  previousSibling: { get: function() {
    if (!this.parentNode) return null;
    var sibs = this.parentNode.childNodes, i = this.index;
    return i === 0 ? null : sibs[i-1];
  }},

  nextSibling: { get: function() {
    if (!this.parentNode) return null;
    var sibs = this.parentNode.childNodes, i = this.index;
    return i+1 === sibs.length ? null : sibs[i+1];
  }},

  insertBefore: { value: function insertBefore(child, refChild) {
    var parent = this;
    if (refChild === null) return this.appendChild(child);
    if (refChild.parentNode !== parent) utils.NotFoundError();
    if (child.isAncestor(parent)) utils.HierarchyRequestError();
    if (child.nodeType === DOCUMENT_NODE) utils.HierarchyRequestError();
    parent.ensureSameDoc(child);
    child.insert(parent, refChild.index);
    return child;
  }},


  appendChild: { value: function(child) {
    var parent = this;
    if (child.isAncestor(parent)) {
      utils.HierarchyRequestError();
    }
    if (child.nodeType === DOCUMENT_NODE) utils.HierarchyRequestError();
    parent.ensureSameDoc(child);
    return parent._appendChild(child);
  }},

  _appendChild: { value: function(child) {
    child.insert(this, this.childNodes.length);
    return child;
  }},

  removeChild: { value: function removeChild(child) {
    var parent = this;
    if (child.parentNode !== parent) utils.NotFoundError();
    child.remove();
    return child;
  }},

  replaceChild: { value: function replaceChild(newChild, oldChild) {
    var parent = this;
    if (oldChild.parentNode !== parent) utils.NotFoundError();
    if (newChild.isAncestor(parent)) utils.HierarchyRequestError();
    parent.ensureSameDoc(newChild);

    var refChild = oldChild.nextSibling;
    oldChild.remove();
    parent.insertBefore(newChild, refChild);
    return oldChild;
  }},

  compareDocumentPosition: { value: function compareDocumentPosition(that){
    // Basic algorithm for finding the relative position of two nodes.
    // Make a list the ancestors of each node, starting with the
    // document element and proceeding down to the nodes themselves.
    // Then, loop through the lists, looking for the first element
    // that differs.  The order of those two elements give the
    // order of their descendant nodes.  Or, if one list is a prefix
    // of the other one, then that node contains the other.

    if (this === that) return 0;

    // If they're not owned by the same document or if one is rooted
    // and one is not, then they're disconnected.
    if (this.doc != that.doc ||
      this.rooted !== that.rooted)
      return (DOCUMENT_POSITION_DISCONNECTED +
          DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC);

    // Get arrays of ancestors for this and that
    var these = [], those = [];
    for(var n = this; n !== null; n = n.parentNode) these.push(n);
    for(n = that; n !== null; n = n.parentNode) those.push(n);
    these.reverse();  // So we start with the outermost
    those.reverse();

    if (these[0] !== those[0]) // No common ancestor
      return (DOCUMENT_POSITION_DISCONNECTED +
          DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC);

    n = Math.min(these.length, those.length);
    for(var i = 1; i < n; i++) {
      if (these[i] !== those[i]) {
        // We found two different ancestors, so compare
        // their positions
        if (these[i].index < those[i].index)
          return DOCUMENT_POSITION_FOLLOWING;
        else
          return DOCUMENT_POSITION_PRECEDING;
      }
    }

    // If we get to here, then one of the nodes (the one with the
    // shorter list of ancestors) contains the other one.
    if (these.length < those.length)
      return (DOCUMENT_POSITION_FOLLOWING +
          DOCUMENT_POSITION_CONTAINED_BY);
    else
      return (DOCUMENT_POSITION_PRECEDING +
          DOCUMENT_POSITION_CONTAINS);
  }},

  isSameNode: {value : function isSameNode(node) {
    return this === node;
  }},


  // This method implements the generic parts of node equality testing
  // and defers to the (non-recursive) type-specific isEqual() method
  // defined by subclasses
  isEqualNode: { value: function isEqualNode(node) {
    if (!node) return false;
    if (node.nodeType !== this.nodeType) return false;

    // Check for same number of children
    // Check for children this way because it is more efficient
    // for childless leaf nodes.
    var n; // number of child nodes
    if (!this.firstChild) {
      n = 0;
      if (node.firstChild) return false;
    }
    else {
      n = this.childNodes.length;
      if (node.childNodes.length != n) return false;
    }

    // Check type-specific properties for equality
    if (!this.isEqual(node)) return false;

    // Now check children for equality
    for(var i = 0; i < n; i++) {
      var c1 = this.childNodes[i], c2 = node.childNodes[i];
      if (!c1.isEqualNode(c2)) return false;
    }

    return true;
  }},

  // This method delegates shallow cloning to a clone() method
  // that each concrete subclass must implement
  cloneNode: { value: function(deep) {
    // Clone this node
    var clone = this.clone();

    // Handle the recursive case if necessary
    if (deep && this.firstChild) {
      for(var i = 0, n = this.childNodes.length; i < n; i++) {
        clone._appendChild(this.childNodes[i].cloneNode(true));
      }
    }

    return clone;
  }},

  lookupPrefix: { value: function lookupPrefix(ns) {
    var e;
    if (ns === '') return null;
    switch(this.nodeType) {
    case ELEMENT_NODE:
      return this.locateNamespacePrefix(ns);
    case DOCUMENT_NODE:
      e = this.documentElement;
      return e ? e.locateNamespacePrefix(ns) : null;
    case DOCUMENT_TYPE_NODE:
    case DOCUMENT_FRAGMENT_NODE:
      return null;
    default:
      e = this.parentElement;
      return e ? e.locateNamespacePrefix(ns) : null;
    }
  }},


  lookupNamespaceURI: {value: function lookupNamespaceURI(prefix) {
    var e;
    switch(this.nodeType) {
    case ELEMENT_NODE:
      return this.locateNamespace(prefix);
    case DOCUMENT_NODE:
      e = this.documentElement;
      return e ? e.locateNamespace(prefix) : null;
    case DOCUMENT_TYPE_NODE:
    case DOCUMENT_FRAGMENT_NODE:
      return null;
    default:
      e = this.parentElement;
      return e ? e.locateNamespace(prefix) : null;
    }
  }},

  isDefaultNamespace: { value: function isDefaultNamespace(ns) {
    var defaultns = this.lookupNamespaceURI(null);
    if (defaultns == null) defaultns = '';
    return ns === defaultns;
  }},

  // Utility methods for nodes.  Not part of the DOM

  // Return the index of this node in its parent.
  // Throw if no parent, or if this node is not a child of its parent
  index: { get: function() {
    utils.assert(this.parentNode);
    var kids = this.parentNode.childNodes;
    if (this._index == undefined || kids[this._index] != this) {
      this._index = kids.indexOf(this);
      utils.assert(this._index != -1);
    }
    return this._index;
  }},

  // Return true if this node is equal to or is an ancestor of that node
  // Note that nodes are considered to be ancestors of themselves
  isAncestor: { value: function(that) {
    // If they belong to different documents, then they're unrelated.
    if (this.doc != that.doc) return false;
    // If one is rooted and one isn't then they're not related
    if (this.rooted !== that.rooted) return false;

    // Otherwise check by traversing the parentNode chain
    for(var e = that; e; e = e.parentNode) {
      if (e === this) return true;
    }
    return false;
  }},

  // DOMINO Changed the behavior to conform with the specs. See:
  // https://groups.google.com/d/topic/mozilla.dev.platform/77sIYcpdDmc/discussion
  ensureSameDoc: { value: function(that) {
    if (that.ownerDocument === null) {
      that.ownerDocument = this.doc;
    }
    else if(that.ownerDocument !== this.doc) {
      utils.WrongDocumentError();
    }
  }},

  // Remove this node from its parent
  remove: { value: function remove() {
    // Send mutation events if necessary
    if (this.rooted) this.doc.mutateRemove(this);

    // Remove this node from its parents array of children
    this.parentNode.childNodes.splice(this.index, 1);

    // Update the structure id for all ancestors
    this.parentNode.modify();

    // Forget this node's parent
    this.parentNode = undefined;
  }},

  // Remove all of this node's children.  This is a minor
  // optimization that only calls modify() once.
  removeChildren: { value: function removeChildren() {
    var n = this.childNodes.length;
    if (n) {
      var root = this.rooted ? this.ownerDocument : null;
      for(var i = 0; i < n; i++) {
        if (root) root.mutateRemove(this.childNodes[i]);
        this.childNodes[i].parentNode = undefined;
      }
      this.childNodes.length = 0; // Forget all children
      this.modify();              // Update last modified type once only
    }
  }},

  // Insert this node as a child of parent at the specified index,
  // firing mutation events as necessary
  insert: { value: function insert(parent, index) {
    var child = this, kids = parent.childNodes;

    // If we are already a child of the specified parent, then t
    // the index may have to be adjusted.
    if (child.parentNode === parent) {
      var currentIndex = child.index;
      // If we're not moving the node, we're done now
      // XXX: or do DOM mutation events still have to be fired?
      if (currentIndex === index) return;

      // If the child is before the spot it is to be inserted at,
      // then when it is removed, the index of that spot will be
      // reduced.
      if (currentIndex < index) index--;
    }

    // Special case for document fragments
    // XXX: it is not at all clear that I'm handling this correctly.
    // Scripts should never get to see partially
    // inserted fragments, I think.  See:
    // http://lists.w3.org/Archives/Public/www-dom/2011OctDec/0130.html
    if (child.nodeType === DOCUMENT_FRAGMENT_NODE) {
      var  c;
      while((c = child.firstChild))
        c.insert(parent, index++);
      return;
    }

    // If both the child and the parent are rooted, then we want to
    // transplant the child without uprooting and rerooting it.
    if (child.rooted && parent.rooted) {
      // Remove the child from its current position in the tree
      // without calling remove(), since we don't want to uproot it.
      var curpar = child.parentNode, curidx = child.index;
      child.parentNode.childNodes.splice(child.index, 1);
      curpar.modify();

      // And insert it as a child of its new parent
      child.parentNode = parent;
      kids.splice(index, 0, child);
      child._index = index; // Optimization
      parent.modify();

      // Generate a move mutation event
      parent.doc.mutateMove(child);
    }
    else {
      // If the child already has a parent, it needs to be
      // removed from that parent, which may also uproot it
      if (child.parentNode) child.remove();

      // Now insert the child into the parent's array of children
      child.parentNode = parent;
      kids.splice(index, 0, child);

      child._index = index; // Optimization

      // And root the child if necessary
      if (parent.rooted) {
        parent.modify();
        parent.doc.mutateInsert(child);
      }
    }
  }},


  // Return the lastModTime value for this node. (For use as a
  // cache invalidation mechanism. If the node does not already
  // have one, initialize it from the owner document's modclock
  // property. (Note that modclock does not return the actual
  // time; it is simply a counter incremented on each document
  // modification)
  lastModTime: { get: function() {
    if (!this._lastModTime) {
      this._lastModTime = this.doc.modclock;
    }
    return this._lastModTime;
  }},

  // Increment the owner document's modclock and use the new
  // value to update the lastModTime value for this node and
  // all of its ancestors. Nodes that have never had their
  // lastModTime value queried do not need to have a
  // lastModTime property set on them since there is no
  // previously queried value to ever compare the new value
  // against, so only update nodes that already have a
  // _lastModTime property.
  modify: { value: function() {
    if (this.doc.modclock) { // Skip while doc.modclock == 0
      var time = ++this.doc.modclock;
      for(var n = this; n; n = n.parentElement) {
        if (n._lastModTime) {
          n._lastModTime = time;
        }
      }
    }
  }},

  // This attribute is not part of the DOM but is quite helpful.
  // It returns the document with which a node is associated.  Usually
  // this is the ownerDocument. But ownerDocument is null for the
  // document object itself, so this is a handy way to get the document
  // regardless of the node type
  doc: { get: function() {
    return this.ownerDocument || this;
  }},


  // If the node has a nid (node id), then it is rooted in a document
  rooted: { get: function() {
    return !!this._nid;
  }},

  normalize: { value: function() {
    for (var i=0; i < this.childNodes.length; i++) {
      var child = this.childNodes[i];

      if (child.normalize) {
        child.normalize();
      }

      if (child.nodeValue === "") {
        this.removeChild(child);
        i--;
        continue;
      }

      if (i) {
        var prevChild = this.childNodes[i-1];

        if (child.nodeType === Node.TEXT_NODE &&
          prevChild.nodeType === Node.TEXT_NODE) {

          // remove the child and decrement i
          prevChild.appendData(child.nodeValue);

          this.removeChild(child);
          i--;
        }
      }
    }
  }},

  // Convert the children of a node to an HTML string.
  // This is used by the innerHTML getter
  // The serialization spec is at:
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/the-end.html#serializing-html-fragments
  serialize: { value: function() {
    var s = '';
    for(var i = 0, n = this.childNodes.length; i < n; i++) {
      var kid = this.childNodes[i];
      switch(kid.nodeType) {
      case 1: //ELEMENT_NODE
        var ns = kid.namespaceURI;
        var html = ns == NAMESPACE.HTML;
        var tagname = (html || ns == NAMESPACE.SVG || ns == NAMESPACE.MATHML) ? kid.localName : kid.tagName;

        s += '<' + tagname;

        for(var j = 0, k = kid._numattrs; j < k; j++) {
          var a = kid._attr(j);
          s += ' ' + attrname(a);
          if (a.value !== undefined) s += '="' + escapeAttr(a.value) + '"';
        }
        s += '>';

        if (!(html && emptyElements[tagname])) {
          var ss = kid.serialize();
          if (html && extraNewLine[tagname] && ss.charAt(0)==='\n') s += '\n';
          // Serialize children and add end tag for all others
          s += ss;
          s += '</' + tagname + '>';
        }
        break;
      case 3: //TEXT_NODE
      case 4: //CDATA_SECTION_NODE
        var parenttag;
        if (this.nodeType === ELEMENT_NODE &&
          this.namespaceURI === NAMESPACE.HTML)
          parenttag = this.tagName;
        else
          parenttag = '';

        s += hasRawContent[parenttag] ? kid.data : escape(kid.data);
        break;
      case 8: //COMMENT_NODE
        s += '<!--' + kid.data + '-->';
        break;
      case 7: //PROCESSING_INSTRUCTION_NODE
        s += '<?' + kid.target + ' ' + kid.data + '?>';
        break;
      case 10: //DOCUMENT_TYPE_NODE
        s += '<!DOCTYPE ' + kid.name;

        if (kid.publicID) {
          s += ' PUBLIC "' + kid.publicId + '"';
        }

        if (kid.systemId) {
          s += ' "' + kid.systemId + '"';
        }

        s += '>';
        break;
      default:
        utils.InvalidState();
      }
    }

    return s;
  }},

  // mirror node type properties in the prototype, so they are present
  // in instances of Node (and subclasses)
  ELEMENT_NODE:                { value: ELEMENT_NODE },
  ATTRIBUTE_NODE:              { value: ATTRIBUTE_NODE },
  TEXT_NODE:                   { value: TEXT_NODE },
  CDATA_SECTION_NODE:          { value: CDATA_SECTION_NODE },
  ENTITY_REFERENCE_NODE:       { value: ENTITY_REFERENCE_NODE },
  ENTITY_NODE:                 { value: ENTITY_NODE },
  PROCESSING_INSTRUCTION_NODE: { value: PROCESSING_INSTRUCTION_NODE },
  COMMENT_NODE:                { value: COMMENT_NODE },
  DOCUMENT_NODE:               { value: DOCUMENT_NODE },
  DOCUMENT_TYPE_NODE:          { value: DOCUMENT_TYPE_NODE },
  DOCUMENT_FRAGMENT_NODE:      { value: DOCUMENT_FRAGMENT_NODE },
  NOTATION_NODE:               { value: NOTATION_NODE }
});

function escape(s) {
  return s.replace(/[&<>\u00A0]/g, function(c) {
    switch(c) {
    case '&': return '&amp;';
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '\u00A0': return '&nbsp;';
    }
  });
}

function escapeAttr(s) {
  return s.replace(/[&"\u00A0]/g, function(c) {
    switch(c) {
    case '&': return '&amp;';
    case '"': return '&quot;';
    case '\u00A0': return '&nbsp;';
    }
  });
}

function attrname(a) {
  var ns = a.namespaceURI;
  if (!ns)
    return a.localName;
  if (ns == NAMESPACE.XML)
    return 'xml:' + a.localName;
  if (ns == NAMESPACE.XLINK)
    return 'xlink:' + a.localName;

  if (ns == NAMESPACE.XMLNS) {
    if (a.localName === 'xmlns') return 'xmlns';
    else return 'xmlns:' + a.localName;
  }
  return a.name;
}

