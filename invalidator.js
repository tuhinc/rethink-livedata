var util = Npm.require('util');
var EventEmitter = Npm.require('events').EventEmitter;

function Invalidator(table) {
  var self = this;

  self._table = table;
  self._cursors = [];
  self._selectors = [];
}

Invalidator.prototype = Object.create(EventEmitter);

Invalidator.prototype.addCursor = function addCursor(cursor) {
  var self = this;

  var index = self._cursors.indexOf(cursor);
  if(index < 0) {
    self._cursors.push(cursor);
  }

  //add to correct selector
  // var added = false;

  // for(var lc=0; lc<self._selectors.length; lc++) {
  //   var selectorInfo = self._selectors[lc];
  //   if(Meteor.deepEqual(selectorInfo.selector, cursor._selector)) {
  //     selectorInfo.cursors.push(cursor);
  //     added = true;
  //     break;
  //   }
  // }

  // if(!added) {
  //   self._selectors.push({
  //     selector: cursor._selector,
  //     cursors: [cursor]
  //   });
  // }
};

// this needs to first test for a selector
Invalidator.prototype.insert = function(doc) {
  this._cursors.forEach(function(cursor) {
      cursor._added(doc);
  });
};

_.extend(Meteor, {
  Invalidator: Invalidator
});