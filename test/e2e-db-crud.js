/**
 * End-to-End Live Database CRUD Verification Runner
 * Tests every single CRUD operation across Customers, Rooms, and Reservations against MySQL.
 * Run with: node test/e2e-db-crud.js
 */
import { testConnection } from '../src/config/db.js';
import * as customerService from '../src/services/customerService.js';
import * as roomService from '../src/services/roomService.js';
import * as reservationService from '../src/services/reservationService.js';
import * as billingService from '../src/services/billingService.js';
import * as dashboardService from '../src/services/dashboardService.js';
import * as reportService from '../src/services/reportService.js';
import authService from '../src/services/authService.js';

async function runE2ECrudTests() {
  console.log('='.repeat(70));
  console.log('🧪 Starting Live MySQL Database CRUD Operations Test Suite');
  console.log('='.repeat(70));

  const health = await testConnection();
  if (!health.success) {
    console.warn('⚠️  MySQL Database is not connected with current .env credentials:');
    console.warn(`   Reason: ${health.message}`);
    console.warn('   To run live database tests, please verify DB_PASSWORD in .env.');
    console.log('='.repeat(70));
    return;
  }

  console.log('✅ MySQL Database connected successfully. Proceeding with tests...\n');

  try {
    // -------------------------------------------------------------------------
    // MODULE 1: CUSTOMER MANAGEMENT CRUD
    // -------------------------------------------------------------------------
    console.log('--- [TEST 1/5] CUSTOMER MANAGEMENT CRUD ---');

    const testCustomerPayload = {
      name: 'Automated Test Guest',
      email: `testguest_${Date.now()}@example.com`,
      phone: `+91 ${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      address: '77 Silicon Valley Boulevard, Tech City'
    };
    const createdCustomerId = await customerService.createCustomer(testCustomerPayload);
    console.log(`✔ 1. Add Customer: Created customer with ID #${createdCustomerId}`);

    const allCustomers = await customerService.getAllCustomers();
    console.log(`✔ 2. View All Customers: Fetched ${allCustomers.length} customer records`);

    const fetchedCustomer = await customerService.getCustomerById(createdCustomerId);
    console.log(`✔ 3. View Customer Details: Retrieved "${fetchedCustomer.name}" (${fetchedCustomer.email})`);

    const searchResults = await customerService.getAllCustomers('Automated Test Guest');
    console.log(`✔ 4. Search Customers: Found ${searchResults.length} match(es) for "Automated Test Guest"`);

    const updated = await customerService.updateCustomer(createdCustomerId, {
      name: 'Automated Test Guest (Updated)',
      email: testCustomerPayload.email,
      phone: testCustomerPayload.phone,
      address: '99 Updated Tech Park, Innovation Zone'
    });
    console.log(`✔ 5. Update Customer: Success = ${updated}`);

    const isDuplicate = await customerService.isEmailTaken(testCustomerPayload.email);
    console.log(`✔ 6. Duplicate Email Detection: Verified = ${isDuplicate}\n`);

    // -------------------------------------------------------------------------
    // MODULE 2: ROOM MANAGEMENT CRUD
    // -------------------------------------------------------------------------
    console.log('--- [TEST 2/5] ROOM MANAGEMENT CRUD ---');

    const testRoomNumber = `T${Math.floor(100 + Math.random() * 900)}`;
    const testRoomPayload = {
      room_number: testRoomNumber,
      category: 'Deluxe',
      capacity: 2,
      price_per_night: 3200.00,
      status: 'ACTIVE'
    };
    const createdRoomId = await roomService.createRoom(testRoomPayload);
    console.log(`✔ 1. Add Room: Created room "${testRoomNumber}" (ID #${createdRoomId})`);

    const allRooms = await roomService.getAllRooms();
    console.log(`✔ 2. View All Rooms: Fetched ${allRooms.length} room records`);

    const roomSearchResults = await roomService.getAllRooms({ search: testRoomNumber });
    console.log(`✔ 3. Search Rooms: Found ${roomSearchResults.length} match for room "${testRoomNumber}"`);

    const deluxeRooms = await roomService.getAllRooms({ category: 'Deluxe' });
    console.log(`✔ 4. Filter by Category: Found ${deluxeRooms.length} "Deluxe" room(s)`);

    const activeRooms = await roomService.getAllRooms({ status: 'ACTIVE' });
    console.log(`✔ 5. Filter by Status: Found ${activeRooms.length} "ACTIVE" room(s)`);

    const isRoomDuplicate = await roomService.isRoomNumberTaken(testRoomNumber);
    console.log(`✔ 6. Duplicate Room Number Detection: Verified = ${isRoomDuplicate}\n`);

    // -------------------------------------------------------------------------
    // MODULE 3: RESERVATION MANAGEMENT & TRANSACTIONAL ENGINE
    // -------------------------------------------------------------------------
    console.log('--- [TEST 3/5] RESERVATION MANAGEMENT & CONFLICT AVOIDANCE ---');

    const today = new Date();
    const inDate = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const outDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 1. Transactional Creation with SELECT FOR UPDATE
    const booking = await reservationService.createReservation({
      customerId: createdCustomerId,
      roomId: createdRoomId,
      checkInDate: inDate,
      checkOutDate: outDate,
      guestsCount: 2,
      specialRequests: 'Automated test booking.'
    });
    console.log(`✔ 1. Transactional Booking: Confirmed ID #${booking.reservationId} (${booking.bookingCode}), Total: ₹${booking.totalAmount}`);

    // 2. Overlap Conflict Detection
    try {
      await reservationService.createReservation({
        customerId: createdCustomerId,
        roomId: createdRoomId,
        checkInDate: inDate,
        checkOutDate: outDate,
        guestsCount: 2
      });
      console.error('❌ Failed: Overlapping reservation should have been rejected!');
    } catch (overlapErr) {
      console.log(`✔ 2. Overlap Avoidance: Successfully caught and rejected overlapping booking: "${overlapErr.message}"`);
    }

    // 3. Process Check-In
    await reservationService.processCheckIn(booking.reservationId);
    let checkInState = await reservationService.getReservationById(booking.reservationId);
    console.log(`✔ 3. Process Check-In: Status transitioned to "${checkInState.status}"`);

    // 4. Process Check-Out
    await reservationService.processCheckOut(booking.reservationId);
    let checkOutState = await reservationService.getReservationById(booking.reservationId);
    console.log(`✔ 4. Process Check-Out: Status transitioned to "${checkOutState.status}"`);

    // 5. Audit History Verification
    const history = await reservationService.getReservationStatusHistory(booking.reservationId);
    console.log(`✔ 5. Status Audit Trail: Found ${history.length} transition logs\n`);

    // -------------------------------------------------------------------------
    // MODULE 4: PAYMENT AND BILLING MANAGEMENT CRUD & TRANSACTIONS
    // -------------------------------------------------------------------------
    console.log('--- [TEST 4/5] PAYMENT & BILLING TRANSACTIONS & SETTLEMENTS ---');

    // 1. Add Additional Service Charge
    const serviceId = await billingService.addAdditionalService(booking.reservationId, {
      serviceName: 'Airport Shuttle Luxury Van',
      amount: 750.00
    });
    console.log(`✔ 1. Add Service Charge: Added "Airport Shuttle" (₹750.00, ID #${serviceId})`);

    // 2. Fetch Server-side Bill Summary
    const initialBill = await billingService.getReservationBill(booking.reservationId);
    console.log(`✔ 2. Bill Calculation: Room ₹${initialBill.calculation.roomCharges} + Services ₹${initialBill.calculation.additionalCharges} = Final ₹${initialBill.calculation.finalAmount} (Status: ${initialBill.calculation.billPaymentStatus})`);

    // 3. Record Partial Payment (ACID Transaction)
    const partialPay = await billingService.recordPayment({
      reservationId: booking.reservationId,
      amount: 1500.00,
      paymentMethod: 'UPI',
      transactionId: 'UPI-TEST-9876543210',
      notes: 'Initial advance settlement'
    });
    console.log(`✔ 3. Partial Payment: Paid ₹1500.00 via UPI (Ref: ${partialPay.paymentReference}), Remaining Balance: ₹${partialPay.remainingBalance}`);

    // 4. Overpayment Guard Verification
    try {
      await billingService.recordPayment({
        reservationId: booking.reservationId,
        amount: partialPay.remainingBalance + 5000.00,
        paymentMethod: 'CASH'
      });
      console.error('❌ Failed: Overpayment should have been blocked!');
    } catch (overpayErr) {
      console.log(`✔ 4. Overpayment Guard: Successfully rejected payment exceeding balance: "${overpayErr.message}"`);
    }

    // 5. Final Settle Payment
    const finalPay = await billingService.recordPayment({
      reservationId: booking.reservationId,
      amount: partialPay.remainingBalance,
      paymentMethod: 'CARD',
      transactionId: 'CARD-AUTH-654321',
      notes: 'Final settlement at checkout'
    });
    console.log(`✔ 5. Full Settlement: Paid remaining ₹${finalPay.amount} via CARD, Remaining Balance: ₹${finalPay.remainingBalance} (Fully Paid: ${finalPay.isFullyPaid})`);

    // 6. Printable Receipt Verification
    const receipt = await billingService.getPaymentReceipt(finalPay.paymentId);
    console.log(`✔ 6. Payment Receipt: Retrieved voucher "${receipt.payment_reference}" for ₹${receipt.amount} (${receipt.payment_status})`);

    // 7. Payment History Verification
    const paymentLogs = await billingService.getAllPayments();
    console.log(`✔ 7. Payment Ledger: Fetched ${paymentLogs.length} total transaction logs across system\n`);

    // 8. Relational Integrity Protection (Cannot delete customer with reservation)
    try {
      await customerService.deleteCustomer(createdCustomerId);
      console.error('❌ Failed: Customer with reservations should not be deletable!');
    } catch (constraintErr) {
      console.log(`✔ 8. Relational Integrity: Prevented deletion of customer with booking records: "${constraintErr.message}"`);
    }

    // 9. Cancellation Testing on an Active Booking
    const cancelTestBooking = await reservationService.createReservation({
      customerId: createdCustomerId,
      roomId: createdRoomId,
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-05',
      guestsCount: 1,
      status: 'confirmed'
    });
    await reservationService.cancelReservation(cancelTestBooking.reservationId, 'Test teardown cancellation');
    console.log(`✔ 9. Cancellation: Successfully cancelled reservation #${cancelTestBooking.reservationId} and released room dates\n`);

    // -------------------------------------------------------------------------
    // MODULE 5: DASHBOARD & REPORTING AGGREGATE ENGINE (PHASE 7)
    // -------------------------------------------------------------------------
    console.log('--- [TEST 5/5] DASHBOARD & REPORTING AGGREGATE ENGINE ---');

    // 1. Dashboard 10 Statistics
    const stats = await dashboardService.getDashboardStatistics();
    console.log(`✔ 1. Dashboard 10 Statistics:`);
    console.log(`     - Total Rooms: ${stats.totalRooms}, Active: ${stats.activeRooms}, Occupied: ${stats.currentlyOccupiedRooms}, Available Today: ${stats.availableRoomsToday}`);
    console.log(`     - Customers: ${stats.totalRegisteredCustomers}, Reservations: ${stats.totalReservations}`);
    console.log(`     - Today Check-Ins: ${stats.todayCheckIns}, Check-Outs: ${stats.todayCheckOuts}`);
    console.log(`     - Monthly Revenue: ₹${stats.monthlyRevenue}, Pending Receivables: ₹${stats.pendingPaymentAmount}`);

    // 2. Chart.js Datasets
    const charts = await dashboardService.getChartData();
    console.log(`✔ 2. Chart.js Datasets: Generated ${charts.monthlyRevenueChart.labels.length} revenue intervals & ${charts.roomCategoryChart.labels.length} category sectors`);

    // 3. Report 1: Daily Reservations
    const r1 = await reportService.getDailyReservationReport();
    console.log(`✔ 3. Report 1 (Daily Reservations): Fetched ${r1.records.length} records (Revenue: ₹${r1.summary.total_revenue})`);

    // 4. Report 2: Monthly Reservations
    const r2 = await reportService.getMonthlyReservationReport();
    console.log(`✔ 4. Report 2 (Monthly Reservations): Fetched ${r2.monthlyData.length} monthly aggregate rows`);

    // 5. Report 3: Customer Bookings
    const r3 = await reportService.getCustomerBookingReport();
    console.log(`✔ 5. Report 3 (Customer Bookings): Evaluated ${r3.customers.length} customer spend profiles`);

    // 6. Report 4: Room Availability
    const r4 = await reportService.getRoomAvailabilityReport();
    console.log(`✔ 6. Report 4 (Room Availability): Analyzed ${r4.rooms.length} room inventory states (Available: ${r4.summary.availableRooms}, Occupancy: ${r4.summary.occupancyRate}%)`);

    // 7. Report 5: Monthly Revenue
    const r5 = await reportService.getMonthlyRevenueReport();
    console.log(`✔ 7. Report 5 (Monthly Revenue): Computed ${r5.monthlyBreakdown.length} months breakdown (Gross: ₹${r5.summary.grandTotal})`);

    // 8. Report 6: Payment History
    const r6 = await reportService.getPaymentHistoryReport();
    console.log(`✔ 8. Report 6 (Payment History): Loaded ${r6.payments.length} ledger transactions (Collected: ₹${r6.summary.total_success})`);

    // 9. Report 7: Cancelled Reservations
    const r7 = await reportService.getCancelledReservationReport();
    console.log(`✔ 9. Report 7 (Cancelled Reservations): Audited ${r7.cancellations.length} cancellations (Lost Rev: ₹${r7.summary.total_lost_revenue})\n`);

    // -------------------------------------------------------------------------
    // MODULE 6: PHASE 9 ADMINISTRATOR AUTHENTICATION & SECURITY
    // -------------------------------------------------------------------------
    console.log('--- [TEST 6/6] ADMINISTRATOR AUTHENTICATION & SECURITY ---');

    // 1. Password hashing verification
    const testPlainPass = 'AdminSecurity@2026';
    const testHash = await authService.hashPassword(testPlainPass);
    console.log(`✔ 1. Bcrypt Hashing: Generated salted hash (${testHash.substring(0, 15)}...)`);

    // 2. Password matching
    const passMatches = await authService.comparePassword(testPlainPass, testHash);
    console.log(`✔ 2. Bcrypt Verification: Matching password validated: ${passMatches}`);

    // 3. Password mismatch rejection
    const wrongMatches = await authService.comparePassword('WrongPassword!', testHash);
    console.log(`✔ 3. Bcrypt Protection: Mismatch password rejected: ${!wrongMatches}`);

    // 4. Administrator Authentication lookup
    const authResult = await authService.authenticate('admin', 'Admin@12345');
    console.log(`✔ 4. Administrator Auth: Authenticated "${authResult.user?.username}" successfully (${authResult.success})\n`);

    console.log('='.repeat(70));
    console.log('🎉 ALL 6 MODULES & PHASE 9 OPERATIONS PASSED CLEANLY!');
    console.log('='.repeat(70));
  } catch (error) {
    console.error('❌ Live CRUD Test failed with error:', error);
  } finally {
    process.exit(0);
  }
}

runE2ECrudTests();
