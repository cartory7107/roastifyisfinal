/** One screenshot as it will be ordered in the multimodal request. */
export type VisionShot = {
  role: "target" | "competitor";
  url: string;
  title: string;
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Vision prompt (spec §8.9): compare the target's mobile screenshot against
 * the competitors' mobile screenshots. The prompt states the image order so
 * the model can match each image to its site.
 */
export function buildVisionPrompt(shots: VisionShot[]): string {
  const order = shots
    .map((shot, index) => {
      const name = hostnameOf(shot.url);
      const title = shot.title ? ` — "${shot.title}"` : "";
      return `${index + 1}. ${shot.role.toUpperCase()}: ${name}${title} (${shot.url})`;
    })
    .join("\n");

  const competitorCount = shots.filter((shot) => shot.role === "competitor").length;

  return `You are a UI/UX auditor with vision. Compare the target mobile screenshot against competitors' mobile screenshots.

IMAGE ORDER (the images are attached in exactly this order):
${order}

${
  competitorCount === 0
    ? "No competitor screenshots are attached — judge the target on its own against modern mobile best practice."
    : `The first image is the target; the remaining ${competitorCount} image(s) are competitors.`
}

Evaluate:
- Visual hierarchy (is primary CTA obvious in the first screen?)
- Trust signals (testimonials, badges, guarantees visible?)
- First impression / professionalism
- Mobile usability (font size, tap targets, clutter, readability)

OUTPUT strict JSON:
{
  "score": <0-100 integer>,
  "findings": [
    { "severity": "high"|"medium"|"low", "issue": "...", "detail": "...", "recommendation": "..." }
  ],
  "summary": "2-3 sentence summary"
}

Max 5 findings. Score should reflect visual quality vs competitors.`;
}
