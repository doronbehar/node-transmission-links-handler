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
console.dir(transmissionConnection);
transmission.sessionStats(function (err, result) {
  if (err) {
    console.error('can\'t connect to transmission');
    throw err;
  }
});

var inquirer = require('inquirer');

for (var t in args.torrents) {
  if (t.search(/^magnet:/)) {
    var magnetLink = args.torrents[t];
    var Magnet = require('magnet-uri');
    var magnet = Magnet.decode(magnetLink);
    inquirer.prompt({
      type: 'confirm',
      name: 'add',
      message: 'Would you like to add the torrent "' + magnet.dn + '"?',
      default: true
    }).then(answers => {
      if (answers.add) {
        // TODO
        transmission.add();
      }
    });
  } else {
  }
}
