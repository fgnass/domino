module.exports = Element;

var xml = require('./xmlnames');
var utils = require('./utils');
var NAMESPACE = utils.NAMESPACE;
var attributes = require('./attributes');
var Node = require('./Node');
var NodeList = require('./NodeList');
var FilteredElementList = require('./FilteredElementList');
var DOMTokenList = require('./DOMTokenList');
var select = require('./select');

function Element(doc, localName, namespaceURI, prefix) {
  this.nodeType = Node.ELEMENT_NODE;
  this.ownerDocument = doc;
  this.localName = localName;
  this.namespaceURI = namespaceURI;
  this.prefix = prefix;

  this.tagName = (prefix !== null) ? prefix + ':' + localName : localName;

  if (namespaceURI !== NAMESPACE.HTML || (!namespaceURI && !doc.isHTML)) this.isHTML = false;

  if (this.isHTML) this.tagName = this.tagName.toUpperCase();

  this.childNodes = new NodeList();

  // These properties maintain the set of attributes
  this._attrsByQName = {}; // The qname->Attr map
  this._attrsByLName = {}; // The ns|lname->Attr map
  this._attrKeys = [];     // attr index -> ns|lname

  this._index = undefined;
}

function recursiveGetText(node, a) {
  if (node.nodeType === Node.TEXT_NODE) {
    a.push(node._data);
  }
  else {
    for(var i = 0, n = node.childNodes.length;  i < n; i++)
      recursiveGetText(node.childNodes[i], a);
  }
}

