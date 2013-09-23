# RethinkDB for Meteor [currently broken]

Meteor Smart Package providing RethinkDB support for Meteor

* Write wonderful ReQL syntax on both client (Minirethink) and server (RethinkDB) side
* Perform queries faster* by avoiding database polling and the LiveResultsSet
* Don't write Mongo syntax (again, ever.)

# Installation

Install RethinkDB from Atmosphere
```bash 
    $mrt add rethink-live-data
````
Install From Git (If you are not using Meteorite)
```bash 
    mkdir -p packages
    git submodule add https://github.com/tuhinc/meteor_playground.git packages/rethink-live-data
````
# Usage

### Tables
Replace `Meteor.Collection` with `Meteor.Table`.
```js
// old code
Posts = new Meteor.Collection('posts');

// with rethink-live-data
Posts = new Meteor.Table('posts');
````
On the client side, create an instance of Minirethink to use ReQL syntax instead of Mongo syntax.
```js
// instantiate Minirethink
var r = new Minirethink();

// interact with database using ReQL syntax
r.table('posts').get('username').run(callback);
````` 
Continue to use publish and subscribe as you normally would. (rethink-live-data does not currently support autopublish)
```js
// server: publish the posts table.
Meteor.publish('posts', function () {
return r.table('posts').run(callback);
});

// client: subscribe to the posts table
Meteor.subscribe('posts');

// client will queue incoming post records until ...
Posts = new Meteor.Table('posts');
````   
### Cursors

Currently provides support for `each`, `map`, `fetch`, `count`, and `hasNext`

#### each
Lazily iterate over the result set one element at a time.
```js    
cursor.each(callback[, onFinished])
````    
#### map
Transform each element of the sequence by applying the given mapping function.
```js
cursor.map(mappingFunction) → array
````
#### fetch
Returns an array of all documents in the cursor
```js
cursor.fetch() → array    
````
#### count
Transform each element of the sequence by applying the given mapping function.
```js
cursor.count() → integer
````
#### hasNext
Check if there are more elements in the cursor
```js
cursor.hasNext() → bool
````

## Compatibility

* Currently does not support autopublish -- publish and subscribe functions must be used!

## Scalability

*Disclaimers:*

1. This is a work-in-progress. Full functionality has not yet been implemented. There are definitely bugs! :)
2. * this claim has not been tested
