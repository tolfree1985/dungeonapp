import { NextRequest, NextResponse } from "next/server";
import { ensureSceneArtFile } from "@/lib/scene-art/fileSystem";
import { type SceneArtProviderResponse } from "@/lib/scene-art/providerResponse";
import { getStaticSceneArtBase64 } from "@/lib/scene-art/staticSceneArtProvider";

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
  const body = await request.json();
  const provider = body.provider ?? "remote";
  if (provider !== "remote") {
    throw new Error(`Unsupported image provider: ${provider}`);
  }

  const { prompt, sceneKey, promptHash } = body;

  console.log("scene.art.image_provider.route.start", {
    provider,
    sceneKey,
    promptHash,
  });

  if (!sceneKey || !promptHash) {
    return NextResponse.json(
      { error: "Missing sceneKey or promptHash" },
      { status: 400 }
    );
  }

  const forcedStatic = process.env.SCENE_ART_TEST_SCENE_KEY === sceneKey;
  const logReturn = (imageUrl: string | null) => {
    console.log("scene.art.image_provider.route.return", {
      provider,
      sceneKey,
      promptHash,
      hasImageUrl: Boolean(imageUrl),
    });
  };

  if (forcedStatic) {
    const staticArt = await getStaticSceneArtBase64(sceneKey);
    if (staticArt) {
      console.log("SCENE_ART_STATIC_PROVIDER_RESULT", {
        sceneKey,
        found: !!staticArt,
        mimeType: staticArt.mimeType ?? null,
        hasBase64: !!staticArt.base64,
        base64Length: staticArt.base64?.length ?? 0,
      });
    logReturn(`/scene-art/${sceneKey}-static.png`);
    return NextResponse.json<SceneArtProviderResponse>({
      ok: true,
      provider: "static-fallback",
      base64: staticArt.base64,
      imageBase64: staticArt.base64,
      mimeType: staticArt.mimeType,
      imageUrl: `/scene-art/${sceneKey}-static.png`,
    });
  }
    return NextResponse.json<SceneArtProviderResponse>(
      {
        ok: false,
        provider: "placeholder",
        error: "No static fixture found for test scene",
        retryable: false,
      },
      { status: 422 }
    );
  }

  const remoteProviderUrl = PROVIDER_URL ?? "https://api.openai.com/v1/images/generations";
  const authToken = PROVIDER_TOKEN ?? process.env.OPENAI_API_KEY;
  if (!authToken) {
    const fallbackUrl = process.env.IMAGE_PROVIDER_URL ?? "/default-scene.svg";
    logReturn(fallbackUrl);
    return NextResponse.json<SceneArtProviderResponse>({
      ok: true,
      provider: "dev-stub",
      imageUrl: "/default-scene.svg",
      mimeType: "image/svg+xml",
    });
  }

  try {
    const response = await fetch(remoteProviderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        prompt,
        size: "1024x1024",
        model: "gpt-image-1",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OPENAI ERROR:", errText);
      throw new Error(`Provider failed: ${response.status}`);
    }

    const json = await response.json();
    const b64 = json?.data?.[0]?.b64_json;
    const expectedImageUrl = `/scene-art/${sceneKey}-${promptHash}.png`;
    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      await ensureSceneArtFile(expectedImageUrl, buffer);
      logReturn(expectedImageUrl);
      return NextResponse.json<SceneArtProviderResponse>({
        ok: true,
        provider: "remote",
        imageUrl: expectedImageUrl,
        imageBase64: b64,
        mimeType: "image/png",
      });
    }

    const directUrl =
      json?.data?.[0]?.url ||
      json?.url ||
      json?.image_url ||
      json?.output?.[0] ||
      json?.data?.[0]?.image_url ||
      null;

    if (!directUrl || !isAllowedImageUrl(directUrl)) {
      throw new Error("Invalid imageUrl returned by provider");
    }
    logReturn(directUrl);

    return NextResponse.json<SceneArtProviderResponse>({
      ok: true,
      provider: "remote",
      imageUrl: directUrl,
      mimeType: "image/png",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("scene.art.image_provider.route.error", {
      provider,
      sceneKey,
      promptHash,
      error: message,
    });
    return NextResponse.json<SceneArtProviderResponse>(
      {
        ok: false,
        provider: "fallback",
        error: message,
        retryable: true,
      },
      { status: 500 }
    );
  }
}