Element.prototype = Object.create(Node.prototype, {
  nodeName: { get: function() { return this.tagName; }},
  nodeValue: {
    get: function() {
      return null;
    },
    set: function() {}
  },
  textContent: {
    get: function() {
      var strings = [];
      recursiveGetText(this, strings);
      return strings.join('');
    },
    set: function(newtext) {
      this.removeChildren();
      if (newtext !== null && newtext !== '') {
        this._appendChild(this.ownerDocument.createTextNode(newtext));
      }
    }
  },
  innerHTML: {
    get: function() {
      return this.serialize();
    },
    set: utils.nyi
  },
  outerHTML: {
    get: function() {
      // "the attribute must return the result of running the HTML fragment
      // serialization algorithm on a fictional node whose only child is
      // the context object"
      var fictional = {
        childNodes: [ this ],
        nodeType: 0
      };
      return this.serialize.call(fictional);
    },
    set: utils.nyi
  },

  children: { get: function() {
    if (!this._children) {
      this._children = new ChildrenCollection(this);
    }
    return this._children;
  }},

  attributes: { get: function() {
    if (!this._attributes) {
      this._attributes = new AttributesArray(this);
    }
    return this._attributes;
  }},


  firstElementChild: { get: function() {
    var kids = this.childNodes;
    for(var i = 0, n = kids.length; i < n; i++) {
      if (kids[i].nodeType === Node.ELEMENT_NODE) return kids[i];
    }
    return null;
  }},

  lastElementChild: { get: function() {
    var kids = this.childNodes;
    for(var i = kids.length-1; i >= 0; i--) {
      if (kids[i].nodeType === Node.ELEMENT_NODE) return kids[i];
    }
    return null;
  }},

  nextElementSibling: { get: function() {
    if (this.parentNode) {
      var sibs = this.parentNode.childNodes;
      for(var i = this.index+1, n = sibs.length; i < n; i++) {
        if (sibs[i].nodeType === Node.ELEMENT_NODE) return sibs[i];
      }
    }
    return null;
  }},

  previousElementSibling: { get: function() {
    if (this.parentNode) {
      var sibs = this.parentNode.childNodes;
      for(var i = this.index-1; i >= 0; i--) {
        if (sibs[i].nodeType === Node.ELEMENT_NODE) return sibs[i];
      }
    }
    return null;
  }},

  childElementCount: { get: function() {
    return this.children.length;
  }},


  // Return the next element, in source order, after this one or
  // null if there are no more.  If root element is specified,
  // then don't traverse beyond its subtree.
  //
  // This is not a DOM method, but is convenient for
  // lazy traversals of the tree.
  nextElement: { value: function(root) {
    var next = this.firstElementChild || this.nextElementSibling;
    if (next) return next;

    if (!root) root = this.ownerDocument.documentElement;

    // If we can't go down or across, then we have to go up
    // and across to the parent sibling or another ancestor's
    // sibling.  Be careful, though: if we reach the root
    // element, or if we reach the documentElement, then
    // the traversal ends.
    for(var parent = this.parentElement;
      parent && parent !== root;
      parent = parent.parentElement) {

      next = parent.nextElementSibling;
      if (next) return next;
    }

    return null;
  }},

  // XXX:
  // Tests are currently failing for this function.
  // Awaiting resolution of:
  // http://lists.w3.org/Archives/Public/www-dom/2011JulSep/0016.html
  getElementsByTagName: { value: function getElementsByTagName(lname) {
    var filter;
    if (!lname) return new NodeList();
    if (lname === '*')
      filter = function() { return true };
    else if (this.isHTML)
      filter = htmlLocalNameElementFilter(lname);
    else
      filter = localNameElementFilter(lname);

    return new FilteredElementList(this, filter);
  }},

  getElementsByTagNameNS: { value: function getElementsByTagNameNS(ns, lname){
    var filter;
    if (ns === '*' && lname === '*')
      filter = ftrue;
    else if (ns === '*')
      filter = localNameElementFilter(lname);
    else if (lname === '*')
      filter = namespaceElementFilter(ns);
    else
      filter = namespaceLocalNameElementFilter(ns, lname);

    return new FilteredElementList(this, filter);
  }},

  getElementsByClassName: { value: function getElementsByClassName(names){
    names = names.trim();
    if (names === '') {
      var result = new NodeList(); // Empty node list
      return result;
    }
    names = names.split(/\s+/);  // Split on spaces
    return new FilteredElementList(this, classNamesElementFilter(names));
  }},

  getElementsByName: { value: function getElementsByName(name) {
    return new FilteredElementList(this, elementNameFilter(name));
  }},

  // Overwritten in the constructor if not in the HTML namespace
  isHTML: { value: true },

  // Utility methods used by the public API methods above
  clone: { value: function clone() {
    var e;

    // XXX:
    // Modify this to use the constructor directly or
    // avoid error checking in some other way. In case we try
    // to clone an invalid node that the parser inserted.
    //
    if (this.namespaceURI !== NAMESPACE.HTML || this.prefix)
      e = this.ownerDocument.createElementNS(this.namespaceURI,
                           this.tagName);
    else
      e = this.ownerDocument.createElement(this.localName);

    for(var i = 0, n = this._attrKeys.length; i < n; i++) {
      var lname = this._attrKeys[i];
      var a = this._attrsByLName[lname];
      var b = new Attr(e, a.localName, a.prefix, a.namespaceURI);
      b.data = a.data;
      e._attrsByLName[lname] = b;
      e._addQName(b);
    }
    e._attrKeys = this._attrKeys.concat();

    return e;
  }},

  isEqual: { value: function isEqual(that) {
    if (this.localName !== that.localName ||
      this.namespaceURI !== that.namespaceURI ||
      this.prefix !== that.prefix ||
      this._numattrs !== that._numattrs)
      return false;

    // Compare the sets of attributes, ignoring order
    // and ignoring attribute prefixes.
    for(var i = 0, n = this._numattrs; i < n; i++) {
      var a = this._attr(i);
      if (!that.hasAttributeNS(a.namespaceURI, a.localName))
        return false;
      if (that.getAttributeNS(a.namespaceURI,a.localName) !== a.value)
        return false;
    }

    return true;
  }},

  // This is the 'locate a namespace prefix' algorithm from the
  // DOMCore specification.  It is used by Node.lookupPrefix()
  locateNamespacePrefix: { value: function locateNamespacePrefix(ns) {
    if (this.namespaceURI === ns && this.prefix !== null)
      return this.prefix;

    for(var i = 0, n = this._numattrs; i < n; i++) {
      var a = this._attr(i);
      if (a.prefix === 'xmlns' && a.value === ns)
        return a.localName;
    }

    var parent = this.parentElement;
    return parent ? parent.locateNamespacePrefix(ns) : null;
  }},

  // This is the 'locate a namespace' algorithm for Element nodes
  // from the DOM Core spec.  It is used by Node.lookupNamespaceURI
  locateNamespace: { value: function locateNamespace(prefix) {
    if (this.prefix === prefix && this.namespaceURI !== null)
      return this.namespaceURI;

    for(var i = 0, n = this._numattrs; i < n; i++) {
      var a = this._attr(i);
      if ((a.prefix === 'xmlns' && a.localName === prefix) ||
        (a.prefix === null && a.localName === 'xmlns')) {
        return a.value || null;
      }
    }

    var parent = this.parentElement;
    return parent ? parent.locateNamespace(prefix) : null;
  }},

  //
  // Attribute handling methods and utilities
  //

  /*
   * Attributes in the DOM are tricky:
   *
   * - there are the 8 basic get/set/has/removeAttribute{NS} methods
   *
   * - but many HTML attributes are also 'reflected' through IDL
   *   attributes which means that they can be queried and set through
   *   regular properties of the element.  There is just one attribute
   *   value, but two ways to get and set it.
   *
   * - Different HTML element types have different sets of reflected
     attributes.
   *
   * - attributes can also be queried and set through the .attributes
   *   property of an element.  This property behaves like an array of
   *   Attr objects.  The value property of each Attr is writeable, so
   *   this is a third way to read and write attributes.
   *
   * - for efficiency, we really want to store attributes in some kind
   *   of name->attr map.  But the attributes[] array is an array, not a
   *   map, which is kind of unnatural.
   *
   * - When using namespaces and prefixes, and mixing the NS methods
   *   with the non-NS methods, it is apparently actually possible for
   *   an attributes[] array to have more than one attribute with the
   *   same qualified name.  And certain methods must operate on only
   *   the first attribute with such a name.  So for these methods, an
   *   inefficient array-like data structure would be easier to
   *   implement.
   *
   * - The attributes[] array is live, not a snapshot, so changes to the
   *   attributes must be immediately visible through existing arrays.
   *
   * - When attributes are queried and set through IDL properties
   *   (instead of the get/setAttributes() method or the attributes[]
   *   array) they may be subject to type conversions, URL
   *   normalization, etc., so some extra processing is required in that
   *   case.
   *
   * - But access through IDL properties is probably the most common
   *   case, so we'd like that to be as fast as possible.
   *
   * - We can't just store attribute values in their parsed idl form,
   *   because setAttribute() has to return whatever string is passed to
   *   getAttribute even if it is not a legal, parseable value. So
   *   attribute values must be stored in unparsed string form.
   *
   * - We need to be able to send change notifications or mutation
   *   events of some sort to the renderer whenever an attribute value
   *   changes, regardless of the way in which it changes.
   *
   * - Some attributes, such as id and class affect other parts of the
   *   DOM API, like getElementById and getElementsByClassName and so
   *   for efficiency, we need to specially track changes to these
   *   special attributes.
   *
   * - Some attributes like class have different names (className) when
   *   reflected.
   *
   * - Attributes whose names begin with the string 'data-' are treated
     specially.
   *
   * - Reflected attributes that have a boolean type in IDL have special
   *   behavior: setting them to false (in IDL) is the same as removing
   *   them with removeAttribute()
   *
   * - numeric attributes (like HTMLElement.tabIndex) can have default
   *   values that must be returned by the idl getter even if the
   *   content attribute does not exist. (The default tabIndex value
   *   actually varies based on the type of the element, so that is a
   *   tricky one).
   *
   * See
   * http://www.whatwg.org/specs/web-apps/current-work/multipage/urls.html#reflect
   * for rules on how attributes are reflected.
   *
   */

  getAttribute: { value: function getAttribute(qname) {
    if (this.isHTML) qname = qname.toLowerCase();
    var attr = this._attrsByQName[qname];
    if (!attr) return null;

    if (Array.isArray(attr))  // If there is more than one
      attr = attr[0];         // use the first

    return attr.value;
  }},

  getAttributeNS: { value: function getAttributeNS(ns, lname) {
    var attr = this._attrsByLName[ns + '|' + lname];
    return attr ? attr.value : null;
  }},

  hasAttribute: { value: function hasAttribute(qname) {
    if (this.isHTML) qname = qname.toLowerCase();
    return qname in this._attrsByQName;
  }},

  hasAttributeNS: { value: function hasAttributeNS(ns, lname) {
    var key = ns + '|' + lname;
    return key in this._attrsByLName;
  }},

  // Set the attribute without error checking. The parser uses this.
  _setAttribute: { value: function _setAttribute(qname, value) {
    // XXX: the spec says that this next search should be done
    // on the local name, but I think that is an error.
    // email pending on www-dom about it.
    var attr = this._attrsByQName[qname];
    var isnew;
    if (!attr) {
      attr = this._newattr(qname);
      isnew = true;
    }
    else {
      if (Array.isArray(attr)) attr = attr[0];
    }

    // Now set the attribute value on the new or existing Attr object.
    // The Attr.value setter method handles mutation events, etc.
    attr.value = value;
    if (this._attributes) this._attributes[qname] = attr;
    if (isnew && this._newattrhook) this._newattrhook(qname, value);
  }},

  // Check for errors, and then set the attribute
  setAttribute: {value: function setAttribute(qname, value) {
    if (!xml.isValidName(qname)) utils.InvalidCharacterError();
    if (this.isHTML) qname = qname.toLowerCase();
    if (qname.substring(0, 5) === 'xmlns') utils.NamespaceError();
    this._setAttribute(qname, value);
  }},


  // The version with no error checking used by the parser
  _setAttributeNS: { value: function _setAttributeNS(ns, qname, value) {
    var pos = qname.indexOf(':'), prefix, lname;
    if (pos === -1) {
      prefix = null;
      lname = qname;
    }
    else {
      prefix = qname.substring(0, pos);
      lname = qname.substring(pos+1);
    }

    var key = ns + '|' + lname;
    if (ns === '') ns = null;

    var attr = this._attrsByLName[key];
    var isnew;
    if (!attr) {
      attr = new Attr(this, lname, prefix, ns);
      isnew = true;
      this._attrsByLName[key] = attr;
      this._attrKeys.push(key);

      // We also have to make the attr searchable by qname.
      // But we have to be careful because there may already
      // be an attr with this qname.
      this._addQName(attr);
    }
    else {
      // Calling setAttributeNS() can change the prefix of an
      // existing attribute!
      if (attr.prefix !== prefix) {
        // Unbind the old qname
        this._removeQName(attr);
        // Update the prefix
        attr.prefix = prefix;
        // Bind the new qname
        this._addQName(attr);

      }

    }
    attr.value = value; // Automatically sends mutation event
    if (isnew && this._newattrhook) this._newattrhook(qname, value);
  }},

  // Do error checking then call _setAttributeNS
  setAttributeNS: { value: function setAttributeNS(ns, qname, value) {
    if (!xml.isValidName(qname)) utils.InvalidCharacterError();
    if (!xml.isValidQName(qname)) utils.NamespaceError();

    var pos = qname.indexOf(':');
    var prefix = (pos === -1) ? null : qname.substring(0, pos);
    if (ns === '') ns = null;

    if ((prefix !== null && ns === null) ||
      (prefix === 'xml' && ns !== NAMESPACE.XML) ||
      ((qname === 'xmlns' || prefix === 'xmlns') &&
       (ns !== NAMESPACE.XMLNS)) ||
      (ns === NAMESPACE.XMLNS &&
       !(qname === 'xmlns' || prefix === 'xmlns')))
      utils.NamespaceError();

    this._setAttributeNS(ns, qname, value);
  }},

  removeAttribute: { value: function removeAttribute(qname) {
    if (this.isHTML) qname = qname.toLowerCase();

    var attr = this._attrsByQName[qname];
    if (!attr) return;

    // If there is more than one match for this qname
    // so don't delete the qname mapping, just remove the first
    // element from it.
    if (Array.isArray(attr)) {
      if (attr.length > 2) {
        attr = attr.shift();  // remove it from the array
      }
      else {
        this._attrsByQName[qname] = attr[1];
        attr = attr[0];
      }
    }
    else {
      // only a single match, so remove the qname mapping
      this._attrsByQName[qname] = undefined;
    }

    // Now attr is the removed attribute.  Figure out its
    // ns+lname key and remove it from the other mapping as well.
    var key = (attr.namespaceURI || '') + '|' + attr.localName;
    this._attrsByLName[key] = undefined;

    var i = this._attrKeys.indexOf(key);
    this._attrKeys.splice(i, 1);

    if (this._attributes)
      this._attributes[qname] = undefined

    // Onchange handler for the attribute
    if (attr.onchange)
      attr.onchange(this, attr.localName, attr.value, null);

    // Mutation event
    if (this.rooted) this.ownerDocument.mutateRemoveAttr(attr);
  }},

  removeAttributeNS: { value: function removeAttributeNS(ns, lname) {
    var key = (ns || '') + '|' + lname;
    var attr = this._attrsByLName[key];
    if (!attr) return;

    this._attrsByLName[key] = undefined;

    var i = this._attrKeys.indexOf(key);
    this._attrKeys.splice(i, 1);

    // Now find the same Attr object in the qname mapping and remove it
    // But be careful because there may be more than one match.
    this._removeQName(attr);

    // Onchange handler for the attribute
    if (attr.onchange)
      attr.onchange(this, attr.localName, attr.value, null);
    // Mutation event
    if (this.rooted) this.ownerDocument.mutateRemoveAttr(attr);
  }},

  // This 'raw' version of getAttribute is used by the getter functions
  // of reflected attributes. It skips some error checking and
  // namespace steps
  _getattr: { value: function _getattr(qname) {
    // Assume that qname is already lowercased, so don't do it here.
    // Also don't check whether attr is an array: a qname with no
    // prefix will never have two matching Attr objects (because
    // setAttributeNS doesn't allow a non-null namespace with a
    // null prefix.
    var attr = this._attrsByQName[qname];
    return attr ? attr.value : null;
  }},

  // The raw version of setAttribute for reflected idl attributes.
  _setattr: { value: function _setattr(qname, value) {
    var attr = this._attrsByQName[qname];
    var isnew;
    if (!attr) {
      attr = this._newattr(qname);
      isnew = true;
    }
    attr.value = value;
    if (this._attributes) this._attributes[qname] = attr;
    if (isnew && this._newattrhook) this._newattrhook(qname, value);
  }},

  // Create a new Attr object, insert it, and return it.
  // Used by setAttribute() and by set()
  _newattr: { value: function _newattr(qname) {
    var attr = new Attr(this, qname);
    var key = '|' + qname;
    this._attrsByQName[qname] = attr;
    this._attrsByLName[key] = attr;
    this._attrKeys.push(key);
    return attr;
  }},

  // Add a qname->Attr mapping to the _attrsByQName object, taking into
  // account that there may be more than one attr object with the
  // same qname
  _addQName: { value: function(attr) {
    var qname = attr.name;
    var existing = this._attrsByQName[qname];
    if (!existing) {
      this._attrsByQName[qname] = attr;
    }
    else if (Array.isArray(existing)) {
      push(existing, attr);
    }
    else {
      this._attrsByQName[qname] = [existing, attr];
    }
    if (this._attributes) this._attributes[qname] = attr;
  }},

  // Remove a qname->Attr mapping to the _attrsByQName object, taking into
  // account that there may be more than one attr object with the
  // same qname
  _removeQName: { value: function(attr) {
    var qname = attr.name;
    var target = this._attrsByQName[qname];

    if (Array.isArray(target)) {
      var idx = target.indexOf(attr);
      assert(idx !== -1); // It must be here somewhere
      if (target.length === 2) {
        this._attrsByQName[qname] = target[1-idx];
      }
      else {
        target.splice(idx, 1);
      }
    }
    else {
      assert(target === attr);  // If only one, it must match
      this._attrsByQName[qname] = undefined;
    }
  }},

  // Return the number of attributes
  _numattrs: { get: function() { return this._attrKeys.length; }},
  // Return the nth Attr object
  _attr: { value: function(n) {
    return this._attrsByLName[this._attrKeys[n]];
  }},

  // Define getters and setters for an 'id' property that reflects
  // the content attribute 'id'.
  id: attributes.property({name: 'id'}),

  // Define getters and setters for a 'className' property that reflects
  // the content attribute 'class'.
  className: attributes.property({name: 'class'}),

  classList: { get: function() {
    var self = this;
    if (this._classList) {
      return this._classList;
    }
    var dtlist = new DOMTokenList(
      function() {
        return self.className || "";
      },
      function(v) {
        self.className = v;
      }
    );
    this._classList = dtlist;
    return dtlist;
  }},

  querySelector: { value: function(selector) {
    return select(selector, this)[0];
  }},

  querySelectorAll: { value: function(selector) {
    var nodes = select(selector, this);
    return nodes.item ? nodes : new NodeList(nodes);
  }}

});

