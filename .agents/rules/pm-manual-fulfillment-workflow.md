---
trigger: always_on
---

# PM Manual Fulfillment Workflow Rule

This rule defines the strictly manual, PM-controlled inventory reservation and fulfillment flow. You MUST follow these principles:

1.  **Production Request Screen ("Mark as Prepared")**:
    -   The "Mark as Prepared" action is a status-only signal.
    -   It MUST ONLY update the production request status to `prepared`.
    -   It MUST NOT automatically reserve stock or update sales order items.
    -   Marking as prepared hides the request from the active production list.

2.  **Order Preparation Screen (The Source of Truth)**:
    -   This is the ONLY place where stock reservation for sales orders occurs.
    -   **Filtering Logic**:
        -   SHOW items that have stock immediately available (`is_backordered == false`).
        -   SHOW items that were backordered ONLY if they have been marked as `prepared` via the production screen.
        -   HIDE items that are still "Awaiting Production" (pending backordered items).
    -   **Reservation**: Reservation remains a manual, intentional step performed by the PM clicking "Reserve & Forward to Dispatch".
