"use strict";
var Node = require('./Node');
var Element = require('./Element');
var CSSStyleDeclaration = require('./CSSStyleDeclaration');
var utils = require('./utils');
var URLUtils = require('./URLUtils');
var defineElement = require('./defineElement');

var htmlElements = exports.elements = {};
var htmlNameToImpl = Object.create(null);

exports.createElement = function(doc, localName, prefix) {
  var impl = htmlNameToImpl[localName] || HTMLUnknownElement;
  return new impl(doc, localName, prefix);
};

function define(spec) {
  return defineElement(spec, HTMLElement, htmlElements, htmlNameToImpl);
}

function URL(attr) {
  return {
    get: function() {
      var v = this._getattr(attr);
      return this.doc._resolve(v);
    },
    set: function(value) {
      this._setattr(attr, value);
    }
  };
}

// XXX: the default value for tabIndex should be 0 if the element is
// focusable and -1 if it is not.  But the full definition of focusable
// is actually hard to compute, so for now, I'll follow Firefox and
// just base the default value on the type of the element.
var focusableElements = {
  "A":true, "LINK":true, "BUTTON":true, "INPUT":true,
  "SELECT":true, "TEXTAREA":true, "COMMAND":true
};

var HTMLElement = exports.HTMLElement = define({
  superclass: Element,
  ctor: function HTMLElement(doc, localName, prefix) {
    Element.call(this, doc, localName, utils.NAMESPACE.HTML, prefix);
  },
  props: {
    innerHTML: {
      get: function() {
        return this.serialize();
      },
      set: function(v) {
        var parser = this.ownerDocument.implementation.mozHTMLParser(
          this.ownerDocument._address,
          this);
        parser.parse(v, true);
        var tmpdoc = parser.document();
        var root = tmpdoc.firstChild;
        var target = (this instanceof htmlNameToImpl.template) ?
            this.content : this;

        // Remove any existing children of this node
        while(target.hasChildNodes())
          target.removeChild(target.firstChild);

        // Now copy newly parsed children from the root to this node
        target.doc.adoptNode(root);
        while(root.hasChildNodes()) {
          target.appendChild(root.firstChild);
        }
      }
    },
    style: { get: function() {
      if (!this._style)
        this._style = new CSSStyleDeclaration(this);
      return this._style;
    }},

    click: { value: function() {
      if (this._click_in_progress) return;
      this._click_in_progress = true;
      try {
        if (this._pre_click_activation_steps)
          this._pre_click_activation_steps();

        var event = this.ownerDocument.createEvent("MouseEvent");
        event.initMouseEvent("click", true, true,
          this.ownerDocument.defaultView, 1,
          0, 0, 0, 0,
          // These 4 should be initialized with
          // the actually current keyboard state
          // somehow...
          false, false, false, false,
          0, null
        );

        // Dispatch this as an untrusted event since it is synthetic
        var success = this.dispatchEvent(event);

        if (success) {
          if (this._post_click_activation_steps)
            this._post_click_activation_steps(event);
        }
        else {
          if (this._cancelled_activation_steps)
            this._cancelled_activation_steps();
        }
      }
      finally {
        this._click_in_progress = false;
      }
    }}
  },
  attributes: {
    title: String,
    lang: String,
    dir: {type: ["ltr", "rtl", "auto"], implied: true},
    accessKey: String,
    hidden: Boolean,
    tabIndex: {type: Number, default: function() {
      if (this.tagName in focusableElements ||
        this.contentEditable)
        return 0;
      else
        return -1;
    }}
  },
  events: [
    "abort", "canplay", "canplaythrough", "change", "click", "contextmenu",
    "cuechange", "dblclick", "drag", "dragend", "dragenter", "dragleave",
    "dragover", "dragstart", "drop", "durationchange", "emptied", "ended",
    "input", "invalid", "keydown", "keypress", "keyup", "loadeddata",
    "loadedmetadata", "loadstart", "mousedown", "mousemove", "mouseout",
    "mouseover", "mouseup", "mousewheel", "pause", "play", "playing",
    "progress", "ratechange", "readystatechange", "reset", "seeked",
    "seeking", "select", "show", "stalled", "submit", "suspend",
    "timeupdate", "volumechange", "waiting",

    // These last 5 event types will be overriden by HTMLBodyElement
    "blur", "error", "focus", "load", "scroll"
  ]
});


// XXX: reflect contextmenu as contextMenu, with element type


// style: the spec doesn't call this a reflected attribute.
//   may want to handle it manually.

