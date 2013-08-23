Meteor.Table = function(tableName, options) {
  var self = this;
  if (! (self instanceof Meteor.Table)) {
    throw new Error('use "new" to construct a Meteor.Table');
  }
  options = _.extend({
    connection: undefined,
    _driver: undefined
  }, options);
  self.map = {};
  // Add table to overall map for easy retrieval
  self.map[tableName] = self;

  self._makeNewID = function () {
    return Random.id();
  };

  self._connection = tableName && (options.connection ||
                                  (Meteor.isClient ?
                                  Meteor.default_connection : Meteor.default_server));
  if (!options._driver) {
    if (tableName && self._connection === Meteor.default_server && Meteor._RemoteTableDriver) {
      options._driver = Meteor._RemoteTableDriver;
    } else {
      options._driver = Meteor._LocalTableDriver;
    }
  }
  self._table = options._driver.open(tableName);
  if (Meteor.isServer) {
    Meteor._RemoteTableDriver.rethink._createTable(tableName);
  }
  self._tableName = tableName;
  self._defineMutationMethods();
};

_.extend(Meteor.Table.prototype, {
  find: function(string, callback) {
    var self = this;
    return self._table.find();
  }
});

//TODO:: add functionality for other functions such as update / remove
_.each(["insert"], function(name) {
  Meteor.Table.prototype[name] = function (/* arguments */) {
    var self = this;
    var args = _.toArray(arguments);
    var callback;
    var ret;
    if (Meteor.isServer) {
      console.log('im the server and im the insert function in Meteor.Table"s prototype');
    }
    if (Meteor.isClient) {
      console.log('im the client and im the insert function in Meteor.Table"s prototype');
    }
    if (args.length && args[args.length - 1] instanceof Function) {
      callback = args.pop();
    }

    if (Meteor.isClient && !callback) {
      // (from Meteor -->) Client can't block, so it can't report errors by exception,
      // only by callback. If they forget the callback, give them a
      // default one that logs the error, so they aren't totally
      // baffled if their writes don't work because their database is
      // down.
      callback = function (err) {
        if (err) {
          Meteor._debug(name + " failed: " + (err.reason || err.stack));
        }
      };
    }
    if (name === "insert") {
      if (!args.length) {
        throw new Error("insert requires an argument!");
      }
      // Meteor wants us to generate an ID
      // first make a shallow copy of the document
      args[0] = _.extend({}, args[0]);
      if ('_id' in args[0]) {
        ret = args[0]._id;
        if (!(typeof ret === 'string' || ret instanceof Meteor.Collection.ObjectID)) {
          throw new Error("Meteor requires document _id fields to be strings or ObjectIDs");
        }
      } else {
          ret = args[0]._id = self._makeNewID();
      }
    } else {
      args[0] = Meteor.Collection._rewriteSelector(args[0]);
    }

    // if we are the local collection
    if (self._connection && self._connection !== Meteor.default_server) {
      var enclosing = Meteor._CurrentInvocation.get();
      var alreadyInSimulation = enclosing && enclosing.isSimulation;
      if (!alreadyInSimulation && name !== "insert") {
        throwIfSelectorIsNotId(args[0], name);
      }
      // there should always be a callback
      if (callback) {
        // RPC call
        self._connection.apply(self._prefix + name, args, function(error, result) {
          callback(error, !error && ret);
        });
      } else {
        self._connection.apply(self._prefix + name, args);
      }

    } else {
      try {
        self._table[name].apply(self._table, args);
      } catch (error) {
        if (callback) {
          callback(error);
          return null;
        }
        throw error;
      }
      // and on success, return *ret*, not the connection's return value
      callback && callback(null, ret);
    }

    // for both sync and async, unless we threw an exception, return ret
    // (which is the new doc ID for insert, and otherwise undefined);
    return ret;
  };
});

/// Notes from Meteor -->
///
/// Remote methods and access control.
///

// Restrict default mutators on table. allow() and deny() take the
// same options:
//
// options.insert {Function(userId, doc)}
//   return true to allow/deny adding this document
//
// options.update {Function(userId, docs, fields, modifier)}
//   return true to allow/deny updating these documents.
//   `fields` is passed as an array of fields that are to be modified
//
// options.remove {Function(userId, docs)}
//   return true to allow/deny removing these documents
//
// options.fetch {Array}
//   Fields to fetch for these validators. If any call to allow or deny
//   does not have this option then all fields are loaded.
//
// allow and deny can be called multiple times. The validators are
// evaluated as follows:
// - If neither deny() nor allow() has been called on the collection,
//   then the request is allowed if and only if the "insecure" smart
//   package is in use.
// - Otherwise, if any deny() function returns true, the request is denied.
// - Otherwise, if any allow() function returns true, the request is allowed.
// - Otherwise, the request is denied.
//
// Meteor may call your deny() and allow() functions in any order, and may not
// call all of them if it is able to make a decision without calling them all
// (so don't include side effects).

