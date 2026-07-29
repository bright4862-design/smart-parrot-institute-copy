# Smart Parrot Hero Color Palette v1.0

Status: Approved production palette

This palette is the source of truth for the hero, Pico, the signature suitcase, character UI portraits, and related marketing artwork. Values are aligned with the current mascot prototype and the approved character direction.

## Core identity colors

| Token | Hex | Primary use |
|---|---:|---|
| Smart Parrot Purple | `#806CFF` | Hoodie highlights, brand-led character accents |
| Smart Parrot Purple Deep | `#5C48E8` | Hoodie shadows and folds |
| Suitcase Purple | `#7B5CFF` | Main suitcase shell |
| Suitcase Purple Deep | `#4B2FC0` | Suitcase shadow, depth, edge contrast |
| Navy Travel Blue | `#2D466F` | Jacket highlights |
| Navy Travel Blue Deep | `#172842` | Jacket shadows and structural panels |

## Supporting wardrobe colors

| Token | Hex | Primary use |
|---|---:|---|
| Denim Blue | `#31547B` | Jeans base |
| Denim Blue Deep | `#2B4C73` | Jeans shadow and alternate leg panels |
| Soft White | `#F7F7FB` | Trainers and clean fabric accents |
| Trainer Grey | `#B9BEC8` | Soles, seams, and neutral footwear details |
| Warm Leather Brown | `#7B4B2F` | Backpack body and leather straps |
| Leather Highlight | `#9A623D` | Backpack edge light and worn leather detail |
| Soft Grey Undershirt | `#D8D9E0` | Undershirt and quiet neutral fabric areas |

## Pico companion colors

| Token | Hex | Primary use |
|---|---:|---|
| Pico Green | `#51BF69` | Main body feathers |
| Pico Green Light | `#6FD27F` | Head, chest, and lit feather planes |
| Pico Green Deep | `#2F9A56` | Wings, tail, and shadow feathers |
| Pico Beak Gold | `#F1B83F` | Beak and small warm accent details |
| Pico Claw Brown | `#9E6D32` | Feet and claws |

## Neutral and hardware colors

| Token | Hex | Primary use |
|---|---:|---|
| Ink Navy | `#182039` | Eyes, deep outlines, UI silhouette support |
| Hardware Charcoal | `#272B36` | Suitcase handle, wheels, zips, buckles |
| Soft Lavender Highlight | `#A98FFF` | Suitcase rim highlight and reflective trim |
| Pale Lavender Reflection | `#D8CEFF` | Suitcase reflections and magical brand highlights |
| Gold Detail | `#F1B83F` | Zipper pulls and very limited premium accents |

## Usage hierarchy

1. Purple must remain the strongest identity color on the hero.
2. Navy should frame and support the purple rather than compete with it.
3. Pico green must remain distinct from the hero wardrobe and environment foliage.
4. Brown leather should add warmth without becoming orange or overly saturated.
5. Gold is an accent only; use it sparingly for tiny details and reward moments.
6. Soft white and grey should balance the palette and prevent the silhouette from becoming too dark.

## Material guidance

- Hoodie: soft woven cotton, medium roughness, low specular response.
- Jacket: technical travel fabric, slightly lower roughness than the hoodie, subtle panel variation.
- Jeans: matte denim with restrained directional weave.
- Backpack: worn-but-cared-for leather, medium roughness, gentle edge variation.
- Suitcase: hard-shell polymer with controlled gloss and soft lavender reflections.
- Pico feathers: stylized soft sheen; avoid plastic-like highlights.
- Gold details: warm metallic response, used only on small hardware.

## Accessibility and readability rules

- Preserve clear value separation between the purple hoodie and navy jacket.
- Do not place the hero against backgrounds where both purple and navy disappear simultaneously.
- Pico must remain readable at mobile portrait scale; preserve contrast between light and deep greens.
- Avoid using red or green alone to communicate gameplay states around Pico.
- Maintain a strong silhouette before adding texture detail.

## Production rules

- Use these hex values for concept art, UI previews, and web prototypes.
- Convert colors into the correct linear workflow inside Blender and the game renderer.
- Keep texture variation subtle; identity colors must remain recognizable under warm, cool, indoor, and outdoor lighting.
- Any palette change requires an explicit version update to this document.