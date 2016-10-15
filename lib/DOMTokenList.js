"use strict";
// DOMTokenList implementation based on https://github.com/Raynos/DOM-shim
var utils = require('./utils');

module.exports = DOMTokenList;

function DOMTokenList(getter, setter) {
  this._getString = getter;
  this._setString = setter;
  fixIndex(this, getList(this));
}

DOMTokenList.prototype = {
  item: function(index) {
    if (index >= this.length) {
      return null;
    }
    return this._getString().split(" ")[index];
  },

  contains: function(token) {
    token = String(token);
    handleErrors(token);
    var list = getList(this);
    return list.indexOf(token) > -1;
  },

  add: function(token) {
    handleErrors(token);
    var list = getList(this);
    if (list.indexOf(token) > -1) {
      return;
    }
    list.push(token);
    this._setString(list.join(" ").trim());
    fixIndex(this, list);
  },

  remove: function(token) {
    handleErrors(token);
    var list = getList(this);
    var index = list.indexOf(token);
    if (index > -1) {
      list.splice(index, 1);
      this._setString(list.join(" ").trim());
    }
    fixIndex(this, list);
  },

  toggle: function toggle(token) {
    if (this.contains(token)) {
      this.remove(token);
      return false;
    }
    else {
      this.add(token);
      return true;
    }
  },

  toString: function() {
    return this._getString();
  }
};

function fixIndex(clist, list) {
  clist.length = list.length;
  for (var i = 0; i < list.length; i++) {
    clist[i] = list[i];
  }
}

function handleErrors(token) {
  if (token === "" || token === undefined) {
    utils.SyntaxError();
  }
  if (token.indexOf(" ") > -1) {
    utils.InvalidCharacterError();
  }
}

function getList(clist) {
  var str = clist._getString();
  if (str === "") {
    return [];
  }
  else {
    return str.split(" ");
  }
}
