import { query } from '../config/db.js';

/**
 * Report Service
 * Powers the 7 comprehensive reporting modules for Phase 7 using MySQL aggregations,
 * complex JOINs, GROUP BY, date functions, and summary KPIs.
 */

// =============================================================================
// REPORT 1: DAILY RESERVATION REPORT
// =============================================================================
export async function getDailyReservationReport({
  startDate = '',
  endDate = '',
  status = 'all',
  category = 'all'
} = {}) {
  let whereClauses = ['1=1'];
  const params = [];

  if (startDate && startDate.trim()) {
    whereClauses.push('res.check_in_date >= ?');
    params.push(startDate.trim());
  }

  if (endDate && endDate.trim()) {
    whereClauses.push('res.check_in_date <= ?');
    params.push(endDate.trim());
  }

  if (status && status !== 'all') {
    whereClauses.push('res.status = ?');
    params.push(status.trim().toLowerCase());
  }

  if (category && category !== 'all') {
    whereClauses.push('r.category = ?');
    params.push(category.trim());
  }

  const whereSql = whereClauses.join(' AND ');

  const listSql = `
    SELECT 
      res.id,
      res.booking_code,
      c.name AS customer_name,
      c.phone AS customer_phone,
      r.room_number,
      r.category AS room_category,
      DATE_FORMAT(res.check_in_date, '%Y-%m-%d') AS check_in_date,
      DATE_FORMAT(res.check_out_date, '%Y-%m-%d') AS check_out_date,
      DATEDIFF(res.check_out_date, res.check_in_date) AS nights,
      res.guests_count,
      res.nightly_rate,
      res.total_amount,
      res.status,
      DATE_FORMAT(res.created_at, '%Y-%m-%d %H:%i') AS created_at
    FROM reservations res
    JOIN customers c ON res.customer_id = c.id
    JOIN rooms r ON res.room_id = r.id
    WHERE ${whereSql}
    ORDER BY res.check_in_date DESC, res.id DESC
  `;

  const summarySql = `
    SELECT 
      COUNT(res.id) AS total_bookings,
      COALESCE(SUM(res.guests_count), 0) AS total_guests,
      COALESCE(SUM(res.total_amount), 0) AS total_revenue,
      COALESCE(ROUND(AVG(res.total_amount), 2), 0) AS avg_booking_value,
      COUNT(CASE WHEN res.status = 'checked_in' THEN 1 END) AS checked_in_count,
      COUNT(CASE WHEN res.status = 'cancelled' THEN 1 END) AS cancelled_count
    FROM reservations res
    JOIN rooms r ON res.room_id = r.id
    WHERE ${whereSql}
  `;

  let records = [];
  let summary = { total_bookings: 0, total_guests: 0, total_revenue: 0, avg_booking_value: 0, checked_in_count: 0, cancelled_count: 0 };

  try {
    const [rows, sumRows] = await Promise.all([
      query(listSql, params),
      query(summarySql, params)
    ]);
    records = rows;
    summary = sumRows[0] || summary;
  } catch (err) {
    records = [];
  }

  return { records, summary };
}

