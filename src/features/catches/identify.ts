// "Identify fish": sends one compressed catch photo to the `identify` Edge Function (Fishial.ai). Only on an
// explicit tap; the server caches per photo and caps credits (free plan: 100 a month). The user always confirms.
import { File } from "expo-file-system";

import { supabase } from "@/lib/supabase";

export type IdCandidate = {
  species_id: string;
  common_name: string;
  scientific_name: string;
  certainty: number;
};
export type IdResult = {
  candidates: IdCandidate[];
  /** Fish Fishial named that aren't in our species list (no fallback matching: shown as names only). */
  unmatched: { name: string; certainty: number }[];
  fish_found: number;
  credits_left: number | null;
};

const URL_ = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/identify`;

/** `uri` must be a compressed JPEG on the device (see compressPhoto). Throws an Error with a user-facing message. */
export async function identifyFish(uri: string): Promise<IdResult> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in to identify fish.");
  const res = await new File(uri)
    .upload(URL_, {
      httpMethod: "POST",
      uploadType: 0, // binary body
      mimeType: "image/jpeg",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_KEY!,
        "content-type": "image/jpeg",
      },
    })
    .catch(() => {
      throw new Error(
        "Couldn’t reach fish ID. Check your signal and try again.",
      );
    });
  let body: Partial<IdResult> & { error?: string } = {};
  try {
    body = JSON.parse(res.body);
  } catch {
    // non-JSON (gateway error)
  }
  if (res.status < 200 || res.status >= 300)
    throw new Error(
      body.error ?? "Fish ID is unavailable right now. Try again later.",
    );
  return {
    candidates: body.candidates ?? [],
    unmatched: body.unmatched ?? [],
    fish_found: body.fish_found ?? 0,
    credits_left: body.credits_left ?? null,
  };
}
