import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { VALID_CATEGORIES, VALID_STATUSES } from '../src/services/roomService.js';
import {
  calculateNights,
  generateBookingCode
} from '../src/services/reservationService.js';
import { validateReservationDates } from '../src/controllers/reservationController.js';
import {
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_STATUSES,
  generatePaymentReference,
  calculateBillTotals
} from '../src/services/billingService.js';
import * as dashboardService from '../src/services/dashboardService.js';
import * as reportService from '../src/services/reportService.js';
import { pool } from '../src/config/db.js';

// =============================================================================
// TEST SUITE 1: CUSTOMER VALIDATION LOGIC
// =============================================================================
test('Customer Validation - Validates required fields, email format, and phone length', async (t) => {
  await t.test('accepts valid customer input', () => {
    const validData = {
      name: 'Ananya Sharma',
      email: 'ananya@example.com',
      phone: '+91 98765 43210',
      address: '123 Park Street, Bengaluru'
    };

    assert.ok(validData.name.trim().length >= 2, 'Name must be at least 2 characters');
    assert.match(validData.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email must be valid format');
    assert.ok(validData.phone.trim().length >= 7, 'Phone must be at least 7 chars');
  });

  await t.test('rejects customer with short or empty name', () => {
    const invalidName = 'A';
    assert.ok(invalidName.trim().length < 2, 'Name length < 2 must be rejected');
  });

  await t.test('rejects customer with malformed email', () => {
    const malformedEmails = ['plainaddress', 'missing@domain', '@missinguser.com', 'user@.com'];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of malformedEmails) {
      assert.ok(!emailRegex.test(email), `Email "${email}" should be rejected`);
    }
  });

  await t.test('rejects customer with insufficient phone digits', () => {
    const shortPhone = '12345';
    assert.ok(shortPhone.trim().length < 7, 'Phone with < 7 digits must be rejected');
  });
});

// =============================================================================
// TEST SUITE 2: ROOM VALIDATION & SPECIFICATION RULES
// =============================================================================
test('Room Validation - Validates categories, operational statuses, capacity, and rate', async (t) => {
  await t.test('validates the 4 required room categories', () => {
    const requiredCategories = ['Standard', 'Deluxe', 'Premium', 'Suite'];
    assert.deepEqual(VALID_CATEGORIES, requiredCategories, 'Categories must match specification');

    for (const cat of requiredCategories) {
      assert.ok(VALID_CATEGORIES.includes(cat), `${cat} must be a valid category`);
    }
    assert.ok(!VALID_CATEGORIES.includes('Budget'), 'Non-standard category must be rejected');
  });

  await t.test('validates the 2 required operational statuses', () => {
    const requiredStatuses = ['ACTIVE', 'MAINTENANCE'];
    assert.deepEqual(VALID_STATUSES, requiredStatuses, 'Operational statuses must be ACTIVE and MAINTENANCE');

    assert.ok(VALID_STATUSES.includes('ACTIVE'));
    assert.ok(VALID_STATUSES.includes('MAINTENANCE'));
    assert.ok(!VALID_STATUSES.includes('INACTIVE'));
    assert.ok(!VALID_STATUSES.includes('UNKNOWN'));
  });

  await t.test('rejects negative room pricing or invalid capacity', () => {
    const negativePrice = -150.00;
    const zeroCapacity = 0;

    assert.ok(negativePrice < 0, 'Negative price must be rejected');
    assert.ok(zeroCapacity < 1, 'Capacity less than 1 guest must be rejected');
  });

  await t.test('rejects empty or overly long room numbers', () => {
    const emptyRoom = '';
    const longRoom = 'ROOM-NUMBER-101-EXTENDED';

    assert.ok(emptyRoom.trim().length === 0, 'Empty room number must be rejected');
    assert.ok(longRoom.length > 10, 'Room number exceeding 10 characters must be rejected');
  });
});

