//
//  GBPushNotificationsService.js
//  gb-push
//
//  Created by Luka Mirosevic on 21/05/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var _ = require('underscore'),
    nconf = require('nconf'),
    logger = require('../logger'),
    toolbox = require('gb-toolbox'),
    coffeeResque = require('coffee-resque'),
    ttypes = require('../../thrift/gen-nodejs/GoonbeePushService_types'),
    url = require('url');

var options = nconf.get('PUSH_DELIVERY_SERVICE').options;

/* Connection */

var parsedUrl = url.parse(options.redis);
var connectionOptions = {};
if (!_.isNull(parsedUrl.hostname)) connectionOptions.host = parsedUrl.hostname;
if (!_.isNull(parsedUrl.port)) connectionOptions.port = parsedUrl.port;
if (!_.isNull(parsedUrl.auth)) connectionOptions.password = parsedUrl.auth.split(':')[1];
if (!_.isNull(parsedUrl.pathname)) connectionOptions.database = parsedUrl.pathname.split('/')[1];
logger.info('Attempting connection to Redis for push delivery...');
var resque = coffeeResque.connect(connectionOptions);
resque.redis.on('error', function(err) {
    logger.info('Error occured on push delivery Redis', err);
});
resque.redis.on('reconnecting', function(err) {
  logger.info('Attempting reconnection to Redis for push delivery...');
});
resque.redis.retry_max_delay = options.maxReconnectionTimeout;

/* Main code */

var P = function() {
  this.pushServiceTargetsForTargets_s = function(targets) {
    return _.map(targets, function(pushToken) {
      var type;

      switch (parseInt(pushToken.type)) {
        case ttypes.PushTokenType.APNS: {
          type = 'APN';
        } break;

        case ttypes.PushTokenType.GCM: {
          type = 'GCM';
        } break;
      }

      return {
        type: type,
        deviceIdentifier: pushToken.token
      };
    });
  };

  this.convertOptsToMessage_s = function(opts) {
    var message = {};

    // convert the targets into something the push service expects
    message.targets = p.pushServiceTargetsForTargets_s(opts.targets);
      
    // map the rest of the message
    if (!_.isUndefined(opts.alert)) message.alert = opts.alert;
    if (!_.isUndefined(opts.payload)) message.payload = opts.payload;
    if (!_.isUndefined(opts.badge)) message.badge = opts.badge;
    if (!_.isUndefined(opts.sound)) message.sound = opts.sound;
    if (!_.isUndefined(opts.contentAvailable)) message.contentAvailable = opts.contentAvailable;
    if (!_.isUndefined(opts.topic)) message.topic = opts.topic;

    return message;
  };
};
var p = new P();

var GBPushNotificationsService = function() {
  this.deliver = function(opts, callback) {
    toolbox.requiredArguments(opts, callback);

    // convert the input into a message object that the push service expects
    var message = p.convertOptsToMessage_s(opts);

    if (_.size(message.targets) > 0) {
      // send the push off
      resque.enqueue(options.queue, 'GBPushNotificationsService::PushJob', [message], function(err, remainingJobs) {
        toolbox.callCallback(callback, err);
      });
    }
  };
};
var gbPushNotificationsService = module.exports = new GBPushNotificationsService();
