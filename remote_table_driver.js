Meteor._RemoteTableDriver = function(rethink_url) {
  var self = this;
  self.rethink = new _Rethink(rethink_url);
};

_.extend(Meteor._RemoteTableDriver.prototype, {
  open: function(name) {
    var self = this;
    var ret = {};
    _.each(
      ['insert', 'find'],
      function(r) {
        ret[r] = _.bind(self.rethink[r], self.rethink, name);
      });
    return ret;
  }
});

Meteor._RemoteTableDriver = new Meteor._RemoteTableDriver();
