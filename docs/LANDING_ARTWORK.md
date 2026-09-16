# Landing-page artwork

### Japanese social share card

Output: `web/public/social/ehon-studio.jpg` (1200 × 630 JPEG). Generated with the built-in image_gen tool, using `web/public/illustrations/storybook-world.webp` as the edit target and art reference.

Use case: compositing.
Asset type: Open Graph social share card for the Japanese picture-book studio ぺたぺた STUDIO.
Input image 1 is the edit target and art reference: the original hand-painted open-book world used in the landing page.
Create a landscape social card with exact 40:21 aspect ratio (1200 by 630 pixels, or a larger proportional equivalent). Keep the existing gouache illustration, its warm ivory paper, little painter at left, reading fox and child at right, wide open book across the bottom, rolling hills and foliage. Preserve the characters and the picture-book aesthetic. Recompose the same scene only enough to leave generous ivory negative space in the top center for typesetting. Keep the full book visible. The illustration should fill the bottom 60% and frame the far left and right.
Add very clear, elegant Japanese book-cover typography, centered in the top half, comfortably inside a 70px safe area.
Small top wordmark, exact text: "ぺたぺた STUDIO"
Then a large refined Japanese Mincho serif heading on two lines, exact text:
"あなただけの物語を、"
"一冊の絵本に。"
First line deep forest-gray #353d32, second line warm terracotta #a54f36. The heading must be dominant, elegantly spaced and perfectly legible at thumbnail size. No text overlaps with the illustrated faces or book. No extra text, no URL, no buttons, no border, no interface, no watermarks. Refined quiet editorial finish, lovingly handmade art, completely faithful to the existing landing illustration and color palette.


Original illustrations generated with the built-in image_gen tool for the pre-login landing page. The selected outputs are stored in `web/public/illustrations/` as optimized WebP images. No third-party image requests are needed at runtime.

- `storybook-world.webp` (1600 × 800) and `storybook-world-small.webp` (800 × 400): responsive hero.
- `little-adventure.webp`, `moon-sailing.webp`, `together.webp` (720 × 720): story inspiration.

## Final prompts

### Storybook world

Use case: illustration-story
Asset type: original panoramic hero illustration for Peta Peta, an ehon picture-book-making atelier landing page, for artists around the world.
Primary request: A heartfelt, sophisticated hand-painted picture-book world growing out of a giant open book. Landscape aspect ratio approximately 2:1, 1536 x 768 or larger. This is ONLY the illustration asset, no website mockup.
Scene: A broad open cream storybook rests at the center bottom, its pages turning into gentle rolling green hills and a winding pale path. A tiny artist wearing a warm coral smock with dark bobbed hair sits on the left page painting a small golden sun on an easel. On the right page a friendly rust-colored fox in a blue scarf reads a little book beside a child. Delicate large botanical trees frame the far left and right, with sage and olive foliage, ochre leaves, tiny coral flowers. A little white rabbit, a small blue bird, and a few whimsical paper birds in the sky. A tiny cozy cottage on a distant hill. Sparse, carefully composed objects, lots of airy space in the upper center. Tender and imaginative, sophisticated enough for an artist's portfolio.
Style/medium: traditional Japanese and European picture-book editorial illustration, opaque gouache and softly grainy colored pencil on warm ivory paper, visible natural dry-brush marks, charming irregular hand-drawn contours, simplified shapes, no black outlines, flat layered perspective.
Color palette: warm pale ivory #fbf7ee backdrop, subdued forest and sage greens, moss, dusty blue, terracotta red and warm ochre. Richly painted subjects against light paper.
Composition/framing: panoramic illustration; all subjects contained within the image with generous pale ivory margin on all edges, especially top; foliage flanks both sides, open book and characters in lower central two-thirds. Painted ground softly breaks into flecks and paper so it blends into the page. Do not crop trees, book, or characters.
Mood: a quiet invitation to create, handmade, tender, wondrous, beautifully art-directed, playful without being babyish.
Text: none.
Avoid: text, typography, words, logos, watermarks, interface elements, screenshots, photorealism, 3D, digital gradients, plastic textures, strong shadows, neon colors, generic corporate vector art.

### moon

Use case: illustration-story. Asset type: square editorial illustration for an ehon picture-book studio landing page's inspiration gallery. Create an original charming, sophisticated picture-book artwork with traditional gouache and colored pencil on textured paper, visible dry brush grain, simplified charming hand-drawn forms, flat layered perspective, editorial quality, tender and quietly magical, not generic vector art. Square 1:1 composition, art covers whole image with no border, no text or words or letters or typography, no watermarks, no UI, no photorealism, no 3D. Scene: A small honey-colored bear in a tiny terracotta wooden sailboat with a cream sail floats through a midnight blue sky as if it were an ocean. The bear has a tiny red scarf and looks up at an enormous pale butter-yellow crescent moon. Scattered subtle golden stars and delicate wisps of dusty blue cloud; a little fish-shaped constellation. Use a rich dark petrol navy background, ochre, warm cream, touches of coral. The boat in the lower third and big moon in upper right, evocative open space, dreamy night atmosphere. Full-bleed painterly illustration.

### adventure

Use case: illustration-story. Asset type: square editorial illustration for an ehon picture-book studio landing page's inspiration gallery. Create an original charming, sophisticated picture-book artwork with traditional gouache and colored pencil on textured paper, visible dry brush grain, simplified charming hand-drawn forms, flat layered perspective, editorial quality, tender and quietly magical, not generic vector art. Square 1:1 composition, art covers whole image with no border, no text or words or letters or typography, no watermarks, no UI, no photorealism, no 3D. Scene: A tiny orange fox wearing a dusty blue scarf and carrying a little mustard satchel wanders along a cream winding trail through a tall flourishing meadow. Exaggerated giant wildflowers like cosmos and daisies, pale peach and cream blooms, golden leaves, swaying slender green stalks rise high above the fox. A little blue butterfly is its companion. Fox lower-middle of the composition, warm pale peach background in the upper third, softly painted ground, generous open sky. Palette warm apricot, terracotta, golden ochre, muted sage and forest green. Joyful small adventure, a world worth noticing. Full-bleed painterly illustration.

### together

Use case: illustration-story. Asset type: square editorial illustration for an ehon picture-book studio landing page's inspiration gallery. Create an original charming, sophisticated picture-book artwork with traditional gouache and colored pencil on textured paper, visible dry brush grain, simplified charming hand-drawn forms, flat layered perspective, editorial quality, tender and quietly magical, not generic vector art. Square 1:1 composition, art covers whole image with no border, no text or words or letters or typography, no watermarks, no UI, no photorealism, no 3D. Scene: Two soft white rabbits, one large and one very small, sit closely together with backs mostly toward us on a mossy knoll beneath an oversized beautiful flowering plant with nodding coral-red and pale cream cosmos flowers. Large rabbit's paw tenderly around the little rabbit. Small yellow sun near top left, one ochre butterfly, tiny white daisies in the grass. Quiet tender moment of belonging, not sentimental kitsch. Palette muted sage green background, creamy white rabbits, forest green stems, warm terracotta red flowers, golden ochre accents. Expressive delicate pencil details, uncluttered composition. Full-bleed painterly illustration.
