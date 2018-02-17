#!/usr/bin/env node

var inquirer = require('inquirer');

var Magnet = require('magnet-uri');
var Transmission = require('transmission');
var ParseTorrentFile = require('parse-torrent-file');
var path = require('path');
var fs = require('fs');
var xdgBasedir = require('xdg-basedir');
var configDir = xdgBasedir.config + '/transmission-links-handler';
var config = {};
if (fs.existsSync(configDir)) {
  try {
    process.env.NODE_CONFIG_DIR = configDir;
    config = require('config');
  } catch (e) {
    config = {};
    console.warn('The configuration file inside ' + configDir + ' is either not readable or has no valid syntax therefor it will be ignored');
  }
}

var Argparse = require('argparse').ArgumentParser;
var parser = new Argparse({
  version: '0.0.1',
  addHelp: true,
  description: 'Interactive script to run in minimal desktop environments that will add magnet links or torrent files to transmission-daemon'
});

parser.addArgument(
  [ '-ne', '--authenv' ],
  {
    help: 'Set the authentication information from the TR_AUTH environment variable which must be formatted as username:password',
    action: 'storeTrue',
    nargs: 0
  }
);
parser.addArgument(
  [ '-n', '--auth' ],
  {
    help: 'Set the username and password for authentication',
    metavar: 'username:password',
    nargs: 1
  }
);
parser.addArgument(
  [ '-H', '--host' ],
  {
    help: 'Set the host on which a connection attempt will be established',
    nargs: 1
  }
);
parser.addArgument(
  [ '-p', '--port' ],
  {
    help: 'Set the port on which a connection attempt will be established',
    type: 'int',
    defaultValue: 9091,
    nargs: 1
  }
);
parser.addArgument(
  [ '-u', '--url' ],
  {
    help: 'Set the url of the transmission-daemon',
    nargs: 1
  }
);
parser.addArgument(
  [ '-s', '--ssl' ],
  {
    help: 'Use ssl',
    action: 'storeTrue',
    nargs: 0
  }
);
parser.addArgument(
  [ 'torrents' ],
  {
    help: 'Magnet link or torrent file to be added interactivly',
    epilog: 'Multiple arguments like this are acceptable',
    nargs: '+'
  }
);

var args = parser.parseArgs();

// Up untill here we don't need any synchronous jobs to do.

// exit the program and prompt for confirmation before actually exiting
function exitWithConfirmation (problem) {
  inquirer.prompt({
    type: 'input',
    name: 'continue',
    message: problem + ', press any key to continue'
  }).then(answers => {
    process.exit(3);
  });
}

var transmission;

var transmissionConnection = new Promise(function (resolve, reject) {
  var conn = {};
  if (args.host || config.host) {
    if (typeof (config.host) === 'string') {
      conn.host = config.host;
    } else {
      reject(Error('Please fix your configuration variable "host" to type "string"'));
    }
    if (args.host) {
      conn.host = String(args.host);
    }
    if (!conn.host.match(/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/)) {
      reject(Error('Please provide a valid host name'));
    }
  }
  if (args.url || config.url) {
    if (typeof (config.url) === 'string') {
      conn.url = config.url;
    } else {
      reject(Error('Please fix your configuration variable "url" to type "string"'));
    }
    if (args.url) {
      conn.url = String(args.url);
    }
  }
  if (args.port || config.port) {
    if (typeof (config.port) === 'number') {
      conn.port = config.port;
    }
    if (args.port) {
      conn.port = Number(args.port);
    }
  }
  if (args.ssl || config.ssl) {
    if (typeof (config.ssl) === 'boolean') {
      conn.ssl = config.ssl;
    } else {
      reject(Error('Please fix your configuration variable "ssl" to type "boolean"'));
    }
    if (args.ssl) {
      conn.ssl = args.ssl;
    }
  }
  var authentication;
  if (args.authenv || config.authenv) {
    if (process.env.TR_AUTH) {
      authentication = process.env.TR_AUTH;
    } else {
      reject(Error('It seems that TR_AUTH is empty'));
    }
  } else if (args.auth || config.auth) {
    var myconfig;
    if (typeof (config.auth) === 'string') myconfig = config.auth;
    authentication = args.auth || myconfig || config.auth.username + ':' + config.auth.password;
  }
  if (authentication) {
    if (authentication.match(/^[a-zA-Z0-9]+:[^ :]+$/)) {
      [ conn.username, conn.password ] = authentication.split(':');
    } else {
      reject(Error('It doesn\'t seem like authentication is provided in the right format: "username:password"'));
    }
  }
  transmission = new Transmission(conn);
  transmission.sessionStats(function (err, result) {
    if (err) {
      reject(err);
    }
  });
});

// variable used for arguments addition confirmations
var myTorrent = {};
myTorrent.iterator = 0;
function ask () {
  myTorrent.argument = args.torrents[myTorrent.iterator];
  if (myTorrent.argument.match(/magnet:/)) {
    var magnet;
    try {
      magnet = Magnet.decode(myTorrent.argument);
    } catch (e) {
      console.error(e);
      process.exit(2);
    }
    myTorrent.name = magnet.dn;
  } else {
    myTorrent.file = fs.readFileSync(path.join(__dirname, myTorrent.argument));
    var t;
    try {
      t = ParseTorrentFile(myTorrent.file);
    } catch (e) {
      console.error(e);
      process.exit(2);
    }
    myTorrent.name = t.name;
  }
  inquirer.prompt({
    type: 'confirm',
    name: 'add',
    message: 'Would you like to add the torrent "' + myTorrent.name + '"?',
    default: true
  }).then(answers => {
    if (answers.add) {
      console.log('adding a torrent');
      // TODO
      // transmission.add();
    }
    if (myTorrent.iterator < args.torrents.length - 1) {
      myTorrent.iterator++;
      ask();
    } else {
      return 0;
    }
  });
}

transmissionConnection.then(function (result) {
  ask();
}, function (err) {
  exitWithConfirmation(err);
});