// contentEditable: enumerated, not clear if it is actually
// reflected or requires custom getter/setter. Not listed as
// "limited to known values".  Raises syntax_err on bad setting,
// so I think this is custom.

// contextmenu: content is element id, idl type is an element
// draggable: boolean, but not a reflected attribute
// dropzone: reflected SettableTokenList, experimental, so don't
//   implement it right away.

// data-* attributes: need special handling in setAttribute?
// Or maybe that isn't necessary. Can I just scan the attribute list
// when building the dataset?  Liveness and caching issues?

// microdata attributes: many are simple reflected attributes, but
// I'm not going to implement this now.


var HTMLUnknownElement = define({
  ctor: function HTMLUnknownElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});


var formAssociatedProps = {
  // See http://www.w3.org/TR/html5/association-of-controls-and-forms.html#form-owner
  form: { get: function() {
    return this._form;
  }}
};

define({
  tag: 'a',
  ctor: function HTMLAnchorElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    _post_click_activation_steps: { value: function(e) {
      if (this.href) {
        // Follow the link
        // XXX: this is just a quick hack
        // XXX: the HTML spec probably requires more than this
        this.ownerDocument.defaultView.location = this.href;
      }
    }},
    blur: { value: function() {}},
    focus: { value: function() {}}
  },
  attributes: {
    href: URL,
    ping: String,
    download: String,
    target: String,
    rel: String,
    media: String,
    hreflang: String,
    type: String
  }
});
URLUtils._inherit(htmlNameToImpl.a.prototype);

define({
  tag: 'area',
  ctor: function HTMLAreaElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    alt: String,
    target: String,
    download: String,
    rel: String,
    media: String,
    href: URL,
    hreflang: String,
    type: String,
    shape: String,
    coords: String
    // XXX: also reflect relList
  }
});

define({
  tag: 'br',
  ctor: function HTMLBRElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'base',
  ctor: function HTMLBaseElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    "target": String
  }
});


define({
  tag: 'body',
  ctor: function HTMLBodyElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  // Certain event handler attributes on a <body> tag actually set
  // handlers for the window rather than just that element.  Define
  // getters and setters for those here.  Note that some of these override
  // properties on HTMLElement.prototype.
  // XXX: If I add support for <frameset>, these have to go there, too
  // XXX
  // When the Window object is implemented, these attribute will have
  // to work with the same-named attributes on the Window.
  events: [
    "afterprint", "beforeprint", "beforeunload", "blur", "error",
    "focus","hashchange", "load", "message", "offline", "online",
    "pagehide", "pageshow","popstate","resize","scroll","storage","unload",
  ]
});

define({
  tag: 'button',
  ctor: function HTMLButtonElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    name: String,
    value: String,
    disabled: Boolean,
    autofocus: Boolean,
    type: ["submit", "reset", "button"],
    formTarget: String,
    formNoValidate: Boolean,
    formMethod: ["get", "post"],
    formEnctype: [
      "application/x-www-form-urlencoded", "multipart/form-data", "text/plain"
    ]
  }
});

define({
  tag: 'dl',
  ctor: function HTMLDListElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'datalist',
  ctor: function HTMLDataListElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'details',
  ctor: function HTMLDetailsElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    "open": Boolean
  }
});

define({
  tag: 'div',
  ctor: function HTMLDivElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'embed',
  ctor: function HTMLEmbedElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    src: URL,
    type: String,
    width: String,
    height: String
  }
});

define({
  tag: 'fieldset',
  ctor: function HTMLFieldSetElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    disabled: Boolean,
    name: String
  }
});

define({
  tag: 'form',
  ctor: function HTMLFormElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    action: String,
    autocomplete: ['on', 'off'],
    name: String,
    acceptCharset: {name: "accept-charset"},
    target: String,
    noValidate: Boolean,
    method: ["get", "post"],
    // Both enctype and encoding reflect the enctype content attribute
    enctype: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"],
    encoding: {name: 'enctype', type: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]}
  }
});

