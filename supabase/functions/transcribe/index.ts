import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!elevenLabsApiKey) {
    return errorResponse("Server is missing ELEVENLABS_API_KEY", 500);
  }

  const userId = request.headers.get("x-app-user-id")?.trim();
  if (!userId || userId.length < 12) {
    return errorResponse("Missing app user id", 400);
  }

  let incomingForm: FormData;
  try {
    incomingForm = await request.formData();
  } catch (error) {
    return errorResponse("Expected multipart form data", 400, String(error));
  }

  const file = incomingForm.get("file");
  if (!(file instanceof File)) {
    return errorResponse("Missing media file", 400);
  }
  if (file.size <= 0) {
    return errorResponse("Media file is empty", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse("Media file is too large", 413, { maxUploadBytes: MAX_UPLOAD_BYTES });
  }

  const outgoingForm = new FormData();
  outgoingForm.append("file", file, file.name || "media");
  outgoingForm.append("model_id", String(incomingForm.get("model_id") || "scribe_v2"));
  outgoingForm.append("language_code", String(incomingForm.get("language_code") || "en"));
  outgoingForm.append("timestamps_granularity", String(incomingForm.get("timestamps_granularity") || "word"));
  outgoingForm.append("tag_audio_events", String(incomingForm.get("tag_audio_events") || "false"));
  outgoingForm.append("diarize", String(incomingForm.get("diarize") || "false"));
  outgoingForm.append("no_verbatim", String(incomingForm.get("no_verbatim") || "false"));

  const keyterms = incomingForm.getAll("keyterms").map((value) => String(value).trim()).filter(Boolean);
  keyterms.slice(0, 100).forEach((term) => outgoingForm.append("keyterms", term));

  const response = await fetch(ELEVENLABS_STT_URL, {
    method: "POST",
    headers: {
      "xi-api-key": elevenLabsApiKey,
    },
    body: outgoingForm,
  });

  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    return jsonResponse({ error: "ElevenLabs transcription failed", detail: body }, response.status);
  }

  return jsonResponse(body);
});
