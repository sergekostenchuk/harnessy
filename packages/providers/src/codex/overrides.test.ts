import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'smol-toml';
import {argumentsFor,configServers,overrides} from './overrides.ts';
import {fixture} from '../test-support.ts';
test('quoted/dotted MCP names and TOML strings cannot inject overrides',()=>{
 assert.deepEqual(configServers('[mcp_servers."a.b"]\ncommand="x"\n[mcp_servers.other]\ncommand="y"'),['a.b','other']);
 const f=fixture();f.seat.cwd='/path with "quotes"';f.ctx.appUrl='http://localhost/"quoted"';
 const values=overrides(f.seat,f.ctx,'fictional-token',['a.b','panes'],null),args=argumentsFor(values);
 assert.equal(args[0],'app-server');assert.ok(args.filter(a=>a==='-c').length===values.length);
 assert.ok(values.includes('mcp_servers."a.b".enabled=false'));
 const envLine=values.find(s=>s.startsWith('mcp_servers.panes.env='))!;
 const parsed=parse(envLine) as {mcp_servers:{panes:{env:Record<string,string>}}};
 assert.equal(parsed.mcp_servers.panes.env.PANE_TOKEN,'fictional-token');assert.equal(parsed.mcp_servers.panes.env.PANE_ID,'worker');
 assert.throws(()=>configServers('invalid = ['));
});

test('own bridge stays enabled and empty roots override inherited write access',()=>{
 const f=fixture();f.ctx.writableRoots=[];
 const values=overrides(f.seat,f.ctx,'token',['panes','other']);
 assert.ok(values.includes('mcp_servers.panes.enabled=true'));
 const line=values.find(s=>s.startsWith('sandbox_workspace_write.writable_roots='))!;
 const parsed=parse(line) as {sandbox_workspace_write:{writable_roots:unknown}};
 assert.deepEqual(parsed.sandbox_workspace_write.writable_roots,[]);
});