define({
  tag: 'hr',
  ctor: function HTMLHRElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'head',
  ctor: function HTMLHeadElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tags: ['h1','h2','h3','h4','h5','h6'],
  ctor: function HTMLHeadingElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'html',
  ctor: function HTMLHtmlElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'iframe',
  ctor: function HTMLIFrameElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
    var Window = require('./Window'); // Avoid circular dependencies.
    this._contentWindow = new Window();
  },
  props: {
    contentWindow: { get: function() {
      return this._contentWindow;
    } },
    contentDocument: { get: function() {
      return this.contentWindow.document;
    } },
  },
  attributes: {
    src: URL,
    srcdoc: String,
    name: String,
    width: String,
    height: String,
    // XXX: sandbox is a reflected settable token list
    seamless: Boolean,
    align: String,
    allowfullscreen: Boolean,
    frameBorder: String,
    longDesc: String,
    marginHeight: String,
    marginWidth: String,
    referrerPolicy: String,
    scrolling: String,
  }
});

define({
  tag: 'img',
  ctor: function HTMLImageElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    src: URL,
    alt: String,
    crossOrigin: String,
    useMap: String,
    isMap: Boolean,
    height: { type: Number, default: 0 },
    width: { type: Number, default: 0 }
  }
});

define({
  tag: 'input',
  ctor: function HTMLInputElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    form: formAssociatedProps.form,
    _post_click_activation_steps: { value: function(e) {
      if (this.type === 'checkbox') {
        this.checked = !this.checked;
      }
      else if (this.type === 'radio') {
        var group = this.form.getElementsByName(this.name);
        for (var i=group.length-1; i >= 0; i--) {
          var el = group[i];
          el.checked = (el === this);
        }
      }
    }},
  },
  attributes: {
    name: String,
    disabled: Boolean,
    autofocus: Boolean,
    accept: String,
    alt: String,
    max: String,
    min: String,
    pattern: String,
    placeholder: String,
    step: String,
    dirName: String,
    defaultValue: {name: 'value'},
    multiple: Boolean,
    required: Boolean,
    readOnly: Boolean,
    checked: Boolean,
    value: String,
    src: URL,
    defaultChecked: {name: 'checked', type: Boolean},
    size: {type: Number, default: 20, min: 1, setmin: 1},
    maxLength: {min: 0, setmin: 0},
    autocomplete: ["on", "off"],
    type: ["text", "hidden", "search", "tel", "url", "email", "password",
      "datetime", "date", "month", "week", "time", "datetime-local",
      "number", "range", "color", "checkbox", "radio", "file", "submit",
      "image", "reset", "button"
    ],
    formTarget: String,
    formNoValidate: Boolean,
    formMethod: ["get", "post"],
    formEnctype: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]
  }
});

define({
  tag: 'keygen',
  ctor: function HTMLKeygenElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    name: String,
    disabled: Boolean,
    autofocus: Boolean,
    challenge: String,
    keytype: ["rsa"]
  }
});

define({
  tag: 'li',
  ctor: function HTMLLIElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    value: {type: Number, default: 0},
  }
});

define({
  tag: 'label',
  ctor: function HTMLLabelElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    htmlFor: {name: 'for'}
  }
});

define({
  tag: 'legend',
  ctor: function HTMLLegendElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'link',
  ctor: function HTMLLinkElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    // XXX Reflect DOMSettableTokenList sizes also DOMTokenList relList
    href: URL,
    rel: String,
    media: String,
    hreflang: String,
    type: String
  }
});

define({
  tag: 'map',
  ctor: function HTMLMapElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    name: String
  }
});

define({
  tag: 'menu',
  ctor: function HTMLMenuElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    type: String,
    label: String
  }
});

define({
  tag: 'meta',
  ctor: function HTMLMetaElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    name: String,
    content: String,
    scheme: String,
    httpEquiv: {name: 'http-equiv', type: String}
  }
});

define({
  tag: 'meter',
  ctor: function HTMLMeterElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps
});

define({
  tags: ['ins', 'del'],
  ctor: function HTMLModElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    cite: String,
    dateTime: String
  }
});

define({
  tag: 'ol',
  ctor: function HTMLOListElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    // Utility function (see the start attribute default value). Returns
    // the number of <li> children of this element
    _numitems: { get: function() {
      var items = 0;
      this.childNodes.forEach(function(n) {
        if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "LI")
          items++;
      });
      return items;
    }}
  },
  attributes: {
    type: String,
    reversed: Boolean,
    start: {
      type: Number,
      default: function() {
       // The default value of the start attribute is 1 unless the list is
       // reversed. Then it is the # of li children
       if (this.reversed)
         return this._numitems;
       else
         return 1;
      }
    }
  }
});

define({
  tag: 'object',
  ctor: function HTMLObjectElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    data: String,
    type: String,
    name: String,
    useMap: String,
    typeMustMatch: Boolean,
    width: String,
    height: String
  }
});

