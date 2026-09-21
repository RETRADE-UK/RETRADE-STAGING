/* RETRADE staging-only gesture manifest G1.
 *
 * This file is the boundary between production and unfinished gesture work.
 * Production must never load this file. Shared product modules should remain
 * byte-for-byte production wherever possible.
 */
(function(){
  'use strict';
  window.__RETRADE_GESTURE_EXPERIMENT__='G1';
  window.__rtStagingGestureManifest={
    early:[
      './gesture-back-v31.js',
      './gesture-native-v3.js',
      './gesture-native-v3-actions.js',
      './gesture-live-tracking.js',
      './interaction-system-v2.js',
      './surface-gestures-v2.js'
    ],
    charts:[
      './chart-gesture-v2.js'
    ]
  };
})();
