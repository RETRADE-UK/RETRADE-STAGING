// Retired one-off feasibility probe. Result: staging host HTTP 403 on 2026-09-24.
// Retained as a disabled endpoint so a deployed diagnostic never becomes an open scanner.
Deno.serve(() => Response.json({error:'Probe retired. Source health is available in authenticated Monitors.'},{status:410}));