// Register special handling for the id attribute
attributes.registerChangeHandler(Element, 'id',
 function(element, lname, oldval, newval) {
   if (element.rooted) {
     if (oldval) {
       element.ownerDocument.delId(oldval, element);
     }
     if (newval) {
       element.ownerDocument.addId(newval, element);
     }
   }
 }
);


// The Attr class represents a single attribute.  The values in
// _attrsByQName and _attrsByLName are instances of this class.
function Attr(elt, lname, prefix, namespace) {
  // Always remember what element we're associated with.
  // We need this to property handle mutations
  this.ownerElement = elt;

  if (!namespace && !prefix && elt._attributeChangeHandlers[lname])
    this.onchange = elt._attributeChangeHandlers[lname];

  // localName and namespace are constant for any attr object.
  // But value may change.  And so can prefix, and so, therefore can name.
  this.localName = lname;
  this.prefix = prefix || null;
  this.namespaceURI = namespace || null;
}

Attr.prototype = {
  get name() {
    return this.prefix ? this.prefix + ':' + this.localName : this.localName;
  },

  get value() {
    return this.data;
  },

  get specified() {
    // Deprecated
    return true;
  },

  set value(value) {
    var oldval = this.data;
    value = (value === undefined) ? '' : value + '';
    if (value === oldval) return;

    this.data = value;

    // Run the onchange hook for the attribute
    // if there is one.
    if (this.onchange)
      this.onchange(this.ownerElement,this.localName, oldval, value);

    // Generate a mutation event if the element is rooted
    if (this.ownerElement.rooted)
      this.ownerElement.ownerDocument.mutateAttr(this, oldval);
  }
};


