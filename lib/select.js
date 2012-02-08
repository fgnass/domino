/**
 * Zest (https://github.com/chjj/zest)
 * A css selector engine.
 * Copyright (c) 2011, Christopher Jeffrey. (MIT Licensed)
 */

/**
 * Helpers
 */

function next(el) {
  while ((el = el.nextSibling) && el.nodeType !== 1);
  return el;
}

function prev(el) {
  while ((el = el.previousSibling) && el.nodeType !== 1);
  return el;
}

function child(el) {
  if ((el = el.firstChild)) {
    while (el.nodeType !== 1 && (el = el.nextSibling));
  }
  return el;
}

function unquote(str) {
  if (!str) return str;
  var ch = str[0];
  return (ch === '"' || ch === '\'') ? str.slice(1, -1) : str;
}

/**
 * Handle `nth` Selectors
 */

var nth = function(param, test) {
  var $ = param.replace(/\s+/g, '');
  var offset;
  var group;

  if ($ === 'even') $ = '2n+0';
  else if ($ === 'odd') $ = '2n+1';
  else if (!~$.indexOf('n')) $ = '0n' + $;

  $ = /^([+-])?(\d+)?n([+-])?(\d+)?$/.exec($);
  group = $[1] === '-' ? -($[2] || 1) : +($[2] || 1);
  offset = $[4] ? ($[3] === '-' ? -$[4] : +$[4]) : 0;
  $ = param = undefined;

  return function(el) {
    if (el.parentNode.nodeType !== 1) return;

    var rel = child(el.parentNode);
    var pos = 0;
    var diff;

    while (rel) {
      if (test(rel, el)) pos++;
      if (rel === el) {
        diff = pos - offset;
        return !group ? !diff : !(diff % group);
      }
      rel = next(rel);
    }
  };
};

/**
 * Simple Selectors
 */

var selectors = {
  "*": function() {
    return true;
  },
  type: function(type) {
    type = type.toLowerCase();
    return function(el) {
      return el.nodeName.toLowerCase() === type;
    };
  },
  attr: function(key, op, val) {
    op = operators[op];
    return function(el) {
      var attr;
      switch (key) {
        case 'for':
          attr = el.htmlFor;
          break;
        case 'class':
          attr = el.className;
          break;
        case 'href':
          attr = el.getAttribute('href', 2);
          break;
        default:
          attr = el[key] != null ? el[key] : el.getAttribute(key);
          break;
      }
      return attr != null && op(attr + '', val);
    };
  },
  ":first-child": function(el) {
    return !prev(el) && el.parentNode.nodeType === 1;
  },
  ":last-child": function(el) {
    return !next(el) && el.parentNode.nodeType === 1;
  },
  ":only-child": function(el) {
    return (!prev(el) && !next(el)) && el.parentNode.nodeType === 1;
  },
  ":nth-child": function(param) {
    return nth(param, function() {
      return true;
    });
  },
  ":root": function(el) {
    return el.ownerDocument.documentElement === el;
  },
  ":empty": function(el) {
    return !el.firstChild;
  },
  ":not": function(sel) {
    var test = compile(sel);
    return function(el) {
      return !test(el);
    };
  },
  ":first-of-type": function(el) {
    if (el.parentNode.nodeType !== 1) return;
    var type = el.nodeName;
    while ((el = prev(el))) {
      if (el.nodeName === type) return;
    }
    return true;
  },
  ":last-of-type": function(el) {
    if (el.parentNode.nodeType !== 1) return;
    var type = el.nodeName;
    while ((el = next(el))) {
      if (el.nodeName === type) return;
    }
    return true;
  },
  ":only-of-type": function(el) {
    return selectors[':first-of-type'](el) && selectors[':last-of-type'](el);
  },
  ":nth-of-type": function(param) {
    return nth(param, function(rel, el) {
      return rel.nodeName === el.nodeName;
    });
  },
  ":checked": function(el) {
    return !!(el.checked || el.selected);
  },
  ":indeterminate": function(el) {
    return !selectors[':checked'](el);
  },
  ":enabled": function(el) {
    return !el.disabled;
  },
  ":disabled": function(el) {
    return !!el.disabled;
  },
  ":target": function(el) {
    return el.id === window.location.hash.substring(1);
  },
  ":focus": function(el) {
    return el === el.ownerDocument.activeElement;
  },
  ":matches": function(sel) {
    var test = compile(sel);
    return function(el) {
      return test(el);
    };
  },
  ":nth-match": function(param) {
    var args = param.split(/\s*,\s*/);
    var p = args.pop()
    var test = compile(args.join(','));

    return nth(p, test);
  }
};

/**
 * Attribute Operators
 */

