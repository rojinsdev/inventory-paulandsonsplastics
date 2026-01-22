'use client';
import InventoryPageTemplate from '@/components/inventory/InventoryPageTemplate';

export default function ReservedPage() {
    return (
        <InventoryPageTemplate
            title="Reserved Stock"
            type="reserved"
            description="Stock committed to confirmed sales orders"
            guide={{
                title: "Reserved Stock",
                description: "Inventory committed to active sales orders. These items are physically present but legally 'sold'.",
                logic: [
                    {
                        title: "Hard Lock Mechanism",
                        explanation: "Once a Sales Order is 'Confirmed', the system moves the quantity from 'Finished' to 'Reserved'. This prevents overselling the same physical bundle."
                    },
                    {
                        title: "Inventory Reversion",
                        explanation: "If an order is cancelled or a delivery is rejected, stock automatically flows back to the 'Finished' state for resale."
                    }
                ],
                components: [
                    {
                        name: "Order Source Link",
                        description: "Clickable IDs in the table that take you directly to the Sales Order responsible for the reservation."
                    },
                    {
                        name: "Reservation Age",
                        description: "Tracks how long stock has been sitting in reserved state; helps identify stale orders."
                    }
                ]
            }}
        />
    );
}
