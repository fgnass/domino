"use strict";
module.exports = NodeList;

function item(i) {
  /* jshint validthis: true */
  return this[i];
}

function NodeList(a) {
  if (!a) a = [];
  a.item = item;
  return a;
}
