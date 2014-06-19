//
//  server.js
//  gb-push
//
//  Created by Luka Mirosevic on 17/04/2014.
//  Copyright (c) 2014 Goonbee. All rights reserved.
//

// WARNING: DON'T FORGET TO MAP ELB PORT TO 80 INTERNALLY, PUBLIC PORT CAN BE CHOSEN AT WILL

var nconf = require('nconf');

// Override the port for OpsWorks
nconf.overrides({
  PORT: 80
});

require('./app');
