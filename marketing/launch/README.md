# RETRADE launch preview

The marketing build records a six-item car boot haul in the populated developer account at https://test.retrade-uk.com, then renders the landing and sign-up preview, a vertical creator video and tagged campaign links. The fixture uses example purchases and sales. Recording passes the account and environment checks before writing test stock. Each capture checks the totals against the app.

Install the normal repository dependencies, Playwright Chromium, Python 3.10+, Pillow, FFmpeg/ffprobe and DejaVu Sans. From the repository root run:

```sh
python -m pip install -r marketing/launch/requirements.txt
python marketing/launch/build.py --refresh
node marketing/launch/workflow/check.cjs marketing/launch/output/RETRADE-launch-preview.html .
python marketing/launch/workflow/check_report.py
```

The first build creates both real recordings. Subsequent local builds reuse them unless launched with --refresh. The GitHub Actions workflow attaches refreshed review files after successful staging Pages deployments. Repository-internal marketing pull requests also exercise the generator. The output includes a standalone HTML file, a lightweight web directory, campaign links and a creator clip. To emit the web directory locally, run:

```sh
python marketing/launch/workflow/web_assets.py marketing/launch/output/RETRADE-launch-preview.html marketing/launch/output/web
```

The sign-up form demonstrates registration and email confirmation with sample details. Campaign links default to a proposed /start/ route and can be pointed at a published campaign URL with --landing. Build output and credentials do not belong in Git.


## Staging review route

Open https://test.retrade-uk.com/start/ for the reviewed landing page and
https://test.retrade-uk.com/start/#signup for sample registration. The staging
app and developer account stay at the root. Capture uses the app's native dark
preference, high-density frames, and chapter markers from the actual interactions.
The page plays the portrait or desktop edit appropriate to its viewport.

To update the served snapshot, export the approved build from the repository root:

```sh
python marketing/launch/workflow/web_assets.py marketing/launch/output/RETRADE-launch-preview.html start
npm run build
```

Commit the refreshed start directory with the source change. The filenames are
stable, and the generated page versions each media URL by content. The staging
Pages deployment checks the page and both videos before uploading them.
