import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectText } from './check-public-data.mjs';
const policy={entities:['switch.desktop_main_power']};
test('publication rejects local network addresses and private installation paths',()=>{
  const ip=[192,168,2,45].join('.');
  assert.ok(inspectText(ip,policy).length);
  assert.ok(inspectText('D:'+String.fromCharCode(92)+'Users'+String.fromCharCode(92)+'private',policy).length);
  assert.deepEqual(inspectText('http://homeassistant.local:8123',policy),[]);
});
test('publication detects local names and unreviewed entity identifiers',()=>{
  assert.ok(inspectText('PrivateDevice',policy,['PrivateDevice']).length);
  assert.ok(inspectText('switch.'+'unreviewed_device',policy).length);
  assert.deepEqual(inspectText('switch.desktop_main_power',policy),[]);
});
