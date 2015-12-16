// http://www.w3.org/TR/html-markup/syntax.html#syntax-elements
// Tag names are used within element start tags and end tags to give the
// element’s name. HTML elements all have names that only use characters in the
// range 0–9, a–z, and A–Z.

exports.isValidEltName = function(s) {
  return /^[A-Za-z0-9]+$/.test(s);
};

// http://www.w3.org/TR/html-markup/syntax.html#syntax-attributes
// Attribute names must consist of one or more characters other than the space
// characters, U+0000 NULL, """, "'", ">", "/", "=", the control characters,
// and any characters that are not defined by Unicode.
// Control characters are marked Cc in:
//   ftp://ftp.unicode.org/Public/UNIDATA/UnicodeData.txt

exports.isValidAttrName = function(s) {
  return /^[^ "'>/=\u0000-\u001F\u007F-\u009F]+$/.test(s);
};