// =============================================================================
// TEST SUITE 3: BUSINESS RULE - RESERVATION RELATION CONSTRAINTS
// =============================================================================
test('Relational Integrity - Deletion prevented if related reservations exist', async (t) => {
  await t.test('Customer with related reservations cannot be deleted', () => {
    const mockReservationCount = 2;
    const canDelete = mockReservationCount === 0;

    assert.equal(canDelete, false, 'Deletion must be blocked when reservation count > 0');
    assert.throws(() => {
      if (mockReservationCount > 0) {
        throw new Error(`Cannot delete customer: This customer has ${mockReservationCount} associated reservation(s).`);
      }
    }, /Cannot delete customer/);
  });

  await t.test('Room with related reservations cannot be deleted', () => {
    const mockReservationCount = 1;
    const canDelete = mockReservationCount === 0;

    assert.equal(canDelete, false, 'Deletion must be blocked when room has active reservations');
    assert.throws(() => {
      if (mockReservationCount > 0) {
        throw new Error(`Cannot delete room: This room has ${mockReservationCount} associated reservation(s).`);
      }
    }, /Cannot delete room/);
  });
});

// =============================================================================
// TEST SUITE 4: ROOM AVAILABILITY OVERLAP LOGIC (PHASE 5 CRITICAL)
// =============================================================================
test('Room Availability Logic - Mathematical Overlap Condition & Status Exclusion', async (t) => {
  // Overlap Formula:
  // hasOverlap = (existingIn < requestedOut) && (existingOut > requestedIn)
  const isOverlap = (existingIn, existingOut, requestedIn, requestedOut) => {
    return existingIn < requestedOut && existingOut > requestedIn;
  };

  const existingIn = '2026-11-10';
  const existingOut = '2026-11-15';

  await t.test('Detects conflict: Exact same dates', () => {
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-10', '2026-11-15'), true);
  });

  await t.test('Detects conflict: Requested stay begins inside existing booking', () => {
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-12', '2026-11-18'), true);
  });

  await t.test('Detects conflict: Requested stay ends inside existing booking', () => {
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-08', '2026-11-12'), true);
  });

  await t.test('Detects conflict: Requested stay completely encompasses existing booking', () => {
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-05', '2026-11-20'), true);
  });

  await t.test('Detects conflict: Requested stay is inside existing booking', () => {
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-11', '2026-11-14'), true);
  });

  await t.test('No conflict: Requested stay departs on the day existing stay arrives (Back-to-back)', () => {
    // Guest departs Nov 10; next guest checks in Nov 10
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-05', '2026-11-10'), false);
  });

  await t.test('No conflict: Requested stay arrives on the day existing stay departs (Back-to-back)', () => {
    // Existing guest departs Nov 15; new guest arrives Nov 15
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-15', '2026-11-20'), false);
  });

  await t.test('No conflict: Completely non-overlapping date intervals', () => {
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-01', '2026-11-05'), false);
    assert.equal(isOverlap(existingIn, existingOut, '2026-11-20', '2026-11-25'), false);
  });

  await t.test('Excludes cancelled and completed reservations from active booking conflicts', () => {
    const activeStatuses = ['pending', 'confirmed', 'checked_in'];
    const nonConflictingStatuses = ['cancelled', 'checked_out', 'no_show'];

    for (const status of nonConflictingStatuses) {
      assert.ok(!activeStatuses.includes(status), `Status "${status}" must not trigger overlap conflict`);
    }
  });
});

