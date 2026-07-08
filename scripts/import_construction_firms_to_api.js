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
  const response = await axios.get(`${API_BASE}/api/construction-firms?active=`, { headers });
  return response.data.rows || [];
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node scripts/import_construction_firms_to_api.js <json-path>');
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
      public_contact: normalizeText(raw.public_contact),
      phone: normalizeText(raw.phone),
      email: normalizeText(raw.email).toLowerCase(),
      city: normalizeText(raw.city),
      regions: normalizeText(raw.regions),
      specialties: normalizeText(raw.specialties),
      website: normalizeText(raw.website),
      contact_status: normalizeText(raw.contact_status),
      priority: normalizeText(raw.priority),
      role: normalizeText(raw.role),
      manager_comment: normalizeText(raw.manager_comment),
      call_result: normalizeText(raw.call_result),
      contact_date: normalizeText(raw.contact_date),
      owner_name: normalizeText(raw.owner_name),
      notes: normalizeText(raw.notes),
      is_active: raw.is_active === false ? false : true,
    };

    const existing = byName.get(companyName.toLowerCase());
    if (!existing) {
      const response = await axios.post(`${API_BASE}/api/construction-firms`, payload, { headers });
      byName.set(companyName.toLowerCase(), response.data);
      inserted += 1;
      continue;
    }

    const merged = {
      ...existing,
      company_name: existing.company_name || payload.company_name,
      contact_name: existing.contact_name || payload.contact_name,
      public_contact: existing.public_contact || payload.public_contact,
      phone: existing.phone || payload.phone,
      email: existing.email || payload.email,
      city: existing.city || payload.city,
      regions: existing.regions || payload.regions,
      specialties: existing.specialties || payload.specialties,
      website: existing.website || payload.website,
      contact_status: existing.contact_status || payload.contact_status,
      priority: existing.priority || payload.priority,
      role: existing.role || payload.role,
      manager_comment: existing.manager_comment || payload.manager_comment,
      call_result: existing.call_result || payload.call_result,
      contact_date: existing.contact_date || payload.contact_date,
      owner_name: existing.owner_name || payload.owner_name,
      notes:
        !existing.notes ? payload.notes
        : !payload.notes || existing.notes.includes(payload.notes) ? existing.notes
        : `${existing.notes}\n\n${payload.notes}`,
      is_active: payload.is_active,
    };

    await axios.put(`${API_BASE}/api/construction-firms/${existing.id}`, merged, { headers });
    updated += 1;
  }

  console.log(JSON.stringify({ inserted, updated, skipped, api: API_BASE }, null, 2));
}

main().catch((err) => {
  const message = err.response?.data || err.message;
  console.error(typeof message === 'string' ? message : JSON.stringify(message, null, 2));
  process.exit(1);
});
