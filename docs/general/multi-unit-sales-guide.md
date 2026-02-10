# Multi-Unit Sales and Inventory Guide

This guide explains how the system handles different sales units and how they interact with inventory and production.

## 1. Supported Sales Units

The system supports three distinct units for sales orders:

| Unit | Description | Inventory Source |
| :--- | :--- | :--- |
| **Bundle** | Standard bulk unit (e.g., a sack or large bag). | `finished` (Bundles) |
| **Packet** | Smaller retail units within a bundle. | `packed` (Packets) |
| **Loose** | Individual items sold separately. | `semi_finished` (Loose Items) |

## 2. Order Creation Workflow

When a salesperson creates an order:
1. They select the `Product` and the `Unit Type`.
2. The system checks the available stock for that specific unit in the assigned factory.
3. **If available**: The stock is moved from the source state (Finished/Packed/Semi-Finished) to the **Reserved** state.
4. **If unavailable**: The item is marked as **Backordered**.

## 3. Demand Signaling (Backorders)

If an item is backordered:
- An **"Order Form"** (Production Request) is automatically generated.
- This request alerts the production team that a specific quantity of items is needed to fulfill a sale.
- The production team can see these requests on their mobile dashboard.

## 4. Automatic Fulfillment (FIFO)

The system uses a **First-In-First-Out (FIFO)** queue for backordered items.
- When production is logged or items are packed/bundled, the system automatically checks the backorder queue.
- It prioritizes the oldest orders.
- Once fulfilled, the salesperson receives an instant notification that the order is ready for delivery.

## 5. Delivery

Only once items are **Reserved** (either immediately or after backorder fulfillment) can they be processed in the **Deliveries** screen to be dispatched to the customer.