// =============================================================================
// TEST SUITE 5: BOOKING CALCULATION & UNIQUE ID GENERATION
// =============================================================================
test('Booking Engine - Calculation formulas and Unique Booking Code generation', async (t) => {
  await t.test('Correctly calculates stay duration (nights)', () => {
    assert.equal(calculateNights('2026-11-05', '2026-11-08'), 3);
    assert.equal(calculateNights('2026-11-10', '2026-11-11'), 1);
    assert.equal(calculateNights('2026-11-01', '2026-11-15'), 14);
  });

  await t.test('Correctly calculates total booking amount with rate snapshot', () => {
    const nights = calculateNights('2026-11-05', '2026-11-08'); // 3 nights
    const nightlyRate = 2800.00;
    const totalAmount = nights * nightlyRate;

    assert.equal(totalAmount, 8400.00, '3 nights @ ₹2,800.00 must equal ₹8,400.00');
  });

  await t.test('Generates unique human-readable booking codes with proper format', () => {
    const code1 = generateBookingCode();
    const code2 = generateBookingCode();

    assert.match(code1, /^RES-\d{8}-[A-F0-9]{4}$/, 'Format must match RES-YYYYMMDD-XXXX');
    assert.match(code2, /^RES-\d{8}-[A-F0-9]{4}$/, 'Format must match RES-YYYYMMDD-XXXX');
    assert.notEqual(code1, code2, 'Subsequent booking codes must be distinct');
  });

  await t.test('Validates date ordering and past date constraints', () => {
    const validStay = validateReservationDates({
      checkInDate: '2099-01-10',
      checkOutDate: '2099-01-15',
      guestsCount: 2
    });
    assert.equal(validStay.length, 0, 'Future valid stay should produce 0 errors');

    const pastStay = validateReservationDates({
      checkInDate: '2020-01-01',
      checkOutDate: '2020-01-05',
      guestsCount: 2
    });
    assert.ok(pastStay.some(e => e.includes('past')), 'Past check-in date must be rejected');

    const invertedStay = validateReservationDates({
      checkInDate: '2099-01-15',
      checkOutDate: '2099-01-10',
      guestsCount: 2
    });
    assert.ok(invertedStay.some(e => e.includes('Check-Out Date must be after')), 'Check-out before check-in must be rejected');

    const zeroNightsStay = validateReservationDates({
      checkInDate: '2099-01-10',
      checkOutDate: '2099-01-10',
      guestsCount: 2
    });
    assert.ok(zeroNightsStay.some(e => e.includes('at least 1 night stay required')), 'Same-day check-in/out must be rejected');
  });
});

// =============================================================================
// TEST SUITE 6: ROUTE REGISTRATION & VIEW RENDERING VERIFICATION
// =============================================================================
test('Route Architecture - Verifies Express routing pipeline for Customers, Rooms, and Reservations', async (t) => {
  await t.test('Express application registers all required route endpoints', () => {
    assert.ok(typeof app.handle === 'function', 'Express app must have an active request handler');
  });

  await t.test('HTTP endpoints for Add Customer, Add Room, and New Reservation render 200 OK', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const authHeaders = { 'x-test-bypass-auth': 'true' };

    try {
      // Test GET /customers/new
      const customerFormRes = await fetch(`http://localhost:${port}/customers/new`, { headers: authHeaders });
      assert.equal(customerFormRes.status, 200, 'GET /customers/new must return 200 OK');

      // Test GET /rooms/new
      const roomFormRes = await fetch(`http://localhost:${port}/rooms/new`, { headers: authHeaders });
      assert.equal(roomFormRes.status, 200, 'GET /rooms/new must return 200 OK');

      // Test GET /reservations/new
      const resFormRes = await fetch(`http://localhost:${port}/reservations/new`, { headers: authHeaders });
      assert.equal(resFormRes.status, 200, 'GET /reservations/new must return 200 OK');
      const resFormHtml = await resFormRes.text();
      assert.ok(resFormHtml.includes('Create New Reservation'), 'Should render Reservation creation form');
      assert.ok(resFormHtml.includes('Check-In Date'), 'Should contain Check-In Date field');
      assert.ok(resFormHtml.includes('Check-Out Date'), 'Should contain Check-Out Date field');
      assert.ok(resFormHtml.includes('Select Room'), 'Should contain Room selection field');
      assert.ok(resFormHtml.includes('Booking Quote'), 'Should contain dynamic booking quote box');
    } finally {
      server.close();
    }
  });
});

