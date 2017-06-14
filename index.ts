'use strict';

import Timer = NodeJS.Timer;

//core
const util = require('util');

//npm
const ldap = require('ldapjs');

//project
let poolId = 0;


//////////////////////////////////////////////////////////////////////


export interface IConnOpts {
  reconnect: boolean,

}


export interface ILDAPPoolOpts {
  id: number;
  size: number;
  connOpts: IConnOpts;
  active: Array<any>;
  inactive: Array<any>;
  dn: string;
  pwd: string;
  waitingForClient: Array<Function>,
  clientId: number;
}

export interface IClient {
  __inactiveTimeoutX: Timer,
  bind: Function,
  unbind: Function
  destroy: Function,
  returnToPool: Function
}


function createTimeout(pool: Pool, client: IClient, timeout?: number) {

  client.__inactiveTimeoutX = setTimeout(function () {

    let isDestroyable = false;
    pool.inactive = pool.inactive.filter(function (v) {
      if (v === client) {
        isDestroyable = true;
        return false;
      }
      return true;
    });

    if (isDestroyable) {
      client.unbind(function () {
        client.destroy();
      });
    }

  }, timeout || 30000);

}

function clearActive(pool: Pool, c: IClient) {
  pool.active = pool.active.filter(function (v) {
    return v !== c;
  });
}

function clearInactive(pool: Pool, c: IClient) {
  pool.inactive = pool.inactive.filter(function (v) {
    return v !== c;
  });
}


export class Pool {

  id: number;
  size: number;
  connOpts: any;
  active: Array<IClient>;
  inactive: Array<IClient>;
  dn: string;
  pwd: string;
  waitingForClient: Array<Function>;
  clientId: number;

  constructor(opts: ILDAPPoolOpts) {

    this.id = ++poolId;
    this.size = opts.size;
    this.connOpts = opts.connOpts;
    this.active = [];
    this.inactive = [];
    this.dn = opts.dn;
    this.pwd = opts.pwd;
    // these are resolve functions waiting to be called
    this.waitingForClient = [];

    this.clientId = 1;

    for (let i = 0; i < this.size; i++) {
      this.addClient();
    }

  }

  static create(opts: ILDAPPoolOpts) {
    return new Pool(opts);
  }

  addClient(): void {

    let client = ldap.createClient(this.connOpts);

    client.cdtClientId = this.clientId++;

    client.on('idle', () => {
      console.log(`client with id => ${client.cdtClientId} is idle.`);
      clearActive(this, client);
      clearInactive(this, client);
      this.addClient();
      client.unbind(function(){
        client.destroy();
      });
    });

    client.on('error',  (e: Error) =>  {
      console.error(` => LDAP client error (in client pool, id=${client.cdtClientId}) => `, e.stack || e);
      clearActive(this, client);
      clearInactive(this, client);
      this.addClient();
      client.unbind(function(){
        client.destroy();
      });
    });

    client.bind(this.dn, this.pwd, function (err: Error) {
      if (err) {
        console.error(err);
      }
      else {
        console.log('Successfully bound client.');
      }
    });

    this.inactive.push(client);

    client.returnToPool = () => {

      let fn;

      if (fn = this.waitingForClient.pop()) {
        fn(client);
      }
      else {

        clearActive(this, client);
        this.inactive.unshift(client);
        // createTimeout(this, client);

      }

    };
  }

  getClient(): Promise<IClient> {

    let c = this.inactive.pop();

    if (c) {
      this.active.unshift(c);
      return Promise.resolve(c);
    }
    else {
      return new Promise(resolve => {
        this.waitingForClient.unshift(resolve);
      });
    }

  }


  getClientSync(): IClient {

    let c;
    if (c = this.inactive.pop()) {
      clearTimeout(c.__inactiveTimeoutX);
      this.active.unshift(c);
      return c;
    }

    let oldestActive = this.active.length - 1;
    return this.active[oldestActive];

  }


  returnClientToPool(c: IClient): void {

    let fn;

    if (fn = this.waitingForClient.pop()) {
      fn(c);
    }
    else {

      clearActive(this, c);
      this.inactive.unshift(c);
      // createTimeout(this, c);
    }

  };


}


let $exports = module.exports;
export default $exports;


