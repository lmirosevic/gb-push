var thrift = require('thrift'),
    GBPushService = require('./thrift/gen-nodejs/GoonbeePushService'),
    ttypes = require('./thrift/gen-nodejs/GoonbeePushService_types'),
    ttypesShared = require('./thrift/gen-nodejs/GoonbeeShared_types'),
    clc = require('cli-color');

var connection = thrift.createConnection("localhost", 56201),
    client = thrift.createClient(GBPushService, connection);

connection.on('error', function(err) {
  console.error(err);
});

var resultLogger = function(err, result) {
  console.log('----------');
  console.log(clc.blue(result));
  console.log(clc.red(err ? err.status.toString() + ': ' + err : ''));
  console.log('----------');
};


client.setChannelSubscriptionStatus(new ttypes.PushToken({type: ttypes.PushTokenType.APNS, token: "blabla123"}), "wcsg.match.match_madeup", true, resultLogger);

// client.isUsernameAvailable('luka', function(err, result) {
//   resultLogger.apply(this, arguments);
// });
