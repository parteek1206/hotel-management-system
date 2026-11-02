/**
 * =============================================================================
 * HOTEL RESERVATION & MANAGEMENT SYSTEM (HRMS)
 * Phase 9: Administrator Authentication & Security Test Suite
 * =============================================================================
 * 
 * Verifies:
 * 1. Password Hashing & Verification (bcrypt with 10 salt rounds)
 * 2. Input Validation (Rejection of empty/blank credentials)
 * 3. Invalid Login Handling (Rejection with proper HTTP 401 / error alerts)
 * 4. Valid Login & Session Management (Session creation & cookie issuance)
 * 5. Unauthorized Access Protection (Direct access redirects unauthenticated users)
 * 6. Authenticated Access to Protected Routes (Valid session allows full access)
 * 7. Logout Execution (Session destruction & cookie clearing)
 * 8. Session Expiration & Tampered Cookie Handling
 * =============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import authService, { hashPassword, comparePassword, validateLoginInput } from '../src/services/authService.js';
import { env } from '../src/config/env.js';
import { pool } from '../src/config/db.js';
import { resetAdminPassword } from '../database/reset-admin-password.js';

// =============================================================================
// SUITE 1: PASSWORD HASHING & BCRYPT VERIFICATION
// =============================================================================
test('Phase 9 Security - Password Hashing & Bcrypt Verification', async (t) => {
  await t.test('Hashes plain-text password using bcrypt (10 rounds)', async () => {
    const plain = 'SecretAdmin@2026';
    const hash = await hashPassword(plain);

    assert.ok(hash.startsWith('$2b$10$') || hash.startsWith('$2a$10$'), 'Hash must follow standard bcrypt format with 10 salt rounds');
    assert.notEqual(hash, plain, 'Plain-text password must never be stored or equal hash');
  });

  await t.test('Verifies correct password against generated hash', async () => {
    const plain = 'SuperSecurePass!99';
    const hash = await hashPassword(plain);
    const isValid = await comparePassword(plain, hash);

    assert.equal(isValid, true, 'comparePassword must return true for matching password');
  });

  await t.test('Rejects incorrect password against generated hash', async () => {
    const plain = 'SuperSecurePass!99';
    const hash = await hashPassword(plain);
    const isValid = await comparePassword('WrongPassword123', hash);

    assert.equal(isValid, false, 'comparePassword must return false for mismatching password');
  });

  await t.test('Rejects short passwords under 6 characters', async () => {
    await assert.rejects(
      async () => await hashPassword('12345'),
      /at least 6 characters/,
      'Must reject passwords shorter than 6 characters'
    );
  });
});

// =============================================================================
// SUITE 2: CREDENTIAL INPUT VALIDATION
// =============================================================================
test('Phase 9 Security - Login Input Validation', async (t) => {
  await t.test('Rejects empty username and password', () => {
    const errors = validateLoginInput({ username: '', password: '' });
    assert.ok(errors.length >= 2, 'Must flag both missing username and missing password');
  });

  await t.test('Rejects missing username when password is provided', () => {
    const errors = validateLoginInput({ username: '   ', password: 'SomePassword' });
    assert.ok(errors.some(e => e.includes('username or email')), 'Must flag missing username');
  });

  await t.test('Rejects missing password when username is provided', () => {
    const errors = validateLoginInput({ username: 'admin', password: '' });
    assert.ok(errors.some(e => e.includes('password')), 'Must flag missing password');
  });

  await t.test('Accepts valid non-empty credentials', () => {
    const errors = validateLoginInput({ username: 'admin', password: 'Admin@12345' });
    assert.equal(errors.length, 0, 'Valid credentials should yield 0 validation errors');
  });
});

// =============================================================================
// SUITE 3: END-TO-END HTTP AUTHENTICATION & ROUTE PROTECTION
// =============================================================================
test('Phase 9 Security - HTTP Authentication & Route Protection', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let sessionCookie = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Direct Access to Protected Routes WITHOUT Session (Unauthorized)
    // -------------------------------------------------------------------------
    await t.test('Direct unauthenticated GET / redirects to /login (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
      assert.equal(res.status, 302, 'Unauthenticated GET / must return 302 redirect');
      const location = res.headers.get('location');
      assert.ok(location.includes('/login'), `Redirect target must point to /login, got: ${location}`);
    });

    await t.test('Direct unauthenticated GET /customers redirects to /login (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/customers`, { redirect: 'manual' });
      assert.equal(res.status, 302, 'Unauthenticated GET /customers must return 302 redirect');
      const location = res.headers.get('location');
      assert.ok(location.includes('/login'), 'Redirect target must point to /login');
    });

    await t.test('Direct unauthenticated GET /rooms redirects to /login (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/rooms`, { redirect: 'manual' });
      assert.equal(res.status, 302, 'Unauthenticated GET /rooms must return 302 redirect');
      assert.ok(res.headers.get('location').includes('/login'));
    });

    await t.test('Direct unauthenticated GET /reservations redirects to /login (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/reservations`, { redirect: 'manual' });
      assert.equal(res.status, 302, 'Unauthenticated GET /reservations must return 302 redirect');
      assert.ok(res.headers.get('location').includes('/login'));
    });

    await t.test('Direct unauthenticated GET /payments redirects to /login (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/payments`, { redirect: 'manual' });
      assert.equal(res.status, 302, 'Unauthenticated GET /payments must return 302 redirect');
      assert.ok(res.headers.get('location').includes('/login'));
    });

    await t.test('Direct unauthenticated GET /reports redirects to /login (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/reports`, { redirect: 'manual' });
      assert.equal(res.status, 302, 'Unauthenticated GET /reports must return 302 redirect');
      assert.ok(res.headers.get('location').includes('/login'));
    });

    await t.test('Direct unauthenticated API request GET /api/dashboard/stats returns HTTP 401 JSON', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
        headers: { 'Accept': 'application/json' }
      });
      assert.equal(res.status, 401, 'Unauthenticated API request must return 401 Unauthorized');
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.message.includes('authentication required'));
    });

    // -------------------------------------------------------------------------
    // 2. Public Endpoints Verification
    // -------------------------------------------------------------------------
    await t.test('Public endpoint GET /health is accessible without authentication (HTTP 200 or 503)', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.ok(res.status === 200 || res.status === 503, 'GET /health must be publicly accessible (200 OK or 503 if DB disconnected)');
      const data = await res.json();
      assert.ok('database' in data, 'Health response must include database status');
    });

    await t.test('Public endpoint GET /login renders login page (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/login`);
      assert.equal(res.status, 200, 'GET /login must return 200 OK');
      const html = await res.text();
      assert.ok(html.includes('Administrator Sign In'), 'Login page must include heading');
      assert.ok(html.includes('Username or Email'), 'Login page must have username field');
      assert.ok(html.includes('Password'), 'Login page must have password field');
    });

    // -------------------------------------------------------------------------
    // 3. Invalid Login Submissions
    // -------------------------------------------------------------------------
    await t.test('POST /login with missing credentials returns HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: '', password: '' }).toString()
      });
      assert.equal(res.status, 400, 'Empty credentials must return 400 Bad Request');
      const html = await res.text();
      assert.ok(html.includes('Please enter your username or email'), 'Must show validation error message');
    });

    await t.test('POST /login with incorrect password returns HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          username: env.ADMIN.DEFAULT_USERNAME,
          password: 'IncorrectPassword999!'
        }).toString()
      });
      assert.equal(res.status, 401, 'Wrong password must return 401 Unauthorized');
      const html = await res.text();
      assert.ok(html.includes('Invalid username or password'), 'Must display authentication error alert');
    });

    await t.test('POST /login with nonexistent user returns HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          username: 'nonexistent_admin_user_xyz',
          password: 'SomePassword123'
        }).toString()
      });
      assert.equal(res.status, 401, 'Nonexistent user must return 401 Unauthorized');
      const html = await res.text();
      assert.ok(html.includes('Invalid username or password'), 'Must display authentication error alert');
    });

    // -------------------------------------------------------------------------
    // 4. Valid Login & Session Cookie Issuance
    // -------------------------------------------------------------------------
    await t.test('POST /login with valid credentials establishes session (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          username: env.ADMIN.DEFAULT_USERNAME,
          password: env.ADMIN.DEFAULT_PASSWORD
        }).toString(),
        redirect: 'manual'
      });

      assert.equal(res.status, 302, 'Successful login must redirect');
      assert.equal(res.headers.get('location'), '/', 'Successful login must redirect to dashboard root');

      // Capture session cookie from Set-Cookie header
      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie, 'Response must include Set-Cookie header');
      assert.ok(setCookie.includes('hrms_session_id='), 'Cookie name must match configured session name');
      assert.ok(setCookie.toLowerCase().includes('httponly'), 'Session cookie must have HttpOnly attribute');
      assert.ok(setCookie.toLowerCase().includes('samesite=lax'), 'Session cookie must have SameSite=Lax attribute');

      // Store cookie string for subsequent authenticated requests
      sessionCookie = setCookie.split(';')[0];
    });

    // -------------------------------------------------------------------------
    // 5. Authenticated Requests with Valid Session Cookie
    // -------------------------------------------------------------------------
    await t.test('Authenticated GET / with session cookie renders Executive Dashboard (HTTP 200)', async () => {
      assert.ok(sessionCookie, 'Session cookie must exist from valid login step');
      const res = await fetch(`${baseUrl}/`, {
        headers: { 'Cookie': sessionCookie }
      });
      assert.equal(res.status, 200, 'Authenticated request to / must return 200 OK');
      const html = await res.text();
      assert.ok(html.includes('Executive Dashboard'), 'Must render Executive Dashboard');
    });

    await t.test('Authenticated GET /customers with session cookie renders Customers Directory (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/customers`, {
        headers: { 'Cookie': sessionCookie }
      });
      assert.equal(res.status, 200, 'Authenticated request to /customers must return 200 OK');
      const html = await res.text();
      assert.ok(html.includes('Customer Management'), 'Must render Customer Management');
    });

    await t.test('Authenticated GET /api/dashboard/stats with session cookie returns JSON (HTTP 200)', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
        headers: { 'Cookie': sessionCookie, 'Accept': 'application/json' }
      });
      assert.equal(res.status, 200, 'Authenticated API request must return 200 OK');
      const data = await res.json();
      assert.equal(data.success, true);
    });

    // -------------------------------------------------------------------------
    // 6. Session Expiration & Tampered Cookie Handling
    // -------------------------------------------------------------------------
    await t.test('Request with tampered / invalid session cookie redirects to /login (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        headers: { 'Cookie': 'hrms_session_id=s%3Abogus_tampered_signature_12345.abc' },
        redirect: 'manual'
      });
      assert.equal(res.status, 302, 'Tampered session must be rejected with 302 redirect');
      assert.ok(res.headers.get('location').includes('/login'));
    });

    // -------------------------------------------------------------------------
    // 7. Logout Flow
    // -------------------------------------------------------------------------
    await t.test('POST /logout terminates session and clears cookie (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/logout`, {
        method: 'POST',
        headers: { 'Cookie': sessionCookie },
        redirect: 'manual'
      });

      assert.equal(res.status, 302, 'POST /logout must redirect');
      const location = res.headers.get('location');
      assert.ok(location.includes('/login?logout=success'), 'Logout must redirect to login with success indicator');

      // Verify cookie is cleared or invalidated
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        assert.ok(setCookie.includes('hrms_session_id=;') || setCookie.includes('Expires='), 'Cookie should be cleared on logout');
      }
    });

    await t.test('Accessing protected route after logout is rejected (HTTP 302)', async () => {
      const res = await fetch(`${baseUrl}/reservations`, {
        headers: { 'Cookie': sessionCookie },
        redirect: 'manual'
      });
      assert.equal(res.status, 302, 'Terminated session must be rejected with 302 redirect to /login');
      assert.ok(res.headers.get('location').includes('/login'));
    });

  } finally {
    server.close();
  }
});

// =============================================================================
// SUITE 4: SECURE ADMINISTRATOR PASSWORD RESET UTILITY
// =============================================================================
test('Phase 9 Security - Administrator Password Reset Mechanism', async (t) => {
  t.after(async () => {
    try {
      await pool.end();
    } catch (_) {}
  });

  await t.test('Rejects password reset with empty or invalid identifier', async () => {
    await assert.rejects(
      async () => await resetAdminPassword('', 'NewPass@2026'),
      /username or email is required/,
      'Must reject empty username'
    );
  });

  await t.test('Rejects password reset with password shorter than 6 characters', async () => {
    await assert.rejects(
      async () => await resetAdminPassword('admin', '123'),
      /at least 6 characters/,
      'Must reject short password'
    );
  });

  await t.test('Rejects password reset for non-existent administrator account', async () => {
    await assert.rejects(
      async () => await resetAdminPassword('non_existent_user_999@test.com', 'ValidPass@2026'),
      /was not found/,
      'Must reject non-existent account'
    );
  });

  await t.test('Successfully resets administrator password and enables authentication', async () => {
    // 1. Reset password for 'admin'
    const updated = await resetAdminPassword('admin', 'Admin@12345');
    assert.equal(updated.username, 'admin');

    // 2. Verify login succeeds with the reset password
    const authOk = await authService.authenticate('admin', 'Admin@12345');
    assert.equal(authOk.success, true, 'Authentication must succeed with new password');
    assert.equal(authOk.user.username, 'admin');

    // 3. Verify login fails with wrong password
    const authBad = await authService.authenticate('admin', 'WrongPassword123');
    assert.equal(authBad.success, false, 'Authentication must fail with incorrect password');
  });
});
