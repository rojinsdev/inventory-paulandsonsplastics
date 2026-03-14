alter table "public"."caps" add column "raw_material_id" uuid;

alter table "public"."caps" add constraint "caps_raw_material_id_fkey" foreign key ("raw_material_id") references "public"."raw_materials"("id");
