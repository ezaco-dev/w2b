import { executionContext } from './context.js';

export let globalConfig = {
  Owner: "",
  GrubOnly: false,
  PrivateOnly: false,
  OwnerOnly: false,
  AdminOnly: false,
  Prefix: ""
};

let isGlobalSetupDone = false;
let lastSetupConfig = null;

export function Setup(config) {
  const currentCtx = executionContext.getStore();
  if (currentCtx) {
    Object.assign(currentCtx.config, config);
  } else {
    if (!isGlobalSetupDone) {
      isGlobalSetupDone = true;
      Object.assign(globalConfig, config);
    } else {
      lastSetupConfig = config;
    }
  }
}

export function attachActionConfig(action) {
  if (lastSetupConfig && action && typeof action === 'object') {
    action.config = { ...lastSetupConfig };
    lastSetupConfig = null;
  }
  return action;
}

export function resetGlobalConfig() {
  globalConfig.Owner = "";
  globalConfig.GrubOnly = false;
  globalConfig.PrivateOnly = false;
  globalConfig.OwnerOnly = false;
  globalConfig.AdminOnly = false;
  globalConfig.Prefix = "";
  isGlobalSetupDone = false;
  lastSetupConfig = null;
}
