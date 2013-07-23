// Set up a collection to contain player information. On the server,
// it is backed by a MongoDB collection named "players".

Players = new Meteor.Collection("players");

var randomizer = function() {
  Players.update({}, {$set: {score: Math.floor(Random.fraction()*10)*5}});
};

if (Meteor.isClient) {
  var scoreRandomizer = function() {
  Players.update({}, {$set: {score: Math.floor(Random.fraction()*10)*5}});
  };
  Session.set("sortMethod", {score: -1});
  Template.leaderboard.players = function () {
    return Players.find({}, {sort: Session.get("sortMethod")});
  };

  Template.leaderboard.selected_name = function () {
    var player = Players.findOne(Session.get("selected_player"));
    return player && player.name;
  };

  Template.player.selected = function () {
    return Session.equals("selected_player", this._id) ? "selected" : '';
  };

  Template.newPlayer.events({
    'click input.add': function() {
      var newPlayerName = document.getElementById("new_player_name").value;
      Players.insert({name: new_player_name, score: 0});
    }
  });

  Template.leaderboard.events({
    'click input.inc': function () {
      Players.update(Session.get("selected_player"), {$inc: {score: 5}});
    },
    'click input.sort': function() {
      if (Session.get("sortMethod")["score"]) {
        Session.set("sortMethod", {name: 1});
      } else {
        Session.set("sortMethod", {score: -1});
      }
    },
    'click input.randomizer': function() {
    }
  });

  Template.player.events({
    'click': function () {
      Session.set("selected_player", this._id);
    }
  });
}

// On server startup, create some players if the database is empty.
if (Meteor.isServer) {
  Meteor.startup(function () {
    if (Players.find().count() === 0) {
      var names = ["Ada Lovelace",
                   "Grace Hopper",
                   "Marie Curie",
                   "Carl Friedrich Gauss",
                   "Nikola Tesla",
                   "Claude Shannon"];
      for (var i = 0; i < names.length; i++)
        Players.insert({name: names[i], score: Math.floor(Random.fraction()*10)*5});
    }
  });
}
