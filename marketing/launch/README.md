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
