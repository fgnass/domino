module.exports = Document;

var Node = require('./Node');
var NodeList = require('./NodeList');
var Element = require('./Element');
var Text = require('./Text');
var Comment = require('./Comment');
var Event = require('./Event');
var DocumentFragment = require('./DocumentFragment');
var ProcessingInstruction = require('./ProcessingInstruction');
var DOMImplementation = require('./DOMImplementation');
var FilteredElementList = require('./FilteredElementList');
var TreeWalker = require('./TreeWalker');
var NodeFilter = require('./NodeFilter');
var URL = require('./URL');
var select = require('./select')
var events = require('./events');
var xml = require('./xmlnames');
var html = require('./htmlelts');
var impl = html.elements;
var utils = require('./utils');
var MUTATE = require('./MutationConstants');
var NAMESPACE = utils.NAMESPACE;

function Document(isHTML, address) {
  this.nodeType = Node.DOCUMENT_NODE;
  this.isHTML = isHTML;
  this._address = address || 'about:blank';
  this.readyState = 'loading';
  this.implementation = new DOMImplementation();

  // DOMCore says that documents are always associated with themselves
  this.ownerDocument = null; // ... but W3C tests expect null

  // These will be initialized by our custom versions of
  // appendChild and insertBefore that override the inherited
  // Node methods.
  // XXX: override those methods!
  this.doctype = null;
  this.documentElement = null;
  this.childNodes = new NodeList();

  // Documents are always rooted, by definition
  this._nid = 1;
  this._nextnid = 2; // For numbering children of the document
  this._nodes = [null, this];  // nid to node map

  // This maintains the mapping from element ids to element nodes.
  // We may need to update this mapping every time a node is rooted
  // or uprooted, and any time an attribute is added, removed or changed
  // on a rooted element.
  this.byId = {};

  // This property holds a monotonically increasing value akin to
  // a timestamp used to record the last modification time of nodes
  // and their subtrees. See the lastModTime attribute and modify()
  // method of the Node class. And see FilteredElementList for an example
  // of the use of lastModTime
  this.modclock = 0;
}

// Map from lowercase event category names (used as arguments to
// createEvent()) to the property name in the impl object of the
// event constructor.
var supportedEvents = {
  event: 'Event',
  customevent: 'CustomEvent',
  uievent: 'UIEvent',
  mouseevent: 'MouseEvent'
};

// Certain arguments to document.createEvent() must be treated specially
var replacementEvent = {
  events: 'event',
  htmlevents: 'event',
  mouseevents: 'mouseevent',
  mutationevents: 'mutationevent',
  uievents: 'uievent'
};

