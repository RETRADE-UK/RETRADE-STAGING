# Next feature: Vinted monitor

The user's priority is Vinted monitoring, followed by API work. Gestures are paused. Neither new feature is implemented by the repository cleanup.

Start from current `main` in `RETRADE-UK/RETRADE-STAGING` and create `feature/vinted-monitor`. Read the runtime ownership and staging baseline notes first. Confirm the intended sources, filters, notification destination and permitted data access in the next work chat before choosing the monitor's architecture.

Keep monitor code in its own feature directory; keep any server-side integration and credentials outside the public browser bundle. Register only necessary browser assets in `config/assets.js`. Test in the staging environment before promoting shared product code to live. Do not copy staging bindings, CNAME or test-login helper into production.

Gesture files in `experiments/gestures/` are historical source, not an enabled loader. The matching archive branch preserves the complete previous runnable staging tree. Do not resume them as part of monitor work.
