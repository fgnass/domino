"use strict";
module.exports = FilteredElementList;

var Node = require('./Node');

//
// This file defines node list implementation that lazily traverses
// the document tree (or a subtree rooted at any element) and includes
// only those elements for which a specified filter function returns true.
// It is used to implement the
// {Document,Element}.getElementsBy{TagName,ClassName}{,NS} methods.
//

function FilteredElementList(root, filter) {
  this.root = root;
  this.filter = filter;
  this.lastModTime = root.lastModTime;
  this.done = false;
  this.cache = [];
  this.traverse();
}

FilteredElementList.prototype = {
  get length() {
    this.checkcache();
    if (!this.done) this.traverse();
    return this.cache.length;
  },

  item: function(n) {
    this.checkcache();
    if (!this.done && n >= this.cache.length) this.traverse(n);
    return this.cache[n];
  },

  checkcache: function() {
    if (this.lastModTime !== this.root.lastModTime) {
      // subtree has changed, so invalidate cache
      for (var i = this.cache.length-1; i>=0; i--) {
        this[i] = undefined;
      }
      this.cache.length = 0;
      this.done = false;
      this.lastModTime = this.root.lastModTime;
    }
  },

  // If n is specified, then traverse the tree until we've found the nth
  // item (or until we've found all items).  If n is not specified,
  // traverse until we've found all items.
  traverse: function(n) {
    // increment n so we can compare to length, and so it is never falsy
    if (n !== undefined) n++;

    var elt;
    while ((elt = this.next()) !== null) {
      this[this.cache.length] = elt; //XXX Use proxy instead
      this.cache.push(elt);
      if (n && this.cache.length === n) return;
    }

    // no next element, so we've found everything
    this.done = true;
  },

  // Return the next element under root that matches filter
  next: function() {
    var start = (this.cache.length === 0) ? this.root // Start at the root or at
      : this.cache[this.cache.length-1]; // the last element we found

    var elt;
    if (start.nodeType === Node.DOCUMENT_NODE)
      elt = start.documentElement;
    else
      elt = start.nextElement(this.root);

    while(elt) {
      if (this.filter(elt)) {
        return elt;
      }

      elt = elt.nextElement(this.root);
    }
    return null;
  }
};
