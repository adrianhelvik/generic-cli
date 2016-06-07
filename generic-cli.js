var args = process.argv.slice(2);
var colors = require('colors');
var clone = require('clone');
var padRight = require('pad-right');
var assert = require('assert');
var dumpKeysRecursively = require('recursive-keys').dumpKeysRecursively;
var leftPad = require('left-pad');
var decamelize = require('decamelize');
var camelcase = require('camelcase');
var readline = require('readline');
var extendObject = require('extend');

module.exports = function ({ help = {}, commands = {}, extend = {} }) {

    // Verify that there is a 1-1 correspondence between commands and help
    // -------------------------------------------------------------------

    try {
        assert.deepEqual((() => {
            let c = clone(commands);
            return dumpKeysRecursively(c)
                .sort();
        })(), (() => {
            return dumpKeysRecursively(help)
                .filter(item => ! item.includes('._'))
                .sort();
        })());
    } catch (err) {
        console.log(err);
        throw Error('The help menu and the commands don\'t have the same entries (fields starting with _ are ignored)'.red);
    }

    // ---

    var cmd = args.shift();

    if (! cmd) {
        console.log('\nNo argument given\n'.red);

        renderHelp({ cmd: 'all' })
        process.exit();
    } else {
        let handler = commandOption(cmd);

        if (typeof handler == 'function') {
            let argsHash = generateHash(getArgs(handler), args);
            let that = extendObject(thisArg(cmd, argsHash), extend);
            console.log();

            handler.apply(that, args);
        }
        else if (typeof handler == 'object') {
            console.log(('\n' + cmd + ' is only a partial command\n').red);
            renderHelp({ cmd: cmd });
        }
        else {
            console.log('\nCommand not found\n'.red);
            renderHelp({ cmd: 'all' });
        }
    }

    // ---

    function commandOption(cmd) {
        return splitOption(cmd, commands);
    }

    function helpOption(cmd) {
        return splitOption(cmd, help);
    }

    function splitOption(cmd, target) {
        let fields = cmd.split(':');
        let open = target;

        while (fields.length) {
            let curr = fields.shift();
            if (typeof open != 'object' || ! curr || ! open[curr]) {
                return false;
            }
            open = open[curr];
        }

        return open;
    }

    function renderHelp({cmd, parent, indent = 0, keyStack = []}) {

        if (! parent)
            parent = help;

        if (! cmd)
            cmd = 'all';

        if (typeof cmd === 'string') {
            let result = '';

            Object.keys(parent)
                .filter(key => key !== '_')
                .filter(key => (key === cmd || cmd === 'all'))
                .forEach(key => {
                    var hasChildren = typeof parent[key] == 'object';
                    let keys = clone(keyStack);
                    keys.push(key);

                    if (! hasChildren && ! indent) {
                        indent += 1;
                    }

                    let leftSide = padRight('    '.repeat(indent) + keys.join(':'), 30, ' ');

                    if (hasChildren) {
                        let rightSide = parent[key]._ || '';
                        console.log(keys.join(':').yellow + ' - ' + rightSide.gray);
                        renderHelp({
                            cmd: 'all',
                            parent: parent[key],
                            indent: indent + 1,
                            keyStack: keys
                        });
                    } else {
                        let args = getArgs(commandOption(keys.join(':')))
                            .map(s => camelcase(s)) // normalize to camel case
                            .map(s => decamelize(s, ' ')) // change camel case to spaces
                            .join(', ');
                        console.log(leftSide.green + padRight(parent[key], 25, ' ') + (' Arguments: ' + args).cyan);
                    }
                })

                return result;
        }
        else {
            throw TypeError();
        }
    }
}

function getArgs(fn) {
    let str = fn.toString();
    let start = str.indexOf('(') + 1;
    let end = str.indexOf(')');
    return str.substring(start, end)
        .split(',')
        .map(s => s.trim());
}

function generateHash(keys, vals) {
    let result = {};

    for (let i = 0; i < keys.length; i++) {
        result[keys[i]] = vals[i];
    }

    return result;
}

function thisArg(cmd, argsHash) {
    return {
        get cmd() {
            return cmd;
        },
        get args() {
            return argsHash;
        },
        error(msg) {
            let a = padRight('command:', 10, ' ') + cmd;
            let b = padRight('Error:', 10, ' ') + msg;
            console.log(a.cyan);
            console.log(b.toString().red);
            process.exit();
        },
        assertMatches(str, regExp) {
            if (! regExp.test(str + '')) {
                this.error('"' + str + '" did not match ' + regExp);
            }
        },
        assertArgs(args) {
            for (let key of Object.keys(args)) {
                if (args[key] instanceof RegExp) {
                    this.assertMatches(argsHash[key], args[key]);
                }
                if (typeof args[key] == 'function') {
                    if (! args[key](argsHash[key])) {
                        this.error('Illegal argument');
                    }
                }
            }
        },
        success(msg) {
            console.log(msg.green);
        },
        require(arg) {
            if (! Object.keys(argsHash).includes(arg)) {
                this.error('Can only require arguments that the command can be given: arg: ', arg)
            }
            if (! argsHash[arg]) {
                this.error('<' + decamelize(arg, ' ') + '> is a required argument');
            }
        },
        requireArgs() {
            Object.keys(argsHash).forEach(arg => {
                this.require(arg);
            });
        },
        ask(question, cb) {
            let rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            return new Promise((res, rej) => {
                askQuestion((err, answer) => {
                    res(answer);
                });
            });

            function askQuestion() {
                rl.question((question + ' (y[es]/n[o]) ').cyan, (answer) => {
                    answer = answer.toLowerCase();
                    if (answer === 'y' || answer === 'yes') {
                        rl.close();
                        cb(null, true);
                    }
                    else if (answer === 'n' || answer === 'no') {
                        rl.close();
                        cb(null, false);
                    }
                    else {
                        console.log('Not a valid answer!'.red);
                        askQuestion(cb);
                    }
                });
            }
        },
        info(msg) {
            console.log(msg.yellow);
        }
    }
}

