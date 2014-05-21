//
//  GBPushNotificationsService.js
//  gb-push
//
//  Created by Luka Mirosevic on 21/05/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var _ = require('underscore'),
    nconf = require('nconf'),
    toolbox = require('gb-toolbox'),
    coffeeResque = require('coffee-resque'),
    url = require('url');

var options = nconf.get('PUSH_DELIVERY_SERVICE').options;

/* Connection */

var parsedUrl = url.parse(options.redis);
var connectionOptions = {};
if (!_.isNull(parsedUrl.hostname)) connectionOptions.host = parsedUrl.hostname;
if (!_.isNull(parsedUrl.port)) connectionOptions.port = parsedUrl.port;
if (!_.isNull(parsedUrl.auth)) connectionOptions.password = parsedUrl.auth.split(':')[1];
if (!_.isNull(parsedUrl.pathname)) connectionOptions.database = parsedUrl.pathname.split('/')[1];
console.log('Attempting connection to Redis for push delivery...');
var resque = coffeeResque.connect(connectionOptions);
resque.redis.on('error', function(err) {
    console.error('Error occured on push delivery Redis', err);
});
resque.redis.on('reconnecting', function(err) {
  console.log('Attempting reconnection to Redis for push delivery...');
});
resque.redis.retry_max_delay = options.maxReconnectionTimeout;

/* Main code */

var P = function() {
  this.convertPushTokenToMessage_s = function(opts) {
    var message = {};

    message.targets = _.map(opts.targets, function(pushToken) {
      var translated = {
        type: pushToken.type,
        deviceIdentifier: pushToken.token
      };
      return translated;

    });

    message.alert = opts.alert;
    message.payload = opts.payload;
    if (!_.isUndefined(opts.badge)) message.badge = opts.badge;
    if (!_.isUndefined(opts.sound)) message.sound = opts.sound;
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

    // send the push off
    resque.enqueue(options.queue, 'PushJob', message, function(err, remainingJobs) {
      toolbox.callCallback(callback, err);
    });
  };
};

var gbPushNotificationsService = module.exports = new GBPushNotificationsService();
