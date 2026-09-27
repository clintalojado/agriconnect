// In-process pub/sub over Server-Sent Events. Each browser opens one stream
// and subscribes to the participants it is signed in as ("farmer:3",
// "supplier:1"); services publish events to a participant key.
//
// Prototype limitation: this lives in memory, so it only works with a single
// backend process. Swap for Redis pub/sub (or similar) to scale out.

const subscribers = new Map(); // key -> Set<res>

function participantKey(type, id) {
  return `${type}:${id}`;
}

function subscribe(keys, res) {
  for (const key of keys) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(res);
  }
  return () => {
    for (const key of keys) {
      const set = subscribers.get(key);
      if (!set) continue;
      set.delete(res);
      if (set.size === 0) subscribers.delete(key);
    }
  };
}

function publish(key, event, data) {
  const set = subscribers.get(key);
  if (!set) return 0;
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(frame);
  return set.size;
}

function isOnline(key) {
  return (subscribers.get(key)?.size ?? 0) > 0;
}

module.exports = { participantKey, subscribe, publish, isOnline };
