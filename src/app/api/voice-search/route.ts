import { hearVoiceNote } from "@/lib/ai/voice";
import { getSession } from "@/lib/auth";
import { WEB_CHAT } from "@/lib/channels/web/protocol";
import { isRateLimited } from "@/lib/rate-limit";

export const maxDuration = 60;

// The search bar's microphone: what did they ask? A question comes back as a search to run; a
// recipe read aloud comes back as "recipe", and the page hands it to the chat to save.

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (await isRateLimited(`voice-search:${session.userId}`, 60, 60 * 60)) {
    return Response.json({ error: "Too many searches" }, { status: 429 });
  }
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || !audio.type.startsWith("audio/") || audio.size === 0 || audio.size > WEB_CHAT.maxUploadBytes) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const heard = await hearVoiceNote({ data: new Uint8Array(await audio.arrayBuffer()), mediaType: audio.type });
    return Response.json(heard);
  } catch (err) {
    console.error("voice search failed", err);
    return Response.json({ error: "Couldn't hear it" }, { status: 502 });
  }
}