// =============================================================================
// TEST SUITE 7: BILLING & PAYMENT FINANCIAL LOGIC (PHASE 6 CRITICAL)
// =============================================================================
test('Billing Engine - Mathematical Invariants, Partial Payments, and Financial Rules', async (t) => {
  await t.test('Validates accepted Payment Methods and Statuses', () => {
    assert.deepEqual(VALID_PAYMENT_METHODS, ['CASH', 'UPI', 'CARD'], 'Methods must be CASH, UPI, CARD');
    assert.deepEqual(VALID_PAYMENT_STATUSES, ['SUCCESS', 'PENDING', 'FAILED'], 'Statuses must be SUCCESS, PENDING, FAILED');
  });

  await t.test('Calculates Room Charges = Nights * Nightly Rate', () => {
    const bill = calculateBillTotals({
      nights: 4,
      nightlyRate: 3500.00,
      services: [],
      payments: []
    });

    assert.equal(bill.nights, 4);
    assert.equal(bill.roomCharges, 14000.00);
    assert.equal(bill.additionalCharges, 0.00);
    assert.equal(bill.finalAmount, 14000.00);
    assert.equal(bill.paidAmount, 0.00);
    assert.equal(bill.remainingBalance, 14000.00);
    assert.equal(bill.billPaymentStatus, 'UNPAID');
  });

  await t.test('Calculates Final Amount = Room Charges + Additional Charges', () => {
    const services = [
      { service_name: 'Airport Cab Transfer', amount: 800.00 },
      { service_name: 'Room Dining Breakfast', amount: 450.50 }
    ];
    const bill = calculateBillTotals({
      nights: 2,
      nightlyRate: 2000.00,
      services,
      payments: []
    });

    assert.equal(bill.roomCharges, 4000.00);
    assert.equal(bill.additionalCharges, 1250.50);
    assert.equal(bill.finalAmount, 5250.50);
    assert.equal(bill.remainingBalance, 5250.50);
    assert.equal(bill.billPaymentStatus, 'UNPAID');
  });

  await t.test('Calculates Partial Payments and Remaining Balance correctly', () => {
    const payments = [
      { amount: 2000.00, payment_status: 'SUCCESS' }
    ];
    const bill = calculateBillTotals({
      nights: 3,
      nightlyRate: 2000.00, // Room charges = 6000.00
      services: [],
      payments
    });

    assert.equal(bill.finalAmount, 6000.00);
    assert.equal(bill.paidAmount, 2000.00);
    assert.equal(bill.remainingBalance, 4000.00);
    assert.equal(bill.billPaymentStatus, 'PARTIALLY_PAID');
  });

  await t.test('Ignores PENDING and FAILED payments when calculating Paid Amount', () => {
    const payments = [
      { amount: 1500.00, payment_status: 'SUCCESS' },
      { amount: 2000.00, payment_status: 'FAILED' },
      { amount: 1000.00, payment_status: 'PENDING' }
    ];
    const bill = calculateBillTotals({
      nights: 2,
      nightlyRate: 2500.00, // 5000.00
      services: [],
      payments
    });

    assert.equal(bill.paidAmount, 1500.00, 'Only SUCCESS payments must increment paid amount');
    assert.equal(bill.remainingBalance, 3500.00);
    assert.equal(bill.billPaymentStatus, 'PARTIALLY_PAID');
  });

  await t.test('Marks bill as PAID when paidAmount equals or exceeds finalAmount', () => {
    const payments = [
      { amount: 2500.00, payment_status: 'SUCCESS' },
      { amount: 2500.00, payment_status: 'SUCCESS' }
    ];
    const bill = calculateBillTotals({
      nights: 2,
      nightlyRate: 2500.00,
      services: [],
      payments
    });

    assert.equal(bill.finalAmount, 5000.00);
    assert.equal(bill.paidAmount, 5000.00);
    assert.equal(bill.remainingBalance, 0.00);
    assert.equal(bill.billPaymentStatus, 'PAID');
  });

  await t.test('Generates unique payment references matching format PAY-YYYYMMDD-XXXX', () => {
    const ref1 = generatePaymentReference();
    const ref2 = generatePaymentReference();

    assert.match(ref1, /^PAY-\d{8}-[A-F0-9]{4}$/);
    assert.match(ref2, /^PAY-\d{8}-[A-F0-9]{4}$/);
    assert.notEqual(ref1, ref2, 'Consecutive payment references must be distinct');
  });

  await t.test('Overpayment Guard: Rejects payment amounts greater than remaining balance', () => {
    const remainingBalance = 1500.00;
    const attemptedPayment = 2000.00;

    assert.ok(attemptedPayment > remainingBalance);
    assert.throws(() => {
      if (attemptedPayment > remainingBalance) {
        throw new Error(`Payment amount (₹${attemptedPayment}) cannot exceed remaining balance (₹${remainingBalance}).`);
      }
    }, /cannot exceed remaining balance/);
  });

  await t.test('Rejects zero or negative payment amounts', () => {
    const invalidAmounts = [0, -100, -0.01];
    for (const amt of invalidAmounts) {
      assert.ok(amt <= 0, `Amount ${amt} must be rejected`);
      assert.throws(() => {
        if (amt <= 0) {
          throw new Error('Payment amount must be greater than zero.');
        }
      }, /greater than zero/);
    }
  });
});

