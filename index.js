#!/usr/bin/env node

var Argparse = require('argparse').ArgumentParser;
var parser = new Argparse({
  version: '0.0.1',
  addHelp: true,
  description: 'Interactive script to run in minimal desktop environments that will add magnet links or torrent files to transmission-daemon'
});

parser.addArgument(
  [ '-ne', '--authenv' ],
  {
    help: 'Set the authentication information from the TR_AURH environment variable which must be formatted as username:password',
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

var Transmission = require('transmission');

var transmissionConnection = {};

for (var property in args) {
  if (args.hasOwnProperty(property) && args[property]) {
    transmissionConnection[property] = String(args[property]);
  }
}
if (args.authenv) {
  [ transmissionConnection.username, transmissionConnection.password ] = process.env.TR_AUTH.split(':');
} else if (args.auth) {
  [ transmissionConnection.username, transmissionConnection.password ] = args.auth[0].split(':');
}
delete transmissionConnection.authenv;
delete transmissionConnection.auth;
delete transmissionConnection.torrents;

var transmission = new Transmission(transmissionConnection);

// Check connection to transmission and exit if can't connect
transmission.sessionStats(function (err, result) {
  if (err) {
    console.error('can\'t connect to transmission');
    throw err;
  }
});

var inquirer = require('inquirer');
var Magnet = require('magnet-uri');
var ParseTorrentFile = require('parse-torrent-file');
var path = require('path');
var fs = require('fs');

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
    console.log('Trying to add as a torrent: ' + myTorrent.argument);
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

ask();
