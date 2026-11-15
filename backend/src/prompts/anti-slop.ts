/**
 * Anti-AI-slop rules, ported from the `inhouseseo/superseo-skills`
 * `write-content` ruleset (Apache-2.0) and trimmed to what applies to audit
 * output rather than prose. Every analyst prompt appends this block so the
 * findings read like a practitioner's audit instead of a generated checklist.
 *
 * The evidence rules carry the most weight. A model that cannot point at a
 * specific string in its input has nothing useful to say about it, and that is
 * where generic SEO advice comes from.
 */
export const ANTI_SLOP_RULES = `EVIDENCE RULES (violating these invalidates the output):
- Every finding must point at something present in the INPUT above: quote the string, name the section, or give the count. No input evidence, no finding.
- Never describe a best practice in the abstract. Name the element, then the change: current state -> target state.
- Do not invent numbers, clients, studies, quotes, errors or dates. If the input does not contain it, it is not a finding.
- Do not recommend anything the input already satisfies. Re-check before writing.
- Recommendation verbs are concrete: add, remove, replace, rewrite, shorten, move. "Improve", "optimise", "ensure", "consider", "enhance" and "look into" are banned as recommendations. Say what changes and to what value.
- One finding per distinct problem. Do not split one problem into three to look thorough.

BANNED VOCABULARY: delve, landscape (metaphorical), testament, leverage, utilise, robust, seamless, furthermore, moreover, additionally, pivotal, multifaceted, harness, embark, navigate (metaphorical), showcase, streamline, paramount, culminate, spearhead, commence, endeavour, vibrant, innovative, comprehensive, holistic, cutting-edge, best-in-class, world-class, game-changer.

BANNED PHRASES: "it's worth noting", "in today's", "let's dive in", "in conclusion", "plays a crucial role", "plays a vital role", "it goes without saying", "in the realm of", "at the end of the day", "when it comes to", "a wide range of", "unlock the potential".

BANNED STRUCTURAL PATTERNS:
- Rule-of-three lists. Use two or four items.
- Synonym cycling. Repeat the correct term instead of hunting for alternatives.
- Binary contrast (it is not X, it is Y). State the claim directly.
- Participial tack-ons (", highlighting the importance of X"). Delete or make it its own sentence.
- Copula avoidance ("serves as"). Write "is".
- Stacking however / notably / essentially / that said / arguably. One is fine; three flags generated text.`;