// The attributes property of an Element will be an instance of this class.
// This class is really just a dummy, though. It only defines a length
// property and an item() method. The AttrArrayProxy that
// defines the public API just uses the Element object itself.
function AttributesArray(elt) {
  this.element = elt;
  for (var name in elt._attrsByQName) {
    this[name] = elt._attrsByQName[name]
  }
}
AttributesArray.prototype = {
  get length() {
    return this.element._attrKeys.length;
  },
  item: function(n) {
    return this.element._attrsByLName[this.element._attrKeys[n]];
  }
};


// The children property of an Element will be an instance of this class.
// It defines length, item() and namedItem() and will be wrapped by an
// HTMLCollection when exposed through the DOM.
function ChildrenCollection(e) {
  this.element = e;
  this.updateCache();
}

ChildrenCollection.prototype = {
  get length() {
    this.updateCache();
    return this.childrenByNumber.length;
  },
  item: function item(n) {
    this.updateCache();
    return this.childrenByNumber[n] || null;
  },

  namedItem: function namedItem(name) {
    this.updateCache();
    return this.childrenByName[name] || null;
  },

  // This attribute returns the entire name->element map.
  // It is not part of the HTMLCollection API, but we need it in
  // src/HTMLCollectionProxy
  get namedItems() {
    this.updateCache();
    return this.childrenByName;
  },

  updateCache: function updateCache() {
    var namedElts = /^(a|applet|area|embed|form|frame|frameset|iframe|img|object)$/;
    if (this.lastModTime !== this.element.lastModTime) {
      this.lastModTime = this.element.lastModTime;

      var n = this.childrenByNumber && this.childrenByNumber.length || 0;
      for(var i = 0; i < n; i++) {
        this[i] = undefined;
      }

      this.childrenByNumber = [];
      this.childrenByName = {};

      for(i = 0, n = this.element.childNodes.length; i < n; i++) {
        var c = this.element.childNodes[i];
        if (c.nodeType == Node.ELEMENT_NODE) {

          this[this.childrenByNumber.length] = c;
          this.childrenByNumber.push(c);

          // XXX Are there any requirements about the namespace
          // of the id property?
          var id = c.getAttribute('id');

          // If there is an id that is not already in use...
          if (id && !this.childrenByName[id])
            this.childrenByName[id] = c;

          // For certain HTML elements we check the name attribute
          var name = c.getAttribute('name');
          if (name &&
            this.element.namespaceURI === NAMESPACE.HTML &&
            namedElts.test(this.element.localName) &&
            !this.childrenByName[name])
            this.childrenByName[id] = c;
        }
      }
    }
  }
};

// These functions return predicates for filtering elements.
// They're used by the Document and Element classes for methods like
// getElementsByTagName and getElementsByClassName

function localNameElementFilter(lname) {
  return function(e) { return e.localName === lname; };
}

function htmlLocalNameElementFilter(lname) {
  var lclname = lname.toLowerCase();
  if (lclname === lname)
    return localNameElementFilter(lname);

  return function(e) {
    return e.isHTML ? e.localName === lclname : e.localName === lname;
  };
}

function namespaceElementFilter(ns) {
  return function(e) { return e.namespaceURI === ns; };
}

function namespaceLocalNameElementFilter(ns, lname) {
  return function(e) {
    return e.namespaceURI === ns && e.localName === lname;
  };
}

// XXX
// Optimize this when I implement classList.
function classNamesElementFilter(names) {
  return function(e) {
    var classAttr = e.getAttribute('class');
    if (!classAttr) return false;
    var classes = classAttr.trim().split(/\s+/);
    return names.every(function(n) {
      return classes.indexOf(n) !== -1;
    });
  };
}

function elementNameFilter(name) {
  return function(e) {
    return e.getAttribute('name') === name;
  };
}
