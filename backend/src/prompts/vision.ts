import { ANTI_SLOP_RULES } from "./anti-slop.js";

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
 *
 * Ported from the `page-audit` rule that a finding has to name what is visible
 * on screen. "Improve visual hierarchy" is not a finding; "the already-large
 * hero image pushes the CTA below the fold" is.
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

  return `You are auditing the mobile first screen of one site against its competitors. You are looking at screenshots, attached in exactly this order.

IMAGE ORDER:
${order}

${
  competitorCount === 0
    ? "No competitor screenshots are attached. Judge the target on its own against what a modern mobile first screen has to achieve."
    : `Image 1 is the target. The remaining ${competitorCount} image(s) are competitors.`
}

Every judgement must name what you can see: the element, roughly where it sits, its relative size, and the words on it. This is a finding: "the primary CTA 'Get a quote' sits in the top third at roughly 48px tall, but carries the same weight as the nav links". This is not: "improve visual hierarchy".

Assess:
- First screen. In two seconds, can a visitor tell what this business sells and what to do next. Say what they see first, second, then third.
- Calls to action. How many compete above the fold, and does one dominate the rest.
- Trust. Name every trust element visible: badge, review count, guarantee, client logo, phone number, address. If none are visible, say that.
- Mobile usability. Font size, tap target size, line length, density. Reference the specific elements.
- Gap. What a competitor shows in its first screen that this one does not.

Score 0-100. Above 80 reads as a site you would trust with a card number. 50 to 70 has the elements but buries them. Below 50, the visitor cannot tell what is being sold.

${ANTI_SLOP_RULES}

OUTPUT strict JSON:
{
  "score": <0-100 integer>,
  "findings": [
    { "severity": "critical"|"high"|"medium"|"low", "issue": "...", "detail": "...", "recommendation": "..." }
  ],
  "summary": "2-3 sentence summary naming the strongest and weakest element on screen"
}

Maximum 5 findings. "issue" is under 90 characters and names an element. "detail" describes what is visible. "recommendation" names the change.`;
}
