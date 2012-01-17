function Location(window, href) {
    this._window = window;
    this._href = href;
}

Location.prototype = Object.create(URLDecompositionAttributes.prototype, {
    _idlName: constant("Location"),
    constructor: constant(Location),
    // The concrete methods that the superclass needs
    getInput: constant(function() { return this.href; }),
    setOutput: constant(function(v) { this.href = v; }),

    // Special behavior when href is set
    href: attribute(
        function() { return this._href; },
        function(v) { this.assign(v) }
    ),

    assign: constant(function(url) {
        // Resolve the new url against the current one
        // XXX:
        // This is not actually correct. It should be resolved against
        // the URL of the document of the script. For now, though, I only
        // support a single window and there is only one base url.
        // So this is good enough for now.
        var current = new URL(this._href);
        var newurl = current.resolve(url);
        var self = this; // for the XHR callback below

        // Save the new url
        this._href = newurl;

        // Start loading the new document!
        // XXX
        // This is just something hacked together.
        // The real algorithm is: http://www.whatwg.org/specs/web-apps/current-work/multipage/history.html#navigate
        var xhr = new XMLHttpRequest();
        xhr.open("GET", newurl);
        xhr.send();
        xhr.onload = function() {
            var olddoc = self._window.document;
            var parser = new HTMLParser(newurl);
            var newdoc = unwrap(parser.document());
            newdoc.mutationHandler = olddoc.mutationHandler;

            // Get rid of any current content in the old doc
            // XXX
            // Should we have a special mutation event that means
            // discard the entire document because we're loading a new one?
            while(olddoc.hasChildNodes()) olddoc.removeChild(olddoc.firstChild);

            // Make the new document the current document in the window
            self._window.document = newdoc;
            newdoc.defaultView = self._window;

            // And parse the new file
            parser.parse(xhr.responseText, true);
        };

    }),

    replace: constant(function(url) {
        // XXX
        // Since we aren't tracking history yet, replace is the same as assign
        this.assign(url);
    }),

    reload: constant(function() {
        // XXX:
        // Actually, the spec is a lot more complicated than this
        this.assign(this.href);
    }),

    // XXX: Does WebIDL allow the wrapper class to have its own toString
    // method? Or do I have to create a proxy just to fake out the string
    // conversion?
    // In FF, document.location.__proto__.hasOwnProperty("toString") is true
    toString: constant(function() {
        return this.href;
    }),
});
