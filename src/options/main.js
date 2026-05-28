import Vue from 'vue';
import App from './App';
import router from './router';
import M from '../Messages';

Vue.config.productionTip = false;
Vue.config.devtools = false;

function logOptionsError(error, context = {}) {
  console.error('Options page error', {
    route: router.currentRoute && router.currentRoute.fullPath,
    message: error && error.message,
    stack: error && error.stack,
    ...context
  });
}

Vue.config.errorHandler = (error, vm, info) => {
  logOptionsError(error, {
    component: vm && vm.$options && (vm.$options.name || vm.$options._componentTag),
    info
  });
};

window.addEventListener('error', event => {
  logOptionsError(event.error || new Error(event.message), {
    source: event.filename,
    line: event.lineno,
    column: event.colno
  });
});

window.addEventListener('unhandledrejection', event => {
  let reason = event.reason;
  logOptionsError(reason instanceof Error ? reason : new Error(`${reason}`), {
    type: 'unhandledrejection'
  });
});

Vue.mixin({
  computed: {
    M() {
      return M;
    }
  }
});

new Vue({
  router,
  render: h => h(App)
}).$mount('#app');
