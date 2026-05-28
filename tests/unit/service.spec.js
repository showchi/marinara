import { assert } from 'chai';
import { ServiceBroker } from '@/Service';
import { PomodoroService } from '@/background/Services';

describe('ServiceBroker', () => {
  beforeEach(() => {
    global.chrome = {
      runtime: {
        lastError: null,
        onMessage: {
          addListener: () => {},
          removeListener: () => {}
        },
        sendMessage: () => {}
      }
    };
  });

  it('retries transient remote invocation failures while the background worker starts', async () => {
    let broker = new ServiceBroker();
    let attempts = 0;
    chrome.runtime.sendMessage = (message, callback) => {
      attempts++;
      if (attempts === 1) {
        chrome.runtime.lastError = {
          message: 'Could not establish connection. Receiving end does not exist.'
        };
        callback();
        chrome.runtime.lastError = null;
        return;
      }

      callback({ result: 'ok' });
    };

    let result = await broker.invoke({
      serviceName: 'RemoteService',
      methodName: 'getValue',
      args: []
    });

    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
  });

  it('does not retry non-transient remote invocation failures', async () => {
    let broker = new ServiceBroker();
    let attempts = 0;
    chrome.runtime.sendMessage = (message, callback) => {
      attempts++;
      chrome.runtime.lastError = {
        message: 'Unexpected failure.'
      };
      callback();
      chrome.runtime.lastError = null;
    };

    try {
      await broker.invoke({
        serviceName: 'RemoteService',
        methodName: 'getValue',
        args: []
      });
      assert.fail('Expected remote invocation to fail.');
    } catch (error) {
      assert.equal(error.message, 'Unexpected failure.');
    }

    assert.equal(attempts, 1);
  });

  it('ignores requests for services owned by another extension context', async () => {
    let broker = new ServiceBroker();
    let responded = false;
    let keepChannelOpen = broker.onMessage({
      serviceName: 'RemoteService',
      methodName: 'getValue',
      args: []
    }, {}, () => {
      responded = true;
    });

    await Promise.resolve();

    assert.isUndefined(keepChannelOpen);
    assert.isFalse(responded);
  });

  it('keeps requests open for owned services while the context starts', async () => {
    let broker = new ServiceBroker({ ownedServices: ['RemoteService'] });
    let resolveReady;
    broker.ready = new Promise(resolve => {
      resolveReady = resolve;
    });
    let response = null;
    let keepChannelOpen = broker.onMessage({
      serviceName: 'RemoteService',
      methodName: 'getValue',
      args: []
    }, {}, value => {
      response = value;
    });

    broker.register({
      serviceName: 'RemoteService',
      getValue: () => 'ok'
    });
    resolveReady();
    await broker.ready;
    await Promise.resolve();

    assert.isTrue(keepChannelOpen);
    assert.deepEqual(response, { result: 'ok' });
  });

  it('fails promptly when an owned service is still unavailable after startup', async () => {
    let broker = new ServiceBroker({ ownedServices: ['RemoteService'] });
    let response = null;

    broker.onMessage({
      serviceName: 'RemoteService',
      methodName: 'getValue',
      args: []
    }, {}, value => {
      response = value;
    });

    await Promise.resolve();

    assert.deepEqual(response, {
      error: 'Invalid service request: RemoteService.getValue.'
    });
  });

  it('responds with an error when a local service does not implement a method', async () => {
    let broker = new ServiceBroker();
    broker.register({
      serviceName: 'LocalService'
    });
    let response = null;

    broker.onMessage({
      serviceName: 'LocalService',
      methodName: 'missingMethod',
      args: []
    }, {}, value => {
      response = value;
    });

    await Promise.resolve();

    assert.deepEqual(response, {
      error: 'Invalid service request: LocalService.missingMethod.'
    });
  });

  it('defers remote pomodoro starts until after the RPC can respond', async () => {
    let started = false;
    let service = new PomodoroService({
      observe: () => {},
      start: () => {
        started = true;
      }
    });

    await service.start();
    assert.isFalse(started);

    await new Promise(resolve => setTimeout(resolve, 0));
    assert.isTrue(started);
  });
});