Document.prototype = Object.create(Node.prototype, {
  // This method allows dom.js to communicate with a renderer
  // that displays the document in some way
  // XXX: I should probably move this to the window object
  _setMutationHandler: { value: function(handler) {
    this.mutationHandler = handler;
  }},

  // This method allows dom.js to receive event notifications
  // from the renderer.
  // XXX: I should probably move this to the window object
  _dispatchRendererEvent: { value: function(targetNid, type, details) {
    var target = this._nodes[targetNid];
    if (!target) return;
    target._dispatchEvent(new Event(type, details), true);
  }},

  nodeName: { value: '#document'},
  nodeValue: {
    get: function() {
      return null;
    },
    set: function() {}
  },

  // XXX: DOMCore may remove documentURI, so it is NYI for now
  documentURI: { get: utils.nyi, set: utils.nyi },
  compatMode: { get: function() {
    // The _quirks property is set by the HTML parser
    return this._quirks ? 'BackCompat' : 'CSS1Compat';
  }},
  parentNode: { value: null },

  createTextNode: { value: function(data) {
    return new Text(this, '' + data);
  }},
  createComment: { value: function(data) {
    return new Comment(this, data);
  }},
  createDocumentFragment: { value: function() {
    return new DocumentFragment(this);
  }},
  createProcessingInstruction: { value: function(target, data) {
    if (this.isHTML) utils.NotSupportedError();
    if (!xml.isValidName(target) || data.indexOf('?>') !== -1)
      utils.InvalidCharacterError();
    return new ProcessingInstruction(this, target, data);
  }},

  createElement: { value: function(localName) {
    if (!xml.isValidName(localName)) utils.InvalidCharacterError();
    if (this.isHTML) localName = localName.toLowerCase();
    return html.createElement(this, localName, null);
  }},

  createElementNS: { value: function(namespace, qualifiedName) {
    if (!xml.isValidName(qualifiedName)) utils.InvalidCharacterError();
    if (!xml.isValidQName(qualifiedName)) utils.NamespaceError();

    var pos, prefix, localName;
    if ((pos = qualifiedName.indexOf(':')) !== -1) {
      prefix = qualifiedName.substring(0, pos);
      localName = qualifiedName.substring(pos+1);

      if (namespace === '' ||
        (prefix === 'xml' && namespace !== NAMESPACE.XML))
        utils.NamespaceError();
    }
    else {
      prefix = null;
      localName = qualifiedName;
    }

    if (((qualifiedName === 'xmlns' || prefix === 'xmlns') &&
       namespace !== NAMESPACE.XMLNS) ||
      (namespace === NAMESPACE.XMLNS &&
       qualifiedName !== 'xmlns' &&
       prefix !== 'xmlns'))
      utils.NamespaceError();

    if (namespace === NAMESPACE.HTML) {
      return html.createElement(this, localName, prefix);
    }

    return new Element(this, localName, namespace, prefix);
  }},

  createEvent: { value: function createEvent(interfaceName) {
    interfaceName = interfaceName.toLowerCase();
    var name = replacementEvent[interfaceName] || interfaceName;
    var constructor = events[supportedEvents[name]];

    if (constructor) {
      var e = new constructor();
      e._initialized = false;
      return e;
    }
    else {
      utils.NotSupportedError();
    }
  }},

  // See: http://www.w3.org/TR/dom/#dom-document-createtreewalker
  createTreeWalker: {value: function (root, whatToShow, filter) {
    whatToShow = whatToShow === undefined ? NodeFilter.SHOW_ALL : whatToShow;

    if (filter && typeof filter.acceptNode == 'function') {
      filter = filter.acceptNode;
      // Support filter being a function
      // https://developer.mozilla.org/en-US/docs/DOM/document.createTreeWalker
    }
    else if (typeof filter != 'function') {
      filter = null;
    }
    return new TreeWalker(root, whatToShow, filter);
  }},

  // Add some (surprisingly complex) document hierarchy validity
  // checks when adding, removing and replacing nodes into a
  // document object, and also maintain the documentElement and
  // doctype properties of the document.  Each of the following
  // 4 methods chains to the Node implementation of the method
  // to do the actual inserting, removal or replacement.

  appendChild: { value: function(child) {
    if (child.nodeType === Node.TEXT_NODE) utils.HierarchyRequestError();
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (this.documentElement) // We already have a root element
        utils.HierarchyRequestError();

      this.documentElement = child;
    }
    if (child.nodeType === Node.DOCUMENT_TYPE_NODE) {
      if (this.doctype ||      // Already have one
        this.documentElement) // Or out-of-order
        utils.HierarchyRequestError();

      this.doctype = child;
    }

    // Now chain to our superclass
    return Node.prototype.appendChild.call(this, child);
  }},

  insertBefore: { value: function insertBefore(child, refChild) {
    if (refChild === null) return Document.prototype.appendChild.call(this, child);
    if (refChild.parentNode !== this) utils.NotFoundError();
    if (child.nodeType === Node.TEXT_NODE) utils.HierarchyRequestError();
    if (child.nodeType === Node.ELEMENT_NODE) {
      // If we already have a root element or if we're trying to
      // insert it before the doctype
      if (this.documentElement ||
        (this.doctype && this.doctype.index >= refChild.index))
        utils.HierarchyRequestError();

      this.documentElement = child;
    }
    if (child.nodeType === Node.DOCUMENT_TYPE_NODE) {
      if (this.doctype ||
        (this.documentElement &&
         refChild.index > this.documentElement.index))
        utils.HierarchyRequestError();

      this.doctype = child;
    }
    return Node.prototype.insertBefore.call(this, child, refChild);
  }},

  replaceChild: { value: function replaceChild(child, oldChild) {
    if (oldChild.parentNode !== this) utils.NotFoundError();

    if (child.nodeType === Node.TEXT_NODE) utils.HierarchyRequestError();
    if (child.nodeType === Node.ELEMENT_NODE) {
      // If we already have a root element and we're not replacing it
      if (this.documentElement && this.documentElement !== oldChild)
        utils.HierarchyRequestError();
      // Or if we're trying to put the element before the doctype
      // (replacing the doctype is okay)
      if (this.doctype && oldChild.index < this.doctype.index)
        utils.HierarchyRequestError();

      if (oldChild === this.doctype) this.doctype = null;
    }
    else if (child.nodeType === Node.DOCUMENT_TYPE_NODE) {
      // If we already have a doctype and we're not replacing it
      if (this.doctype && oldChild !== this.doctype)
        utils.HierarchyRequestError();
      // If we have a document element and the old child
      // comes after it
      if (this.documentElement &&
        oldChild.index > this.documentElement.index)
        utils.HierarchyRequestError();

      if (oldChild === this.documentElement)
        this.documentElement = null;
    }
    else {
      if (oldChild === this.documentElement)
        this.documentElement = null;
      else if (oldChild === this.doctype)
        this.doctype = null;
    }
    return Node.prototype.replaceChild.call(this,child,oldChild);
  }},

  removeChild: { value: function removeChild(child) {
    if (child.nodeType === Node.DOCUMENT_TYPE_NODE)
      this.doctype = null;
    else if (child.nodeType === Node.ELEMENT_NODE)
      this.documentElement = null;

    // Now chain to our superclass
    return Node.prototype.removeChild.call(this, child);
  }},

  getElementById: { value: function(id) {
    var n = this.byId[id];
    if (!n) return null;
    if (Array.isArray(n)) { // there was more than one element with this id
      return n[0];  // array is sorted in document order
    }
    return n;
  }},

  // Just copy this method from the Element prototype
  getElementsByTagName: { value: Element.prototype.getElementsByTagName },
  getElementsByTagNameNS: { value: Element.prototype.getElementsByTagNameNS },
  getElementsByClassName: { value: Element.prototype.getElementsByClassName },

  adoptNode: { value: function adoptNode(node) {
    if (node.nodeType === Node.DOCUMENT_NODE ||
      node.nodeType === Node.DOCUMENT_TYPE_NODE) utils.NotSupportedError();

    if (node.parentNode) node.parentNode.removeChild(node);

    if (node.ownerDocument !== this)
      recursivelySetOwner(node, this);

    return node;
  }},

  importNode: { value: function importNode(node, deep) {
    return this.adoptNode(node.cloneNode());
  }},

  // The following attributes and methods are from the HTML spec
  URL: { get: utils.nyi },
  domain: { get: utils.nyi, set: utils.nyi },
  referrer: { get: utils.nyi },
  cookie: { get: utils.nyi, set: utils.nyi },
  lastModified: { get: utils.nyi },
  title: {
    get: function() {
      // Return the text of the first <title> child of the <head> element.
      var elt = namedHTMLChild(this.head, 'title');
      return elt && elt.textContent || '';
    },
    set: function(value) {
      var head = this.head;
      if (!head) { return; /* according to spec */ }
      var elt = namedHTMLChild(head, 'title');
      if (!elt) {
        elt = this.createElement('title');
        head.appendChild(elt);
      }
      elt.textContent = value;
    }
  },
  dir:  { get: utils.nyi, set: utils.nyi },
  // Return the first <body> child of the document element.
  // XXX For now, setting this attribute is not implemented.
  body: {
    get: function() {
      return namedHTMLChild(this.documentElement, 'body');
    },
    set: utils.nyi
  },
  // Return the first <head> child of the document element.
  head: { get: function() {
    return namedHTMLChild(this.documentElement, 'head');
  }},
  images: { get: utils.nyi },
  embeds: { get: utils.nyi },
  plugins: { get: utils.nyi },
  links: { get: utils.nyi },
  forms: { get: utils.nyi },
  scripts: { get: utils.nyi },
  innerHTML: {
    get: function() { return this.serialize(); },
    set: utils.nyi
  },
  outerHTML: {
    get: function() { return this.serialize(); },
    set: utils.nyi
  },

  write: { value: function(args) {
    if (!this.isHTML) utils.InvalidStateError();

    // XXX: still have to implement the ignore part
    if (!this._parser /* && this._ignore_destructive_writes > 0 */ )
      return;

    if (!this._parser) {
      // XXX call document.open, etc.
    }

    var s = arguments.join('');

    // If the Document object's reload override flag is set, then
    // append the string consisting of the concatenation of all the
    // arguments to the method to the Document's reload override
    // buffer.
    // XXX: don't know what this is about.  Still have to do it

    // If there is no pending parsing-blocking script, have the
    // tokenizer process the characters that were inserted, one at a
    // time, processing resulting tokens as they are emitted, and
    // stopping when the tokenizer reaches the insertion point or when
    // the processing of the tokenizer is aborted by the tree
    // construction stage (this can happen if a script end tag token is
    // emitted by the tokenizer).

    // XXX: still have to do the above. Sounds as if we don't
    // always call parse() here.  If we're blocked, then we just
    // insert the text into the stream but don't parse it reentrantly...

    // Invoke the parser reentrantly
    this._parser.parse(s);
  }},

  writeln: { value: function writeln(args) {
    this.write(Array.prototype.join.call(arguments, '') + '\n');
  }},

  open: { value: function() {
    this.documentElement = null;
  }},

  close: { value: function() {
    this.readyState = 'complete';
    var ev = new Event('DOMContentLoaded');
    this._dispatchEvent(ev, true);
    if (this.defaultView) {
      ev = new Event('load');
      this.defaultView._dispatchEvent(ev, true);
    }
  }},

  // Utility methods
  clone: { value: function clone() {
    // Can't clone an entire document
    utils.DataCloneError();
  }},

  isEqual: { value: function isEqual(n) {
    // Any two documents are shallowly equal.
    // Node.isEqualNode will also test the children
    return true;
  }},

  // Implementation-specific function.  Called when a text, comment,
  // or pi value changes.
  mutateValue: { value: function(node) {
    if (this.mutationHandler) {
      this.mutationHandler({
        type: MUTATE.VALUE,
        target: node,
        data: node.data
      });
    }
  }},

  // Invoked when an attribute's value changes. Attr holds the new
  // value.  oldval is the old value.  Attribute mutations can also
  // involve changes to the prefix (and therefore the qualified name)
  mutateAttr: { value: function(attr, oldval) {
    // Manage id->element mapping for getElementsById()
    // XXX: this special case id handling should not go here,
    // but in the attribute declaration for the id attribute
    /*
    if (attr.localName === 'id' && attr.namespaceURI === null) {
      if (oldval) delId(oldval, attr.ownerElement);
      addId(attr.value, attr.ownerElement);
    }
    */
    if (this.mutationHandler) {
      this.mutationHandler({
        type: MUTATE.ATTR,
        target: attr.ownerElement,
        attr: attr
      });
    }
  }},

  // Used by removeAttribute and removeAttributeNS for attributes.
  mutateRemoveAttr: { value: function(attr) {
/*
* This is now handled in Attributes.js
    // Manage id to element mapping
    if (attr.localName === 'id' && attr.namespaceURI === null) {
      this.delId(attr.value, attr.ownerElement);
    }
*/
    if (this.mutationHandler) {
      this.mutationHandler({
        type: MUTATE.REMOVE_ATTR,
        target: attr.ownerElement,
        attr: attr
      });
    }
  }},

  // Called by Node.removeChild, etc. to remove a rooted element from
  // the tree. Only needs to generate a single mutation event when a
  // node is removed, but must recursively mark all descendants as not
  // rooted.
  mutateRemove: { value: function(node) {
    // Send a single mutation event
    if (this.mutationHandler) {
      this.mutationHandler({
        type: MUTATE.REMOVE,
        target: node.parentNode,
        node: node
      });
    }

    // Mark this and all descendants as not rooted
    recursivelyUproot(node);
  }},

  // Called when a new element becomes rooted.  It must recursively
  // generate mutation events for each of the children, and mark them all
  // as rooted.
  mutateInsert: { value: function(node) {
    // Mark node and its descendants as rooted
    recursivelyRoot(node);

    // Send a single mutation event
    if (this.mutationHandler) {
      this.mutationHandler({
        type: MUTATE.INSERT,
        target: node.parentNode,
        node: node
      });
    }
  }},

  // Called when a rooted element is moved within the document
  mutateMove: { value: function(node) {
    if (this.mutationHandler) {
      this.mutationHandler({
        type: MUTATE.MOVE,
        target: node
      });
    }
  }},


  // Add a mapping from  id to n for n.ownerDocument
  addId: { value: function addId(id, n) {
    var val = this.byId[id];
    if (!val) {
      this.byId[id] = n;
    }
    else {
      // TODO: Add a way to opt-out console warnings
      //console.warn('Duplicate element id ' + id);
      if (!Array.isArray(val)) {
        val = [val];
        this.byId[id] = val;
      }
      val.push(n);
      val.sort(utils.documentOrder);
    }
  }},

  // Delete the mapping from id to n for n.ownerDocument
  delId: { value: function delId(id, n) {
    var val = this.byId[id];
    utils.assert(val);

    if (Array.isArray(val)) {
      var idx = val.indexOf(n);
      val.splice(idx, 1);

      if (val.length == 1) { // convert back to a single node
        this.byId[id] = val[0];
      }
    }
    else {
      this.byId[id] = undefined;
    }
  }},

  _resolve: { value: function(href) {
    //XXX: Cache the URL
    return new URL(this._documentBaseURL).resolve(href);
  }},

  _documentBaseURL: { get: function() {
    // XXX: This is not implemented correctly yet
    var url = this._address;
    if (url == 'about:blank') url = '/';
    return url;

    // The document base URL of a Document object is the
    // absolute URL obtained by running these substeps:

    //     Let fallback base url be the document's address.

    //     If fallback base url is about:blank, and the
    //     Document's browsing context has a creator browsing
    //     context, then let fallback base url be the document
    //     base URL of the creator Document instead.

    //     If the Document is an iframe srcdoc document, then
    //     let fallback base url be the document base URL of
    //     the Document's browsing context's browsing context
    //     container's Document instead.

    //     If there is no base element that has an href
    //     attribute, then the document base URL is fallback
    //     base url; abort these steps. Otherwise, let url be
    //     the value of the href attribute of the first such
    //     element.

    //     Resolve url relative to fallback base url (thus,
    //     the base href attribute isn't affected by xml:base
    //     attributes).

    //     The document base URL is the result of the previous
    //     step if it was successful; otherwise it is fallback
    //     base url.
  }},

  querySelector: { value: function(selector) {
    return select(selector, this)[0];
  }},

  querySelectorAll: { value: function(selector) {
    var nodes = select(selector, this);
    return nodes.item ? nodes : new NodeList(nodes);
  }}

});


