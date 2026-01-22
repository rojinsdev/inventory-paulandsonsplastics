'use client';
import InventoryPageTemplate from '@/components/inventory/InventoryPageTemplate';

export default function FinishedGoodsPage() {
    return (
        <InventoryPageTemplate
            title="Finished Goods"
            type="finished"
            description="Completely bundled goods ready for sale"
            guide={{
                title: "Finished Goods",
                description: "Final bundles ready for dispatch. This is the only sellable state.",
                logic: [
                    {
                        title: "Final QC Lock",
                        explanation: "Items only reach this state after passing final quality checks. This value represents 'Available-to-Promise' (ATP) stock."
                    },
                    {
                        title: "FIFO Suggestions",
                        explanation: "The system suggests oldest bundles for dispatch first to ensure inventory freshness and rotation."
                    }
                ],
                components: [
                    {
                        name: "Bundle Table",
                        description: "Detailed view including Batch Number and 'Ready for Dispatch' status."
                    },
                    {
                        name: "Dispatch Workflow",
                        description: "Shortcut to initiate a delivery note for items that are physically available here."
                    }
                ]
            }}
        />
    );
}
