import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {clientUuid,requestDigest} from '../apps/web/src/lib/browser-crypto';

test('HTTP LAN fingerprints match native SHA-256 across UTF-8 and block boundaries; UUIDs remain random v4',async()=>{
  const native=globalThis.crypto, descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  const inputs=['','abc','नमस्ते 🍽️','/api/commands'+JSON.stringify({action:'order',amount:12345}),...Array.from({length:140},(_,length)=>'a'.repeat(length)),randomBytes(65536).toString('base64')];
  for(const input of inputs)assert.equal(await requestDigest(input),createHash('sha256').update(input).digest('hex'));
  try{
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:native.getRandomValues.bind(native)}});
    for(const input of inputs)assert.equal(await requestDigest(input),createHash('sha256').update(input).digest('hex'));
    const ids=Array.from({length:1000},()=>clientUuid());
    assert.equal(new Set(ids).size,1000);
    for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  }finally{
    if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);
  }
});
