# Esempio di prompt fotografico v4.3.0

Piano offline di cinque brief, seed 53. Nessuna generazione o spesa.
La ricetta è un target di resa, non metadati di una fotografia reale.

- Cella intenzionale: `outrage:people_everyday_life` (da verificare sul risultato).
- Profilo: `phone_ultrawide_context`.
- Formato API: `size: auto`; qualità `medium`; presentazione `whole_frame`.
- SHA-256 del brief congelato: `1ef76abe7147034c7b65270856d10a8f7c6066ad8f915b5292e1b10db2acbd19`.

Il prompt completo, pronto per il ramo SLOP:

```text
Make a single photograph of the following scene: A view of a public waiting room with empty chairs, with the surrounding setting visible. Preserve the activity, objects and spatial relationships described here. A separate caption can provide context. Follow the frozen photographic capture brief and camera composition below. Choose landscape, portrait or square proportions to suit the scene. Camera composition: Use a slightly elevated, oblique viewpoint with a gentle clockwise camera roll of about six degrees. Compose the scene with that angle during generation, with coherent perspective throughout.
Photographic capture brief:
Make a single photograph of the specified scene, with an ordinary documentary capture rather than a promotional treatment. Retain the described activity, objects, weather and time of day, and follow the separate camera-composition instruction. Use available light motivated by the scene: sky, windows or existing practical lamps; preserve plausible falloff, mixed light and local shadows. Do not add studio lights unless the scene explicitly requires them. Treat the exposure below as a starting target: adjust sensitivity within its range for the available light, and only depart from shutter/aperture when necessary for a plausible exposure or subject motion. Keep optical perspective, focus and depth of field consistent with the device, lens and distance. Do not apply a default cinematic grade, beauty retouching, excessive HDR or uniformly blurred backgrounds. Do not add grain, blur, damage or JPEG blocks as a compulsory authenticity effect. Choose portrait, landscape or square proportions to suit the scene. Device and exposure instructions describe the intended appearance; do not put labels, camera branding, settings or watermarks in the picture.
Capture device: a smartphone ultrawide rear camera; sensor: 1/2.5-inch type digital. Lens angle of view: 16 mm equivalent on 35 mm full frame; this is an equivalent focal length, not a claim about sensor size. Exposure target: f/2.2, 1/125 s, Auto ISO 50-1600. Preferred working distance: 1-4 m, adjusted to retain the scene and coherent framing rather than moving its objects. Focus and depth: broad depth of field across the nearby setting, plausible wide-angle perspective and mild edge stretching without a fisheye effect. File rendering: a standard corrected phone JPEG with moderate contrast, slightly less edge detail than the image center and restrained sharpening; preserve the actual light rather than imposing a vivid travel-photo grade.
```

Il ramo REAL riceve la descrizione e le query originali, senza la ricetta.
La scelta della fotocamera precede la ricerca; nessuna fotografia REAL entra nel prompt.
