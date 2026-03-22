import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";

const PROVIDER_URL = process.env.EXTERNAL_IMAGE_PROVIDER_URL;
const PROVIDER_TOKEN = process.env.EXTERNAL_IMAGE_PROVIDER_AUTH_TOKEN;

function isAllowedImageUrl(url: string): boolean {
  return (
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("/scene-art/") ||
    url.startsWith("/default-scene.svg")
  );
}

export async function POST(request: NextRequest) {
  const { prompt, sceneKey, promptHash } = await request.json();

  if (!PROVIDER_URL) {
    return NextResponse.json({
      imageUrl: sceneKey === "dock_office" ? "/scene-art/dock_office.jpg" : "/scene-art/generated-placeholder.jpg",
      provider: "placeholder",
    });
  }

  try {
    const response = await fetch(PROVIDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(PROVIDER_TOKEN ? { Authorization: `Bearer ${PROVIDER_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OPENAI ERROR:", errText);
      throw new Error(`Provider failed: ${response.status}`);
    }

    const json = await response.json();
    let imageUrl: string | null = null;
    const hash = promptHash ?? sceneKey;
    if (json?.data?.[0]?.b64_json) {
      const base64 = json.data[0].b64_json;
      const fileName = `${sceneKey}-${hash}.png`;
      const filePath = `public/scene-art/${fileName}`;
      await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
      imageUrl = `/scene-art/${fileName}`;
    }
    if (!imageUrl) {
      imageUrl =
        json?.data?.[0]?.url ??
        json?.url ??
        json?.image_url ??
        json?.output?.[0] ??
        json?.data?.[0]?.image_url ??
        null;
    }

    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      throw new Error("Invalid imageUrl returned by provider");
    }

    return NextResponse.json({
      imageUrl,
      provider: "remote",
    });
  } catch (error) {
    console.error("image-provider fallback", error);
    return NextResponse.json({
      imageUrl: sceneKey === "dock_office" ? "/scene-art/dock_office.jpg" : "/scene-art/generated-placeholder.jpg",
      provider: "fallback",
    });
  }
}
