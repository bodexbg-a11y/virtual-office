#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../server/db');

async function ensureConstructionFirmsTable() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS construction_firms (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      public_contact TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      regions TEXT,
      specialties TEXT,
      website TEXT,
      contact_status TEXT,
      priority TEXT,
      role TEXT,
      manager_comment TEXT,
      call_result TEXT,
      contact_date TEXT,
      owner_name TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_construction_firms_company_name ON construction_firms(company_name);
    CREATE INDEX IF NOT EXISTS idx_construction_firms_city ON construction_firms(city);
    CREATE INDEX IF NOT EXISTS idx_construction_firms_is_active ON construction_firms(is_active);
  `);
}

function normalizeText(value) {
  return String(value || '').trim();
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node scripts/upsert_construction_firms.js <json-path>');
  }

  const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const items = JSON.parse(raw);
  await ensureConstructionFirmsTable();

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
      `SELECT id, company_name, contact_name, public_contact, phone, email, city, regions, specialties,
              website, contact_status, priority, role, manager_comment, call_result, contact_date,
              owner_name, notes, is_active
       FROM construction_firms WHERE lower(company_name) = lower(?) LIMIT 1`,
      [companyName]
    );

    const payload = {
      company_name: companyName,
      contact_name: normalizeText(item.contact_name),
      public_contact: normalizeText(item.public_contact),
      phone: normalizeText(item.phone),
      email: normalizeText(item.email).toLowerCase(),
      city: normalizeText(item.city),
      regions: normalizeText(item.regions),
      specialties: normalizeText(item.specialties),
      website: normalizeText(item.website),
      contact_status: normalizeText(item.contact_status),
      priority: normalizeText(item.priority),
      role: normalizeText(item.role),
      manager_comment: normalizeText(item.manager_comment),
      call_result: normalizeText(item.call_result),
      contact_date: normalizeText(item.contact_date),
      owner_name: normalizeText(item.owner_name),
      notes: normalizeText(item.notes),
      is_active: item.is_active === false ? false : true,
    };

    if (existing) {
      await db.query(
        `UPDATE construction_firms
         SET contact_name = CASE WHEN coalesce(contact_name, '') = '' THEN ? ELSE contact_name END,
             public_contact = CASE WHEN coalesce(public_contact, '') = '' THEN ? ELSE public_contact END,
             phone = CASE WHEN coalesce(phone, '') = '' THEN ? ELSE phone END,
             email = CASE WHEN coalesce(email, '') = '' THEN ? ELSE email END,
             city = CASE WHEN coalesce(city, '') = '' THEN ? ELSE city END,
             regions = CASE WHEN coalesce(regions, '') = '' THEN ? ELSE regions END,
             specialties = CASE WHEN coalesce(specialties, '') = '' THEN ? ELSE specialties END,
             website = CASE WHEN coalesce(website, '') = '' THEN ? ELSE website END,
             contact_status = CASE WHEN coalesce(contact_status, '') = '' THEN ? ELSE contact_status END,
             priority = CASE WHEN coalesce(priority, '') = '' THEN ? ELSE priority END,
             role = CASE WHEN coalesce(role, '') = '' THEN ? ELSE role END,
             manager_comment = CASE WHEN coalesce(manager_comment, '') = '' THEN ? ELSE manager_comment END,
             call_result = CASE WHEN coalesce(call_result, '') = '' THEN ? ELSE call_result END,
             contact_date = CASE WHEN coalesce(contact_date, '') = '' THEN ? ELSE contact_date END,
             owner_name = CASE WHEN coalesce(owner_name, '') = '' THEN ? ELSE owner_name END,
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
          payload.public_contact,
          payload.phone,
          payload.email,
          payload.city,
          payload.regions,
          payload.specialties,
          payload.website,
          payload.contact_status,
          payload.priority,
          payload.role,
          payload.manager_comment,
          payload.call_result,
          payload.contact_date,
          payload.owner_name,
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
        `INSERT INTO construction_firms (
          company_name, contact_name, public_contact, phone, email, city, regions, specialties,
          website, contact_status, priority, role, manager_comment, call_result, contact_date,
          owner_name, notes, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.company_name,
          payload.contact_name,
          payload.public_contact,
          payload.phone,
          payload.email,
          payload.city,
          payload.regions,
          payload.specialties,
          payload.website,
          payload.contact_status,
          payload.priority,
          payload.role,
          payload.manager_comment,
          payload.call_result,
          payload.contact_date,
          payload.owner_name,
          payload.notes,
          payload.is_active,
        ]
      );
      inserted += 1;
    }
  }

  const summary = await db.get('SELECT COUNT(*)::int AS total FROM construction_firms');
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
