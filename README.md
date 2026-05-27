# BODEX Virtual Office

Local CRM and virtual office for BODEX Bulgaria.

## What It Does

- Pulls operational data from Google Sheets.
- Syncs Facebook Ads campaigns and Facebook Lead Forms.
- Shows real Facebook leads in CRM.
- Matches Facebook leads against the `МАТЕРИАЛЫ` Google Sheet so already-called leads are not shown as new.
- Provides worker sections for Rostislav, Mark, Maria and Steve.

## Local Start

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

## Environment

Put real credentials only in `.env`.

Required integrations:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SPREADSHEET_ID`
- `FB_APP_ID`
- `FB_APP_SECRET`
- `FB_ACCESS_TOKEN`
- `FB_AD_ACCOUNT_ID`

Do not commit `.env`, `data/`, `node_modules/`, or SQLite files.

## Deploy By IP

For now the simplest deployment is a VPS with a public IP:

```bash
git clone <repo-url>
cd bodex-office
npm install
cp .env.example .env
npm start
```

Then open:

```text
http://SERVER_IP:3000
```

For stable production use, run the app with a process manager such as PM2 and put Nginx in front when a domain is ready.
