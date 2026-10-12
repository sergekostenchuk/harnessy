import test from 'node:test';
import assert from 'node:assert/strict';
import {safeDiagnostic} from './diagnostic.ts';
import {publicCatalogText} from './catalog-public.ts';

for(const input of ['credential=CredMarker!', 'api.key=Small!', '"credentials":"Short!"', 'access_token=Tiny!', 'password=Small!', 'cookie=Crumb!', 'authorization=Basic SecretValue', 'Bearer Tiny!', 'github_pat_Short!', 'AIzaSmall!', 'label_sk_short', 'secret="first\nsecond"'])test('350 r2: catalog and diagnostic reject the same credential marker: '+input.split(/[=: ]/)[0],()=>{
 assert.equal(publicCatalogText(input),false);const text=safeDiagnostic('service unavailable; '+input+'\ntrailing credential body');
 assert.match(text,/service unavailable/);assert.match(text,/скрыт/);assert.doesNotMatch(text,/CredMarker|Short|Tiny|Small|Crumb|SecretValue|short|first|second|trailing/);assert.equal(safeDiagnostic(text),text);
});
test('350 r2: redact before excerpt boundary; plain text and API routes stay useful',()=>{
 const reason='a '.repeat(295)+'credential='+'x'.repeat(60)+'!';assert.doesNotMatch(safeDiagnostic(reason),/credential|x/);
 assert.equal(safeDiagnostic('service unavailable (exit 7)'),'service unavailable (exit 7)');assert.equal(safeDiagnostic('/api/panes/:id/attempt',{route:true}),'/api/panes/:id/attempt');assert.equal(publicCatalogText('qwen-token-plan'),true);
});
