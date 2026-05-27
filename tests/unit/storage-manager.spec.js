import { assert } from 'chai';
import StorageManager from '@/background/StorageManager';
import { SettingsSchema } from '@/background/Settings';

class Schema
{
  get version() {
    return 1;
  }

  get default() {
    return {
      value: [],
      version: this.version
    };
  }
}

class MemoryStorage
{
  constructor(payload = {}) {
    this.payload = payload;
    this.clearCount = 0;
  }

  async get(keys = null) {
    if (!keys) {
      return { ...this.payload };
    }

    return keys.reduce((result, key) => {
      if (Object.prototype.hasOwnProperty.call(this.payload, key)) {
        result[key] = this.payload[key];
      }
      return result;
    }, {});
  }

  async set(payload) {
    this.payload = {
      ...this.payload,
      ...payload
    };
  }

  async clear() {
    this.clearCount++;
    this.payload = {};
  }
}

describe('StorageManager', () => {
  it('ignores unrelated keys in shared extension storage', async () => {
    let storage = new MemoryStorage({
      timer: { state: 1 }
    });
    let manager = new StorageManager(new Schema(), storage);

    let payload = await manager.get();

    assert.deepEqual(payload, {
      value: [],
      version: 1
    });
    assert.deepEqual(storage.payload.timer, { state: 1 });
    assert.equal(storage.clearCount, 0);
  });

  it('keeps legacy keys available while upgrading settings', async () => {
    let storage = new MemoryStorage({
      focus: {
        duration: 25,
        desktopNotification: true,
        newTabNotification: true,
        sound: null
      },
      break: {
        duration: 5,
        desktopNotification: true,
        newTabNotification: false,
        sound: null
      },
      version: 1,
      timer: { state: 1 }
    });
    let manager = new StorageManager(new SettingsSchema(), storage);

    let settings = await manager.get();

    assert.equal(settings.version, 7);
    assert.equal(settings.shortBreak.duration, 5);
    assert.isFalse(settings.shortBreak.notifications.tab);
    assert.notProperty(settings, 'break');
    assert.deepEqual(storage.payload.timer, { state: 1 });
    assert.equal(storage.clearCount, 0);
  });
});
