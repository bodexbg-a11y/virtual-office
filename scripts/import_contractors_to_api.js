#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'https://virtual-office-f48m.onrender.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1111';

function normalizeText(value) {
  return String(value || '').trim();
}

async function login() {
  const response = await axios.post(`${API_BASE}/api/auth/login`, { password: ADMIN_PASSWORD });
  return response.data.token;
}

async function fetchExisting(headers) {
  const response = await axios.get(`${API_BASE}/api/contractors?active=`, { headers });
  return response.data.rows || [];
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node scripts/import_contractors_to_api.js <json-path>');
  }

  const items = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const token = await login();
  const headers = { 'X-Admin-Token': token, 'Content-Type': 'application/json' };
  const existingRows = await fetchExisting(headers);
  const byName = new Map(
    existingRows.map((row) => [normalizeText(row.company_name).toLowerCase(), row])
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of items) {
    const companyName = normalizeText(raw.company_name);
    if (!companyName) {
      skipped += 1;
      continue;
    }

    const payload = {
      company_name: companyName,
      contact_name: normalizeText(raw.contact_name),
      phone: normalizeText(raw.phone),
      email: normalizeText(raw.email).toLowerCase(),
      city: normalizeText(raw.city),
      regions: normalizeText(raw.regions),
      specialties: normalizeText(raw.specialties),
      notes: normalizeText(raw.notes),
      is_active: raw.is_active === false ? false : true,
    };

    const existing = byName.get(companyName.toLowerCase());
    if (!existing) {
      const response = await axios.post(`${API_BASE}/api/contractors`, payload, { headers });
      byName.set(companyName.toLowerCase(), response.data);
      inserted += 1;
      continue;
    }

    const merged = {
      ...existing,
      company_name: existing.company_name || payload.company_name,
      contact_name: existing.contact_name || payload.contact_name,
      phone: existing.phone || payload.phone,
      email: existing.email || payload.email,
      city: existing.city || payload.city,
      regions: existing.regions || payload.regions,
      specialties: existing.specialties || payload.specialties,
      notes:
        !existing.notes ? payload.notes
        : !payload.notes || existing.notes.includes(payload.notes) ? existing.notes
        : `${existing.notes}\n\n${payload.notes}`,
      is_active: payload.is_active,
    };

    await axios.put(`${API_BASE}/api/contractors/${existing.id}`, merged, { headers });
    updated += 1;
  }

  console.log(JSON.stringify({ inserted, updated, skipped, api: API_BASE }, null, 2));
}

main().catch((err) => {
  const message = err.response?.data || err.message;
  console.error(typeof message === 'string' ? message : JSON.stringify(message, null, 2));
  process.exit(1);
});
