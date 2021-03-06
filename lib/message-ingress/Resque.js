//
//  Resque.js
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
    url = require('url');

var options = nconf.get('MESSAGE_INGRESS').options;

/* Connection */

var parsedUrl = url.parse(options.redis);
var connectionOptions = {};
if (!_.isNull(parsedUrl.hostname)) connectionOptions.host = parsedUrl.hostname;
if (!_.isNull(parsedUrl.port)) connectionOptions.port = parsedUrl.port;
if (!_.isNull(parsedUrl.auth)) connectionOptions.password = parsedUrl.auth.split(':')[1];
if (!_.isNull(parsedUrl.pathname)) connectionOptions.database = parsedUrl.pathname.split('/')[1];
logger.info('Attempting connection to Redis for message ingress...');
var resque = coffeeResque.connect(connectionOptions);
resque.redis.on('error', function(err) {
    logger.info('Error occured on message ingress Redis', err);
});
resque.redis.on('reconnecting', function(err) {
  logger.info('Attempting reconnection to Redis for message ingress...');
});
resque.redis.retry_max_delay = options.maxReconnectionTimeout;

/* Main code */

var ResqueImplementation = function() {
  this.listen = function(callback) {
    toolbox.requiredArguments(callback);

    var worker = resque.worker(options.queue, {
      PushMessage: function(input, resqueueCallback) {
        var channel = input.channel;
        var notification = input.notification;

        // Log to console
        if (options.logUpdates) {
          logger.info('<<< ' + clc.blue(channel));
          logger.info(JSON.stringify(notification));
        }

        // emit the data out onto the listener
        toolbox.callCallback(callback, channel, notification);

        // signify that the job is done
        toolbox.callCallback(resqueueCallback);
      }
    });

    worker.start();
  };
};
var resqueImplementation = module.exports = new ResqueImplementation();

// Payload format (ingress)
//
// {
//   channel: 'wcsg.match.crovsbra.goal',
//   notification: {
//     payload: {},
//     alert: 'New game'
//   }
// }
