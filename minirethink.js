// LocalTable: a set of documents that supports queries and modifiers

// Cursor: a specification for a particular subset of documents, w/
// a defined order, limit, and offset. create a Cursor with r.table(tablename).get(),

// LiveResultsSet: the return value of a live query.

LocalTable = function() {
  this.docs = {}; // _id -> document (also containing id)

  this._observeQueue = new Meteor._SynchronousQueue();

  this.next_qid = 1; // live query id generator

  // qid -> live query object. keys:
  //  ordered: bool. ordered queries have moved callbacks and callbacks
  //           take indices.
  //  results: array (ordered) or object (unordered) of current results
  //  results_snapshot: snapshot of results. null if not paused.
  //  cursor: Cursor object for the query.
  //  selector_f, sort_f, (callbacks): functions
  this.queries = {};

  this.chain = [];

  // null if not saving originals; a map from id to original document value if
  // saving originals. See comments before saveOriginals().
  this._savedOriginals = null;

  // True when observers are paused and we should not send callbacks.
  this.paused = false;
};

LocalTable._applyChanges = function (doc, changeFields) {
  _.each(changeFields, function (value, key) {
    if (value === undefined) {
      delete doc[key];
    } else {
      doc[key] = value;
    }
  });
};

Minirethink = function() {
  var self = this;
  self.queries = [];
};

// TODO:: This currently doesn't work if you input a string
// you need to input the actual table
Minirethink.prototype.table = function(tableName) {
  var self = this;
  var table = Meteor._LocalTableDriver.tables[tableName];
  var selectTable = function(table) {

    return new LocalTable.Cursor(table);
  };
  self.queries.push([selectTable, [table]]);
  return self;
};

Minirethink.prototype.get = function(string) {
  var self = this;
  var getSingleRow = function(string) {
    var results = [];
    this.forEach(function(doc) {
      if (doc.name === string) {
        results.push(doc);
      }
    });
    return results;
  };
  self.queries.push([getSingleRow, arguments]);
  return self;
};

Minirethink.prototype.clearQueries = function() {
  var self = this;
  self.queries = [];
  return self;
};

Minirethink.prototype.run = function(callback) {
  var self = this;
  var results;
  var args;
  for (var i = 0; i < self.queries.length; i++) {
    if (i === 0) {
      var query = self.queries[0][0];
      args = self.queries[0][1];
      results = query.apply(window, args);
      if (self.queries.length === 1) {
        self.clearQueries();
        return results;
      }
    } else if (self.queries[i+1]) {
      args = self.queries[i+1][1];
      results = self.queries[i+1][0].apply(results, args);
    } else {
      args = self.queries[i][1];
      results = self.queries[i][0].apply(results, args);
      if (callback) {
        self.clearQueries();
        return callback(results);
      } else {
        self.clearQueries();
        return results;
      }
    }
  }
};

LocalTable.Cursor = function (table, name) {
  var self = this;
  var doc;

  self.table = table;

  self.db_objects = null;
  self.cursor_pos = 0;

  if (typeof Deps !== "undefined") {
    self.reactive = true;
  }
};

LocalTable.Cursor.prototype.rewind = function () {
  var self = this;
  self.db_objects = null;
  self.cursor_pos = 0;
};

LocalTable.Cursor.prototype.forEach = function (callback, context) {
  var self = this;
  var doc;
  if (self.db_objects === null) {
    self.db_objects = self._getRawObjects(true);
  }
  if (self.reactive) {
    self._depend({
      addedBefore: true,
      removed: true,
      changed: true,
      movedBefore: true
    });
  }

  while (self.cursor_pos < _.keys(self.db_objects).length) {
    var elt = EJSON.clone(self.db_objects[self.cursor_pos++]);
    if (!context) {
      callback(elt);
    } else {
      callback.call(context, elt);
    }
  }
};

LocalTable.Cursor.prototype.getTransform = function() {
  var self = this;
  return self._transform;
}

LocalTable.Cursor.prototype.fetch = function () {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(doc);
  });
  return res;
};

// TODO:: implement fetch

// Minirethink.prototype.fetch = function () {
//   var self = this;
//   var getDocuments = function() {
//     var res = [];
//     self.forEach(function (doc) {
//       res.push(doc);
//     });
//     return res;
//   };
//   self.queries.push([getDocuments, []]);
//   return self;
// };

// handle that comes back from observe.
LocalTable.LiveResultsSet = function () {};

_.extend(LocalTable.Cursor.prototype, {
  observe: function (options) {
    var self = this;
    return LocalTable._observeFromObserveChanges(self, options);
  },
  observeChanges: function (options) {
    var self = this;

    var query = {
      selector_f: self.selector_f,
      results_snapshot: null,
      cursor: self,
      observeChanges: options.observeChanges
    };
    var qid;


    if (self.reactive) {
      qid = self.table.next_qid++;
      self.table.queries[qid] = query;
    }
    query.results = self._getRawObjects();
    if (self.table.paused) {
      query.results_snapshot = {};
    }

    // wrap callbacks we were passed. callbacks only fire when not paused
    // and are never undefined (except that query.moved is undefined for
    // unordered callbacks).

    // furthermore, callbacks enqueue until the operation we're working on
    // is done.
    var wrapCallback = function (f) {
      if (!f) {
        return function () {};
      }
      return function (/* args */) {
        var context = this;
        var args = arguments;
        if (!self.table.paused) {
          self.table._observeQueue.queueTask(function() {
            f.apply(context, args);
          });
        }
      };
    };

    query.added = wrapCallback(options.added);
    query.changed = wrapCallback(options.changed);
    query.removed = wrapCallback(options.removed);

    if (!options._suppress_initial && !self.table.paused) {
      _.each(query.results, function (doc, i) {
        var fields = EJSON.clone(doc);
        delete fields._id;
        if (ordered)
          query.addedBefore(doc._id, fields, null);
        query.added(doc._id, fields);
      });
    }

    var handle = new LocalTable.LiveResultsSet();
      _.extend(handle, {
        collection: self.collection,
        stop: function() {
          if (self.reactive) {
            delete self.table.queries[qid];
          }
        }
      });

    if (self.reactive && Deps.active) {
      Deps.onInvalidate(function () {
        handle.stop();
      });
    }
    // run the observe callbacks resulting from the initial contents
    // before we leave the observe.
    self.table._observeQueue.drain();

    return handle;
  }
});

