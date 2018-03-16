#!/usr/bin/env node

var inquirer = require('inquirer');

var Magnet = require('magnet-uri');
var Transmission = require('transmission');
var ParseTorrentFile = require('parse-torrent-file');
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
function exitWithConfirmation (problem, exitCode) {
  var msg;
  if (problem !== '') {
    msg = problem + ', press any key to continue';
  } else {
    msg = 'press any key to continue';
  }
  inquirer.prompt({
    type: 'input',
    name: 'continue',
    message: msg
  }).then(answers => {
    process.exit(exitCode);
  });
}

var transmission;

var combineArgumentsAndConfig = new Promise(function (resolve, reject) {
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
  if ((args.authenv || config.authenv) && args.auth === null) {
    if (process.env.TR_AUTH) {
      authentication = process.env.TR_AUTH;
    } else {
      reject(Error('It seems that TR_AUTH is empty'));
    }
  } else if (args.auth || config.auth) {
    var myconfig;
    if (typeof (config.auth) === 'string') {
      myconfig = config.auth;
    }
    authentication = args.auth[0] || myconfig || config.auth.username + ':' + config.auth.password;
  }
  if (authentication) {
    if (authentication.match(/^[a-zA-Z0-9]+:[^ :]+$/)) {
      [ conn.username, conn.password ] = authentication.split(':');
    } else {
      reject(Error('It doesn\'t seem like authentication is provided in the right format: "username:password"'));
    }
  }
  resolve(conn);
});

function checkTransmissionConnection (conn) {
  return new Promise(function (resolve, reject) {
    transmission = new Transmission(conn);
    transmission.session(function (err, result) {
      if (err) {
        reject(Error('Couldn\'t connect to transmission daemon, ' + err));
      } else {
        resolve(result);
      }
    });
  });
}

var checkTorrentsArguments = new Promise(function (resolve, reject) {
  var names = [];
  for (var i = 0; i < args.torrents.length; i++) {
    if (args.torrents[i].match(/magnet:/)) {
      try {
        names[i] = Magnet.decode(args.torrents[i]).dn;
      } catch (e) {
        reject(e);
      }
    } else {
      var file;
      if (fs.existsSync(args.torrents[i])) {
        try {
          file = fs.readFileSync(args.torrents[i]);
        } catch (e) {
          reject(e);
        }
      }
      try {
        names[i] = ParseTorrentFile(file).name;
      } catch (e) {
        reject(e);
      }
    }
  }
  resolve(names);
});

function checkCustomOptions (path) {
  return new Promise(function (resolve, reject) {
    fs.statSync(path, function (err, stats) {
      if (err) {
        reject(Error('no such file or directory: "' + path));
      } else {
        if (stats.isDirectory(path)) {
          resolve(path);
        } else {
          reject(Error('"' + path + '" is not a directory'));
        }
      }
    });
  });
}

combineArgumentsAndConfig.then(function (connection) {
  checkTransmissionConnection(connection).then(function (session) {
    checkTorrentsArguments.then(function (names) {
      (function loop (i) {
        if (i < args.torrents.length) {
          new Promise((resolve, reject) => {
            inquirer.prompt({
              type: 'confirm',
              name: 'answer',
              message: 'Would you like to add the torrent: "' + names[i],
              default: true
            }).then(confirmation => {
              if (confirmation.answer) {
                inquirer.prompt({
                  type: 'input',
                  name: 'requested',
                  message: 'Choose the torrent\'s download-dir: (' + session['download-dir'] + ')'
                }).then(path => {
                  var options = {};
                  if (path.requested !== '') {
                    checkCustomOptions(path.requested).then(function (answer) {
                      if (answer) {
                        options = {'download-dir': answer};
                      }
                    }, function (err) {
                      console.error(err + '\nthe default download-dir will be used');
                    });
                  }
                  function transmissionAddUrlHandler (err, response) {
                    if (err) {
                      console.error('During torrent addition, the following error returned:\n' + err);
                      if (response) {
                        console.error('yet, it seems it has not failed completely and it returned the following response:');
                        console.error(JSON.stringify(response, null, 2));
                      }
                      exitWithConfirmation('', 1);
                    }
                  }
                  if (options !== {}) {
                    if (args.torrents[i].match(/magnet:/)) {
                      transmission.addUrl(args.torrents[i], transmissionAddUrlHandler);
                    } else {
                      transmission.addFile(args.torrents[i], transmissionAddUrlHandler);
                    }
                  } else {
                    if (args.torrents[i].match(/magnet:/)) {
                      transmission.addUrl(args.torrents[i], options, transmissionAddUrlHandler);
                    } else {
                      transmission.addFile(args.torrents[i], options, transmissionAddUrlHandler);
                    }
                  }
                });
              }
            });
          }).then(loop.bind(null, i + 1));
        }
      })(0);
    }, function (err) {
      exitWithConfirmation(err, 1);
    });
  }, function (err) {
    exitWithConfirmation(err, 3);
  });
}, function (err) {
  exitWithConfirmation(err, 4);
});
