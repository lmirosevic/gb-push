//
//  app.js
//  gb-push
//
//  Created by Luka Mirosevic on 18/05/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var nconf = require('nconf'),
    api = require('gb-api'),
    GBPushService = require('./thrift/gen-nodejs/GoonbeePushService'),
    ttypes = require('./thrift/gen-nodejs/GoonbeePushService_types'),
    ttypesShared = require('./thrift/gen-nodejs/GoonbeeShared_types');

nconf.argv()
     .env()
     .file({file: './config/defaults.json'});

/* Plugins */

var persistence = require('./lib/persistence/' + nconf.get('PERSISTENCE').type);
var messageIngress = require('./lib/message-ingress/' + nconf.get('MESSAGE_INGRESS').type);
var pushDeliveryService = require('./lib/push-delivery-service/' + nconf.get('PUSH_DELIVERY_SERVICE').type);

/* Push routing and delivery */

messageIngress.listen(function(channel, notification) {
  persistence.channelSubscribers(channel, function(subscribers) {
    // create new message
    var message = {};
    
    message.targets = subscribers; // pushDeliveryService expects targets as type PushToken
    message.payload = {
      c: channel,
      p: notification.payload
    };
    message.alert = notification.alert;
    message.badge = notification.badge;
    message.sound = notification.sound;
    message.topic = notification.topic;
  });

  pushDeliveryService.deliver(message, function(err) {
    if (err) console.log('An error occured delivering a push notification', err);
  });
});

/* Public subscription API */

api.errors.setShouldLogOutput(nconf.get('LOG_OUTPUT'));
api.errors.setShouldLogCalls(nconf.get('LOG_CALLS'));
api.errors.setShouldLogErrors(nconf.get('LOG_ERRORS'));

// Error mapping from application -> thrift
api.errors.setErrorMapping(
  {
    GenericError: ttypesShared.ResponseStatus.GENERIC,
    MalformedRequestError: ttypesShared.ResponseStatus.MALFORMED_REQUEST,
    AuthenticationError: ttypesShared.ResponseStatus.AUTHENTICATION,
    AuthorizationError: ttypesShared.ResponseStatus.AUTHORIZATION,
    PhasedOutError: ttypesShared.ResponseStatus.PHASED_OUT,
  },
  function(status, message) {
    return new ttypesShared.RequestError({status: status, message: message});// passes through original error message to client, this is desired in the case of the mapped errors above
  },
  new ttypesShared.RequestError({status: ttypesShared.ResponseStatus.GENERIC, message: 'A generic error occured.'})
);

var PushServiceImplementation = function() {
  /** 
   * GoonbeeShared BaseService
   */

  this.alive = function(result) {
    result('777');
  };

  /** 
   * Goonbee Push Service 
   */

  this.setChannelSubscriptionStatus = function(pushToken, channel, subsriptionStatus, result) {
    persistence.setChannelSubscriptionStatus(pushToken, channel, subsriptionStatus, result);
  };

  this.subscribedChannels = function(pushToken, range, result) {
    persistence.subscribedChannels(pushToken, range, result);
  };

  this.subscriptionStatus = function(pushToken, channel, result) {
    persistence.subscriptionStatus(pushToken, channel, result);
  };
};

// Start server
api.createThriftServer(GBPushService, new PushServiceImplementation()).listen(nconf.get('PORT'));
console.log('Push subscription service started on port ' + nconf.get('PORT'));
