import { supabase } from '../config/supabase';

async function listRawMaterials() {
    console.log('🔍 Listing Raw Materials...');

    // Get all factories first to map names
    const { data: factories } = await supabase.from('factories').select('id, name');
    const factoryMap: Record<string, string> = factories?.reduce((acc, f) => ({ ...acc, [f.id]: f.name }), {}) || {};

    const { data: materials, error } = await supabase
        .from('raw_materials')
        .select('*');

    if (error) {
        console.error('Error fetching RMs:', error);
        return;
    }

    console.log(`Found ${materials.length} raw materials:`);
    materials.forEach(rm => {
        const factoryName = factoryMap[rm.factory_id] || rm.factory_id;
        console.log(`- [${factoryName}] ${rm.name} (Stock: ${rm.stock_weight_kg}) ID: ${rm.id}`);
    });
}

listRawMaterials();