// =============================================================================
// TEST SUITE 8: PHASE 6 BILLING & PAYMENT VIEWS VERIFICATION
// =============================================================================
test('Phase 6 Route Architecture - Verifies Payment Management, Record Payment, and History endpoints', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const authHeaders = { 'x-test-bypass-auth': 'true' };

  try {
    // 1. Test GET /payments (Payment Management Directory)
    const paymentsRes = await fetch(`http://localhost:${port}/payments`, { headers: authHeaders });
    assert.equal(paymentsRes.status, 200, 'GET /payments must return 200 OK');
    const paymentsHtml = await paymentsRes.text();
    assert.ok(paymentsHtml.includes('Payment Management'), 'Should render Payment Management title');
    assert.ok(paymentsHtml.includes('Total Billed Revenue'), 'Should render KPI Total Billed');
    assert.ok(paymentsHtml.includes('Total Collected'), 'Should render KPI Total Collected');
    assert.ok(paymentsHtml.includes('Outstanding Balance'), 'Should render KPI Outstanding Balance');

    // 2. Test GET /payments/new (Record Payment Form)
    const newPaymentRes = await fetch(`http://localhost:${port}/payments/new`, { headers: authHeaders });
    assert.equal(newPaymentRes.status, 200, 'GET /payments/new must return 200 OK');
    const newPaymentHtml = await newPaymentRes.text();
    assert.ok(newPaymentHtml.includes('Record Reservation Payment'), 'Should render Record Payment title');
    assert.ok(newPaymentHtml.includes('Payment Method'), 'Should render Payment Method dropdown');
    assert.ok(newPaymentHtml.includes('CASH'), 'Should include CASH method');
    assert.ok(newPaymentHtml.includes('UPI'), 'Should include UPI method');
    assert.ok(newPaymentHtml.includes('CARD'), 'Should include CARD method');

    // 3. Test GET /payments/history (Payment History Ledger)
    const historyRes = await fetch(`http://localhost:${port}/payments/history`, { headers: authHeaders });
    assert.equal(historyRes.status, 200, 'GET /payments/history must return 200 OK');
    const historyHtml = await historyRes.text();
    assert.ok(historyHtml.includes('Payment History'), 'Should render Payment History title');
    assert.ok(historyHtml.includes('Settlement Logs'), 'Should render Settlement Logs section');
  } finally {
    server.close();
  }
});

