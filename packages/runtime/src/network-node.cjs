'use strict';
// Node programs receive this per-process preload, never a mutation of the engine globals.
const http = require('node:http'), https = require('node:https');
const {EnvHttpProxyAgent, setGlobalDispatcher} = require('undici');
const proxy = new URL(process.env.HARNESS_RELAY_PROXY);
if (proxy.protocol !== 'http:' || proxy.hostname !== '127.0.0.1' || !proxy.port || proxy.username !== 'harnessy' || !/^[A-Za-z0-9_-]{43}$/.test(proxy.password)) throw new Error('network_unavailable');
const [major, minor] = process.versions.node.split('.').map(Number);
if (!(major === 22 && minor >= 21 || major === 24 && minor >= 5 || major > 24)) throw new Error('network_unavailable: Node proxy support requires Node 22.21+ or 24.5+');
const proxyEnv = {HTTP_PROXY:proxy.href, HTTPS_PROXY:proxy.href, NO_PROXY:'localhost,127.0.0.1,[::1],::1'};
http.globalAgent = new http.Agent({proxyEnv});
https.globalAgent = new https.Agent({proxyEnv});
setGlobalDispatcher(new EnvHttpProxyAgent({httpProxy:proxy.href,httpsProxy:proxy.href,noProxy:proxyEnv.NO_PROXY}));
