/* Load the published Daily Log package for the host app without copying its feature logic. */
(function (root) {
  'use strict';

  const packageUrl = new URL('../addons/tidyish-daily-log/', document.currentScript?.src || document.baseURI);
  root.TidyDailyLogReady = Promise.all([
    import(new URL('core.mjs?v=20261112-connected1', packageUrl).href),
    import(new URL('mount.mjs?v=20261112-connected1', packageUrl).href)
  ]).then(([core, mount]) => {
    root.TidyDailyLogCore = core;
    root.TidyDailyLogMount = mount;
    return true;
  }).catch(error => {
    root.TidyDailyLogError = error;
    return false;
  });
})(window);
