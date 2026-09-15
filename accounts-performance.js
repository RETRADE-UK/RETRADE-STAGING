/* RETRADE Accounts / Partners interaction polish v1.0.0
 *
 * Presentation-only fixes for account list responsiveness.
 * Account rows currently reuse .run-history-row; keep that DOM contract but
 * override broad/legacy transitions on this page with one cheap colour change.
 * No accounting, persistence, lifecycle or Supabase behaviour is changed.
 */
(function(){
  'use strict';

  var old=document.getElementById('rt-accounts-performance-css');
  if(old)old.remove();

  var s=document.createElement('style');
  s.id='rt-accounts-performance-css';
  s.textContent=[
    '.rt #p-accounts .run-history-row{touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:background-color 70ms ease-out!important;transform:none!important;filter:none!important;will-change:auto!important;}',
    '@media(hover:hover) and (pointer:fine){.rt #p-accounts .run-history-row:hover{background:var(--surface-2)!important;}}',
    '@media(prefers-reduced-motion:reduce){.rt #p-accounts .run-history-row{transition:none!important;}}'
  ].join('\n');
  document.head.appendChild(s);
})();