LocalTable.Cursor.prototype._getRawObjects = function () {
  var self = this;
  var results = [];

  for (var id in self.table.docs) {
    var doc = self.table.docs[id];
    results.push(doc);
  }

  return results;
};


LocalTable.Cursor.prototype._depend = function (changers) {
  var self = this;

  if (Deps.active) {
    var v = new Deps.Dependency();
    v.depend();
    var notifyChange = _.bind(v.changed, v);

    var options = {_suppress_initial: true};
    _.each(['added', 'changed', 'removed', 'addedBefore', 'movedBefore'],
      function (fnName) {
        if (changers[fnName]) {
          options[fnName] = notifyChange;
        }
      });

    // observeChanges will stop() when this computation is invalidated
    self.observeChanges(options);
  }
};

LocalTable.prototype.insert = function(doc) {
  var self = this;
  if (!_.has(doc, '_id')) {
    doc._id = LocalTable._useOID ? new LocalTable._ObjectID() : Random.id();
  }
  // there should be no problem using Meteor's minimongo helper function here
  var id = LocalCollection._idStringify(doc._id);
  if (_.has(self.docs, doc._id)) {
    throw new LocalCollection.MinimongoError("Duplicate _id '" + doc._id + "'");
  }

  // Phony insert
  self.docs[id] = doc;

  var queriesToRecompute = [];
  // trigger only live queries that match

  for (var qid in self.queries) {
    var query = self.queries[qid];
    if (true) {
      if (query.cursor.skip || query.cursor.limit) {
        queriesToRecompute.push(qid);
      } else {
        LocalTable._insertInResults(query, doc);
      }
    }
  }
  _.each(queriesToRecompute, function (qid) {
    if (self.queries[qid])
      LocalCollection._recomputeResults(self.queries[qid]);
  });
  self._observeQueue.drain();
  return doc._id;
};

// find returns a cursor. It does not immediately access the database
// or return documents. Cursors provide fetch to return all matching
// documents, map and forEach to iterate over all matching documents,
// and observe and observeChanges to register callbacks when the set of matching
// documents changes

// Cursors are a reactive data source. The first time you retrieve a cursor's
// documents with fetch, map, or forEach inside a reactive computation (eg a template
// or an autorun), Meteor will register a dependency on the underlying data.
// Any change to the collection that changes the documents in a cursor will trigger
// a recomputation.

LocalTable._insertInResults = function (query, doc) {
  // if dealing with ordered insertion it will be a bit more complicated
  var fields = EJSON.clone(doc);
  delete fields._id;
  query.added(doc._id, fields);
  query.results[LocalCollection._idStringify(doc._id)] = doc;
};

// borrowing some more Minimongo helper functions
LocalTable._diffQueryChanges = LocalCollection._diffQueryChanges;
LocalTable._recomputeResults = LocalCollection._recomputeResults;
LocalTable.prototype.pauseObservers = LocalCollection.prototype.pauseObservers;

LocalTable._observeFromObserveChanges = function (cursor, callbacks) {
  var transform = cursor.getTransform();
  if (!transform) {
    transform = function(doc) {
      return doc;
    };
  }
    if (callbacks.addedAt && callbacks.added)
    throw new Error("Please specify only one of added() and addedAt()");
  if (callbacks.changedAt && callbacks.changed)
    throw new Error("Please specify only one of changed() and changedAt()");
  if (callbacks.removed && callbacks.removedAt)
    throw new Error("Please specify only one of removed() and removedAt()");
  if (callbacks.addedAt || callbacks.movedTo ||
      callbacks.changedAt || callbacks.removedAt)
    return LocalCollection._observeOrderedFromObserveChanges(cursor, callbacks, transform);
  else
    return LocalCollection._observeUnorderedFromObserveChanges(cursor, callbacks, transform);
};

LocalTable._observeUnorderedFromObserveChanges =
    function (cursor, callbacks, transform) {
  var docs = {};
  var suppressed = !!callbacks._suppress_initial;
  var handle = cursor.observeChanges({
    added: function (id, fields) {
      var strId = LocalCollection._idStringify(id);
      var doc = EJSON.clone(fields);
      doc._id = id;
      docs[strId] = doc;
      suppressed || callbacks.added && callbacks.added(transform(doc));
    },
    changed: function (id, fields) {
      var strId = LocalCollection._idStringify(id);
      var doc = docs[strId];
      var oldDoc = EJSON.clone(doc);
      // writes through to the doc set
      LocalCollection._applyChanges(doc, fields);
      suppressed || callbacks.changed && callbacks.changed(transform(doc), transform(oldDoc));
    },
    removed: function (id) {
      var strId = LocalCollection._idStringify(id);
      var doc = docs[strId];
      delete docs[strId];
      suppressed || callbacks.removed && callbacks.removed(transform(doc));
    }
  });
  suppressed = false;
  return handle;
};