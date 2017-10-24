"use strict";
var xml = require('./xmlnames');

var forbiddenNames = [
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph'];

var forbiddenExtendsNames = [
  'bgsound',
  'blink',
  'isindex',
  'multicol',
  'nextid',
  'spacer',
  'elementnametobeunknownelement'
];

function isInvalidCustomElementName(name) {
  return !name || !xml.isValidQName(name) || name.indexOf('-') < 0 || forbiddenNames.indexOf(name) > -1 || name.toLowerCase() !== name;
}

function CustomElementRegistry(registry, document) {
  this._parent = registry;
  this._document = document;
  this._registry = {};
  this._clonesRegistry = {};
  this._options = {};
  this._promises = {};
}

/**
 * @param {string} name
 * @param {Function} constructor
 * @param options
 */
CustomElementRegistry.prototype.define = function(name, constructor, options) {
  var err;
  if (!constructor) {
    err = new TypeError('Provide name and constructor');
    throw err;
  }

  if (!constructor) throw new TypeError('Provide constructor');
  if (typeof constructor !== 'function') throw new TypeError('Constructor have to be a function');
  if (!constructor.prototype) throw new TypeError('Constructor');
  if (typeof constructor.prototype === 'string') throw new TypeError('Constructor prototype is string');

  if (isInvalidCustomElementName(name)) {
    err = new SyntaxError('Invalid name');
    err.code = 12;
    throw err;
  }

  if (this._registry[name]) {
    err = new Error('Name already used');
    err.name = 'NOT_SUPPORTED_ERR';
    err.code = 9;
    throw err;
  }

  var _registry = this._registry;
  Object.keys(this._registry).forEach(function(_name) {
    if (constructor === _registry[_name]) {
      err = new Error('Constructor already used');
      err.name = 'NOT_SUPPORTED_ERR';
      err.code = 9;
      throw err;
    }
  });

  if (options && options.extends && (!isInvalidCustomElementName(options.extends) || forbiddenExtendsNames.indexOf(options.extends > -1))) {
    err = new Error('Extend have to be build in type');
    err.name = 'NOT_SUPPORTED_ERR';
    err.code = 9;
    throw err;
  }

  ['connectedCallback',
    'disconnectedCallback',
    'adoptedCallback',
    'attributeChangedCallback'].forEach(function(prop) {
    var type = typeof constructor.prototype[prop];
    if (type !== 'undefined' && type !== 'function') {
      throw new TypeError(name + ' have to be function');
    }
  });

  this._registry[name] = constructor;


  // we have to clone class to fallow the spec (after define observedAttributes and attributeChangedCallback mutation
  // do not have effect)
  this._clonesRegistry[name] = class extends constructor {};

  if (constructor.observedAttributes) {
      let observedAttributes;
      if (Array.isArray(constructor.observedAttributes)) {
          observedAttributes = constructor.observedAttributes.slice();
      } else if (constructor.observedAttributes && constructor.observedAttributes[Symbol.iterator]) {
          observedAttributes = Array.from(constructor.observedAttributes[Symbol.iterator]());
      }
      Object.defineProperty(this._clonesRegistry[name], 'observedAttributes', {
          get: function() {
              return observedAttributes;
          }
      });
  }

  this._clonesRegistry[name].prototype.attributeChangedCallback = constructor.prototype.attributeChangedCallback;
  this._clonesRegistry[name].prototype.connectedCallback = constructor.prototype.connectedCallback;
  this._clonesRegistry[name].prototype.disconnectedCallback = constructor.prototype.disconnectedCallback;

  this._options[name] = options;
  if (this._promises[name]) {
    this._promises[name].resolve();
  }

  if (this._document) {
    // TODO apply new item to existing content
  }

};

CustomElementRegistry.prototype.get = function(name) {
  if (this._clonesRegistry[name]) {
    return this._clonesRegistry[name];
  } else if (this._parent) {
    return this._parent.get(name);
  }
};

CustomElementRegistry.prototype.whenDefined = function(name) {
    if (this._promises[name]) {
        return this._promises[name];
    } else if (this._registry[name]) {
        return Promise.resolve();
    } else {
        var resolve;
        var promise = new Promise(function (res){
            resolve = res;
        });
        promise.resolve = resolve;
        this._promises[name] = promise;
        return promise;

    }
};

module.exports  = CustomElementRegistry;