// =============================================================================
// REPORT 2: MONTHLY RESERVATION REPORT
// =============================================================================
export async function getMonthlyReservationReport({
  year = new Date().getFullYear(),
  status = 'all',
  category = 'all'
} = {}) {
  let whereClauses = ['YEAR(res.created_at) = ?'];
  const params = [parseInt(year, 10) || new Date().getFullYear()];

  if (status && status !== 'all') {
    whereClauses.push('res.status = ?');
    params.push(status.trim().toLowerCase());
  }

  if (category && category !== 'all') {
    whereClauses.push('r.category = ?');
    params.push(category.trim());
  }

  const whereSql = whereClauses.join(' AND ');

  const monthlyGroupSql = `
    SELECT 
      MONTH(res.created_at) AS month_num,
      DATE_FORMAT(res.created_at, '%M') AS month_name,
      DATE_FORMAT(res.created_at, '%b %Y') AS month_label,
      COUNT(res.id) AS total_bookings,
      COALESCE(SUM(DATEDIFF(res.check_out_date, res.check_in_date)), 0) AS total_nights,
      ROUND(COALESCE(AVG(DATEDIFF(res.check_out_date, res.check_in_date)), 0), 1) AS avg_stay_length,
      COALESCE(SUM(res.total_amount), 0) AS total_revenue,
      ROUND(COALESCE(AVG(res.total_amount), 0), 2) AS avg_booking_value,
      COUNT(CASE WHEN res.status = 'cancelled' THEN 1 END) AS cancelled_count,
      ROUND((COUNT(CASE WHEN res.status = 'cancelled' THEN 1 END) / COUNT(res.id)) * 100, 1) AS cancellation_rate
    FROM reservations res
    JOIN rooms r ON res.room_id = r.id
    WHERE ${whereSql}
    GROUP BY MONTH(res.created_at), month_name, month_label
    ORDER BY month_num ASC
  `;

  const grandSummarySql = `
    SELECT 
      COUNT(res.id) AS total_bookings,
      COALESCE(SUM(DATEDIFF(res.check_out_date, res.check_in_date)), 0) AS total_nights,
      ROUND(COALESCE(AVG(DATEDIFF(res.check_out_date, res.check_in_date)), 0), 1) AS avg_stay_length,
      COALESCE(SUM(res.total_amount), 0) AS total_revenue,
      ROUND(COALESCE(AVG(res.total_amount), 0), 2) AS avg_booking_value,
      COUNT(CASE WHEN res.status = 'cancelled' THEN 1 END) AS cancelled_count
    FROM reservations res
    JOIN rooms r ON res.room_id = r.id
    WHERE ${whereSql}
  `;

  let monthlyData = [];
  let grandSummary = { total_bookings: 0, total_nights: 0, avg_stay_length: 0, total_revenue: 0, avg_booking_value: 0, cancelled_count: 0 };

  try {
    const [mRows, gRows] = await Promise.all([
      query(monthlyGroupSql, params),
      query(grandSummarySql, params)
    ]);
    monthlyData = mRows;
    grandSummary = gRows[0] || grandSummary;
  } catch (err) {
    monthlyData = [];
  }

  return { monthlyData, grandSummary };
}

// =============================================================================
// REPORT 3: CUSTOMER BOOKING REPORT
// =============================================================================
export async function getCustomerBookingReport({
  search = '',
  minBookings = 0,
  sortBy = 'spend_desc'
} = {}) {
  let whereClauses = ['1=1'];
  const params = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push('(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
    params.push(term, term, term);
  }

  const whereSql = whereClauses.join(' AND ');

  let havingClause = '';
  if (minBookings && parseInt(minBookings, 10) > 0) {
    havingClause = 'HAVING COUNT(res.id) >= ?';
    params.push(parseInt(minBookings, 10));
  }

  let orderSql = 'ORDER BY lifetime_spend DESC';
  if (sortBy === 'bookings_desc') {
    orderSql = 'ORDER BY total_reservations DESC, lifetime_spend DESC';
  } else if (sortBy === 'name_asc') {
    orderSql = 'ORDER BY c.name ASC';
  } else if (sortBy === 'recent_first') {
    orderSql = 'ORDER BY last_booking_date DESC';
  }

  const customerReportSql = `
    SELECT 
      c.id,
      c.name,
      c.email,
      c.phone,
      c.address,
      DATE_FORMAT(c.created_at, '%Y-%m-%d') AS registration_date,
      COUNT(res.id) AS total_reservations,
      COUNT(CASE WHEN res.status IN ('checked_in', 'checked_out') THEN 1 END) AS completed_stays,
      COUNT(CASE WHEN res.status = 'cancelled' THEN 1 END) AS cancelled_count,
      COALESCE(SUM(CASE WHEN res.status != 'cancelled' THEN res.total_amount ELSE 0 END), 0) AS lifetime_spend,
      ROUND(COALESCE(AVG(CASE WHEN res.status != 'cancelled' THEN res.total_amount ELSE NULL END), 0), 2) AS avg_booking_spend,
      DATE_FORMAT(MAX(res.created_at), '%Y-%m-%d') AS last_booking_date
    FROM customers c
    LEFT JOIN reservations res ON c.id = res.customer_id
    WHERE ${whereSql}
    GROUP BY c.id, c.name, c.email, c.phone, c.address, registration_date
    ${havingClause}
    ${orderSql}
  `;

  let customers = [];
  try {
    customers = await query(customerReportSql, params);
  } catch (err) {
    customers = [];
  }

  // Calculate summary metrics across all customers
  const totalCustomers = customers.length;
  const totalBookings = customers.reduce((sum, c) => sum + parseInt(c.total_reservations, 10), 0);
  const totalSpend = customers.reduce((sum, c) => sum + parseFloat(c.lifetime_spend), 0);
  const avgSpendPerCustomer = totalCustomers > 0 ? (totalSpend / totalCustomers).toFixed(2) : 0;

  return {
    customers,
    summary: {
      totalCustomers,
      totalBookings,
      totalSpend,
      avgSpendPerCustomer
    }
  };
}