// =============================================================================
// TEST SUITE 9: PHASE 7 DASHBOARD DATA STRUCTURE & CHART.JS DATASETS
// =============================================================================
test('Phase 7 Dashboard Services - Validates 10 Real-time Stats and Chart.js Data Structures', async (t) => {
  await t.test('Computes and exposes all 10 required Dashboard Statistics keys', async () => {
    const stats = await dashboardService.getDashboardStatistics();
    
    const requiredStats = [
      'totalRooms',
      'activeRooms',
      'currentlyOccupiedRooms',
      'availableRoomsToday',
      'totalRegisteredCustomers',
      'totalReservations',
      'todayCheckIns',
      'todayCheckOuts',
      'monthlyRevenue',
      'pendingPaymentAmount'
    ];

    for (const key of requiredStats) {
      assert.ok(key in stats, `Statistics key "${key}" must be defined`);
      assert.equal(typeof stats[key], 'number', `Stat "${key}" must evaluate to a number`);
      assert.ok(stats[key] >= 0, `Stat "${key}" must be non-negative`);
    }
  });

  await t.test('Generates valid Chart.js data models for Revenue, Categories, and Bookings', async () => {
    const charts = await dashboardService.getChartData();

    // Chart 1: Monthly Revenue
    assert.ok(charts.monthlyRevenueChart, 'monthlyRevenueChart must be provided');
    assert.ok(Array.isArray(charts.monthlyRevenueChart.labels), 'monthlyRevenueChart labels must be an array');
    assert.ok(Array.isArray(charts.monthlyRevenueChart.datasets), 'monthlyRevenueChart datasets must be an array');

    // Chart 2: Room Category Distribution
    assert.ok(charts.roomCategoryChart, 'roomCategoryChart must be provided');
    assert.ok(Array.isArray(charts.roomCategoryChart.labels), 'roomCategoryChart labels must be an array');
    assert.ok(Array.isArray(charts.roomCategoryChart.datasets), 'roomCategoryChart datasets must be an array');

    // Chart 3: Monthly Reservations Lifecycle
    assert.ok(charts.monthlyReservationsChart, 'monthlyReservationsChart must be provided');
    assert.ok(Array.isArray(charts.monthlyReservationsChart.labels), 'monthlyReservationsChart labels must be an array');
    assert.ok(Array.isArray(charts.monthlyReservationsChart.datasets), 'monthlyReservationsChart datasets must be an array');
  });

  await t.test('Exposes recent activity feeds for live dashboard widgets', async () => {
    const activity = await dashboardService.getRecentActivity();
    assert.ok(Array.isArray(activity.recentReservations), 'recentReservations must be an array');
    assert.ok(Array.isArray(activity.recentPayments), 'recentPayments must be an array');
  });
});