var eventHandlerTypes = [
  'abort', 'canplay', 'canplaythrough', 'change', 'click', 'contextmenu',
  'cuechange', 'dblclick', 'drag', 'dragend', 'dragenter', 'dragleave',
  'dragover', 'dragstart', 'drop', 'durationchange', 'emptied', 'ended',
  'input', 'invalid', 'keydown', 'keypress', 'keyup', 'loadeddata',
  'loadedmetadata', 'loadstart', 'mousedown', 'mousemove', 'mouseout',
  'mouseover', 'mouseup', 'mousewheel', 'pause', 'play', 'playing',
  'progress', 'ratechange', 'readystatechange', 'reset', 'seeked',
  'seeking', 'select', 'show', 'stalled', 'submit', 'suspend',
  'timeupdate', 'volumechange', 'waiting',

  'blur', 'error', 'focus', 'load', 'scroll'
];

// Add event handler idl attribute getters and setters to Document
eventHandlerTypes.forEach(function(type) {
  // Define the event handler registration IDL attribute for this type
  Object.defineProperty(Document.prototype, 'on' + type, {
    get: function() {
      return this._getEventHandler(type);
    },
    set: function(v) {
      this._setEventHandler(type, v);
    }
  });
});

function namedHTMLChild(parent, name) {
  if (parent && parent.isHTML) {
    var kids = parent.childNodes;
    for(var i = 0, n = kids.length; i < n; i++) {
      if (kids[i].nodeType === Node.ELEMENT_NODE &&
        kids[i].localName === name &&
        kids[i].namespaceURI === NAMESPACE.HTML) {
        return kids[i];
      }
    }
  }
  return null;
}