// =============================================================================
// REPORT 4: ROOM AVAILABILITY REPORT
// =============================================================================
export async function getRoomAvailabilityReport({
  targetDate = new Date().toISOString().slice(0, 10),
  category = 'all',
  availabilityStatus = 'all'
} = {}) {
  let whereClauses = ['1=1'];
  const params = [];

  if (category && category !== 'all') {
    whereClauses.push('r.category = ?');
    params.push(category.trim());
  }

  const whereSql = whereClauses.join(' AND ');

  const roomSql = `
    SELECT 
      r.id AS room_id,
      r.room_number,
      r.category,
      r.capacity,
      r.price_per_night,
      r.status AS operational_status,
      res.id AS reservation_id,
      res.booking_code,
      c.name AS guest_name,
      DATE_FORMAT(res.check_in_date, '%Y-%m-%d') AS check_in_date,
      DATE_FORMAT(res.check_out_date, '%Y-%m-%d') AS check_out_date,
      res.status AS reservation_status
    FROM rooms r
    LEFT JOIN reservations res ON r.id = res.room_id 
      AND res.status IN ('confirmed', 'checked_in')
      AND ? >= res.check_in_date 
      AND ? < res.check_out_date
    LEFT JOIN customers c ON res.customer_id = c.id
    WHERE ${whereSql}
    ORDER BY r.room_number ASC
  `;

  let rooms = [];
  try {
    const rawRooms = await query(roomSql, [targetDate, targetDate, ...params]);
    rooms = rawRooms.map(r => {
      let currentAvailability = 'AVAILABLE';
      let badgeClass = 'bg-success';

      if (r.operational_status === 'MAINTENANCE') {
        currentAvailability = 'MAINTENANCE';
        badgeClass = 'bg-secondary';
      } else if (r.reservation_status === 'checked_in') {
        currentAvailability = 'OCCUPIED';
        badgeClass = 'bg-danger';
      } else if (r.reservation_status === 'confirmed') {
        currentAvailability = 'RESERVED';
        badgeClass = 'bg-warning text-dark';
      }

      return {
        ...r,
        currentAvailability,
        badgeClass
      };
    });

    if (availabilityStatus && availabilityStatus !== 'all') {
      rooms = rooms.filter(r => r.currentAvailability.toLowerCase() === availabilityStatus.toLowerCase());
    }
  } catch (err) {
    rooms = [];
  }

  // Summary counts
  const totalRooms = rooms.length;
  const availableRooms = rooms.filter(r => r.currentAvailability === 'AVAILABLE').length;
  const occupiedRooms = rooms.filter(r => r.currentAvailability === 'OCCUPIED').length;
  const reservedRooms = rooms.filter(r => r.currentAvailability === 'RESERVED').length;
  const maintenanceRooms = rooms.filter(r => r.currentAvailability === 'MAINTENANCE').length;
  const activeRooms = totalRooms - maintenanceRooms;
  const occupancyRate = activeRooms > 0 ? (((occupiedRooms + reservedRooms) / activeRooms) * 100).toFixed(1) : 0;

  return {
    targetDate,
    rooms,
    summary: {
      totalRooms,
      availableRooms,
      occupiedRooms,
      reservedRooms,
      maintenanceRooms,
      occupancyRate
    }
  };
}

