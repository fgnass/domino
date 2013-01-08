module.exports = TreeWalker;

var NodeFilter = require('./NodeFilter');

var mapChild = {
  first: 'firstChild',
  last: 'lastChild',
  next: 'firstChild',
  previous: 'lastChild'
};

var mapSibling = {
  next: 'nextSibling',
  previous: 'previousSibling'
};

/* Private methods and helpers */

/**
 * @spec http://www.w3.org/TR/dom/#concept-traverse-children
 * @method
 * @access private
 * @param {TreeWalker} tw
 * @param {string} type One of 'first' or 'last'.
 * @return {Node|null}
 */
function traverseChildren(tw, type) {
  var child, node, parent, result, sibling;
  node = tw.currentNode[mapChild[type]];
  while (node !== null) {
    result = tw.filter.acceptNode(node);
    if (result === NodeFilter.FILTER_ACCEPT) {
      tw.currentNode = node;
      return node;
    }
    if (result === NodeFilter.FILTER_SKIP) {
      child = node[mapChild[type]];
      if (child !== null) {
        node = child;
        continue;
      }
    }
    while (node !== null) {
      sibling = node[mapChild[type]];
      if (sibling !== null) {
        node = sibling;
        break;
      }
      parent = node.parentNode;
      if (parent === null || parent === tw.root || parent === tw.currentNode) {
        return null;
      }
      else {
        node = parent;
      }
    }
  }
  return null;
};

/**
 * @spec http://www.w3.org/TR/dom/#concept-traverse-siblings
 * @method
 * @access private
 * @param {TreeWalker} tw
 * @param {TreeWalker} type One of 'next' or 'previous'.
 * @return {Node|nul}
 */
function traverseSiblings(tw, type) {
  var node, result, sibling;
  node = tw.currentNode;
  if (node === tw.root) {
    return null;
  }
  while (true) {
    sibling = node[mapSibling[type]];
    while (sibling !== null) {
      node = sibling;
      result = tw.filter.acceptNode(node);
      if (result === NodeFilter.FILTER_ACCEPT) {
        tw.currentNode = node;
        return node;
      }
      sibling = node[mapChild[type]];
      if (result === NodeFilter.FILTER_REJECT) {
        sibling = node[mapSibling[type]];
      }
    }
    node = node.parentNode;
    if (node === null || node === tw.root) {
      return null;
    }
    if (tw.filter.acceptNode(node) === NodeFilter.FILTER_ACCEPT) {
      return null;
    }
  }
};

/**
 * @based on WebKit's NodeTraversal::nextSkippingChildren
 * https://trac.webkit.org/browser/trunk/Source/WebCore/dom/NodeTraversal.h?rev=137221#L103
 */
function nextSkippingChildren(node, stayWithin) {
  if (node === stayWithin) {
    return null;
  }
  if (node.nextSibling !== null) {
    return node.nextSibling;
  }

  /**
   * @based on WebKit's NodeTraversal::nextAncestorSibling
   * https://trac.webkit.org/browser/trunk/Source/WebCore/dom/NodeTraversal.cpp?rev=137221#L43
   */
  while (node.parentNode !== null) {
    node = node.parentNode;
    if (node === stayWithin) {
      return null;
    }
    if (node.nextSibling !== null) {
      return node.nextSibling;
    }
  }
  return null;
};

/* Public API */

/**
 * Implemented version: http://www.w3.org/TR/DOM-Level-2-Traversal-Range/traversal.html#Traversal-TreeWalker
 * Latest version: http://www.w3.org/TR/dom/#interface-treewalker
 *
 * @constructor
 * @param {Node} root
 * @param {number} whatToShow [optional]
 * @param {Function} filter [optional]
 * @throws Error
 */
function TreeWalker(root, whatToShow, filter) {
  var tw = this, active = false;

  if (!root || !root.nodeType) {
    throw new Error('DOMException: NOT_SUPPORTED_ERR');
  }

  tw.root = root;
  tw.whatToShow = Number(whatToShow) || 0;

  tw.currentNode = root;

  if (typeof filter == 'function') {
    filter = null;
  }

  tw.filter = Object.create(NodeFilter.prototype);

  /**
   * @method
   * @param {Node} node
   * @return {Number} Constant NodeFilter.FILTER_ACCEPT,
   *  NodeFilter.FILTER_REJECT or NodeFilter.FILTER_SKIP.
   */
  tw.filter.acceptNode = function (node) {
    var result;
    if (active) {
      throw new Error('DOMException: INVALID_STATE_ERR');
    }

    // Maps nodeType to whatToShow
    if (!(((1 << (node.nodeType - 1)) & tw.whatToShow))) {
      return NodeFilter.FILTER_SKIP;
    }

    if (filter === null) {
      return NodeFilter.FILTER_ACCEPT;
    }

    active = true;
    result = filter(node);
    active = false;

    return result;
  };
};

TreeWalker.prototype = {

  constructor: TreeWalker,

  /**
   * @spec http://www.w3.org/TR/dom/#dom-treewalker-parentnode
   * @method
   * @return {Node|null}
   */
  parentNode: function () {
    var node = this.currentNode;
    while (node !== null && node !== this.root) {
      node = node.parentNode;
      if (node !== null && this.filter.acceptNode(node) === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
    return null;
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-treewalker-firstchild
   * @method
   * @return {Node|null}
   */
  firstChild: function () {
    return traverseChildren(this, 'first');
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-treewalker-lastchild
   * @method
   * @return {Node|null}
   */
  lastChild: function () {
    return traverseChildren(this, 'last');
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-treewalker-previoussibling
   * @method
   * @return {Node|null}
   */
  previousSibling: function () {
    return traverseSiblings(this, 'previous');
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-treewalker-nextsibling
   * @method
   * @return {Node|null}
   */
  nextSibling: function () {
    return traverseSiblings(this, 'next');
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-treewalker-previousnode
   * @method
   * @return {Node|null}
   */
  previousNode: function () {
    var node, result, sibling;
    node = this.currentNode;
    while (node !== this.root) {
      sibling = node.previousSibling;
      while (sibling !== null) {
        node = sibling;
        result = this.filter.acceptNode(node);
        while (result !== NodeFilter.FILTER_REJECT && node.lastChild !== null) {
          node = node.lastChild;
          result = this.filter.acceptNode(node);
        }
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
      }
      if (node === this.root || node.parentNode === null) {
        return null;
      }
      node = node.parentNode;
      if (this.filter.acceptNode(node) === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
    return null;
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-treewalker-nextnode
   * @method
   * @return {Node|null}
   */
  nextNode: function () {
    var node, result, following;
    node = this.currentNode;
    result = NodeFilter.FILTER_ACCEPT;

    while (true) {
      while (result !== NodeFilter.FILTER_REJECT && node.firstChild !== null) {
        node = node.firstChild;
        result = this.filter.acceptNode(node);
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
      }
      following = nextSkippingChildren(node, this.root);
      if (following !== null) {
        node = following;
      }
      else {
        return null;
      }
      result = this.filter.acceptNode(node);
      if (result === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
  }
};

