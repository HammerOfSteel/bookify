import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveAudioUpload } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }

    const path = await saveAudioUpload(file, "uploads/audio", "mp3");

    return NextResponse.json({
      ok: true,
      path,
      originalName: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload audio.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
