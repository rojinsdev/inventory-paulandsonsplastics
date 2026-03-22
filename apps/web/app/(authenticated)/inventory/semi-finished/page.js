'use client';
import InventoryPageTemplate from '@/components/inventory/InventoryPageTemplate';

export default function SemiFinishedPage() {
    return (
        <InventoryPageTemplate
            title="Semi-Finished Goods"
            type="semi_finished"
            description="Production items awaiting packing (Loose)"
            guide={{
                title: "Semi-Finished Goods",
                description: "Loose items produced by extruders/printers but not yet packed in tubs.",
                logic: [
                    {
                        title: "WIP Calculation (Weight)",
                        explanation: "Values here represent raw production output in KGs. This is the 'source' stock used for the Packing stage."
                    },
                    {
                        title: "Batch Aging",
                        explanation: "Items older than 48h are flagged. This prevents material degradation and ensures fresh stock rotates first."
                    }
                ],
                components: [
                    {
                        name: "Inventory Table",
                        description: "List of all loose items grouped by SKU. Shows 'Available vs Scrapped' if logs exist."
                    },
                    {
                        name: "Refresh Command",
                        description: "Forces a sync with the production servers to fetch the latest extrusion logs."
                    }
                ]
            }}
        />
    );
}
