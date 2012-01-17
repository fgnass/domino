module.exports = NodeList;

function NodeList(a) {
  if (!a) a = [];
  a.item = function(i) {
    return this[i];
  };
  return a;
}
