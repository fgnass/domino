exports.property = function(attr) {
  if (Array.isArray(attr.type)) {
    var valid = {};
    attr.type.forEach(function(val) {
      valid[val.value || val] = val.alias || val;
    });
    var defaultValue = attr.implied ? '' : valid[0];
    return {
      get: function() {
        var v = this._getattr(attr.name);
        if (v === null) return defaultValue;

        v = valid[v.toLowerCase()];
        if (v !== undefined) return v;
        return defaultValue;
      },
      set: function(v) { 
        this._setattr(attr.name, v);
      }
    };
  }
  else if (attr.type == Boolean) {
    return {
      get: function() {
        return this.hasAttribute(attr.name);
      },
      set: function(v) {
        if (v) {
          this._setattr(attr.name, '');
        }
        else {
          this.removeAttribute(attr.name);
        }
      }
    };
  }
  else if (attr.type == Number) {
    return numberPropDesc(attr);
  }
  else if (!attr.type || attr.type == String) {
    return {
      get: function() { return this._getattr(attr.name) || ''; },
      set: function(v) { this._setattr(attr.name, v); }
    };
  }
  else if (typeof attr.type == 'function') {
    return attr.type(attr.name, attr);
  }
  throw new Error('Invalid attribute definition');
};

// See http://www.whatwg.org/specs/web-apps/current-work/#reflect
//
// defval is the default value. If it is a function, then that function
// will be invoked as a method of the element to obtain the default.
// If no default is specified for a given attribute, then the default
// depends on the type of the attribute, but since this function handles
// 4 integer cases, you must specify the default value in each call
//
// min and max define a valid range for getting the attribute.
//
// setmin defines a minimum value when setting.  If the value is less
// than that, then throw INDEX_SIZE_ERR.
//
// Conveniently, JavaScript's parseInt function appears to be
// compatible with HTML's 'rules for parsing integers'
function numberPropDesc(a) {
  var def;
  if(typeof a.default == 'function') {
    def = a.default;
  }
  else if(typeof a.default == 'number') {
    def = function() { return a.default; };
  }
  else {
    def = function() { utils.assert(false); };
  }

  return {
    get: function() {
      var v = this._getattr(a.name);
      var n = a.float ? parseFloat(v) : parseInt(v, 10);
      if (!isFinite(n) || (a.min !== undefined && n < a.min) || (a.max !== undefined && n > a.max)) {
        return def.call(this);
      }
      return n;
    },
    set: function(v) {
      if (a.setmin !== undefined && v < a.setmin) {
        utils.IndexSizeError(a.name + ' set to ' + v);
      }
      this._setattr(a.name, String(v));
    }
  };
}

// This is a utility function for setting up change handler functions
// for attributes like 'id' that require special handling when they change.
exports.registerChangeHandler = function(c, name, handler) {
  var p = c.prototype;

  // If p does not already have its own _attributeChangeHandlers
  // then create one for it, inheriting from the inherited
  // _attributeChangeHandlers. At the top (for the Element class) the
  // _attributeChangeHandlers object will be created with a null prototype.
  if (!Object.hasOwnProperty(p, '_attributeChangeHandlers')) {
    p._attributeChangeHandlers =
      Object.create(p._attributeChangeHandlers || null);
  }

  p._attributeChangeHandlers[name] = handler;
};