//
//  MongoDB.js
//  gb-push
//
//  Created by Luka Mirosevic on 18/05/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var _ = require('underscore'),
    nconf = require('nconf'),
    logger = require('../logger'),
    mongoose = require('mongoose'),
    toolbox = require('gb-toolbox'),
    api = require('gb-api'),
    Q = require('q'),
    ttypes = require('../../thrift/gen-nodejs/GoonbeePushService_types'),
    ttypesShared = require('../../thrift/gen-nodejs/GoonbeeShared_types');

var options = nconf.get('PERSISTENCE').options;

/* Schema */

var pushTokenSchema = new mongoose.Schema({
  type:                                   { type: String },
  token:                                  { type: String },
}, {
  _id: false,
});

var subscriptionSchema = new mongoose.Schema({
  channel:                                { type: String, index: { unique: true } },
  subscribers:                            { type: [pushTokenSchema], index: true },// make sure this index is properly set
});

/* Models */

var Subscription = mongoose.model(options.collectionNamespace + '.' + 'Subscription', subscriptionSchema);

/* Config */

mongoose.set('debug', options.debug);

/* Connect */

mongoose.connection.on('error', function(err) {
  // try again in a little while
  setTimeout(connect, options.reconnectionTimeout);
});
var connect = function() { 
  logger.info('Attempting (re)connection to MongoDB...');
  mongoose.connect(options.url, { autoReconnect: true });
};
connect();

/* Main logic */

var P = function() {
  this.sliceForRangeMongo_s = function(range) {
    var skip;
    var limit;
    switch (range.direction) {
      case ttypesShared.Direction.FORWARDS: {
        skip = range.index;
        limit = range.length;
      } break;

      case ttypesShared.Direction.BACKWARDS: {
        skip = -(range.index + 1);
        limit = range.length;
      } break;
    }

    return {skip: skip, limit: limit};
  };

  this.lazySubscription = function(channel) {
    toolbox.requiredArguments(channel);
    
    return Subscription
      .update({
        channel: channel
      }, {
        $setOnInsert: {
          channel: channel,
          subscribers: [],
        }
      }, {
        upsert: true,
      })
      .exec()
      .then(function() {
        return channel;
      });
  };

  this.rawPushToken_s = function(pushToken) {
    return {type: pushToken.type, token: pushToken.token};
  };

  this.verifyToken_s = function(pushToken) {
    try {
      // make sure a token is passed in
      toolbox.requiredArguments(pushToken);
    }
    catch (err) {
      throw new api.errors.errorTypes.MalformedRequestError('The PushToken is required.');
    }

    // make sure the type is one of the allowed types
    if (!_.contains([ttypes.PushTokenType.APNS, ttypes.PushTokenType.GCM], pushToken.type)) throw new api.errors.errorTypes.MalformedRequestError('PushToken type is invalid.');

    // make sure the token is not null or empty
    if (_.isNull(pushToken.token) || pushToken.token.length <= 0) throw new api.errors.errorTypes.MalformedRequestError('PushToken token is null or empty.');
  };
};
var p = new P();

var MongoDBPersistence = function() {
  this.setChannelSubscriptionStatus = function(pushToken, channel, subscriptionStatus, callback) {
    p.verifyToken_s(pushToken);
    toolbox.requiredArguments(channel);
    toolbox.requiredArguments(subscriptionStatus);

    p.lazySubscription(channel)
      .then(function() {
        var rawPushToken = p.rawPushToken_s(pushToken);

        // create update object
        var updateObject = {};
        var action = subscriptionStatus ? '$addToSet' : '$pull';
        updateObject[action] = { subscribers: rawPushToken };

        return Subscription
          .update({
            channel: channel
          }, updateObject)
          .exec()
          .then(function() {
            toolbox.callCallback(callback, null);
          });
      })
      .end(callback);
  };

  this.subscribedChannels = function(pushToken, range, callback) {
    p.verifyToken_s(pushToken);
    toolbox.requiredArguments(range);

    var rawPushToken = p.rawPushToken_s(pushToken);

    var slice = p.sliceForRangeMongo_s(range);

    var sortKey = '_id';
    // potentially reverse the channels... by prepending a minus to the sortKey
    if (range.direction === ttypesShared.Direction.BACKWARDS) sortKey = "-" + sortKey;

    // calculate the offset
    var skip = slice.skip >= 0 ? slice.skip : -1 - slice.skip;

    Subscription
      .find({
        subscribers: { $elemMatch : rawPushToken }
      })
      .skip(skip)
      .limit(slice.limit)
      .select('channel')
      .sort(sortKey)
      .exec()
      .then(function(subscriptions) {
        var channels = _.map(subscriptions, function(subscription) {
          return subscription.channel;
        });

        toolbox.callCallback(callback, null, channels);
      })
      .end(callback);
  };

  this.subscriptionStatus = function(pushToken, channel, callback) {
    p.verifyToken_s(pushToken);
    toolbox.requiredArguments(channel);

    var rawPushToken = p.rawPushToken_s(pushToken);

    p.lazySubscription(channel)
      .then(function() {
        return Subscription
          .count({
            channel: channel,
            subscribers: { $elemMatch: rawPushToken }
          })
          .exec()
          .then(function(count) {
            var subscriptionStatus = (count > 0);

            toolbox.callCallback(callback, null, subscriptionStatus);            
          });
      })
      .end(callback);
  };

  this.channelSubscribers = function(channel, callback) {
    toolbox.requiredArguments(channel);

    p.lazySubscription(channel)
      .then(function() {
        return Subscription
          .findOne({
            channel: channel
          })
          .exec()
          .then(function(subscription) {
            var subscribers = _.map(subscription.subscribers, function(rawSubscriber) {
              console.log(rawSubscriber.type);
              console.log(rawSubscriber.token);
              return new ttypes.PushToken({type: rawSubscriber.type, token: rawSubscriber.token});
            });

            toolbox.callCallback(callback, null, subscribers);
          });
      })
      .end(callback);
  };
};
var mongoDBPersistence = module.exports = new MongoDBPersistence();
