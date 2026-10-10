# Suiteframe: the drawn line

## Files and limits

- `suiteframe-page-shot.png`: six supplied screenshots assembled into a 2048 × 7811 reference, with device bars removed, repeated content trimmed, and the main line connected at the seams. The original raster stroke is preserved outside those edits.
- `suiteframe-line.svg`: one continuous, open, ordered centerline path. It follows the raster drawing and uses interpreted connections between screenshots. It has a uniform stroke; it does not reproduce the original raster grain.
- `suiteframe-line-coordinates.json`: the same path, reference points, screenshot origins, section point arrays, and the five connector endpoints.

This is an assembled reference, not a fresh capture of the live website. The top of the hero was absent from the uploads. The first two screenshot pairs have no common page landmarks, so their spacing was inferred by concatenation. Later pairs were aligned using repeated content. Overlapping hand-drawn strokes disagree, so the connections at those seams are interpretations. The screenshot width is not a verified CSS viewport width.

The final handwritten message remains in the PNG. Only the main line, ending in the downstroke of its first handwritten letter, is traced in the SVG. Animating the rest of the message requires separately tracing its strokes and ordering them; a raster screenshot does not encode pen order.

## Implementation brief for Cursor

Use the supplied SVG and coordinate data as the geometric reference for the existing site. Preserve the observed loops, bends, crossing order, and route through the gallery. First match the fully visible line against the page-shot at the same layout. Then implement scroll-driven drawing. Keep changes scoped to the line and the anchors it needs.

1. **Place the line in one page coordinate system.** Put an inline SVG in an absolutely positioned overlay inside the relevant `position: relative` page wrapper. Set `pointer-events: none`, `aria-hidden="true"`, and an explicit stacking order. The main path is decorative and should not affect layout or intercept links.

2. **Map geometry to the real content.** Measure stable anchors with `getBoundingClientRect()` and convert viewport coordinates to coordinates relative to the wrapper. Use the actual intro paragraph, sample video, gallery gutters, pricing heading, and quote form. Separate horizontal position from vertical layout: map local points against their associated content bounds, preserve each loop's local shape, and connect adjacent portions with matching endpoint positions and tangents. The JSON section point arrays are a starting partition; split further where a portion spans more than one layout region. Reassemble the mapped portions into one ordered path.

3. **Calibrate visibly.** Add a temporary debug overlay with anchor markers and show the whole path. Compare screenshots at the reference layout. If an anchor is wrong, adjust that anchor or a local transform, keeping the curve itself intact. The source route occasionally crosses a photo edge; preserve that if fidelity to the drawing is the requirement.

4. **Handle layout changes explicitly.** Recompute measured geometry after fonts and images have settled and when relevant anchor sizes change. A `ResizeObserver` can observe the wrapper and key anchors. Also handle viewport resizing and known layout state changes. The reference shows a three-column gallery. A layout where those images stack needs its own mapped route or separately calibrated mobile path; uniform scaling cannot preserve its relationship to those elements.

5. **Reveal along path length.** Use `getTotalLength()`, `stroke-dasharray`, and `stroke-dashoffset`. Scroll determines an ordered progress value. For this drawing, assign scroll intervals to logical sections and map each interval to that section's cumulative path-length range. Allocate enough scroll distance for the intro, video, and pricing loops while those loops are in view. Their curves travel upward as well as downward, so a simple vertical clipping mask cannot reproduce the drawing order. A single global scroll percentage is useful for a quick proof, but needs calibration to keep the visible drawing near the current section.

6. **Make scrolling deterministic.** Update through `requestAnimationFrame`, with a passive scroll listener. Decide whether upward scrolling erases the line; a reversible mapping is the usual starting point. If it should draw only once, retain the maximum revealed progress. Respect `prefers-reduced-motion` by showing the complete static line.

## Minimal reveal mechanism

This is the SVG reveal mechanism, not a complete layout or scroll-timeline implementation. Re-run `preparePath` whenever the path's `d` changes. The site-specific timeline supplies progress in the range 0–1.

```js
function preparePath(path) {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length} ${length}`;
  return (progress) => {
    const p = Math.min(1, Math.max(0, progress));
    path.style.strokeDashoffset = String(length * (1 - p));
    path.style.opacity = p === 0 ? '0' : '1';
  };
}

const path = document.querySelector('#suiteframe-scroll-line');
const reveal = preparePath(path);
reveal(0);    // Hidden.
reveal(0.5);  // Half its length drawn, following the actual curve.
reveal(1);    // Fully visible.
```

Keep `pathLength` unset when using measured user-unit lengths as above. Use numeric dash values rather than percentages.

## Verification before finishing

- Compare the fully visible line to the page-shot before tuning the animation.
- Inspect the crossings around the intro, video, and pricing loops for the intended traversal order.
- Confirm joins stay connected after resizing and after assets load.
- Check one wide layout and one genuinely different narrow layout.
- Check that the line is visible in the section being scrolled and the quote form remains clickable.

## Browser API references

- [SVGGeometryElement.getTotalLength](https://developer.mozilla.org/en-US/docs/Web/API/SVGGeometryElement/getTotalLength)
- [SVGGeometryElement.getPointAtLength](https://developer.mozilla.org/en-US/docs/Web/API/SVGGeometryElement/getPointAtLength)
- [SVG stroke-dashoffset](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-dashoffset)
- [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
