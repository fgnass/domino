"use strict";
var Node = require('./Node');

var NonDocumentTypeChildNode = {

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
  }}

};

module.exports = NonDocumentTypeChildNode;