// =============================================================================
// REPORT 5: MONTHLY REVENUE REPORT
// =============================================================================
export async function getMonthlyRevenueReport({
  year = new Date().getFullYear(),
  method = 'all',
  paymentStatus = 'SUCCESS'
} = {}) {
  let whereClauses = ['YEAR(p.payment_date) = ?'];
  const params = [parseInt(year, 10) || new Date().getFullYear()];

  if (method && method !== 'all') {
    whereClauses.push('p.payment_method = ?');
    params.push(method.trim().toUpperCase());
  }

  if (paymentStatus && paymentStatus !== 'all') {
    whereClauses.push('p.payment_status = ?');
    params.push(paymentStatus.trim().toUpperCase());
  }

  const whereSql = whereClauses.join(' AND ');

  const monthlyRevSql = `
    SELECT 
      MONTH(p.payment_date) AS month_num,
      DATE_FORMAT(p.payment_date, '%M') AS month_name,
      DATE_FORMAT(p.payment_date, '%b %Y') AS month_label,
      COUNT(p.id) AS transaction_count,
      COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0) AS cash_revenue,
      COALESCE(SUM(CASE WHEN p.payment_method = 'UPI' THEN p.amount ELSE 0 END), 0) AS upi_revenue,
      COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount ELSE 0 END), 0) AS card_revenue,
      COALESCE(SUM(p.amount), 0) AS total_collected,
      ROUND(COALESCE(AVG(p.amount), 0), 2) AS avg_transaction_value
    FROM payments p
    WHERE ${whereSql}
    GROUP BY MONTH(p.payment_date), month_name, month_label
    ORDER BY month_num ASC
  `;

  let monthlyBreakdown = [];
  try {
    monthlyBreakdown = await query(monthlyRevSql, params);
  } catch (err) {
    monthlyBreakdown = [];
  }

  const grandTotal = monthlyBreakdown.reduce((sum, m) => sum + parseFloat(m.total_collected), 0);
  const totalCash = monthlyBreakdown.reduce((sum, m) => sum + parseFloat(m.cash_revenue), 0);
  const totalUpi = monthlyBreakdown.reduce((sum, m) => sum + parseFloat(m.upi_revenue), 0);
  const totalCard = monthlyBreakdown.reduce((sum, m) => sum + parseFloat(m.card_revenue), 0);
  const totalTransactions = monthlyBreakdown.reduce((sum, m) => sum + parseInt(m.transaction_count, 10), 0);

  return {
    year,
    monthlyBreakdown,
    summary: {
      grandTotal,
      totalCash,
      totalUpi,
      totalCard,
      totalTransactions
    }
  };
}

// =============================================================================
// REPORT 6: PAYMENT HISTORY REPORT
// =============================================================================
export async function getPaymentHistoryReport({
  startDate = '',
  endDate = '',
  method = 'all',
  status = 'all',
  search = ''
} = {}) {
  let whereClauses = ['1=1'];
  const params = [];

  if (startDate && startDate.trim()) {
    whereClauses.push('DATE(p.payment_date) >= ?');
    params.push(startDate.trim());
  }

  if (endDate && endDate.trim()) {
    whereClauses.push('DATE(p.payment_date) <= ?');
    params.push(endDate.trim());
  }

  if (method && method !== 'all') {
    whereClauses.push('p.payment_method = ?');
    params.push(method.trim().toUpperCase());
  }

  if (status && status !== 'all') {
    whereClauses.push('p.payment_status = ?');
    params.push(status.trim().toUpperCase());
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push('(p.payment_reference LIKE ? OR res.booking_code LIKE ? OR c.name LIKE ? OR p.transaction_id LIKE ?)');
    params.push(term, term, term, term);
  }

  const whereSql = whereClauses.join(' AND ');

  const listSql = `
    SELECT 
      p.id,
      p.payment_reference,
      p.reservation_id,
      res.booking_code,
      c.name AS customer_name,
      c.phone AS customer_phone,
      r.room_number,
      p.amount,
      p.payment_method,
      p.payment_status,
      DATE_FORMAT(p.payment_date, '%Y-%m-%d %H:%i:%s') AS payment_date,
      p.transaction_id,
      p.notes
    FROM payments p
    JOIN reservations res ON p.reservation_id = res.id
    JOIN customers c ON res.customer_id = c.id
    JOIN rooms r ON res.room_id = r.id
    WHERE ${whereSql}
    ORDER BY p.id DESC
  `;

  const summarySql = `
    SELECT 
      COUNT(p.id) AS total_count,
      COALESCE(SUM(CASE WHEN p.payment_status = 'SUCCESS' THEN p.amount ELSE 0 END), 0) AS total_success,
      COALESCE(SUM(CASE WHEN p.payment_status = 'PENDING' THEN p.amount ELSE 0 END), 0) AS total_pending,
      COALESCE(SUM(CASE WHEN p.payment_status = 'FAILED' THEN p.amount ELSE 0 END), 0) AS total_failed,
      ROUND(COALESCE(AVG(p.amount), 0), 2) AS avg_amount
    FROM payments p
    JOIN reservations res ON p.reservation_id = res.id
    JOIN customers c ON res.customer_id = c.id
    WHERE ${whereSql}
  `;

  let payments = [];
  let summary = { total_count: 0, total_success: 0, total_pending: 0, total_failed: 0, avg_amount: 0 };

  try {
    const [rows, sumRows] = await Promise.all([
      query(listSql, params),
      query(summarySql, params)
    ]);
    payments = rows;
    summary = sumRows[0] || summary;
  } catch (err) {
    payments = [];
  }

  return { payments, summary };
}

