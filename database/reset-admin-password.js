/**
 * =============================================================================
 * HOTEL RESERVATION & MANAGEMENT SYSTEM (HRMS)
 * Administrator Password Reset Utility
 * =============================================================================
 * 
 * Securely updates an administrator account password in MySQL using bcrypt.
 * Supports both CLI arguments and interactive terminal input.
 * 
 * Usage:
 *   1. Interactive CLI prompt:
 *      npm run admin:reset-password
 *      node database/reset-admin-password.js
 * 
 *   2. Direct CLI argument:
 *      node database/reset-admin-password.js <username_or_email> <new_password>
 * 
 * Security:
 *   - Enforces minimum 6 character password length.
 *   - Applies 10-round salted bcrypt hashing.
 *   - Never prints or exposes password hashes.
 *   - Does not delete or recreate accounts or database tables.
 * =============================================================================
 */

import readline from 'readline';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../src/config/db.js';

// Resolve project root .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BCRYPT_SALT_ROUNDS = 10;

function askQuestion(queryText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(queryText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Resets the password for a designated administrator.
 * 
 * @param {string} identifier - Username or Email
 * @param {string} newPassword - Candidate plain-text password
 */
export async function resetAdminPassword(identifier, newPassword) {
  if (!identifier || identifier.trim() === '') {
    throw new Error('Administrator username or email is required.');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  const cleanIdentifier = identifier.trim().toLowerCase();

  // 1. Verify administrator existence in database
  const searchSql = `
    SELECT admin_id, username, email 
    FROM admin_users 
    WHERE LOWER(username) = ? OR LOWER(email) = ?
    LIMIT 1;
  `;
  const existingUsers = await query(searchSql, [cleanIdentifier, cleanIdentifier]);

  if (!existingUsers || existingUsers.length === 0) {
    throw new Error(`Administrator account with username or email "${identifier}" was not found.`);
  }

  const targetAdmin = existingUsers[0];

  // 2. Compute salted bcrypt hash
  const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  // 3. Update the password hash
  const updateSql = `
    UPDATE admin_users 
    SET password_hash = ? 
    WHERE admin_id = ?;
  `;
  await query(updateSql, [newHash, targetAdmin.admin_id]);

  return {
    admin_id: targetAdmin.admin_id,
    username: targetAdmin.username,
    email: targetAdmin.email
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('🔑  HRMS Administrator Password Reset Utility');
  console.log('='.repeat(70));

  const args = process.argv.slice(2);
  let identifier = args[0];
  let newPassword = args[1];

  try {
    if (!identifier) {
      identifier = await askQuestion('Enter Administrator Username or Email (default: admin): ');
      if (!identifier) {
        identifier = 'admin';
      }
    }

    if (!newPassword) {
      newPassword = await askQuestion('Enter New Secure Password (minimum 6 characters): ');
    }

    console.log(`\n[Audit]: Verifying administrator "${identifier}"...`);
    const updatedUser = await resetAdminPassword(identifier, newPassword);

    console.log('='.repeat(70));
    console.log(`✅  Password successfully updated for Administrator ID #${updatedUser.admin_id}:`);
    console.log(`    Username: ${updatedUser.username}`);
    console.log(`    Email:    ${updatedUser.email}`);
    console.log(`    Status:   Active with new 10-round salted bcrypt hash.`);
    console.log('='.repeat(70));
  } catch (error) {
    console.error('\n❌  Password Reset Failed:');
    console.error(`    ${error.message}`);
    console.log('='.repeat(70));
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch (_) {
      // Ignore pool closing error
    }
  }
}

// Run script if executed directly from terminal
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

