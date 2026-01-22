'use client';
import InventoryPageTemplate from '@/components/inventory/InventoryPageTemplate';

export default function PackedPage() {
    return (
        <InventoryPageTemplate
            title="Packed Goods"
            type="packed"
            description="Items packed into packets, awaiting bundling"
            guide={{
                title: "Packed Inventory",
                description: "Stock that has been converted from loose items into tradeable packets.",
                logic: [
                    {
                        title: "Packing Ratios",
                        explanation: "Every packet must contain a fixed number of loose items (e.g., 50 bags/packet). The system validates this during the transfer from Semi-Finished."
                    },
                    {
                        title: "Weight Verification",
                        explanation: "System calculates the expected weight of a packet based on the single item weight. Deviations can indicate production defects."
                    }
                ],
                components: [
                    {
                        name: "Packing Log Selector",
                        description: "Allows you to select which specific production batch you are currently packing into packets."
                    },
                    {
                        name: "Ratio Indicator",
                        description: "Displays the active 'Loose-to-Packet' rule for the selected product."
                    }
                ]
            }}
        />
    );
}
