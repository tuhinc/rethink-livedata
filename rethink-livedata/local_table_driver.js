Meteor._LocalTableDriver = function () {
  var self = this;
  self.tables = {};
};

_.extend(Meteor._LocalTableDriver.prototype, {
  open: function (name) {
    var self = this;
    if (!name)
      return new LocalTable();
    if (!(name in self.tables))
      self.tables[name] = new LocalTable();
    return self.tables[name];
  }
});

// singleton
Meteor._LocalTableDriver = new Meteor._LocalTableDriver;
