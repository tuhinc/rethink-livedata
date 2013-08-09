var EventEmitter = Npm.require('events').EventEmitter;

function Invalidator() {
  this._cursors = {};
  this._collections = {};
  this.UPDATE_OPERATIONS = generateUpdateOperationsMap();

  function generateUpdateOperationsMap() {
    //return map of all possible operations
  }
}

Invalidator.prototype = Object.create(EventEmitter.prototype);
Invalidator.constructor = EventEmitter;

_.extend(Invalidator.prototype, {
  updateModifierToFields: function() {
    //
  }
});