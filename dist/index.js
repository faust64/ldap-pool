'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const ldap = require("ldapjs");
const chalk_1 = require("chalk");
const IS_DEBUG_LDAP_POOL = process.env.DEBUG_LDAP_POOL === 'yes';
let poolId = 0;
const log = {
    info: console.log.bind(console, chalk_1.default.blue('ldap-pool:')),
    error: console.error.bind(console, chalk_1.default.yellow('ldap-pool warning:'))
};
const clearActive = function (pool, c) {
    pool.active = pool.active.filter(function (v) {
        return v !== c;
    });
};
const clearInactive = function (pool, c) {
    pool.inactive = pool.inactive.filter(function (v) {
        return v !== c;
    });
};
const logSize = function (pool, event) {
    if (IS_DEBUG_LDAP_POOL) {
        log.info(event || '');
        log.info('added/created clients count => ', pool.numClientsAdded);
        log.info('destroyed clients count => ', pool.numClientsDestroyed);
        log.info('active clients count => ', pool.active.length);
        log.info('inactive clients count => ', pool.inactive.length);
        log.info('total clients count => ', pool.inactive.length + pool.active.length);
    }
};
class LDAPPool {
    constructor(opts) {
        this.id = ++poolId;
        this.size = opts.size;
        const connOpts = this.connOpts = opts.connOpts;
        this.connOpts.idleTimeout = this.connOpts.idleTimeout || 30000;
        this.active = [];
        this.inactive = [];
        this.dn = opts.dn;
        this.pwd = opts.pwd;
        this.waitingForClient = [];
        this.numClientsAdded = 0;
        this.numClientsDestroyed = 0;
        this.verbosity = opts.verbosity || 2;
        this.clientId = 1;
        assert(Number.isInteger(connOpts.idleTimeout) && connOpts.idleTimeout > 1000, 'idleTimeout option should be an integer greater than 100.');
        for (let i = 0; i < this.size; i++) {
            this.addClient();
        }
    }
    static create(opts) {
        return new LDAPPool(opts);
    }
    addClient() {
        let $opts = Object.assign({}, this.connOpts);
        $opts.idleTimeout = Math.round((Math.random() * $opts.idleTimeout * (1 / 3)) + $opts.idleTimeout * (5 / 6));
        if (IS_DEBUG_LDAP_POOL) {
            log.info(chalk_1.default.magenta('new idleTimeout value => ', String($opts.idleTimeout)));
        }
        let client = ldap.createClient($opts);
        client.poolClientId = this.clientId++;
        client.on('idle', () => {
            if (client.ldapPoolRemoved) {
                log.error(chalk_1.default.yellow(`client with id => ${client.poolClientId} is idle, but client has already been removed.`));
                return;
            }
            if (IS_DEBUG_LDAP_POOL) {
                log.info(chalk_1.default.yellow(`client with id => ${client.poolClientId} is idle.`));
            }
            ++this.numClientsDestroyed;
            logSize(this, 'event: idle');
            client.ldapPoolRemoved = true;
            this.addClient();
            clearActive(this, client);
            clearInactive(this, client);
            client.unbind(function () {
                client.destroy();
                client.removeAllListeners();
            });
        });
        client.on('error', (e) => {
            log.error(`client error (in client pool, id=${client.poolClientId}) => \n`, e.stack || e);
            if (client.ldapPoolRemoved) {
                return;
            }
            ++this.numClientsDestroyed;
            logSize(this, 'event: error');
            client.ldapPoolRemoved = true;
            this.addClient();
            clearActive(this, client);
            clearInactive(this, client);
            client.unbind(function () {
                client.destroy();
                client.removeAllListeners();
            });
        });
        client.bind(this.dn, this.pwd, function (err) {
            if (err) {
                log.error('Client bind error => ', err.stack || err);
                return;
            }
            if (IS_DEBUG_LDAP_POOL) {
                log.info('Successfully bound client.');
            }
        });
        logSize(this, 'event: add');
        this.inactive.push(client);
        ++this.numClientsAdded;
        client.returnToPool = () => {
            logSize(this, 'event: return to pool');
            if (client.ldapPoolRemoved) {
                return;
            }
            let fn = this.waitingForClient.pop();
            if (fn) {
                fn(client);
            }
            else {
                clearActive(this, client);
                clearInactive(this, client);
                this.inactive.unshift(client);
            }
        };
    }
    getClient() {
        logSize(this, 'event: get client');
        let c = this.inactive.pop();
        if (c) {
            clearInactive(this, c);
            clearActive(this, c);
            this.active.unshift(c);
            return Promise.resolve(c);
        }
        return new Promise(resolve => {
            this.waitingForClient.unshift(resolve);
        });
    }
    getClientSync() {
        logSize(this, 'event: get client sync');
        let c = this.inactive.pop();
        if (c) {
            clearInactive(this, c);
            clearActive(this, c);
            this.active.unshift(c);
            return c;
        }
        let oldestActive = this.active.length - 1;
        return this.active[oldestActive];
    }
    returnClientToPool(c) {
        logSize(this, 'event: return client to pool');
        if (c.ldapPoolRemoved) {
            return;
        }
        let fn = this.waitingForClient.pop();
        if (fn) {
            return fn(c);
        }
        clearActive(this, c);
        clearInactive(this, c);
        this.inactive.unshift(c);
    }
    ;
}
exports.LDAPPool = LDAPPool;
exports.Pool = LDAPPool;
exports.r2gSmokeTest = function () {
    return true;
};
