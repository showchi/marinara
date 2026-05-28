import EventEmitter from 'events';

function isNoReceiverError(error) {
  return error && [
    'Could not establish connection. Receiving end does not exist.',
    'The message port closed before a response was received.'
  ].includes(error.message);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ServiceBroker
{
  constructor({ ownedServices = [] } = {}) {
    this.services = {};
    this.ownedServices = new Set(ownedServices);
    this.ready = Promise.resolve();
    chrome.runtime.onMessage.addListener(this.onMessage.bind(this));
  }

  static get instance() {
    if (!this._instance) {
      this._instance = new ServiceBroker();
    }
    return this._instance;
  }

  static register(service) {
    return this.instance.register(service);
  }

  static async invoke(call) {
    return await this.instance.invoke(call);
  }

  static setReady(ready) {
    this.instance.ready = ready;
  }

  register(service) {
    this.ownedServices.add(service.serviceName);
    this.services[service.serviceName] = service;
    return service;
  }

  unregister(service) {
    delete this.services[service.serviceName];
    return service;
  }

  own(...serviceNames) {
    for (let serviceName of serviceNames) {
      this.ownedServices.add(serviceName);
    }
  }

  async invoke({ serviceName, methodName, args }) {
    let service = this.services[serviceName];
    if (service) {
      if (service[methodName]) {
        // Service is defined in this context, call method directly.
        return await service[methodName](...args);
      } else {
        throw new Exception(`Invalid service request: ${serviceName}.${methodName}.`);
      }
    }

    // Service is defined in another context, use sendMessage to call it.
    return await this.invokeRemote({ serviceName, methodName, args });
  }

  async invokeRemote({ serviceName, methodName, args }) {
    let attempts = 0;
    while (true) {
      try {
        return await this.sendInvocation({ serviceName, methodName, args });
      } catch (error) {
        attempts++;
        if (!isNoReceiverError(error) || attempts >= 3) {
          throw error;
        }
        await delay(100 * attempts);
      }
    }
  }

  async sendInvocation({ serviceName, methodName, args }) {
    return await new Promise((resolve, reject) => {
      let message = { serviceName, methodName, args };
      chrome.runtime.sendMessage(message, response => {
        let lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        let { result, error } = response || {};
        if (error !== undefined) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  onMessage({ serviceName, methodName, args }, sender, respond) {
    if (methodName === undefined) {
      // This may be a service event broadcast, so we have nothing to do.
      return;
    }

    if (!this.ownedServices.has(serviceName)) {
      return;
    }

    (async () => {
      try {
        await this.ready;
        let service = this.services[serviceName];
        if (!service) {
          respond({ error: `Invalid service request: ${serviceName}.${methodName}.` });
          return;
        }

        if (!service[methodName]) {
          respond({ error: `Invalid service request: ${serviceName}.${methodName}.` });
          return;
        }

        respond({ result: await service[methodName](...args) });
      } catch (e) {
        console.error(e);
        respond({ error: `${e}` });
      }
    })();

    return true;
  }
}

class ServiceProxy extends EventEmitter
{
  constructor(serviceName) {
    super();
    this.serviceName = serviceName;
    this.listenerCount = 0;

    this.on('removeListener', () => {
      if (--this.listenerCount === 0) {
        chrome.runtime.onMessage.removeListener(this.onMessage);
      }
    });

    this.on('newListener', () => {
      if (++this.listenerCount === 1) {
        this.onMessage = this._onMessage.bind(this);
        chrome.runtime.onMessage.addListener(this.onMessage);
      }
    });
  }

  dispose() {
    this.removeAllListeners();
    chrome.runtime.onMessage.removeListener(this.onMessage);
  }

  get(target, prop, receiver) {
    if (this[prop]) {
      return this[prop];
    }

    const self = this;
    return async function() {
      const call = {
        serviceName: self.serviceName,
        methodName: prop,
        args: Array.from(arguments)
      };
      return await ServiceBroker.invoke(call);
    };
  }

  _onMessage({ serviceName, eventName, args }, sender, respond) {
    if (serviceName !== this.serviceName || eventName === undefined) {
      return;
    }

    this.emit(eventName, ...args);
  }
}

class Service
{
  constructor() {
    this.clients = {};
    this.serviceName = this.constructor.serviceName || this.constructor.name;
  }

  emit(eventName, ...args) {
    chrome.runtime.sendMessage({
      serviceName: this.serviceName,
      eventName,
      args
    }, () => {
      let lastError = chrome.runtime.lastError;
      if (lastError && !isNoReceiverError(lastError)) {
        console.error(lastError.message);
      }
    });
  }

  static get proxy() {
    const serviceName = this.serviceName || this.name;
    const create = () => new Proxy(function() {}, new ServiceProxy(serviceName));

    const handler = {
      construct(target, args) {
        return create();
      },
      get(target, prop, receiver) {
        // Support one-shot service invocations.
        // This creates a client, performs the RPC, then cleans up.
        // Example usage: let result = await SomeClient.once.doThing('abc', 123);

        if (prop !== 'once') {
          return undefined;
        }

        return new Proxy(function() {}, {
          get(target, prop, receiver) {
            return (...args) => {
              let client = create();
              try {
                return client[prop](...args);
              } finally {
                client.dispose();
              }
            };
          }
        });
      }
    };

    return new Proxy(function() {}, handler);
  }
}

export {
  Service,
  ServiceBroker
};
