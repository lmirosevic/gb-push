//
//  Resque.js
//  gb-push
//
//  Created by Luka Mirosevic on 21/05/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

var _ = require('underscore'),
    nconf = require('nconf'),
    toolbox = require('gb-toolbox'),
    resque = require('coffee-resque'),
    url = require('url');

var options = nconf.get('MESSAGE_INGRESS').options;

/* Connection */

var parsedUrl = url.parse(options.redis);
var connectionOptions = {};
if (!_.isNull(parsedUrl.hostname)) connectionOptions.host = parsedUrl.hostname;
if (!_.isNull(parsedUrl.port)) connectionOptions.port = parsedUrl.port;
if (!_.isNull(parsedUrl.auth)) connectionOptions.password = parsedUrl.auth.split(':')[1];
if (!_.isNull(parsedUrl.pathname)) connectionOptions.database = parsedUrl.pathname.split('/')[1];
console.log(connectionOptions);
resque.connect(connectionOptions);

/* Main code */

var ResqueImplementation = function() {
  this.listen = function(callback) {
    toolbox.requiredArguments(callback);

    resque.worker('*', {
      PushMessage: function(input, resqueueCallback) {
        // emit the data out onto the listener
        toolbox.callCallback(callback, input.channel, input.notification);

        // signify that the job is done
        toolbox.callCallback(resqueueCallback);
      }
    });
  };
};
var resqueImplementation = module.exports = new ResqueImplementation();

// Sample ingress payload
//
// {
//   channel: 'wcsg.match.crovsbra.goal',
//   notification: {
//     payload: {},
//     message: 'New game'
//   }
// }
