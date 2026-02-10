#!/usr/bin/env ts-node

/**
 * Overdue Payment Checker
 * 
 * This script checks for overdue credit payments and marks them in the database.
 * Run this script daily via cron job or task scheduler.
 * 
 * Usage:
 *   npm run check-overdue
 *   OR
 *   ts-node src/scripts/check-overdue-payments.ts
 */

import { salesOrderService } from '../modules/sales-orders/sales-order.service';

async function checkOverduePayments() {
    console.log('='.repeat(60));
    console.log('Overdue Payment Check - Starting');
    console.log('Time:', new Date().toISOString());
    console.log('='.repeat(60));

    try {
        const result = await salesOrderService.checkAndUpdateOverdueOrders();

        console.log(`\n✓ Check completed successfully`);
        console.log(`  Orders marked as overdue: ${result.count}`);

        if (result.count > 0) {
            console.log('\n  Overdue Orders:');
            result.orders.forEach((order, index) => {
                console.log(`  ${index + 1}. Order ID: ${order.id}`);
                console.log(`     Balance Due: ₹${order.balance_due}`);
                console.log(`     Deadline: ${order.credit_deadline}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        process.exit(0);
    } catch (error: any) {
        console.error('\n✗ Error checking overdue payments:');
        console.error('  ', error.message);
        console.log('\n' + '='.repeat(60));
        process.exit(1);
    }
}

// Run the check
checkOverduePayments();
