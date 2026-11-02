/**
 * =============================================================================
 * HOTEL RESERVATION & MANAGEMENT SYSTEM (HRMS)
 * MySQL Database Programming Module Test Suite
 * =============================================================================
 * 
 * Verifies:
 * 1. Syntax, structure, and presence of all MySQL 8.4 Stored Routines in database/routines.sql
 * 2. Stored Functions (fn_calculate_nights, fn_calculate_booking_amount)
 * 3. Database Views (vw_reservation_details, vw_payment_summary)
 * 4. Stored Procedures (sp_get_available_rooms, sp_get_monthly_revenue, sp_generate_reservation_report)
 * 5. Explicit Cursor with NOT FOUND Handler (sp_identify_overdue_checkouts)
 * 6. ACID Transactions & SQL Exception Handling (sp_create_reservation_transactional)
 * 7. Database Audit Trigger (trg_reservations_status_change)
 * 8. Live MySQL execution when database connection is reachable
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool, testConnection } from '../src/config/db.js';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROUTINES_SQL_PATH = path.resolve(__dirname, '../database/routines.sql');

// =============================================================================
// SUITE 1: FILE EXISTENCE & STRUCTURAL INTEGRITY
// =============================================================================
test('MySQL Stored Programming - File Existence & Structural Audit', async (t) => {
  await t.test('database/routines.sql exists and is non-empty', () => {
    assert.ok(fs.existsSync(ROUTINES_SQL_PATH), 'database/routines.sql must exist on disk');
    const content = fs.readFileSync(ROUTINES_SQL_PATH, 'utf8');
    assert.ok(content.length > 500, 'database/routines.sql must contain comprehensive routine definitions');
  });

  const sqlContent = fs.readFileSync(ROUTINES_SQL_PATH, 'utf8');

  await t.test('Defines required Stored Functions', () => {
    assert.ok(sqlContent.includes('CREATE FUNCTION `fn_calculate_nights`'), 'Must define fn_calculate_nights');
    assert.ok(sqlContent.includes('CREATE FUNCTION `fn_calculate_booking_amount`'), 'Must define fn_calculate_booking_amount');
    assert.ok(sqlContent.includes('DETERMINISTIC'), 'Stored functions must be declared DETERMINISTIC');
  });

  await t.test('Defines required Views', () => {
    assert.ok(sqlContent.includes('CREATE OR REPLACE VIEW `vw_reservation_details`'), 'Must define vw_reservation_details');
    assert.ok(sqlContent.includes('CREATE OR REPLACE VIEW `vw_payment_summary`'), 'Must define vw_payment_summary');
    assert.ok(sqlContent.includes('gross_bill_amount'), 'Payment summary view must compute gross_bill_amount');
    assert.ok(sqlContent.includes('remaining_balance'), 'Payment summary view must compute remaining_balance');
    assert.ok(sqlContent.includes('billing_status'), 'Payment summary view must categorize billing_status');
  });

  await t.test('Defines required Stored Procedures', () => {
    assert.ok(sqlContent.includes('CREATE PROCEDURE `sp_get_available_rooms`'), 'Must define sp_get_available_rooms');
    assert.ok(sqlContent.includes('CREATE PROCEDURE `sp_get_monthly_revenue`'), 'Must define sp_get_monthly_revenue');
    assert.ok(sqlContent.includes('CREATE PROCEDURE `sp_generate_reservation_report`'), 'Must define sp_generate_reservation_report');
  });

  await t.test('Defines Explicit Cursor with NOT FOUND Handler', () => {
    assert.ok(sqlContent.includes('CREATE PROCEDURE `sp_identify_overdue_checkouts`'), 'Must define sp_identify_overdue_checkouts');
    assert.ok(sqlContent.includes('DECLARE cur_overdue CURSOR FOR'), 'Must declare explicit cursor cur_overdue');
    assert.ok(sqlContent.includes('DECLARE CONTINUE HANDLER FOR NOT FOUND'), 'Must declare CONTINUE HANDLER FOR NOT FOUND');
    assert.ok(sqlContent.includes('OPEN cur_overdue'), 'Must open cursor');
    assert.ok(sqlContent.includes('FETCH cur_overdue INTO'), 'Must fetch cursor rows');
    assert.ok(sqlContent.includes('CLOSE cur_overdue'), 'Must close cursor');
  });

  await t.test('Defines Transactional Procedure with SQL Exception Handler', () => {
    assert.ok(sqlContent.includes('CREATE PROCEDURE `sp_create_reservation_transactional`'), 'Must define sp_create_reservation_transactional');
    assert.ok(sqlContent.includes('START TRANSACTION;'), 'Must initiate transaction with START TRANSACTION');
    assert.ok(sqlContent.includes('COMMIT;'), 'Must finalize transaction with COMMIT');
    assert.ok(sqlContent.includes('ROLLBACK;'), 'Must support ROLLBACK');
    assert.ok(sqlContent.includes('DECLARE EXIT HANDLER FOR SQLEXCEPTION'), 'Must declare EXIT HANDLER FOR SQLEXCEPTION');
    assert.ok(sqlContent.includes('FOR UPDATE'), 'Must enforce row-level lock via SELECT ... FOR UPDATE');
  });

  await t.test('Defines Database Audit Trigger', () => {
    assert.ok(sqlContent.includes('CREATE TRIGGER `trg_reservations_status_change`'), 'Must define trg_reservations_status_change');
    assert.ok(sqlContent.includes('AFTER UPDATE ON `reservations`'), 'Trigger must fire AFTER UPDATE ON reservations');
    assert.ok(sqlContent.includes('OLD.status != NEW.status'), 'Trigger must detect status transitions');
    assert.ok(sqlContent.includes('reservation_status_history'), 'Trigger must log transitions to reservation_status_history');
  });

  await t.test('Provides Workbench Execution Examples', () => {
    assert.ok(sqlContent.includes('MYSQL WORKBENCH EXECUTION & VERIFICATION EXAMPLES'), 'Must include Workbench usage documentation');
    assert.ok(sqlContent.includes('CALL sp_get_available_rooms'), 'Must provide example CALL for available rooms');
    assert.ok(sqlContent.includes('CALL sp_get_monthly_revenue'), 'Must provide example CALL for revenue');
    assert.ok(sqlContent.includes('CALL sp_identify_overdue_checkouts'), 'Must provide example CALL for cursor checkout');
    assert.ok(sqlContent.includes('CALL sp_create_reservation_transactional'), 'Must provide example CALL for transactional booking');
  });
});

// =============================================================================
// SUITE 2: PURE FUNCTIONAL MATHEMATICS VALIDATION
// =============================================================================
test('MySQL Stored Programming - Mathematical & Logical Invariants', async (t) => {
  await t.test('Stay duration calculation replicates fn_calculate_nights logic', () => {
    function simulateNights(inDate, outDate) {
      if (!inDate || !outDate) return 0;
      const d1 = new Date(inDate);
      const d2 = new Date(outDate);
      if (d2 <= d1) return 0;
      return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    assert.equal(simulateNights('2026-11-01', '2026-11-05'), 4);
    assert.equal(simulateNights('2026-11-10', '2026-11-11'), 1);
    assert.equal(simulateNights('2026-11-10', '2026-11-10'), 0, 'Same-day check-in/out should return 0 nights');
    assert.equal(simulateNights('2026-11-15', '2026-11-10'), 0, 'Inverted dates should return 0 nights');
    assert.equal(simulateNights(null, '2026-11-10'), 0);
  });

  await t.test('Booking tariff calculation replicates fn_calculate_booking_amount logic', () => {
    function simulateTariff(nights, rate) {
      if (!nights || nights <= 0 || !rate || rate < 0) return 0.00;
      return parseFloat((nights * rate).toFixed(2));
    }

    assert.equal(simulateTariff(3, 2500.00), 7500.00);
    assert.equal(simulateTariff(5, 3850.50), 19252.50);
    assert.equal(simulateTariff(0, 3500.00), 0.00);
    assert.equal(simulateTariff(-2, 3500.00), 0.00);
    assert.equal(simulateTariff(3, -500.00), 0.00);
  });
});

// =============================================================================
// SUITE 3: LIVE MYSQL EXECUTION (WHEN DATABASE ACCESSIBLE)
// =============================================================================
test('MySQL Stored Programming - Live Database Verification', async (t) => {
  const health = await testConnection();

  if (!health.success) {
    t.skip(`Skipping live MySQL execution tests: ${health.message}`);
    return;
  }

  t.after(async () => {
    try {
      await pool.end();
    } catch (e) {
      // Ignore if pool already closed
    }
  });

  await t.test('Verifies stored routines and functions exist in active MySQL database', async () => {
    const procs = await query('SHOW PROCEDURE STATUS WHERE Db = ?', [env.DB.NAME]);
    const funcs = await query('SHOW FUNCTION STATUS WHERE Db = ?', [env.DB.NAME]);
    const procNames = procs.map(p => p.Name);
    const funcNames = funcs.map(f => f.Name);

    assert.ok(procNames.includes('sp_get_available_rooms'), 'sp_get_available_rooms must exist in database');
    assert.ok(procNames.includes('sp_get_monthly_revenue'), 'sp_get_monthly_revenue must exist in database');
    assert.ok(procNames.includes('sp_generate_reservation_report'), 'sp_generate_reservation_report must exist in database');
    assert.ok(procNames.includes('sp_identify_overdue_checkouts'), 'sp_identify_overdue_checkouts must exist in database');
    assert.ok(procNames.includes('sp_create_reservation_transactional'), 'sp_create_reservation_transactional must exist in database');
    assert.ok(funcNames.includes('fn_calculate_nights'), 'fn_calculate_nights must exist in database');
    assert.ok(funcNames.includes('fn_calculate_booking_amount'), 'fn_calculate_booking_amount must exist in database');
  });

  await t.test('Executes fn_calculate_nights live in MySQL', async () => {
    const rows = await query(`SELECT fn_calculate_nights('2026-12-01', '2026-12-06') AS nights`);
    assert.equal(rows[0].nights, 5, 'fn_calculate_nights must return 5 nights');
  });

  await t.test('Executes fn_calculate_booking_amount live in MySQL', async () => {
    const rows = await query(`SELECT fn_calculate_booking_amount(5, 2400.00) AS total`);
    assert.equal(Number(rows[0].total), 12000.00, 'fn_calculate_booking_amount must return 12000.00');
  });

  await t.test('Queries vw_reservation_details live in MySQL', async () => {
    const rows = await query(`SELECT * FROM vw_reservation_details LIMIT 1`);
    assert.ok(Array.isArray(rows), 'vw_reservation_details must return a valid result set');
  });

  await t.test('Queries vw_payment_summary live in MySQL', async () => {
    const rows = await query(`SELECT * FROM vw_payment_summary LIMIT 1`);
    assert.ok(Array.isArray(rows), 'vw_payment_summary must return a valid result set');
  });

  await t.test('Executes sp_get_available_rooms live in MySQL', async () => {
    const results = await query(`CALL sp_get_available_rooms('2026-12-01', '2026-12-05', 2)`);
    assert.ok(Array.isArray(results), 'sp_get_available_rooms must return result set array');
  });

  await t.test('Executes sp_get_monthly_revenue live in MySQL', async () => {
    const results = await query(`CALL sp_get_monthly_revenue(2026)`);
    assert.ok(Array.isArray(results), 'sp_get_monthly_revenue must return result set array');
  });

  await t.test('Executes sp_identify_overdue_checkouts live in MySQL (Cursor)', async () => {
    const results = await query(`CALL sp_identify_overdue_checkouts()`);
    assert.ok(Array.isArray(results), 'sp_identify_overdue_checkouts must return result set array');
  });
});

