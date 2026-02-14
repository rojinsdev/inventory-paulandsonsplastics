import { InventoryService } from '../src/modules/inventory/inventory.service';
import { supabase } from '../src/config/supabase';

async function testUnpack() {
    const inventoryService = new InventoryService();
    const productId = '838a7520-1d9f-41b4-a422-2b3c0a851b08'; // SuperBottle 1L

    console.log('--- Starting Unpack Test (Finished -> Packed) ---');
    try {
        await inventoryService.unpack(
            productId,
            1,
            'finished',
            'packed'
        );
        console.log('✅ Unpack test successful');
    } catch (error: any) {
        console.error('❌ Unpack test failed:');
        console.error(error);
    }
}

testUnpack();