(function() {
  var addValidator = function(allowOrDeny, options) {
    // validate keys
    var VALID_KEYS = ['insert', 'update', 'remove', 'fetch', 'transform'];
    _.each(_.keys(options), function(key) {
      if (!_.contains(VALID_KEYS, key)) {
        throw new Error(allowOrDeny + ": Invalid key: " + key);
      }
    });

    var self = this;
    self._restricted = true;
    _.each(['insert', 'update', 'remove'], function (name) {
      if (options[name]) {
        if (!(options[name] instanceof Function)) {
          throw new Error(allowOrDeny + ": Value for `" + name + "` must be a function");
        }
        if (self._transform) {
          options[name].transform = self._transform;
        }
        if (options.transform) {
          options[name].transform = Deps._makeNonreactive(options.transform);
        }
        self._validators[name][allowOrDeny].push(options[name]);
      }
    });

    // Only update the fetch fields if we're passed things that affect
    // fetching. This way allow({}) and allow({insert: f}) don't result in
    // setting fetchAllFields
    if (options.update || options.remove || options.fetch) {
      if (options.fetch && !(options.fetch instanceof Array)) {
        throw new Error(allowOrDeny + ": Value for `fetch` must be an array");
      }
      self._updateFetch(options.fetch);
    }
  };

  Meteor.Table.prototype.allow = function(options) {
    addValidator.call(this, 'allow', options);
  };
  Meteor.Table.prototype.deny = function(options) {
    addValidator.call(this, 'deny', options);
  };
})();

Meteor.Table.prototype._isInsecure = function() {
  return !!this._insecure;
};

Meteor.Table.prototype._defineMutationMethods = function() {
  var self = this;
  // set to true once we call any allow or deny methods. If true, use
  // allow/deny semantics. If false, use insecure mode semantics.
  self._restricted = false;
  // Insecure mode (default to allowing writes). Defaults to 'undefined'
  // which means use the global Meteor.Collection.insecure.  This
  // property can be overriden by tests or packages wishing to change
  // insecure mode behavior of their collections.
  self._insecure = true;

  self._validators = {
    insert: {allow: [], deny: []},
    update: {allow: [], deny: []},
    remove: {allow: [], deny: []}
  };
  if (!self._tableName) {
    return; //anonymous collection
  }
  self._prefix = '/rethink/' + self._tableName + '/';
  //and here we go -- mutation methods
  if (self._connection) {
    var m = {};
    _.each(['insert', 'update', 'remove'], function (method) {
      m[self._prefix + method] = function (/* ... */) {
        try {
          if (this.isSimulation) {
            // Because this is a client simulation, you can do any mutation
            // (even with a complex selector)
            self._table[method].apply(
              self._table, _.toArray(arguments));
            return;
          }
          // This is the server receiving a method call from the client.
          // Meteor doesn't allow arbitrary selectors in mutations from the client:
          // only single-ID selectors.
          if (method !== 'insert') {
            throwIfSelectorIsNotId(arguments[0], method);
          }
          if (self._restricted) {
            // short circuit if there is no way it will pass
            if (self._validators[method].allow.length === 0) {
              throw new Meteor.Error(
                403, "Access denied. No allow validators set on restricted " +
                  "collection for method '" + method + "'.");
            }

            var validatedMathodName =
                  '_validated' + method.charAt(0).toUpperCase() + method.slice(1);
            var argsWithUserId = [this.userId].concat(_.toArray(arguments));
            // debugger;
            self[validatedMathodName].apply(self, argsWithUserId);
          } else if (self._isInsecure()) {
            // In insecure mode, allow any mutation (with a simple selector?!?!).
            // TODO:: this is going to have to be changed...
            self._table[method].apply(
              self._table, _.toArray(arguments));
          } else {
            // In secure mode, if we haven't called allow or deny then nothing
            // is permitted.
            throw new Meteor.Error(403, "Access denied");
          }
        } catch (error) {
          if (error.name === 'RethinkError' || error.name === 'MinirethinkError') {
            throw new Meteor.Error(409, error.toString());
          } else {
            throw error;
          }
        }
      };
    });
    if (Meteor.isClient || self._connection === Meteor.default_server) {
      self._connection.methods(m);
    }
  }
};

Meteor.Table.prototype._validatedInsert = function(userId, doc) {
  var self = this;

  // call user validators.
  // Any deny returns true means denied
  if (_.any(self._validators.insert.deny, function(validator) {
    return validator(userId, docToValidate(validator, doc));
  })) {
    throw new Meteor.Error(403, "Acccess denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.insert.allow, function(validator) {
    return !validator(userId, docToValidate(validator, doc));
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  self._table.insert.call(self._table, doc);
};