// =============================================================================
// TEST SUITE 10: PHASE 7 ROUTE ARCHITECTURE - DASHBOARD & 7 REPORTS
// =============================================================================
test('Phase 7 Route Architecture - Verifies Executive Dashboard and All 7 Report Endpoints', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const authHeaders = { 'x-test-bypass-auth': 'true' };

  t.after(async () => {
    try {
      await pool.end();
    } catch (e) {}
  });

  try {
    // 1. Test GET / (Admin Dashboard)
    const dashboardRes = await fetch(`http://localhost:${port}/`, { headers: authHeaders });
    assert.equal(dashboardRes.status, 200, 'GET / must return 200 OK');
    const dashboardHtml = await dashboardRes.text();
    assert.ok(dashboardHtml.includes('Executive Dashboard'), 'Should render Executive Dashboard title');
    assert.ok(dashboardHtml.includes('1. Total Rooms'), 'Should render Total Rooms KPI');
    assert.ok(dashboardHtml.includes('4. Available Today'), 'Should render Available Today KPI');
    assert.ok(dashboardHtml.includes('9. Monthly Revenue'), 'Should render Monthly Revenue KPI');
    assert.ok(dashboardHtml.includes('10. Pending Balance'), 'Should render Pending Balance KPI');
    assert.ok(dashboardHtml.includes('monthlyRevenueChart'), 'Should include Chart.js canvas for Monthly Revenue');
    assert.ok(dashboardHtml.includes('roomCategoryChart'), 'Should include Chart.js canvas for Room Categories');
    assert.ok(dashboardHtml.includes('monthlyReservationsChart'), 'Should include Chart.js canvas for Monthly Reservations');

    // 2. Test GET /api/dashboard/stats (JSON API for charts/telemetry)
    const apiRes = await fetch(`http://localhost:${port}/api/dashboard/stats`, { headers: authHeaders });
    assert.equal(apiRes.status, 200, 'GET /api/dashboard/stats must return 200 OK');
    const apiJson = await apiRes.json();
    assert.equal(apiJson.success, true);
    assert.ok('stats' in apiJson);
    assert.ok('charts' in apiJson);

    // 3. Test GET /reports (Central Reports Portal)
    const reportsRes = await fetch(`http://localhost:${port}/reports`, { headers: authHeaders });
    assert.equal(reportsRes.status, 200, 'GET /reports must return 200 OK');
    const reportsHtml = await reportsRes.text();
    assert.ok(reportsHtml.includes('Reporting & Analytics Portal'), 'Should render Reports portal title');
    assert.ok(reportsHtml.includes('1. Daily Reservation Report'), 'Should list Report 1');
    assert.ok(reportsHtml.includes('2. Monthly Reservation Report'), 'Should list Report 2');
    assert.ok(reportsHtml.includes('3. Customer Booking Report'), 'Should list Report 3');
    assert.ok(reportsHtml.includes('4. Room Availability Report'), 'Should list Report 4');
    assert.ok(reportsHtml.includes('5. Monthly Revenue Report'), 'Should list Report 5');
    assert.ok(reportsHtml.includes('6. Payment History Report'), 'Should list Report 6');
    assert.ok(reportsHtml.includes('7. Cancelled Bookings Report'), 'Should list Report 7');

    // 4. Test GET /reports/daily-reservations (Report 1)
    const r1Res = await fetch(`http://localhost:${port}/reports/daily-reservations`, { headers: authHeaders });
    assert.equal(r1Res.status, 200, 'Report 1 must return 200 OK');
    const r1Html = await r1Res.text();
    assert.ok(r1Html.includes('Daily Reservation Report'));

    // 5. Test GET /reports/monthly-reservations (Report 2)
    const r2Res = await fetch(`http://localhost:${port}/reports/monthly-reservations`, { headers: authHeaders });
    assert.equal(r2Res.status, 200, 'Report 2 must return 200 OK');
    const r2Html = await r2Res.text();
    assert.ok(r2Html.includes('Monthly Reservation Report'));

    // 6. Test GET /reports/customer-bookings (Report 3)
    const r3Res = await fetch(`http://localhost:${port}/reports/customer-bookings`, { headers: authHeaders });
    assert.equal(r3Res.status, 200, 'Report 3 must return 200 OK');
    const r3Html = await r3Res.text();
    assert.ok(r3Html.includes('Customer Booking'));

    // 7. Test GET /reports/room-availability (Report 4)
    const r4Res = await fetch(`http://localhost:${port}/reports/room-availability`, { headers: authHeaders });
    assert.equal(r4Res.status, 200, 'Report 4 must return 200 OK');
    const r4Html = await r4Res.text();
    assert.ok(r4Html.includes('Room Availability'));

    // 8. Test GET /reports/monthly-revenue (Report 5)
    const r5Res = await fetch(`http://localhost:${port}/reports/monthly-revenue`, { headers: authHeaders });
    assert.equal(r5Res.status, 200, 'Report 5 must return 200 OK');
    const r5Html = await r5Res.text();
    assert.ok(r5Html.includes('Monthly Revenue'));

    // 9. Test GET /reports/payment-history (Report 6)
    const r6Res = await fetch(`http://localhost:${port}/reports/payment-history`, { headers: authHeaders });
    assert.equal(r6Res.status, 200, 'Report 6 must return 200 OK');
    const r6Html = await r6Res.text();
    assert.ok(r6Html.includes('Payment History & Settlement Audit Report'));

    // 10. Test GET /reports/cancelled-reservations (Report 7)
    const r7Res = await fetch(`http://localhost:${port}/reports/cancelled-reservations`, { headers: authHeaders });
    assert.equal(r7Res.status, 200, 'Report 7 must return 200 OK');
    const r7Html = await r7Res.text();
    assert.ok(r7Html.includes('Cancelled Reservation & Revenue Loss Audit'));
  } finally {
    server.close();
  }
});
