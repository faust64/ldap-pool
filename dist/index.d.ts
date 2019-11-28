import { Client } from 'ldapjs';
export interface IConnOpts {
    reconnect?: boolean;
    url: string;
    idleTimeout?: number;
}
export interface LDAPPoolOpts {
    size?: number;
    connOpts: IConnOpts;
    dn: string;
    pwd: string;
    verbosity?: number;
}
export interface LDAPPoolClient extends Client {
    returnToPool: Function;
    ldapPoolRemoved?: boolean;
    poolClientId: number;
}
export declare class LDAPPool {
    id: number;
    size: number;
    connOpts: IConnOpts;
    active: Array<LDAPPoolClient>;
    inactive: Array<LDAPPoolClient>;
    dn: string;
    pwd: string;
    waitingForClient: Array<Function>;
    clientId: number;
    numClientsAdded: number;
    numClientsDestroyed: number;
    verbosity: number;
    constructor(opts: LDAPPoolOpts);
    static create(opts: LDAPPoolOpts): LDAPPool;
    addClient(): void;
    getClient(): Promise<LDAPPoolClient>;
    getClientSync(): LDAPPoolClient;
    returnClientToPool(c: LDAPPoolClient): void;
}
export declare const Pool: typeof LDAPPool;
export declare const r2gSmokeTest: () => boolean;
