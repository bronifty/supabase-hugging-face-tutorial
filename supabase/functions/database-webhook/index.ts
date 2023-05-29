import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HfInference } from "https://esm.sh/@huggingface/inference@2.3.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Database } from "./types.ts";

console.log("Hello from `hf-image-captioning` function!");

const hf = new HfInference(Deno.env.get("HUGGINGFACE_ACCESS_TOKEN"));

type storageObjectRecord = Database["storage"]["Tables"]["objects"]["Row"];
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: storageObjectRecord;
  schema: "public";
  old_record: null | storageObjectRecord;
}

serve(async (req) => {
  const payload: WebhookPayload = await req.json();
  const storageObjectRecord = payload.record;
  const supabaseAdminClient = createClient<Database>(
    // Supabase API URL - env var exported by default when deployed.
    Deno.env.get("SUPABASE_URL") ?? "",
    // Supabase API SERVICE ROLE KEY - env var exported by default when deployed.
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  // Construct image url from storage
  const { data, error } = await supabaseAdminClient.storage
    .from(storageObjectRecord.bucket_id!)
    .createSignedUrl(storageObjectRecord.path_tokens!.join("/"), 60);
  if (error) throw error;
  const { signedUrl } = data;
  console.log("in the serve function; signedUrl: ", signedUrl);

  // Run image captioning with Huggingface
  const imgDesc = await hf.imageToText({
    data: await (await fetch(signedUrl)).blob(),
    model: "nlpconnect/vit-gpt2-image-captioning",
  });
  console.log("in the serve function; imgDesc: ", imgDesc);

  // Store image caption in Database table
  await supabaseAdminClient
    .from("image_caption")
    .insert({ id: storageObjectRecord.id!, caption: imgDesc.generated_text })
    .throwOnError();

  return new Response("ok");
});

// To invoke:
// curl -i --location --request POST 'http://localhost:54321/functions/v1/database-webhook' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
//   --header 'Content-Type: application/json' \
//   --data '{"name":"Functions"}'

// Generate typesafe API from Database schema
// supabase gen types typescript --project-id=kfktzpdexagrkylcxfhj --schema=storage,public > supabase/functions/database-webhook/types.ts

// serve(async (req) => {
//   const payload: WebhookPayload = await req.json();
//   const storageObjectRecord = payload.record;
//   const supabaseAdminClient = createClient<Database>(
//     // Supabase API URL - env var exported by default when deployed.
//     Deno.env.get("SUPABASE_URL") ?? "",
//     // Supabase API SERVICE ROLE KEY - env var exported by default when deployed.
//     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
//   );

//   // Construct image url from storage
//   const { data, error } = await supabaseAdminClient.storage
//     .from(storageObjectRecord.bucket_id!)
//     .createSignedUrl(storageObjectRecord.path_tokens!.join("/"), 60);
//   if (error) throw error;
//   const { signedUrl } = data;

//   // Run image captioning with Huggingface
//   const imgDesc = await hf.imageToText({
//     data: await (await fetch(signedUrl)).blob(),
//     model: "nlpconnect/vit-gpt2-image-captioning",
//   });

//   // Store image caption in Database table
//   await supabaseAdminClient
//     .from("image_caption")
//     .insert({ id: storageObjectRecord.id!, caption: imgDesc.generated_text })
//     .throwOnError();

//   return new Response("ok");
// });
