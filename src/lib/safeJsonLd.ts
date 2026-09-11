/**
 * Serialize a value for embedding inside a `<script type="application/
 * ld+json">` tag via dangerouslySetInnerHTML.
 *
 * Plain JSON.stringify() does not escape `<`, so a string field containing
 * `</script>` (or `<!--`) could prematurely close the script tag and let
 * its remaining content be parsed as HTML/JS. Escaping those characters
 * as unicode sequences keeps the JSON semantically identical (browsers
 * decode \u003c back to `<` before the JSON parser sees it) while making
 * it impossible for embedded data to break out of the script element.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