define({
  tag: 'optgroup',
  ctor: function HTMLOptGroupElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    disabled: Boolean,
    label: String
  }
});

define({
  tag: 'option',
  ctor: function HTMLOptionElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    form: { get: function() {
      var p = this.parentNode;
      while (p && p.nodeType === Node.ELEMENT_NODE) {
        if (p.localName === 'select') return p.form;
        p = p.parentNode;
      }
    }}
  },
  attributes: {
    disabled: Boolean,
    defaultSelected: {name: 'selected', type: Boolean},
    label: String
  }
});

define({
  tag: 'output',
  ctor: function HTMLOutputElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    // XXX Reflect for/htmlFor as a settable token list
    name: String
  }
});

define({
  tag: 'p',
  ctor: function HTMLParagraphElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'param',
  ctor: function HTMLParamElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    name: String,
    value: String
  }
});

define({
  tag: 'pre',
  ctor: function HTMLPreElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'progress',
  ctor: function HTMLProgressElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    max: {type: Number, float: true, default: 1.0, min: 0}
  }
});

define({
  tags: ['q', 'blockquote'],
  ctor: function HTMLQuoteElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    cite: URL
  }
});

define({
  tag: 'script',
  ctor: function HTMLScriptElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    text: {
      get: function() {
        var s = "";
        for(var i = 0, n = this.childNodes.length; i < n; i++) {
          var child = this.childNodes[i];
          if (child.nodeType === Node.TEXT_NODE)
            s += child._data;
        }
        return s;
      },
      set: function(value) {
        this.removeChildren();
        if (value !== null && value !== "") {
          this.appendChild(this.ownerDocument.createTextNode(value));
        }
      }
    }
  },
  attributes: {
    src: URL,
    type: String,
    charset: String,
    defer: Boolean,
    async: Boolean
  }
});

define({
  tag: 'select',
  ctor: function HTMLSelectElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    form: formAssociatedProps.form,
    options: { get: function() {
      return this.getElementsByTagName('option');
    }}
  },
  attributes: {
    name: String,
    disabled: Boolean,
    autofocus: Boolean,
    multiple: Boolean,
    required: Boolean,
    size: {type: Number, default: 0}
  }
});

define({
  tag: 'source',
  ctor: function HTMLSourceElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    src: URL,
    type: String,
    media: String
  }
});

define({
  tag: 'span',
  ctor: function HTMLSpanElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'style',
  ctor: function HTMLStyleElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    media: String,
    type: String,
    scoped: Boolean
  }
});

define({
  tag: 'caption',
  ctor: function HTMLTableCaptionElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});


define({
  ctor: function HTMLTableCellElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    colSpan: {type: Number, default: 1, min: 1, setmin: 1},
    rowSpan: {type: Number, default: 1}
    //XXX Also reflect settable token list headers
  }
});

define({
  tags: ['col', 'colgroup'],
  ctor: function HTMLTableColElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    span: {type: Number, default: 1, min: 1, setmin: 1}
  }
});

define({
  tag: 'table',
  ctor: function HTMLTableElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    rows: { get: function() {
      return this.getElementsByTagName('tr');
    }}
  },
  attributes: {
    border: String
  }
});

define({
  tag: 'template',
  ctor: function HTMLTemplateElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
    this._contentFragment = doc._templateDoc.createDocumentFragment();
  },
  props: {
    content: { get: function() { return this._contentFragment; } },
    serialize: { value: function() { return this.content.serialize(); } }
  }
});

define({
  tag: 'tr',
  ctor: function HTMLTableRowElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    cells: { get: function() {
      return this.querySelectorAll('td,th');
    }}
  }
});

define({
  tags: ['thead', 'tfoot', 'tbody'],
  ctor: function HTMLTableSectionElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    rows: { get: function() {
      return this.getElementsByTagName('tr');
    }}
  }
});

define({
  tag: 'textarea',
  ctor: function HTMLTextAreaElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: formAssociatedProps,
  attributes: {
    name: String,
    disabled: Boolean,
    autofocus: Boolean,
    placeholder: String,
    wrap: String,
    dirName: String,
    required: Boolean,
    readOnly: Boolean,
    rows: {type: Number, default: 2, min: 1, setmin: 1},
    cols: {type: Number, default: 20, min: 1, setmin: 1},
    maxLength: {type: Number, min: 0, setmin: 0}
  }
});

