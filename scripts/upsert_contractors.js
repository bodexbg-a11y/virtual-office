#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../server/db');

async function ensureContractorsTable() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contractors (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      regions TEXT,
      specialties TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_contractors_company_name ON contractors(company_name);
    CREATE INDEX IF NOT EXISTS idx_contractors_city ON contractors(city);
    CREATE INDEX IF NOT EXISTS idx_contractors_is_active ON contractors(is_active);
  `);
}

function normalizeText(value) {
  return String(value || '').trim();
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node scripts/upsert_contractors.js <json-path>');
  }

  const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const items = JSON.parse(raw);
  await ensureContractorsTable();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const companyName = normalizeText(item.company_name);
    if (!companyName) {
      skipped += 1;
      continue;
    }

    const existing = await db.get(
      'SELECT id, company_name, contact_name, phone, email, city, regions, specialties, notes, is_active FROM contractors WHERE lower(company_name) = lower(?) LIMIT 1',
      [companyName]
    );

    const payload = {
      company_name: companyName,
      contact_name: normalizeText(item.contact_name),
      phone: normalizeText(item.phone),
      email: normalizeText(item.email).toLowerCase(),
      city: normalizeText(item.city),
      regions: normalizeText(item.regions),
      specialties: normalizeText(item.specialties),
      notes: normalizeText(item.notes),
      is_active: item.is_active === false ? false : true,
    };

    if (existing) {
      await db.query(
        `UPDATE contractors
         SET contact_name = CASE WHEN coalesce(contact_name, '') = '' THEN ? ELSE contact_name END,
             phone = CASE WHEN coalesce(phone, '') = '' THEN ? ELSE phone END,
             email = CASE WHEN coalesce(email, '') = '' THEN ? ELSE email END,
             city = CASE WHEN coalesce(city, '') = '' THEN ? ELSE city END,
             regions = CASE WHEN coalesce(regions, '') = '' THEN ? ELSE regions END,
             specialties = CASE WHEN coalesce(specialties, '') = '' THEN ? ELSE specialties END,
             notes = CASE
               WHEN coalesce(notes, '') = '' THEN ?
               WHEN position(? in coalesce(notes, '')) > 0 OR ? = '' THEN notes
               ELSE notes || E'\\n\\n' || ?
             END,
             is_active = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          payload.contact_name,
          payload.phone,
          payload.email,
          payload.city,
          payload.regions,
          payload.specialties,
          payload.notes,
          payload.notes,
          payload.notes,
          payload.notes,
          payload.is_active,
          existing.id,
        ]
      );
      updated += 1;
    } else {
      await db.query(
        `INSERT INTO contractors (
          company_name, contact_name, phone, email, city, regions, specialties, notes, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.company_name,
          payload.contact_name,
          payload.phone,
          payload.email,
          payload.city,
          payload.regions,
          payload.specialties,
          payload.notes,
          payload.is_active,
        ]
      );
      inserted += 1;
    }
  }

  const summary = await db.get('SELECT COUNT(*)::int AS total FROM contractors');
  console.log(JSON.stringify({ inserted, updated, skipped, total: Number(summary?.total || 0) }, null, 2));
}

main()
  .catch(async (err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.close();
    } catch {}
  });