// =============================================================================
// REPORT 7: CANCELLED RESERVATION REPORT
// =============================================================================
export async function getCancelledReservationReport({
  startDate = '',
  endDate = '',
  category = 'all',
  search = ''
} = {}) {
  let whereClauses = ["res.status = 'cancelled'"];
  const params = [];

  if (startDate && startDate.trim()) {
    whereClauses.push('res.check_in_date >= ?');
    params.push(startDate.trim());
  }

  if (endDate && endDate.trim()) {
    whereClauses.push('res.check_in_date <= ?');
    params.push(endDate.trim());
  }

  if (category && category !== 'all') {
    whereClauses.push('r.category = ?');
    params.push(category.trim());
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push('(res.booking_code LIKE ? OR c.name LIKE ? OR c.email LIKE ?)');
    params.push(term, term, term);
  }

  const whereSql = whereClauses.join(' AND ');

  const listSql = `
    SELECT 
      res.id,
      res.booking_code,
      c.name AS customer_name,
      c.email AS customer_email,
      c.phone AS customer_phone,
      r.room_number,
      r.category AS room_category,
      DATE_FORMAT(res.check_in_date, '%Y-%m-%d') AS check_in_date,
      DATE_FORMAT(res.check_out_date, '%Y-%m-%d') AS check_out_date,
      DATEDIFF(res.check_out_date, res.check_in_date) AS nights,
      res.total_amount AS lost_revenue,
      DATE_FORMAT(res.created_at, '%Y-%m-%d') AS booked_on,
      COALESCE(
        (SELECT remarks FROM reservation_status_history 
         WHERE reservation_id = res.id AND new_status = 'cancelled' 
         ORDER BY id DESC LIMIT 1),
        'Cancellation requested by administrator / guest'
      ) AS cancellation_reason,
      COALESCE(
        (SELECT DATE_FORMAT(change_timestamp, '%Y-%m-%d %H:%i') FROM reservation_status_history 
         WHERE reservation_id = res.id AND new_status = 'cancelled' 
         ORDER BY id DESC LIMIT 1),
        DATE_FORMAT(res.updated_at, '%Y-%m-%d %H:%i')
      ) AS cancelled_at
    FROM reservations res
    JOIN customers c ON res.customer_id = c.id
    JOIN rooms r ON res.room_id = r.id
    WHERE ${whereSql}
    ORDER BY res.id DESC
  `;

  const summarySql = `
    SELECT 
      COUNT(res.id) AS total_cancelled,
      COALESCE(SUM(res.total_amount), 0) AS total_lost_revenue,
      COALESCE(ROUND(AVG(res.total_amount), 2), 0) AS avg_lost_revenue,
      (SELECT COUNT(*) FROM reservations) AS all_reservations_count
    FROM reservations res
    JOIN rooms r ON res.room_id = r.id
    JOIN customers c ON res.customer_id = c.id
    WHERE ${whereSql}
  `;

  let cancellations = [];
  let summary = { total_cancelled: 0, total_lost_revenue: 0, avg_lost_revenue: 0, all_reservations_count: 0 };

  try {
    const [rows, sumRows] = await Promise.all([
      query(listSql, params),
      query(summarySql, params)
    ]);
    cancellations = rows;
    summary = sumRows[0] || summary;
  } catch (err) {
    cancellations = [];
  }

  const cancellationRate = summary.all_reservations_count > 0 
    ? ((summary.total_cancelled / summary.all_reservations_count) * 100).toFixed(1) 
    : 0;

  return {
    cancellations,
    summary: {
      ...summary,
      cancellationRate
    }
  };
}

