//
//  InMemory.js
//  gb-push
//
//  Created by Luka Mirosevic on 18/05/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var _ = require('underscore'),
    nconf = require('nconf'),
    logger = require('../logger'),
    toolbox = require('gb-toolbox'),
    api = require('gb-api'),
    ttypes = require('../../thrift/gen-nodejs/GoonbeePushService_types'),
    ttypesShared = require('../../thrift/gen-nodejs/GoonbeeShared_types');

var options = nconf.get('PERSISTENCE').options;

var storage = {
  subscriptions: []
};

/* Main code */

var P = function() {
  this.sliceForRange_s = function(collection, range) {
    var elementCount = _.size(collection);
    
    var saneIndex = toolbox.threshold(range.index, 0, elementCount);
    var saneLength = toolbox.threshold(range.length, 0, elementCount - saneIndex);

    var begin;
    var end;
    switch (range.direction) {
      case ttypesShared.Direction.FORWARDS: {
        begin = saneIndex;
        end = begin + saneLength;
      } break;

      case ttypesShared.Direction.BACKWARDS: {
        end = elementCount - saneIndex;
        begin = end - saneLength;
      } break;
    }

    return {begin: begin, end: end};
  };

  this.lazySubscription = function(channel, callback) {
    toolbox.requiredArguments(channel);
    
    // attempt to get existing subscription
    var rawSubscription = _.find(storage.subscriptions, function(subscription) {
      return subscription.channel == channel;
    });

    if (_.isUndefined(rawSubscription)) {
      // initialize it
      rawSubscription = {
        channel: channel,
        subscribers: [],
      };

      // commit it
      storage.subscriptions.push(rawSubscription);
    }

    toolbox.callCallback(callback);
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

var InMemoryPersistence = function() {
  this.setChannelSubscriptionStatus = function(pushToken, channel, subscriptionStatus, callback) {
    p.verifyToken_s(pushToken);
    toolbox.requiredArguments(channel);
    toolbox.requiredArguments(subscriptionStatus);

    p.lazySubscription(channel, function() {
      // attempt to get existing subscription
      var rawSubscription = _.find(storage.subscriptions, function(subscription) {
        return subscription.channel == channel;
      });

      var rawPushToken = p.rawPushToken_s(pushToken);

      // try to get the index of any potential matching rawPushToken
      var index = _.indexOf(rawSubscription.subscribers, _.find(rawSubscription.subscribers, _.matches(rawPushToken)));
      var alreadySubscribed = (index != -1);

      // subscribe
      if (subscriptionStatus && !alreadySubscribed) {
        rawSubscription.subscribers.push(rawPushToken);
      }
      // unsubscribe
      else if (!subscriptionStatus && alreadySubscribed) {
        rawSubscription.subscribers.splice(index, 1);
      }

      toolbox.callCallback(callback, null);
    });
  };

  this.subscribedChannels = function(pushToken, range, callback) {
    p.verifyToken_s(pushToken);
    toolbox.requiredArguments(range);

    var rawPushToken = p.rawPushToken_s(pushToken);

    // find all the subscriptions for which the token is present
    var subscribedChannels = _.map(_.filter(storage.subscriptions, 
      function(rawSubscription) {// filter
        // try to get the index of any potential matching rawPushToken
        var index = _.indexOf(rawSubscription.subscribers, _.find(rawSubscription.subscribers, _.matches(rawPushToken)));
        var subscriptionStatus = (index != -1);

        return subscriptionStatus;
      }),
      function(subscription) {// map
        return subscription.channel;
      });

    // get only the desired slice
    var slice = p.sliceForRange_s(subscribedChannels, range);
    var slicedSubscribedChannels = subscribedChannels.slice(slice.begin, slice.end);

    // potentially reverse the list
    if (range.direction === ttypesShared.Direction.BACKWARDS) slicedSubscribedChannels.reverse();

    toolbox.callCallback(callback, null, slicedSubscribedChannels);
  };

  this.subscriptionStatus = function(pushToken, channel, callback) {
    p.verifyToken_s(pushToken);
    toolbox.requiredArguments(channel);

    p.lazySubscription(channel, function() {
      // attempt to get existing subscription
      var rawSubscription = _.find(storage.subscriptions, function(subscription) {
        return subscription.channel == channel;
      });

      var rawPushToken = p.rawPushToken_s(pushToken);

      // try to get the index of any potential matching rawPushToken
      var index = _.indexOf(rawSubscription.subscribers, _.find(rawSubscription.subscribers, _.matches(rawPushToken)));
      var subscriptionStatus = (index != -1);

      toolbox.callCallback(callback, null, subscriptionStatus);
    });
  };

  this.channelSubscribers = function(channel, callback) {
    toolbox.requiredArguments(channel);

    p.lazySubscription(channel, function() {
      // attempt to get existing subscription
      var rawSubscription = _.find(storage.subscriptions, function(subscription) {
        return subscription.channel == channel;
      });

      var subscribers = _.map(rawSubscription.subscribers, function(rawSubscriber) {
        return new ttypes.PushToken({type: rawSubscriber.type, token: rawSubscriber.token});
      });

      toolbox.callCallback(callback, null, subscribers);
    });
  };
};
var inMemoryPersistence = module.exports = new InMemoryPersistence();