define({
  tag: 'time',
  ctor: function HTMLTimeElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    dateTime: String,
    pubDate: Boolean
  }
});

define({
  tag: 'title',
  ctor: function HTMLTitleElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    text: { get: function() {
      return this.textContent;
    }}
  }
});

define({
  tag: 'track',
  ctor: function HTMLTrackElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    src: URL,
    srclang: String,
    label: String,
    default: Boolean,
    kind: ["subtitles", "captions", "descriptions", "chapters", "metadata"]
  }
});

define({
  tag: 'ul',
  ctor: function HTMLUListElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  ctor: function HTMLMediaElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    src: URL,
    crossOrigin: String,
    preload: ["metadata", "none", "auto", {value: "", alias: "auto"}],
    loop: Boolean,
    autoplay: Boolean,
    mediaGroup: String,
    controls: Boolean,
    defaultMuted: {name: "muted", type: Boolean}
  }
});

define({
  tag: 'audio',
  superclass: htmlElements.HTMLMediaElement,
  ctor: function HTMLAudioElement(doc, localName, prefix) {
    htmlElements.HTMLMediaElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'video',
  superclass: htmlElements.HTMLMediaElement,
  ctor: function HTMLVideoElement(doc, localName, prefix) {
    htmlElements.HTMLMediaElement.call(this, doc, localName, prefix);
  },
  attributes: {
    poster: String,
    width: {type: Number, min: 0, setmin: 0},
    height: {type: Number, min: 0, setmin: 0}
  }
});

define({
  tag: 'td',
  superclass: htmlElements.HTMLTableCellElement,
  ctor: function HTMLTableDataCellElement(doc, localName, prefix) {
    htmlElements.HTMLTableCellElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'th',
  superclass: htmlElements.HTMLTableCellElement,
  ctor: function HTMLTableHeaderCellElement(doc, localName, prefix) {
    htmlElements.HTMLTableCellElement.call(this, doc, localName, prefix);
  },
  attributes: {
    scope: ["", "row", "col", "rowgroup", "colgroup"]
  }
});

define({
  tag: 'frameset',
  ctor: function HTMLFrameSetElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'frame',
  ctor: function HTMLFrameElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  }
});

define({
  tag: 'canvas',
  ctor: function HTMLCanvasElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    getContext: { value: utils.nyi },
    probablySupportsContext: { value: utils.nyi },
    setContext: { value: utils.nyi },
    transferControlToProxy: { value: utils.nyi },
    toDataURL: { value: utils.nyi },
    toBlob: { value: utils.nyi }
  },
  attributes: {
    width: { type: Number, default: 0},
    height: { type: Number, default: 0}
  }
});

define({
  tag: 'dialog',
  ctor: function HTMLDialogElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  props: {
    show: { value: utils.nyi },
    showModal: { value: utils.nyi },
    close: { value: utils.nyi }
  },
  attributes: {
    open: Boolean,
    returnValue: String
  }
});

define({
  tag: 'menuitem',
  ctor: function HTMLMenuItemElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    type: String,
    label: String,
    icon: String,
    disabled: Boolean,
    checked: Boolean,
    radiogroup: String,
    default: Boolean
  }
});

define({
  tag: 'source',
  ctor: function HTMLSourceElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    srcset: String,
    sizes: String,
    media: String,
    src: String,
    type: String
  }
});

define({
  tag: 'track',
  ctor: function HTMLTrackElement(doc, localName, prefix) {
    HTMLElement.call(this, doc, localName, prefix);
  },
  attributes: {
    kind: String,
    src: String,
    srclang: String,
    label: String,
    default: Boolean
  },
  props: {
    NONE: { get: function() { return 0; } },
    LOADING: { get: function() { return 1; } },
    LOADED: { get: function() { return 2; } },
    ERROR: { get: function() { return 3; } },
    readyState: { get: utils.nyi },
    track: { get: utils.nyi }
  }
});

define({
  tags: [
    "abbr", "address", "article", "aside", "b", "bdi", "bdo",
    "cite", "code", "dd", "dfn", "dt", "em", "figcaption", "figure",
    "footer", "header", "hgroup", "i", "kbd", "main", "mark", "nav", "noscript",
    "rb", "rp", "rt", "rtc", "ruby", "s", "samp", "section", "small", "strong",
    "sub", "summary", "sup", "u", "var", "wbr"
  ]
});
