"use strict";
module.exports = NodeIterator;

var NodeFilter = require('./NodeFilter');
var NodeTraversal = require('./NodeTraversal');

/* Private methods and helpers */

/**
 * @based on WebKit's NodeIterator::moveToNext and NodeIterator::moveToPrevious
 * https://trac.webkit.org/browser/trunk/Source/WebCore/dom/NodeIterator.cpp?rev=186279#L51
 */
function move(node, stayWithin, directionIsNext) {
  if (directionIsNext) {
    return NodeTraversal.next(node, stayWithin);
  } else {
    if (node === stayWithin) {
      return null;
    }
    return NodeTraversal.previous(node, null);
  }
}

/**
 * @spec http://www.w3.org/TR/dom/#concept-nodeiterator-traverse
 * @method
 * @access private
 * @param {NodeIterator} ni
 * @param {string} direction One of 'next' or 'previous'.
 * @return {Node|null}
 */
function traverse(ni, directionIsNext) {
  var node, beforeNode;
  node = ni.referenceNode;
  beforeNode = ni.pointerBeforeReferenceNode;
  while (true) {
    if (beforeNode === directionIsNext) {
      beforeNode = !beforeNode;
    } else {
      node = move(node, ni.root, directionIsNext);
      if (node === null) {
        return null;
      }
    }
    var result = ni.filter.acceptNode(node);
    if (result === NodeFilter.FILTER_ACCEPT) {
      break;
    }
  }
  ni.referenceNode = node;
  ni.pointerBeforeReferenceNode = beforeNode;
  return node;
}

/* Public API */

/**
 * Implemented version: http://www.w3.org/TR/2015/WD-dom-20150618/#nodeiterator
 * Latest version: http://www.w3.org/TR/dom/#nodeiterator
 *
 * @constructor
 * @param {Node} root
 * @param {number} whatToShow [optional]
 * @param {Function|NodeFilter} filter [optional]
 * @throws Error
 */
function NodeIterator(root, whatToShow, filter) {
  var ni = this, active = false;

  if (!root || !root.nodeType) {
    throw new Error('DOMException: NOT_SUPPORTED_ERR');
  }

  ni.root = ni.referenceNode = root;
  ni.pointerBeforeReferenceNode = true;
  ni.whatToShow = Number(whatToShow) || 0;

  if (typeof filter !== 'function') {
    filter = null;
  }

  ni.filter = Object.create(NodeFilter.prototype);

  /**
   * @method
   * @param {Node} node
   * @return {Number} Constant NodeFilter.FILTER_ACCEPT,
   *  NodeFilter.FILTER_REJECT or NodeFilter.FILTER_SKIP.
   */
  ni.filter.acceptNode = function (node) {
    /* jshint bitwise: false */
    var result;
    if (active) {
      throw new Error('DOMException: INVALID_STATE_ERR');
    }

    // Maps nodeType to whatToShow
    if (!(((1 << (node.nodeType - 1)) & ni.whatToShow))) {
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
}

NodeIterator.prototype = {
  constructor: NodeIterator,

  /**
   * @spec http://www.w3.org/TR/dom/#dom-nodeiterator-nextnode
   * @method
   * @return {Node|null}
   */
  nextNode: function () {
    return traverse(this, true);
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-nodeiterator-previousnode
   * @method
   * @return {Node|null}
   */
  previousNode: function () {
    return traverse(this, false);
  },

  /**
   * @spec http://www.w3.org/TR/dom/#dom-nodeiterator-detach
   * @method
   * @return void
   */
  detach: function() {
    /* "The detach() method must do nothing.
     * Its functionality (disabling a NodeIterator object) was removed,
     * but the method itself is preserved for compatibility.
     */
  }
};