function root(n) {
  n._nid = n.ownerDocument._nextnid++;
  n.ownerDocument._nodes[n._nid] = n;
  // Manage id to element mapping
  if (n.nodeType === Node.ELEMENT_NODE) {
    var id = n.getAttribute('id');
    if (id) n.ownerDocument.addId(id, n);

    // Script elements need to know when they're inserted
    // into the document
    if (n._roothook) n._roothook();
  }
}

function uproot(n) {
  // Manage id to element mapping
  if (n.nodeType === Node.ELEMENT_NODE) {
    var id = n.getAttribute('id');
    if (id) n.ownerDocument.delId(id, n);
  }
  n.ownerDocument._nodes[n._nid] = undefined;
  n._nid = undefined;
}

function recursivelyRoot(node) {
  root(node);
  // XXX:
  // accessing childNodes on a leaf node creates a new array the
  // first time, so be careful to write this loop so that it
  // doesn't do that. node is polymorphic, so maybe this is hard to
  // optimize?  Try switching on nodeType?
/*
  if (node.hasChildNodes()) {
    var kids = node.childNodes;
    for(var i = 0, n = kids.length;  i < n; i++)
      recursivelyRoot(kids[i]);
  }
*/
  if (node.nodeType === Node.ELEMENT_NODE) {
    var kids = node.childNodes;
    for(var i = 0, n = kids.length; i < n; i++)
      recursivelyRoot(kids[i]);
  }
}

function recursivelyUproot(node) {
  uproot(node);
  for(var i = 0, n = node.childNodes.length; i < n; i++)
    recursivelyUproot(node.childNodes[i]);
}

function recursivelySetOwner(node, owner) {
  node.ownerDocument = owner;
  node._lastModTime = undefined; // mod times are document-based
  var kids = node.childNodes;
  for(var i = 0, n = kids.length; i < n; i++)
    recursivelySetOwner(kids[i], owner);
}