var operators = {
  "-": function() {
    return true;
  },
  "=": function(attr, val) {
    return attr === val;
  },
  "*=": function(attr, val) {
    return attr.indexOf(val) !== -1;
  },
  "~=": function(attr, val) {
    var i = attr.indexOf(val);
    var f;
    var l;

    if (i === -1) return;
    f = attr[i - 1];
    l = attr[i + val.length];

    return (f === ' ' && !l) || (!f && l === ' ') || (!f && !l);
  },
  "|=": function(attr, val) {
    var i = attr.indexOf(val);
    var l;

    if (i !== 0) return;
    l = attr[i + val.length];

    return l === '-' || !l;
  },
  "^=": function(attr, val) {
    return attr.indexOf(val) === 0;
  },
  "$=": function(attr, val) {
    return attr.indexOf(val) + val.length === attr.length;
  }
};

/**
 * Combinator Logic
 */

var combinators = {
  " ": function(test) {
    return function(el) {
      while ((el = el.parentNode)) {
        if (test(el)) return el;
      }
    };
  },
  ">": function(test) {
    return function(el) {
      return test(el = el.parentNode) && el;
    };
  },
  "+": function(test) {
    return function(el) {
      return test(el = prev(el)) && el;
    };
  },
  "~": function(test) {
    return function(el) {
      while ((el = prev(el))) {
        if (test(el)) return el;
      }
    };
  },
  "noop": function(test) {
    return function(el) {
      return test(el) && el;
    };
  }
};

/**
 * Parsing
 */

var parse = function(sel) {
  if (sel.length > 1) {
    var func = [];
    var i = 0;
    var l = sel.length;

    for (; i < l; i++) {
      func.push(parse.string(sel[i]));
    }

    l = func.length;
    return function(el) {
      for (i = 0; i < l; i++) {
        if (!func[i](el)) return;
      }
      return true;
    };
  }
  // optimization: shortcut
  return sel[0] === '*' ? selectors['*'] : selectors.type(sel[0]);
};

parse.string = function(sel) {
  var cap, param;
  switch (sel[0]) {
    case '.': return selectors.attr('class', '~=', sel.substring(1));
    case '#': return selectors.attr('id', '=', sel.substring(1));
    case '[': cap = /^\[([\w-]+)(?:([^\w]?=)([^\]]+))?\]/.exec(sel);
              return selectors.attr(cap[1], cap[2] || '-', unquote(cap[3]));
    case ':': cap = /^(:[\w-]+)\(([^)]+)\)/.exec(sel);
              if (cap) sel = cap[1], param = unquote(cap[2]);
              return param ? selectors[sel](param) : selectors[sel];
    case '*': return selectors['*'];
    default:  return selectors.type(sel);
  }
};

// parse and compile the selector
// into a single filter function
function raw(sel) {
  var filter = [];
  var comb = combinators.noop;
  var qname;
  var cap;
  var op;
  var len;

  sel = sel.replace(/(^|\s)(:|\[|\.|#)/g, '$1*$2');

  while (cap = /\s*((?:\w+|\*)(?:[.#:][^\s]+|\[[^\]]+\])*)\s*$/.exec(sel)) {
    len = sel.length - cap[0].length;
    cap = cap[1].split(/(?=[\[:.#])/);
    if (!qname) qname = cap[0];
    filter.push(comb(parse(cap)));
    if (len) {
      op = sel[len - 1];
      comb = combinators[op] || combinators[op = ' '];
      sel = sel.substring(0, op !== ' ' ? --len : len);
    }
    else {
      break;
    }
  }

  filter = compile.make(filter);
  filter.qname = qname;

  return filter;
}

var cache = {};
function compile(sel) {
  return cache[sel] || (cache[sel] = raw(sel));
}

compile.make = function(func) {
  return function(el) {
    var i = 0, next;
    while ((next = func[i++])) {
      if (!(el = next(el))) return;
    }
    return true;
  };
};

/**
 * Selection
 */

function select(sel, context) {
  var results = [];
  var i = 0;
  var scope;
  var el;
  var k;

  if (~sel.indexOf(',')) {
    var group = sel.split(/,\s*(?![^\[]*["'])/);


    while ((sel = group[i++])) {
      scope = select(sel, context);
      k = 0;
      while ((el = scope[k++])) {
        if (!~results.indexOf(el)) {
          results.push(el);
        }
      }
    }

    return results;
  }

  var test = compile(sel);
  scope = context.getElementsByTagName(test.qname);
  i = 0;

  while ((el = scope[i++])) {
    if (test(el)) results.push(el);
  }

  return results;
}


/**
 * Expose
 */

module.exports = exports = function(sel, context) {
  if (!~sel.indexOf(' ')) {
    if (sel[0] === '#' && /^#\w+$/.test(sel)) {
      return [context.getElementById(sel.substring(1))];
    }
    if (sel[0] === '.' && /^\.\w+$/.test(sel)) {
      return context.getElementsByClassName(sel.substring(1));
    }
    if (/^\w+$/.test(sel)) {
      return context.getElementsByTagName(sel);
    }
  }
  return select(sel, context);
};

exports.selectors = selectors;
exports.operators = operators;
exports.combinators = combinators;

exports.matches = function(el, sel) {
  return !!compile(sel)(el);
};


