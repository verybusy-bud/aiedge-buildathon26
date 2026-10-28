import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoEvents } from '../lib/demo';
import { matchesSearch, relatedEvents } from '../lib/discovery';

test('Theme keywords find related stories without requiring the literal word',()=>{
 const events=demoEvents();
 assert.ok(events.filter(e=>matchesSearch(e,'traffic')).some(e=>e.id==='demo-road'));
 assert.deepEqual(events.filter(e=>matchesSearch(e,'','Food')).map(e=>e.id),['demo-market']);
 assert.deepEqual(events.filter(e=>matchesSearch(e,'special events riverfront')).map(e=>e.id),['demo-festival']);
 assert.equal(events.filter(e=>matchesSearch(e,'pizza no-such-place')).length,0);
 assert.equal(matchesSearch(events[1],'traffic Phillips','Traffic'),true);
 assert.equal(matchesSearch(events[1],'traffic Phillips','Food'),false);
});

test('Related event suggestions use headline, location and observation time',()=>{
 const events=demoEvents();const when=events[1].reports[0].observed_at;
 assert.equal(relatedEvents(events,'Phillips & 8th lane closure','Downtown · 8th Street',when)[0]?.id,'demo-road');
 assert.equal(relatedEvents(events,'Phillips & 8th lane closure','Unrelated neighborhood',when).length,0);
 assert.equal(relatedEvents(events,'Phillips & 8th lane closure','Downtown · 8th Street','2000-01-01T00:00:00Z').length,0);
 assert.equal(relatedEvents(events,'x','','invalid').length,0);
});
