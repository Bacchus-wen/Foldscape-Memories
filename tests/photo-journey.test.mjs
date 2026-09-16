import assert from 'node:assert/strict';
import test from 'node:test';
import { samplePhotoJourney, photoPlacement, createPhotoJourney } from '../src/iphone-duo/photo-journey.js';

test('starts alone, shrinks to 77 percent, then locks framing', () => {
  const start = samplePhotoJourney(0, 4), arrived = samplePhotoJourney(1, 4);
  assert.equal(start.reveal, 0);
  assert.equal(start.cursor, 0);
  assert.equal(arrived.scale / start.scale, .77);
  for (const position of [1.1, 2, 2.8, 4]) assert.equal(samplePhotoJourney(position, 4).scale, arrived.scale);
});

test('photographs retain their small size throughout reception and release', () => {
  const initialWidth = photoPlacement(1, samplePhotoJourney(1, 4)).width;
  assert.equal(initialWidth, .68, 'cards are twice the previous .34 width');
  for (let position = 0; position <= 4; position += .01) {
    const frame = samplePhotoJourney(position, 4);
    for (let index = 0; index < 4; index++) {
      assert.ok(photoPlacement(index, frame).width <= initialWidth + 1e-9, `photo ${index} enlarged at ${position}`);
    }
  }
});

test('queued card spacing is twice the previous .12 gap', () => {
  const frame = samplePhotoJourney(1, 4);
  const a = photoPlacement(1, frame), b = photoPlacement(2, frame);
  assert.ok(Math.abs(b.center - a.center - (a.width + b.width) / 2 - .24) < 1e-8);
});

test('mid-transfer shows a small photograph crossing each device edge', () => {
  const frame = samplePhotoJourney(1.5, 4);
  for (const [index, edge] of [[0, 0], [1, 1]]) {
    const card = photoPlacement(index, frame);
    assert.ok(Math.abs(card.center - edge) < card.width * .1);
    assert.ok(card.width < 1);
  }
  assert.equal(samplePhotoJourney(1.2, 4).transfer, 0, 'screen waits for reception');
  assert.equal(samplePhotoJourney(1.95, 4).transfer, 1, 'screen settles before the next transfer');
});

test('photo layout is continuous through introduction, transfer and next-photo boundaries', () => {
  for (const boundary of [1, 1.18, 1.82, 2, 2.18, 2.82, 3, 4]) {
    const before = samplePhotoJourney(boundary - 1e-7, 4), after = samplePhotoJourney(boundary + 1e-7, 4);
    for (let index = 0; index < 4; index++) {
      const a = photoPlacement(index, before), b = photoPlacement(index, after);
      assert.ok(Math.abs(a.center - b.center) < 1e-5, `center ${boundary}/${index}`);
      assert.ok(Math.abs(a.width - b.width) < 1e-5, `width ${boundary}/${index}`);
    }
  }
});

test('scrubbing backward visits identical frames and bounds the collection', () => {
  const positions = [0, .3, .8, 1, 1.4, 1.7, 2, 3.4, 4];
  const frames = positions.map(position => samplePhotoJourney(position, 4));
  positions.reverse().forEach((position, i) => assert.deepEqual(samplePhotoJourney(position, 4), frames.at(-1 - i)));
  assert.deepEqual(samplePhotoJourney(-10, 4), samplePhotoJourney(0, 4));
  assert.deepEqual(samplePhotoJourney(20, 4), samplePhotoJourney(4, 4));
});

test('queued photographs stay clear of photographs passing through the device', () => {
  for (let value = 1; value <= 4; value += .025) {
    const frame = samplePhotoJourney(value, 4);
    const cards = Array.from({ length: 4 }, (_, index) => photoPlacement(index, frame));
    for (let i = 1; i < cards.length; i++) {
      const previousRight = cards[i - 1].center + cards[i - 1].width / 2;
      const nextLeft = cards[i].center - cards[i].width / 2;
      assert.ok(nextLeft >= previousRight - 1e-8, `photographs ${i - 1}/${i} overlap at ${value}`);
    }
  }
});

test('new input interrupts the active journey instead of queuing stale photographs', () => {
  let position;
  const driver = createPhotoJourney({ count: 4, onUpdate: value => { position = value; } });
  driver.seek(2.5, true);
  driver.seek(4);
  driver.seek(1.5, true);
  assert.equal(position, 1.5);
  assert.equal(driver.target(), 1.5);
  driver.dispose();
});

test('a hidden tab can pause a return without losing its destination', async () => {
  const driver = createPhotoJourney({ count: 4, onUpdate() {} });
  driver.seek(2, true);
  driver.setPaused(true);
  driver.seek(0, false, .06);
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(driver.value(), 2);
  assert.equal(driver.target(), 0);
  driver.setPaused(false);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(driver.value(), 0);
  driver.dispose();
});
